// src/lib/portal-nav.ts
//
// Single source of truth for portal navigation.
//
// H6: the header's portal dropdown kept its own hand-written copies of these
// lists and carried a comment claiming they were at parity with the sidebars.
// They were not. The artist dropdown was missing Enquiries, My Offers, Social
// Posts and the flag-gated Blogs; the venue dropdown was missing My Offers.
// Two hand-maintained copies of the same list drift by construction, so both
// surfaces now read from here and the drift cannot come back.
//
// Order matters: it is the order the sidebar renders, and the dropdown mirrors
// it. `primary` is the main workflow block; `secondary` is what sits below the
// sidebar's divider (Settings, and nothing else today).
//
// Groups: an item may carry `children`. The artist sidebar renders a group as
// one row that expands to its children, and every child page gets a tab strip
// across the top so the artist can move between siblings without the sidebar.
// A group's own `href` is its first child's href, so clicking the group label
// lands somewhere useful. The header's flat portal menu lists the children in
// the group's place, under their `flatLabel` where one is set, because "Works"
// or "Posts" mean nothing away from the group that names them.

import { isFlagOn } from "@/lib/feature-flags";

export type PortalNavItem = {
  label: string;
  href: string;
  /**
   * Label to use when the item is listed on its own, away from its group: the
   * header's flat portal menu and the document title. Defaults to `label`.
   */
  flatLabel?: string;
  /**
   * Present on a group. The group's own `href` is its first child's href.
   */
  children?: PortalNavItem[];
};

export type PortalNav = {
  primary: PortalNavItem[];
  secondary: PortalNavItem[];
};

function group(label: string, children: PortalNavItem[]): PortalNavItem {
  const first = children[0];
  if (!first) throw new Error(`Portal nav group "${label}" has no children`);
  return { label, href: first.href, children };
}

/**
 * Artist portal. Nav order: Dashboard, Edit Profile, then the three groups
 * (Portfolio, Venues & Buyers, Social), then the standalone pages.
 *
 * A function rather than a constant because the Blogs entry is flag-gated:
 * evaluating it once at module load would pin the value taken at import time.
 */
export function artistPortalNav(): PortalNav {
  return {
    primary: [
      { label: "Dashboard", href: "/artist-portal" },
      { label: "Edit Profile", href: "/artist-portal/profile" },
      // Collections belongs with the portfolio rather than on its own.
      group("My Portfolio", [
        { label: "Works", flatLabel: "My Portfolio", href: "/artist-portal/portfolio" },
        { label: "Collections", href: "/artist-portal/collections" },
      ]),
      // Everything that is the artist dealing with a venue or a buyer.
      group("Venues & Buyers", [
        { label: "Messages", href: "/artist-portal/messages" },
        // E27: enquiries are public-profile messages addressed to artists; this
        // view lists them and lets the artist mark each handled. The dead venue
        // equivalent (whose API GET never existed) is removed.
        { label: "Enquiries", href: "/artist-portal/enquiries" },
        { label: "Placements", href: "/artist-portal/placements" },
        { label: "Offers", flatLabel: "My Offers", href: "/artist-portal/offers" },
        { label: "Orders", href: "/artist-portal/orders" },
      ]),
      group("Social", [
        { label: "Posts", flatLabel: "Social Posts", href: "/artist-portal/posts" },
        // Phase 2.7 I1: artist blog editor. bug-12: only shown when BLOGS_V1 is
        // on. Without this, prod (where the flag is off) advertised a Blogs entry
        // point whose editor 403s on every save. The three blog pages notFound()
        // as well, so the gate holds even if someone types the URL.
        ...(isFlagOn("BLOGS_V1") ? [{ label: "Blogs", href: "/artist-portal/blogs" }] : []),
      ]),
      { label: "Saved", href: "/artist-portal/saved" },
      { label: "QR Labels", href: "/artist-portal/labels" },
      { label: "Analytics", href: "/artist-portal/analytics" },
      { label: "Billing", href: "/artist-portal/billing" },
    ],
    // Settings used to sit in the primary list alongside a "Browse Site" entry.
    // Browse-Site was noise (the global header already leaves the portal), so it
    // went, and Settings moved under the divider to match venue-portal.
    secondary: [{ label: "Settings", href: "/artist-portal/settings" }],
  };
}

/**
 * Venue portal. Same ordering rule as the artist portal.
 */
export function venuePortalNav(): PortalNav {
  return {
    primary: [
      { label: "Dashboard", href: "/venue-portal" },
      { label: "Venue Profile", href: "/venue-portal/profile" },
      { label: "Messages", href: "/venue-portal/messages" },
      { label: "Placements", href: "/venue-portal/placements" },
      { label: "My Offers", href: "/venue-portal/offers" },
      { label: "My Walls", href: "/venue-portal/walls" },
      { label: "Saved", href: "/venue-portal/saved" },
      { label: "QR Labels", href: "/venue-portal/labels" },
      { label: "Analytics", href: "/venue-portal/analytics" },
      { label: "My Orders", href: "/venue-portal/orders" },
    ],
    secondary: [{ label: "Settings", href: "/venue-portal/settings" }],
  };
}

/**
 * Customer portal. Flat: the sidebar draws no divider, so everything is
 * primary and `secondary` is empty.
 *
 * Messages here is deliberately an explainer page, not an inbox. Customer
 * messaging does not exist server-side (the messages API rejects accounts with
 * no artist or venue profile), so the page says how to reach an artist instead
 * of pretending to be a mailbox. See F15/H8.
 */
export function customerPortalNav(): PortalNav {
  return {
    primary: [
      { label: "My Orders", href: "/customer-portal" },
      { label: "Saved", href: "/customer-portal/saved" },
      { label: "Addresses", href: "/customer-portal/addresses" },
      { label: "Messages", href: "/customer-portal/messages" },
      { label: "Settings", href: "/customer-portal/settings" },
    ],
    secondary: [],
  };
}

/**
 * The nav for a role, split the way the sidebar renders it.
 * Anything that isn't venue or customer gets the artist portal, matching how
 * `portalBase` is derived everywhere else in the header.
 */
export function portalNavForRole(role: string | null | undefined): PortalNav {
  if (role === "venue") return venuePortalNav();
  if (role === "customer") return customerPortalNav();
  return artistPortalNav();
}

/**
 * Every navigable page in sidebar order, groups expanded in place. Each entry
 * is a bare `{ label, href }` labelled for use on its own (`flatLabel` wins),
 * so the header menu can render it without knowing about groups.
 */
export function flattenPortalNav(nav: PortalNav): PortalNavItem[] {
  return [...nav.primary, ...nav.secondary].flatMap(flattenItem);
}

function flattenItem(item: PortalNavItem): PortalNavItem[] {
  if (item.children) return item.children.flatMap(flattenItem);
  return [{ label: item.flatLabel ?? item.label, href: item.href }];
}

/**
 * The same nav flattened into one list, sidebar order preserved. This is what
 * the header dropdown renders: it has no divider, so primary and secondary run
 * together with Settings last.
 */
export function portalNavLinksForRole(role: string | null | undefined): PortalNavItem[] {
  return flattenPortalNav(portalNavForRole(role));
}

/** Strip query string, hash and trailing slashes so matching sees the route alone. */
export function cleanNavPath(path: string): string {
  return path.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
}

/** A portal root such as "/artist-portal": one path segment. */
function isPortalRoot(href: string): boolean {
  return href.split("/").filter(Boolean).length === 1;
}

/**
 * Does this item own the path? An exact match, or the path sits below the
 * item's href ("/artist-portal/orders/123" belongs to Orders). A portal root
 * only matches exactly, or every page would also belong to Dashboard.
 */
export function navItemOwnsPath(item: PortalNavItem, path: string): boolean {
  const clean = cleanNavPath(path);
  if (item.href === clean) return true;
  if (isPortalRoot(item.href)) return false;
  return clean.startsWith(`${item.href}/`);
}

/**
 * The group one of whose children owns the path, or null when the path is a
 * standalone page (or nothing in the nav).
 */
export function activeGroupFor(nav: PortalNav, path: string): PortalNavItem | null {
  for (const item of [...nav.primary, ...nav.secondary]) {
    if (item.children?.some((child) => navItemOwnsPath(child, path))) return item;
  }
  return null;
}

/**
 * The tab strip for the path: its group's children in sidebar order, or an
 * empty list when the page stands alone.
 */
export function sectionTabsFor(nav: PortalNav, path: string): PortalNavItem[] {
  return activeGroupFor(nav, path)?.children ?? [];
}

/**
 * The page that owns the path, labelled for use on its own (document titles).
 * Exact match first, then the longest href the path sits below, so
 * "/artist-portal/orders/123" resolves to Orders.
 */
export function navPageFor(nav: PortalNav, path: string): PortalNavItem | null {
  const pages = flattenPortalNav(nav);
  const clean = cleanNavPath(path);
  const exact = pages.find((page) => page.href === clean);
  if (exact) return exact;
  const byLength = [...pages].sort((a, b) => b.href.length - a.href.length);
  return byLength.find((page) => navItemOwnsPath(page, clean)) ?? null;
}

/**
 * A stable slug for a group: its DOM id and its localStorage key in the
 * sidebar. "Venues & Buyers" becomes "venues-buyers".
 */
export function navGroupKey(group: PortalNavItem): string {
  return group.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
