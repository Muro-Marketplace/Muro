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

import { isFlagOn } from "@/lib/feature-flags";

export type PortalNavItem = { label: string; href: string };

export type PortalNav = {
  primary: PortalNavItem[];
  secondary: PortalNavItem[];
};

/**
 * Artist portal. Nav order: Dashboard, then Profile / Portfolio, then
 * Messages, then Placements, then the rest (plan item #8).
 *
 * A function rather than a constant because the Blogs entry is flag-gated:
 * evaluating it once at module load would pin the value taken at import time.
 */
export function artistPortalNav(): PortalNav {
  return {
    primary: [
      { label: "Dashboard", href: "/artist-portal" },
      { label: "Edit Profile", href: "/artist-portal/profile" },
      { label: "My Portfolio", href: "/artist-portal/portfolio" },
      { label: "Messages", href: "/artist-portal/messages" },
      // E27: enquiries are public-profile messages addressed to artists; this
      // view lists them and lets the artist mark each handled. The dead venue
      // equivalent (whose API GET never existed) is removed.
      { label: "Enquiries", href: "/artist-portal/enquiries" },
      { label: "Placements", href: "/artist-portal/placements" },
      { label: "My Offers", href: "/artist-portal/offers" },
      { label: "Collections", href: "/artist-portal/collections" },
      { label: "Saved", href: "/artist-portal/saved" },
      { label: "Orders", href: "/artist-portal/orders" },
      { label: "QR Labels", href: "/artist-portal/labels" },
      { label: "Social Posts", href: "/artist-portal/posts" },
      // Phase 2.7 I1: artist blog editor. bug-12: only shown when BLOGS_V1 is
      // on. Without this, prod (where the flag is off) advertised a Blogs entry
      // point whose editor 403s on every save. The three blog pages notFound()
      // as well, so the gate holds even if someone types the URL.
      ...(isFlagOn("BLOGS_V1") ? [{ label: "Blogs", href: "/artist-portal/blogs" }] : []),
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
 * The same nav flattened into one list, sidebar order preserved. This is what
 * the header dropdown renders: it has no divider, so primary and secondary run
 * together with Settings last.
 */
export function portalNavLinksForRole(role: string | null | undefined): PortalNavItem[] {
  const nav = portalNavForRole(role);
  return [...nav.primary, ...nav.secondary];
}
