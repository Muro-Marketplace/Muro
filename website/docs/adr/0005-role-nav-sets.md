# ADR 0005 - Five intentionally separate role navigation sets

**Status:** Accepted  
**Date:** 2026-06-15

---

## Context

Bug 6 (nav inconsistency) raised the question of whether the five distinct navigation sets in Wallplace should be unified. A review of the codebase found the following nav surfaces, each implemented separately:

| Component | File | Audience | Nav type |
|---|---|---|---|
| `Header` | `src/components/Header.tsx` | Public / any logged-in user | Top bar (public nav + per-role inline tabs + portal dropdown) |
| `ArtistPortalLayout` | `src/components/ArtistPortalLayout.tsx` | Artists | Sidebar with primary + secondary sections |
| `VenuePortalLayout` | `src/components/VenuePortalLayout.tsx` | Venues | Sidebar with primary + secondary sections |
| `CustomerPortalLayout` | `src/components/CustomerPortalLayout.tsx` | Customers | Sidebar |
| `AdminPortalLayout` | `src/components/AdminPortalLayout.tsx` | Admins | Sidebar |

### Nav item inventory (as of this ADR)

**Header — public nav links**
- Marketplace (`/browse`)
- How It Works (`/how-it-works`)
- Blog (`/blog`)
- Spaces (`/spaces`)

**Header — logged-in nav links (non-venue)**
- Marketplace (`/browse`)
- Spaces (`/spaces`)

**Header — venue nav links**
- Marketplace (`/browse`)
- Wallplace Curated (`/curated`)
- Blog (`/blog`)

**Header — portal dropdown (artist)**
- Dashboard, Edit Profile, My Portfolio, Showroom, Messages, Placements, Collections, Saved, Orders, QR Labels, Analytics, Billing, Settings

**Header — portal dropdown (venue)**
- Dashboard, Venue Profile, Messages, Placements, My Walls, Saved, QR Labels, Analytics, My Orders, Settings

**Header — portal dropdown (customer)**
- My Orders, Saved, Addresses, Messages, Settings

**ArtistPortalLayout sidebar (primary)**
- Dashboard, Edit Profile, My Portfolio, Showroom, Messages, Placements, My Offers, Artwork Requests, Collections, Saved, Orders, QR Labels, Social Posts, Blogs, Analytics, Billing

**ArtistPortalLayout sidebar (secondary)**
- Settings, Logout

**VenuePortalLayout sidebar (primary)**
- Dashboard, Venue Profile, Messages, Placements, My Offers, Artwork Requests, My Walls, Saved, QR Labels, Analytics, My Orders

**VenuePortalLayout sidebar (secondary)**
- Settings, Logout

**CustomerPortalLayout sidebar**
- My Orders, Saved, Addresses, Messages, Settings, Browse Art, Logout

**AdminPortalLayout sidebar (primary)**
- Dashboard, Applications, Artists, Venues, Curation, Feature requests, Feedback, Blogs, Disputes, Financials

**AdminPortalLayout sidebar (secondary)**
- Browse Site, Logout

---

## Decision

The five navigation sets remain **intentionally separate**. No unification refactor is planned.

Each role operates in a fundamentally different information architecture:

- **Public / Header:** Discovery-first. Routes visitors towards browsing, editorial content, and sign-up. Logged-in non-venue users add Spaces; venue users replace Spaces with Curated + Blog because venues already know what spaces they have.
- **Artist portal:** Work-management-first. Artwork pipeline (portfolio, showroom, offers, requests), placement tracking, monetisation (billing, analytics), community features (blogs, social posts). Artists need all of these; customers and venues need none of them.
- **Venue portal:** Space-management-first. Wall configuration, placement management, artwork requests, orders. Billing is handled at the platform level, not per-venue, so no billing item appears.
- **Customer portal:** Purchase-management-first. Minimal surface: orders, saved items, delivery addresses, messages, settings.
- **Admin portal:** Moderation-first. Content and user oversight only; no commerce features.

Coupling these into a single shared nav component would require a large branching structure with role conditionals throughout, making every nav-related change a risk to all five roles simultaneously. The current approach localises changes: adding a new venue feature requires touching only `VenuePortalLayout`, with no risk of regressing the artist or customer experience.

---

## Cross-cutting items that must stay consistent

Certain affordances should appear in every authenticated portal nav. Inconsistency here is a genuine bug:

1. **Logout** - present in all five portals. Verified present.
2. **Settings** - present in artist, venue, and customer portals. Admin has no settings page (admin accounts are managed via Supabase directly). Verified correct.
3. **Messages** - present in artist, venue, and customer portals. Admin does not use the messaging system. Verified correct.
4. **Addresses (customer portal)** - must appear in both the sidebar nav and the Header portal dropdown for customers. See the fix documented below.

---

## Accidental inconsistencies found and fixed

### Header portal dropdown missing Addresses for customers

The `CustomerPortalLayout` sidebar included `Addresses` (`/customer-portal/addresses`), and the route exists at `src/app/(pages)/customer-portal/addresses/`. However, the Header's portal dropdown for the customer role omitted this link, meaning a customer could reach Addresses from the sidebar but not from the top-nav shortcut menu.

**Fix:** `src/components/Header.tsx` — added `{ label: "Addresses", href: "/customer-portal/addresses" }` to the customer links array in the portal dropdown (between Saved and Messages, matching the sidebar order).

No other accidental inconsistencies were found. Route existence was verified for every nav item in all five components against `src/app/(pages)/`.

---

## Consequences

### Positive

- No destabilising refactor; each portal nav can evolve independently with contained risk.
- The decision is now documented, so future contributors understand the divergence is intentional.
- The one genuine accidental inconsistency (Addresses missing from the customer header dropdown) is fixed.

### Negative

- Cross-cutting items (logout, settings, messages) must be maintained in up to five places. The list in this ADR serves as the canonical reference for what must stay consistent.
- The Header portal dropdown is a curated subset of the full sidebar nav (intentionally shorter for scanability). This means some sidebar items, such as artist-specific Social Posts, Blogs, Artwork Requests, and My Offers, do not appear in the dropdown. This is by design, not a bug.
