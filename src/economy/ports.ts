import type { PoolClient } from 'pg';

import type { WalletCreditReason, WalletMutationInput, WalletMutationResult } from './types.js';

export interface WalletCreditTransactionPort {
  creditWithinTransaction(
    client: PoolClient,
    input: WalletMutationInput & { readonly reason: WalletCreditReason },
  ): Promise<WalletMutationResult>;
}
