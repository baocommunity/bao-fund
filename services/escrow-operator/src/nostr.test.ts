import { describe, it, expect } from 'vitest';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import { verifyFinishedEvent } from './nostr.js';
import type { FinishedEvent } from './nostr.js';

function signedFinishedEvent(battleId: string): FinishedEvent {
  const sk = generateSecretKey();
  return finalizeEvent(
    {
      kind: 21124,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', battleId],
        ['t', 'battle-sync'],
      ],
      content: 'encrypted-winner-payload',
    },
    sk,
  ) as FinishedEvent;
}

describe('verifyFinishedEvent', () => {
  it('accepts a valid kind 21124 battle-finished event', () => {
    const event = signedFinishedEvent('battle-abc');
    expect(verifyFinishedEvent(event, 'battle-abc')).toBe(true);
  });

  it('rejects an event with the wrong kind', () => {
    const event = signedFinishedEvent('battle-abc');
    expect(verifyFinishedEvent({ ...event, kind: 1 }, 'battle-abc')).toBe(false);
  });

  it('rejects an event missing the battle e-tag', () => {
    const event = signedFinishedEvent('battle-abc');
    const tags = event.tags.filter((t) => t[0] !== 'e');
    expect(verifyFinishedEvent({ ...event, tags }, 'battle-abc')).toBe(false);
  });

  it('rejects an event missing the battle-sync t-tag', () => {
    const event = signedFinishedEvent('battle-abc');
    const tags = event.tags.filter((t) => t[0] !== 't');
    expect(verifyFinishedEvent({ ...event, tags }, 'battle-abc')).toBe(false);
  });

  it('rejects an event with a mismatched battle id', () => {
    const event = signedFinishedEvent('battle-abc');
    expect(verifyFinishedEvent(event, 'battle-xyz')).toBe(false);
  });

  it('rejects an event with an invalid signature', () => {
    const event = signedFinishedEvent('battle-abc');
    event.content = 'tampered-content';
    expect(verifyFinishedEvent(event, 'battle-abc')).toBe(false);
  });
});
