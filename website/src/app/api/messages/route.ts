import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { messageSchema } from "@/lib/validations";
import { moderateMessage } from "@/lib/moderation";
import { notifyNewMessage, notifyPlacementRequest, notifyPlacementResponse } from "@/lib/email";
import { artists as staticArtists } from "@/data/artists";
import { venues as staticVenues } from "@/data/venues";

// GET: fetch conversations for the authenticated user, enriched with profile data
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");

    if (!slug || slug.length > 100) {
      return NextResponse.json({ error: "slug parameter required" }, { status: 400 });
    }

    const safeSlug = slug.replace(/[^a-zA-Z0-9_-]/g, "");
    const db = getSupabaseAdmin();

    // Verify ownership
    const { data: ownerProfile } = await db
      .from("artist_profiles")
      .select("slug")
      .eq("user_id", auth.user!.id)
      .single();

    const { data: venueProfile } = !ownerProfile
      ? await db.from("venue_profiles").select("slug").eq("user_id", auth.user!.id).single()
      : { data: null };

    const userSlug = ownerProfile?.slug || venueProfile?.slug;
    if (userSlug !== safeSlug) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get all messages
    const { data, error } = await db
      .from("messages")
      .select("*")
      .or(`recipient_slug.eq.${safeSlug},sender_name.eq.${safeSlug}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
    }

    // Group by conversation_id
    const conversationsMap: Record<string, {
      conversationId: string;
      latestMessage: string;
      latestSender: string;
      latestSenderType: string;
      otherParty: string;
      unreadCount: number;
      lastActivity: string;
      messageCount: number;
    }> = {};

    (data || []).forEach((msg) => {
      const cid = msg.conversation_id;
      if (!conversationsMap[cid]) {
        const otherParty = msg.recipient_slug === safeSlug ? msg.sender_name : msg.recipient_slug;
        conversationsMap[cid] = {
          conversationId: cid,
          latestMessage: msg.content,
          latestSender: msg.sender_name,
          latestSenderType: msg.sender_type,
          otherParty,
          unreadCount: 0,
          lastActivity: msg.created_at,
          messageCount: 0,
        };
      }
      conversationsMap[cid].messageCount++;
      if (!msg.is_read && msg.recipient_slug === safeSlug) {
        conversationsMap[cid].unreadCount++;
      }
    });

    const sorted = Object.values(conversationsMap).sort(
      (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );

    // Enrich with profile data: display names, images, placement status
    const otherPartySlugs = [...new Set(sorted.map((c) => c.otherParty))];

    // Batch lookup artist profiles
    const { data: artistProfiles } = otherPartySlugs.length > 0
      ? await db.from("artist_profiles").select("slug, name, profile_image").in("slug", otherPartySlugs)
      : { data: [] };

    // Batch lookup venue profiles
    const { data: venueProfiles } = otherPartySlugs.length > 0
      ? await db.from("venue_profiles").select("slug, name, image").in("slug", otherPartySlugs)
      : { data: [] };

    // Build lookup map
    const profileMap = new Map<string, { displayName: string; image: string | null; type: "artist" | "venue" }>();
    for (const ap of artistProfiles || []) {
      profileMap.set(ap.slug, { displayName: ap.name, image: ap.profile_image || null, type: "artist" });
    }
    for (const vp of venueProfiles || []) {
      if (!profileMap.has(vp.slug)) {
        profileMap.set(vp.slug, { displayName: vp.name, image: vp.image || null, type: "venue" });
      }
    }
    // Fallback to static data for seed/demo profiles
    for (const slug of otherPartySlugs) {
      if (!profileMap.has(slug)) {
        const staticArtist = staticArtists.find((a) => a.slug === slug);
        if (staticArtist) {
          profileMap.set(slug, { displayName: staticArtist.name, image: staticArtist.image || null, type: "artist" });
        } else {
          const staticVenue = staticVenues.find((v) => v.slug === slug);
          if (staticVenue) {
            profileMap.set(slug, { displayName: staticVenue.name, image: staticVenue.image || null, type: "venue" });
          }
        }
      }
    }

    // Check active placements between current user and each other party
    const { data: activePlacements } = otherPartySlugs.length > 0
      ? await db.from("placements").select("artist_slug, venue_slug").eq("status", "active")
          .or(otherPartySlugs.map((s) => `and(artist_slug.eq.${safeSlug},venue_slug.eq.${s}),and(venue_slug.eq.${safeSlug},artist_slug.eq.${s})`).join(","))
      : { data: [] };

    const placedSlugs = new Set<string>();
    for (const p of activePlacements || []) {
      if (p.artist_slug === safeSlug) placedSlugs.add(p.venue_slug);
      else if (p.venue_slug === safeSlug) placedSlugs.add(p.artist_slug);
    }

    // Enrich conversations
    const enriched = sorted.map((conv) => {
      const profile = profileMap.get(conv.otherParty);
      return {
        ...conv,
        otherPartyDisplayName: profile?.displayName || conv.otherParty,
        otherPartyImage: profile?.image || null,
        otherPartyType: profile?.type || "artist",
        hasActivePlacement: placedSlugs.has(conv.otherParty),
      };
    });

    return NextResponse.json({ conversations: enriched });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// POST: send a new message (supports text, placement_request, placement_response)
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const parsed = messageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { conversationId, senderType, recipientSlug, content, messageType, metadata } = parsed.data;

    // ── Content moderation ──────────────────────────────────────────────────
    const moderation = moderateMessage(content);
    if (!moderation.allowed) {
      return NextResponse.json(
        { error: moderation.reason || "Message not allowed" },
        { status: 400 },
      );
    }

    const cid = conversationId || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const db = getSupabaseAdmin();

    // Resolve the authenticated user's actual slug (never trust client-provided senderName)
    const { data: senderArtist } = await db.from("artist_profiles").select("slug").eq("user_id", auth.user!.id).single();
    const { data: senderVenue } = !senderArtist
      ? await db.from("venue_profiles").select("slug").eq("user_id", auth.user!.id).single()
      : { data: null };
    const resolvedSenderSlug = senderArtist?.slug || senderVenue?.slug || parsed.data.senderName;

    // Try insert with new columns first, fall back to base columns if they don't exist yet
    const baseRow = {
      conversation_id: cid,
      sender_id: auth.user!.id,
      sender_name: resolvedSenderSlug,
      sender_type: senderType || "anonymous",
      recipient_slug: recipientSlug,
      content,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    // If moderation flagged the message, tag it for admin review
    const extendedRow = {
      ...baseRow,
      message_type: messageType || "text",
      metadata: metadata || {},
      ...(moderation.flagged ? { flagged: true, flagged_reason: moderation.reason } : {}),
    };

    let { error } = await db.from("messages").insert(extendedRow);

    // If insert failed (likely missing columns), retry with base columns only
    if (error) {
      console.warn("Message insert failed with new columns, retrying base-only:", error.message);
      const retry = await db.from("messages").insert(baseRow);
      error = retry.error;
    }

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }

    if (moderation.flagged) {
      console.warn(`[moderation] Message flagged: sender=${resolvedSenderSlug} reason="${moderation.reason}"`);
    }

    // Handle placement request — create a pending placement
    if (messageType === "placement_request" && metadata) {
      const m = metadata as Record<string, unknown>;
      const placementId = `p-msg-${Date.now()}`;

      // Determine who is artist and who is venue
      const senderIsArtist = senderType === "artist";
      const artistSlug = senderIsArtist ? resolvedSenderSlug : recipientSlug;
      const venueSlug = senderIsArtist ? recipientSlug : resolvedSenderSlug;

      // Look up user IDs
      const { data: artistProfile } = await db.from("artist_profiles").select("user_id, slug, name").eq("slug", artistSlug).single();
      const { data: venueProfileData } = await db.from("venue_profiles").select("user_id, slug, name").eq("slug", venueSlug).single();

      if (artistProfile && venueProfileData) {
        const { error: placementError } = await db.from("placements").insert({
          id: placementId,
          artist_user_id: artistProfile.user_id,
          artist_slug: artistProfile.slug,
          venue_user_id: venueProfileData.user_id,
          venue_slug: venueProfileData.slug,
          venue: venueProfileData.name,
          work_title: (m.workTitle as string) || "Artwork",
          work_image: (m.workImage as string) || null,
          arrangement_type: (m.arrangementType as string) || "free_loan",
          revenue_share_percent: (m.revenueSharePercent as number) || null,
          status: "pending",
          message: content,
          created_at: new Date().toISOString(),
        });
        if (placementError) console.error("Placement insert error:", placementError);

        // Notify the recipient about the placement request
        const recipientIsArtist = !senderIsArtist;
        const recipientProfile = recipientIsArtist ? artistProfile : venueProfileData;
        if (recipientProfile?.user_id) {
          const { data: { user: recipientUser } } = await db.auth.admin.getUserById(recipientProfile.user_id);
          if (recipientUser?.email) {
            const senderProfile = senderIsArtist ? artistProfile : venueProfileData;
            notifyPlacementRequest({
              email: recipientUser.email,
              venueName: venueProfileData.name,
              artistName: artistProfile.name,
              workTitles: [(m.workTitle as string) || "Artwork"],
              arrangementType: (m.arrangementType as string) || "free_loan",
              revenueSharePercent: m.revenueSharePercent as number | undefined,
              message: content,
            }).catch((err) => { if (err) console.error("Fire-and-forget error:", err); });
          }
        }
      }
    }

    // Handle placement response — update placement status
    if (messageType === "placement_response" && metadata) {
      const m = metadata as Record<string, unknown>;
      const placementId = m.placementId as string;
      const responseStatus = m.status as string;

      if (placementId && (responseStatus === "active" || responseStatus === "declined")) {
        await db.from("placements").update({
          status: responseStatus,
          responded_at: new Date().toISOString(),
        }).eq("id", placementId);

        // Notify the other party
        const { data: placement } = await db.from("placements").select("artist_user_id, venue, artist_slug").eq("id", placementId).single();
        if (placement?.artist_user_id) {
          const { data: artistProfile } = await db.from("artist_profiles").select("name").eq("user_id", placement.artist_user_id).single();
          const { data: { user: artistUser } } = await db.auth.admin.getUserById(placement.artist_user_id);
          if (artistUser?.email && artistProfile) {
            notifyPlacementResponse({
              email: artistUser.email,
              artistName: artistProfile.name,
              venueName: placement.venue || "Venue",
              accepted: responseStatus === "active",
            }).catch((err) => { if (err) console.error("Fire-and-forget error:", err); });
          }
        }
      }
    }

    // Notify recipient by email (for text messages) — respects opt-out
    if (!messageType || messageType === "text") {
      const { data: recipientArtist } = await db
        .from("artist_profiles")
        .select("name, slug, user_id, message_notifications_enabled")
        .eq("slug", recipientSlug)
        .single();

      if (recipientArtist) {
        if (recipientArtist.message_notifications_enabled !== false && recipientArtist.user_id) {
          const { data: { user: recipientUser } } = await db.auth.admin.getUserById(recipientArtist.user_id);
          if (recipientUser?.email) {
            notifyNewMessage({ email: recipientUser.email, name: recipientArtist.name, senderName: resolvedSenderSlug, messagePreview: content });
          }
        }
      } else {
        const { data: vp } = await db
          .from("venue_profiles")
          .select("name, user_id, message_notifications_enabled")
          .eq("slug", recipientSlug)
          .single();

        if (vp?.user_id && vp.message_notifications_enabled !== false) {
          const { data: { user: recipientUser } } = await db.auth.admin.getUserById(vp.user_id);
          if (recipientUser?.email) {
            notifyNewMessage({ email: recipientUser.email, name: vp.name, senderName: resolvedSenderSlug, messagePreview: content });
          }
        }
      }
    }

    return NextResponse.json({ success: true, conversationId: cid });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
