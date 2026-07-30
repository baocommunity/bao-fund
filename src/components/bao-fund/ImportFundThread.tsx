import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HandCoins, Loader2 } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCommunity2 } from '@/concord-v2/hooks/useCommunityList2';
import { useCommunityManagement2 } from '@/concord-v2/hooks/useCommunityActions2';
import { useChannels2 } from '@/concord-v2/hooks/useControlPlane2';
import { useSendMessage2 } from '@/concord-v2/hooks/useChannel2';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  baoApiDate,
  baoMarketsWebBase,
  fetchFundraiser,
  fetchFundraisers,
  type BaoFundraiser,
  type BaoMilestone,
} from '@/lib/baoFundraising';

/**
 * "Import ₿AO Fund" — bring a fundraiser into a new ₿AO group as its own
 * thread: one `fund-<slug>` channel holding the fund summary plus one message
 * per milestone (each milestone message can then carry its own discussion).
 *
 * Permission rule: only the FUND OWNER can import a fund. At group creation
 * the creator is automatically the group's owner/admin, so restricting the
 * picker to funds where `owner_pubkey === user.pubkey` satisfies both halves
 * of the rule ("the owner of the fund has to be admin" / "only the owner can
 * import"). Importing into an EXISTING group as a non-admin is not possible:
 * channel creation is a control-plane write gated to admins by Concord V2.
 */

const NO_IMPORT = '__none__';

/** `fund-<slug>` channel name derived from the fundraiser title. */
function fundChannelName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return `fund-${slug || 'raise'}`;
}

function formatSats(n: number): string {
  return n.toLocaleString();
}

/** The first message in the fund thread: everything a backer needs. */
function buildFundSummary(f: BaoFundraiser, milestones: BaoMilestone[]): string {
  const lines = [
    `📣 ₿AO Fund imported: ${f.title}`,
    '',
    (f.description ?? '').trim().slice(0, 800),
    '',
    `Goal: ${formatSats(f.goal_sats)} sats · Raised: ${formatSats(f.raised_sats)} sats · Status: ${f.status}`,
    `Rail: ${f.settlement_rail} · Format: ${f.format ?? 'milestones'}`,
  ];
  if ((f.format ?? 'milestones') === 'stream') {
    const start = baoApiDate(f.stream_start_at);
    const end = baoApiDate(f.stream_end_at);
    if (start && end) {
      lines.push(`Vesting window: ${start.toLocaleDateString()} → ${end.toLocaleDateString()}`);
    }
  }
  const webBase = baoMarketsWebBase();
  lines.push('');
  lines.push(webBase ? `Open on bao.markets: ${webBase}` : 'Local demo fund — lives on this machine only.');
  lines.push(
    milestones.length > 0
      ? `${milestones.length} milestone${milestones.length === 1 ? '' : 's'} below — reply in a thread to discuss each one. 👇`
      : 'This is a time-lock stream — no milestone markets.',
  );
  return lines.join('\n');
}

/** One message per milestone so each gets its own thread. */
function buildMilestoneMessage(m: BaoMilestone): string {
  const lines = [
    `Milestone ${m.idx + 1}: ${m.title} — ${formatSats(m.amount_sats)} sats`,
    '',
    (m.description ?? '').trim().slice(0, 400),
  ];
  if (m.criteria) lines.push('', `Delivery criteria: ${m.criteria}`);
  const deadline = baoApiDate(m.deadline_at);
  const meta = [
    deadline ? `Deadline: ${deadline.toLocaleDateString()}` : null,
    `Status: ${m.status}`,
    m.fee_bps ? `Runner fee: ${(m.fee_bps / 100).toFixed(2)}%` : null,
  ].filter(Boolean);
  lines.push('', meta.join(' · '));
  const webBase = baoMarketsWebBase();
  if (webBase && m.market_id) lines.push(`Market: ${webBase}/demo/market/${m.market_id}`);
  return lines.join('\n');
}

/**
 * Picker shown inside the create-community dialog. Lists ONLY fundraisers the
 * current user owns — the permission rule is enforced here by construction.
 */
export function FundImportPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { user } = useCurrentUser();
  const { data: fundraisers } = useQuery({
    queryKey: ['bao-fundraisers'],
    queryFn: () => fetchFundraisers(),
    staleTime: 30_000,
    enabled: !!user,
  });

  const owned = useMemo(
    () => (fundraisers ?? []).filter((f) => f.owner_pubkey === user?.pubkey),
    [fundraisers, user?.pubkey],
  );

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        <HandCoins className="size-3.5 text-primary" />
        Import ₿AO Fund (optional)
      </Label>
      <Select value={value || NO_IMPORT} onValueChange={(v) => onChange(v === NO_IMPORT ? '' : v)}>
        <SelectTrigger>
          <SelectValue placeholder="No fund import" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_IMPORT}>No fund import</SelectItem>
          {owned.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.title} — {formatSats(f.goal_sats)} sats
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground leading-snug">
        {owned.length > 0
          ? 'Creates a separate fund thread with the full details and one message per milestone.'
          : 'Only funds you own can be imported — the fund owner must run the group.'}
      </p>
    </div>
  );
}

type Phase = 'await-community' | 'create-channel' | 'await-channel' | 'done';

/**
 * Headless worker rendered after a community is created with a fund selected:
 * waits for the community to resolve from the vault, creates the fund
 * channel, waits for it to materialize in the control fold, then posts the
 * summary + milestone messages. Always finishes (success or best-effort
 * failure) by calling onDone — the community itself is already created by
 * then, so a thread failure must never strand the user.
 */
export function FundThreadSetup({
  communityId,
  fundraiserId,
  onDone,
}: {
  communityId: string;
  fundraiserId: string;
  onDone: (ok: boolean) => void;
}) {
  const community = useCommunity2(communityId);
  const { createChannel } = useCommunityManagement2(community);
  const channels = useChannels2(community, true);
  const [channelIdHex, setChannelIdHex] = useState<string | null>(null);
  const channel = useMemo(
    () => channels.find((c) => c.idHex === channelIdHex),
    [channels, channelIdHex],
  );
  const send = useSendMessage2(community, channel);
  // Refs so the effect chains below don't re-fire on every render.
  const sendRef = useRef(send.mutateAsync);
  sendRef.current = send.mutateAsync;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const { data: detail } = useQuery({
    queryKey: ['bao-fundraiser', fundraiserId],
    queryFn: () => fetchFundraiser(fundraiserId),
    staleTime: 30_000,
  });

  const [phase, setPhase] = useState<Phase>('await-community');

  // Step 1: create the fund channel once the community resolves.
  useEffect(() => {
    if (phase !== 'await-community' || !community || !detail) return;
    setPhase('create-channel');
    createChannel({ name: fundChannelName(detail.fundraiser.title) })
      .then(({ channelIdHex: id }) => {
        setChannelIdHex(id);
        setPhase('await-channel');
      })
      .catch(() => setPhase('done'));
  }, [phase, community, detail, createChannel]);

  // Step 2: once the channel shows up in the fold, post the fund contents.
  const postedRef = useRef(false);
  const resultRef = useRef(false);
  useEffect(() => {
    if (phase !== 'await-channel' || !channel || !detail || postedRef.current) return;
    postedRef.current = true;
    void (async () => {
      try {
        await sendRef.current({ content: buildFundSummary(detail.fundraiser, detail.milestones) });
        for (const m of detail.milestones) {
          await sendRef.current({ content: buildMilestoneMessage(m) });
        }
        resultRef.current = true;
      } catch {
        // Best effort — a half-posted thread is still navigable.
      }
      setPhase('done');
    })();
  }, [phase, channel, detail]);

  // Never hang the dialog: if the fold is slow to materialize the channel,
  // finish anyway — the community exists and the thread can be retried. But
  // once posting has STARTED, the loop must report its own result: forcing
  // 'done' mid-loop calls onDone(false) while the posts are still landing
  // successfully. The long backstop only guards a truly hung publish.
  useEffect(() => {
    const t = setTimeout(() => {
      if (postedRef.current) return;
      setPhase('done');
    }, 20_000);
    const backstop = setTimeout(() => setPhase('done'), 120_000);
    return () => { clearTimeout(t); clearTimeout(backstop); };
  }, []);

  const succeeded = phase === 'done' && resultRef.current;
  useEffect(() => {
    if (phase === 'done') onDoneRef.current(succeeded);
  }, [phase, succeeded]);

  return (
    <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Setting up the fund thread…
    </div>
  );
}
