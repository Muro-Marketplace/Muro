import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safe-redirect";

describe("safeRedirect()", () => {
  it("returns the fallback when input is missing", () => {
    expect(safeRedirect(null, "/browse")).toBe("/browse");
    expect(safeRedirect(undefined, "/browse")).toBe("/browse");
    expect(safeRedirect("", "/browse")).toBe("/browse");
  });

  it("accepts a same-origin absolute path", () => {
    expect(safeRedirect("/apply", "/browse")).toBe("/apply");
    expect(safeRedirect("/checkout?ref=qr", "/browse")).toBe("/checkout?ref=qr");
  });

  it("rejects a fully-qualified URL (open-redirect attempt)", () => {
    expect(safeRedirect("https://evil.example.com/path", "/browse")).toBe("/browse");
    expect(safeRedirect("//evil.example.com/path", "/browse")).toBe("/browse");
  });

  it("rejects a path that doesn't start with /", () => {
    expect(safeRedirect("apply", "/browse")).toBe("/browse");
  });

  it("rejects /\\\\ tricks", () => {
    expect(safeRedirect("/\\evil.com", "/browse")).toBe("/browse");
  });

  it("strips javascript: and data: schemes even if URL-encoded", () => {
    expect(safeRedirect("javascript:alert(1)", "/browse")).toBe("/browse");
    expect(safeRedirect("/javascript:alert(1)", "/browse")).toBe("/browse");
  });

  it("rejects in-app paths containing ASCII control characters", () => {
    const tab = String.fromCharCode(9);
    const nul = String.fromCharCode(0);
    const del = String.fromCharCode(127);
    expect(safeRedirect("/foo" + tab + "bar", "/browse")).toBe("/browse");
    expect(safeRedirect("/foo" + nul + "bar", "/browse")).toBe("/browse");
    expect(safeRedirect("/foo" + del, "/browse")).toBe("/browse");
  });
});
