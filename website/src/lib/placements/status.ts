// Single source of truth for placement status + stage presentation.
// Kept dependency-free (no React) so it can run on the server and the client.

export type RawStatus = "pending" | "active" | "declined" | "completed" | "sold" | "paused";
export type DisplayStatus = "Pending" | "Active" | "Declined" | "Completed" | "Sold";
export type Stage = "accepted" | "scheduled" | "installed" | "live" | "collected";

export const STAGE_ORDER: Stage[] = ["accepted", "scheduled", "installed", "live", "collected"];

export const STAGE_LABEL: Record<Stage, string> = {
  accepted: "Accepted",
  scheduled: "Scheduled",
  installed: "Installed",
  live: "Live on wall",
  collected: "Collected",
};

export function normaliseStatus(raw: string | null | undefined): DisplayStatus {
  const key = (raw || "").toLowerCase();
  switch (key) {
    case "active": return "Active";
    case "pending": return "Pending";
    case "declined": return "Declined";
    case "sold": return "Sold";
    case "completed": case "paused": return "Completed";
    default: return "Active";
  }
}

// Tailwind classes — matches the existing tone (amber/green/red/blue/grey)
// but slightly softened so they sit well on the cream surface.
export function statusBadgeClass(status: DisplayStatus): string {
  switch (status) {
    case "Active":    return "bg-green-50 text-green-700 border border-green-200";
    case "Pending":   return "bg-amber-50 text-amber-800 border border-amber-200";
    case "Declined":  return "bg-red-50 text-red-700 border border-red-200";
    case "Sold":      return "bg-blue-50 text-blue-700 border border-blue-200";
    case "Completed": return "bg-neutral-100 text-neutral-700 border border-neutral-200";
  }
}

export interface PlacementLifecycle {
  status: string;
  acceptedAt?: string | null;
  scheduledFor?: string | null;
  installedAt?: string | null;
  liveFrom?: string | null;
  collectedAt?: string | null;
  requesterUserId?: string | null;
}

export function currentStage(p: PlacementLifecycle): Stage | null {
  if (p.collectedAt) return "collected";
  if (p.liveFrom) return "live";
  if (p.installedAt) return "installed";
  if (p.scheduledFor) return "scheduled";
  if (p.acceptedAt) return "accepted";
  return null;
}

export function nextStage(p: PlacementLifecycle): Stage | null {
  const cur = currentStage(p);
  if (!cur) return null;
  const idx = STAGE_ORDER.indexOf(cur);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1];
}

// Role is always from the current viewer's perspective.
export type ViewerRole = "requester" | "responder" | "observer";

export function viewerRole(
  p: PlacementLifecycle,
  currentUserId: string | null | undefined
): ViewerRole {
  if (!currentUserId) return "observer";
  if (!p.requesterUserId) return "responder";
  if (p.requesterUserId === currentUserId) return "requester";
  return "responder";
}

export interface NextAction {
  title: string;
  detail: string;
  cta?: { label: string; kind: "accept" | "counter" | "decline" | "advance"; stage?: Stage };
  secondaryCta?: { label: string; kind: "accept" | "counter" | "decline" | "advance"; stage?: Stage };
  waitingOnOther?: boolean;
}

// Produces the "Next action" card content shown in the placement panel.
// Deliberately opinionated — one clear primary ask, with optional secondary.
export function nextAction(p: PlacementLifecycle, role: ViewerRole): NextAction {
  const status = normaliseStatus(p.status);

  if (status === "Pending") {
    if (role === "requester") {
      return {
        title: "Waiting on the other side",
        detail: "Your placement request has been sent. You'll be notified when they respond.",
        waitingOnOther: true,
      };
    }
    return {
      title: "Respond to this request",
      detail: "Accept to start the placement, counter to adjust the terms, or decline.",
      cta: { label: "Accept", kind: "accept" },
      secondaryCta: { label: "Counter", kind: "counter" },
    };
  }

  if (status === "Declined") {
    return {
      title: "Placement declined",
      detail: "This request was declined. You can start a new conversation or send a fresh request.",
    };
  }

  if (status === "Completed" || status === "Sold") {
    return {
      title: "Placement finished",
      detail: status === "Sold" ? "This artwork sold \u2014 nice." : "This placement has been collected.",
    };
  }

  // Active \u2014 advance to the next stage.
  const next = nextStage(p);
  if (!next) {
    return {
      title: "Placement live",
      detail: "Everything looks good. No action needed right now.",
    };
  }
  const labels: Record<Stage, string> = {
    accepted: "Mark accepted",
    scheduled: "Mark scheduled",
    installed: "Mark installed",
    live: "Mark live on wall",
    collected: "Mark collected",
  };
  const details: Record<Stage, string> = {
    accepted: "",
    scheduled: "Agree an install date and mark it scheduled.",
    installed: "Confirm the artwork is up on the wall.",
    live: "Go live once the QR / wall card is in place.",
    collected: "Close out the placement when it's collected.",
  };
  return {
    title: `Next: ${STAGE_LABEL[next].toLowerCase()}`,
    detail: details[next],
    cta: { label: labels[next], kind: "advance", stage: next },
  };
}
