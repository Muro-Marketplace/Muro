// Customer address book — update + delete a single row.
//
// Both methods filter by user_id alongside the row id so a buyer can
// never mutate another buyer's address by guessing UUIDs.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { customerAddressUpdateSchema } from "@/lib/validations";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = customerAddressUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid address", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const userId = auth.user!.id;

  // If the caller is promoting this row to default, demote whatever was
  // default first so the partial-unique-index doesn't reject the update.
  if (parsed.data.isDefault === true) {
    const { error: clearErr } = await db
      .from("customer_addresses")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("is_default", true)
      .neq("id", id);
    if (clearErr) {
      console.error("[customer-addresses PATCH clear-default]", clearErr.message);
      return NextResponse.json({ error: "Failed to update default" }, { status: 500 });
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.fullName !== undefined) updates.full_name = parsed.data.fullName;
  if (parsed.data.line1 !== undefined) updates.line1 = parsed.data.line1;
  if (parsed.data.line2 !== undefined) updates.line2 = parsed.data.line2 || null;
  if (parsed.data.city !== undefined) updates.city = parsed.data.city;
  if (parsed.data.postcode !== undefined) updates.postcode = parsed.data.postcode;
  if (parsed.data.country !== undefined) updates.country = parsed.data.country;
  if (parsed.data.isDefault !== undefined) updates.is_default = parsed.data.isDefault;

  const { data, error } = await db
    .from("customer_addresses")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[customer-addresses PATCH]", error?.message);
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }

  return NextResponse.json({ address: data });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getSupabaseAdmin();
  const userId = auth.user!.id;

  // Read the row first so we can decide whether to promote a sibling
  // when the deleted row was the default.
  const { data: existing } = await db
    .from("customer_addresses")
    .select("id, is_default")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  // G L2359 (production pass, 2026-08-30). The delete below is scoped by
  // user_id, so someone else's address was never at risk. What happened
  // instead is that a DELETE naming an id the caller does not own removed
  // nothing and still answered 200, so a caller could not tell a real
  // deletion from a no-op. Both "not yours" and "not there" answer 404, which
  // says nothing about whether the row exists.
  if (!existing) {
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }

  const { error: delErr } = await db
    .from("customer_addresses")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (delErr) {
    console.error("[customer-addresses DELETE]", delErr.message);
    return NextResponse.json({ error: "Failed to delete address" }, { status: 500 });
  }

  // Re-elect a default so a returning customer doesn't end up with zero
  // defaults after deleting their previous default. Picks the most
  // recently created remaining row.
  if (existing?.is_default) {
    const { data: next } = await db
      .from("customer_addresses")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (next?.id) {
      await db
        .from("customer_addresses")
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq("id", next.id);
    }
  }

  return NextResponse.json({ success: true });
}
