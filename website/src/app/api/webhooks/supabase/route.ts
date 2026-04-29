// POST /api/webhooks/supabase
//
// Receiver for Supabase's auth webhooks. Configure this route in
// Supabase Dashboard → Authentication → Hooks (or Database → Webhooks
// for table-level events). We verify the HMAC signature, then dispatch
// to our own sendEmail() so anything we send from here flows through
// the same suppression / preference / throttle pipeline as everything else.
//
// Currently handles:
//   - "auth.suspicious_login", fire AccountSuspiciousLogin
//
// Welcome emails are NOT fired from here. They need richer data than the
// webhook payload provides (featured works for customers, profile-state
// driven checklist for artists). We trigger those from the API endpoint
// that has the data on hand, e.g. /api/auth/oauth-finalize after profile
// creation, or a dedicated welcome cron.
//
// Anything else is logged and 200'd so unknown events don't make the
// webhook unhealthy.
//
// HMAC: Supabase signs each request with the secret you provide in the
// dashboard. We expect the secret in `SUPABASE_WEBHOOK_SECRET` and the
// signature in the `x-supabase-signature` header (sha256 of the raw body).

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email/send";
import { AccountSuspiciousLogin } from "@/emails/templates/account/AccountSuspiciousLogin";

export const runtime = "nodejs";

const SUPPORT_URL = "https://wallplace.co.uk/support";

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

interface SuspiciousLoginPayload {
  type?: string;
  event?: string;
  suspicious?: {
    userId: string;
    loginTime: string;
    location?: string;
    device?: string;
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-supabase-signature");
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: SuspiciousLoginPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload.type || payload.event || "";

  try {
    if (event === "auth.suspicious_login" || event === "user.suspicious_login") {
      await handleSuspiciousLogin(payload);
    }
    // Unknown events ignored on purpose, don't 5xx and force retries.
  } catch (err) {
    console.error("[webhooks/supabase] handler error:", err);
    // Still 200; we've logged. Returning 5xx makes Supabase retry forever.
  }

  return NextResponse.json({ ok: true });
}

async function handleSuspiciousLogin(payload: SuspiciousLoginPayload) {
  const sus = payload.suspicious;
  if (!sus?.userId) return;

  const db = getSupabaseAdmin();
  const { data: { user } } = await db.auth.admin.getUserById(sus.userId);
  if (!user?.email) return;

  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const firstName =
    (typeof meta.display_name === "string" && (meta.display_name as string).split(" ")[0]) ||
    user.email.split("@")[0];

  await sendEmail({
    idempotencyKey: `suspicious:${sus.userId}:${sus.loginTime}`,
    template: "suspicious_login",
    category: "security",
    to: user.email,
    subject: "New sign-in to your Wallplace account",
    react: AccountSuspiciousLogin({
      firstName,
      loginTime: sus.loginTime,
      location: sus.location || "Unknown location",
      device: sus.device || "Unknown device",
      secureAccountUrl: "https://wallplace.co.uk/account/security",
      supportUrl: SUPPORT_URL,
    }),
    userId: sus.userId,
  });
}
