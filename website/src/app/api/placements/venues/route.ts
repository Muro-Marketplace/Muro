import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

/**
 * GET: return venues the authenticated artist has interacted with
 * (via messages or enquiries). Used to populate the venue dropdown
 * on the placement request form.
 */
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const db = getSupabaseAdmin();

    // Get artist slug + review status. Pending applicants shouldn't
    // see venues yet, sending placement requests before admin
    // approval would let any signed-up account spam venues. We
    // return a structured `pending: true` flag rather than just an
    // empty list so the UI can show a "your application is being
    // reviewed" notice instead of "no venues found".
    const { data: artistProfile } = await db
      .from("artist_profiles")
      .select("slug, review_status")
      .eq("user_id", auth.user!.id)
      .single();

    if (!artistProfile) {
      return NextResponse.json({ venues: [], pending: true });
    }

    if (
      (artistProfile as { review_status?: string }).review_status ===
        "pending"
    ) {
      return NextResponse.json({ venues: [], pending: true });
    }

    const artistSlug = artistProfile.slug;
    const venueSlugs = new Set<string>();

    // 1. Find venues from message conversations
    //    Messages where artist is sender (recipient_slug is a venue)
    //    or artist is recipient (sender_name is a venue slug)
    const { data: messages } = await db
      .from("messages")
      .select("sender_name, sender_type, recipient_slug")
      .or(`recipient_slug.eq.${artistSlug},sender_name.eq.${artistSlug}`);

    if (messages) {
      for (const msg of messages) {
        if (msg.recipient_slug === artistSlug && msg.sender_type === "venue") {
          // Venue sent to artist, sender_name is the venue slug
          venueSlugs.add(msg.sender_name);
        } else if (msg.sender_name === artistSlug) {
          // Artist sent to someone, check if recipient is a venue
          venueSlugs.add(msg.recipient_slug);
        }
      }
    }

    // 2. Find venues from enquiries sent to this artist
    const { data: enquiries } = await db
      .from("enquiries")
      .select("sender_email, sender_name")
      .eq("artist_slug", artistSlug);

    // Match enquiry sender emails to venue profiles
    if (enquiries && enquiries.length > 0) {
      const emails = enquiries.map((e) => e.sender_email).filter(Boolean);
      if (emails.length > 0) {
        // Look up venue profiles by user email
        const { data: users } = await db.auth.admin.listUsers();
        if (users?.users) {
          const emailToUserId = new Map<string, string>();
          for (const u of users.users) {
            if (u.email && emails.includes(u.email)) {
              emailToUserId.set(u.email, u.id);
            }
          }
          const userIds = Array.from(emailToUserId.values());
          if (userIds.length > 0) {
            const { data: venueProfiles } = await db
              .from("venue_profiles")
              .select("slug")
              .in("user_id", userIds);
            if (venueProfiles) {
              for (const vp of venueProfiles) {
                venueSlugs.add(vp.slug);
              }
            }
          }
        }
      }
    }

    if (venueSlugs.size === 0) {
      return NextResponse.json({ venues: [] });
    }

    // Resolve slugs to venue profiles
    const { data: venues } = await db
      .from("venue_profiles")
      .select("slug, name, type, location")
      .in("slug", Array.from(venueSlugs));

    return NextResponse.json({ venues: venues || [] });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
