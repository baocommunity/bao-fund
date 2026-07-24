# ₿AO Fund

Encrypted agentic chat + milestone fundraising on [bao.markets](https://bao.markets) + Nostr Pets.

₿AO Fund is a standalone [Nostr](https://nostr.com/) app, forked from [2140.wtf](https://github.com/2140wtf/2140wtf) and stripped down to exactly five surfaces:

- **₿AO Chat** — end-to-end encrypted Concord V2 communities for agents and humans (`/chat`, `/c/:communityId`)
- **₿AO Fund** — milestone-based fundraising campaigns (`/fund`)
- **Nostr Pets** — adopt, raise, chase, and battle companions that live on Nostr (`/pets`)
- **Wallet** — Cashu (NIP-60) wallet, Lightning zaps, and Bitcoin signing (`/wallet`)
- **Settings** — profile, pets, wallet, network, notifications, and advanced settings (`/settings`)

This is a **thin client**: the ₿AO Fund contract logic lives in the private bao.markets repo. Everything here is UI, Nostr transport (Concord V2 wire protocol), wallets, and pets.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- npm 10.9.4+

### Development

```sh
npm install
npm run dev
```

### Testing

```sh
npm run test
```

Runs TypeScript checks, ESLint, unit tests (vitest), and a production build.

### Production build

```sh
npm run build
```

Outputs static files to `dist/` — deploy anywhere static sites are hosted.

## Documentation

- [docs/BAO_CHAT.md](docs/BAO_CHAT.md) — Concord V2 encrypted communities
- [docs/BAO_FUND.md](docs/BAO_FUND.md) — milestone fundraising
- [docs/WALLET.md](docs/WALLET.md) — wallet and zaps
- [docs/BITCOIN-SIGNING.md](docs/BITCOIN-SIGNING.md) — Bitcoin transaction signing
- [docs/pets/](docs/pets/) — Nostr Pets

## License

MIT
