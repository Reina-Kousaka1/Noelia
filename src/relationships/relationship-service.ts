import { createHash } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { withTransaction } from '../database/transaction.js';
import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import {
  MarriageNotFoundError,
  MarriageParticipantUnavailableError,
  MarriageProposalActorError,
  MarriageProposalNotFoundError,
  MarriageProposalUnavailableError,
  MarriageSelfProposalError,
  RelationshipIdempotencyConflictError,
  RelationshipProposalIdError,
} from './errors.js';
import type {
  DivorceResult,
  MarriageSummary,
  RelationshipDecision,
  RelationshipDecisionResult,
  RelationshipOperation,
  RelationshipPort,
  RelationshipProposal,
  RelationshipProposalResult,
  RelationshipProposalStatus,
} from './types.js';

interface ProposalRow extends QueryResultRow {
  readonly proposal_id: string;
  readonly guild_id: string;
  readonly proposer_user_id: string;
  readonly target_user_id: string;
  readonly status: RelationshipProposalStatus;
  readonly created_at: Date;
}

interface RequestRow extends QueryResultRow {
  readonly actor_user_id: string;
  readonly operation: RelationshipOperation;
  readonly request_fingerprint: string;
  readonly proposal_id: string | null;
  readonly relationship_id: string | null;
  readonly result_status: string | null;
  readonly completed_at: Date | null;
}

interface UserRow extends QueryResultRow {
  readonly discord_user_id: string;
}

interface RelationshipRow extends QueryResultRow {
  readonly relationship_id: string;
  readonly guild_id: string;
  readonly partner_a_user_id: string;
  readonly partner_b_user_id: string;
  readonly married_at: Date;
}

const proposalIdPattern = /^[1-9][0-9]{0,18}$/;

export class RelationshipService implements RelationshipPort {
  public constructor(private readonly pool: Pool) {}

  public async propose(
    interactionId: string,
    guildId: string,
    proposerUserId: string,
    targetUserId: string,
  ): Promise<RelationshipProposalResult> {
    this.validateCommon(interactionId, guildId, proposerUserId);
    assertDiscordSnowflake(targetUserId, 'Target Discord user ID');
    if (proposerUserId === targetUserId) throw new MarriageSelfProposalError();

    const fingerprint = this.fingerprint('PROPOSE', guildId, proposerUserId, targetUserId);
    return withTransaction(this.pool, async (client) => {
      await this.ensureAndLockUsers(client, [proposerUserId, targetUserId]);
      const replay = await this.reserveRequest(
        client,
        interactionId,
        proposerUserId,
        'PROPOSE',
        fingerprint,
      );
      if (replay !== undefined) {
        const proposalId = this.requiredProposalId(replay.proposal_id);
        return { proposal: await this.readProposal(client, proposalId), replayed: true };
      }

      const unavailable = await client.query(
        `SELECT 1
         FROM relationship_members
         WHERE discord_user_id = ANY($1::text[])
         UNION ALL
         SELECT 1
         FROM relationship_pending_participants
         WHERE discord_user_id = ANY($1::text[])
         LIMIT 1`,
        [[proposerUserId, targetUserId]],
      );
      if (unavailable.rows[0] !== undefined) throw new MarriageParticipantUnavailableError();

      const inserted = await client.query<ProposalRow>(
        `INSERT INTO relationship_proposals (guild_id, proposer_user_id, target_user_id)
         VALUES ($1, $2, $3)
         RETURNING proposal_id::text, guild_id, proposer_user_id, target_user_id, status, created_at`,
        [guildId, proposerUserId, targetUserId],
      );
      const row = inserted.rows[0];
      if (row === undefined) throw new Error('Relationship proposal was not created.');

      await client.query(
        `INSERT INTO relationship_pending_participants (discord_user_id, proposal_id)
         VALUES ($1, $3), ($2, $3)`,
        [proposerUserId, targetUserId, row.proposal_id],
      );
      await this.completeRequest(client, interactionId, row.proposal_id, null, 'PENDING');
      return { proposal: this.toProposal(row), replayed: false };
    });
  }

  public async respond(
    interactionId: string,
    guildId: string,
    actorUserId: string,
    proposalId: string,
    decision: RelationshipDecision,
  ): Promise<RelationshipDecisionResult> {
    this.validateCommon(interactionId, guildId, actorUserId);
    this.validateProposalId(proposalId);
    const operation: RelationshipOperation = decision;
    const proposal = await this.readProposal(this.pool, proposalId);
    if (proposal.guildId !== guildId) throw new MarriageProposalNotFoundError();
    if (proposal.targetUserId !== actorUserId) throw new MarriageProposalActorError();

    const fingerprint = this.fingerprint(operation, guildId, actorUserId, proposalId);
    return withTransaction(this.pool, async (client) => {
      await this.ensureAndLockUsers(client, [proposal.proposerUserId, proposal.targetUserId]);
      const replay = await this.reserveRequest(
        client,
        interactionId,
        actorUserId,
        operation,
        fingerprint,
      );
      if (replay !== undefined) return this.decisionFromRequest(replay, true);

      const locked = await this.readProposal(client, proposalId, true);
      if (locked.guildId !== guildId) throw new MarriageProposalNotFoundError();
      if (locked.targetUserId !== actorUserId) throw new MarriageProposalActorError();
      if (locked.status !== 'PENDING') throw new MarriageProposalUnavailableError();

      let relationshipId: string | null = null;
      const status: RelationshipProposalStatus = decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
      if (decision === 'ACCEPT') {
        const active = await client.query(
          `SELECT 1 FROM relationship_members
           WHERE discord_user_id = ANY($1::text[]) LIMIT 1`,
          [[locked.proposerUserId, locked.targetUserId]],
        );
        if (active.rows[0] !== undefined) throw new MarriageParticipantUnavailableError();

        const partners = [locked.proposerUserId, locked.targetUserId].sort((a, b) =>
          BigInt(a) < BigInt(b) ? -1 : 1,
        );
        const created = await client.query<{ readonly relationship_id: string }>(
          `INSERT INTO relationships (guild_id, partner_a_user_id, partner_b_user_id)
           VALUES ($1, $2, $3)
           RETURNING relationship_id::text`,
          [guildId, partners[0], partners[1]],
        );
        relationshipId = created.rows[0]?.relationship_id ?? null;
        if (relationshipId === null) throw new Error('Marriage record was not created.');
        await client.query(
          `INSERT INTO relationship_participants (relationship_id, discord_user_id)
           VALUES ($1, $2), ($1, $3)`,
          [relationshipId, partners[0], partners[1]],
        );
        await client.query(
          `INSERT INTO relationship_members (discord_user_id, relationship_id)
           VALUES ($1, $3), ($2, $3)`,
          [locked.proposerUserId, locked.targetUserId, relationshipId],
        );
      }

      await client.query(
        `UPDATE relationship_proposals
         SET status = $2, decided_at = now()
         WHERE proposal_id = $1`,
        [proposalId, status],
      );
      await client.query('DELETE FROM relationship_pending_participants WHERE proposal_id = $1', [
        proposalId,
      ]);
      await this.completeRequest(client, interactionId, proposalId, relationshipId, status);
      return { proposalId, status, relationshipId, replayed: false };
    });
  }

  public async cancel(
    interactionId: string,
    guildId: string,
    actorUserId: string,
    proposalId: string,
  ): Promise<RelationshipDecisionResult> {
    this.validateCommon(interactionId, guildId, actorUserId);
    this.validateProposalId(proposalId);
    const proposal = await this.readProposal(this.pool, proposalId);
    if (proposal.guildId !== guildId) throw new MarriageProposalNotFoundError();
    if (proposal.proposerUserId !== actorUserId) throw new MarriageProposalActorError();

    const fingerprint = this.fingerprint('CANCEL', guildId, actorUserId, proposalId);
    return withTransaction(this.pool, async (client) => {
      await this.ensureAndLockUsers(client, [proposal.proposerUserId, proposal.targetUserId]);
      const replay = await this.reserveRequest(
        client,
        interactionId,
        actorUserId,
        'CANCEL',
        fingerprint,
      );
      if (replay !== undefined) return this.decisionFromRequest(replay, true);

      const locked = await this.readProposal(client, proposalId, true);
      if (locked.guildId !== guildId) throw new MarriageProposalNotFoundError();
      if (locked.proposerUserId !== actorUserId) throw new MarriageProposalActorError();
      if (locked.status !== 'PENDING') throw new MarriageProposalUnavailableError();

      const status: RelationshipProposalStatus = 'CANCELLED';
      await client.query(
        `UPDATE relationship_proposals SET status = $2, decided_at = now()
         WHERE proposal_id = $1`,
        [proposalId, status],
      );
      await client.query('DELETE FROM relationship_pending_participants WHERE proposal_id = $1', [
        proposalId,
      ]);
      await this.completeRequest(client, interactionId, proposalId, null, status);
      return { proposalId, status, relationshipId: null, replayed: false };
    });
  }

  public async getMarriage(discordUserId: string): Promise<MarriageSummary | null> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const result = await this.pool.query<RelationshipRow & { readonly partner_user_id: string }>(
      `SELECT relationship.relationship_id::text, relationship.guild_id,
              relationship.partner_a_user_id, relationship.partner_b_user_id,
              relationship.married_at,
              CASE WHEN relationship.partner_a_user_id = member.discord_user_id
                THEN relationship.partner_b_user_id ELSE relationship.partner_a_user_id END AS partner_user_id
       FROM relationship_members AS member
       INNER JOIN relationships AS relationship
         ON relationship.relationship_id = member.relationship_id
       WHERE member.discord_user_id = $1 AND relationship.status = 'MARRIED'`,
      [discordUserId],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          relationshipId: row.relationship_id,
          guildId: row.guild_id,
          partnerUserId: row.partner_user_id,
          marriedAt: row.married_at,
        };
  }

  public async divorce(interactionId: string, actorUserId: string): Promise<DivorceResult> {
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');
    assertDiscordSnowflake(actorUserId, 'Discord user ID');
    return withTransaction(this.pool, async (client) => {
      const current = await client.query<RelationshipRow>(
        `SELECT relationship.relationship_id::text, relationship.guild_id,
                relationship.partner_a_user_id, relationship.partner_b_user_id, relationship.married_at
         FROM relationship_members AS member
         INNER JOIN relationships AS relationship
           ON relationship.relationship_id = member.relationship_id
         WHERE member.discord_user_id = $1 AND relationship.status = 'MARRIED'`,
        [actorUserId],
      );
      const initial = current.rows[0];
      await this.ensureAndLockUsers(
        client,
        initial === undefined
          ? [actorUserId]
          : [initial.partner_a_user_id, initial.partner_b_user_id],
      );

      const fingerprint = this.fingerprint('DIVORCE', actorUserId);
      const replay = await this.reserveRequest(
        client,
        interactionId,
        actorUserId,
        'DIVORCE',
        fingerprint,
      );
      if (replay !== undefined) {
        const relationshipId = replay.relationship_id;
        if (relationshipId === null)
          throw new Error('A stored divorce request has no relationship.');
        return { relationshipId, replayed: true };
      }
      const locked = await client.query<RelationshipRow>(
        `SELECT relationship.relationship_id::text, relationship.guild_id,
                relationship.partner_a_user_id, relationship.partner_b_user_id, relationship.married_at
         FROM relationship_members AS member
         INNER JOIN relationships AS relationship
           ON relationship.relationship_id = member.relationship_id
         WHERE member.discord_user_id = $1 AND relationship.status = 'MARRIED'
         FOR UPDATE OF relationship`,
        [actorUserId],
      );
      const relationship = locked.rows[0];
      if (relationship === undefined) throw new MarriageNotFoundError();

      await client.query(
        `UPDATE relationships SET status = 'DIVORCED', divorced_at = now()
         WHERE relationship_id = $1`,
        [relationship.relationship_id],
      );
      await client.query('DELETE FROM relationship_members WHERE relationship_id = $1', [
        relationship.relationship_id,
      ]);
      await this.completeRequest(
        client,
        interactionId,
        null,
        relationship.relationship_id,
        'DIVORCED',
      );
      return { relationshipId: relationship.relationship_id, replayed: false };
    });
  }

  private async ensureAndLockUsers(client: PoolClient, userIds: readonly string[]): Promise<void> {
    const sorted = [...new Set(userIds)].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
    for (const userId of sorted) {
      await client.query(
        `INSERT INTO discord_users (discord_user_id)
         VALUES ($1) ON CONFLICT (discord_user_id) DO NOTHING`,
        [userId],
      );
    }
    const locked = await client.query<UserRow>(
      `SELECT discord_user_id FROM discord_users
       WHERE discord_user_id = ANY($1::text[])
       ORDER BY discord_user_id::numeric
       FOR UPDATE`,
      [sorted],
    );
    if (locked.rows.length !== sorted.length)
      throw new Error('Relationship users could not be locked.');
  }

  private async reserveRequest(
    client: PoolClient,
    interactionId: string,
    actorUserId: string,
    operation: RelationshipOperation,
    fingerprint: string,
  ): Promise<RequestRow | undefined> {
    const inserted = await client.query(
      `INSERT INTO relationship_requests (
         interaction_id, actor_user_id, operation, request_fingerprint
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (interaction_id) DO NOTHING
       RETURNING interaction_id`,
      [interactionId, actorUserId, operation, fingerprint],
    );
    if (inserted.rows[0] !== undefined) return undefined;

    const existing = await client.query<RequestRow>(
      `SELECT actor_user_id, operation, request_fingerprint, proposal_id::text,
              relationship_id::text, result_status, completed_at
       FROM relationship_requests WHERE interaction_id = $1`,
      [interactionId],
    );
    const request = existing.rows[0];
    if (request === undefined) throw new Error('Relationship request conflict could not be read.');
    if (
      request.actor_user_id !== actorUserId ||
      request.operation !== operation ||
      request.request_fingerprint !== fingerprint
    ) {
      throw new RelationshipIdempotencyConflictError();
    }
    if (request.completed_at === null || request.result_status === null) {
      throw new Error('A stored relationship request is incomplete.');
    }
    return request;
  }

  private async completeRequest(
    client: PoolClient,
    interactionId: string,
    proposalId: string | null,
    relationshipId: string | null,
    resultStatus: string,
  ): Promise<void> {
    const result = await client.query(
      `UPDATE relationship_requests
       SET proposal_id = $2, relationship_id = $3, result_status = $4, completed_at = now()
       WHERE interaction_id = $1 AND completed_at IS NULL`,
      [interactionId, proposalId, relationshipId, resultStatus],
    );
    if (result.rowCount !== 1) throw new Error('Relationship request completion was not recorded.');
  }

  private async readProposal(
    client: Pool | PoolClient,
    proposalId: string,
    forUpdate = false,
  ): Promise<RelationshipProposal> {
    const result = await client.query<ProposalRow>(
      `SELECT proposal_id::text, guild_id, proposer_user_id, target_user_id, status, created_at
       FROM relationship_proposals WHERE proposal_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [proposalId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new MarriageProposalNotFoundError();
    return this.toProposal(row);
  }

  private decisionFromRequest(request: RequestRow, replayed: boolean): RelationshipDecisionResult {
    const proposalId = this.requiredProposalId(request.proposal_id);
    const status = request.result_status;
    if (status !== 'ACCEPTED' && status !== 'DECLINED' && status !== 'CANCELLED') {
      throw new Error('Stored relationship decision has an invalid status.');
    }
    return { proposalId, status, relationshipId: request.relationship_id, replayed };
  }

  private toProposal(row: ProposalRow): RelationshipProposal {
    return {
      proposalId: row.proposal_id,
      guildId: row.guild_id,
      proposerUserId: row.proposer_user_id,
      targetUserId: row.target_user_id,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  private validateCommon(interactionId: string, guildId: string, actorUserId: string): void {
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');
    assertDiscordSnowflake(guildId, 'Discord guild ID');
    assertDiscordSnowflake(actorUserId, 'Discord user ID');
  }

  private validateProposalId(proposalId: string): void {
    if (!proposalIdPattern.test(proposalId)) throw new RelationshipProposalIdError();
  }

  private requiredProposalId(proposalId: string | null): string {
    if (proposalId === null || !proposalIdPattern.test(proposalId)) {
      throw new Error('A stored relationship request has no valid proposal.');
    }
    return proposalId;
  }

  private fingerprint(...parts: readonly string[]): string {
    return createHash('sha256').update(parts.join('\u0000')).digest('hex');
  }
}
