import { Link, useLocation } from 'react-router-dom';
import { Cat, HandCoins, MessageSquareMore, User, WalletCards } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { cn } from '@/lib/utils';
import { selectionChanged } from '@/lib/haptics';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useLayoutSnapshot } from '@/contexts/LayoutContext';
import { ArcBackground, ARC_UP_OVERHANG_PX } from '@/components/ArcBackground';

/** Transform style applied when the bottom nav is hidden (scrolled away). */
const hiddenStyle: React.CSSProperties = {
  transform: `translateY(calc(100% + ${ARC_UP_OVERHANG_PX}px))`,
};

export function MobileBottomNav() {
  const location = useLocation();
  const { user, metadata } = useCurrentUser();
  const { scrollContainer, noArcs } = useLayoutSnapshot();
  const { hidden } = useScrollDirection(scrollContainer);
  const profileUrl = useProfileUrl(user?.pubkey ?? '', metadata);

  const displayName = metadata?.name || metadata?.display_name;
  const isOnProfile = user && location.pathname === profileUrl;

  const itemClass = (active: boolean) => cn(
    'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
    active ? 'text-primary' : 'text-muted-foreground',
  );

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 sidebar:hidden will-change-transform',
        'transition-transform duration-300 ease-in-out',
      )}
      style={hidden ? hiddenStyle : undefined}
    >
      {/* Arc + items wrapper */}
      <div className="relative">
        <ArcBackground variant={noArcs ? 'rect' : 'up'} />
        <div className="h-11 flex items-center relative">

          {/* Chat */}
          <Link
            to="/chat"
            onClick={() => selectionChanged()}
            className={itemClass(
              location.pathname === '/chat' || location.pathname.startsWith('/c/'),
            )}
          >
            <MessageSquareMore className="size-5" />
            <span className="text-[10px] font-medium">Chat</span>
          </Link>

          {/* Fund */}
          <Link
            to="/fund"
            onClick={() => selectionChanged()}
            className={itemClass(location.pathname.startsWith('/fund'))}
          >
            <HandCoins className="size-5" />
            <span className="text-[10px] font-medium">Fund</span>
          </Link>

          {/* Pets */}
          <Link
            to="/pets"
            onClick={() => selectionChanged()}
            className={itemClass(location.pathname.startsWith('/pets'))}
          >
            <Cat className="size-5" />
            <span className="text-[10px] font-medium">Pets</span>
          </Link>

          {/* Wallet */}
          <Link
            to="/wallet"
            onClick={() => selectionChanged()}
            className={itemClass(location.pathname.startsWith('/wallet'))}
          >
            <WalletCards className="size-5" />
            <span className="text-[10px] font-medium">Wallet</span>
          </Link>

          {/* Profile */}
          {user ? (
            <Link
              to={profileUrl}
              onClick={() => selectionChanged()}
              className={itemClass(!!isOnProfile)}
            >
              <Avatar shape={getAvatarShape(metadata)} className="size-5">
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
                  {displayName?.[0]?.toUpperCase() || <User className="size-3" />}
                </AvatarFallback>
              </Avatar>
              <span className="text-[10px] font-medium">Profile</span>
            </Link>
          ) : (
            <Link
              to="/profile"
              className={itemClass(false)}
            >
              <User className="size-5" />
              <span className="text-[10px] font-medium">Profile</span>
            </Link>
          )}

        </div>
      </div>
      {/* Safe area fill — matches the arc's semi-transparent background */}
      <div className="safe-area-bottom bg-background/85" />
    </nav>
  );
}
