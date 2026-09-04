"use client";

// /auth/callback
//
// Landing page for OAuth (Google / Apple) sign-ins. The flow:
//
//   1. Supabase exchanges the OAuth code and stamps the session into the
//      browser. The supabase-js SDK does this automatically when the page
//      loads (detectSessionInUrl is the default).
//   2. We read `?role=` and `?next=` off the current URL.
//   3. If a role was supplied (artist / customer signup pages) we POST to
//      /api/auth/oauth-finalize so the server can stamp user_metadata and,
//      for new artists, create an artist_profiles stub.
//   4. We redirect to `next` (or /browse as a fallback).
//
// We read the URL via window.location to sidestep the Suspense requirement
// on useSearchParams in this Next.js version, and so the page can stay a
// drop-in client component without a Suspense boundary.

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { mutate } from "@/lib/api-client";
import { safeRedirect } from "@/lib/safe-redirect";

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const state = params.get("state") || "";
    const fallbackNext = params.get("next") || "/browse";

    async function waitForSession() {
      // The SDK may still be exchanging the code on first mount; retry
      // briefly before giving up.
      for (let i = 0; i < 6; i++) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) return session;
        await new Promise((r) => setTimeout(r, 250));
      }
      return null;
    }

    (async () => {
      const session = await waitForSession();
      if (cancelled) return;
      if (!session) {
        setError("Could not establish your session. Please try signing in again.");
        return;
      }

      // The signed `state` param is what the OAuth provider rounds-trips
      // back. We send it to oauth-finalize, which verifies the HMAC and
      // returns the role+next that were bound to that flow. If state is
      // missing (legacy flow / SSO without our signup pages), skip
      // finalize — the user is signed in regardless.
      let nextHref = fallbackNext;
      if (state) {
        try {
          // Best-effort: a failure here just leaves nextHref at the fallback, which
          // is why the catch only logs. mutate throws on a non-2xx (previously a
          // non-2xx body was read anyway and simply had no `next`), so both land
          // in the same place.
          const data = await mutate<{ next?: string }>("/api/auth/oauth-finalize", {
            method: "POST",
            body: JSON.stringify({ state }),
          });
          if (data?.next) nextHref = data.next;
        } catch (err) {
          console.error("[auth/callback] oauth-finalize failed:", err);
        }
      }

      if (!cancelled) window.location.replace(safeRedirect(nextHref, "/browse"));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      {error ? (
        <div className="text-center max-w-sm">
          <p className="text-red-500 mb-4">{error}</p>
          <Link
            href="/login"
            className="inline-block px-4 py-2 border border-border rounded-sm text-sm hover:bg-background transition-colors"
          >
            Back to login
          </Link>
        </div>
      ) : (
        <p className="text-muted text-sm">Signing you in…</p>
      )}
    </div>
  );
}
