export const WALLET_ENTRY_TYPES = [
  'DAILY_REWARD',
  'BALLET_ACTIVITY',
  'PERFORMANCE_REWARD',
  'SHOP_PURCHASE',
  'MARKET_PURCHASE',
  'MARKET_SALE',
  'ADMIN_ADJUSTMENT',
] as const;

export type WalletEntryType = (typeof WALLET_ENTRY_TYPES)[number];

export type WalletCreditReason =
  'DAILY_REWARD' | 'BALLET_ACTIVITY' | 'PERFORMANCE_REWARD' | 'MARKET_SALE';

export type WalletSpendReason = 'SHOP_PURCHASE' | 'MARKET_PURCHASE';

export interface WalletMutationResult {
  readonly balance: bigint;
  readonly transactionId: string;
  readonly replayed: boolean;
}

export interface WalletLedgerEntry {
  readonly transactionId: string;
  readonly entryType: WalletEntryType;
  readonly amountDelta: bigint;
  readonly balanceAfter: bigint;
  readonly createdAt: Date;
}
