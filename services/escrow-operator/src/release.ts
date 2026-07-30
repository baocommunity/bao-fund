import type { Proof } from '@cashu/cashu-ts';
import type { DecodedTokenEntry } from './types.js';
import { encodeSingleMintToken, sumProofAmounts, toXOnlyPubkey, type ParsedP2PKLock } from './cashu.js';
import type { AttestationContext, AttestationEvent, AttestationVerification } from './nostr.js';

export interface ReleaseArgs {
  battleId: string;
  winnerPubkey: string;
  hostEscrowPubkey: string;
  guestEscrowPubkey: string;
  hostDepositToken: string;
  guestDepositToken: string;
  hostAttestation: AttestationEvent;
  guestAttestation: AttestationEvent;
}

export interface ReleaseDeps {
  escrowPrivkey: string;
  escrowPubkey: string;
  verifyAttestationPair: (
    hostAttestation: AttestationEvent,
    guestAttestation: AttestationEvent,
    ctx: AttestationContext,
  ) => AttestationVerification;
  decodeToken: (tokenStr: string) => DecodedTokenEntry[];
  isTokenLockedToPubkey: (tokenStr: string, pubkey: string) => boolean;
  receive: (mintUrl: string, entryToken: string, privkey: string) => Promise<Proof[]>;
  send: (
    mintUrl: string,
    amount: number,
    proofs: Proof[],
    recipientPubkey: string,
  ) => Promise<{ send: Proof[]; keep: Proof[] }>;
  /** 2-of-3 multisig: describe a deposit's uniform multisig lock (null = not multisig). */
  getMultisigDepositInfo: (tokenStr: string) => ParsedP2PKLock | null;
  /** 2-of-3 multisig: append the operator's witness signature to each proof. */
  cosignProofs: (proofs: Proof[]) => Proof[];
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
 * The operator refuses to co-sign this close to a deposit's refund locktime.
 * Inside the margin a release could race a depositor's refund and leave the
 * winner holding an unspendable token — near the locktime the correct outcome
 * is simply that both depositors reclaim via the refund path.
 */
export const OPERATOR_SIGN_MIN_LOCKTIME_MARGIN_SECONDS = 60 * 60;

/**
 * Operator-side escrow release logic.
 *
 * 1. Verify the winner is one of the two escrow pubkeys.
 * 2. Verify BOTH players' result attestations decrypt, are bound to the
 *    escrow keys named in the deposit locks, and AGREE on the winner — and
 *    that the claimed winnerPubkey matches the attested outcome.
 * 3a. MULTISIG (2-of-3) deposits: validate both locks, co-sign, return the
 *     witnessed proofs — the operator never takes custody of the funds.
 * 3b. LEGACY (single-key custodial) deposits: receive both tokens using the
 *     operator private key and send the combined value to the winner.
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

  const outcome = deps.verifyAttestationPair(args.hostAttestation, args.guestAttestation, {
    battleId: args.battleId,
    hostEscrowPubkey: args.hostEscrowPubkey,
    guestEscrowPubkey: args.guestEscrowPubkey,
  });
  if (!outcome.ok) {
    throw new ReleaseError(outcome.reason, 400);
  }
  // The claimer must BE the attested winner — nobody can pull the pot for a
  // third key, and the loser cannot claim "for" the winner either.
  const attestedWinnerPubkey = outcome.winner === 0 ? args.hostEscrowPubkey : args.guestEscrowPubkey;
  if (
    toXOnlyPubkey(args.winnerPubkey) !== toXOnlyPubkey(attestedWinnerPubkey)
  ) {
    throw new ReleaseError('winnerPubkey does not match the attested outcome', 400);
  }

  const hostMultisig = deps.getMultisigDepositInfo(args.hostDepositToken);
  const guestMultisig = deps.getMultisigDepositInfo(args.guestDepositToken);

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

  if (hostMultisig || guestMultisig) {
    return processMultisigRelease(args, deps, hostMultisig, guestMultisig, hostEntries, guestEntries, mintUrl);
  }

  // ── Legacy custodial path (single-key P2PK locked to the operator) ──
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

/**
 * Non-custodial 2-of-3 release: the operator attests the outcome by co-signing
 * every deposit proof and returning the combined witnessed token. The funds
 * never move through the operator's wallet — the winner's own key provides
 * the second required signature when they receive the token.
 *
 * Validation (both deposits, independently):
 * - lock key set is exactly {host, guest, operator} (x-only)
 * - exactly 2 required signatures
 * - sole refund key is the DEPOSITOR's own key
 * - locktime is beyond the sign margin (else refuse — refund path takes over)
 */
function processMultisigRelease(
  args: ReleaseArgs,
  deps: ReleaseDeps,
  hostMultisig: ParsedP2PKLock | null,
  guestMultisig: ParsedP2PKLock | null,
  hostEntries: DecodedTokenEntry[],
  guestEntries: DecodedTokenEntry[],
  mintUrl: string,
): ReleaseResult {
  if (!hostMultisig || !guestMultisig) {
    throw new ReleaseError(
      'Deposit tokens use different escrow schemes — both must be 2-of-3 multisig deposits',
      400,
    );
  }

  const expectedKeys = [
    toXOnlyPubkey(args.hostEscrowPubkey),
    toXOnlyPubkey(args.guestEscrowPubkey),
    toXOnlyPubkey(deps.escrowPubkey),
  ];
  if (expectedKeys.some((k) => k === null)) {
    throw new ReleaseError('Battle escrow pubkeys are malformed', 400);
  }
  const expectedSet = JSON.stringify([...new Set(expectedKeys as string[])].sort());
  const minLocktime = Math.floor(Date.now() / 1000) + OPERATOR_SIGN_MIN_LOCKTIME_MARGIN_SECONDS;

  const validateDeposit = (
    info: ParsedP2PKLock,
    depositorPubkey: string,
    label: string,
  ): void => {
    if (JSON.stringify(info.lockKeys) !== expectedSet) {
      throw new ReleaseError(
        `${label} deposit is not locked to the expected {host, guest, operator} key set`,
        400,
      );
    }
    if (info.requiredSignatures !== 2) {
      throw new ReleaseError(
        `${label} deposit does not require exactly 2 signatures`,
        400,
      );
    }
    const depositorKey = toXOnlyPubkey(depositorPubkey);
    if (!depositorKey || JSON.stringify(info.refundKeys) !== JSON.stringify([depositorKey])) {
      throw new ReleaseError(
        `${label} deposit refund key is not the depositor's own key`,
        400,
      );
    }
    if (info.locktime === undefined || info.locktime <= minLocktime) {
      throw new ReleaseError(
        `${label} deposit is too close to its refund locktime — use the refund path instead`,
        400,
      );
    }
  };

  validateDeposit(hostMultisig, args.hostEscrowPubkey, 'Host');
  validateDeposit(guestMultisig, args.guestEscrowPubkey, 'Guest');

  let signed: Proof[];
  try {
    signed = deps.cosignProofs([...hostEntries[0].proofs, ...guestEntries[0].proofs]);
  } catch (err) {
    console.error('[release] multisig co-sign failed:', err);
    throw new ReleaseError('Escrow operator could not co-sign the deposits', 500);
  }

  return { token: encodeSingleMintToken(mintUrl, signed) };
}
