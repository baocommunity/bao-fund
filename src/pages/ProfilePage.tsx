import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { Check, Copy, User, Zap } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { ZapDialog } from '@/components/ZapDialog';
import { BotPill } from '@/components/BotPill';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNip05Resolve } from '@/hooks/useNip05Resolve';
import { useCanReceiveZaps } from '@/hooks/useCanReceiveZaps';
import { useAppContext } from '@/hooks/useAppContext';
import { getAvatarShape } from '@/lib/avatarShape';
import { getDisplayName } from '@/lib/getDisplayName';
import { genUserName } from '@/lib/genUserName';
import { writeClipboardText } from '@/lib/clipboard';
import { toast } from '@/hooks/useToast';

const HEX_64_RE = /^[0-9a-f]{64}$/;

function isNip05Like(id: string): boolean {
  if (id.includes('@')) return true;
  if (id.includes('.') && !id.startsWith('npub1') && !id.startsWith('nprofile1')) return true;
  return false;
}

/**
 * Minimal standalone profile page: identity, bio, and zaps. The social feed
 * and its profile tabs do not exist in the ₿AO Fund app.
 */
export function ProfilePage() {
  const { config } = useAppContext();
  const params = useParams();
  const identifier = params.nip19;
  const { user } = useCurrentUser();

  const isNip05Param = !!identifier && isNip05Like(identifier);
  const { data: nip05Pubkey, isPending: nip05Loading } = useNip05Resolve(isNip05Param ? identifier : undefined);

  const pubkey = useMemo(() => {
    if (identifier) {
      if (isNip05Param) return nip05Pubkey ?? undefined;
      if (HEX_64_RE.test(identifier)) return identifier;
      try {
        const decoded = nip19.decode(identifier);
        if (decoded.type === 'npub') return decoded.data as string;
        if (decoded.type === 'nprofile') return (decoded.data as { pubkey: string }).pubkey;
      } catch {
        // fall through
      }
      return undefined;
    }
    return user?.pubkey;
  }, [identifier, isNip05Param, nip05Pubkey, user?.pubkey]);

  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata ? getDisplayName(metadata, pubkey ?? '') : genUserName(pubkey ?? '');
  const avatarShape = getAvatarShape(metadata);
  const { canReceive } = useCanReceiveZaps(pubkey);

  const [copied, setCopied] = useState(false);

  useSeoMeta({
    title: `${displayName} | ${config.appName}`,
    description: metadata?.about ?? `Profile on ${config.appName}`,
  });

  const npub = useMemo(() => {
    if (!pubkey) return undefined;
    try {
      return nip19.npubEncode(pubkey);
    } catch {
      return undefined;
    }
  }, [pubkey]);

  const copyNpub = () => {
    if (!npub) return;
    writeClipboardText(npub).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }, () => {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    });
  };

  if (isNip05Param && nip05Loading) {
    return (
      <main className="min-h-screen">
        <PageHeader title="Profile" icon={<User className="size-5" />} />
        <div className="p-4 space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="size-20 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
      </main>
    );
  }

  if (!pubkey) {
    return (
      <main className="min-h-screen">
        <PageHeader title="Profile" icon={<User className="size-5" />} />
        <div className="p-8 text-center text-muted-foreground">Profile not found.</div>
      </main>
    );
  }

  const isSelf = user?.pubkey === pubkey;

  return (
    <main className="min-h-screen pb-16">
      <PageHeader title={displayName} icon={<User className="size-5" />} />

      {/* Banner */}
      <div className="h-32 sm:h-48 bg-secondary relative">
        {metadata?.banner && (
          <img src={metadata.banner} alt="" className="w-full h-full object-cover" loading="lazy" />
        )}
      </div>

      <div className="px-4 pb-4">
        {/* Avatar overlapping the banner */}
        <div className="-mt-10 sm:-mt-14 mb-3 flex items-end justify-between">
          <Avatar shape={avatarShape} className="size-20 sm:size-28 border-4 border-background">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-2xl">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex items-center gap-2 pb-1">
            {author.data?.event && canReceive && (
              <ZapDialog target={author.data.event}>
                <Button size="sm" className="gap-1.5">
                  <Zap className="size-4" />
                  Zap
                </Button>
              </ZapDialog>
            )}
          </div>
        </div>

        {/* Name */}
        <div className="flex items-center gap-1.5 min-w-0">
          <h1 className="font-bold text-xl truncate">{displayName}</h1>
          <BotPill metadata={metadata} />
        </div>

        {metadata?.nip05 && (
          <p className="text-sm text-muted-foreground truncate">{metadata.nip05}</p>
        )}

        {/* npub (copyable) */}
        {npub && (
          <button
            type="button"
            onClick={copyNpub}
            className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Copy npub"
          >
            <span className="font-mono">{npub.slice(0, 16)}…{npub.slice(-8)}</span>
            {copied ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
          </button>
        )}

        {/* Bio */}
        {metadata?.about && (
          <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap break-words">
            {metadata.about}
          </p>
        )}

        {isSelf && (
          <p className="text-xs text-muted-foreground mt-4">
            This is you. Edit your profile in <Link to="/settings/profile" className="text-primary hover:underline">Settings</Link>.
          </p>
        )}
      </div>
    </main>
  );
}

export default ProfilePage;
