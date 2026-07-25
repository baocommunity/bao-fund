import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { ReactNode } from 'react';

import type { PetBodyInfo } from '@/lib/petBodies';

import { usePetBodyCompanion } from './usePetBodyCompanion';

// Control the relay response per-test.
const query = vi.fn<(filters: NostrFilter[]) => Promise<NostrEvent[]>>();
vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query } }),
}));

const pk = (ch: string) => ch.repeat(64);

const AGENT = pk('a');
const OWNER = pk('d');

const BODY: PetBodyInfo = {
  agentPubkey: AGENT,
  name: 'Bumble',
  ownerPubkey: OWNER,
  d: 'pets-bumble',
};

/** A valid kind 31124 pet state event declaring an agent body. */
function petEvent(): NostrEvent {
  return {
    id: '1'.repeat(64),
    pubkey: OWNER,
    kind: 31124,
    created_at: 1000,
    tags: [
      ['d', 'pets-bumble'],
      ['b', 'pets:ecosystem:v1'],
      ['agent', AGENT],
      ['name', 'Bumble'],
      ['stage', 'adult'],
      ['state', 'active'],
      ['breed_category', 'buzz'],
      ['last_interaction', '1000'],
    ],
    content: '',
    sig: 'f'.repeat(128),
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('usePetBodyCompanion', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('fetches and parses the pet event for the body', async () => {
    query.mockResolvedValue([petEvent()]);

    const { result } = renderHook(() => usePetBodyCompanion(BODY), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(query).toHaveBeenCalledWith(
      [{ kinds: [31124], authors: [OWNER], '#d': ['pets-bumble'], limit: 1 }],
      expect.anything(),
    );
    expect(result.current.data?.name).toBe('Bumble');
    expect(result.current.data?.stage).toBe('adult');
    expect(result.current.data?.state).toBe('active');
  });

  it('returns null when the relay has no event', async () => {
    query.mockResolvedValue([]);

    const { result } = renderHook(() => usePetBodyCompanion(BODY), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('degrades to null on relay failure (never throws)', async () => {
    query.mockRejectedValue(new Error('relay down'));

    const { result } = renderHook(() => usePetBodyCompanion(BODY), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('does not query without a pet body', () => {
    renderHook(() => usePetBodyCompanion(undefined), { wrapper });
    expect(query).not.toHaveBeenCalled();
  });

  it('does not query while disabled', () => {
    renderHook(() => usePetBodyCompanion(BODY, false), { wrapper });
    expect(query).not.toHaveBeenCalled();
  });
});
