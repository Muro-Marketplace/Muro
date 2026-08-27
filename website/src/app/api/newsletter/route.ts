import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

// Simple email-only mailing list endpoint. Distinct from /api/waitlist
// (pre-launch signup with name + role), this is "be first to see new works".

const schema = z.object({
  email: z.string().email("Please enter a valid email address").max(320),
  source: z.string().max(50).optional(),
});

export async function POST(request: Request) {
  // 5 signups per minute per IP.
  const limited = await checkRateLimit(request, 5, 60_000);
  if (limited) return limited;

  let body: unknown = {};
  try { body = await request.json(); } catch { /* fall through, schema will reject */ }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid email" },
      { status: 400 }
    );
  }

  const db = getSupabaseAdmin();
  const { error } = await db.from("newsletter_subscribers").insert({
    email: parsed.data.email.toLowerCase(),
    source: parsed.data.source || "website",
  });

  // Unique-constraint violation = already subscribed. Return exactly what a
  // fresh subscribe returns, so this is not a membership oracle.
  //
  // E36d: the comment used to claim that and the code did not deliver it — the
  // 200 carried `alreadySubscribed: true`, which is the same leak one level
  // down. Reading a boolean off the body is no harder than reading a status.
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      console.warn("[newsletter] duplicate subscribe for an existing email");
      return NextResponse.json({ ok: true });
    }
    console.error("Newsletter subscribe error:", error);
    return NextResponse.json({ error: "Could not subscribe, please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
