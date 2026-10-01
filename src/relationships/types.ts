export type RelationshipProposalStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';
export type RelationshipDecision = 'ACCEPT' | 'DECLINE';
export type RelationshipOperation = 'PROPOSE' | 'ACCEPT' | 'DECLINE' | 'CANCEL' | 'DIVORCE';

export interface RelationshipProposal {
  readonly proposalId: string;
  readonly guildId: string;
  readonly proposerUserId: string;
  readonly targetUserId: string;
  readonly status: RelationshipProposalStatus;
  readonly createdAt: Date;
}

export interface RelationshipProposalResult {
  readonly proposal: RelationshipProposal;
  readonly replayed: boolean;
}

export interface RelationshipDecisionResult {
  readonly proposalId: string;
  readonly status: RelationshipProposalStatus;
  readonly relationshipId: string | null;
  readonly replayed: boolean;
}

export interface MarriageSummary {
  readonly relationshipId: string;
  readonly guildId: string;
  readonly partnerUserId: string;
  readonly marriedAt: Date;
}

export interface DivorceResult {
  readonly relationshipId: string;
  readonly replayed: boolean;
}

export interface RelationshipPort {
  propose(
    interactionId: string,
    guildId: string,
    proposerUserId: string,
    targetUserId: string,
  ): Promise<RelationshipProposalResult>;
  respond(
    interactionId: string,
    guildId: string,
    actorUserId: string,
    proposalId: string,
    decision: RelationshipDecision,
  ): Promise<RelationshipDecisionResult>;
  cancel(
    interactionId: string,
    guildId: string,
    actorUserId: string,
    proposalId: string,
  ): Promise<RelationshipDecisionResult>;
  getMarriage(discordUserId: string): Promise<MarriageSummary | null>;
  divorce(interactionId: string, actorUserId: string): Promise<DivorceResult>;
}
