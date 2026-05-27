// Spaces paywall policy.
//
// Single source of truth for "is this viewer allowed to see protected
// venue/space details?" Used by:
//   - GET /api/venues/demand          (redacts protected fields per row)
//   - GET /api/venues/[slug]          (returns 403 when gated)
//   - /venues/[slug] page             (renders upgrade screen when gated)
//   - /spaces page                    (decides whether cards link to detail)
//
// Policy:
//   - Customers and admins always see details (no subscription needed).
//   - Artists with an active subscription see details.
//   - Venues NEVER see other venues (this is the "venues is for artists"
//     rule, mirrors the existing /spaces gate). Exception: a venue can
//     always see its own venue page (the "preview my public profile"
//     flow from venue-portal).
//   - Everyone else (logged-out, non-subscribed artists, unknown types)
//     is gated.

export type ViewerType = "artist" | "venue" | "customer" | "admin" | null;

export interface SpaceViewerContext {
  /** Resolved viewer type. null for anonymous visitors. */
  viewerType: ViewerType;
  /** Whether the viewer's subscription is in `active` or `trialing` state. */
  isSubscribed: boolean;
  /** Whether the viewer owns the venue currently being inspected. Only
   *  relevant on detail-page checks; pass `false` from the listing API. */
  isOwnVenue?: boolean;
}

export function canViewSpaceDetails(ctx: SpaceViewerContext): boolean {
  if (ctx.viewerType === "admin") return true;
  if (ctx.viewerType === "customer") return true;
  if (ctx.viewerType === "venue") return Boolean(ctx.isOwnVenue);
  if (ctx.viewerType === "artist") return ctx.isSubscribed;
  return false;
}
