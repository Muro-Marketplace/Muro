import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userEmail, userType, termsVersion, termsType } = body;

    if (!userEmail || !userType || !termsVersion || !termsType) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Try to get authenticated user, but allow unauthenticated with email
    const { user } = await getAuthenticatedUser(request);
    // E23a: soft demo guard. Unauthenticated acceptance by email is supported,
    // so this fires only for a demo session.
    const demoResp = assertNotDemo(user?.id ?? null);
    if (demoResp) return demoResp;

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = request.headers.get("user-agent") || null;

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from("terms_acceptances").insert({
      user_id: user?.id || null,
      user_email: userEmail,
      user_type: userType,
      terms_version: termsVersion,
      terms_type: termsType,
      ip_address: ip,
      user_agent: userAgent,
      accepted_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Terms acceptance insert error:", error);
      return NextResponse.json(
        { error: "Failed to record terms acceptance" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
