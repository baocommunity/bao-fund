import { getEventHash, verifyEvent, type Event as NostrEvent } from 'nostr-tools';

export interface FinishedEvent {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  sig: string;
}

const BATTLE_SYNC_KIND = 21124;

/**
 * Verify that a kind 21124 battle-finished event is structurally valid,
 * references the expected battle, carries the battle-sync tag, and has a
 * valid Nostr signature.
 *
 * The event content is NIP-44 encrypted between the players; the operator
 * does not possess the decryption key, so content is not inspected.
 */
export function verifyFinishedEvent(event: FinishedEvent, battleId: string): boolean {
  if (event.kind !== BATTLE_SYNC_KIND) return false;
  if (!Array.isArray(event.tags)) return false;

  const hasBattleRef = event.tags.some(
    (tag) => Array.isArray(tag) && tag[0] === 'e' && tag[1] === battleId,
  );
  const hasSyncTag = event.tags.some(
    (tag) => Array.isArray(tag) && tag[0] === 't' && tag[1] === 'battle-sync',
  );

  if (!hasBattleRef || !hasSyncTag) return false;

  try {
    if (event.id !== getEventHash(event as NostrEvent)) return false;
    return verifyEvent(event as NostrEvent);
  } catch {
    return false;
  }
}
