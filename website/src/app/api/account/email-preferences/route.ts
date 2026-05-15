// /api/account/email-preferences
//
// GET / PATCH for the per-category email_preferences row introduced in
// migration 016. Drives the /account/email page reached from every
// email footer; without these endpoints the page can't read or save
// state and the email footer link is a dead-end.
//
// Auth: bearer token, the user id comes from the verified session,
// never from the body. A missing preferences row is treated as defaults
// (which match the column defaults in migration 016).

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const BOOLEAN_FIELDS = [
  "placements_enabled",
  "messages_enabled",
  "digests_enabled",
  "recommendations_enabled",
  "tips_enabled",
  "newsletter_enabled",
  "promotions_enabled",
] as const;

type BooleanField = (typeof BOOLEAN_FIELDS)[number];

const DEFAULTS: Record<BooleanField, boolean> & {
  digest_frequency: "daily" | "weekly" | "off";
  vacation_until: string | null;
} = {
  placements_enabled: true,
  messages_enabled: true,
  digests_enabled: true,
  recommendations_enabled: true,
  tips_enabled: true,
  newsletter_enabled: false,
  promotions_enabled: false,
  digest_frequency: "weekly",
  vacation_until: null,
};

function isBooleanField(key: string): key is BooleanField {
  return (BOOLEAN_FIELDS as readonly string[]).includes(key);
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("email_preferences")
    .select("*")
    .eq("user_id", auth.user!.id)
    .maybeSingle();
  const merged = { ...DEFAULTS, ...(data || {}) };
  return NextResponse.json({ preferences: merged });
}

export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Whitelist + coerce. Anything not in the allowed shape is dropped so
  // a malformed client can't smuggle arbitrary columns into the update.
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (isBooleanField(key) && typeof value === "boolean") {
      patch[key] = value;
    } else if (key === "digest_frequency" && (value === "daily" || value === "weekly" || value === "off")) {
      patch[key] = value;
    } else if (key === "vacation_until") {
      if (value === null) patch[key] = null;
      else if (typeof value === "string") {
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) patch[key] = d.toISOString();
      }
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("email_preferences")
    .upsert({ user_id: auth.user!.id, ...patch }, { onConflict: "user_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
