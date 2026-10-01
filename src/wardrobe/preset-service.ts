import { createHash } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { withTransaction } from '../database/transaction.js';
import { IdempotencyConflictError } from '../economy/errors.js';
import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import {
  WardrobePresetEmptyOutfitError,
  WardrobePresetInvalidIdError,
  WardrobePresetInvalidNameError,
  WardrobePresetItemsUnavailableError,
  WardrobePresetLimitError,
  WardrobePresetNameTakenError,
  WardrobePresetNotFoundError,
} from './errors.js';
import { WARDROBE_SLOTS } from './types.js';
import type {
  WardrobeClearResult,
  WardrobePresetApplyResult,
  WardrobePresetItem,
  WardrobePresetMutationResult,
  WardrobePresetPort,
  WardrobePresetSummary,
  WardrobeSlot,
} from './types.js';

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;
const MAX_PRESETS_PER_USER = 20;
const presetNamePattern = /^[\p{L}\p{N}][\p{L}\p{N} _'-]{0,31}$/u;
const presetIdPattern = /^[1-9][0-9]{0,18}$/;

type PresetOperation = 'CREATE' | 'SAVE' | 'APPLY' | 'RENAME' | 'DELETE' | 'CLEAR';

interface UserRow extends QueryResultRow {
  readonly discord_user_id: string;
}

interface PresetRow extends QueryResultRow {
  readonly preset_id: string;
  readonly name: string;
  readonly item_count?: number;
}

interface PresetEquipmentRow extends QueryResultRow {
  readonly slot: WardrobeSlot;
  readonly item_id: string;
  readonly display_name: string;
}

interface InventoryItemRow extends QueryResultRow {
  readonly item_id: string;
}

interface ExistingRequestRow extends QueryResultRow {
  readonly discord_user_id: string;
  readonly operation: PresetOperation;
  readonly request_fingerprint: string;
  readonly result: unknown;
}

interface RawOutfitRow extends QueryResultRow {
  readonly slot: WardrobeSlot;
  readonly item_id: string;
  readonly display_name: string;
}

interface NormalizedName {
  readonly displayName: string;
  readonly key: string;
}

export class WardrobePresetService implements WardrobePresetPort {
  public constructor(private readonly pool: Pool) {}

  public async listPresets(discordUserId: string): Promise<readonly WardrobePresetSummary[]> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const result = await this.pool.query<PresetRow>(
      `SELECT preset.preset_id::text,
              preset.name,
              count(DISTINCT equipment.item_id)::integer AS item_count
       FROM wardrobe_presets AS preset
       LEFT JOIN wardrobe_preset_equipment AS equipment
         ON equipment.discord_user_id = preset.discord_user_id
        AND equipment.preset_id = preset.preset_id
       WHERE preset.discord_user_id = $1
       GROUP BY preset.preset_id, preset.name, preset.updated_at
       ORDER BY preset.updated_at DESC, preset.preset_id DESC`,
      [discordUserId],
    );
    return result.rows.map((row) => this.toSummary(row));
  }

  public async createPreset(
    interactionId: string,
    discordUserId: string,
    name: string,
  ): Promise<WardrobePresetMutationResult> {
    const normalizedName = this.normalizeName(name);
    return this.mutate(
      interactionId,
      discordUserId,
      'CREATE',
      normalizedName.key,
      (value) => this.parseMutationResult(value),
      async (client) => {
        const presetCount = await client.query<{ readonly total: string }>(
          'SELECT count(*)::text AS total FROM wardrobe_presets WHERE discord_user_id = $1',
          [discordUserId],
        );
        if (Number(presetCount.rows[0]?.total ?? '0') >= MAX_PRESETS_PER_USER) {
          throw new WardrobePresetLimitError();
        }
        const outfit = await this.readCurrentEquipment(client, discordUserId);
        this.assertNonEmpty(outfit);
        const created = await client.query<PresetRow>(
          `INSERT INTO wardrobe_presets (discord_user_id, name, name_key)
           VALUES ($1, $2, $3)
           RETURNING preset_id::text, name`,
          [discordUserId, normalizedName.displayName, normalizedName.key],
        );
        const preset = created.rows[0];
        if (preset === undefined) throw new Error('Wardrobe preset was not created.');
        await this.replaceSnapshot(client, discordUserId, preset.preset_id, outfit);
        return {
          presetId: preset.preset_id,
          name: preset.name,
          itemCount: this.countItems(outfit),
        };
      },
    );
  }

  public async savePreset(
    interactionId: string,
    discordUserId: string,
    presetId: string,
  ): Promise<WardrobePresetMutationResult> {
    this.validatePresetId(presetId);
    return this.mutate(
      interactionId,
      discordUserId,
      'SAVE',
      presetId,
      (value) => this.parseMutationResult(value),
      async (client) => {
        const preset = await this.lockPreset(client, discordUserId, presetId);
        const outfit = await this.readCurrentEquipment(client, discordUserId);
        this.assertNonEmpty(outfit);
        await this.replaceSnapshot(client, discordUserId, preset.preset_id, outfit);
        await client.query(
          `UPDATE wardrobe_presets SET updated_at = now()
           WHERE discord_user_id = $1 AND preset_id = $2`,
          [discordUserId, preset.preset_id],
        );
        return {
          presetId: preset.preset_id,
          name: preset.name,
          itemCount: this.countItems(outfit),
        };
      },
    );
  }

  public async applyPreset(
    interactionId: string,
    discordUserId: string,
    presetId: string,
  ): Promise<WardrobePresetApplyResult> {
    this.validatePresetId(presetId);
    return this.mutate(
      interactionId,
      discordUserId,
      'APPLY',
      presetId,
      (value) => this.parseApplyResult(value),
      async (client) => {
        const preset = await this.lockPreset(client, discordUserId, presetId);
        const stored = await client.query<PresetEquipmentRow>(
          `SELECT equipment.slot, item.item_id, item.display_name
           FROM wardrobe_preset_equipment AS equipment
           INNER JOIN shop_catalog AS item ON item.item_id = equipment.item_id
           WHERE equipment.discord_user_id = $1 AND equipment.preset_id = $2
           ORDER BY equipment.slot
           FOR SHARE OF equipment, item`,
          [discordUserId, preset.preset_id],
        );
        if (stored.rows.length === 0) throw new WardrobePresetEmptyOutfitError();

        const itemNames = new Map(stored.rows.map((row) => [row.item_id, row.display_name]));
        const itemIds = [...itemNames.keys()];
        const owned = await client.query<InventoryItemRow>(
          `SELECT item_id FROM user_inventory
           WHERE discord_user_id = $1 AND item_id = ANY($2::text[])
           ORDER BY item_id FOR UPDATE`,
          [discordUserId, itemIds],
        );
        const ownedIds = new Set(owned.rows.map((row) => row.item_id));
        const missingNames = itemIds
          .filter((itemId) => !ownedIds.has(itemId))
          .map((itemId) => itemNames.get(itemId) ?? itemId);
        if (missingNames.length > 0) {
          throw new WardrobePresetItemsUnavailableError(missingNames);
        }

        const outfit = this.groupPresetEquipment(stored.rows);
        await client.query('DELETE FROM wardrobe_equipment WHERE discord_user_id = $1', [
          discordUserId,
        ]);
        for (const row of stored.rows) {
          await client.query(
            `INSERT INTO wardrobe_equipment (discord_user_id, slot, item_id)
             VALUES ($1, $2, $3)`,
            [discordUserId, row.slot, row.item_id],
          );
        }
        await client.query(
          `UPDATE wardrobe_presets SET updated_at = now()
           WHERE discord_user_id = $1 AND preset_id = $2`,
          [discordUserId, preset.preset_id],
        );
        return { presetId: preset.preset_id, name: preset.name, outfit };
      },
    );
  }

  public async renamePreset(
    interactionId: string,
    discordUserId: string,
    presetId: string,
    name: string,
  ): Promise<WardrobePresetMutationResult> {
    this.validatePresetId(presetId);
    const normalizedName = this.normalizeName(name);
    return this.mutate(
      interactionId,
      discordUserId,
      'RENAME',
      `${presetId}\u0000${normalizedName.key}`,
      (value) => this.parseMutationResult(value),
      async (client) => {
        const updated = await client.query<PresetRow>(
          `UPDATE wardrobe_presets
           SET name = $3, name_key = $4, updated_at = now()
           WHERE discord_user_id = $1 AND preset_id = $2
           RETURNING preset_id::text, name`,
          [discordUserId, presetId, normalizedName.displayName, normalizedName.key],
        );
        const preset = updated.rows[0];
        if (preset === undefined) throw new WardrobePresetNotFoundError();
        const count = await client.query<{ readonly item_count: number }>(
          `SELECT count(DISTINCT item_id)::integer AS item_count
           FROM wardrobe_preset_equipment
           WHERE discord_user_id = $1 AND preset_id = $2`,
          [discordUserId, presetId],
        );
        return {
          presetId: preset.preset_id,
          name: preset.name,
          itemCount: count.rows[0]?.item_count ?? 0,
        };
      },
    );
  }

  public async deletePreset(
    interactionId: string,
    discordUserId: string,
    presetId: string,
  ): Promise<WardrobePresetMutationResult> {
    this.validatePresetId(presetId);
    return this.mutate(
      interactionId,
      discordUserId,
      'DELETE',
      presetId,
      (value) => this.parseMutationResult(value),
      async (client) => {
        const preset = await this.lockPreset(client, discordUserId, presetId);
        const count = await client.query<{ readonly item_count: number }>(
          `SELECT count(DISTINCT item_id)::integer AS item_count
           FROM wardrobe_preset_equipment
           WHERE discord_user_id = $1 AND preset_id = $2`,
          [discordUserId, preset.preset_id],
        );
        await client.query(
          'DELETE FROM wardrobe_presets WHERE discord_user_id = $1 AND preset_id = $2',
          [discordUserId, preset.preset_id],
        );
        return {
          presetId: preset.preset_id,
          name: preset.name,
          itemCount: count.rows[0]?.item_count ?? 0,
        };
      },
    );
  }

  public async clear(interactionId: string, discordUserId: string): Promise<WardrobeClearResult> {
    return this.mutate(
      interactionId,
      discordUserId,
      'CLEAR',
      'all-slots',
      (value) => this.parseClearResult(value),
      async (client) => {
        const removed = await client.query<{ readonly item_id: string }>(
          `DELETE FROM wardrobe_equipment
           WHERE discord_user_id = $1
           RETURNING item_id`,
          [discordUserId],
        );
        return { removedItemCount: new Set(removed.rows.map((row) => row.item_id)).size };
      },
    );
  }

  private async mutate<T extends object>(
    interactionId: string,
    discordUserId: string,
    operation: PresetOperation,
    payload: string,
    decode: (value: unknown) => T,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T & { readonly replayed: boolean }> {
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const fingerprint = createHash('sha256')
      .update(`${discordUserId}\u0000WARDROBE_PRESET\u0000${operation}\u0000${payload}`)
      .digest('hex');

    return withTransaction(this.pool, async (client) => {
      await this.ensureAndLockUser(client, discordUserId);
      const existing = await client.query<ExistingRequestRow>(
        `SELECT discord_user_id, operation, request_fingerprint, result
         FROM wardrobe_preset_requests WHERE interaction_id = $1`,
        [interactionId],
      );
      const previous = existing.rows[0];
      if (previous !== undefined) {
        if (
          previous.discord_user_id !== discordUserId ||
          previous.operation !== operation ||
          previous.request_fingerprint !== fingerprint
        ) {
          throw new IdempotencyConflictError();
        }
        return { ...decode(previous.result), replayed: true };
      }

      let result: T;
      try {
        result = await action(client);
      } catch (error) {
        if (this.isPresetNameConflict(error)) throw new WardrobePresetNameTakenError();
        throw error;
      }
      await client.query(
        `INSERT INTO wardrobe_preset_requests (
           interaction_id, discord_user_id, operation, request_fingerprint, result
         ) VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [interactionId, discordUserId, operation, fingerprint, JSON.stringify(result)],
      );
      return { ...result, replayed: false };
    });
  }

  private async readCurrentEquipment(
    client: PoolClient,
    discordUserId: string,
  ): Promise<readonly RawOutfitRow[]> {
    const result = await client.query<RawOutfitRow>(
      `SELECT equipment.slot, item.item_id, item.display_name
       FROM wardrobe_equipment AS equipment
       INNER JOIN shop_catalog AS item ON item.item_id = equipment.item_id
       WHERE equipment.discord_user_id = $1
       ORDER BY equipment.slot
       FOR UPDATE OF equipment`,
      [discordUserId],
    );
    return result.rows;
  }

  private async replaceSnapshot(
    client: PoolClient,
    discordUserId: string,
    presetId: string,
    rows: readonly RawOutfitRow[],
  ): Promise<void> {
    await client.query(
      `DELETE FROM wardrobe_preset_equipment
       WHERE discord_user_id = $1 AND preset_id = $2`,
      [discordUserId, presetId],
    );
    for (const row of rows) {
      await client.query(
        `INSERT INTO wardrobe_preset_equipment (discord_user_id, preset_id, slot, item_id)
         VALUES ($1, $2, $3, $4)`,
        [discordUserId, presetId, row.slot, row.item_id],
      );
    }
  }

  private async lockPreset(
    client: PoolClient,
    discordUserId: string,
    presetId: string,
  ): Promise<PresetRow> {
    const result = await client.query<PresetRow>(
      `SELECT preset_id::text, name
       FROM wardrobe_presets
       WHERE discord_user_id = $1 AND preset_id = $2
       FOR UPDATE`,
      [discordUserId, presetId],
    );
    const preset = result.rows[0];
    if (preset === undefined) throw new WardrobePresetNotFoundError();
    return preset;
  }

  private async ensureAndLockUser(client: PoolClient, discordUserId: string): Promise<void> {
    await client.query(
      `INSERT INTO discord_users (discord_user_id)
       VALUES ($1) ON CONFLICT (discord_user_id) DO NOTHING`,
      [discordUserId],
    );
    const result = await client.query<UserRow>(
      `SELECT discord_user_id FROM discord_users
       WHERE discord_user_id = $1 FOR UPDATE`,
      [discordUserId],
    );
    if (result.rows[0] === undefined) throw new Error('Discord user row could not be locked.');
  }

  private groupPresetEquipment(rows: readonly PresetEquipmentRow[]): readonly WardrobePresetItem[] {
    const items = new Map<string, { displayName: string; slots: WardrobeSlot[] }>();
    for (const row of rows) {
      const item = items.get(row.item_id) ?? { displayName: row.display_name, slots: [] };
      item.slots.push(row.slot);
      items.set(row.item_id, item);
    }
    return [...items]
      .map(([itemId, item]) => ({ itemId, displayName: item.displayName, slots: item.slots }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  private normalizeName(value: string): NormalizedName {
    const displayName = value.trim();
    const codePoints = [...displayName];
    if (codePoints.length < 1 || codePoints.length > 32 || !presetNamePattern.test(displayName)) {
      throw new WardrobePresetInvalidNameError();
    }
    const key = displayName.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
    if ([...key].length > 32) throw new WardrobePresetInvalidNameError();
    return { displayName, key };
  }

  private validatePresetId(presetId: string): void {
    if (!presetIdPattern.test(presetId) || BigInt(presetId) > MAX_POSTGRES_BIGINT) {
      throw new WardrobePresetInvalidIdError();
    }
  }

  private assertNonEmpty(rows: readonly RawOutfitRow[]): void {
    if (rows.length === 0) throw new WardrobePresetEmptyOutfitError();
  }

  private countItems(rows: readonly RawOutfitRow[]): number {
    return new Set(rows.map((row) => row.item_id)).size;
  }

  private toSummary(row: PresetRow): WardrobePresetSummary {
    if (!/^[1-9][0-9]{0,18}$/.test(row.preset_id)) {
      throw new Error('The database returned an invalid wardrobe preset ID.');
    }
    return {
      presetId: row.preset_id,
      name: row.name,
      itemCount: row.item_count ?? 0,
    };
  }

  private parseMutationResult(value: unknown): WardrobePresetSummary {
    const result = this.asRecord(value);
    if (
      typeof result.presetId !== 'string' ||
      !/^[1-9][0-9]{0,18}$/.test(result.presetId) ||
      typeof result.name !== 'string' ||
      !Number.isSafeInteger(result.itemCount) ||
      (result.itemCount as number) < 0
    ) {
      throw new Error('Stored wardrobe preset mutation result is invalid.');
    }
    return {
      presetId: result.presetId,
      name: result.name,
      itemCount: result.itemCount as number,
    };
  }

  private parseApplyResult(value: unknown): Omit<WardrobePresetApplyResult, 'replayed'> {
    const result = this.asRecord(value);
    if (
      typeof result.presetId !== 'string' ||
      !/^[1-9][0-9]{0,18}$/.test(result.presetId) ||
      typeof result.name !== 'string' ||
      !Array.isArray(result.outfit)
    ) {
      throw new Error('Stored wardrobe preset application result is invalid.');
    }
    const outfit = result.outfit.map((value) => {
      const item = this.asRecord(value);
      if (
        typeof item.itemId !== 'string' ||
        typeof item.displayName !== 'string' ||
        !Array.isArray(item.slots) ||
        item.slots.length === 0 ||
        item.slots.some(
          (slot) =>
            typeof slot !== 'string' || !(WARDROBE_SLOTS as readonly string[]).includes(slot),
        )
      ) {
        throw new Error('Stored wardrobe preset outfit result is invalid.');
      }
      return {
        itemId: item.itemId,
        displayName: item.displayName,
        slots: item.slots as WardrobeSlot[],
      };
    });
    return { presetId: result.presetId, name: result.name, outfit };
  }

  private parseClearResult(value: unknown): Omit<WardrobeClearResult, 'replayed'> {
    const result = this.asRecord(value);
    if (!Number.isSafeInteger(result.removedItemCount) || (result.removedItemCount as number) < 0) {
      throw new Error('Stored wardrobe clear result is invalid.');
    }
    return { removedItemCount: result.removedItemCount as number };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Stored wardrobe mutation result is not an object.');
    }
    return value as Record<string, unknown>;
  }

  private isPresetNameConflict(error: unknown): boolean {
    if (error === null || typeof error !== 'object') return false;
    const postgresError = error as { readonly code?: unknown; readonly constraint?: unknown };
    return (
      postgresError.code === '23505' &&
      postgresError.constraint === 'wardrobe_presets_user_name_key'
    );
  }
}
