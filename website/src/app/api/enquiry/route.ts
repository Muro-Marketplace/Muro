import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { enquirySchema } from "@/lib/validations";
import { notifyAdminNewEnquiry, notifyNewMessage } from "@/lib/email";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
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

    // Also notify the artist by email
    const db = getSupabaseAdmin();
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
