"use client";

/**
 * Clickable demo card for the /demo page.
 *
 * When the portal tour is enabled (demo creds configured server-side)
 * the card is a button that runs the client-side demo sign-in:
 *
 *   1. POST /api/demo/login?role=... which authenticates the shared
 *      demo account on the server and returns the session's access and
 *      refresh tokens as JSON (the app has no @supabase/ssr middleware,
 *      so auth cookies set by an API route would never be read; the
 *      old cookie handshake is why the demo tour used to bounce every
 *      visitor to /login).
 *   2. supabase.auth.setSession(...) on the shared localStorage client,
 *      which is the same client AuthContext listens to, so the portal
 *      guards and DemoBanner pick the session up immediately.
 *   3. Navigate to the portal path the API vetted via safe-redirect.
 *
 * When the tour is not enabled the card is a plain link to the public
 * profile (Phase 1 behaviour), and a 503 from the API degrades to the
 * same place, so a half-configured environment can never strand the
 * visitor. Any other failure shows an honest error with the public
 * profile as the escape hatch.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface DemoTourCardProps {
  role: "artist" | "venue";
  /** True when the server has demo creds and the portal tour can run. */
  enabled: boolean;
  /** Public profile page used when the tour is unavailable. */
  fallbackHref: string;
  className: string;
  children: React.ReactNode;
}

export default function DemoTourCard({
  role,
  enabled,
  fallbackHref,
  className,
  children,
}: DemoTourCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) {
    return (
      <Link href={fallbackHref} prefetch={false} className={className}>
        {children}
      </Link>
    );
  }

  async function startTour() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/demo/login?role=${role}`, {
        method: "POST",
      });
      const body = await res.json().catch(() => null);

      if (res.status === 503 && body?.configured === false) {
        // Demo account not configured after all; degrade to the public
        // profile rather than showing an error for a working page.
        router.push(fallbackHref);
        return;
      }
      if (!res.ok || !body?.access_token || !body?.refresh_token) {
        throw new Error(body?.error || `Demo sign-in failed (${res.status})`);
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      if (sessionError) throw sessionError;

      // redirectTo has been through safe-redirect on the server; the
      // hardcoded fallback here only covers a malformed response body.
      const destination =
        typeof body.redirectTo === "string" && body.redirectTo.startsWith("/")
          ? body.redirectTo
          : role === "venue"
            ? "/venue-portal"
            : "/artist-portal";
      // Deliberately leave `busy` set so the card stays disabled while
      // the navigation happens.
      router.push(destination);
    } catch (err) {
      console.error("[demo] could not start the portal tour:", err);
      setBusy(false);
      setError(
        "We couldn't start the demo tour just now. You can still view the public profile below.",
      );
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={startTour}
        disabled={busy}
        aria-busy={busy}
        className={`${className} w-full text-left cursor-pointer disabled:opacity-70 disabled:cursor-wait`}
      >
        {children}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}{" "}
          <Link
            href={fallbackHref}
            prefetch={false}
            className="text-accent underline hover:no-underline"
          >
            View the public profile
          </Link>
        </p>
      )}
    </div>
  );
}
