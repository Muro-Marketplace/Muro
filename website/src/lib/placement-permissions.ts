// F45/F7/F8/F31, single source of truth for who can act on a placement.
//
// The requester should never see Accept / Decline on their own request. Only
// the recipient can respond while the placement is still Pending. Legacy rows
// created before migration 008 have `requester_user_id = NULL`; in that case
// we fall back to the historical "venue-creates, artist-accepts" assumption
// so old data still works.

export type PlacementRole = "venue" | "artist" | "unknown";

export interface PlacementPermissionInput {
  /** Placement status, case-insensitive. Only "pending" allows responses. */
  status?: string | null;
  /** user_id of whoever created the placement (added in migration 008). */
  requester_user_id?: string | null;
  /** user_id of the artist the placement is assigned to. */
  artist_user_id?: string | null;
  /** user_id of the venue the placement is assigned to. */
  venue_user_id?: string | null;
}

/**
 * Can the given user Accept / Decline this placement?
 *
 * True only when:
 *   1. Status is Pending
 *   2. The user is NOT the requester
 *   3. The user is the "other side" (venue or artist) that the placement
 *      is assigned to
 *
 * Fallback for legacy NULL requester_user_id: if the current viewer is the
 * artist on the placement and the placement is pending, assume the venue
 * requested it.
 */
export function canRespond(
  placement: PlacementPermissionInput,
  userId: string | null | undefined,
  viewerRole: PlacementRole = "unknown"
): boolean {
  if (!userId) return false;
  if ((placement.status || "").toLowerCase() !== "pending") return false;

  if (placement.requester_user_id) {
    // Modern path: explicit requester field
    if (placement.requester_user_id === userId) return false;
    // Viewer must be the other party on the placement
    if (placement.artist_user_id && placement.artist_user_id === userId) return true;
    if (placement.venue_user_id && placement.venue_user_id === userId) return true;
    return false;
  }

  // No requester_user_id → row is ambiguous. We can't tell who sent the
  // request, so refuse the response rather than let the wrong party act
  // on it. Every modern creation path (messages POST, placements POST,
  // placement counter) now stamps requester_user_id, so this only hits
  // legacy rows that need to be reviewed manually.
  return false;
}

/**
 * Did the given user originate this placement request?
 * Used to render an "Awaiting response" chip on the requester's side.
 */
export function isRequester(
  placement: PlacementPermissionInput,
  userId: string | null | undefined
): boolean {
  if (!userId || !placement.requester_user_id) return false;
  return placement.requester_user_id === userId;
}
