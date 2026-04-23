"use client";

/**
 * Small "Sent" / "Received" chip shown next to placement cards.
 *
 * Used to make the direction of a placement request obvious at a glance
 * so the user doesn't have to guess whether they're waiting on the
 * other party or being waited on. Accept / Counter / Decline controls
 * are gated off "Received" placements — you can't action a request you
 * sent yourself.
 *
 * Visual: a small pill with a directional arrow + label. "Sent" uses a
 * muted slate tone so it reads as informational; "Received" uses the
 * accent tone to draw attention because it implies action is needed.
 */
export type PlacementDirection = "sent" | "received";

interface Props {
  direction: PlacementDirection;
  /** "compact" trims the label to just an icon + short word for dense lists. */
  size?: "default" | "compact";
  className?: string;
}

export default function PlacementDirectionTag({ direction, size = "default", className = "" }: Props) {
  const isSent = direction === "sent";
  const label = isSent ? "Sent" : "Received";
  const pad = size === "compact" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  // Sent → green (you've dispatched, waiting). Received → red (something
  // on your plate to action). Deliberately high-contrast so the
  // direction reads at a glance on a table row.
  const tone = isSent
    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
    : "bg-red-50 text-red-700 border border-red-200";

  return (
    <span
      className={`inline-flex items-center gap-1 ${pad} ${tone} rounded-full font-medium tracking-wide ${className}`}
      title={isSent ? "You sent this request" : "You received this request"}
    >
      {isSent ? (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="7 7 17 7 17 17" />
        </svg>
      ) : (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="17" y1="7" x2="7" y2="17" />
          <polyline points="17 17 7 17 7 7" />
        </svg>
      )}
      {label}
    </span>
  );
}

/**
 * Helper — tells you what direction chip to show from the placement
 * row + the viewing user's id. Relies on requester_user_id being
 * populated (the /api/placements GET handler now backfills it from the
 * original placement_request message when it's missing).
 */
export function directionFor(
  placement: {
    requester_user_id?: string | null;
    artist_user_id?: string | null;
    venue_user_id?: string | null;
  },
  userId: string | null | undefined,
): PlacementDirection | null {
  if (!userId || !placement.requester_user_id) return null;
  return placement.requester_user_id === userId ? "sent" : "received";
}
