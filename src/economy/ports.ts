import type { PoolClient } from 'pg';

import type {
  WalletCreditReason,
  WalletMutationInput,
  WalletMutationResult,
  WalletSpendReason,
  WalletTransferInput,
  WalletTransferResult,
} from './types.js';

export interface WalletCreditTransactionPort {
  creditWithinTransaction(
    client: PoolClient,
    input: WalletMutationInput & { readonly reason: WalletCreditReason },
  ): Promise<WalletMutationResult>;
}

export interface WalletSpendTransactionPort {
  spendWithinTransaction(
    client: PoolClient,
    input: WalletMutationInput & { readonly reason: WalletSpendReason },
  ): Promise<WalletMutationResult>;
}

export interface WalletTransferTransactionPort {
  transferWithinTransaction(
    client: PoolClient,
    input: WalletTransferInput,
  ): Promise<WalletTransferResult>;
}
