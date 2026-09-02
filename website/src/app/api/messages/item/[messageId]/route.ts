import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

// Per-message actions: pin, unpin, soft-delete. Lives at /api/messages/item/[id]
// so it doesn't collide with the conversation-level routes at /api/messages/[id].

async function loadMessage(db: ReturnType<typeof getSupabaseAdmin>, id: string) {
  const { data } = await db
    .from("messages")
    .select("id, conversation_id, sender_id, sender_name, recipient_slug")
    .eq("id", id)
    .maybeSingle();
  return data as { id: number; conversation_id: string; sender_id: string | null; sender_name: string; recipient_slug: string } | null;
}

async function userSlug(db: ReturnType<typeof getSupabaseAdmin>, userId: string) {
  const { data: a } = await db.from("artist_profiles").select("slug").eq("user_id", userId).maybeSingle();
  if (a?.slug) return a.slug;
  const { data: v } = await db.from("venue_profiles").select("slug").eq("user_id", userId).maybeSingle();
  return v?.slug || null;
}

export async function PATCH(request: Request, ctx: { params: Promise<{ messageId: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  try {
    const { messageId } = await ctx.params;
    const body = await request.json();
    const action = body.action as "pin" | "unpin" | undefined;
    if (action !== "pin" && action !== "unpin") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    const db = getSupabaseAdmin();
    const msg = await loadMessage(db, messageId);
    if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Either party in the conversation can pin / unpin, pins are a
    // shared bookmark on the thread, not a personal label.
    const slug = await userSlug(db, auth.user!.id);
    if (!slug || (msg.sender_name !== slug && msg.recipient_slug !== slug)) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }

    const updates: Record<string, unknown> = action === "pin"
      ? { pinned_at: new Date().toISOString(), pinned_by_user_id: auth.user!.id }
      : { pinned_at: null, pinned_by_user_id: null };

    const { error } = await db.from("messages").update(updates).eq("id", messageId);
    if (error) {
      console.warn("Pin update failed:", error.message);
      return NextResponse.json({ error: "Could not save pin" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// Soft-delete: only the original sender can remove their own message.
// We mark deleted_at and blank the content rather than dropping the row,
// so timestamps + thread shape remain coherent for the other party.
export async function DELETE(request: Request, ctx: { params: Promise<{ messageId: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  try {
    const { messageId } = await ctx.params;
    const db = getSupabaseAdmin();
    const msg = await loadMessage(db, messageId);
    if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const slug = await userSlug(db, auth.user!.id);
    const isSender = (msg.sender_id && msg.sender_id === auth.user!.id) || (slug && msg.sender_name === slug);
    if (!isSender) {
      return NextResponse.json({ error: "You can only delete messages you sent" }, { status: 403 });
    }

    const { error } = await db
      .from("messages")
      .update({ deleted_at: new Date().toISOString(), content: "" })
      .eq("id", messageId);

    if (error) {
      // pinned_at / deleted_at columns may not exist in older envs, fall
      // back to a hard delete so the user's intent is honoured.
      const fallback = await db.from("messages").delete().eq("id", messageId);
      if (fallback.error) {
        console.error("Delete failed:", error.message, fallback.error.message);
        return NextResponse.json({ error: "Could not delete" }, { status: 500 });
      }
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
