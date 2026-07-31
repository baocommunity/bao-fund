/**
 * Cloudflare Worker entry — the production home of the escrow operator.
 *
 * Same contract as the Express app (src/app.ts): GET /health, POST /release,
 * permissive CORS (the endpoint is permissionless by design — safety comes
 * from attestation verification and the 2-of-3 deposit locks, not the Origin
 * header). The release logic itself (processEscrowRelease) is shared
 * verbatim; this file is only the fetch-handler wrapper.
 *
 * Why a Worker: the operator must not live on a personal machine, and
 * GitHub Pages (2140.wtf / bao.fund) serves only static files. A Worker is
 * always-on, free-tier, and keeps the key in Cloudflare's encrypted secrets.
 *
 * Config:
 *   ESCROW_PRIVATE_KEY — Worker secret (`wrangler secret put`), 64-hex.
 *
 * Local dev: `npx wrangler dev` · Deploy: `npx wrangler deploy`.
 */

import { getPublicKey } from 'nostr-tools';
import { hexToBytes } from '@noble/curves/utils.js';

import { releaseBodySchema } from './schemas.js';
import { processEscrowRelease, ReleaseError } from './release.js';
import { receiveTokenEntry, sendLockedToken, cosignMultisigProofs } from './cashuOperations.js';
import { verifyAttestationPair } from './nostr.js';
import { decodeToken, isTokenLockedToPubkey, getMultisigDepositInfo } from './cashu.js';

export interface Env {
  ESCROW_PRIVATE_KEY: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      const escrowPubkey = getPublicKey(hexToBytes(env.ESCROW_PRIVATE_KEY.toLowerCase()));
      return json({ status: 'ok', escrowPubkey });
    }

    if (request.method === 'POST' && url.pathname === '/release') {
      let rawBody: unknown;
      try {
        rawBody = await request.json();
      } catch {
        return json({ error: 'Invalid request body' }, 400);
      }
      const parse = releaseBodySchema.safeParse(rawBody);
      if (!parse.success) {
        return json({ error: 'Invalid request body', details: parse.error.format() }, 400);
      }

      const escrowPrivkey = env.ESCROW_PRIVATE_KEY.toLowerCase();
      const escrowPubkey = getPublicKey(hexToBytes(escrowPrivkey));
      try {
        const result = await processEscrowRelease(parse.data, {
          escrowPrivkey,
          escrowPubkey,
          verifyAttestationPair: (hostAttestation, guestAttestation, ctx) =>
            verifyAttestationPair(hostAttestation, guestAttestation, ctx, escrowPrivkey),
          decodeToken,
          isTokenLockedToPubkey,
          receive: receiveTokenEntry,
          send: sendLockedToken,
          getMultisigDepositInfo,
          cosignProofs: (proofs) => cosignMultisigProofs(proofs, escrowPrivkey),
        });
        return json(result);
      } catch (err) {
        if (err instanceof ReleaseError) {
          return json({ error: err.message }, err.statusCode);
        }
        console.error('[release] unexpected error:', err);
        return json({ error: 'Internal server error' }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};
