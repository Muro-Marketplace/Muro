// A52. The receipt said "within 3 working days" because api/apply passed
// `reviewTimelineDays: 3`, while every public page promises 5 business days.
// The timeline is a published promise, so the template owns it and no caller
// can shorten it by passing a smaller number.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import { ArtistApplicationSubmitted, REVIEW_TIMELINE_BUSINESS_DAYS, mock } from "./ArtistApplicationSubmitted";

// Plaintext, not HTML: React splits `within {N} business days` into three
// children, so the HTML carries `<!-- -->` markers between them and a literal
// substring match would never hit.
async function html(props: Parameters<typeof ArtistApplicationSubmitted>[0]) {
  return render(ArtistApplicationSubmitted(props), { plainText: true });
}

describe("ArtistApplicationSubmitted (A52)", () => {
  it("promises the same 5 business days the public pages do", async () => {
    expect(REVIEW_TIMELINE_BUSINESS_DAYS).toBe(5);
    const out = await html(mock);
    expect(out).toContain("within 5 business days");
  });

  it("does not promise 3 days", async () => {
    // Fail-before: api/apply passed reviewTimelineDays: 3 and the template
    // rendered it, so the receipt undercut the site by two days.
    const out = await html(mock);
    expect(out).not.toContain("3 working days");
    expect(out).not.toContain("3 business days");
  });

  it("ignores a caller that still passes a shorter timeline", async () => {
    // The api/apply call site has not been cleaned up yet; until it is, the
    // number it passes must not reach the applicant.
    const out = await html({ ...mock, reviewTimelineDays: 3 });
    expect(out).toContain("within 5 business days");
    expect(out).not.toContain("3 ");
  });
});
