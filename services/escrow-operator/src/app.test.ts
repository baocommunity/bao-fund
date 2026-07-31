import { describe, it, expect, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { buildApp } from './app.js';

// The browser apps call the operator cross-origin (GitHub Pages, vite dev);
// without CORS headers + an OPTIONS preflight answer every call fails before
// it reaches the handler.
describe('CORS', () => {
  const config = {
    port: 0,
    escrowPrivkey: '0'.repeat(63) + '1',
    escrowPubkey: '0'.repeat(63) + '2',
  };
  let server: Server;
  let base: string;

  async function start(): Promise<void> {
    const app = buildApp(config);
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('no addr');
    base = `http://127.0.0.1:${addr.port}`;
  }

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('answers the preflight with permissive CORS headers', async () => {
    await start();
    const res = await fetch(`${base}/release`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://baocommunity.github.io',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-headers')).toMatch(/content-type/i);
  });

  it('includes the allow-origin header on real responses', async () => {
    const health = await fetch(`${base}/health`, {
      headers: { Origin: 'http://localhost:3525' },
    });
    expect(health.headers.get('access-control-allow-origin')).toBe('*');

    const release = await fetch(`${base}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://2140.wtf' },
      body: '{}',
    });
    expect(release.status).toBe(400); // invalid body — but CORS must still be there
    expect(release.headers.get('access-control-allow-origin')).toBe('*');
  });
});
