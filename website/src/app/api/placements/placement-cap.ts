import { activePlacementCapForProfile } from "@/lib/pricing";

// Pure decision function for the pending -> active capacity gate in
// route.ts. Kept separate from the handler so the plan-cap arithmetic is
// unit-testable without standing up the full Supabase-mocked route harness.
export function placementCapDecision(args: {
  profile: { subscription_plan?: string | null; subscription_status?: string | null } | null;
  activeCount: number;
}): { allowed: boolean; cap: number | null } {
  const cap = activePlacementCapForProfile(args.profile);
  if (cap === null) return { allowed: true, cap };
  return { allowed: args.activeCount < cap, cap };
}
