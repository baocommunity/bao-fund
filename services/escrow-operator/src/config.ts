import { getPublicKey } from 'nostr-tools';
import { hexToBytes } from '@noble/curves/utils.js';

export interface EscrowConfig {
  port: number;
  escrowPrivkey: string;
  escrowPubkey: string;
}

/**
 * Load operator configuration from environment variables.
 *
 * Required:
 *   - ESCROW_PRIVATE_KEY: 64-character hex Cashu private key for the operator.
 *
 * Optional:
 *   - PORT: HTTP port (default 3000).
 */
export function loadConfig(): EscrowConfig {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT must be a valid TCP port number');
  }

  const rawPriv = process.env.ESCROW_PRIVATE_KEY;
  if (!rawPriv || !/^[0-9a-fA-F]{64}$/.test(rawPriv)) {
    throw new Error('ESCROW_PRIVATE_KEY must be a 64-character hex Cashu private key');
  }

  const escrowPrivkey = rawPriv.toLowerCase();
  const escrowPubkey = getPublicKey(hexToBytes(escrowPrivkey));

  return { port, escrowPrivkey, escrowPubkey };
}
