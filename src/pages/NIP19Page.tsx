import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import NotFound from './NotFound';
import { ProfilePage } from './ProfilePage';

/**
 * Universal route handler for `/:param`.
 *
 * The standalone ₿AO Fund app only resolves profile-shaped identifiers:
 * - NIP-19 `npub1...` / `nprofile1...`
 * - NIP-05 (`user@domain.com`, or bare domains like `fiatjaf.com`)
 * - Raw 64-char hex pubkeys
 *
 * Everything else (notes, events, addresses) 404s — the social feed and
 * post detail views do not exist here.
 */
export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

  if (!identifier) {
    return <NotFound />;
  }

  // NIP-05 identifier (user@domain.com) → profile
  if (identifier.includes('@')) {
    return <ProfilePage />;
  }
  // Bare domain (e.g. "fiatjaf.com") → profile of the root user
  if (identifier.includes('.') && !identifier.startsWith('npub1') && !identifier.startsWith('nprofile1')) {
    return <ProfilePage />;
  }

  // Raw 64-char hex — treat as a pubkey
  if (/^[0-9a-f]{64}$/.test(identifier)) {
    return <ProfilePage />;
  }

  // NIP-19 bech32 — only profile types are supported
  try {
    const { type } = nip19.decode(identifier);
    if (type === 'npub' || type === 'nprofile') {
      return <ProfilePage />;
    }
  } catch {
    // fall through to NotFound
  }

  return <NotFound />;
}
