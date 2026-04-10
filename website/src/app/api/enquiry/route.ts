import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { senderName, senderEmail, artistSlug, workTitle, enquiryType, message } = body;

    if (!senderName || !senderEmail || !artistSlug || !enquiryType || !message) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

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

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
