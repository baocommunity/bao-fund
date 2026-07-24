# Pets Battle Escrow Operator

A tiny Node/Express service that operates the real-sats escrow for 2140 Pets battles.

Both players lock their stake as a Cashu P2PK token to the operator's pubkey. The
host publishes a signed kind 21124 `battle-finished` event. This service verifies
that event, receives both locked tokens with the operator's private key, and
returns a new Cashu token locked to the winner's escrow pubkey.

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
  - Success: `{ "token": "cashuA..." }` locked to `winnerPubkey`.
  - Failure: `{ "error": "..." }` with a 4xx/5xx status.

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

## Throwaway local key pair

For local development only, you can use this throwaway key pair. **Never use it
in production.**

```text
ESCROW_PRIVATE_KEY=8396c3de93a52121f4f7b24a7212f5d1ffafd1d2977cb21fbe10ee539e674854
ESCROW_PUBKEY=2f3e35da15902d7ccb8d27ff77f29018008308953ba9d781ee6c3370e3273761
```

Set `petsBattleEscrowPubkey` to the pubkey above and `petsBattleEscrowServiceUrl`
to `http://localhost:3000` in the frontend config.

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
