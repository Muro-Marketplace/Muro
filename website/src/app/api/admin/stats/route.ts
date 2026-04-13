import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const { error } = await getAdminUser(request);
  if (error) return error;

  try {
    const db = getSupabaseAdmin();
    const [apps, artists, venues] = await Promise.all([
      db.from("artist_applications").select("status"),
      db.from("artist_profiles").select("id"),
      db.from("venue_profiles").select("id"),
    ]);

    const applications = apps.data || [];
    const pending = applications.filter((a) => a.status === "pending").length;
    const accepted = applications.filter((a) => a.status === "accepted").length;
    const rejected = applications.filter((a) => a.status === "rejected").length;

    // Alert counts
    let flaggedMessages = 0;
    let pendingRefunds = 0;
    let overdueOrders = 0;
    let unreadSupportMessages = 0;

    // Flagged messages (try/catch in case column doesn't exist)
    try {
      const { count } = await db
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("flagged", true);
      flaggedMessages = count || 0;
    } catch { /* column may not exist yet */ }

    // Pending refund requests
    try {
      const { count } = await db
        .from("refund_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      pendingRefunds = count || 0;
    } catch { /* table may not exist yet */ }

    // Overdue orders (confirmed/processing for 7+ days)
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await db
        .from("orders")
        .select("*", { count: "exact", head: true })
        .in("status", ["confirmed", "processing"])
        .lt("created_at", sevenDaysAgo);
      overdueOrders = count || 0;
    } catch { /* table may not exist yet */ }

    // Unread support messages
    try {
      const { count } = await db
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("recipient_slug", "wallplace-support")
        .eq("is_read", false);
      unreadSupportMessages = count || 0;
    } catch { /* column may not exist yet */ }

    return NextResponse.json({
      applications: { total: applications.length, pending, accepted, rejected },
      artists: artists.data?.length || 0,
      venues: venues.data?.length || 0,
      alerts: {
        flaggedMessages,
        pendingRefunds,
        overdueOrders,
        unreadSupportMessages,
      },
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
