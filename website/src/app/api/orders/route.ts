import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, items, shipping, subtotal, shippingCost, total, buyerEmail } = body;

    if (!id || !items || !shipping || subtotal == null || total == null || !buyerEmail) {
      return NextResponse.json({ error: "Missing order data" }, { status: 400 });
    }

    const { error } = await getSupabaseAdmin().from("orders").insert({
      id,
      buyer_email: buyerEmail,
      items,
      shipping,
      subtotal,
      shipping_cost: shippingCost,
      total,
      status: "confirmed",
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to save order" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
