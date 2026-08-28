// The venue portal rendered `venue_looking` into a badge, because the field was
// typed as the ARRANGEMENT vocabulary and populated from a different column.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { ENQUIRY_TYPES, enquiryTypeLabel } from "./enquiry-types";

describe("enquiryTypeLabel", () => {
  it("labels every value the enquiry form can send", () => {
    // THE regression: these are the four `<option value=...>` on the artist
    // profile form, and the portal showed the raw slug for all of them.
    for (const t of ENQUIRY_TYPES) {
      expect(enquiryTypeLabel(t.value), t.value).toBe(t.label);
      expect(enquiryTypeLabel(t.value)).not.toContain("_");
    }
  });

  it("labels the three values actually in production", () => {
    expect(enquiryTypeLabel("venue_looking")).toBe("Looking for art");
    expect(enquiryTypeLabel("general")).toBe("General question");
    expect(enquiryTypeLabel("purchasing")).toBe("Purchase enquiry");
  });

  it("makes an unknown value readable rather than hiding it", () => {
    // "Other" would lose what was stored. A legacy row should still say what it
    // is, just in words.
    expect(enquiryTypeLabel("some_legacy_value")).toBe("Some legacy value");
  });

  it("copes with case and whitespace from an older writer", () => {
    expect(enquiryTypeLabel("  VENUE_LOOKING ")).toBe("Looking for art");
  });

  it("falls back for an empty or missing value", () => {
    expect(enquiryTypeLabel(null)).toBe("Enquiry");
    expect(enquiryTypeLabel(undefined)).toBe("Enquiry");
    expect(enquiryTypeLabel("   ")).toBe("Enquiry");
  });

  it("is what the portal badge and the enquiry form both read from", () => {
    // The badge rendered `enquiry.type` raw, and the form had its own copy of
    // the option text. Naming both files means deleting either import is a
    // failing test rather than a silent return to two vocabularies.
    // (E27: the badge moved from the dead venue-portal enquiries page to the
    // artist-portal enquiries page, where the audience always was.)
    const root = path.resolve(__dirname, "../..");
    for (const file of [
      "src/app/(pages)/artist-portal/enquiries/page.tsx",
      "src/app/(pages)/browse/[slug]/ArtistProfileClient.tsx",
    ]) {
      expect(readFileSync(path.join(root, file), "utf8"), file).toContain("@/lib/enquiry-types");
    }
  });

  it("gives every type a distinct label and a distinct value", () => {
    expect(new Set(ENQUIRY_TYPES.map((t) => t.value)).size).toBe(ENQUIRY_TYPES.length);
    expect(new Set(ENQUIRY_TYPES.map((t) => t.label)).size).toBe(ENQUIRY_TYPES.length);
  });
});
