"use client";

// Phase 2.5 hook. Lightweight client-side reader for the current
// user's subscription state. Used by B1 (paywall card on the artwork
// requests "All open" tab) and the artist portal first-protected-
// action gates.

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api-client";

export interface SubscriptionState {
  active: boolean;
  plan: string | null;
  userType: "artist" | "venue" | "customer" | null;
  /** Phase 2.5 GATING_V1 flag mirror — clients can read this to
   *  decide whether to render the paywall affordance at all. */
  gatingEnabled: boolean;
  loading: boolean;
}

const INITIAL: SubscriptionState = {
  active: false,
  plan: null,
  userType: null,
  gatingEnabled: false,
  loading: true,
};

export function useSubscription(): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/me/subscription");
        if (!res.ok) {
          if (!cancelled) setState({ ...INITIAL, loading: false });
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setState({
            active: !!data.active,
            plan: data.plan ?? null,
            userType: data.userType ?? null,
            gatingEnabled: !!data.gatingEnabled,
            loading: false,
          });
        }
      } catch {
        if (!cancelled) setState({ ...INITIAL, loading: false });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
