import express from 'express';
import type { EscrowConfig } from './config.js';
import { releaseBodySchema } from './schemas.js';
import { processEscrowRelease, ReleaseError } from './release.js';
import { receiveTokenEntry, sendLockedToken, cosignMultisigProofs } from './cashuOperations.js';
import { verifyAttestationPair } from './nostr.js';
import { decodeToken, isTokenLockedToPubkey, getMultisigDepositInfo } from './cashu.js';

export function buildApp(config: EscrowConfig): express.Express {
  const app = express();
  app.use(express.json());

  // CORS: browsers call /release cross-origin (GitHub Pages apps, vite dev
  // servers) with Content-Type: application/json, which triggers a preflight.
  // The endpoint is permissionless — safety comes from attestation
  // verification and the 2-of-3 deposit locks, not the Origin header — so
  // any origin may call it.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', escrowPubkey: config.escrowPubkey });
  });

  app.post('/release', async (req, res) => {
    const parse = releaseBodySchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parse.error.format(),
      });
      return;
    }

    try {
      const result = await processEscrowRelease(parse.data, {
        escrowPrivkey: config.escrowPrivkey,
        escrowPubkey: config.escrowPubkey,
        verifyAttestationPair: (hostAttestation, guestAttestation, ctx) =>
          verifyAttestationPair(hostAttestation, guestAttestation, ctx, config.escrowPrivkey),
        decodeToken,
        isTokenLockedToPubkey,
        receive: receiveTokenEntry,
        send: sendLockedToken,
        getMultisigDepositInfo,
        cosignProofs: (proofs) => cosignMultisigProofs(proofs, config.escrowPrivkey),
      });
      res.json(result);
    } catch (err) {
      if (err instanceof ReleaseError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error('[release] unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return app;
}
