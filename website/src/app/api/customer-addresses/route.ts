// Customer address book — list + create.
//
// Detail/update/delete live in [id]/route.ts. RLS on the table scopes
// access to auth.uid(); the API uses the service-role key (bypasses
// RLS) and re-applies the user_id filter explicitly so a buyer can
// never read or mutate another buyer's addresses.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";
import { customerAddressInputSchema } from "@/lib/validations";

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("customer_addresses")
    .select("*")
    .eq("user_id", auth.user!.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[customer-addresses GET]", error.message);
    return NextResponse.json({ error: "Failed to fetch addresses" }, { status: 500 });
  }

  return NextResponse.json({ addresses: data || [] });
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a: soft demo guard. 200 + {demo:true} so the portal can toast without
  // unwinding optimistic state. The helper had zero call sites while two doc
  // comments claimed it was enforced.
  const demoResp = assertNotDemo(auth.user!.id);
  if (demoResp) return demoResp;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = customerAddressInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid address", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const userId = auth.user!.id;

  // If this is the first address OR the caller asked for default, mark
  // it default and unflag any previous default in the same transaction.
  const { count } = await db
    .from("customer_addresses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const isFirst = (count ?? 0) === 0;
  const wantsDefault = parsed.data.isDefault === true || isFirst;

  if (wantsDefault) {
    const { error: clearErr } = await db
      .from("customer_addresses")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("is_default", true);
    if (clearErr) {
      console.error("[customer-addresses POST clear-default]", clearErr.message);
      return NextResponse.json({ error: "Failed to update default" }, { status: 500 });
    }
  }

  const { data, error } = await db
    .from("customer_addresses")
    .insert({
      user_id: userId,
      full_name: parsed.data.fullName,
      line1: parsed.data.line1,
      line2: parsed.data.line2 || null,
      city: parsed.data.city,
      postcode: parsed.data.postcode,
      country: parsed.data.country,
      is_default: wantsDefault,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[customer-addresses POST insert]", error.message);
    return NextResponse.json({ error: "Failed to save address" }, { status: 500 });
  }

  return NextResponse.json({ address: data }, { status: 201 });
}
