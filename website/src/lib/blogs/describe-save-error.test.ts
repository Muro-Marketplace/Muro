import { describe, it, expect } from "vitest";
import { describeSaveError } from "./describe-save-error";

describe("describeSaveError()", () => {
  it("returns the generic fallback when given nothing", () => {
    expect(describeSaveError(undefined)).toBe("Failed to save");
    expect(describeSaveError(null)).toBe("Failed to save");
    expect(describeSaveError("")).toBe("Failed to save");
  });

  it("returns the raw error message when only `error` is set", () => {
    expect(describeSaveError({ error: "Not authorised" })).toBe("Not authorised");
  });

  it("joins issues[] when the submit-for-review path supplied them", () => {
    expect(
      describeSaveError({
        error: "Not ready for review",
        issues: [
          "Title needs at least 3 characters before submitting.",
          "Body needs at least 20 characters before submitting.",
        ],
      }),
    ).toBe(
      "Title needs at least 3 characters before submitting. " +
        "Body needs at least 20 characters before submitting.",
    );
  });

  it("formats Zod details into 'field: message' tokens", () => {
    const details = {
      _errors: [],
      title: { _errors: ["String must contain at least 3 character(s)"] },
      cover_image_url: { _errors: ["Invalid url"] },
    };
    const out = describeSaveError({ error: "Validation failed", details });
    expect(out).toContain("title:");
    expect(out).toContain("cover_image_url:");
    expect(out).toContain("Invalid url");
  });

  it("falls back to error when details has no field-level errors", () => {
    expect(
      describeSaveError({ error: "Validation failed", details: { _errors: [] } }),
    ).toBe("Validation failed");
  });

  it("ignores non-string entries in issues[]", () => {
    expect(
      describeSaveError({ error: "x", issues: ["A", 42, null, "B"] }),
    ).toBe("A B");
  });
});
