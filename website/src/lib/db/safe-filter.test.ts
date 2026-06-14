import { describe, it, expect } from "vitest";
import { orFilter } from "./safe-filter";

describe("orFilter", () => {
  it("keeps well-formed terms", () => {
    expect(orFilter(["venue_user_id.eq.abc-123", "venue_name.eq.TateModern"]))
      .toBe("venue_user_id.eq.abc-123,venue_name.eq.TateModern");
  });
  it("keeps normal emails (dots, plus, percent)", () => {
    expect(orFilter(["buyer_email.eq.a.b+x%y@mail.com"]))
      .toBe("buyer_email.eq.a.b+x%y@mail.com");
  });
  it("throws when the only term contains a comma (injection separator)", () => {
    expect(() => orFilter(["venue_name.eq.Smith, John & Co."])).toThrow();
  });
  it("throws when the only term injects an and()/or() group", () => {
    expect(() => orFilter(["venue_name.eq.x),or(venue_user_id.neq.0"])).toThrow();
  });
  it("throws (fails closed) when no terms are safe", () => {
    expect(() => orFilter(["bad,inject"])).toThrow(/no safe terms/);
  });
  it("joins only the safe terms", () => {
    expect(orFilter(["venue_user_id.eq.safe-id", "venue_name.eq.bad,inject"]))
      .toBe("venue_user_id.eq.safe-id");
  });
});
