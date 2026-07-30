import { describe, it, expect } from 'vitest';
import { getDecodedToken, getEncodedToken, type Proof } from '@cashu/cashu-ts';
import { schnorr } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/curves/utils.js';
import { signP2PKProofs } from '@cashu/cashu-ts/crypto/client/NUT11';
import { processEscrowRelease, ReleaseError } from './release.js';
import { decodeToken, getMultisigDepositInfo } from './cashu.js';
import { cosignMultisigProofs } from './cashuOperations.js';
import type { DecodedTokenEntry } from './types.js';
import type { FinishedEvent } from './nostr.js';

const operatorPubkey = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';
const hostPubkey = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const guestPubkey = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
const mintUrl = 'https://mint.example.com';

function decodedSecret(tokenStr: string): string {
  const decoded = getDecodedToken(tokenStr) as { proofs: Array<{ secret: string }> };
  return decoded.proofs[0]?.secret ?? '';
}

function proof(secret: string, amount = 10): Proof {
  return { id: 'ksid', amount, secret, C: 'C' };
}

function lockedToken(which: 'host' | 'guest'): string {
  return `locked-${which}`;
}

function mockFinishedEvent(): FinishedEvent {
  return {
    id: 'event-id',
    pubkey: 'host-nostr-pubkey',
    kind: 21124,
    created_at: 1,
    tags: [
      ['e', 'battle-123'],
      ['t', 'battle-sync'],
    ],
    content: 'encrypted',
    sig: 'sig',
  };
}

function mockDeps(overrides: Partial<Parameters<typeof processEscrowRelease>[1]> = {}) {
  const lockedSecret = JSON.stringify(['P2PK', { data: operatorPubkey }]);
  return {
    escrowPrivkey: '0011'.repeat(16),
    escrowPubkey: operatorPubkey,
    verifyFinishedEvent: () => true,
    decodeToken: (tokenStr: string): DecodedTokenEntry[] => {
      return [
        {
          mintUrl,
          proofs: [proof(lockedSecret, tokenStr === lockedToken('host') ? 10 : 10)],
          amount: 10,
        },
      ];
    },
    isTokenLockedToPubkey: (tokenStr: string, pubkey: string) =>
      tokenStr.startsWith('locked-') && pubkey === operatorPubkey,
    getMultisigDepositInfo: () => null,
    cosignProofs: (proofs: Proof[]) => proofs,
    receive: async () => [proof('received', 10)],
    send: async (_mintUrl: string, amount: number, _proofs: Proof[], recipientPubkey: string) => ({
      send: [proof(`sent-to-${recipientPubkey}`, amount)],
      keep: [],
    }),
    ...overrides,
  };
}

function baseArgs(winner = hostPubkey): Parameters<typeof processEscrowRelease>[0] {
  return {
    battleId: 'battle-123',
    winnerPubkey: winner,
    hostEscrowPubkey: hostPubkey,
    guestEscrowPubkey: guestPubkey,
    hostDepositToken: lockedToken('host'),
    guestDepositToken: lockedToken('guest'),
    finishedEvent: mockFinishedEvent(),
  };
}

describe('processEscrowRelease', () => {
  it('returns a token locked to the host winner', async () => {
    const result = await processEscrowRelease(baseArgs(hostPubkey), mockDeps());
    expect(decodedSecret(result.token)).toContain(`sent-to-${hostPubkey}`);
  });

  it('returns a token locked to the guest winner', async () => {
    const result = await processEscrowRelease(baseArgs(guestPubkey), mockDeps());
    expect(decodedSecret(result.token)).toContain(`sent-to-${guestPubkey}`);
  });

  it('rejects a winner that is not a participant', async () => {
    await expect(
      processEscrowRelease(baseArgs('00'.repeat(32)), mockDeps()),
    ).rejects.toBeInstanceOf(ReleaseError);
  });

  it('rejects an invalid battle-finished event', async () => {
    const deps = mockDeps({ verifyFinishedEvent: () => false });
    await expect(processEscrowRelease(baseArgs(), deps)).rejects.toBeInstanceOf(ReleaseError);
  });

  it('rejects a host deposit token not locked to escrow', async () => {
    const deps = mockDeps({
      isTokenLockedToPubkey: (token: string, pubkey: string) =>
        token !== lockedToken('host') && pubkey === operatorPubkey,
    });
    await expect(processEscrowRelease(baseArgs(), deps)).rejects.toBeInstanceOf(ReleaseError);
  });

  it('rejects a guest deposit token not locked to escrow', async () => {
    const deps = mockDeps({
      isTokenLockedToPubkey: (token: string, pubkey: string) =>
        token !== lockedToken('guest') && pubkey === operatorPubkey,
    });
    await expect(processEscrowRelease(baseArgs(), deps)).rejects.toBeInstanceOf(ReleaseError);
  });

  it('rejects deposit tokens with mismatched mints', async () => {
    const deps = mockDeps({
      decodeToken: (tokenStr: string): DecodedTokenEntry[] => [
        {
          mintUrl: tokenStr === lockedToken('host') ? 'https://host.mint' : 'https://guest.mint',
          proofs: [proof(JSON.stringify(['P2PK', { data: operatorPubkey }]))],
          amount: 10,
        },
      ],
    });
    await expect(processEscrowRelease(baseArgs(), deps)).rejects.toBeInstanceOf(ReleaseError);
  });

  it('rejects multi-entry deposit tokens', async () => {
    const deps = mockDeps({
      decodeToken: (): DecodedTokenEntry[] => [
        { mintUrl, proofs: [proof('a')], amount: 5 },
        { mintUrl, proofs: [proof('b')], amount: 5 },
      ],
    });
    await expect(processEscrowRelease(baseArgs(), deps)).rejects.toBeInstanceOf(ReleaseError);
  });

  it('sends the combined amount to the winner', async () => {
    let sentAmount = 0;
    let sentRecipient = '';
    const deps = mockDeps({
      receive: async () => [proof('received', 13)],
      send: async (_mintUrl: string, amount: number, _proofs: Proof[], recipientPubkey: string) => {
        sentAmount = amount;
        sentRecipient = recipientPubkey;
        return { send: [proof(`sent-to-${recipientPubkey}`, amount)], keep: [] };
      },
    });
    await processEscrowRelease(baseArgs(guestPubkey), deps);
    expect(sentRecipient).toBe(guestPubkey);
    expect(sentAmount).toBe(26);
  });
});

describe('processEscrowRelease: 2-of-3 multisig co-sign (non-custodial)', () => {
  // Deterministic real keys so the crypto path can run for real.
  const priv = (n: number) => bytesToHex(Uint8Array.from({ length: 32 }, () => n));
  const xonly = (privkey: string) => bytesToHex(schnorr.getPublicKey(hexToBytes(privkey)));
  const operatorPriv = priv(9);
  const hostPriv = priv(1);
  const guestPriv = priv(2);
  const operatorX = xonly(operatorPriv);
  const hostX = xonly(hostPriv);
  const guestX = xonly(guestPriv);
  const FAR_FUTURE = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

  /** Build the exact secret shape the client's buildMultisigEscrowLock emits. */
  function multisigSecret(opts: {
    keys?: string[];
    nSigs?: number;
    refund?: string[];
    locktime?: number;
  } = {}): string {
    const keys = [...(opts.keys ?? [hostX, guestX, operatorX])].sort();
    const tags: string[][] = [['pubkeys', ...keys.slice(1).map((k) => `02${k}`)]];
    const nSigs = opts.nSigs ?? 2;
    if (nSigs > 1) tags.push(['n_sigs', String(nSigs)]);
    if (opts.refund?.length) tags.push(['refund', ...opts.refund.map((k) => `02${k}`)]);
    tags.push(['locktime', String(opts.locktime ?? FAR_FUTURE)]);
    return JSON.stringify(['P2PK', { nonce: 'ab'.repeat(16), data: `02${keys[0]}`, tags }]);
  }

  function multisigToken(secret: string, amount = 10): string {
    return getEncodedToken({ mint: mintUrl, proofs: [proof(secret, amount)], unit: 'sat' });
  }

  function multisigArgs(winner = hostX, hostSecret = multisigSecret({ refund: [hostX] }), guestSecret = multisigSecret({ refund: [guestX] })) {
    return {
      ...baseArgs(winner),
      hostEscrowPubkey: hostX,
      guestEscrowPubkey: guestX,
      hostDepositToken: multisigToken(hostSecret),
      guestDepositToken: multisigToken(guestSecret),
    };
  }

  function multisigDeps(overrides: Partial<Parameters<typeof processEscrowRelease>[1]> = {}) {
    return mockDeps({
      escrowPubkey: operatorX,
      escrowPrivkey: operatorPriv,
      decodeToken,
      getMultisigDepositInfo,
      isTokenLockedToPubkey: () => false,
      receive: async () => {
        throw new Error('custodial receive must not run for multisig deposits');
      },
      send: async () => {
        throw new Error('custodial send must not run for multisig deposits');
      },
      cosignProofs: (proofs: Proof[]) => cosignMultisigProofs(proofs, operatorPriv),
      ...overrides,
    });
  }

  function decodedProofs(token: string): Array<{ secret: string; witness?: unknown }> {
    return (getDecodedToken(token) as { proofs: Array<{ secret: string; witness?: unknown }> }).proofs;
  }

  /** Witness may be a JSON string or an object depending on the code path. */
  function witnessSigs(witness: unknown): string[] {
    const w = typeof witness === 'string' ? JSON.parse(witness) : witness;
    return ((w ?? {}) as { signatures?: string[] }).signatures ?? [];
  }

  it('co-signs both deposits and returns the combined witnessed token — no custody', async () => {
    const result = await processEscrowRelease(multisigArgs(), multisigDeps());
    const proofs = decodedProofs(result.token);
    expect(proofs).toHaveLength(2);
    for (const p of proofs) {
      expect(p.witness).toBeDefined();
      expect(witnessSigs(p.witness)).toHaveLength(1); // operator's sig only
    }
  });

  it('the winner completes the 2-of-3 with their own key; a stranger cannot', async () => {
    const result = await processEscrowRelease(multisigArgs(hostX), multisigDeps());
    const proofs = decodedProofs(result.token) as unknown as Proof[];
    const completed = signP2PKProofs(proofs, hostPriv, true);
    for (const p of completed) {
      const sigs = witnessSigs(p.witness);
      expect(sigs).toHaveLength(2);
      expect(new Set(sigs).size).toBe(2);
    }
    expect(() => signP2PKProofs(proofs, priv(7), true)).toThrow();
  });

  it('rejects a mixed-scheme pair (multisig + legacy)', async () => {
    const args = multisigArgs();
    args.guestDepositToken = getEncodedToken({
      mint: mintUrl,
      proofs: [proof(JSON.stringify(['P2PK', { nonce: 'cd'.repeat(16), data: `02${operatorX}`, tags: [] }]), 10)],
      unit: 'sat',
    });
    await expect(processEscrowRelease(args, multisigDeps())).rejects.toThrow(/different escrow schemes/);
  });

  it('rejects a lock whose key set is not {host, guest, operator}', async () => {
    const strangerX = xonly(priv(7));
    const hostSecret = multisigSecret({ keys: [hostX, guestX, strangerX], refund: [hostX] });
    await expect(
      processEscrowRelease(multisigArgs(hostX, hostSecret), multisigDeps()),
    ).rejects.toThrow(/key set/);
  });

  it('rejects a deposit whose refund key is not the depositor', async () => {
    const hostSecret = multisigSecret({ refund: [guestX] }); // host deposit, guest refund
    await expect(
      processEscrowRelease(multisigArgs(hostX, hostSecret), multisigDeps()),
    ).rejects.toThrow(/refund key/);
  });

  it('refuses to co-sign inside the refund-locktime margin', async () => {
    const soon = Math.floor(Date.now() / 1000) + 30 * 60; // 30 min < 1h margin
    const hostSecret = multisigSecret({ refund: [hostX], locktime: soon });
    await expect(
      processEscrowRelease(multisigArgs(hostX, hostSecret), multisigDeps()),
    ).rejects.toThrow(/locktime/);
  });

  it('rejects multisig deposits from mismatched mints', async () => {
    const args = multisigArgs();
    args.guestDepositToken = getEncodedToken({
      mint: 'https://other.mint.example.com',
      proofs: [proof(multisigSecret({ refund: [guestX] }), 10)],
      unit: 'sat',
    });
    await expect(processEscrowRelease(args, multisigDeps())).rejects.toThrow(/same mint/);
  });

  it('surfaces a co-sign failure as a 500, never a silent fallback', async () => {
    const deps = multisigDeps({
      cosignProofs: () => {
        throw new Error('operator key not in lock');
      },
    });
    await expect(processEscrowRelease(multisigArgs(), deps)).rejects.toMatchObject({ statusCode: 500 });
  });
});
