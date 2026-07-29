import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertConversationParticipant, handleAuthzError } from "@/lib/authz";

// E31. Conversation ids are `dm-${slugA}__${slugB}` built from two PUBLIC profile
// slugs, so they are guessable, not secret. Every handler here therefore proves
// participation against the message rows via assertConversationParticipant rather
// than trusting the id, the caller's word, or the request body. Denial is 404: a
// 403 would confirm the conversation exists, which is the enumeration oracle.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { conversationId } = await params;
    const db = getSupabaseAdmin();

    // Was: authenticated, then read every message for whatever id was supplied.
    // Any signed-in user could enumerate ids from public slugs and read the lot.
    await assertConversationParticipant(auth.user!, conversationId, db);

    const { data, error } = await db
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
    }

    return NextResponse.json({ messages: data || [] });
  } catch (err) {
    const denied = handleAuthzError(err);
    if (denied) return denied;
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// PATCH: mark messages as read
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { conversationId } = await params;
    const db = getSupabaseAdmin();

    // The reader is whoever is signed in. This used to come from the request
    // body as `readerSlug`, so a caller could mark somebody else's messages as
    // read. The gate returns the caller's own slugs, and a user may hold both an
    // artist and a venue slug, hence the .in().
    const { slugs } = await assertConversationParticipant(auth.user!, conversationId, db);
    if (slugs.length === 0) {
      return NextResponse.json({ error: "Profile not found" }, { status: 400 });
    }

    const { error } = await db
      .from("messages")
      .update({ is_read: true })
      .eq("conversation_id", conversationId)
      .in("recipient_slug", slugs)
      .eq("is_read", false);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const denied = handleAuthzError(err);
    if (denied) return denied;
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE: delete all messages in a conversation
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { conversationId } = await params;
    const db = getSupabaseAdmin();

    // This handler had its own participation check: look up the caller's slug,
    // read one message row, compare sender_name/recipient_slug in application
    // code. That is a second implementation of the same rule, and the weaker
    // fetch-then-compare shape. Replaced by the shared gate, which also covers
    // the modern sender_id / recipient_user_id columns the inline version missed.
    await assertConversationParticipant(auth.user!, conversationId, db);

    const { error } = await db
      .from("messages")
      .delete()
      .eq("conversation_id", conversationId);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to delete conversation" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const denied = handleAuthzError(err);
    if (denied) return denied;
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
