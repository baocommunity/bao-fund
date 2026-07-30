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
