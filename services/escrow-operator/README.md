# Pets Battle Escrow Operator

A tiny Node/Express service that operates the real-sats escrow for 2140 Pets battles.

**Current protocol — 2-of-3 multisig (non-custodial).** Each player locks their
stake to THREE keys — host, guest and operator — with any TWO signatures
required to move it, plus a 24h timelocked refund to the depositor's own key.
The host publishes a signed kind 21124 `battle-finished` event. This service
verifies that event, validates both multisig locks (exact {host, guest,
operator} key set, 2 required signatures, depositor-only refund key, locktime
at least 1h out), then simply CO-SIGNS every deposit proof and returns the
combined witnessed token. The funds never pass through the operator's wallet —
the winner's own key provides the second signature when they receive the token.
If a battle is abandoned, each depositor reclaims their exact stake with their
refund key after the locktime — no operator needed.

**Legacy protocol — single-key custodial (fallback).** Deposits locked to the
operator's pubkey alone are still supported: the service receives both locked
tokens with the operator's private key and returns a new Cashu token locked to
the winner's escrow pubkey. New clients should always use the multisig flow.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ESCROW_PRIVATE_KEY` | yes | 64-character hex Cashu private key for the operator. Must match the `petsBattleEscrowPubkey` configured in the frontend. |
| `PORT` | no | HTTP port. Defaults to `3000`. |

## Endpoints

- `GET /health` — health check. Returns `{ status: 'ok', escrowPubkey }`.
- `POST /release` — release the combined stakes to the winner.
  - Request body:
    ```json
    {
      "battleId": "uuid",
      "winnerPubkey": "...",
      "hostEscrowPubkey": "...",
      "guestEscrowPubkey": "...",
      "hostDepositToken": "cashuA...",
      "guestDepositToken": "cashuA...",
      "finishedEvent": { "id": "...", "pubkey": "...", "kind": 21124, "created_at": 0, "tags": [["e", "battleId"], ["t", "battle-sync"]], "content": "...", "sig": "..." }
    }
    ```
  - Success: `{ "token": "cashuA..." }` — for multisig deposits, the combined deposit proofs carrying the operator's witness signature (the winner adds theirs at receive); for legacy deposits, a fresh token locked to `winnerPubkey`.
  - Failure: `{ "error": "..." }` with a 4xx/5xx status. A deposit inside the 1h refund-locktime margin is refused — use the refund path instead.

## Local development

Install dependencies:

```bash
cd services/escrow-operator
npm install
```

Copy the example environment file and start the server:

```bash
cp .env.example .env
npm run dev
```

The server will start on `http://localhost:3000`.

## Local key pair

Generate a fresh throwaway key pair for local development. **Never commit a
real key and never reuse a development key in production.**

```bash
# Private key (keep it in your local .env only):
openssl rand -hex 32

# Derive the matching pubkey:
node --input-type=module -e "
import { getPublicKey } from 'nostr-tools';
import { hexToBytes } from '@noble/curves/utils.js';
console.log(getPublicKey(hexToBytes('<your-64-hex-private-key>')));
"
```

Set `petsBattleEscrowPubkey` to the derived pubkey and
`petsBattleEscrowServiceUrl` to `http://localhost:3000` in the frontend config.

> The production operator key lives ONLY in the deployment environment
> (server-local `.env`). The frontend learns the production pubkey via the
> `VITE_PETS_BATTLE_ESCROW_PUBKEY` GitHub Actions variable at build time.

## Tests

```bash
npm test
```

## Typecheck

```bash
npx tsc --noEmit
```

## Build

```bash
npm run build
```

Compiled output is written to `dist/`.

## Frontend integration

The frontend's `requestEscrowRelease` now POSTs to `{serviceUrl}/release` and
includes `hostEscrowPubkey` and `guestEscrowPubkey` in the request body so the
operator can confirm the winner is one of the two battle participants.
