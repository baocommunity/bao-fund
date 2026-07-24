/* eslint-disable react-refresh/only-export-components */

import {
  Cat,
  HandCoins,
  MessageSquareMore,
  Palette,
  Settings,
  WalletCards,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type IconComponent = React.ComponentType<{ className?: string }>;

/** Sentinel ID used to represent a visual divider in the sidebar order. */
export const SIDEBAR_DIVIDER_ID = "divider";

/** Returns true if the given sidebar order ID is a divider sentinel. */
export function isSidebarDivider(id: string): boolean {
  return id === SIDEBAR_DIVIDER_ID;
}

/** A sidebar-capable item with everything needed for display and navigation. */
export interface SidebarItemDef {
  /** Unique identifier stored in sidebarOrder. */
  id: string;
  /** Display label. */
  label: string;
  /** Navigation path (e.g. '/chat', '/wallet'). */
  path: string;
  /** Icon component. */
  icon: IconComponent;
  /** If true, only shown when a user is logged in. */
  requiresAuth?: boolean;
}

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Single source of truth for all sidebar items.
 *
 * The standalone ₿AO Fund app has exactly five destinations.
 */
export const SIDEBAR_ITEMS: SidebarItemDef[] = [
  {
    id: "chat",
    label: "₿AO CHAT",
    path: "/chat",
    icon: MessageSquareMore,
    requiresAuth: true,
  },
  { id: "fund", label: "₿AO FUND", path: "/fund", icon: HandCoins },
  { id: "pets", label: "PETS", path: "/pets", icon: Cat },
  {
    id: "wallet",
    label: "WALLET",
    path: "/wallet",
    icon: WalletCards,
    requiresAuth: true,
  },
  { id: "settings", label: "SETTINGS", path: "/settings", icon: Settings },
];

/** Set of all known sidebar item IDs for quick lookup. */
export const SIDEBAR_ITEM_IDS = new Set(SIDEBAR_ITEMS.map((s) => s.id));

/** Map from ID to definition for O(1) lookup. */
const SIDEBAR_ITEM_MAP = new Map(SIDEBAR_ITEMS.map((s) => [s.id, s]));

// ── Lookups ───────────────────────────────────────────────────────────────────

/** Get the sidebar item definition by ID, or undefined if unknown. */
export function getSidebarItem(id: string): SidebarItemDef | undefined {
  return SIDEBAR_ITEM_MAP.get(id);
}

/** Returns the icon element for a sidebar item ID at the given size. */
export function sidebarItemIcon(
  id: string,
  size = "size-6",
): React.ReactElement {
  const Icon = SIDEBAR_ITEM_MAP.get(id)?.icon ?? Palette;
  return <Icon className={size} />;
}

/** Lookup display label for a sidebar item ID. */
export function itemLabel(id: string): string {
  return SIDEBAR_ITEM_MAP.get(id)?.label ?? id;
}

/** Lookup navigation path for a sidebar item ID. */
export function itemPath(id: string): string {
  return SIDEBAR_ITEM_MAP.get(id)?.path ?? `/${id}`;
}

/** Check if a sidebar item is active given the current location. */
export function isItemActive(id: string, pathname: string): boolean {
  if (id === "settings") return pathname.startsWith("/settings");
  if (id === "chat") {
    return (
      pathname === "/chat" ||
      pathname.startsWith("/c/") ||
      pathname.startsWith("/invite/")
    );
  }
  if (id === "pets") return pathname.startsWith("/pets");
  if (id === "fund") return pathname.startsWith("/fund");
  if (id === "wallet") return pathname.startsWith("/wallet");

  const itemDef = SIDEBAR_ITEM_MAP.get(id);
  const itemPathname = itemDef?.path ?? `/${id}`;
  return pathname === itemPathname;
}
