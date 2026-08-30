import { activePlacementCapForProfile } from "@/lib/pricing";

// Pure decision function for the concurrent-placement capacity gate, reused
// at every server door that can move a placement into "active": the PATCH
// /api/placements state-machine transitions (pending -> active, paused ->
// active) and its collected-stage undo, the POST /api/messages
// placement_response accept, and the artwork-request response accept that
// inserts a placement directly as active (Finding 1, final whole-branch
// review). Kept separate from the handlers so the plan-cap arithmetic is
// unit-testable without standing up the full Supabase-mocked route harness.
export function placementCapDecision(args: {
  profile: { subscription_plan?: string | null; subscription_status?: string | null } | null;
  activeCount: number;
}): { allowed: boolean; cap: number | null } {
  const cap = activePlacementCapForProfile(args.profile);
  if (cap === null) return { allowed: true, cap };
  return { allowed: args.activeCount < cap, cap };
}
