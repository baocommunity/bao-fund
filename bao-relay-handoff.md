# bao-relay handoff: allow kind 11124 (battle result attestations) + confirm production URL

For the session owning the bao relay / relay infra (`src/lib/appRelays.ts`,
relay.bao.network deployment). Written 2026-07-31 from the bao_fund app side
after shipping mutual battle-result attestation (bao b364e8a + b756c8c,
2140 82e7ca3e7 + 7b9b13196).

## What changed app-side

Pet-battle escrow now resolves automatically: when a battle ends, BOTH players
publish a signed **result attestation** and the escrow operator co-signs the
winner's claim only when the two attestations agree. Attestations must be
retrievable after the fact (the winner's app hydrates the opponent's
attestation from relays when it next opens), so they ride a **regular,
stored kind**:

- **kind `11124`** — battle result attestation (`BATTLE_ATTESTATION_KIND` in
  `src/pets/battle/lib/battleMessages.ts`). Tags: `e` = battle id,
  `t` = `battle-attestation`, `p` = opponent. Content is NIP-44-encrypted to
  the escrow operator (relays store it but cannot read it).
- The app **pins every attestation to `wss://relay.bao.network/`**
  (`BATTLE_ATTESTATION_RELAY`, same file) regardless of the user's relay
  settings, and hydration queries that relay in addition to the user's pool.
  Publish failure there is non-fatal but logged.

(For completeness: kind `21124` remains the live battle-sync ephemeral — no
storage needed. Kind `21125` is the escrow-key binding but it is only ever
*embedded inside* the 11124 payload, never published on its own — no relay
policy needed for it.)

## Ask 1: whitelist kind 11124

If relay.bao.network runs a kind whitelist (accepted-kinds list), **add kind
11124**. If it accepts all kinds, nothing to do — a quick confirmation is
still appreciated, because an attestation silently rejected at the rendezvous
relay degrades claims to the 24h refund path with no user-visible error.

Verification after the change (any Nostr key works; the content can be junk
for a policy check — the relay should ACCEPT it, not return OK:false):

```bash
# publish a kind-11124 test event to wss://relay.bao.network/ and expect an
# OK:true acceptance (e.g. with nak: nak event --kind 11124 --tag t=battle-attestation wss://relay.bao.network/)
```

## Ask 2: confirm the production rendezvous URL

The app pins attestations to `wss://relay.bao.network/`. Two open questions
before mainnet:

1. **Is `wss://relay.bao.network/` the URL that will exist in production?**
   Today the same URL appears in `appRelays.ts` as `BAO_TEST_RELAY_URL`,
   gated to dev builds / `VITE_BAO_TEST_RELAY=true`, with a "MUST NOT ship to
   production mainnet" comment (test-traffic accumulation). The attestation
   pin is NOT dev-gated — it always publishes there. If the production
   rendezvous will be a different relay (e.g. a dedicated pets/escrow relay,
   per the existing "remove once a dedicated pets relay is deployed" note),
   tell us the URL and we update `BATTLE_ATTESTATION_RELAY` in both repos.
2. **Policy at mainnet:** attestations are small (~1–2 KB encrypted), low
   volume (2 per battle), and MUST be stored for at least the 24h refund
   window — a retention policy that prunes them sooner would break
   after-the-fact claims. If the relay prunes aggressively, flag it.

## Ownership boundary

App side (this repo + 2140wtf) is complete and shipped. `src/lib/appRelays.ts`
and the relay.bao.network deployment/policy are owned by the relay session —
this doc is the coordination point; the app repos do not touch them.
