import { describe, it, expect } from 'vitest';
import worker from './worker.js';

// Node 22 has global Request/Response (undici), so the Worker fetch handler
// is testable without miniflare. The release logic itself is covered by
// release.test.ts; this file covers the handler contract: routes, CORS,
// schema validation, error mapping.

const PRIV = '1'.repeat(64);
const env = { ESCROW_PRIVATE_KEY: PRIV };

describe('worker fetch handler', () => {
  it('GET /health returns ok + derived pubkey with CORS headers', async () => {
    const res = await worker.fetch(new Request('https://x/health'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = (await res.json()) as { status: string; escrowPubkey: string };
    expect(body.status).toBe('ok');
    expect(body.escrowPubkey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('answers the browser preflight', async () => {
    const res = await worker.fetch(
      new Request('https://x/release', {
        method: 'OPTIONS',
        headers: { Origin: 'https://2140.wtf' },
      }),
      env,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('rejects an invalid /release body with 400 + details (attestation contract)', async () => {
    const res = await worker.fetch(
      new Request('https://x/release', { method: 'POST', body: '{}' }),
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: Record<string, unknown> };
    expect(body.error).toBe('Invalid request body');
    expect(body.details).toHaveProperty('hostAttestation');
    expect(body.details).toHaveProperty('guestAttestation');
  });

  it('404s unknown routes', async () => {
    const res = await worker.fetch(new Request('https://x/nope'), env);
    expect(res.status).toBe(404);
  });
});
