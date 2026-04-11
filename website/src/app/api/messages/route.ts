import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { messageSchema } from "@/lib/validations";
import { notifyNewMessage } from "@/lib/email";

// GET: fetch conversations for the authenticated user
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");

    if (!slug || slug.length > 100) {
      return NextResponse.json({ error: "slug parameter required" }, { status: 400 });
    }

    // Sanitize slug — strip anything that isn't alphanumeric, dash, or underscore
    const safeSlug = slug.replace(/[^a-zA-Z0-9_-]/g, "");

    // Verify the slug belongs to the authenticated user
    const db = getSupabaseAdmin();
    const { data: ownerProfile } = await db
      .from("artist_profiles")
      .select("slug")
      .eq("user_id", auth.user!.id)
      .single();

    const { data: venueProfile } = !ownerProfile
      ? await db.from("venue_profiles").select("slug").eq("user_id", auth.user!.id).single()
      : { data: null };

    const userSlug = ownerProfile?.slug || venueProfile?.slug;
    if (userSlug !== safeSlug) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get all messages where this user is sender or recipient
    const { data, error } = await db
      .from("messages")
      .select("*")
      .or(`recipient_slug.eq.${safeSlug},sender_name.eq.${safeSlug}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
    }

    // Group by conversation_id and get latest message per conversation
    const conversations: Record<string, {
      conversationId: string;
      latestMessage: string;
      latestSender: string;
      latestSenderType: string;
      otherParty: string;
      unreadCount: number;
      lastActivity: string;
      messageCount: number;
    }> = {};

    (data || []).forEach((msg) => {
      const cid = msg.conversation_id;
      if (!conversations[cid]) {
        const otherParty = msg.recipient_slug === safeSlug ? msg.sender_name : msg.recipient_slug;
        conversations[cid] = {
          conversationId: cid,
          latestMessage: msg.content,
          latestSender: msg.sender_name,
          latestSenderType: msg.sender_type,
          otherParty,
          unreadCount: 0,
          lastActivity: msg.created_at,
          messageCount: 0,
        };
      }
      conversations[cid].messageCount++;
      if (!msg.is_read && msg.recipient_slug === safeSlug) {
        conversations[cid].unreadCount++;
      }
    });

    const sorted = Object.values(conversations).sort(
      (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );

    return NextResponse.json({ conversations: sorted });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// POST: send a new message
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const parsed = messageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { conversationId, senderName, senderType, recipientSlug, content } = parsed.data;

    // Generate conversation ID if not provided (new conversation)
    const cid = conversationId || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const db = getSupabaseAdmin();
    const { error } = await db.from("messages").insert({
      conversation_id: cid,
      sender_id: auth.user!.id,
      sender_name: senderName,
      sender_type: senderType || "anonymous",
      recipient_slug: recipientSlug,
      content,
      is_read: false,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }

    // Notify recipient by email (fire-and-forget) — respects opt-out preference
    const { data: recipientArtist } = await db
      .from("artist_profiles")
      .select("name, slug, user_id, message_notifications_enabled")
      .eq("slug", recipientSlug)
      .single();

    if (recipientArtist) {
      if (recipientArtist.message_notifications_enabled !== false && recipientArtist.user_id) {
        const { data: { user: recipientUser } } = await db.auth.admin.getUserById(recipientArtist.user_id);
        if (recipientUser?.email) {
          notifyNewMessage({
            email: recipientUser.email,
            name: recipientArtist.name,
            senderName,
            messagePreview: content,
          });
        }
      }
    } else {
      // Recipient might be a venue
      const { data: venueProfile } = await db
        .from("venue_profiles")
        .select("name, user_id, message_notifications_enabled")
        .eq("slug", recipientSlug)
        .single();

      if (venueProfile?.user_id && venueProfile.message_notifications_enabled !== false) {
        const { data: { user: recipientUser } } = await db.auth.admin.getUserById(venueProfile.user_id);
        if (recipientUser?.email) {
          notifyNewMessage({
            email: recipientUser.email,
            name: venueProfile.name,
            senderName,
            messagePreview: content,
          });
        }
      }
    }

    return NextResponse.json({ success: true, conversationId: cid });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
