import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { contactSchema } from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendAdminAlert } from "@/lib/email/admin-alert";

export async function POST(request: Request) {
  const limited = await checkRateLimit(request, 5, 60000);
  if (limited) return limited;
  try {
    const body = await request.json();
    const parsed = contactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const { name, email, type, message } = parsed.data;

    const { error } = await supabase.from("contact_submissions").insert({
      name,
      email,
      type,
      message,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }

    // K1: was notifyAdminNewContact in the legacy module.
    await sendAdminAlert({
      idempotencyKey: `admin_new_contact:${email.toLowerCase()}:${type}:${message.slice(0, 64)}`,
      subject: `New contact form submission from ${name}`,
      summary: `${name} sent a message through the contact form.`,
      fields: [
        { label: "Email", value: email },
        { label: "Type", value: type },
        { label: "Message", value: message },
      ],
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
