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

  it("upper-cases the referral code and defaults the plan", () => {
    const row = buildArtistApplicationRow(parse({ ...MINIMAL, referralCode: "fin123" }));
    expect(row.referred_by_code).toBe("FIN123");
    expect(row.selected_plan).toBe("core");
  });

  it("leaves the referral code null when none is given", () => {
    expect(buildArtistApplicationRow(parse(MINIMAL)).referred_by_code).toBeNull();
  });

  it("always submits as pending", () => {
    const row = buildArtistApplicationRow(parse({ ...MINIMAL, status: "approved" }));
    expect(row.status).toBe("pending");
  });

  it("accepts an injected timestamp", () => {
    const row = buildArtistApplicationRow(parse(MINIMAL), { now: "2026-08-31T00:00:00.000Z" });
    expect(row.created_at).toBe("2026-08-31T00:00:00.000Z");
  });
});
