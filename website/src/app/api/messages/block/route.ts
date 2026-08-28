// Block-user endpoint (#20). Records the block in `user_blocks`.
//
// **`user_blocks` had never existed.** The insert failed every time, the error
// was swallowed into a `console.warn`, and the route answered `{ ok: true }`. So
// a person who blocked someone was told it worked and nothing was recorded
// anywhere: the blocked account could still message them and no inbox filtered
// on it. The header here described reading the table back "in a follow-up"; it
// could never have read anything. Migration 111 creates it, and the swallow is
// gone: a block that does not persist is not a block.
//
// STILL A FOLLOW-UP, and now actually possible: nothing READS this table yet.
// The send path and the conversation-list aggregator have to honour it before a
// block does anything beyond being recorded. Surfaced in PROGRESS.

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = await checkRateLimit(request, 12, 60_000);
  if (limited) return limited;

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a: soft demo guard. 200 + {demo:true} so the portal can toast without
  // unwinding optimistic state. The helper had zero call sites while two doc
  // comments claimed it was enforced.
  const demoResp = assertNotDemo(auth.user!.id);
  if (demoResp) return demoResp;

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
    console.error("[messages/block] upsert FAILED, the block is lost:", error.message, {
      blocker: auth.user!.id,
      blocked: otherParty,
    });
    return NextResponse.json({ error: "Could not record the block" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
