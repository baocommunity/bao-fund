import { getEventHash, verifyEvent, nip44, type Event as NostrEvent } from 'nostr-tools';
import { hexToBytes } from '@noble/curves/utils.js';
import { toXOnlyPubkey } from './cashu.js';

export interface AttestationEvent {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  sig: string;
}

// Attestations ride a REGULAR (stored) kind, not the ephemeral battle-sync
// kind 21124: relays must not store ephemerals, and the winner's hydration
// retrieves the opponent's attestation after the fact.
const BATTLE_ATTESTATION_KIND = 11124;
const BATTLE_ATTESTATION_BINDING_KIND = 21125;
const BATTLE_ATTESTATION_TAG = 'battle-attestation';

export interface AttestationContext {
  battleId: string;
  hostEscrowPubkey: string;
  guestEscrowPubkey: string;
}

export type AttestationVerification =
  | { ok: true; winner: 0 | 1 }
  | { ok: false; reason: string };

interface AttestationPayload {
  type: string;
  battleId: string;
  winner: 0 | 1 | null;
  escrowBinding: AttestationEvent;
}

function hasTag(event: AttestationEvent, name: string, value: string): boolean {
  return (
    Array.isArray(event.tags) &&
    event.tags.some((tag) => Array.isArray(tag) && tag[0] === name && tag[1] === value)
  );
}

function verifyEventSignature(event: AttestationEvent): boolean {
  try {
    if (event.id !== getEventHash(event as NostrEvent)) return false;
    return verifyEvent(event as NostrEvent);
  } catch {
    return false;
  }
}

/**
 * Decrypt an attestation event (NIP-44 to the operator) and return the parsed
 * payload, or null when decryption/parsing fails.
 */
function decryptAttestation(
  event: AttestationEvent,
  operatorPrivkey: string,
): AttestationPayload | null {
  try {
    const conversationKey = nip44.v2.utils.getConversationKey(
      hexToBytes(operatorPrivkey),
      event.pubkey,
    );
    const plaintext = nip44.v2.decrypt(event.content, conversationKey);
    const payload = JSON.parse(plaintext) as AttestationPayload;
    if (
      !payload ||
      typeof payload !== 'object' ||
      payload.type !== 'battle-result-attestation' ||
      typeof payload.battleId !== 'string' ||
      (payload.winner !== 0 && payload.winner !== 1 && payload.winner !== null) ||
      !payload.escrowBinding ||
      typeof payload.escrowBinding !== 'object'
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Verify one player's result attestation:
 * - outer event: kind 11124 attestation (stored), references the battle,
 *   carries the attestation tag, valid Nostr signature
 * - content decrypts to the operator and names this battle + a winner
 * - the embedded escrowBinding is signed by the attester's ESCROW key and
 *   names the outer event's Nostr pubkey + the same outcome — this binds the
 *   Nostr signer to the escrow key named in their deposit lock, so a
 *   sockpuppet Nostr key cannot forge a player's vote (it would need the
 *   victim's escrow private key, which the 2-of-3 deposit locks anchor)
 *
 * Returns the attested winner, or a rejection reason.
 */
function verifyOneAttestation(
  event: AttestationEvent,
  expectedEscrowPubkey: string,
  ctx: AttestationContext,
  operatorPrivkey: string,
  label: string,
): { winner: 0 | 1 | null } | { reason: string } {
  if (event.kind !== BATTLE_ATTESTATION_KIND) return { reason: `${label} attestation has the wrong kind` };
  if (!hasTag(event, 'e', ctx.battleId) || !hasTag(event, 't', BATTLE_ATTESTATION_TAG)) {
    return { reason: `${label} attestation does not reference this battle` };
  }
  if (!verifyEventSignature(event)) {
    return { reason: `${label} attestation has an invalid signature` };
  }

  const payload = decryptAttestation(event, operatorPrivkey);
  if (!payload) return { reason: `${label} attestation could not be decrypted or parsed` };
  if (payload.battleId !== ctx.battleId) {
    return { reason: `${label} attestation names a different battle` };
  }

  const binding = payload.escrowBinding;
  if (binding.kind !== BATTLE_ATTESTATION_BINDING_KIND) {
    return { reason: `${label} attestation binding has the wrong kind` };
  }
  if (!hasTag(binding, 'e', ctx.battleId) || !hasTag(binding, 't', BATTLE_ATTESTATION_TAG)) {
    return { reason: `${label} attestation binding does not reference this battle` };
  }
  if (!verifyEventSignature(binding)) {
    return { reason: `${label} attestation binding has an invalid signature` };
  }

  // The binding must be signed by the ESCROW key this player locked their
  // deposit with — otherwise anyone with a fresh Nostr key could vote for them.
  const expectedXOnly = toXOnlyPubkey(expectedEscrowPubkey);
  if (!expectedXOnly || binding.pubkey !== expectedXOnly) {
    return { reason: `${label} attestation is not bound to the expected escrow key` };
  }

  try {
    const content = JSON.parse(binding.content) as {
      battleId?: string;
      winner?: 0 | 1 | null;
      nostrPubkey?: string;
    };
    if (
      content.battleId !== ctx.battleId ||
      content.winner !== payload.winner ||
      content.nostrPubkey !== event.pubkey
    ) {
      return { reason: `${label} attestation binding does not match the attestation` };
    }
  } catch {
    return { reason: `${label} attestation binding is malformed` };
  }

  return { winner: payload.winner };
}

/**
 * Verify BOTH players' result attestations and return the agreed winner.
 * The operator co-signs a release only when the two agree — a patched host
 * can no longer award itself the pot with a self-signed result, and a loser
 * gains nothing by attesting falsely (a disagreement simply blocks the
 * release until the refund locktimes reclaim both stakes).
 */
export function verifyAttestationPair(
  hostAttestation: AttestationEvent,
  guestAttestation: AttestationEvent,
  ctx: AttestationContext,
  operatorPrivkey: string,
): AttestationVerification {
  const host = verifyOneAttestation(hostAttestation, ctx.hostEscrowPubkey, ctx, operatorPrivkey, 'Host');
  if ('reason' in host) return { ok: false, reason: host.reason };
  const guest = verifyOneAttestation(guestAttestation, ctx.guestEscrowPubkey, ctx, operatorPrivkey, 'Guest');
  if ('reason' in guest) return { ok: false, reason: guest.reason };

  if (host.winner === null || guest.winner === null) {
    return { ok: false, reason: 'A draw was attested — deposits are reclaimed via the refund path' };
  }
  if (host.winner !== guest.winner) {
    return { ok: false, reason: 'Attestations disagree on the winner' };
  }
  return { ok: true, winner: host.winner };
}
