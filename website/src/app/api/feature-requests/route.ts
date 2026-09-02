// /api/feature-requests
//
// GET — list public feature requests (paginated, sorted by upvotes desc).
// POST — submit a new request. Auth optional; anonymous submissions
//        record an email for follow-up.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().min(10).max(4000),
  category: z.string().max(40).optional(),
  email: z.string().email().max(320).optional(),
  role: z.enum(["artist", "venue", "customer", "other"]).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "open";
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("feature_requests")
    .select("id, title, description, category, status, upvotes, role, created_at")
    .eq("status", status)
    .order("upvotes", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[feature-requests GET]", error);
    return NextResponse.json({ error: "Could not load requests" }, { status: 500 });
  }
  return NextResponse.json({ requests: data || [] });
}

export async function POST(request: Request) {
  const limited = await checkRateLimit(request, 10, 60_000);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission" }, { status: 400 });
  }

  // Auth is optional. If signed in we link the request to the user;
  // otherwise we just record the email.
  const auth = await getAuthenticatedUser(request);
  const userId = auth.error ? null : auth.user?.id || null;

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("feature_requests")
    .insert({
      user_id: userId,
      email: parsed.data.email || (userId ? auth.user?.email || null : null),
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      category: parsed.data.category || null,
      role: parsed.data.role || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[feature-requests POST]", error);
    return NextResponse.json({ error: "Could not save request" }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data?.id });
}
