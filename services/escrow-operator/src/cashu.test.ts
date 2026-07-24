import { describe, it, expect } from 'vitest';
import { parseP2PKSecret, sumProofAmounts } from './cashu.js';
import type { Proof } from '@cashu/cashu-ts';

describe('parseP2PKSecret', () => {
  it('extracts the pubkey from the modern object form', () => {
    const secret = JSON.stringify(['P2PK', { data: 'pubkey1' }]);
    expect(parseP2PKSecret(secret)).toBe('pubkey1');
  });

  it('extracts the pubkey from the legacy string form', () => {
    const secret = JSON.stringify(['P2PK', 'pubkey2']);
    expect(parseP2PKSecret(secret)).toBe('pubkey2');
  });

  it('returns null for non-P2PK secrets', () => {
    expect(parseP2PKSecret(JSON.stringify(['P2SH', 'x']))).toBeNull();
    expect(parseP2PKSecret('not-json')).toBeNull();
  });
});

describe('sumProofAmounts', () => {
  it('sums valid proof amounts', () => {
    const proofs: Proof[] = [
      { id: 'a', amount: 1, secret: 's1', C: 'C1' },
      { id: 'a', amount: 2, secret: 's2', C: 'C2' },
    ];
    expect(sumProofAmounts(proofs)).toBe(3);
  });

  it('ignores invalid amounts', () => {
    const proofs = [
      { id: 'a', amount: 5, secret: 's1', C: 'C1' },
      { id: 'a', amount: -1, secret: 's2', C: 'C2' },
      { id: 'a', amount: 1.5, secret: 's3', C: 'C3' },
    ] as Proof[];
    expect(sumProofAmounts(proofs)).toBe(5);
  });
});
