import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { placementSchema, placementUpdateSchema } from "@/lib/validations";
import { z } from "zod";

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { placements } = body;

    if (!placements || !Array.isArray(placements) || placements.length === 0) {
      return NextResponse.json({ error: "No placements provided" }, { status: 400 });
    }

    const parsed = z.array(placementSchema).safeParse(placements);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid placement data" }, { status: 400 });
    }

    const rows = parsed.data.map((p) => ({
      id: p.id,
      artist_user_id: auth.user!.id,
      work_title: p.workTitle,
      work_image: p.workImage || null,
      venue: p.venue,
      arrangement_type: p.type,
      revenue_share_percent: p.revenueSharePercent || null,
      status: p.status || "active",
      revenue: p.revenue || null,
      notes: p.notes || null,
      created_at: new Date().toISOString(),
    }));

    const db = getSupabaseAdmin();
    const { error } = await db.from("placements").insert(rows);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to save placements" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const parsed = placementUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "ID and valid status required" }, { status: 400 });
    }

    const { id, status } = parsed.data;

    // Verify ownership before updating
    const db = getSupabaseAdmin();
    const { data: existing } = await db
      .from("placements")
      .select("artist_user_id")
      .eq("id", id)
      .single();

    if (!existing || existing.artist_user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }

    const { error } = await db
      .from("placements")
      .update({ status })
      .eq("id", id);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to update placement" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || id.length > 100) {
      return NextResponse.json({ error: "Valid ID required" }, { status: 400 });
    }

    // Verify ownership before deleting
    const db = getSupabaseAdmin();
    const { data: existing } = await db
      .from("placements")
      .select("artist_user_id")
      .eq("id", id)
      .single();

    if (!existing || existing.artist_user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }

    const { error } = await db
      .from("placements")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to delete placement" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
