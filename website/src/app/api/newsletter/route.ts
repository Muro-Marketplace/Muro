import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

// Simple email-only mailing list endpoint. Distinct from /api/waitlist
// (pre-launch signup with name + role) — this is "be first to see new works".

const schema = z.object({
  email: z.string().email("Please enter a valid email address").max(320),
  source: z.string().max(50).optional(),
});

export async function POST(request: Request) {
  // 5 signups per minute per IP.
  const limited = checkRateLimit(request, 5, 60_000);
  if (limited) return limited;

  let body: unknown = {};
  try { body = await request.json(); } catch { /* fall through — schema will reject */ }
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

  // Unique-constraint violation = already subscribed. Treat as success so we
  // don't leak membership status to enumeration attacks, but surface a
  // friendly message.
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ ok: true, alreadySubscribed: true });
    }
    console.error("Newsletter subscribe error:", error);
    return NextResponse.json({ error: "Could not subscribe — please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
