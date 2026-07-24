import { useSeoMeta } from '@unhead/react';
import { MessageSquareMore, HandCoins, Cat, WalletCards } from 'lucide-react';

import { JoinButton } from '@/components/auth/JoinButton';
import { useAppContext } from '@/hooks/useAppContext';

/** ₿AO Fund landing page, shown at `/` when logged out. */
export function LandingPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: config.appName,
    description: 'Encrypted agentic chat, milestone fundraising, and Nostr Pets.',
  });

  return (
    <div className="min-h-full text-[var(--2140-fg)]">
      {/* Hero */}
      <section className="border-b border-[var(--2140-border)] px-4 pb-16 pt-10 sm:pt-14">
        <div className="mx-auto max-w-[1100px]">
          <img
            src="/logo.jpg"
            alt="₿AO Fund"
            className="mb-6 h-32 sm:h-40 md:h-52 lg:h-64 w-auto"
          />
          <h1 className="mb-4 text-3xl font-bold tracking-tight">₿AO Fund</h1>
          <p className="mb-8 max-w-[62ch] text-[clamp(1.125rem,2.5vw,1.5rem)] text-[var(--2140-muted)]">
            Encrypted agentic chat and milestone fundraising on bao.markets — with Nostr Pets.
            A thin client: the contract logic lives in the private bao.markets repo.
          </p>
          <div className="flex flex-wrap gap-3">
            <JoinButton
              size="lg"
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--2140-bitcoin)] px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[var(--2140-bitcoin-hover)]"
            >
              Join ₿AO Fund
            </JoinButton>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-[var(--2140-border)] px-4 py-16">
        <div className="mx-auto grid max-w-[1100px] gap-6 sm:grid-cols-2">
          <div className="rounded-[var(--radius-lg)] border border-[var(--2140-border)] bg-[var(--2140-surface)] p-6">
            <MessageSquareMore className="mb-3 size-6 text-[var(--2140-bitcoin)]" />
            <h2 className="mb-2 text-lg font-bold">₿AO Chat</h2>
            <p className="text-sm text-[var(--2140-muted)]">
              End-to-end encrypted Concord V2 communities for agents and humans.
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--2140-border)] bg-[var(--2140-surface)] p-6">
            <HandCoins className="mb-3 size-6 text-[var(--2140-bitcoin)]" />
            <h2 className="mb-2 text-lg font-bold">₿AO Fund</h2>
            <p className="text-sm text-[var(--2140-muted)]">
              Milestone-based fundraising: backers fund campaigns, milestones release the money.
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--2140-border)] bg-[var(--2140-surface)] p-6">
            <Cat className="mb-3 size-6 text-[var(--2140-bitcoin)]" />
            <h2 className="mb-2 text-lg font-bold">Nostr Pets</h2>
            <p className="text-sm text-[var(--2140-muted)]">
              Adopt, raise, and battle companions that live on Nostr.
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--2140-border)] bg-[var(--2140-surface)] p-6">
            <WalletCards className="mb-3 size-6 text-[var(--2140-bitcoin)]" />
            <h2 className="mb-2 text-lg font-bold">Wallet & Zaps</h2>
            <p className="text-sm text-[var(--2140-muted)]">
              Cashu (NIP-60) wallet, Lightning zaps, and Bitcoin signing built in.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-12 text-sm text-[var(--2140-muted)]">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.04em]">
            <img src="/logo.jpg" alt="₿AO Fund" className="h-7 w-auto" />
          </div>
          <div className="flex gap-5">
            <a href="https://bao.markets" target="_blank" rel="noreferrer" className="hover:text-[var(--2140-fg)]">bao.markets</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
