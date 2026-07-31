import { mutate, ApiError } from "@/lib/api-client";
import type { ToastOptions } from "@/context/ToastContext";

// The artist and venue placement portals both let a party change a placement's
// status from a dropdown. This is the single implementation both call.
//
// E43-a: the old inline versions (one per portal) did an optimistic
// setPlacements, never checked res.ok (authFetch resolves for non-2xx, it does
// not throw), and dispatched the cross-portal `wallplace:placement-changed`
// event inside `.then()` even on a 403/500. A rejected status change therefore
// looked successful on BOTH portals: the optimistic row stuck with no rollback
// and every other open surface refreshed as if the change had landed.

const STATUS_MAP: Record<string, string> = {
  Active: "active",
  Pending: "pending",
  Declined: "declined",
  Completed: "completed",
  Sold: "completed",
};

/** Map a display status to the API's lowercase status; defaults to "active". */
export function apiStatusFor(newStatus: string): string {
  return STATUS_MAP[newStatus] || "active";
}

export interface UpdatePlacementStatusArgs<P extends { id: string; status: string }> {
  id: string;
  newStatus: P["status"];
  /** The current list; captured as the rollback snapshot before the optimistic write. */
  placements: P[];
  setPlacements: (list: P[]) => void;
  showToast: (message: string, opts?: ToastOptions) => void;
}

/**
 * Optimistically set the row's status, PATCH it, and keep the change only if the
 * server accepted it. On a non-2xx response or a network error, roll the list
 * back to the snapshot and surface an error toast. The cross-portal
 * `wallplace:placement-changed` event fires ONLY on success.
 *
 * Returns true if the server accepted the change, false otherwise.
 */
export async function updatePlacementStatus<P extends { id: string; status: string }>(
  args: UpdatePlacementStatusArgs<P>,
): Promise<boolean> {
  const { id, newStatus, placements, setPlacements, showToast } = args;
  const apiStatus = apiStatusFor(newStatus);
  // Snapshot BEFORE the optimistic update so a rejected change can roll back.
  const snapshot = placements;
  setPlacements(
    placements.map((p) => (p.id === id ? ({ ...p, status: newStatus } as P) : p)),
  );
  try {
    // mutate throws on a non-2xx (ApiError) or a dropped request (NetworkError),
    // so the old manual res.ok check collapses into the catch below.
    await mutate("/api/placements", {
      method: "PATCH",
      body: JSON.stringify({ id, status: apiStatus }),
    });
    if (typeof window !== "undefined") {
      // Fan out so the inbox and any other open surface refreshes immediately
      // instead of waiting for the next poll. Success path only.
      window.dispatchEvent(
        new CustomEvent("wallplace:placement-changed", {
          detail: {
            placementId: id,
            action:
              apiStatus === "declined"
                ? "decline"
                : apiStatus === "active"
                  ? "accept"
                  : "status",
          },
        }),
      );
    }
    return true;
  } catch (err) {
    setPlacements(snapshot);
    console.error("Status update error:", err);
    showToast(
      err instanceof ApiError
        ? err.message || "Could not update placement status."
        : "Network error, status not updated. Please try again.",
      { variant: "error" },
    );
    return false;
  }
}
