import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FundThreadSetup } from './ImportFundThread';
import type { BaoFundraiser, BaoMilestone } from '@/lib/baoFundraising';

const mocks = vi.hoisted(() => ({
  sendMock: vi.fn(),
  createChannelMock: vi.fn(),
  fetchFundraiserMock: vi.fn(),
  channels: { current: [] as Array<{ idHex: string }> },
}));

vi.mock('@/concord-v2/hooks/useCommunityList2', () => ({
  useCommunity2: () => ({ id: 'community-1' }),
}));

vi.mock('@/concord-v2/hooks/useCommunityActions2', () => ({
  useCommunityManagement2: () => ({ createChannel: mocks.createChannelMock }),
}));

vi.mock('@/concord-v2/hooks/useControlPlane2', () => ({
  useChannels2: () => mocks.channels.current,
}));

vi.mock('@/concord-v2/hooks/useChannel2', () => ({
  useSendMessage2: () => ({ mutateAsync: mocks.sendMock }),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: 'user-pubkey' } }),
}));

vi.mock('@/lib/baoFundraising', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/baoFundraising')>();
  return { ...actual, fetchFundraiser: mocks.fetchFundraiserMock };
});

const fundraiser: BaoFundraiser = {
  id: 'fund-a',
  title: 'Campaign A',
  description: null,
  owner_pubkey: 'owner-a',
  runner_type: 'agent',
  goal_sats: 100_000,
  raised_sats: 0,
  status: 'open',
  settlement_rail: 'lightning',
  network: 'signet',
  created_at: '2026-07-01T00:00:00Z',
};

const milestone: BaoMilestone = {
  id: 'm1',
  fundraiser_id: 'fund-a',
  idx: 0,
  title: 'Milestone 1',
  description: 'Ship the thing',
  amount_sats: 1000,
  status: 'locked',
  unlocked_at: null,
  released_at: null,
  payout_reference: null,
};

function renderSetup(onDone: (ok: boolean) => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <FundThreadSetup communityId="c1" fundraiserId="fund-a" onDone={onDone} />
    </QueryClientProvider>,
  );
}

describe('FundThreadSetup — slow relay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.channels.current = [];
    mocks.createChannelMock.mockResolvedValue({ channelIdHex: 'channel-hex' });
    mocks.fetchFundraiserMock.mockResolvedValue({ fundraiser, milestones: [milestone] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('does not report failure while posting is still in flight past the 20s guard', async () => {
    vi.useFakeTimers();
    // Channel materializes, but each message send takes longer than the guard.
    mocks.channels.current = [{ idHex: 'channel-hex' }];
    const resolvers: Array<() => void> = [];
    mocks.sendMock.mockImplementation(
      () => new Promise<void>((resolve) => { resolvers.push(resolve); }),
    );

    const onDone = vi.fn();
    renderSetup(onDone);

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(mocks.createChannelMock).toHaveBeenCalledTimes(1);
    expect(mocks.sendMock).toHaveBeenCalledTimes(1); // summary send in flight

    // The 20s "never hang the dialog" guard fires mid-post — it must NOT
    // report failure while the posts are still landing.
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000); });
    expect(onDone).not.toHaveBeenCalled();

    // Posting then completes: the real result is reported.
    await act(async () => { resolvers[0](); await vi.advanceTimersByTimeAsync(0); });
    expect(mocks.sendMock).toHaveBeenCalledTimes(2); // milestone message
    await act(async () => { resolvers[1](); await vi.advanceTimersByTimeAsync(0); });
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it('still finishes with failure when the channel never materializes', async () => {
    vi.useFakeTimers();
    mocks.channels.current = []; // channel never shows up in the fold

    const onDone = vi.fn();
    renderSetup(onDone);

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(mocks.createChannelMock).toHaveBeenCalledTimes(1);
    expect(mocks.sendMock).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(25_000); });
    expect(onDone).toHaveBeenCalledWith(false);
  });
});
