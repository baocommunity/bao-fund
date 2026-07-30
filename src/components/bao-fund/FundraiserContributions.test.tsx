import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FundraiserContributions } from './FundraiserContributions';

const mocks = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock('@/lib/baoFundraising', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/baoFundraising')>();
  return { ...actual, fetchContributions: mocks.fetchMock };
});

vi.mock('@/hooks/useAuthor', () => ({
  useAuthor: () => ({ data: undefined }),
}));

function renderComponent() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <FundraiserContributions fundraiserId="fund-a" />
    </QueryClientProvider>,
  );
}

describe('FundraiserContributions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders an error state — not a false "no contributions" — when the fetch fails', async () => {
    mocks.fetchMock.mockRejectedValue(new Error('API down'));
    renderComponent();

    expect(await screen.findByText(/Can't reach the ₿AO Fund demo API/)).toBeInTheDocument();
    expect(screen.queryByText(/No recorded contributions yet/)).not.toBeInTheDocument();
  });

  it('renders the empty state only when the fetch succeeds with no contributions', async () => {
    mocks.fetchMock.mockResolvedValue([]);
    renderComponent();

    expect(await screen.findByText(/No recorded contributions yet/)).toBeInTheDocument();
  });
});
