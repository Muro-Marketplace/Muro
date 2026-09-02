import { describe, expect, it } from "vitest";
import { TERMS_VERSION } from "./terms-version";
import { grepFiles } from "../../tests/integration/claims-helpers";

// Final review, Finding 2: the terms-version literal used to be typed out
// separately in five places. Pin the shape and prove the old and new
// literals only ever appear inside this module now, so a future edit can't
// quietly reintroduce a second source of truth.
describe("TERMS_VERSION is the single source of truth", () => {
  it("matches the vX.Y-YYYY-MM shape", () => {
    expect(TERMS_VERSION).toMatch(/^v\d+\.\d+-\d{4}-\d{2}$/);
  });

  it("no file under src other than this module contains the literal", () => {
    // Excludes this file too: it has to spell both literals out itself to
    // search for them, which is not the drift this test guards against.
    const exempt = ["src/lib/terms-version.ts", "src/lib/terms-version.test.ts"];
    for (const literal of ["v1.0-2026-04", "v1.1-2026-09"]) {
      const hits = grepFiles(literal, ["src"]).filter((f) => !exempt.some((e) => f.endsWith(e)));
      expect(hits, `"${literal}" found outside terms-version.ts in: ${hits.join(", ")}`).toEqual([]);
    }
  });
});
