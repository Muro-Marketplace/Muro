import { describe, expect, it } from "vitest";
import { findNewLints } from "./check-regressions";

describe("findNewLints", () => {
  it("returns empty when current matches baseline", () => {
    const baseline = [{ cache_key: "a" }, { cache_key: "b" }];
    const current = [{ cache_key: "a" }, { cache_key: "b" }];
    expect(findNewLints(baseline, current)).toEqual([]);
  });

  it("returns the new lints only", () => {
    const baseline = [{ cache_key: "a" }];
    const current = [{ cache_key: "a" }, { cache_key: "new", name: "x", detail: "d" }];
    expect(findNewLints(baseline, current)).toEqual([{ cache_key: "new", name: "x", detail: "d" }]);
  });

  it("ignores fixed lints (in baseline but not current)", () => {
    const baseline = [{ cache_key: "a" }, { cache_key: "b" }];
    const current = [{ cache_key: "a" }];
    expect(findNewLints(baseline, current)).toEqual([]);
  });

  it("excludes cache_keys listed in known-acceptable.json", () => {
    const baseline = [{ cache_key: "a" }];
    const current = [
      { cache_key: "a" },
      { cache_key: "new-but-acceptable", name: "rls_enabled_no_policy" },
      { cache_key: "new-real", name: "security_definer_view" },
    ];
    const acceptable = { ignore_cache_keys: ["new-but-acceptable"] };
    expect(findNewLints(baseline, current, acceptable)).toEqual([
      { cache_key: "new-real", name: "security_definer_view" },
    ]);
  });
});
