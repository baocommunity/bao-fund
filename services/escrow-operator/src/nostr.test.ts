import { describe, it, expect } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, nip44 } from 'nostr-tools';
import { bytesToHex } from '@noble/curves/utils.js';
import { verifyAttestationPair, type AttestationEvent } from './nostr.js';

const BATTLE_ID = 'battle-abc';

const operatorSk = generateSecretKey();
const operatorPrivkey = bytesToHex(operatorSk);
const operatorPubkey = getPublicKey(operatorSk);

const hostNostrSk = generateSecretKey();
const guestNostrSk = generateSecretKey();
const hostEscrowSk = generateSecretKey();
const guestEscrowSk = generateSecretKey();
const hostEscrowPubkey = getPublicKey(hostEscrowSk);
const guestEscrowPubkey = getPublicKey(guestEscrowSk);

const ctx = {
  battleId: BATTLE_ID,
  hostEscrowPubkey,
  guestEscrowPubkey,
};

function makeAttestation(args: {
  battleId?: string;
  winner: 0 | 1 | null;
  nostrSk: Uint8Array;
  escrowSk: Uint8Array;
  /** Encrypt to someone other than the operator (undecryptable). */
  recipientPubkey?: string;
  /** Override the binding's content fields (mismatch attacks). */
  bindingContent?: { battleId?: string; winner?: 0 | 1 | null; nostrPubkey?: string };
  /** Override the outer event's tags/kind. */
  kind?: number;
  tags?: string[][];
}): AttestationEvent {
  const battleId = args.battleId ?? BATTLE_ID;
  const nostrPubkey = getPublicKey(args.nostrSk);
  const binding = finalizeEvent(
    {
      kind: 21125,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', battleId],
        ['t', 'battle-attestation'],
      ],
      content: JSON.stringify({
        battleId: args.bindingContent?.battleId ?? battleId,
        winner: args.bindingContent && 'winner' in args.bindingContent ? args.bindingContent.winner : args.winner,
        nostrPubkey: args.bindingContent?.nostrPubkey ?? nostrPubkey,
      }),
    },
    args.escrowSk,
  );
  const payload = {
    type: 'battle-result-attestation',
    battleId,
    winner: args.winner,
    escrowBinding: binding,
  };
  const conversationKey = nip44.v2.utils.getConversationKey(
    args.nostrSk,
    args.recipientPubkey ?? operatorPubkey,
  );
  const content = nip44.v2.encrypt(JSON.stringify(payload), conversationKey);
  return finalizeEvent(
    {
      kind: args.kind ?? 21124,
      created_at: Math.floor(Date.now() / 1000),
      tags: args.tags ?? [
        ['e', battleId],
        ['t', 'battle-attestation'],
      ],
      content,
    },
    args.nostrSk,
  ) as AttestationEvent;
}

function hostAttestation(winner: 0 | 1 | null, overrides = {}) {
  return makeAttestation({ winner, nostrSk: hostNostrSk, escrowSk: hostEscrowSk, ...overrides });
}
function guestAttestation(winner: 0 | 1 | null, overrides = {}) {
  return makeAttestation({ winner, nostrSk: guestNostrSk, escrowSk: guestEscrowSk, ...overrides });
}

describe('verifyAttestationPair', () => {
  it('accepts an agreeing pair attesting a host win', () => {
    const result = verifyAttestationPair(hostAttestation(0), guestAttestation(0), ctx, operatorPrivkey);
    expect(result).toEqual({ ok: true, winner: 0 });
  });

  it('accepts an agreeing pair attesting a guest win', () => {
    const result = verifyAttestationPair(hostAttestation(1), guestAttestation(1), ctx, operatorPrivkey);
    expect(result).toEqual({ ok: true, winner: 1 });
  });

  it('rejects a disagreement (client matches /disagree/i to retry)', () => {
    const result = verifyAttestationPair(hostAttestation(0), guestAttestation(1), ctx, operatorPrivkey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/disagree/i);
  });

  it('rejects an attested draw — refunds, never a release', () => {
    const result = verifyAttestationPair(hostAttestation(null), guestAttestation(null), ctx, operatorPrivkey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/draw/i);
  });

  it('rejects an attestation with the wrong kind', () => {
    const result = verifyAttestationPair(hostAttestation(0, { kind: 1 }), guestAttestation(0), ctx, operatorPrivkey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/wrong kind/i);
  });

  it('rejects an attestation missing the attestation tag', () => {
    const result = verifyAttestationPair(
      hostAttestation(0, { tags: [['e', BATTLE_ID], ['t', 'battle-sync']] }),
      guestAttestation(0),
      ctx,
      operatorPrivkey,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/does not reference this battle/i);
  });

  it('rejects an attestation for a different battle', () => {
    const result = verifyAttestationPair(
      hostAttestation(0, { battleId: 'battle-xyz' }),
      guestAttestation(0),
      ctx,
      operatorPrivkey,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/does not reference this battle/i);
  });

  it('rejects a tampered outer event (invalid signature)', () => {
    const att = hostAttestation(0);
    att.content = att.content.slice(0, -2) + 'aa';
    const result = verifyAttestationPair(att, guestAttestation(0), ctx, operatorPrivkey);
    expect(result.ok).toBe(false);
  });

  it('rejects an attestation not decryptable by the operator', () => {
    const result = verifyAttestationPair(
      hostAttestation(0, { recipientPubkey: getPublicKey(generateSecretKey()) }),
      guestAttestation(0),
      ctx,
      operatorPrivkey,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/could not be decrypted/i);
  });

  it('rejects a sockpuppet: binding not signed by the expected escrow key', () => {
    // A patched host forges the guest's vote with a fresh Nostr key — but the
    // binding must be signed by the GUEST's escrow key, which the attacker
    // does not control (the deposit locks anchor it).
    const forgery = makeAttestation({ winner: 0, nostrSk: generateSecretKey(), escrowSk: generateSecretKey() });
    const result = verifyAttestationPair(hostAttestation(0), forgery, ctx, operatorPrivkey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not bound to the expected escrow key/i);
  });

  it('rejects a binding whose content disagrees with the payload', () => {
    const result = verifyAttestationPair(
      hostAttestation(0, { bindingContent: { winner: 1 } }),
      guestAttestation(0),
      ctx,
      operatorPrivkey,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/does not match the attestation/i);
  });

  it('rejects a binding naming a different nostr pubkey', () => {
    const result = verifyAttestationPair(
      hostAttestation(0, { bindingContent: { nostrPubkey: getPublicKey(generateSecretKey()) } }),
      guestAttestation(0),
      ctx,
      operatorPrivkey,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/does not match the attestation/i);
  });
});
