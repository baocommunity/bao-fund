import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import type { PetBodyInfo } from '@/lib/petBodies';
import { KIND_PETS_STATE, parsePetsEvent, type PetsCompanion } from '@/pets/core/lib/pets';

/** Per-fetch relay timeout. */
const PET_BODY_COMPANION_TIMEOUT = 10_000;

/**
 * Fetch the full pet state (kind 31124) behind an agent's pet body and parse
 * it into a `PetsCompanion`, for the read-only pet profile dialog.
 *
 * `useAgentBodyPets` only gives the lightweight `PetBodyInfo` (name, picture,
 * owner, d) — the dialog needs the whole event (stage, stats, visual traits)
 * to render the pet's body via `PetsStageVisual`. Kind 31124 is addressable,
 * so the event is fetched directly by `{ authors: [ownerPubkey], '#d': [d] }`.
 *
 * Relay failures degrade to `null` — the dialog renders a placeholder.
 */
export function usePetBodyCompanion(petBody: PetBodyInfo | undefined, enabled = true) {
  const { nostr } = useNostr();

  return useQuery<PetsCompanion | null>({
    queryKey: ['pet-body-companion', petBody?.ownerPubkey, petBody?.d],
    queryFn: async ({ signal }) => {
      if (!petBody) return null;
      try {
        const events = await nostr.query(
          [{
            kinds: [KIND_PETS_STATE],
            authors: [petBody.ownerPubkey],
            '#d': [petBody.d],
            limit: 1,
          }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(PET_BODY_COMPANION_TIMEOUT)]) },
        );
        const event = events[0];
        return event ? (parsePetsEvent(event) ?? null) : null;
      } catch (err) {
        console.warn('Failed to fetch pet body companion:', err);
        return null;
      }
    },
    enabled: enabled && Boolean(petBody),
    staleTime: 60_000, // 1 minute — pet state changes on care actions
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
