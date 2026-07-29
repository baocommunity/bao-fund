import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Users } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { appProfileUrl } from '@/lib/dittoUrl';
import { baoApiDate, fetchContributions, type BaoContribution } from '@/lib/baoFundraising';

function formatSats(n: number): string {
  return Number(n).toLocaleString();
}

const PREVIEW_COUNT = 5;

/** One funder row: identity (clickable → 2140.wtf profile), amount, rail, date. */
function ContributionRow({ contribution: c }: { contribution: BaoContribution }) {
  const author = useAuthor(c.contributor_pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(c.contributor_pubkey);
  const profileUrl = appProfileUrl(c.contributor_pubkey);
  const when = baoApiDate(c.created_at);

  const identity = (
    <span className="flex items-center gap-1.5 min-w-0">
      <Avatar className="size-4 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="text-[8px]">{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="truncate">{displayName}</span>
    </span>
  );

  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      {profileUrl ? (
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 hover:text-primary transition-colors"
          title="View profile on 2140.wtf"
        >
          {identity}
        </a>
      ) : (
        identity
      )}
      <span className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className="text-[10px] px-1.5">{c.rail}</Badge>
        <span className="tabular-nums font-medium">{formatSats(Number(c.amount_sats))} sats</span>
        {when && (
          <span className="text-muted-foreground tabular-nums">
            {when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * Who funded this campaign. Lives inside the expanded campaign card and polls
 * lightly while visible. Silent-payment / anonymous donors have no npub on
 * record — they simply don't appear here (the API only lists recorded
 * contributions).
 */
export function FundraiserContributions({ fundraiserId }: { fundraiserId: string }) {
  const [showAll, setShowAll] = useState(false);

  const query = useQuery({
    queryKey: ['bao-contributions', fundraiserId],
    queryFn: () => fetchContributions(fundraiserId),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  if (query.isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }

  const contributions = query.data ?? [];
  if (contributions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Users className="size-3.5" /> No recorded contributions yet.
      </p>
    );
  }

  const total = contributions.reduce((sum, c) => sum + Number(c.amount_sats), 0);
  const visible = showAll ? contributions : contributions.slice(0, PREVIEW_COUNT);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-1.5">
        <Users className="size-4 text-primary" />
        Funders — {contributions.length} · {formatSats(total)} sats
      </h3>
      <div className="space-y-1.5">
        {visible.map((c) => <ContributionRow key={c.id} contribution={c} />)}
      </div>
      {contributions.length > PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {showAll ? (
            <>Show less <ChevronUp className="size-3" /></>
          ) : (
            <>Show all {contributions.length} <ChevronDown className="size-3" /></>
          )}
        </button>
      )}
    </div>
  );
}
