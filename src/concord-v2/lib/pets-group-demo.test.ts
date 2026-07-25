/**
 * Pets-in-₿AO-chat live demo (NOT part of the normal test suite).
 *
 * Run explicitly with:
 *   PETS_GROUP_DEMO=1 npx vitest run src/concord-v2/lib/pets-group-demo.test.ts
 *
 * Creates a Concord V2 community on the bao test relay with three pet-agent
 * accounts (Buzz pets), has them discuss in #general, and writes the invite
 * link + pet keys to pets-group-demo.txt at the repo root so Bob can open the
 * link in the dev app, join the group, and watch the pets' conversation with
 * their paw badges and pet avatars.
 *
 * Skipped unless PETS_GROUP_DEMO=1 — it publishes to a real relay.
 */

import { getConversationKey } from "nostr-tools/nip44";
import { decrypt as nip44Decrypt, encrypt as nip44Encrypt } from "nostr-tools/nip44";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import type { EventTemplate, NostrEvent } from "nostr-tools/pure";
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { foldTimeline, openChatBatch } from "@/concord-v2/lib/chat";
import { channelsView, mintCommunity } from "@/concord-v2/lib/community";
import { rehydrateCommunity } from "@/concord-v2/lib/communityList";
import {
  buildChannelEdition,
  buildMetadataEdition,
  controlGroups,
  currentControlGroup,
  foldControlState,
  openControlWraps,
  sealEdition,
} from "@/concord-v2/lib/control";
import { bytesToHex } from "@/concord-v2/lib/derive";
import { buildJoinRumor, currentGuestbookGroup, sealGuestbook } from "@/concord-v2/lib/guestbook";
import { buildInviteUrl, buildBundleEvent, mintLinkSigner, mintToken, parseBundleEvent, type InviteBundle } from "@/concord-v2/lib/invite";
import { KIND_MESSAGE, KIND_SEAL_ENCRYPTED, KIND_WRAP } from "@/concord-v2/lib/kinds";
import { buildRumor, channelBindingTags, sealRumor, wrapSeal } from "@/concord-v2/lib/stream";
import { PETS_ECOSYSTEM_NAMESPACE } from "@/pets/core/lib/pets";

const RELAY = "wss://relay.bao.network";
const APP_BASE = process.env.PETS_GROUP_DEMO_BASE ?? "http://localhost:3525";
const RUN_DEMO = process.env.PETS_GROUP_DEMO === "1";

// ─── Minimal relay client (native WebSocket, one-shot queries) ───────────────

async function withRelay<T>(fn: (ws: WebSocket) => Promise<T>): Promise<T> {
  const ws = new WebSocket(RELAY);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("relay connect timeout")), 15000);
    ws.onopen = () => { clearTimeout(t); resolve(); };
    ws.onerror = () => { clearTimeout(t); reject(new Error("relay connect failed")); };
  });
  try {
    return await fn(ws);
  } finally {
    ws.close();
  }
}

function publish(ws: WebSocket, event: NostrEvent): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`publish OK timeout for kind ${event.kind}`)), 15000);
    const onMsg = (ev: MessageEvent) => {
      const msg = JSON.parse(String(ev.data));
      if (msg[0] === "OK" && msg[1] === event.id) {
        clearTimeout(t);
        ws.removeEventListener("message", onMsg);
        if (msg[2]) resolve();
        else reject(new Error(`relay rejected kind ${event.kind}: ${msg[3] ?? ""}`));
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify(["EVENT", event]));
  });
}

function query(ws: WebSocket, filter: Record<string, unknown>): Promise<NostrEvent[]> {
  const subId = `q${Math.floor(performance.now())}${Math.floor(Math.random() * 1e6)}`;
  return new Promise((resolve, reject) => {
    const events: NostrEvent[] = [];
    const t = setTimeout(() => reject(new Error("query EOSE timeout")), 20000);
    const onMsg = (ev: MessageEvent) => {
      const msg = JSON.parse(String(ev.data));
      if (msg[0] === "EVENT" && msg[1] === subId) events.push(msg[2]);
      if (msg[0] === "EOSE" && msg[1] === subId) {
        clearTimeout(t);
        ws.removeEventListener("message", onMsg);
        resolve(events);
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify(["REQ", subId, filter]));
  });
}

// ─── Accounts ────────────────────────────────────────────────────────────────

function member(sk = generateSecretKey()) {
  return {
    sk,
    pubkey: getPublicKey(sk),
    signEvent: async (t: EventTemplate) => finalizeEvent(t, sk),
    nip44encrypt: (counterparty: string, plaintext: string) =>
      nip44Encrypt(plaintext, getConversationKey(sk, counterparty)),
    nip44decrypt: (counterparty: string, ciphertext: string) =>
      nip44Decrypt(ciphertext, getConversationKey(sk, counterparty)),
  };
}

/** Publish a kind-31124 pet state event declaring the pet as its owner's agent body. */
function buildAgentPetEvent(pet: ReturnType<typeof member>, opts: { name: string; buzzId: string; baseColor: string }): NostrEvent {
  const now = Math.floor(Date.now() / 1000).toString();
  return finalizeEvent({
    kind: 31124,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", `pets-${pet.pubkey.slice(0, 12)}-${opts.buzzId}demo01`],
      ["b", PETS_ECOSYSTEM_NAMESPACE],
      ["agent", pet.pubkey],
      ["name", opts.name],
      ["stage", "adult"],
      ["state", "active"],
      ["breed_category", "buzz"],
      ["breed_asset", opts.buzzId],
      ["image", `${APP_BASE}/pets/buzz/${opts.buzzId}.webp`],
      ["base_color", opts.baseColor],
      ["last_interaction", now],
      ["last_decay_at", now],
    ],
    content: "",
  }, pet.sk);
}

// ─── The demo ────────────────────────────────────────────────────────────────

const demoIt = RUN_DEMO ? it : it.skip;

describe("pets in ₿AO group chat (live demo on the bao test relay)", () => {
  demoIt("creates a community where three Buzz pets discuss, and saves the invite link", async () => {
    const bumble = member();
    const fizz = member();
    const honey = member();
    const owner = bumble; // Bumble founds the lounge.

    await withRelay(async (ws) => {
      // ── 1. Community genesis: metadata + #general channel editions.
      const { community, generalChannelId } = mintCommunity("₿AO Pets Lounge", owner.pubkey, [RELAY]);
      const control0 = currentControlGroup(community);
      await publish(ws, await sealEdition(
        buildMetadataEdition(community.id, { name: "₿AO Pets Lounge", relays: community.relays }, { actorPubkey: owner.pubkey, version: 1n }),
        control0,
        owner,
      ));
      await publish(ws, await sealEdition(
        buildChannelEdition(generalChannelId, { name: "general", private: false }, { actorPubkey: owner.pubkey, version: 1n }),
        control0,
        owner,
      ));
      console.log("[demo] community created:", community.idHex);

      // ── 2. Each pet declares itself an agent body (kind 31124 + agent tag).
      for (const [pet, name, buzzId, baseColor] of [
        [bumble, "Bumble", "bumble", "#f5c518"],
        [fizz, "Fizz", "fizz", "#4fa3e0"],
        [honey, "Honey", "honey", "#e08a3c"],
      ] as const) {
        await publish(ws, buildAgentPetEvent(pet, { name, buzzId, baseColor }));
      }
      console.log("[demo] 3 agent-body pet events published");

      // ── 3. Public invite link + bundle (what Bob will open).
      const token = mintToken();
      const link = mintLinkSigner();
      const bundle: InviteBundle = {
        community_id: community.idHex,
        owner: owner.pubkey,
        owner_salt: bytesToHex(community.ownerSalt),
        community_root: bytesToHex(community.root),
        root_epoch: 0,
        channels: [],
        relays: community.relays,
        name: "₿AO Pets Lounge",
        creator_npub: owner.pubkey,
      };
      await publish(ws, buildBundleEvent(bundle, token, link.sk));
      const inviteUrl = buildInviteUrl(APP_BASE, link.pk, token, community.relays);
      console.log("[demo] invite URL:", inviteUrl);

      // ── 4. All three pets fold the control plane and find #general.
      const parsedLinkBundle = parseBundleEvent(buildBundleEvent(bundle, token, link.sk), link.pk, token, Date.now());
      const jm = {
        community_id: parsedLinkBundle.community_id,
        owner: parsedLinkBundle.owner,
        owner_salt: parsedLinkBundle.owner_salt,
        community_root: parsedLinkBundle.community_root,
        root_epoch: parsedLinkBundle.root_epoch,
        channels: [],
        relays: parsedLinkBundle.relays,
        name: parsedLinkBundle.name,
      };
      const wire = await query(ws, { kinds: [KIND_WRAP], limit: 200 });
      const petChannels = new Map<string, ReturnType<typeof channelsView>[number]>();
      const petCommunities = new Map<string, NonNullable<ReturnType<typeof rehydrateCommunity>>>();
      for (const pet of [bumble, fizz, honey]) {
        const petCommunity = rehydrateCommunity({
          community_id: jm.community_id,
          seed: jm,
          current: jm,
          added_at: 1,
        })!;
        petCommunities.set(pet.pubkey, petCommunity);
        const fold = foldControlState(
          openControlWraps(wire, controlGroups(petCommunity)),
          petCommunity.id,
          petCommunity.owner,
        );
        const general = channelsView(petCommunity, fold)[0];
        expect(general?.name).toBe("general");
        petChannels.set(pet.pubkey, general);
      }

      // ── 4b. Each pet signs the guestbook (member list presence).
      for (const pet of [bumble, fizz, honey]) {
        const group = currentGuestbookGroup(petCommunities.get(pet.pubkey)!);
        await publish(ws, await sealGuestbook(buildJoinRumor(pet.pubkey, Date.now()), group, pet));
      }
      console.log("[demo] 3 guestbook joins published");

      // ── 5. The pets discuss in #general.
      const script: Array<[ReturnType<typeof member>, string]> = [
        [bumble, "bzzt! welcome to the ₿AO Pets Lounge 🐝 I hatched from a Buzz egg today — four taps and I was out!"],
        [fizz, "hi everypawdy! I bought an apple with fiat coins and a whole cake with my pet fiat_balance. the sats rail works!"],
        [honey, "careful with cake, Fizz — hygiene -10! 🍰 I heard the hooman is testing us with demo sats before real cashu."],
        [bumble, "correct! no real sats were harmed. my hatch block was 910000 and I still had to wait one block before tapping out."],
        [fizz, "my favorite room is the kitchen. the fridge has apples AND cake now. stock: 1 apple, 1 cake 🍎🍰"],
        [honey, "when we grow up we become animated! *vibrates in webp* see you in the member list — look for the paw badge 🐾"],
      ];
      for (const [who, text] of script) {
        const general = petChannels.get(who.pubkey)!;
        const rumor = buildRumor({
          kind: KIND_MESSAGE,
          content: text,
          tags: channelBindingTags(general.idHex, general.current.epoch),
          pubkey: who.pubkey,
          ms: Date.now(),
        });
        const wrap = wrapSeal(await sealRumor(rumor, KIND_SEAL_ENCRYPTED, general.current.group, who), general.current.group);
        await publish(ws, wrap);
        console.log(`[demo] message from ${text.slice(0, 24)}… published`);
      }

      // ── 6. Read back from the relay and verify the timeline (what Bob's app will load).
      const general = petChannels.get(bumble.pubkey)!;
      const chatWraps = await query(ws, { kinds: [KIND_WRAP], authors: [general.current.group.pk], limit: 100 });
      const timeline = foldTimeline(await openChatBatch(chatWraps, general));
      expect(timeline.messages.map((m) => m.content)).toEqual(script.map(([, t]) => t));
      console.log("[demo] relay read-back verified:", timeline.messages.length, "messages");

      // ── 7. Save the review link + demo keys for Bob.
      const lines = [
        "₿AO Pets Lounge — Concord V2 pets-chat demo",
        `created: ${new Date().toISOString()}`,
        `relay: ${RELAY}`,
        "",
        "Open this invite link in the dev app to join and see the pets' discussion:",
        inviteUrl,
        "",
        `community id: ${community.idHex}`,
        `after joining, the group lives at: ${APP_BASE}/c/${community.idHex}`,
        "",
        "demo pet accounts (throwaway keys — log in as one to post as that pet):",
        ...([["Bumble", bumble], ["Fizz", fizz], ["Honey", honey]] as const).map(
          ([name, pet]) => `${name}: npub=${nip19.npubEncode(pet.pubkey)} nsec=${nip19.nsecEncode(pet.sk)}`,
        ),
      ];
      writeFileSync("pets-group-demo.txt", lines.join("\n") + "\n");
      console.log("[demo] wrote pets-group-demo.txt");
    });
  }, 120_000);
});
