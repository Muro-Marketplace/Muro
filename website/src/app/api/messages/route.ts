import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemoStrict } from "@/lib/demo-guard";
import { isAdminRequest } from "@/lib/admin-auth";
import { messageSchema } from "@/lib/validations";
import { checkArtistOutreachCap } from "@/lib/outreach-cap";
import { orFilter } from "@/lib/db/safe-filter";
import { assertPlacementParty, handleAuthzError } from "@/lib/authz";
import { canPlacementTransition } from "@/lib/placements/state-machine";
import { moderateMessage } from "@/lib/moderation";
import { isFlagOn } from "@/lib/feature-flags";
import { notifyPlacementRequest, notifyPlacementResponse } from "@/lib/email";
import { sendEmail } from "@/lib/email/send";
import { MessageUnreadNotification } from "@/emails/templates/messages/MessageUnreadNotification";
import { artists as staticArtists } from "@/data/artists";
import { venues as staticVenues } from "@/data/venues";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

// Helper: send a message_unread notification via the new pipeline. Fires
// immediately for MVP, once Inngest is wired, this becomes a delayed
// event that cancels if the recipient reads the message in-app first.
async function sendMessageUnreadEmail(args: {
  recipientEmail: string;
  recipientUserId: string | null;
  recipientFirstName: string;
  senderName: string;
  messagePreview: string;
  conversationId: string;
  messageId: string | number;
}) {
  const conversationUrl = `${SITE}/artist-portal/messages?c=${encodeURIComponent(args.conversationId)}`;
  await sendEmail({
    idempotencyKey: `message_unread:${args.messageId}`,
    template: "message_unread_notification",
    category: "messages",
    to: args.recipientEmail,
    subject: `${args.senderName} sent you a message`,
    userId: args.recipientUserId ?? undefined,
    react: MessageUnreadNotification({
      firstName: args.recipientFirstName,
      senderName: args.senderName,
      messagePreview: args.messagePreview.length > 200 ? args.messagePreview.slice(0, 197) + "…" : args.messagePreview,
      conversationUrl,
      muteMessagesUrl: `${SITE}/account/email`,
    }),
  });
}

// Slug → Human Readable (last-resort fallback used when we have no
// artist/venue profile match, turns "fin-coles" into "Fin Coles").
function formatSlugToName(slug: string): string {
  if (!slug) return "";
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// GET: fetch conversations for the authenticated user, enriched with profile data
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    const disputeId = searchParams.get("dispute_id");

    // A1 (Phase 2.8): admin chat access scoped to disputes. Admins can
    // read the conversation tied to a specific dispute_id; without the
    // param they fall through to the normal slug-owned view (which is
    // empty for anyone who isn't in the thread).
    if (disputeId) {
      if (!(await isAdminRequest(request))) {
        return NextResponse.json({ error: "Not authorised" }, { status: 403 });
      }
      const dbAdmin = getSupabaseAdmin();
      const { data: dispute } = await dbAdmin
        .from("disputes")
        .select("id, conversation_id")
        .eq("id", disputeId)
        .maybeSingle<{ id: string; conversation_id: string | null }>();
      if (!dispute || !dispute.conversation_id) {
        return NextResponse.json({ error: "Dispute / conversation not found" }, { status: 404 });
      }
      const { data: msgs } = await dbAdmin
        .from("messages")
        .select("*")
        .eq("conversation_id", dispute.conversation_id)
        .order("created_at", { ascending: true });
      // Audit the read. A failure blocks the response so the caller
      // cannot silently bypass the audit trail (4.2).
      const { recordAdminAction } = await import("@/lib/admin-audit");
      try {
        await recordAdminAction({
          adminUserId: auth.user!.id,
          action: "messages.read.dispute_scoped",
          context: { dispute_id: disputeId, conversation_id: dispute.conversation_id },
        });
      } catch (e) {
        console.error("[messages] dispute audit write failed:", e);
        return NextResponse.json({ error: "Audit log failed" }, { status: 500 });
      }
      return NextResponse.json({
        messages: msgs ?? [],
        conversations: [],
        adminScopedToDispute: true,
      });
    }

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
      .or(orFilter([`recipient_slug.eq.${safeSlug}`, `sender_name.eq.${safeSlug}`]))
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
      // Special-case the Wallplace Support system thread so it never
      // renders as the raw slug "wallplace-support".
      const isSupport = conv.otherParty === "wallplace-support";
      return {
        ...conv,
        otherPartyDisplayName: isSupport
          ? "Wallplace Support"
          : (profile?.displayName || formatSlugToName(conv.otherParty)),
        otherPartyImage: profile?.image || null,
        otherPartyType: profile?.type || "artist",
        hasActivePlacement: placedSlugs.has(conv.otherParty),
      };
    });

    return NextResponse.json({ conversations: enriched });
  } catch (err) {
    // 01 §1.3, Phase E item 14. This was a bare `catch {}` answering 400 for
    // everything: an AuthzError that means 403 or 404, a schema failure, and a
    // genuine server fault were indistinguishable to the caller AND to us. The
    // authz status is preserved first, then the fault is logged, so a real bug
    // stops looking like a malformed body.
    const denied = handleAuthzError(err);
    if (denied) return denied;
    console.error("[messages] unhandled error", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// POST: send a new message (supports text, placement_request, placement_response)
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a: the demo guard existed but had ZERO call sites, while two doc comments
  // claimed it was wired. This handler reaches real people (real emails, real
  // money, or content on a public page), so it takes the STRICT 403 variant.
  const demoBlocked = assertNotDemoStrict(auth.user!.id);
  if (demoBlocked) return demoBlocked;

  try {
    const body = await request.json();
    const parsed = messageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { conversationId, senderType, recipientSlug, content, messageType, metadata, attachments } = parsed.data;

    // Allow empty content if there's at least one attachment.
    if (!content.trim() && (!attachments || attachments.length === 0)) {
      return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });
    }

    // ── Content moderation ──────────────────────────────────────────────────
    const moderation = moderateMessage(content);
    if (!moderation.allowed) {
      return NextResponse.json(
        { error: moderation.reason || "Message not allowed" },
        { status: 400 },
      );
    }

    // Deterministic conversation ID between two slugs so the thread always
    // resolves to the same row regardless of who sent first. Without this,
    // artist-to-venue messages could land in a brand-new random cid while
    // the UI was still keyed on a stale prior conversation, the thread
    // appeared to "jump" to the wrong venue.
    function deterministicCid(slugA: string, slugB: string): string {
      const [a, b] = [slugA, slugB].sort();
      return `dm-${a}__${b}`;
    }

    const db = getSupabaseAdmin();

    // Resolve the authenticated user's actual slug from their profile.
    // Never trust the client-provided `senderName`, the old fallback
    // (`|| parsed.data.senderName`) let an authenticated user without a
    // profile impersonate anyone by passing that slug in the body. If the
    // user has no artist/venue profile, reject outright rather than
    // quietly delivering a spoofed message.
    const { data: senderArtist } = await db.from("artist_profiles").select("slug").eq("user_id", auth.user!.id).maybeSingle();
    const { data: senderVenue } = !senderArtist
      ? await db.from("venue_profiles").select("slug").eq("user_id", auth.user!.id).maybeSingle()
      : { data: null };
    const resolvedSenderSlug = senderArtist?.slug || senderVenue?.slug || null;
    if (!resolvedSenderSlug) {
      return NextResponse.json(
        { error: "Your account is not set up to send messages yet, complete your artist or venue profile first." },
        { status: 403 },
      );
    }
    // Derive sender type from the profile we found, not the client input,
    // another impersonation vector otherwise.
    const resolvedSenderType: "artist" | "venue" = senderArtist ? "artist" : "venue";

    // Resolve the recipient user_id from their slug so RLS can scope reads to
    // both parties. Try artist first, then venue. If the slug matches nothing,
    // reject the send with a clear error rather than quietly delivering a
    // message that nobody will ever see, that was the source of the "tried
    // to message a venue and got silently redirected" issue (#18).
    const { data: recipArtist } = await db.from("artist_profiles").select("user_id").eq("slug", recipientSlug).maybeSingle();
    const { data: recipVenue } = !recipArtist
      ? await db.from("venue_profiles").select("user_id").eq("slug", recipientSlug).maybeSingle()
      : { data: null };
    const recipientUserId = recipArtist?.user_id || recipVenue?.user_id || null;
    if (!recipArtist && !recipVenue) {
      return NextResponse.json(
        { error: "We couldn't find that recipient on Wallplace. They may not have an account yet. If you want us to invite them, reply with their email and we'll send them an onboarding link." },
        { status: 404 },
      );
    }

    // E1 (Phase 2.4): block artist-to-artist new messages, gated by
    // GATING_V1 per the Phase 2 hard constraint "every behaviour-
    // change milestone behind a feature flag". Existing threads stay
    // readable (GET is unaffected). The dual-role case (artist with a
    // venue account too) is asked to switch portals — resolvedSenderType
    // already prefers artist over venue when both profiles exist.
    if (isFlagOn("GATING_V1") && resolvedSenderType === "artist" && !!recipArtist) {
      return NextResponse.json(
        {
          error: "Artist-to-artist messaging isn't supported. If you have a venue account, switch to your venue portal to message artists.",
          code: "artist_to_artist_blocked",
        },
        { status: 403 },
      );
    }

    // If the client didn't pass a conversationId, try to find an existing
    // thread between these two slugs first, then fall back to the
    // deterministic id so both sides land on the same row.
    let cid = conversationId;
    if (!cid) {
      const det = deterministicCid(resolvedSenderSlug, recipientSlug);
      const { data: existing } = await db
        .from("messages")
        .select("conversation_id")
        .or(
          `and(sender_name.eq.${resolvedSenderSlug},recipient_slug.eq.${recipientSlug}),and(sender_name.eq.${recipientSlug},recipient_slug.eq.${resolvedSenderSlug})`,
        )
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      cid = existing?.conversation_id || det;
    }

    // Anti-spam first-contact cap (#39). Unified across all surfaces: caps
    // NEW venue contacts per calendar day per tier (Core 2, Premium 5,
    // Pro 10) counting placements + first-contact messages +
    // artwork-request responses together. Replies inside an existing
    // thread are exempt via exemptConversationId. Only applies when an
    // ARTIST messages a VENUE; venue→artist messaging isn't capped here.
    const isFirstContactFromArtist =
      resolvedSenderType === "artist" && !!recipVenue && !conversationId && !!cid;
    if (isFirstContactFromArtist) {
      const cidLocal = cid as string; // narrowed by the !!cid guard above
      const cap = await checkArtistOutreachCap(db, auth.user!.id, 1, {
        exemptConversationId: cidLocal,
      });
      if (!cap.ok) {
        return NextResponse.json(
          {
            error: "outreach_limit_reached",
            message: cap.result.message,
            limit: cap.result.limit,
            sent: cap.result.used,
            plan: cap.result.plan,
          },
          { status: 429 },
        );
      }
    }

    // Try insert with new columns first, fall back to base columns if they don't exist yet
    const baseRow = {
      conversation_id: cid,
      sender_id: auth.user!.id,
      sender_name: resolvedSenderSlug,
      sender_type: resolvedSenderType,
      recipient_slug: recipientSlug,
      recipient_user_id: recipientUserId,
      content,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    // If moderation flagged the message, tag it for admin review
    const extendedRow = {
      ...baseRow,
      message_type: messageType || "text",
      metadata: metadata || {},
      attachments: attachments || [],
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

    // Handle placement request, create a pending placement
    if (messageType === "placement_request" && metadata) {
      const m = metadata as Record<string, unknown>;
      const placementId = `p-msg-${Date.now()}`;

      // Determine who is artist and who is venue, use the server-resolved
      // role, not the client-provided `senderType`, to close the same
      // impersonation vector that `resolvedSenderSlug` fixes above.
      const senderIsArtist = resolvedSenderType === "artist";
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
          requester_user_id: auth.user!.id,
          created_at: new Date().toISOString(),
        });
        if (placementError) console.error("Placement insert error:", placementError);

        // Re-stamp the message row we just inserted with requesterUserId
        // so MessageInbox can gate Accept/Decline reliably even if the
        // client sender_id is missing (legacy anon rows).
        await db
          .from("messages")
          .update({ metadata: { ...(metadata as Record<string, unknown>), placementId, requesterUserId: auth.user!.id } })
          .eq("conversation_id", cid)
          .eq("sender_id", auth.user!.id)
          .eq("message_type", "placement_request")
          .is("metadata->>requesterUserId", null);

        // Notify the recipient about the placement request
        const recipientIsArtist = !senderIsArtist;
        const recipientProfile = recipientIsArtist ? artistProfile : venueProfileData;
        if (recipientProfile?.user_id) {
          const { data: { user: recipientUser } } = await db.auth.admin.getUserById(recipientProfile.user_id);
          if (recipientUser?.email) {
            const senderProfile = senderIsArtist ? artistProfile : venueProfileData;
            await notifyPlacementRequest({
              email: recipientUser.email,
              venueName: venueProfileData.name,
              artistName: artistProfile.name,
              workTitles: [(m.workTitle as string) || "Artwork"],
              arrangementType: (m.arrangementType as string) || "free_loan",
              revenueSharePercent: m.revenueSharePercent as number | undefined,
              message: content,
            }).catch((err) => { if (err) console.error("notifyPlacementRequest error:", err); });
          }
        }
      }
    }

    // Handle placement response, update placement status
    if (messageType === "placement_response" && metadata) {
      const m = metadata as Record<string, unknown>;
      const placementId = m.placementId as string;
      const responseStatus = m.status as string;

      if (placementId && (responseStatus === "active" || responseStatus === "declined")) {
        // E33. placementId and status came straight off client-supplied
        // metadata and were written with the service-role client, so RLS never
        // intervened. Any account with a profile could accept or decline ANY
        // placement by guessing an id, and the notification email then told the
        // artist their venue had accepted. This was a second, unguarded door to
        // the state change that PATCH /api/placements protects.
        //
        // assertPlacementParty is the boundary: it re-reads the row filtered to
        // artist_user_id or venue_user_id = the caller, so a non-party gets
        // placement_not_found rather than a write.
        const placement = await assertPlacementParty(auth.user!, placementId, db);

        // A known proposer may not answer their own request. Applied only when
        // proposed_by_user_id is populated: prod has it on 2 of 86 rows, so
        // treating "unknown proposer" as a refusal (which is what canRespond
        // does) would block legitimate responses on the other 84. Widening that
        // is 01 Phase D item 10's effective-requester work, and duplicating its
        // fallback here would make a third copy of the rule.
        if (placement.proposed_by_user_id && placement.proposed_by_user_id === auth.user!.id) {
          return NextResponse.json(
            { error: "You can't respond to your own placement request." },
            { status: 403 },
          );
        }

        const transition = canPlacementTransition(placement.status, responseStatus);
        if (!transition.ok) {
          return NextResponse.json({ error: transition.reason }, { status: 422 });
        }

        // Compare-and-set on pending, so two concurrent responses cannot both
        // land and the second cannot overwrite the first.
        const { data: updated, error: updErr } = await db
          .from("placements")
          .update({ status: responseStatus, responded_at: new Date().toISOString() })
          .eq("id", placementId)
          .eq("status", "pending")
          .select("id");
        if (updErr) {
          console.error("[messages] placement response update failed", updErr);
          return NextResponse.json({ error: "Could not update placement" }, { status: 500 });
        }
        if (!updated || updated.length === 0) {
          return NextResponse.json(
            { error: "This placement has already been answered." },
            { status: 409 },
          );
        }

        // Notify the other party. The row assertPlacementParty already fetched
        // carries artist_user_id, venue and artist_slug, so the second SELECT
        // that used to sit here is gone rather than left beside it.
        if (placement.artist_user_id) {
          const { data: artistProfile } = await db.from("artist_profiles").select("name").eq("user_id", placement.artist_user_id).single();
          const { data: { user: artistUser } } = await db.auth.admin.getUserById(placement.artist_user_id);
          if (artistUser?.email && artistProfile) {
            await notifyPlacementResponse({
              email: artistUser.email,
              artistName: artistProfile.name,
              venueName: placement.venue || "Venue",
              accepted: responseStatus === "active",
            }).catch((err) => { if (err) console.error("notifyPlacementResponse error:", err); });
          }
        }
      }
    }

    // Notify recipient by email (for text messages), respects opt-out
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
            await sendMessageUnreadEmail({
              recipientEmail: recipientUser.email,
              recipientUserId: recipientArtist.user_id,
              recipientFirstName: recipientArtist.name.split(" ")[0] || "there",
              senderName: resolvedSenderSlug,
              messagePreview: content,
              conversationId: cid || "",
              // Sending immediately for MVP, once Inngest is wired, queue
              // with a 10-minute delay and cancel-if-read.
              messageId: Date.now(),
            });
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
            await sendMessageUnreadEmail({
              recipientEmail: recipientUser.email,
              recipientUserId: vp.user_id,
              recipientFirstName: vp.name.split(" ")[0] || "there",
              senderName: resolvedSenderSlug,
              messagePreview: content,
              conversationId: cid || "",
              messageId: Date.now(),
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true, conversationId: cid });
  } catch (err) {
    // Without this, the bare catch below swallowed AuthzError and reported a
    // 400 for what is a 404 or 403, which would have made E33's new guard
    // indistinguishable from a malformed body (01 §1.3).
    const denied = handleAuthzError(err);
    if (denied) return denied;
    // Logged, not swallowed: a real fault here used to be
    // indistinguishable from a malformed body (Phase E item 14).
    console.error("[messages] unhandled error", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// PATCH /api/messages, bulk-mark read.
// Body: { all: true }   marks every unread message addressed to the
//                       current user as read.
//
// The per-conversation PATCH at /api/messages/[conversationId] still
// exists for the in-thread "I'm reading this thread" path. This
// endpoint is for the "Mark all as read" affordance in the header
// inbox dropdown, one click clears the unread badge across every
// thread without having to open each one.
export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  let body: { all?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.all !== true) {
    return NextResponse.json(
      { error: "Pass { all: true } to mark all messages read." },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();

  // Resolve the current user's slug, messages.recipient_slug is
  // either an artist or venue slug. We mark by slug so a single
  // user with both a venue and an artist account doesn't accidentally
  // wipe the wrong inbox; in practice users have only one role, but
  // the slug guard keeps it explicit either way.
  const userId = auth.user!.id;
  const [artistRes, venueRes] = await Promise.all([
    db.from("artist_profiles").select("slug").eq("user_id", userId).maybeSingle(),
    db.from("venue_profiles").select("slug").eq("user_id", userId).maybeSingle(),
  ]);
  const slugs = [artistRes.data?.slug, venueRes.data?.slug].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  if (slugs.length === 0) {
    // No profile yet, nothing to mark. Treat as no-op success.
    return NextResponse.json({ success: true, updated: 0 });
  }

  const { error, count } = await db
    .from("messages")
    .update({ is_read: true }, { count: "exact" })
    .in("recipient_slug", slugs)
    .eq("is_read", false);

  if (error) {
    console.error("[messages PATCH all] failed:", error);
    return NextResponse.json({ error: "Failed to mark read" }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: count ?? 0 });
}
