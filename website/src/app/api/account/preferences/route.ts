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
// Known gap (customer_profiles): the production DB does not currently have
// a customer_profiles table — the `001_analytics_events.sql` repo migration
// that defined it was never applied, and the prod bootstrap from
// `supabase-all-migrations.sql` omits it. So GET/PATCH for customers will
// hit a non-existent table and return 500. The customer settings page's
// `useNotificationPrefs` hook swallows the GET error and shows the opt-in
// defaults, but PATCH will surface the failure. A follow-up plan should
// either create customer_profiles or remove the customer notif-prefs UI.
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

  const { data, error } = await db
    .from(table)
    .select(PREF_FIELDS.join(","))
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
  // opt-in default of true.
  const preferences: Preferences = { ...DEFAULT_PREFERENCES };
  if (data) {
    const row = data as Partial<Record<Pref, boolean | null>>;
    for (const field of PREF_FIELDS) {
      const v = row[field];
      preferences[field] = typeof v === "boolean" ? v : true;
    }
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

  // Whitelist: only known boolean fields make it into the update.
  // Unknown keys and non-boolean values are silently dropped.
  const update: Partial<Preferences> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (isPrefField(key) && typeof value === "boolean") {
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
