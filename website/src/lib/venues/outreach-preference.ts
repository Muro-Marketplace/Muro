/**
 * A venue's choice about being approached first.
 *
 * Some venues want to pick artists themselves and not field requests. The
 * preference lives in the venue's auth user metadata
 * (`user_metadata.accepts_artist_outreach`, absent = true) rather than a
 * column, because no migration can ship right now; the venue sets it from
 * their settings page through supabase.auth.updateUser, which only ever
 * touches their own record.
 *
 * Enforced where an artist makes first contact: POST /api/messages (a first
 * message to a venue) and POST /api/placements (an artist-initiated
 * request). A venue that has already made the first move, by messaging the
 * artist or holding a placement with them, can be answered freely.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { findUsersByIds } from "@/lib/auth/find-user-by-email";

export const OUTREACH_PREF_KEY = "accepts_artist_outreach";

export const VENUE_PREFERS_FIRST_MOVE =
  "This venue prefers to make the first move. If they message you or invite you to place work, you can reply and request from there.";

/** Reads the flag off a user-shaped object; anything but an explicit false means open. */
export function acceptsArtistOutreach(user: { user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  const v = user?.user_metadata?.[OUTREACH_PREF_KEY];
  return v !== false;
}

/** Looks the venue's user up; a failed lookup is treated as open, never as a block. */
export async function venueAcceptsArtistOutreach(db: SupabaseClient, venueUserId: string | null | undefined): Promise<boolean> {
  if (!venueUserId) return true;
  try {
    const { data, error } = await db.auth.admin.getUserById(venueUserId);
    if (error || !data?.user) return true;
    return acceptsArtistOutreach(data.user);
  } catch {
    return true;
  }
}

/**
 * The flag for many venue users at once (the Spaces list), through the one
 * sanctioned paged scan of auth users. Anyone not found, or any failure,
 * is reported as open.
 */
export async function venueOutreachFlagsForUsers(
  db: SupabaseClient,
  userIds: string[],
): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const id of userIds) out[id] = true;
  if (userIds.length === 0) return out;
  try {
    const users = await findUsersByIds(db, userIds);
    for (const [id, user] of users) out[id] = acceptsArtistOutreach(user);
  } catch {
    // leave everyone open
  }
  return out;
}

/**
 * True when the venue already reached out to this artist: a message sent by
 * the venue to them, or any placement between the two. Either failure
 * mode returns false, so an opted-out venue is never opened by an error.
 */
export async function venueHasEngagedArtist(
  db: SupabaseClient,
  input: { venueSlug: string; venueUserId: string; artistSlug: string; artistUserId: string },
): Promise<boolean> {
  try {
    const { data: msgs } = await db
      .from("messages")
      .select("id")
      .eq("sender_type", "venue")
      .eq("sender_name", input.venueSlug)
      .eq("recipient_slug", input.artistSlug)
      .limit(1);
    if (Array.isArray(msgs) && msgs.length > 0) return true;
    const { data: placements } = await db
      .from("placements")
      .select("id")
      .eq("venue_user_id", input.venueUserId)
      .eq("artist_user_id", input.artistUserId)
      .limit(1);
    return Array.isArray(placements) && placements.length > 0;
  } catch {
    return false;
  }
}

/**
 * The one decision both routes make: may this artist approach this venue
 * right now? Open venues: always. Opted-out venues: only if they engaged first.
 */
export async function artistMayApproachVenue(
  db: SupabaseClient,
  input: { venueSlug: string; venueUserId: string; artistSlug: string; artistUserId: string },
): Promise<boolean> {
  if (await venueAcceptsArtistOutreach(db, input.venueUserId)) return true;
  return venueHasEngagedArtist(db, input);
}
