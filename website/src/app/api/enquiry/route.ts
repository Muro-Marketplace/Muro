import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { enquirySchema } from "@/lib/validations";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { sendMessageUnreadEmail } from "@/lib/email/notifications";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";
import { checkRateLimit } from "@/lib/rate-limit";

// Enquiries are messages from the public TO AN ARTIST (the enquiry form
// lives on the public artist profile and rows key on artist_slug). E27
// (QA 2026-08-28): the venue portal shipped an enquiries page that GET this
// route, which had no GET handler, so it 405'd forever — and venues were
// never the audience anyway. The GET below serves the authenticated ARTIST
// their own enquiries; the venue page is gone.

/** Statuses the artist can move an enquiry between. Every row starts
 *  "pending" (set by POST); "handled" is the artist's done-with-this flag. */
const ENQUIRY_STATUSES = ["pending", "handled"] as const;

type ArtistSlugResult =
  | { slug: string; error?: undefined }
  | { slug?: undefined; error: NextResponse };

/** The artist slug for a verified user id, or a 403 to return as-is. */
async function requireArtistSlugForUser(userId: string): Promise<ArtistSlugResult> {
  const db = getSupabaseAdmin();
  const { data: profile } = await db
    .from("artist_profiles")
    .select("slug")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile?.slug) {
    return {
      error: NextResponse.json(
        { error: "Only artist accounts receive enquiries" },
        { status: 403 },
      ),
    };
  }
  return { slug: profile.slug };
}

/** Authenticate the request and resolve the caller's artist slug. */
async function requireArtistSlug(request: Request): Promise<ArtistSlugResult> {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return { error: auth.error };
  return requireArtistSlugForUser(auth.user!.id);
}

// GET /api/enquiry — the authenticated artist's enquiries, newest first.
export async function GET(request: Request) {
  const artist = await requireArtistSlug(request);
  if (artist.error) return artist.error;

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("enquiries")
    .select("id, sender_name, sender_email, work_title, enquiry_type, message, status, created_at")
    .eq("artist_slug", artist.slug)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[enquiry] GET failed:", error);
    return NextResponse.json({ error: "Could not load enquiries" }, { status: 500 });
  }

  return NextResponse.json({ enquiries: data || [] });
}

// PATCH /api/enquiry — mark one of the artist's own enquiries handled (or
// back to pending). Body: { id, status }. The update is scoped to the
// caller's artist_slug, so an id belonging to another artist matches zero
// rows and answers 404.
export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a idiom: soft demo guard on portal mutations. 200 + {demo:true} so
  // the portal can toast without unwinding optimistic state.
  const demoResp = assertNotDemo(auth.user!.id);
  if (demoResp) return demoResp;

  const artist = await requireArtistSlugForUser(auth.user!.id);
  if (artist.error) return artist.error;

  const body = await request.json().catch(() => null);
  const id = (body as { id?: unknown } | null)?.id;
  const status = (body as { status?: unknown } | null)?.status;

  if ((typeof id !== "number" && typeof id !== "string") || typeof status !== "string" ||
      !(ENQUIRY_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: "Body must be { id, status } with status \"pending\" or \"handled\"" },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("enquiries")
    .update({ status })
    .eq("id", id)
    .eq("artist_slug", artist.slug)
    .select("id, status");

  if (error) {
    console.error("[enquiry] PATCH failed:", error);
    return NextResponse.json({ error: "Could not update enquiry" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, enquiry: data[0] });
}

export async function POST(request: Request) {
  const limited = await checkRateLimit(request, 5, 60000);
  if (limited) return limited;
  try {
    const body = await request.json();
    const parsed = enquirySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const { senderName, senderEmail, artistSlug, workTitle, enquiryType, message } = parsed.data;

    const { error } = await supabase.from("enquiries").insert({
      // NOT the sender's display name: messages.sender_name is an identity
      // column matched against slugs elsewhere, so a human name would be the
      // wrong shape. The real name is carried in the message body below.
      sender_name: senderEmail.split("@")[0],
      sender_email: senderEmail,
      artist_slug: artistSlug,
      work_title: workTitle || null,
      enquiry_type: enquiryType,
      message,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }

    // Owner-reported 2026-08-30: the alert read "New enquiry for fin-coles".
    // The slug is the lookup key, not a person's name, and it should never be
    // what a human reads. Resolve the artist's real name, de-slugging only as
    // a fallback for a profile with no name set.
    const { data: enquiryArtist } = await supabase
      .from("artist_profiles")
      .select("name")
      .eq("slug", artistSlug)
      .maybeSingle<{ name: string | null }>();
    const artistDisplayName =
      enquiryArtist?.name?.trim() ||
      artistSlug
        .split("-")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ") ||
      "an artist";

    // K1: was notifyAdminNewEnquiry in the legacy module.
    await sendAdminAlert({
      idempotencyKey: `admin_new_enquiry:${senderEmail.toLowerCase()}:${artistSlug}:${message.slice(0, 64)}`,
      subject: `New enquiry for ${artistDisplayName}`,
      summary: `${senderName} sent an enquiry through the public artist page.`,
      fields: [
        { label: "From", value: `${senderName} <${senderEmail}>` },
        { label: "Artist", value: `${artistDisplayName} (${artistSlug})` },
        { label: "Type", value: enquiryType },
        { label: "Message", value: message },
      ],
    });

    // Also create a message in the messaging system so it appears in the artist's inbox
    const db = getSupabaseAdmin();
    const cid = `conv-enq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: insertedMessage } = await db.from("messages").insert({
      conversation_id: cid,
      sender_id: null,
      sender_name: senderName,
      sender_type: "anonymous",
      recipient_slug: artistSlug,
      content: `${workTitle ? `Re: ${workTitle}\n\n` : ""}${message}\n\nFrom ${senderName} (${senderEmail})`,
      message_type: "text",
      metadata: {},
      is_read: false,
      created_at: new Date().toISOString(),
    })
      // The dedupe key for the notification below. Keyed on the conversation it
      // dropped a second genuine enquiry in an existing thread.
      .select("id")
      .maybeSingle<{ id: string }>();

    // Notify the artist by email
    const { data: artistProfile } = await db
      .from("artist_profiles")
      .select("name, user_id")
      .eq("slug", artistSlug)
      .single();

    if (artistProfile?.user_id) {
      const { data: { user: artistUser } } = await db.auth.admin.getUserById(artistProfile.user_id);
      if (artistUser?.email) {
        // K1: was notifyNewMessage in the legacy module, which sent from an
        // unverified domain with no unsubscribe header, no preference check and
        // no record that it was attempted.
        //
        // 09 item 2.2: and then it was a hand-written second copy of the send
        // that api/messages does, which had drifted. This one did not truncate
        // the preview, so a long enquiry shipped whole into a block sized for
        // 200 characters, and it keyed on the CONVERSATION, so a genuine second
        // enquiry in an existing thread was dropped as a duplicate. Both are
        // fixed by there being one function.
        await sendMessageUnreadEmail({
          messageId: insertedMessage?.id ?? cid,
          recipientEmail: artistUser.email,
          recipientUserId: artistProfile.user_id,
          recipientName: artistProfile.name,
          recipientPortal: "artist",
          senderName,
          messagePreview: message,
          conversationId: cid,
          metadata: { artistSlug },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
