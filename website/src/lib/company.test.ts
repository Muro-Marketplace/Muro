import { describe, expect, it } from "vitest";
import { COMPANY, isIncorporated } from "./company";

describe("company identity", () => {
  it("is not incorporated while the number is blank", () => {
    expect(isIncorporated()).toBe(COMPANY.number.trim().length > 0);
  });

  it("once a number is set, the legal name and office must be too", () => {
    if (isIncorporated()) {
      expect(COMPANY.legalName.trim()).not.toBe("");
      expect(COMPANY.registeredOffice.trim()).not.toBe("");
    }
  });
});
