import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { enquirySchema } from "@/lib/validations";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { sendMessageUnreadEmail } from "@/lib/email/notifications";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

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
      sender_name: senderName,
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

    // K1: was notifyAdminNewEnquiry in the legacy module.
    await sendAdminAlert({
      idempotencyKey: `admin_new_enquiry:${senderEmail.toLowerCase()}:${artistSlug}:${message.slice(0, 64)}`,
      subject: `New enquiry for ${artistSlug}`,
      summary: `${senderName} sent an enquiry through the public artist page.`,
      fields: [
        { label: "From", value: `${senderName} <${senderEmail}>` },
        { label: "Artist", value: artistSlug },
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
      sender_name: senderEmail.split("@")[0],
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
