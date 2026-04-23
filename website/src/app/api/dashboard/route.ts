import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

/**
 * GET /api/dashboard
 * Single endpoint that returns everything the artist/venue dashboard needs.
 * Replaces 4 separate API calls with 1.
 */
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const db = getSupabaseAdmin();
    const userId = auth.user!.id;

    // Check if artist or venue
    const { data: artistProfile } = await db
      .from("artist_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    const { data: venueProfile } = !artistProfile
      ? await db.from("venue_profiles").select("*").eq("user_id", userId).single()
      : { data: null };

    if (artistProfile) {
      // Artist dashboard — fetch placements, orders, messages, works count in parallel
      const slug = artistProfile.slug;
      const [placementsRes, ordersRes, messagesRes, worksCountRes] = await Promise.all([
        db.from("placements").select("*").eq("artist_user_id", userId).order("created_at", { ascending: false }),
        db.from("orders").select("*").eq("artist_slug", slug).order("created_at", { ascending: false }),
        db.from("messages").select("*").or(`recipient_slug.eq.${slug},sender_name.eq.${slug}`).order("created_at", { ascending: false }).limit(50),
        db.from("artist_works").select("id", { count: "exact", head: true }).eq("artist_id", artistProfile.id),
      ]);

      const placements = placementsRes.data || [];
      const orders = ordersRes.data || [];
      const messages = messagesRes.data || [];

      // Group messages into conversations. latestSender is carried so the
      // dashboard activity feed can filter out messages the user sent.
      const convMap: Record<string, { otherParty: string; latestMessage: string; latestSender: string; lastActivity: string; unreadCount: number }> = {};
      for (const msg of messages) {
        const cid = msg.conversation_id;
        if (!convMap[cid]) {
          const otherParty = msg.recipient_slug === slug ? msg.sender_name : msg.recipient_slug;
          convMap[cid] = { otherParty, latestMessage: msg.content, latestSender: msg.sender_name, lastActivity: msg.created_at, unreadCount: 0 };
        }
        if (!msg.is_read && msg.recipient_slug === slug) convMap[cid].unreadCount++;
      }

      const conversations = Object.entries(convMap).map(([id, c]) => ({ conversationId: id, ...c }))
        .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
        .slice(0, 5);

      return NextResponse.json({
        userType: "artist",
        profile: artistProfile,
        placements,
        orders,
        conversations,
        worksCount: worksCountRes.count ?? 0,
        stats: {
          activePlacements: placements.filter((p) => p.status === "active").length,
          totalRevenue: orders.reduce((sum, o) => sum + (o.total || 0), 0),
          enquiries: artistProfile.total_enquiries || 0,
          views: artistProfile.total_views || 0,
        },
      });
    }

    if (venueProfile) {
      const slug = venueProfile.slug;
      const [ordersRes, venueMessagesRes] = await Promise.all([
        db.from("orders").select("*").or(`venue_slug.eq.${slug},buyer_email.eq.${auth.user!.email}`).order("created_at", { ascending: false }),
        db.from("messages").select("id", { count: "exact", head: true }).eq("sender_name", slug),
      ]);

      return NextResponse.json({
        userType: "venue",
        profile: venueProfile,
        orders: ordersRes.data || [],
        sentMessageCount: venueMessagesRes.count ?? 0,
      });
    }

    return NextResponse.json({ userType: null, profile: null });
  } catch {
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
