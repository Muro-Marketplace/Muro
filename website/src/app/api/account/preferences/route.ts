// /api/account/preferences — GET / PATCH for notification preferences.
//
// Surfaces the three notification opt-ins on the appropriate profile table
// based on the authenticated user's role:
//   - artist   → artist_profiles
//   - venue    → venue_profiles
//   - customer → customer_profiles
//
// Migration 050 backfills any missing columns on these tables. Defaults
// are opt-in (true): if the row is missing, or the column is null, GET
// returns true. PATCH accepts a subset of PREF_FIELDS; non-boolean values
// and unknown keys are silently dropped, and a body with no valid fields
// returns 400.
//
// Venue rows (E13/E14): venue_profiles has no order_notifications_enabled
// column, so venues read and write only the two columns that exist — see
// fieldsForRole. Selecting the missing column made PostgREST reject the
// whole statement, 500ing every venue GET.
//
// customer_profiles (C11, QA 2026-08-28): the table exists in production
// (unique index on user_id), but nothing in the signup flow ever inserts a
// row, so the customer PATCH used to be an UPDATE ... WHERE user_id = X that
// matched zero rows and still answered ok — the toggle looked saved and
// silently reverted on the next load. Customer PATCHes now get-or-create the
// row via an upsert keyed on the verified auth user id, so the write always
// lands (or fails loudly as a 500 the settings card surfaces).
//
// Security: the user_id used for both read and write comes from the
// verified bearer token (auth.user.id), never from the request body.
// Unsupported roles (admin, anything else) return 400.

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parseRole, type UserRole } from "@/lib/auth-roles";

const PREF_FIELDS = [
  "email_digest_enabled",
  "message_notifications_enabled",
  "order_notifications_enabled",
] as const;

type Pref = (typeof PREF_FIELDS)[number];

type Preferences = Record<Pref, boolean>;

const DEFAULT_PREFERENCES: Preferences = {
  email_digest_enabled: true,
  message_notifications_enabled: true,
  order_notifications_enabled: true,
};

function tableForRole(role: UserRole | null): string | null {
  if (role === "artist") return "artist_profiles";
  if (role === "venue") return "venue_profiles";
  if (role === "customer") return "customer_profiles";
  return null; // admin / unknown / null → unsupported
}

// E13/E14: venue_profiles has no order_notifications_enabled column
// (tests/integration/schema-columns.json), and PostgREST rejects a select
// naming a missing column, so the all-fields select 500'd every venue GET
// and the venue "Order updates" PATCH failed every time. Each role reads
// and writes only the columns its table actually has.
const VENUE_PREF_FIELDS = [
  "email_digest_enabled",
  "message_notifications_enabled",
] as const;

function fieldsForRole(role: UserRole | null): readonly Pref[] {
  return role === "venue" ? VENUE_PREF_FIELDS : PREF_FIELDS;
}

function isPrefField(key: string): key is Pref {
  return (PREF_FIELDS as readonly string[]).includes(key);
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const role = parseRole(auth.user!.user_metadata?.user_type);
  const table = tableForRole(role);
  if (!table) {
    return NextResponse.json(
      { error: "Notification preferences are not available for this account type." },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const userId = auth.user!.id;
  const fields = fieldsForRole(role);

  const { data, error } = await db
    .from(table)
    .select(fields.join(","))
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error(`[account/preferences] GET ${table} failed:`, error.message);
    return NextResponse.json(
      { error: "Could not load preferences." },
      { status: 500 },
    );
  }

  // Build the response: any missing row or null column falls back to the
  // opt-in default of true. Only the role's own fields are returned, so a
  // venue response simply omits order_notifications_enabled rather than
  // inventing a value for a column its table does not have.
  const preferences: Partial<Preferences> = {};
  const row = (data ?? {}) as Partial<Record<Pref, boolean | null>>;
  for (const field of fields) {
    const v = row[field];
    preferences[field] = typeof v === "boolean" ? v : DEFAULT_PREFERENCES[field];
  }

  return NextResponse.json({ preferences });
}

export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const role = parseRole(auth.user!.user_metadata?.user_type);
  const table = tableForRole(role);
  if (!table) {
    return NextResponse.json(
      { error: "Notification preferences are not available for this account type." },
      { status: 400 },
    );
  }

  // Defensive parse — malformed JSON should be a 400, not a 500.
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON." },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Body must be a JSON object." },
      { status: 400 },
    );
  }

  // Whitelist: only known boolean fields THIS role's table has make it
  // into the update. Unknown keys, non-boolean values and fields the
  // table lacks (order_notifications_enabled for venues, E14) are
  // silently dropped, matching how bogus keys are treated.
  const fields = fieldsForRole(role);
  const update: Partial<Preferences> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (isPrefField(key) && (fields as readonly string[]).includes(key) && typeof value === "boolean") {
      update[key] = value;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No valid preference fields supplied." },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const userId = auth.user!.id;

  if (table === "customer_profiles") {
    // Get-or-create (C11): no signup path seeds a customer_profiles row, so a
    // plain UPDATE matches nothing and "saves" into the void. The upsert keys
    // on the user_id unique index; user_id and email come from the verified
    // token, never the body. Columns absent from `update` keep their DB
    // defaults on insert and their current values on conflict-update.
    const { error } = await db
      .from(table)
      .upsert(
        { user_id: userId, email: auth.user!.email ?? null, ...update },
        { onConflict: "user_id" },
      );
    if (error) {
      console.error(`[account/preferences] PATCH upsert ${table} failed:`, error.message);
      return NextResponse.json(
        { error: "Could not save preferences." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, preferences: update });
  }

  const { error } = await db.from(table).update(update).eq("user_id", userId);
  if (error) {
    console.error(`[account/preferences] PATCH ${table} failed:`, error.message);
    return NextResponse.json(
      { error: "Could not save preferences." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, preferences: update });
}
