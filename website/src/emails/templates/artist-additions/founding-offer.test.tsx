// The founding offer, in the two emails that carry it.
//
// Email audit, 2026-09-04. "First 20 artists: 6 months free" is on the flyer,
// the pricing page, the application form and in /api/subscribe's choice of
// FOUNDING_TRIAL_DAYS, and neither email an accepted artist receives said a
// word about it. The risk in fixing that is the opposite mistake: promising
// six free months to an artist who is not in the cohort. The offer therefore
// renders on artist_profiles.is_founding_artist and on nothing else, and the
// numbers come from src/lib/pricing.ts rather than being typed into the copy.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import {
  ArtistFoundingPlaceConfirmed,
  mock as foundingMock,
} from "./ArtistFoundingPlaceConfirmed";
import { ArtistApplicationApproved, mock as approvedMock } from "./ArtistApplicationApproved";
import {
  FOUNDING_ARTIST_LIMIT,
  FOUNDING_TRIAL_MONTHS,
  trialOffer,
} from "@/lib/pricing";

describe("ArtistFoundingPlaceConfirmed", () => {
  it("states the offer using the constants the trial itself is built on", async () => {
    const html = await render(ArtistFoundingPlaceConfirmed(foundingMock));
    expect(html).toContain(`${FOUNDING_TRIAL_MONTHS} months free`);
    expect(html).toContain(String(FOUNDING_ARTIST_LIMIT));
    expect(html).toContain(trialOffer(true).headline);
  });

  it("is clear that nothing is charged yet and the free months start with the plan", async () => {
    const html = await render(ArtistFoundingPlaceConfirmed(foundingMock));
    expect(html).toContain("Nothing is charged today");
    expect(html).toContain("Choose a plan");
    expect(html).toContain("cancel at any time");
  });
});

describe("ArtistApplicationApproved", () => {
  it("shows the founding offer to an artist who is flagged", async () => {
    const html = await render(ArtistApplicationApproved({ ...approvedMock, isFounding: true }));
    expect(html).toContain(`${FOUNDING_TRIAL_MONTHS} months free`);
  });

  it("promises nothing of the sort to an artist who is not", async () => {
    // The whole point of the flag. Everything else in the email is unchanged.
    const html = await render(ArtistApplicationApproved({ ...approvedMock, isFounding: false }));
    expect(html).not.toContain("months free");
    expect(html).not.toContain(trialOffer(true).headline);
    expect(html).toContain("Open artist portal");
  });

  it("treats a missing flag as not founding", async () => {
    const { isFounding: _omitted, ...withoutFlag } = approvedMock;
    const html = await render(ArtistApplicationApproved(withoutFlag));
    expect(html).not.toContain("months free");
  });

  it("still tells an artist who picked a plan that nothing is running yet", async () => {
    const html = await render(ArtistApplicationApproved({ ...approvedMock, isFounding: false }));
    expect(html).toContain("Nothing has been charged");
    expect(html).toContain("start it from your billing page");
  });
});

describe("public copy rules", () => {
  it("uses no em or en dashes and says programme, never program", async () => {
    for (const html of [
      await render(ArtistFoundingPlaceConfirmed(foundingMock)),
      await render(ArtistApplicationApproved({ ...approvedMock, isFounding: true })),
    ]) {
      expect(html).not.toContain("—");
      expect(html).not.toContain("–");
      expect(html).not.toMatch(/\bprogram\b/i);
    }
  });
});
