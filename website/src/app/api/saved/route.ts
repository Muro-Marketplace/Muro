import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

// GET: fetch saved items for the authenticated user
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const db = getSupabaseAdmin();

    const { data, error } = await db
      .from("saved_items")
      .select("*")
      .eq("user_id", auth.user!.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to fetch saved items" }, { status: 500 });
    }

    return NextResponse.json({ items: data || [] });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// POST: save an item (upsert to avoid duplicates)
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { itemType, itemId } = await request.json();

    if (!itemType || !itemId) {
      return NextResponse.json({ error: "itemType and itemId are required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    const { error } = await db.from("saved_items").upsert(
      {
        user_id: auth.user!.id,
        item_type: itemType,
        item_id: itemId,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,item_type,item_id" }
    );

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to save item" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE: remove a saved item
export async function DELETE(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { itemType, itemId } = await request.json();

    if (!itemType || !itemId) {
      return NextResponse.json({ error: "itemType and itemId are required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    const { error } = await db
      .from("saved_items")
      .delete()
      .eq("user_id", auth.user!.id)
      .eq("item_type", itemType)
      .eq("item_id", itemId);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to remove saved item" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
