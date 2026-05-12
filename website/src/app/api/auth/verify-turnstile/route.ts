/**
 * Server-side verification for Cloudflare Turnstile tokens.
 *
 * Called by the signup pages after the client-side widget gives them a
 * token, before they hand the user off to supabase.auth.signUp. A
 * positive response is required before account creation proceeds —
 * keeps automated signup spam out without putting a captcha in front of
 * the user post-signup.
 *
 * Environment:
 *   TURNSTILE_SECRET_KEY  — Cloudflare-issued secret. When unset the
 *                           route is a no-op (returns ok), so local
 *                           dev / preview deploys without a key still
 *                           let people sign up.
 */

import { NextResponse } from "next/server";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function POST(request: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  let body: { token?: string } = {};
  try {
    body = (await request.json()) as { token?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }

  const token = (body.token || "").trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  // No secret configured → treat the request as verified so local /
  // preview environments aren't blocked. The companion client widget
  // emits "dev-bypass" in the same situation.
  if (!secret) {
    return NextResponse.json({ ok: true, bypass: true });
  }

  if (token === "dev-bypass") {
    return NextResponse.json({ ok: false, error: "Bypass token rejected" }, { status: 400 });
  }

  try {
    const params = new URLSearchParams();
    params.set("secret", secret);
    params.set("response", token);
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
    if (ip) params.set("remoteip", ip.split(",")[0].trim());

    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body: params,
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { ok: false, error: "Verification failed", codes: data["error-codes"] || [] },
      { status: 403 },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Network error" }, { status: 502 });
  }
}
