import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { enquirySchema } from "@/lib/validations";
import { notifyAdminNewEnquiry, notifyNewMessage } from "@/lib/email";
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

    notifyAdminNewEnquiry({ senderName, senderEmail, artistSlug, enquiryType, message });

    // Also create a message in the messaging system so it appears in the artist's inbox
    const db = getSupabaseAdmin();
    const cid = `conv-enq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await db.from("messages").insert({
      conversation_id: cid,
      sender_id: null,
      sender_name: senderEmail.split("@")[0],
      sender_type: "anonymous",
      recipient_slug: artistSlug,
      content: `${workTitle ? `Re: ${workTitle}\n\n` : ""}${message}\n\n– ${senderName} (${senderEmail})`,
      message_type: "text",
      metadata: {},
      is_read: false,
      created_at: new Date().toISOString(),
    });

    // Notify the artist by email
    const { data: artistProfile } = await db
      .from("artist_profiles")
      .select("name, user_id")
      .eq("slug", artistSlug)
      .single();

    if (artistProfile?.user_id) {
      const { data: { user: artistUser } } = await db.auth.admin.getUserById(artistProfile.user_id);
      if (artistUser?.email) {
        notifyNewMessage({
          email: artistUser.email,
          name: artistProfile.name,
          senderName,
          messagePreview: message,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
