"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/api-client";

/**
 * Gate for the whole /admin route group (E30b, 03 §2.2 stage 1).
 *
 * The admin surface used to be gated only by a render-time check inside
 * `AdminPortalLayout` against `user_metadata.user_type`, a field the user
 * writes themselves at signup with the public anon key. Signing up with
 * `user_type: "admin"` rendered the entire admin shell: navigation, every page,
 * every page's client logic. The data behind it 403'd, because all twelve
 * routes under api/admin do check server-side, so it was not a data breach. It
 * was a convincing surface for social engineering, and a real leak the moment
 * an admin page is added that fetches from a route nobody remembered to gate.
 *
 * This asks the server instead. Nothing renders until `/api/admin/whoami`
 * answers, so there is no shell flash before a redirect either.
 *
 * What it does NOT do: make the client the security boundary. That stays with
 * the per-route `getAdminUser` check. This closes the default leak path and
 * makes new admin pages safe by default.
 *
 * Stage 2, recorded and out of scope here: adopt `@supabase/ssr`, move the
 * session into cookies and run the predicate in `src/middleware.ts`. There is
 * no server-readable session today (`@supabase/ssr` is not a dependency and
 * `lib/supabase.ts` uses default localStorage storage), so a middleware or
 * Server Component guard would have nothing to read.
 */
type GateState = "checking" | "allowed" | "denied" | "unconfigured";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GateState>("checking");

  // Ask the server once. The answer depends on nothing this component is
  // given, so the dep list is genuinely empty; `router` deliberately does not
  // appear, because a router identity change must not re-run the check.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let next: GateState;
      try {
        const res = await authFetch("/api/admin/whoami");
        if (res.ok) {
          next = "allowed";
        } else if (res.status === 503) {
          // The server has no admin source configured. That is a deployment
          // fault, not a failed sign-in: bouncing to /login sends the admin to
          // a form they will complete successfully and then bounce again.
          // 03 §2.2 groups 503 with 401/403; this deviates deliberately, to
          // avoid the loop and to name the actual problem.
          next = "unconfigured";
        } else {
          next = "denied";
        }
      } catch {
        // Network failure or an unreadable session. Fail closed.
        next = "denied";
      }

      // setState only after an await, so this is not the synchronous cascade
      // react-hooks/set-state-in-effect guards against.
      if (!cancelled) setState(next);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Acting on the answer is separate from asking, so re-running it is harmless.
  useEffect(() => {
    if (state === "denied") router.replace("/login");
  }, [state, router]);

  if (state === "allowed") return <>{children}</>;

  if (state === "unconfigured") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium">Admin access is not configured</p>
        <p className="text-muted text-xs max-w-sm">
          The server has no admin allowlist set, so it cannot verify anyone. This
          needs a deployment change, not a different login.
        </p>
      </div>
    );
  }

  // "checking" and "denied" both render the loading affordance and nothing
  // else. Rendering a partial shell while denied is the flash this exists to
  // remove, and the redirect is already in flight.
  //
  // Matches the animated bar the three portal layouts share, so an admin sees
  // the same loading state they see everywhere else.
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="w-48 h-1 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-accent rounded-full animate-[loading_1.5s_ease-in-out_infinite]" />
      </div>
      <p className="text-muted text-xs">Loading admin portal...</p>
      <style>{`
        @keyframes loading {
          0% { width: 0%; margin-left: 0; }
          50% { width: 60%; margin-left: 20%; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}
