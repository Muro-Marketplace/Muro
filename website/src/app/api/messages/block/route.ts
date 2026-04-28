// Block-user endpoint (#20). Records the block in `user_blocks` so
// the messages API can later filter the blocker's inbox + reject
// attempted messages from blocked accounts. The send-message path
// will need to enforce this in a follow-up; for now we persist the
// block so the data is captured, and the conversation-list
// aggregator can begin honouring it incrementally.

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = await checkRateLimit(request, 12, 60_000);
  if (limited) return limited;

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { otherParty } = (body || {}) as { otherParty?: string };
  if (!otherParty || typeof otherParty !== "string") {
    return NextResponse.json({ error: "otherParty is required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { error } = await db.from("user_blocks").upsert({
    blocker_user_id: auth.user!.id,
    blocked_slug: otherParty,
  }, { onConflict: "blocker_user_id,blocked_slug" });
  if (error) {
    console.warn("[messages/block] insert failed:", error.message, {
      blocker: auth.user!.id,
      blocked: otherParty,
    });
  }
  return NextResponse.json({ ok: true });
}
