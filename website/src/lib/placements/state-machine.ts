// Placement lifecycle. Mirrors src/lib/order-state-machine.ts.
//
//   pending   → active | declined | cancelled
//   declined  → pending             (only via a counter offer, which re-opens
//                                    the negotiation and flips who accepts)
//   active    → completed | cancelled | paused
//   paused    → active | cancelled
//   completed, cancelled, sold      terminal
//
// declined → active is deliberately NOT a transition. Re-opening a declined
// placement goes through the counter path, which flips proposed_by_user_id so
// the other party is the one who accepts. Allowing the direct jump let a
// rejected requester force their own deal live (finding E20).
//
// Two deviations from 01 §1.2, both evidence-driven:
//
//   1. The status union is imported from ./status rather than redeclared.
//      status.ts calls itself the single source of truth for placement status
//      and already exports a 7-value RawStatus; declaring a competing 6-value
//      PlacementStatus here would be exactly the duplicate-vocabulary problem
//      this plan exists to remove (cf. N-K3).
//
//   2. `sold` therefore appears, which §1.2 omits. It is read as terminal by
//      api/placements/route.ts:922 (alongside completed) and counted as a
//      finished placement by artist-portal/analytics. Nothing writes it today
//      and prod holds no such rows, so it is modelled as terminal with no
//      incoming transition: a legacy `sold` row is correctly reported as
//      terminal instead of "Unknown current status", and no new path to it is
//      invented on speculation.
//
// Prod distribution when the table was written (2026-07-29): active 37,
// pending 33, cancelled 7, declined 5, completed 4. Note placements.status
// carries NO check constraint, so any text can be stored and `from` values are
// normalised for case.

import type { RawStatus } from "./status";

export type PlacementStatus = RawStatus;

const TRANSITIONS: Record<PlacementStatus, readonly PlacementStatus[]> = {
  pending: ["active", "declined", "cancelled"],
  declined: ["pending", "cancelled"],
  active: ["completed", "cancelled", "paused"],
  paused: ["active", "cancelled"],
  completed: [],
  cancelled: [],
  sold: [],
};

export const PLACEMENT_STATUSES = Object.keys(TRANSITIONS) as readonly PlacementStatus[];

/** States with no outgoing transitions. */
export const PLACEMENT_TERMINAL_STATUSES = Object.freeze(
  (Object.keys(TRANSITIONS) as PlacementStatus[]).filter(
    (s) => TRANSITIONS[s].length === 0,
  ),
);

export type TransitionResult = { ok: true } | { ok: false; reason: string };

function isPlacementStatus(v: string): v is PlacementStatus {
  return (PLACEMENT_STATUSES as readonly string[]).includes(v);
}

/**
 * Is moving a placement from `from` to `to` legal?
 *
 * `from` is normalised for case because it comes from a free-text DB column.
 * `to` is NOT normalised: it should be a canonical value chosen by the server,
 * so a mis-cased target is a caller bug worth surfacing rather than papering
 * over.
 */
export function canPlacementTransition(
  from: string | null | undefined,
  to: string,
): TransitionResult {
  const f = (from ?? "").toLowerCase();
  if (!isPlacementStatus(f)) return { ok: false, reason: `Unknown current status: ${from}` };
  if (!isPlacementStatus(to)) return { ok: false, reason: `Unknown target status: ${to}` };
  if (f === to) return { ok: true }; // idempotent no-op, callers gate separately
  if (TRANSITIONS[f].includes(to)) return { ok: true };
  return { ok: false, reason: `Placement is ${f}; it cannot move to ${to}.` };
}
