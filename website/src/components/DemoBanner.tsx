"use client";

/**
 * DemoBanner, slim sticky banner shown across portal pages when the
 * signed-in user is one of the configured demo accounts.
 *
 * Reads `NEXT_PUBLIC_DEMO_ARTIST_USER_ID` / `NEXT_PUBLIC_DEMO_VENUE_USER_ID`
 * (the public mirrors of the server-side DEMO_*_USER_ID vars) and
 * compares against the current Supabase auth user. If neither is set,
 * the banner never renders.
 *
 * Behaviour:
 *   - Sticky at the top of the viewport (z just below the global nav).
 *   - "Sign up" button funnels into /signup with a `next=` param so
 *     the user lands on the same area after creating their account.
 *   - "Exit demo" calls `signOut()` from AuthContext and redirects to /.
 *   - Dismissable for the session via a small ×, user can hide it
 *     while exploring; resets on next page load.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

function readDemoIdsFromEnv(): Set<string> {
  // NEXT_PUBLIC_* env vars are inlined at build time by Next so this
  // runs on the client without a roundtrip.
  const ids = [
    process.env.NEXT_PUBLIC_DEMO_ARTIST_USER_ID,
    process.env.NEXT_PUBLIC_DEMO_VENUE_USER_ID,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
  return new Set(ids);
}

export default function DemoBanner() {
  const { user, signOut } = useAuth();
  const [hidden, setHidden] = useState(false);
  const pathname = usePathname();

  const demoIds = useMemo(readDemoIdsFromEnv, []);
  const isDemo = !!user?.id && demoIds.has(user.id);

  if (!isDemo || hidden) return null;

  return (
    <div
      role="status"
      aria-label="You're exploring a Wallplace demo account"
      className="sticky top-14 lg:top-16 z-30 bg-accent text-white"
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-2 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-widest uppercase shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-white" />
          Demo
        </span>
        <p className="text-xs sm:text-sm flex-1 min-w-0 leading-snug">
          You&rsquo;re touring a demo account, changes aren&rsquo;t saved. Sign
          up to make it real.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/signup?next=${encodeURIComponent(pathname || "/")}`}
            className="text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-sm bg-white text-foreground hover:bg-white/90 transition-colors"
          >
            Sign up
          </Link>
          <button
            type="button"
            onClick={async () => {
              try {
                await signOut?.();
              } catch {
                /* ignore */
              }
              window.location.href = "/";
            }}
            className="text-xs text-white/80 hover:text-white transition-colors"
          >
            Exit demo
          </button>
          <button
            type="button"
            onClick={() => setHidden(true)}
            aria-label="Hide demo banner for this session"
            className="text-white/60 hover:text-white text-sm ml-1"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
