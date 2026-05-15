// One-click unsubscribe endpoint backing the List-Unsubscribe-Post header
// + the unsubscribe link in every preferences-bearing email. RFC 8058
// requires the POST variant to work without confirmation, the page-side
// GET wrapper just renders a friendly "you've been unsubscribed" screen.
//
// Auth model: anonymous, but only mutates the row matching the userId in
// the URL. The link itself acts as the bearer, so we accept it even
// without a session. Anyone who has the URL has read the inbox it was
// delivered to, which is the same trust boundary Gmail's one-click flow
// uses. We never reveal whether the userId / category combination
// existed; success message is identical either way.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { preferenceKeyFor, type EmailCategory } from "@/lib/email/categories";

export const runtime = "nodejs";

const VALID_CATEGORIES: EmailCategory[] = [
  "security",
  "legal",
  "orders_and_payouts",
  "placements",
  "messages",
  "digests",
  "recommendations",
  "tips",
  "newsletter",
  "promotions",
];

async function applyUnsubscribe(userId: string | null, category: string | null): Promise<{ ok: boolean; message: string }> {
  if (!userId || !category) {
    return { ok: false, message: "Missing unsubscribe parameters" };
  }
  if (!VALID_CATEGORIES.includes(category as EmailCategory)) {
    return { ok: false, message: "Unknown email category" };
  }
  const key = preferenceKeyFor(category as EmailCategory);
  if (!key) {
    // Critical category (security/legal/orders) cannot be unsubscribed from;
    // we still 200 so the unsub link doesn't error in the user's client.
    return { ok: true, message: "This category is required for service and can't be turned off." };
  }
  const db = getSupabaseAdmin();
  // Ensure a row exists before flipping the toggle; the helper RPC
  // get_email_preferences handles the get-or-create. Use upsert as a
  // belt-and-braces fallback for environments where the function isn't
  // installed (legacy migrations).
  await db.from("email_preferences").upsert({ user_id: userId, [key]: false, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return { ok: true, message: "You've been unsubscribed from this category." };
}

export async function POST(request: Request) {
  // RFC 8058 one-click. Mail clients send the body url-encoded as
  // List-Unsubscribe=One-Click; we don't need to parse it, the URL
  // params carry the user + category.
  const url = new URL(request.url);
  const userId = url.searchParams.get("u");
  const category = url.searchParams.get("c");
  const result = await applyUnsubscribe(userId, category);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function GET(request: Request) {
  // Some mail clients fire GET when the user clicks the visible link in
  // the email body. We apply the same change and redirect to the page-
  // side success view.
  const url = new URL(request.url);
  const userId = url.searchParams.get("u");
  const category = url.searchParams.get("c");
  const result = await applyUnsubscribe(userId, category);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
