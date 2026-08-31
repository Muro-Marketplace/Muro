import { describe, expect, it } from "vitest";
import { applySchema } from "./validations";
import {
  REQUIRED_APPLICATION_COLUMNS,
  buildArtistApplicationRow,
} from "./artist-application-row";

/** The only fields the form actually requires. */
const MINIMAL = {
  name: "QA Applicant",
  email: "qa@example.test",
  location: "London",
};

function parse(body: Record<string, unknown>) {
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) throw new Error(`fixture failed validation: ${parsed.error.message}`);
  return parsed.data;
}

describe("buildArtistApplicationRow", () => {
  // A L514. Submitting the form with the optional fields left blank returned
  // 500 in production: `primary_medium` was written as an explicit null, and
  // `artist_statement` was undefined, which JSON serialisation drops so the
  // column never reaches the INSERT at all. Both are NOT NULL with no default.
  it("never writes null or undefined to a NOT NULL column", () => {
    const row = buildArtistApplicationRow(parse(MINIMAL));
    for (const column of REQUIRED_APPLICATION_COLUMNS) {
      expect(row[column], `${column} must be a string`).toBeTypeOf("string");
    }
  });

  it("survives JSON serialisation with every required column intact", () => {
    // The insert body goes over the wire as JSON, so a key holding undefined
    // disappears entirely. Round-tripping is the honest check.
    const row = JSON.parse(JSON.stringify(buildArtistApplicationRow(parse(MINIMAL))));
    for (const column of REQUIRED_APPLICATION_COLUMNS) {
      expect(Object.keys(row)).toContain(column);
      expect(row[column]).not.toBeNull();
    }
  });

  it("blank optional strings become empty strings, not nulls", () => {
    const row = buildArtistApplicationRow(
      parse({ ...MINIMAL, primaryMedium: "", artistStatement: "", portfolioLink: "" }),
    );
    expect(row.primary_medium).toBe("");
    expect(row.artist_statement).toBe("");
    expect(row.portfolio_link).toBe("");
  });

  it("keeps the values it is given", () => {
    const row = buildArtistApplicationRow(
      parse({
        ...MINIMAL,
        primaryMedium: "Oil on canvas",
        artistStatement: "I paint slowly.",
        portfolioLink: "https://example.test/work",
      }),
    );
    expect(row.primary_medium).toBe("Oil on canvas");
    expect(row.artist_statement).toBe("I paint slowly.");
    expect(row.portfolio_link).toBe("https://example.test/work");
  });

  it("appends sample URLs to the portfolio link", () => {
    const row = buildArtistApplicationRow(
      parse({
        ...MINIMAL,
        portfolioLink: "https://example.test/work",
        sampleWorkUrls: ["https://a.test", "https://b.test"],
      }),
    );
    expect(row.portfolio_link).toBe(
      "https://example.test/work\nSample 1: https://a.test\nSample 2: https://b.test",
    );
  });

  it("uses sample URLs alone when there is no portfolio link", () => {
    const row = buildArtistApplicationRow(
      parse({ ...MINIMAL, sampleWorkUrls: ["https://a.test"] }),
    );
    expect(row.portfolio_link).toBe("Sample 1: https://a.test");
  });

  it("drops blank sample URLs rather than numbering them", () => {
    const row = buildArtistApplicationRow(
      parse({ ...MINIMAL, sampleWorkUrls: ["", "  ", "https://b.test"] }),
    );
    expect(row.portfolio_link).toBe("Sample 1: https://b.test");
  });

  it("stores the referral code the ROUTE resolved, not the one the applicant typed", () => {
    // Row G L2366. The builder used to upper-case and store whatever was
    // posted, so application 29 recorded QATESTREF, a code no artist owns. The
    // route resolves it against artist_profiles.referral_code and passes the
    // result; the raw input is not consulted here at all.
    const row = buildArtistApplicationRow(parse({ ...MINIMAL, referralCode: "fin123" }), {
      referredByCode: "FIN123",
    });
    expect(row.referred_by_code).toBe("FIN123");
    expect(row.selected_plan).toBe("core");
  });

  it("drops an unresolved code rather than storing it as if it were valid", () => {
    const row = buildArtistApplicationRow(parse({ ...MINIMAL, referralCode: "QATESTREF" }), {
      referredByCode: null,
    });
    expect(row.referred_by_code).toBeNull();
  });

  it("defaults to no code when the caller resolved nothing, never to the raw input", () => {
    const row = buildArtistApplicationRow(parse({ ...MINIMAL, referralCode: "QATESTREF" }));
    expect(row.referred_by_code).toBeNull();
  });

  it("leaves the referral code null when none is given", () => {
    expect(buildArtistApplicationRow(parse(MINIMAL)).referred_by_code).toBeNull();
  });

  it("always submits as pending", () => {
    const row = buildArtistApplicationRow(parse({ ...MINIMAL, status: "approved" }));
    expect(row.status).toBe("pending");
  });

  // Migration 126. The form requires this of consumer applicants and has
  // always sent it, but `applySchema` never declared the field, so zod
  // stripped it and no writer ever saw it. Every consumer artist attested to
  // a statutory cancellation right and we kept no evidence of it.
  describe("cooling-off acknowledgement", () => {
    it("records the acknowledgement and when it was given", () => {
      const row = buildArtistApplicationRow(
        parse({ ...MINIMAL, traderStatus: "consumer", acknowledgedCoolingOff: true }),
        { now: "2026-08-31T09:00:00.000Z" },
      );
      expect(row.acknowledged_cooling_off).toBe(true);
      expect(row.acknowledged_cooling_off_at).toBe("2026-08-31T09:00:00.000Z");
    });

    it("survives validation rather than being stripped", () => {
      const parsed = applySchema.safeParse({ ...MINIMAL, acknowledgedCoolingOff: true });
      expect(parsed.success && parsed.data.acknowledgedCoolingOff).toBe(true);
    });

    it("holds null, not false, when nothing was acknowledged", () => {
      // false would assert the applicant declined. We simply have no record.
      const row = buildArtistApplicationRow(parse(MINIMAL));
      expect(row.acknowledged_cooling_off).toBeNull();
      expect(row.acknowledged_cooling_off_at).toBeNull();
    });

    it("stamps no time when the box was explicitly unticked", () => {
      const row = buildArtistApplicationRow(
        parse({ ...MINIMAL, acknowledgedCoolingOff: false }),
      );
      expect(row.acknowledged_cooling_off).toBe(false);
      expect(row.acknowledged_cooling_off_at).toBeNull();
    });
  });

  it("accepts an injected timestamp", () => {
    const row = buildArtistApplicationRow(parse(MINIMAL), { now: "2026-08-31T00:00:00.000Z" });
    expect(row.created_at).toBe("2026-08-31T00:00:00.000Z");
  });
});
