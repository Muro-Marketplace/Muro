// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { CASE_STUDY } from "./ProgrammesClient";

// Launch audit, section 05. Every "proof" photo on the site was a before
// shot and the only testimonial was attributed to Wallplace itself. This
// slot renders nothing until the owner supplies a real installation (A5),
// so the page can never show a fabricated case.
describe("CASE_STUDY", () => {
  it("is null or complete", () => {
    if (CASE_STUDY === null) return;
    expect(CASE_STUDY.image).toMatch(/^\/images\/programmes\/case-study-/);
    for (const key of ["venue", "quote", "attribution"] as const) {
      expect(CASE_STUDY[key].trim()).not.toBe("");
    }
  });
});
