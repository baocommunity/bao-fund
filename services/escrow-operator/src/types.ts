import type { Proof } from '@cashu/cashu-ts';

export interface DecodedTokenEntry {
  mintUrl: string;
  proofs: Proof[];
  amount: number;
}
