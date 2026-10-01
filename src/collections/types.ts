export interface CollectionProgress {
  readonly collectionId: string;
  readonly displayName: string;
  readonly description: string;
  readonly ownedItems: number;
  readonly totalItems: number;
  readonly complete: boolean;
}

export interface CollectionPort {
  listProgress(discordUserId: string): Promise<readonly CollectionProgress[]>;
}
