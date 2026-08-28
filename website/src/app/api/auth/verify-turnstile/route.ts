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
 *   TURNSTILE_SECRET_KEY  — Cloudflare-issued secret. When unset the route is a
 *                           no-op (returns ok), so local dev and preview deploys
 *                           without a key still let people sign up.
 *
 * THAT NO-OP FAILS OPEN, AND IN PRODUCTION IT FAILS OPEN SILENTLY. If the key is
 * not set in the production environment, the CAPTCHA is simply off and nothing
 * anywhere says so. That is the shape of E1, where a missing RESEND_API_KEY
 * dropped every email for a week without a signal, and 09 §A.6 answered it with
 * three layers rather than one.
 *
 * The equivalent here is NOT a hard fail. Refusing every signup because a
 * CAPTCHA key is missing trades a spam problem for a total outage of the signup
 * funnel, and this code cannot see whether the key is actually set in
 * production. So: the bypass stays, and it now logs at ERROR in production with
 * an unmistakable message, and the response says `bypass: true` so a monitor can
 * see it from outside. Whether to make it a hard fail is owner decision 21.
 */

import { NextResponse } from "next/server";
import { getClientIp, UNKNOWN_IP } from "@/lib/client-ip";
import { isProductionRuntime } from "@/lib/email/env";

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

  // No secret configured → treat the request as verified so local and preview
  // environments aren't blocked. The companion client widget emits "dev-bypass"
  // in the same situation.
  if (!secret) {
    if (isProductionRuntime()) {
      // Not a warn. In production this means the bot protection on signup is
      // OFF, for every caller, and has been since the key went missing.
      console.error(
        "[turnstile] TURNSTILE_SECRET_KEY is UNSET IN PRODUCTION: bot protection " +
          "on signup is disabled and every challenge is being waved through.",
      );
    }
    return NextResponse.json({ ok: true, bypass: true });
  }

  if (token === "dev-bypass") {
    return NextResponse.json({ ok: false, error: "Bypass token rejected" }, { status: 400 });
  }

  try {
    const params = new URLSearchParams();
    params.set("secret", secret);
    params.set("response", token);
    // E36c: `cf-connecting-ip` is only trustworthy behind Cloudflare, and
    // production is fronted by Vercel, so both of the headers this used to read
    // were client-supplied. Sending a forged remoteip to siteverify weakens
    // Turnstile's own analysis, so send nothing rather than something invented.
    const ip = getClientIp(request);
    if (ip !== UNKNOWN_IP) params.set("remoteip", ip);

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
