// POST /api/webhooks/supabase
//
// Receiver for Supabase's auth webhooks. Configure this route in
// Supabase Dashboard → Authentication → Hooks (or Database → Webhooks
// for table-level events). We verify the HMAC signature, then dispatch
// to our own sendEmail() so anything we send from here flows through
// the same suppression / preference / throttle pipeline as everything else.
//
// Currently handles: nothing. Every recognised event is acknowledged and
// logged. The `auth.suspicious_login` branch that used to live here was
// dead code: Supabase emits no such event, nothing else produced one, and the
// `account_suspicious_login` template it rendered had no live sender. The
// template stays registered (src/emails/registry.ts) as the documented target
// for when a real new-device signal exists; the handler is gone so the route
// no longer claims a capability it does not have.
//
// Welcome emails are NOT fired from here. They need richer data than the
// webhook payload provides (featured works for customers, profile-state
// driven checklist for artists). We trigger those from the API endpoint
// that has the data on hand, e.g. /api/auth/welcome after sign-in, /api/apply
// once the artist bridge row exists, and /api/venue-profile once the venue row
// exists.
//
// Anything else is logged and 200'd so unknown events don't make the
// webhook unhealthy.
//
// HMAC: Supabase signs each request with the secret you provide in the
// dashboard. We expect the secret in `SUPABASE_WEBHOOK_SECRET` and the
// signature in the `x-supabase-signature` header (sha256 of the raw body).

import { NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "hex");
    const bBuf = Buffer.from(b, "hex");
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  // No secret configured, refuse all requests rather than silently accept.
  // Set SUPABASE_WEBHOOK_SECRET in env (and paste the same value into the
  // Supabase dashboard) to enable this route.
  if (!secret) return false;
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqualHex(expected, signature.replace(/^sha256=/, ""));
}

interface WebhookPayload {
  type?: string;
  event?: string;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-supabase-signature");
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload.type || payload.event || "";
  // Every event is ignored on purpose, and logged so a hook someone wires in
  // the dashboard is visible in the function logs. Don't 5xx: Supabase
  // retries on failure and an unhandled event is not a failure.
  console.info("[webhooks/supabase] event received, no handler:", event || "(untyped)");

  return NextResponse.json({ ok: true });
}
