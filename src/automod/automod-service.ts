import { createHash } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { withTransaction } from '../database/transaction.js';
import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import { AutomodConfigurationError, AutomodIdempotencyConflictError } from './errors.js';
import { AUTOMOD_RULE_KEYS, DEFAULT_AUTOMOD_RULES } from './types.js';
import type {
  AutomodConfigurationResult,
  AutomodEscalation,
  AutomodGuildConfig,
  AutomodPort,
  AutomodRuleConfig,
  AutomodRuleKey,
} from './types.js';

interface RuleRow extends QueryResultRow {
  readonly rule_key: AutomodRuleKey;
  readonly enabled: boolean;
  readonly threshold: number;
  readonly window_seconds: number;
  readonly escalation: AutomodEscalation;
}

interface AllowlistRow extends QueryResultRow {
  readonly discord_user_id: string;
}

interface RequestRow extends QueryResultRow {
  readonly request_fingerprint: string;
}

interface CachedConfig {
  readonly expiresAt: number;
  readonly config: AutomodGuildConfig;
}

type ConfigOperation = 'SET_RULE' | 'ALLOW_USER' | 'UNALLOW_USER';

const CONFIG_CACHE_TTL_MS = 15_000;
const INTERACTION_ID_PATTERN = /^\d{17,20}$/;

export class AutomodService implements AutomodPort {
  private readonly configCache = new Map<string, CachedConfig>();

  public constructor(private readonly pool: Pool) {}

  public async getConfig(guildId: string): Promise<AutomodGuildConfig> {
    assertDiscordSnowflake(guildId, 'guildId');
    const cached = this.configCache.get(guildId);
    if (cached !== undefined && cached.expiresAt > Date.now()) return cached.config;

    const config = await loadConfig(this.pool, guildId);
    this.cacheConfig(config);
    return config;
  }

  public async setRule(
    interactionId: string,
    guildId: string,
    actorUserId: string,
    rule: AutomodRuleKey,
    config: AutomodRuleConfig,
  ): Promise<AutomodConfigurationResult> {
    assertRequestIdentity(interactionId, guildId, actorUserId);
    assertRule(rule, config);
    const requestPayload = [rule, config];
    const fingerprint = fingerprintRequest('SET_RULE', guildId, actorUserId, requestPayload);
    const result = await this.mutateConfig(
      interactionId,
      guildId,
      actorUserId,
      'SET_RULE',
      fingerprint,
      requestPayload,
      async (client) => {
        await client.query(
          `INSERT INTO automod_guild_rule_config (
             guild_id, rule_key, enabled, threshold, window_seconds, escalation, updated_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (guild_id, rule_key) DO UPDATE SET
             enabled = EXCLUDED.enabled,
             threshold = EXCLUDED.threshold,
             window_seconds = EXCLUDED.window_seconds,
             escalation = EXCLUDED.escalation,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()`,
          [
            guildId,
            rule,
            config.enabled,
            config.threshold,
            config.windowSeconds,
            config.escalation,
            actorUserId,
          ],
        );
      },
    );
    this.invalidateConfig(guildId);
    return result;
  }

  public async setAllowlisted(
    interactionId: string,
    guildId: string,
    actorUserId: string,
    userId: string,
    allowlisted: boolean,
  ): Promise<AutomodConfigurationResult> {
    assertRequestIdentity(interactionId, guildId, actorUserId);
    assertDiscordSnowflake(userId, 'userId');
    const operation: ConfigOperation = allowlisted ? 'ALLOW_USER' : 'UNALLOW_USER';
    const requestPayload = [userId];
    const fingerprint = fingerprintRequest(operation, guildId, actorUserId, requestPayload);
    const result = await this.mutateConfig(
      interactionId,
      guildId,
      actorUserId,
      operation,
      fingerprint,
      requestPayload,
      async (client) => {
        if (allowlisted) {
          await client.query(
            `INSERT INTO discord_users (discord_user_id)
             VALUES ($1)
             ON CONFLICT (discord_user_id) DO NOTHING`,
            [userId],
          );
          await client.query(
            `INSERT INTO automod_guild_allowlist (guild_id, discord_user_id, added_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (guild_id, discord_user_id) DO NOTHING`,
            [guildId, userId, actorUserId],
          );
        } else {
          await client.query(
            `DELETE FROM automod_guild_allowlist
             WHERE guild_id = $1 AND discord_user_id = $2`,
            [guildId, userId],
          );
        }
      },
    );
    this.invalidateConfig(guildId);
    return result;
  }

  private async mutateConfig(
    interactionId: string,
    guildId: string,
    actorUserId: string,
    operation: ConfigOperation,
    fingerprint: string,
    requestPayload: readonly unknown[],
    change: (client: PoolClient) => Promise<void>,
  ): Promise<AutomodConfigurationResult> {
    const serializedPayload = JSON.stringify(requestPayload);
    if (serializedPayload === undefined) {
      throw new TypeError('AutoMod configuration request payload must be JSON serializable.');
    }
    const result = await withTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO discord_users (discord_user_id)
         VALUES ($1)
         ON CONFLICT (discord_user_id) DO NOTHING`,
        [actorUserId],
      );
      const inserted = await client.query(
        `INSERT INTO automod_config_requests (
           interaction_id, guild_id, actor_user_id, operation, request_fingerprint, request_payload
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (interaction_id) DO NOTHING
         RETURNING interaction_id`,
        [interactionId, guildId, actorUserId, operation, fingerprint, serializedPayload],
      );

      if (inserted.rowCount !== 1) {
        const existing = await client.query<RequestRow>(
          `SELECT request_fingerprint
           FROM automod_config_requests
           WHERE interaction_id = $1`,
          [interactionId],
        );
        if (existing.rows[0]?.request_fingerprint !== fingerprint) {
          throw new AutomodIdempotencyConflictError();
        }
        return { config: await loadConfig(client, guildId), replayed: true };
      }

      await change(client);
      return { config: await loadConfig(client, guildId), replayed: false };
    });
    return result;
  }

  private cacheConfig(config: AutomodGuildConfig): void {
    if (this.configCache.size > 10_000) {
      const oldestGuild = this.configCache.keys().next().value;
      if (oldestGuild !== undefined) this.configCache.delete(oldestGuild);
    }
    this.configCache.set(config.guildId, {
      expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
      config,
    });
  }

  private invalidateConfig(guildId: string): void {
    this.configCache.delete(guildId);
  }
}

async function loadConfig(
  queryable: Pick<Pool, 'query'> | PoolClient,
  guildId: string,
): Promise<AutomodGuildConfig> {
  const [rules, allowlist] = await Promise.all([
    queryable.query<RuleRow>(
      `SELECT rule_key, enabled, threshold, window_seconds, escalation
       FROM automod_guild_rule_config
       WHERE guild_id = $1`,
      [guildId],
    ),
    queryable.query<AllowlistRow>(
      `SELECT discord_user_id
       FROM automod_guild_allowlist
       WHERE guild_id = $1
       ORDER BY discord_user_id`,
      [guildId],
    ),
  ]);

  const mappedRules: Record<AutomodRuleKey, AutomodRuleConfig> = { ...DEFAULT_AUTOMOD_RULES };
  for (const row of rules.rows) {
    mappedRules[row.rule_key] = {
      enabled: row.enabled,
      threshold: row.threshold,
      windowSeconds: row.window_seconds,
      escalation: row.escalation,
    };
  }

  return {
    guildId,
    rules: mappedRules,
    allowlistedUserIds: allowlist.rows.map((row) => row.discord_user_id),
  };
}

function assertRequestIdentity(interactionId: string, guildId: string, actorUserId: string): void {
  if (!INTERACTION_ID_PATTERN.test(interactionId)) {
    throw new AutomodConfigurationError(
      'AutoMod interaction ID is malformed.',
      'This configuration request could not be validated. Try again.',
    );
  }
  assertDiscordSnowflake(guildId, 'guildId');
  assertDiscordSnowflake(actorUserId, 'actorUserId');
}

function assertRule(rule: AutomodRuleKey, config: AutomodRuleConfig): void {
  if (!(AUTOMOD_RULE_KEYS as readonly string[]).includes(rule)) {
    throw new AutomodConfigurationError('Unknown AutoMod rule.', 'Choose a valid AutoMod rule.');
  }
  if (typeof config.enabled !== 'boolean') {
    throw new AutomodConfigurationError('Rule enabled flag is invalid.', 'Choose on or off.');
  }
  if (!Number.isSafeInteger(config.threshold) || config.threshold < 1 || config.threshold > 100) {
    throw new AutomodConfigurationError(
      'Rule threshold is outside the allowed range.',
      'Threshold must be a whole number from 1 to 100.',
    );
  }
  if (
    !Number.isSafeInteger(config.windowSeconds) ||
    config.windowSeconds < 1 ||
    config.windowSeconds > 3600
  ) {
    throw new AutomodConfigurationError(
      'Rule window is outside the allowed range.',
      'The detection window must be from 1 to 3600 seconds.',
    );
  }
  if (config.escalation !== 'OBSERVE' && config.escalation !== 'CASE') {
    throw new AutomodConfigurationError(
      'Rule escalation value is invalid.',
      'Choose OBSERVE or CASE.',
    );
  }
}

function fingerprintRequest(
  operation: ConfigOperation,
  guildId: string,
  actorUserId: string,
  values: readonly unknown[],
): string {
  return createHash('sha256')
    .update(JSON.stringify([operation, guildId, actorUserId, ...values]))
    .digest('hex');
}
