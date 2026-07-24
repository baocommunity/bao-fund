import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { BackButtonHandler } from "@/components/BackButtonHandler";
import { InitialSyncGate } from "@/components/InitialSyncGate";
import { DeepLinkHandler } from "@/components/DeepLinkHandler";
import { Toaster } from "./components/ui/toaster";
import { MainLayout } from "./components/MainLayout";
import { ScrollToTop } from "./components/ScrollToTop";
import { ChunkErrorBoundary } from "./components/ChunkErrorBoundary";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { useProfileUrl } from "./hooks/useProfileUrl";

// Critical-path pages: eagerly loaded (landing + fallback)
import NotFound from "./pages/NotFound";
import { LandingPage } from "./pages/LandingPage";

// Kept pages: code-split via React.lazy
const BaoCommunitiesPage = lazy(() => import("./pages/BaoCommunitiesPage").then(m => ({ default: m.BaoCommunitiesPage })));
const ConcordV2Page = lazy(() => import("./concord-v2/pages/ConcordV2Page").then(m => ({ default: m.ConcordV2Page })));
const InviteV2Page = lazy(() => import("./concord-v2/pages/InviteV2Page").then(m => ({ default: m.InviteV2Page })));
const BaoFundingPage = lazy(() => import("./pages/BaoFundingPage").then(m => ({ default: m.BaoFundingPage })));
const PetsPage = lazy(() => import("./pages/PetsPage").then(m => ({ default: m.PetsPage })));
const PetsBattlePage = lazy(() => import("./pages/PetsBattlePage").then(m => ({ default: m.default })));
const PetsChaseBtcPage = lazy(() => import("./pages/ChaseBtcPage").then(m => ({ default: m.default })));
const WalletPage = lazy(() => import("./pages/WalletPage").then(m => ({ default: m.WalletPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const ProfileSettings = lazy(() => import("./pages/ProfileSettings").then(m => ({ default: m.ProfileSettings })));
const WalletSettingsPage = lazy(() => import("./pages/WalletSettingsPage").then(m => ({ default: m.WalletSettingsPage })));
const PetsSettingsPage = lazy(() => import("./pages/PetsSettingsPage").then(m => ({ default: m.PetsSettingsPage })));
const NetworkSettingsPage = lazy(() => import("./pages/NetworkSettingsPage").then(m => ({ default: m.NetworkSettingsPage })));
const MagicSettingsPage = lazy(() => import("./pages/MagicSettingsPage").then(m => ({ default: m.MagicSettingsPage })));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings").then(m => ({ default: m.NotificationSettings })));
const AdvancedSettingsPage = lazy(() => import("./pages/AdvancedSettingsPage").then(m => ({ default: m.AdvancedSettingsPage })));
const NIP19Page = lazy(() => import("./pages/NIP19Page").then(m => ({ default: m.NIP19Page })));
const RemoteLoginSuccessPage = lazy(() => import("./pages/RemoteLoginSuccessPage").then(m => ({ default: m.RemoteLoginSuccessPage })));

/** Redirects /profile to the user's canonical profile URL (nip05 or npub). */
function ProfileRedirect() {
  const { user, metadata } = useCurrentUser();
  const profileUrl = useProfileUrl(user?.pubkey ?? "", metadata);
  if (!user) return <Navigate to="/" replace />;
  return <Navigate to={profileUrl} replace />;
}

/** Root route: logged-out users see the landing page; logged-in users go to chat. */
function RootRoute() {
  const { user } = useCurrentUser();
  if (user) return <Navigate to="/chat" replace />;
  return <LandingPage />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Toaster />
      <DeepLinkHandler />
      <BackButtonHandler />
      <ScrollToTop />
      <InitialSyncGate>
        <ChunkErrorBoundary>
          <Routes>
            {/* All routes share the persistent MainLayout (sidebar + nav) */}
            <Route element={<MainLayout />}>
              <Route path="/" element={<RootRoute />} />

              {/* ₿AO chat (Concord V2 E2EE communities) */}
              <Route path="/chat" element={<BaoCommunitiesPage />} />
              <Route path="/c/:communityId" element={<ConcordV2Page />} />
              <Route path="/c/:communityId/:channelId" element={<ConcordV2Page />} />
              <Route path="/invite/:naddr" element={<InviteV2Page />} />

              {/* ₿AO Fund milestone fundraising */}
              <Route path="/fund" element={<BaoFundingPage />} />

              {/* Nostr Pets */}
              <Route path="/pets" element={<PetsPage />} />
              <Route path="/pets/battle" element={<PetsBattlePage />} />
              <Route path="/pets/chase" element={<PetsChaseBtcPage />} />

              {/* Wallet & zaps */}
              <Route path="/wallet" element={<WalletPage />} />

              {/* Settings */}
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/profile" element={<ProfileSettings />} />
              <Route path="/settings/wallet" element={<WalletSettingsPage />} />
              <Route path="/settings/pets" element={<PetsSettingsPage />} />
              <Route path="/settings/network" element={<NetworkSettingsPage />} />
              <Route path="/settings/magic" element={<MagicSettingsPage />} />
              <Route path="/settings/notifications" element={<NotificationSettings />} />
              <Route path="/settings/advanced" element={<AdvancedSettingsPage />} />

              <Route path="/profile" element={<ProfileRedirect />} />

              {/* Callback target for remote signers (e.g. Amber, Primal) after NIP-46 approval */}
              <Route path="/remote-login-success" element={<RemoteLoginSuccessPage />} />
              {/* NIP-19 route for npub1, nprofile1, NIP-05 identifiers */}
              <Route path="/:nip19" element={<NIP19Page />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </ChunkErrorBoundary>
      </InitialSyncGate>
    </BrowserRouter>
  );
}
export default AppRouter;
