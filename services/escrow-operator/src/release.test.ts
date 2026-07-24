import { describe, it, expect } from 'vitest';
import { getDecodedToken, type Proof } from '@cashu/cashu-ts';
import { processEscrowRelease, ReleaseError } from './release.js';
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
