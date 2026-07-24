import { Suspense, useState, useMemo, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LeftSidebar } from '@/components/LeftSidebar';
import { MobileTopBar } from '@/components/MobileTopBar';
import { MobileDrawer } from '@/components/MobileDrawer';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { CursorFireEffect } from '@/components/CursorFireEffect';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ChunkErrorBoundary } from '@/components/ChunkErrorBoundary';
import { CenterColumnContext, DrawerContext, LayoutStore, LayoutStoreContext, NavHiddenContext, useLayoutSnapshot } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { DirectInvitesPrompt2 } from '@/concord-v2/components/DirectInvitesPrompt2';
import { useRegisterAllStreamKeys2 } from '@/concord-v2/hooks/useStreamAuth2';
import { useForegroundNotifications } from '@/hooks/useForegroundNotifications';
import { cn } from '@/lib/utils';

/** Neutral fallback shown in the content area while a lazy page chunk is loading. */
function PageSkeleton() {
  return (
    <>
      {/* Main column placeholder — mirrors the Outlet wrapper's border + bg classes */}
      <main className="flex-1 min-w-0 min-h-screen sidebar:border-l sidebar:border-r border-border bg-background/85 sidebar:max-w-[600px] flex items-center justify-center">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-[2.5px] border-primary/20" />
          <div className="absolute inset-0 rounded-full border-[2.5px] border-transparent border-t-primary animate-spin" />
        </div>
      </main>
      {/* Right sidebar placeholder — preserves layout width */}
      <div className="w-1/4 max-w-[300px] shrink-0 hidden lg:block" />
    </>
  );
}

/** Inner component that reads layout options from the context store. */
function MainLayoutInner() {
  const { rightSidebar, wrapperClassName, noOverscroll, noMaxWidth, scrollContainer, hasSubHeader, hideTopBar, hideBottomNav, hideLeftSidebar } = useLayoutSnapshot();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const [centerColumnEl, setCenterColumnEl] = useState<HTMLElement | null>(null);
  const { config } = useAppContext();
  const { hidden: navHidden } = useScrollDirection(scrollContainer);
  const location = useLocation();

  const [leftCollapsed, setLeftCollapsed] = useState(false);

  // ₿AO chat (Concord V2) rides auth-gated kind-1059 streams: authenticate
  // the connection as every live community's derived stream keys so its
  // planes are readable. Lives in the layout so it never unmounts on navigation.
  useRegisterAllStreamKeys2();

  // ₿AO chat: toast incoming Concord V2 messages while the app is open,
  // gated on the per-channel/community notification levels.
  useForegroundNotifications();

  return (
    <CenterColumnContext.Provider value={centerColumnEl}>
    <DrawerContext.Provider value={openDrawer}>
    <NavHiddenContext.Provider value={navHidden}>
      {/* Magic Mouse fire particle overlay */}
      {config.magicMouse && <CursorFireEffect />}

      {/* Mobile top bar - only on small screens, hidden when page requests immersive mode */}
      {!hideTopBar && <MobileTopBar onAvatarClick={() => setDrawerOpen(true)} hasSubHeader={hasSubHeader} />}

      {/* Mobile drawer */}
      <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      {/* Main layout - three column on desktop */}
      <div className={cn("flex justify-center mx-auto max-w-[1200px]", wrapperClassName)}>
        {/* Desktop left sidebar - hidden below sidebar breakpoint or when requested */}
        {!hideLeftSidebar && (
          <LeftSidebar collapsed={leftCollapsed} onToggleCollapse={() => setLeftCollapsed((v) => !v)} />
        )}

        {/* Main content + right sidebar: inside Suspense so the left sidebar persists while lazy pages load */}
        <ErrorBoundary
          sentryTags={{ errorBoundary: 'center-column', path: location.pathname }}
          resetKeys={[location.pathname]}
        >
          <ChunkErrorBoundary>
            <Suspense fallback={<PageSkeleton />}>
              {/* -mt-mobile-bar pulls content up behind the mobile top bar so the
                  transparent SVG header arc and page content overlap seamlessly.
                  The corresponding padding-top (set in CSS) prevents content from
                  being hidden. This depends on MobileTopBar having a transparent /
                  semi-transparent background — a solid top bar would obscure the
                  content underneath. Only active below the sidebar breakpoint. */}
              <div
                ref={(el) => setCenterColumnEl(el)}
                className={cn(
                  "relative z-0 flex-1 min-w-0 sidebar:border-l sidebar:border-r border-border bg-background/85",
                  !hideTopBar && "-mt-mobile-bar",
                  !noMaxWidth && (leftCollapsed ? "sidebar:max-w-[860px]" : "sidebar:max-w-[600px]"),
                  !noOverscroll && "pb-overscroll",
                )}
              >
                <Outlet />
              </div>
              {/* Right sidebar — render page-provided sidebar, or nothing */}
              {rightSidebar !== undefined ? rightSidebar : <div className="w-1/4 max-w-[300px] shrink-0 hidden lg:block" />}
            </Suspense>
          </ChunkErrorBoundary>
        </ErrorBoundary>
      </div>

      {/* Mobile bottom nav - only on small screens, slides out on scroll */}
      {!hideBottomNav && <MobileBottomNav />}

      {/* ₿AO chat: gift-wrapped direct invites arrive anywhere; the prompt is
          global like Armada's MainLayout mount. */}
      <DirectInvitesPrompt2 />
    </NavHiddenContext.Provider>
    </DrawerContext.Provider>
    </CenterColumnContext.Provider>
  );
}

/**
 * Persistent layout shell rendered once by the router.
 * Provides a LayoutStore so child pages can configure layout options
 * (e.g. custom right sidebar) via the `useLayoutOptions` hook.
 */
export function MainLayout() {
  const store = useMemo(() => new LayoutStore(), []);

  return (
    <LayoutStoreContext.Provider value={store}>
      <MainLayoutInner />
    </LayoutStoreContext.Provider>
  );
}
