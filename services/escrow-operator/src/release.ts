import type { Proof } from '@cashu/cashu-ts';
import type { DecodedTokenEntry } from './types.js';
import { encodeSingleMintToken, sumProofAmounts } from './cashu.js';
import type { FinishedEvent } from './nostr.js';

export interface ReleaseArgs {
  battleId: string;
  winnerPubkey: string;
  hostEscrowPubkey: string;
  guestEscrowPubkey: string;
  hostDepositToken: string;
  guestDepositToken: string;
  finishedEvent: FinishedEvent;
}

export interface ReleaseDeps {
  escrowPrivkey: string;
  escrowPubkey: string;
  verifyFinishedEvent: (event: FinishedEvent, battleId: string) => boolean;
  decodeToken: (tokenStr: string) => DecodedTokenEntry[];
  isTokenLockedToPubkey: (tokenStr: string, pubkey: string) => boolean;
  receive: (mintUrl: string, entryToken: string, privkey: string) => Promise<Proof[]>;
  send: (
    mintUrl: string,
    amount: number,
    proofs: Proof[],
    recipientPubkey: string,
  ) => Promise<{ send: Proof[]; keep: Proof[] }>;
}

export interface ReleaseResult {
  token: string;
}

export class ReleaseError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ReleaseError';
  }
}

/**
 * Operator-side escrow release logic.
 *
 * 1. Verify the winner is one of the two escrow pubkeys.
 * 2. Verify the signed battle-finished event.
 * 3. Verify both deposit tokens are P2PK-locked to the operator.
 * 4. Receive both tokens using the operator private key.
 * 5. Send the combined value to the winner as a new P2PK-locked token.
 */
export async function processEscrowRelease(
  args: ReleaseArgs,
  deps: ReleaseDeps,
): Promise<ReleaseResult> {
  if (
    args.winnerPubkey !== args.hostEscrowPubkey &&
    args.winnerPubkey !== args.guestEscrowPubkey
  ) {
    throw new ReleaseError(
      'winnerPubkey is not a participant in this battle',
      400,
    );
  }

  if (!deps.verifyFinishedEvent(args.finishedEvent, args.battleId)) {
    throw new ReleaseError('Invalid or unauthorized battle-finished event', 400);
  }

  if (!deps.isTokenLockedToPubkey(args.hostDepositToken, deps.escrowPubkey)) {
    throw new ReleaseError(
      'Host deposit token is not locked to the escrow pubkey',
      400,
    );
  }
  if (!deps.isTokenLockedToPubkey(args.guestDepositToken, deps.escrowPubkey)) {
    throw new ReleaseError(
      'Guest deposit token is not locked to the escrow pubkey',
      400,
    );
  }

  const hostEntries = deps.decodeToken(args.hostDepositToken);
  const guestEntries = deps.decodeToken(args.guestDepositToken);

  // cashu-ts v2 cannot produce multi-mint outputs, so require a single shared mint.
  if (hostEntries.length !== 1 || guestEntries.length !== 1) {
    throw new ReleaseError(
      'Each deposit token must contain exactly one mint entry',
      400,
    );
  }
  if (hostEntries[0].mintUrl !== guestEntries[0].mintUrl) {
    throw new ReleaseError(
      'Host and guest deposit tokens must use the same mint',
      400,
    );
  }

  const mintUrl = hostEntries[0].mintUrl;

  const hostReceived = await deps.receive(
    mintUrl,
    args.hostDepositToken,
    deps.escrowPrivkey,
  );
  const guestReceived = await deps.receive(
    mintUrl,
    args.guestDepositToken,
    deps.escrowPrivkey,
  );

  const combinedProofs = [...hostReceived, ...guestReceived];
  const totalAmount = sumProofAmounts(combinedProofs);

  if (totalAmount <= 0) {
    throw new ReleaseError('Received proofs have no value', 500);
  }

  const sendResult = await deps.send(
    mintUrl,
    totalAmount,
    combinedProofs,
    args.winnerPubkey,
  );

  const token = encodeSingleMintToken(mintUrl, sendResult.send);
  return { token };
}
