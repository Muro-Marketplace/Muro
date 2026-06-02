// Server-side gate for paywalled venue fields. The /spaces client already
// hides venue identity behind a subscription (canSeeDetails), but the
// public venue APIs returned the full rows to anyone, so an anon caller
// could read every venue's name, description, images and contact details
// straight from the JSON (bugs 1 and 27). These helpers let the route
// handlers apply the same gate the UI does.
//
// Gate (mirrors /spaces canSeeDetails):
//   - venues never see other venues' identity
//   - everyone else needs an active subscription
//   - customers are always allowed (no subscription required)
//   - anonymous callers (no role) are never allowed

export type ViewerRole = string | null | undefined;

export function canSeeVenueIdentity(
  role: ViewerRole,
  subscriptionActive: boolean,
): boolean {
  if (role === "venue") return false;
  if (role === "customer") return true;
  return subscriptionActive;
}

// Demand-tracker shape (camelCase). Blanks the identity + contact fields
// while leaving the demand signal (type, location, preferences, interest
// flags, footfall) intact so the public tracker still works.
export function redactDemandVenue(
  venue: Record<string, unknown>,
  entitled: boolean,
): Record<string, unknown> {
  if (entitled) return venue;
  return {
    ...venue,
    name: "",
    description: "",
    image: "",
    images: [],
    displayWallSpace: "",
    displayLighting: "",
    displayInstallNotes: "",
    displayRotationFrequency: "",
  };
}

// Single-venue shape (snake_case). The public profile legitimately shows
// the name and description, so only the exact-location field (postcode)
// is gated here.
export function redactVenueDetail(
  venue: Record<string, unknown>,
  entitled: boolean,
): Record<string, unknown> {
  if (entitled) return venue;
  return { ...venue, postcode: null };
}
