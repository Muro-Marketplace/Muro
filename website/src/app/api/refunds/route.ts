import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { isAdminRequest } from "@/lib/admin-auth";
import { orFilter } from "@/lib/db/safe-filter";
import type { RefundRequestRow, RefundsListResponse } from "./types";

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const db = getSupabaseAdmin();
    const userId = auth.user!.id;
    const email = auth.user!.email || "";

    // Determine user type
    const { data: artistProfile } = await db
      .from("artist_profiles")
      .select("slug")
      .eq("user_id", userId)
      .single();

    const isAdmin = await isAdminRequest(request);

    let query;

    if (isAdmin) {
      // Admin: return all refund requests
      query = db.from("refund_requests").select("*, orders(id, buyer_email, total, status, artist_slug, venue_slug)");
    } else if (artistProfile) {
      // Artist: refund requests for orders where they are the artist
      // First get the order IDs for this artist, then filter refund requests
      const { data: artistOrders } = await db
        .from("orders")
        .select("id")
        .eq("artist_user_id", userId);

      const orderIds = artistOrders?.map((o) => o.id) || [];

      if (orderIds.length === 0) {
        const earlyBody: RefundsListResponse = { refundRequests: [], userType: "artist" };
        return NextResponse.json(earlyBody);
      }

      query = db
        .from("refund_requests")
        .select("*, orders(id, buyer_email, total, status, artist_slug, venue_slug)")
        .in("order_id", orderIds);
    } else {
      // Buyer/customer: refund requests they submitted
      query = db
        .from("refund_requests")
        .select("*, orders(id, buyer_email, total, status, artist_slug, venue_slug)")
        .or(orFilter([`requester_user_id.eq.${userId}`, `requester_email.eq.${email}`]));
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("Refund requests fetch error:", error);
      return NextResponse.json({ error: "Failed to fetch refund requests" }, { status: 500 });
    }

    const body: RefundsListResponse = {
      refundRequests: (data || []) as RefundRequestRow[],
      userType: isAdmin ? "admin" : artistProfile ? "artist" : "customer",
    };
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
