import { z } from 'zod';

// Strict CSP (no 'unsafe-eval' in script-src): tell zod to run jitless so it
// skips its `new Function` eval feature-probe. The probe is wrapped in
// try/catch and harmless functionally, but the CSP violation spams the console
// (and would flood Sentry with bogus reports once reporting is enabled).
//
// MUST be a side-effect module imported first in main.tsx: zod reads the flag
// at schema-construction time (z.object({...}) at module scope), and ESM
// imports are hoisted — a config call inside main.tsx's body would run too
// late, after every statically imported module already built its schemas.
z.config({ jitless: true });
