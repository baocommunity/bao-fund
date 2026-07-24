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

export function encodeSingleMintToken(mintUrl: string, proofs: Proof[]): string {
  return getEncodedToken({ mint: mintUrl, proofs, unit: 'sat' });
}
