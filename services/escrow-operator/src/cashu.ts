import { getDecodedToken, getEncodedToken, type Proof } from '@cashu/cashu-ts';
import type { DecodedTokenEntry } from './types.js';

export function sumProofAmounts(proofs: Proof[]): number {
  return proofs.reduce((sum, p) => {
    const amount = typeof p.amount === 'number' ? p.amount : Number(p.amount);
    return sum + (Number.isInteger(amount) && amount > 0 ? amount : 0);
  }, 0);
}

/**
 * Decode a Cashu token string into one or more mint entries.
 *
 * cashu-ts v2 only supports single-mint tokens internally, but a v3 token
 * may contain multiple entries. We normalize both shapes.
 */
export function decodeToken(tokenStr: string): DecodedTokenEntry[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decoded = getDecodedToken(tokenStr) as any;
  const entries: DecodedTokenEntry[] = [];

  if (decoded && Array.isArray(decoded.token)) {
    for (const entry of decoded.token as Array<{ mint?: string; proofs?: Proof[] }>) {
      if (!entry?.mint || !Array.isArray(entry.proofs) || entry.proofs.length === 0) {
        continue;
      }
      entries.push({
        mintUrl: entry.mint,
        proofs: entry.proofs,
        amount: sumProofAmounts(entry.proofs),
      });
    }
  } else if (decoded && typeof decoded.mint === 'string' && Array.isArray(decoded.proofs)) {
    entries.push({
      mintUrl: decoded.mint,
      proofs: decoded.proofs,
      amount: sumProofAmounts(decoded.proofs),
    });
  }

  if (entries.length === 0) {
    throw new Error('Token is empty or invalid');
  }

  return entries;
}

/**
 * Extract the P2PK pubkey from a Cashu proof secret.
 *
 * Supports both the modern `["P2PK", { data: pubkey }]` form and the legacy
 * `["P2PK", pubkey]` form.
 */
export function parseP2PKSecret(secret: string): string | null {
  try {
    const parsed = JSON.parse(secret);
    if (!Array.isArray(parsed) || parsed[0] !== 'P2PK') return null;
    const payload = parsed[1];
    if (typeof payload === 'string') return payload;
    if (payload && typeof payload === 'object' && typeof payload.data === 'string') {
      return payload.data;
    }
  } catch {
    // ignore malformed secrets
  }
  return null;
}

export function isTokenLockedToPubkey(tokenStr: string, pubkey: string): boolean {
  const entries = decodeToken(tokenStr);
  return entries.every((entry) =>
    entry.proofs.every((proof) => parseP2PKSecret(proof.secret) === pubkey),
  );
}

/** Normalize a secp256k1 pubkey (x-only 64-hex or 02/03-compressed) to x-only. */
export function toXOnlyPubkey(pubkey: string): string | null {
  const lower = pubkey.toLowerCase();
  if (/^[0-9a-f]{64}$/.test(lower)) return lower;
  if (/^0[23][0-9a-f]{64}$/.test(lower)) return lower.slice(2);
  return null;
}

export interface ParsedP2PKLock {
  /** All lock pubkeys (primary data + `pubkeys` tag), x-only, sorted. */
  lockKeys: string[];
  requiredSignatures: number;
  locktime?: number;
  /** Refund pubkeys from the `refund` tag, x-only, sorted. */
  refundKeys: string[];
  requiredRefundSignatures: number;
}

/**
 * Parse a NUT-11 P2PK secret into its full lock description.
 *
 * Returns null for non-P2PK or malformed secrets. A plain single-key lock
 * (no tags) yields lockKeys=[data], requiredSignatures=1, no locktime, no
 * refund keys — callers distinguish multisig locks by requiredSignatures > 1
 * or lockKeys.length > 1. Unknown tags are ignored.
 */
export function parseP2PKLock(secret: string): ParsedP2PKLock | null {
  try {
    const parsed = JSON.parse(secret);
    if (!Array.isArray(parsed) || parsed[0] !== 'P2PK') return null;
    const payload = parsed[1];
    if (!payload || typeof payload !== 'object' || typeof payload.data !== 'string') {
      // Legacy ["P2PK", "<pubkey>"] form.
      if (typeof payload === 'string') {
        const key = toXOnlyPubkey(payload);
        return key
          ? { lockKeys: [key], requiredSignatures: 1, refundKeys: [], requiredRefundSignatures: 1 }
          : null;
      }
      return null;
    }
    const data = toXOnlyPubkey(payload.data);
    if (!data) return null;
    const tags: string[][] = Array.isArray(payload.tags) ? payload.tags : [];
    const extraKeys: string[] = [];
    let requiredSignatures = 1;
    let locktime: number | undefined;
    const refundKeys: string[] = [];
    let requiredRefundSignatures = 1;
    for (const tag of tags) {
      if (!Array.isArray(tag) || typeof tag[0] !== 'string') continue;
      if (tag[0] === 'pubkeys') {
        for (const k of tag.slice(1)) {
          const x = typeof k === 'string' ? toXOnlyPubkey(k) : null;
          if (x) extraKeys.push(x);
        }
      } else if (tag[0] === 'n_sigs' && typeof tag[1] === 'string') {
        const n = Number(tag[1]);
        if (Number.isInteger(n) && n > 0) requiredSignatures = n;
      } else if (tag[0] === 'locktime' && typeof tag[1] === 'string') {
        const t = Number(tag[1]);
        if (Number.isInteger(t) && t > 0) locktime = t;
      } else if (tag[0] === 'refund') {
        for (const k of tag.slice(1)) {
          const x = typeof k === 'string' ? toXOnlyPubkey(k) : null;
          if (x) refundKeys.push(x);
        }
      } else if (tag[0] === 'n_sigs_refund' && typeof tag[1] === 'string') {
        const n = Number(tag[1]);
        if (Number.isInteger(n) && n > 0) requiredRefundSignatures = n;
      }
    }
    return {
      lockKeys: [...new Set([data, ...extraKeys])].sort(),
      requiredSignatures,
      locktime,
      refundKeys: [...new Set(refundKeys)].sort(),
      requiredRefundSignatures,
    };
  } catch {
    return null;
  }
}

/**
 * Describe the 2-of-3 multisig lock of a deposit token, or null when the
 * token is not uniformly multisig-locked (legacy single-key lock, mixed
 * locks across proofs, multi-entry token, malformed secret). Every proof
 * must carry the identical lock — a deposit that mixes lock shapes is not a
 * valid multisig escrow deposit.
 */
export function getMultisigDepositInfo(tokenStr: string): ParsedP2PKLock | null {
  let entries: DecodedTokenEntry[];
  try {
    entries = decodeToken(tokenStr);
  } catch {
    return null;
  }
  if (entries.length !== 1) return null;
  let info: ParsedP2PKLock | null = null;
  for (const proof of entries[0].proofs) {
    const lock = parseP2PKLock(proof.secret);
    if (!lock) return null;
    if (lock.requiredSignatures < 2 || lock.lockKeys.length < 2) return null;
    if (info && JSON.stringify(info) !== JSON.stringify(lock)) return null;
    info = lock;
  }
  return info;
}

export function encodeSingleMintToken(mintUrl: string, proofs: Proof[]): string {
  return getEncodedToken({ mint: mintUrl, proofs, unit: 'sat' });
}
