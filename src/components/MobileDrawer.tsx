import { useState, useId, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronUp, LogOut, UserPlus, QrCode, Heart } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SidebarNavList } from '@/components/SidebarNavItem';
import { SidebarMoreMenu } from '@/components/SidebarMoreMenu';


import { EmojifiedText } from '@/components/CustomEmoji';
import LoginDialog from '@/components/auth/LoginDialog';
import { FollowQRDialog } from '@/components/FollowQRDialog';
import { useOnboarding } from '@/hooks/useOnboarding';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { isItemActive } from '@/lib/sidebarItems';
import { useTheme } from '@/hooks/useTheme';
import { resolveTheme, resolveThemeConfig } from '@/themes';

/** Total width of the drawer background layer: 300px drawer + 36px arc overhang. */
const DRAWER_BG_WIDTH = 336;

/** Build the shared clip-path style for the drawer arc background layers. */
function drawerClipStyle(clipId: string): React.CSSProperties {
  return { width: DRAWER_BG_WIDTH, clipPath: `url(#${clipId})` };
}

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileDrawer({ open, onOpenChange }: MobileDrawerProps) {
  const clipId = `${useId()}-drawer-arc-clip`;
  const clipStyle = drawerClipStyle(clipId);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, metadata, event: currentUserEvent } = useCurrentUser();
  const currentUserAvatarShape = getAvatarShape(metadata);
  const { logout } = useLoginActions();
  const { otherUsers, setLogin } = useLoggedInAccounts();
  const { orderedItems, hiddenItems, addToSidebar, addDividerToSidebar, removeFromSidebar, updateSidebarOrder } = useFeedSettings();
  const [editing, setEditing] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [accountExpanded, setAccountExpanded] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [followQROpen, setFollowQROpen] = useState(false);
  const { startSignup } = useOnboarding();
  const { theme, customTheme, themes } = useTheme();

  /** Compute the background image style for the drawer, mirroring the body background. */
  const bgStyle = useMemo<React.CSSProperties>(() => {
    const resolved = resolveTheme(theme);
    const activeConfig = resolved === 'custom' ? customTheme : resolveThemeConfig(resolved, themes);
    const bgUrl = activeConfig?.background?.url;
    if (!bgUrl) return {};
    const bgMode = activeConfig?.background?.mode ?? 'cover';
    const bgOpacity = activeConfig?.backgroundOpacity ?? 1;
    const base: React.CSSProperties = bgMode === 'tile'
      ? { backgroundColor: 'transparent', backgroundImage: `url("${bgUrl}")`, backgroundRepeat: 'repeat', backgroundSize: 'auto' }
      : { backgroundColor: 'transparent', backgroundImage: `url("${bgUrl}")`, backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
    return bgOpacity < 1 ? { ...base, opacity: bgOpacity } : base;
  }, [theme, customTheme, themes]);

  const hasBgImage = Object.keys(bgStyle).length > 0;

  const visibleItems = useMemo(() => {
    // Remove dividers that have no real items above them (at the top or right after another divider).
    return orderedItems.filter((id, i) => {
      if (id !== 'divider') return true;
      const prevNonDivider = orderedItems.slice(0, i).some((prev) => prev !== 'divider');
      return prevNonDivider;
    });
  }, [orderedItems]);

  const visibleHiddenItems = hiddenItems;

  const handleClose = () => { onOpenChange(false); setMoreMenuOpen(false); };
  const handleLogout = async () => { await logout(); handleClose(); navigate('/'); };
  const getDisplayName = (account: Account) => account.metadata.name || account.metadata.display_name || 'Anonymous';
  const displayName = metadata?.name || metadata?.display_name || 'Anonymous';

  return (
    <>
        <Sheet open={open} onOpenChange={(v) => { if (!v) setMoreMenuOpen(false); onOpenChange(v); }}>
        <SheetContent side="left" className="w-[300px] p-0 gap-0 border-r-border flex flex-col overflow-visible">
          {/* SVG clip path definition for the drawer + arc shape.
              The clip path uses objectBoundingBox units so the arc scales with the
              background layer. The 0.893 ratio ≈ DRAWER_WIDTH / DRAWER_BG_WIDTH
              (300 / 336), placing the arc's apex at the right edge of the visible
              drawer while the extra 36px overflows for the curved bulge. */}
          <svg className="absolute" width="0" height="0" aria-hidden="true">
            <defs>
              <clipPath id={clipId} clipPathUnits="objectBoundingBox">
                <path d="M0,0 L0.893,0 Q1,0.5 0.893,1 L0,1 Z" />
              </clipPath>
            </defs>
          </svg>
          {/* Background layer: 300px drawer + 36px arc overhang = 336px total.
              Clipped to the drawer+arc shape so the background image (if any) flows
              seamlessly through both regions. */}
          <div
            className="absolute top-0 left-0 bottom-0 pointer-events-none bg-background"
            style={{ ...bgStyle, ...clipStyle }}
          />
          {hasBgImage && (
            <div
              className="absolute top-0 left-0 bottom-0 bg-background/70 pointer-events-none"
              style={clipStyle}
            />
          )}
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>

          {user ? (
            <div className="flex flex-col h-full relative">
              {/* User row with caret */}
              <button
                onClick={() => setAccountExpanded((v) => !v)}
                className="flex items-center gap-3 px-3 hover:bg-secondary/60 transition-colors w-full text-left"
                style={{ minHeight: `calc(3rem + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))`, paddingTop: `var(--safe-area-inset-top, env(safe-area-inset-top, 0px))` }}
              >
                <Avatar shape={currentUserAvatarShape} className="size-7 shrink-0">
                  <AvatarImage src={metadata?.picture} alt={displayName} />
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">
                    {displayName[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-semibold text-sm truncate">
                    {currentUserEvent && (metadata?.name || metadata?.display_name)
                      ? <EmojifiedText tags={currentUserEvent.tags}>{metadata.name || metadata.display_name || ''}</EmojifiedText>
                      : displayName}
                  </span>
                  {metadata?.nip05 && (
                    <VerifiedNip05Text nip05={metadata.nip05} pubkey={user.pubkey} className="text-xs text-muted-foreground truncate" />
                  )}
                </div>
                {accountExpanded
                  ? <ChevronUp className="size-4 text-muted-foreground shrink-0 mr-1" />
                  : <ChevronDown className="size-4 text-muted-foreground shrink-0 mr-1" />
                }
              </button>

              {/* Expanded account actions */}
              {accountExpanded && (
                <div>
                  {otherUsers.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => { setLogin(account.id); handleClose(); }}
                      className="flex items-center gap-3 w-full px-3 py-2 hover:bg-secondary/60 transition-colors"
                    >
                      <Avatar shape={getAvatarShape(account.metadata)} className="size-7 shrink-0">
                        <AvatarImage src={account.metadata.picture} alt={getDisplayName(account)} />
                        <AvatarFallback className="bg-primary/20 text-primary text-xs">
                          {getDisplayName(account).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate">
                          {account.event
                            ? <EmojifiedText tags={account.event.tags}>{getDisplayName(account)}</EmojifiedText>
                            : getDisplayName(account)}
                        </span>
                        {account.metadata.nip05 && (
                          <VerifiedNip05Text nip05={account.metadata.nip05} pubkey={account.pubkey} className="text-xs text-muted-foreground truncate" />
                        )}
                      </div>
                    </button>
                  ))}
                  <button
                    onClick={() => { handleClose(); setFollowQROpen(true); }}
                    className="flex items-center gap-4 w-full px-4 py-2.5 text-sm font-normal text-muted-foreground hover:bg-secondary/60 transition-colors"
                  >
                    <QrCode className="size-5 shrink-0" />
                    <span>Share profile</span>
                  </button>
                  <button
                    onClick={() => { handleClose(); navigate('/settings/profile#donations'); }}
                    className="flex items-center gap-4 w-full px-4 py-2.5 text-sm font-normal text-orange-500 hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
                  >
                    <Heart className="size-5 shrink-0 text-orange-500" />
                    <span>Accept donations</span>
                  </button>
                  <button
                    onClick={() => { handleClose(); setLoginDialogOpen(true); }}
                    className="flex items-center gap-4 w-full px-4 py-2.5 text-sm font-normal text-muted-foreground hover:bg-secondary/60 transition-colors"
                  >
                    <UserPlus className="size-5 shrink-0" />
                    <span>Add another account</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-4 w-full px-4 py-2.5 text-sm font-normal text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="size-5 shrink-0" />
                    <span>Log out @{metadata?.name || metadata?.display_name || 'Anonymous'}</span>
                  </button>
                </div>
              )}

              {/* Nav items — scrollable */}
              <nav
                className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1"
              >
                <div className="contents">
                  <SidebarNavList
                    items={visibleItems}
                    editing={editing}
                    onRemove={removeFromSidebar}
                    onReorder={updateSidebarOrder}
                    isActive={(id) => isItemActive(id, location.pathname)}
                    getOnClick={() => handleClose}
                    linkClassName="text-base"
                    minimal
                  />
                  <SidebarMoreMenu
                    editing={editing}
                    hiddenItems={visibleHiddenItems}
                    onDoneEditing={() => setEditing(false)}
                    onStartEditing={() => setEditing(true)}
                    onAdd={addToSidebar}
                    onAddDivider={addDividerToSidebar}
                    onNavigate={handleClose}
                    open={moreMenuOpen}
                    onOpenChange={setMoreMenuOpen}
                  />
                </div>
              </nav>
            </div>
          ) : (
            <div className="flex flex-col h-full relative">
              {/* Nav items — scrollable */}
              <nav className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1">
                <div className="contents">
                  <SidebarNavList
                    items={visibleItems}
                    editing={false}
                    onRemove={removeFromSidebar}
                    onReorder={updateSidebarOrder}
                    isActive={(id) => isItemActive(id, location.pathname)}
                    getOnClick={() => handleClose}
                    linkClassName="text-base"
                    minimal
                  />
                  <SidebarMoreMenu
                    editing={false}
                    hiddenItems={visibleHiddenItems}
                    onDoneEditing={() => setEditing(false)}
                    onStartEditing={() => setEditing(true)}
                    onAdd={addToSidebar}
                    onAddDivider={addDividerToSidebar}
                    onNavigate={handleClose}
                    open={moreMenuOpen}
                    onOpenChange={setMoreMenuOpen}
                  />
                </div>
              </nav>

              {/* Join button for logged-out users */}
              <div className="px-4 py-3 safe-area-bottom">
                <button
                  onClick={() => setLoginDialogOpen(true)}
                  className="flex items-center justify-center gap-2 w-full h-11 rounded-full bg-[var(--2140-bitcoin)] text-black font-semibold hover:bg-[var(--2140-bitcoin-hover)] transition-colors"
                >
                  <UserPlus className="size-4" />
                  <span>Join</span>
                </button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={() => setLoginDialogOpen(false)}
        onSignupClick={startSignup}
      />
      <FollowQRDialog open={followQROpen} onOpenChange={setFollowQROpen} />
    </>
  );
}
