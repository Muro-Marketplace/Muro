import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

// GET /api/notifications, list the current user's notifications (newest first)
// Returns [] gracefully if the notifications table does not yet exist.
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .eq("user_id", auth.user!.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    // Table may not exist yet in this environment, return empty list so the
    // UI keeps working without blowing up.
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }

  const notifications = (data || []).map((n) => ({
    id: n.id,
    type: n.kind,
    title: n.title,
    description: n.body || "",
    link: n.link || "",
    time: n.created_at,
    readAt: n.read_at,
  }));
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return NextResponse.json({ notifications, unreadCount });
}

// PATCH /api/notifications, mark one or all notifications as read
// Body: { id: string }  OR  { all: true }
export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const db = getSupabaseAdmin();
    const now = new Date().toISOString();

    if (body.all === true) {
      const { error } = await db
        .from("notifications")
        .update({ read_at: now })
        .eq("user_id", auth.user!.id)
        .is("read_at", null);
      if (error) {
        console.error("Notifications mark-all error:", error);
        return NextResponse.json({ error: "Failed to mark read" }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (typeof body.id !== "string" || body.id.length === 0 || body.id.length > 100) {
      return NextResponse.json({ error: "Valid id required" }, { status: 400 });
    }

    const { error } = await db
      .from("notifications")
      .update({ read_at: now })
      .eq("id", body.id)
      .eq("user_id", auth.user!.id);
    if (error) {
      console.error("Notifications mark-one error:", error);
      return NextResponse.json({ error: "Failed to mark read" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
