// R4.12 (WS5.5): the money-consequential templates that used to sit in the
// suppressible `placements` category must resolve to a critical always-send
// category at the pipeline layer, and the registry entries must agree, so the
// preview library, the send sites and sendEmail() cannot drift apart again
// (that drift is exactly how the welcome trio ended up registered as
// `recommendations` but sent as `tips`, audit finding 16).
//
// Email audit, 2026-09-03: the counter offer joins the money set, and the three
// account decisions (application approved, blog published, blog rejected) move
// to `security`, because they were sent as `placements` with a user id and the
// only message carrying the decision could be silenced by a toggle, vacation
// mode or the daily cap.

import { describe, expect, it } from "vitest";
import {
  CATEGORY_RULES,
  TEMPLATE_CATEGORY_OVERRIDES,
  preferenceKeyFor,
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
import counterOfferReceived from "@/emails/templates/placements/PlacementCounterOfferReceived";

const OVERRIDDEN_ENTRIES = [
  offerReceived,
  artistAccepted,
  venueAccepted,
  artistDeclined,
  venueDeclined,
  placementCancelled,
  counterOfferReceived,
];

const ACCOUNT_DECISIONS = [
  "artist_application_approved",
  "artist_blog_published",
  "artist_blog_rejected",
] as const;

describe("TEMPLATE_CATEGORY_OVERRIDES (R4.12)", () => {
  it("covers exactly the offer, placement negotiation and account-decision set", () => {
    expect(Object.keys(TEMPLATE_CATEGORY_OVERRIDES).sort()).toEqual([
      "artist_application_approved",
      "artist_blog_published",
      "artist_blog_rejected",
      "artist_placement_accepted",
      "artist_placement_declined",
      "offer_received_notification",
      "placement_cancelled",
      "placement_counter_offer_received",
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
      expect(preferenceKeyFor(target)).toBeNull();
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
    expect(resolveEmailCategory("placement_scheduled", "placements")).toBe("placements");
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

describe("placement_counter_offer_received rides the money category (email audit 2026-09-03)", () => {
  it("resolves to orders_and_payouts however the send site files it", () => {
    // Fail-before: the counter, the one negotiation step carrying revised
    // money terms, resolved to `placements` while accept, decline and cancel
    // were all forced critical.
    expect(resolveEmailCategory("placement_counter_offer_received", "placements")).toBe(
      "orders_and_payouts",
    );
  });

  it("can no longer be dropped by the placements toggle, vacation mode or the daily cap", () => {
    const resolved = resolveEmailCategory("placement_counter_offer_received", "placements");
    expect(CATEGORY_RULES[resolved].criticalAlwaysSend).toBe(true);
    expect(CATEGORY_RULES[resolved].throttleCount).toBe(0);
    expect(preferenceKeyFor(resolved)).toBeNull();
  });
});

describe("account decisions are security-class notices (email audit 2026-09-03)", () => {
  it.each(ACCOUNT_DECISIONS)("%s resolves to security whatever the send site declared", (id) => {
    // Fail-before: sent as `placements` with a user id, so the "Placement
    // updates" toggle, vacation mode or the ten-a-day cap could drop the only
    // message carrying the decision.
    expect(resolveEmailCategory(id, "placements")).toBe("security");
    expect(resolveEmailCategory(id, "security")).toBe("security");
  });

  it("security is always-send, unthrottled and governed by no preference flag", () => {
    expect(CATEGORY_RULES.security.criticalAlwaysSend).toBe(true);
    expect(CATEGORY_RULES.security.throttleCount).toBe(0);
    expect(CATEGORY_RULES.security.stream).toBe("tx");
    expect(preferenceKeyFor("security")).toBeNull();
  });

  it("does not touch artist_application_rejected, which is sent without a user id", () => {
    // No user id means no preference, vacation or throttle gate ever applies,
    // so there is nothing to escape from. Left as declared on purpose.
    expect(TEMPLATE_CATEGORY_OVERRIDES).not.toHaveProperty("artist_application_rejected");
  });
});
