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
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/api-client";

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const role = params.get("role");
    const next = params.get("next") || "/browse";

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

      if (role) {
        try {
          await authFetch("/api/auth/oauth-finalize", {
            method: "POST",
            body: JSON.stringify({ role }),
          });
        } catch (err) {
          // Non-fatal: the user is signed in, the rest of the app can still load.
          console.error("[auth/callback] oauth-finalize failed:", err);
        }
      }

      if (!cancelled) window.location.replace(next);
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
          <a
            href="/login"
            className="inline-block px-4 py-2 border border-border rounded-sm text-sm hover:bg-background transition-colors"
          >
            Back to login
          </a>
        </div>
      ) : (
        <p className="text-muted text-sm">Signing you in…</p>
      )}
    </div>
  );
}
