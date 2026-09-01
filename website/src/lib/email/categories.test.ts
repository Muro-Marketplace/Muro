// R4.12 (WS5.5): the money-consequential templates that used to sit in the
// suppressible `placements` category must resolve to a critical always-send
// category at the pipeline layer, and the registry entries must agree, so the
// preview library, the send sites and sendEmail() cannot drift apart again
// (that drift is exactly how the welcome trio ended up registered as
// `recommendations` but sent as `tips`, audit finding 16).

import { describe, expect, it } from "vitest";
import {
  CATEGORY_RULES,
  TEMPLATE_CATEGORY_OVERRIDES,
  resolveEmailCategory,
} from "./categories";

// Direct entry imports, not the full registry, so this test does not drag all
// 137 template modules through the transform.
import offerReceived from "@/emails/templates/messages/OfferReceivedNotification";
import artistAccepted from "@/emails/templates/placements/ArtistPlacementAccepted";
import venueAccepted from "@/emails/templates/placements/VenuePlacementAcceptedConfirmation";
import artistDeclined from "@/emails/templates/placements/ArtistPlacementDeclined";
import venueDeclined from "@/emails/templates/placements/PlacementVenueDeclinedArtistRequest";
import placementCancelled from "@/emails/templates/placements/PlacementCancelled";

const OVERRIDDEN_ENTRIES = [
  offerReceived,
  artistAccepted,
  venueAccepted,
  artistDeclined,
  venueDeclined,
  placementCancelled,
];

describe("TEMPLATE_CATEGORY_OVERRIDES (R4.12)", () => {
  it("covers exactly the offer and placement accept/decline/cancel set", () => {
    expect(Object.keys(TEMPLATE_CATEGORY_OVERRIDES).sort()).toEqual([
      "artist_placement_accepted",
      "artist_placement_declined",
      "offer_received_notification",
      "placement_cancelled",
      "placement_venue_declined_artist_request",
      "venue_placement_accepted_confirmation",
    ]);
  });

  it("only ever overrides INTO a critical always-send category", () => {
    // The whole point is escaping suppression; an override into a suppressible
    // category would be a silent regression.
    for (const target of Object.values(TEMPLATE_CATEGORY_OVERRIDES)) {
      expect(CATEGORY_RULES[target].criticalAlwaysSend).toBe(true);
      expect(CATEGORY_RULES[target].throttleCount).toBe(0);
    }
  });

  it("resolves an overridden template regardless of the declared category", () => {
    expect(resolveEmailCategory("offer_received_notification", "placements")).toBe(
      "orders_and_payouts",
    );
    expect(resolveEmailCategory("placement_cancelled", "placements")).toBe("orders_and_payouts");
  });

  it("leaves every other template on its declared category", () => {
    expect(resolveEmailCategory("venue_new_placement_request", "placements")).toBe("placements");
    expect(resolveEmailCategory("placement_counter_offer_received", "placements")).toBe(
      "placements",
    );
    expect(resolveEmailCategory("artist_weekly_portfolio_digest", "digests")).toBe("digests");
  });

  it("agrees with the registry entries, so the preview library tells the truth", () => {
    for (const entry of OVERRIDDEN_ENTRIES) {
      const target = TEMPLATE_CATEGORY_OVERRIDES[entry.id];
      expect(target, `${entry.id} should be on the override list`).toBeDefined();
      expect(entry.category, `${entry.id} registry category`).toBe(target);
      expect(entry.canUnsubscribe, `${entry.id} canUnsubscribe`).toBe(false);
      expect(entry.stream, `${entry.id} stream`).toBe(CATEGORY_RULES[target].stream);
    }
  });
});
