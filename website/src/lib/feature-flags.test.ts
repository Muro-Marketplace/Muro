// Feature flags decide whether the visualizer routes/UI are reachable.
// We test:
//   - explicit env values override defaults
//   - dev/prod defaults differ
//   - unknown flag returns false (fail closed)
//   - listFlags reports the resolved state

import { afterEach, describe, expect, it, vi } from "vitest";
import { isFlagOn, listFlags, requireFlag } from "./feature-flags";

const ENV_KEY = "NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1";

// process.env.NODE_ENV is typed as readonly by @types/node. Bracket access
// goes through the index signature, which is writable, Vitest tests that
// flip NODE_ENV all use this trick.
function setNodeEnv(value: "development" | "production" | "test"): void {
  (process.env as Record<string, string>).NODE_ENV = value;
}

describe("feature flags, explicit env wins", () => {
  const SNAPSHOT = { ...process.env };
  afterEach(() => {
    process.env = { ...SNAPSHOT };
  });

  it("env=1 means on", () => {
    process.env[ENV_KEY] = "1";
    setNodeEnv("production");
    expect(isFlagOn("WALL_VISUALIZER_V1")).toBe(true);
  });

  it("env=true means on", () => {
    process.env[ENV_KEY] = "true";
    setNodeEnv("production");
    expect(isFlagOn("WALL_VISUALIZER_V1")).toBe(true);
  });

  it("env=0 means off (even in dev where default is on)", () => {
    process.env[ENV_KEY] = "0";
    setNodeEnv("development");
    expect(isFlagOn("WALL_VISUALIZER_V1")).toBe(false);
  });

  it("env=false means off", () => {
    process.env[ENV_KEY] = "false";
    setNodeEnv("development");
    expect(isFlagOn("WALL_VISUALIZER_V1")).toBe(false);
  });

  it("malformed env value falls back to default", () => {
    process.env[ENV_KEY] = "maybe";
    setNodeEnv("production");
    // Visualizer is now on by default in prod (kill-switch model, set
    // env=0 in Vercel to disable). Use OAUTH_GOOGLE_APPLE for the
    // off-by-default malformed-env case so the assertion still tests
    // the fallback behaviour rather than the specific flag.
    process.env.NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE = "maybe";
    expect(isFlagOn("OAUTH_GOOGLE_APPLE")).toBe(false);
  });
});

describe("feature flags, defaults", () => {
  const SNAPSHOT = { ...process.env };
  afterEach(() => {
    process.env = { ...SNAPSHOT };
  });

  it("dev default is on", () => {
    delete process.env[ENV_KEY];
    setNodeEnv("development");
    expect(isFlagOn("WALL_VISUALIZER_V1")).toBe(true);
  });

  it("prod default is on (visualizer launched, env=0 to kill-switch)", () => {
    delete process.env[ENV_KEY];
    setNodeEnv("production");
    expect(isFlagOn("WALL_VISUALIZER_V1")).toBe(true);
  });

  it("OAUTH_GOOGLE_APPLE prod default is off (providers not yet wired)", () => {
    delete process.env.NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE;
    setNodeEnv("production");
    expect(isFlagOn("OAUTH_GOOGLE_APPLE")).toBe(false);
  });

  // C2 (E16). Gating is on in production, where the env var is set to 1, so the
  // code default agrees with it rather than contradicting it. A build that loses
  // the env var must keep gating on, not silently unpublish the paywall.
  it("GATING_V1 prod default is on", () => {
    delete process.env.NEXT_PUBLIC_FLAG_GATING_V1;
    setNodeEnv("production");
    expect(isFlagOn("GATING_V1")).toBe(true);
  });

  it("GATING_V1 dev default stays off, so local QA needs no subscription", () => {
    // Pins the half of C2 that must NOT change: flipping both defaults would
    // make every local run behave like a subscribed-only site.
    delete process.env.NEXT_PUBLIC_FLAG_GATING_V1;
    setNodeEnv("development");
    expect(isFlagOn("GATING_V1")).toBe(false);
  });

  it("GATING_V1=0 still kills gating in prod, so the env var stays a kill switch", () => {
    process.env.NEXT_PUBLIC_FLAG_GATING_V1 = "0";
    setNodeEnv("production");
    expect(isFlagOn("GATING_V1")).toBe(false);
  });
});

describe("requireFlag", () => {
  const SNAPSHOT = { ...process.env };
  afterEach(() => {
    process.env = { ...SNAPSHOT };
  });

  it("throws when off", () => {
    process.env[ENV_KEY] = "0";
    expect(() => requireFlag("WALL_VISUALIZER_V1")).toThrow(/disabled/);
  });

  it("does not throw when on", () => {
    process.env[ENV_KEY] = "1";
    expect(() => requireFlag("WALL_VISUALIZER_V1")).not.toThrow();
  });
});

describe("listFlags", () => {
  it("reports every defined flag", () => {
    const flags = listFlags();
    expect(flags.some((f) => f.flag === "WALL_VISUALIZER_V1")).toBe(true);
    for (const f of flags) {
      expect(typeof f.on).toBe("boolean");
      expect(f.description.length).toBeGreaterThan(0);
    }
  });
});

// ── E16: the client bundle must see the env var (06 §4.3, C1) ────────────────
//
// The doc says "feature-flags.test.ts cannot catch this: every test runs in Node
// under Vitest, where process.env[key] works fine". It can, if the test
// reproduces what the two reads actually differ on rather than trying to be a
// browser.
//
// Next inlines NEXT_PUBLIC_* via webpack DefinePlugin, which only substitutes a
// statically-written member expression. So:
//   - a static read  → the value is frozen into the bundle at BUILD time, which
//                      here is module-evaluation time;
//   - process.env[k] → a lookup at CALL time against an object that is empty in
//                      the browser (the compiled chunk read `t.default.env[e]`
//                      off the bundled `process` polyfill).
//
// Emptying process.env after import therefore models the browser precisely: the
// build-time snapshot must survive it, the runtime lookup cannot.
describe("E16: a flag resolves from a build-time snapshot, not a call-time lookup", () => {
  const SNAPSHOT = { ...process.env };
  afterEach(() => {
    process.env = { ...SNAPSHOT };
    vi.resetModules();
  });

  async function importWithBuildEnv(
    key: string,
    value: string,
  ): Promise<typeof import("./feature-flags")> {
    process.env[key] = value; // set at "build" time
    vi.resetModules();
    const mod = await import("./feature-flags");
    delete process.env[key]; // the browser's process.env has nothing in it
    return mod;
  }

  it("GATING_V1=1 still resolves on once the runtime env is empty", async () => {
    const mod = await importWithBuildEnv("NEXT_PUBLIC_FLAG_GATING_V1", "1");
    setNodeEnv("production");
    expect(mod.isFlagOn("GATING_V1")).toBe(true);
  });

  it("the kill switch survives too: =0 beats an on-by-default prod flag", async () => {
    // The same defect in the other direction. WALL_VISUALIZER_V1 is prodDefault
    // true, so a client that cannot see the env var ignores the kill switch and
    // keeps rendering a feature someone has just turned off.
    const mod = await importWithBuildEnv("NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1", "0");
    setNodeEnv("production");
    expect(mod.isFlagOn("WALL_VISUALIZER_V1")).toBe(false);
  });

  it("holds for every flag, so a new one cannot be added without its static read", async () => {
    // Guards the map itself: an entry missing from CLIENT_ENV fails here rather
    // than shipping a flag that is invisible to the client.
    for (const key of [
      "NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1",
      "NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE",
      "NEXT_PUBLIC_FLAG_PAID_LOAN_V2",
      "NEXT_PUBLIC_FLAG_GATING_V1",
      "NEXT_PUBLIC_FLAG_BLOGS_V1",
    ]) {
      const mod = await importWithBuildEnv(key, "1");
      setNodeEnv("production");
      const flag = key.replace("NEXT_PUBLIC_FLAG_", "") as Parameters<typeof mod.isFlagOn>[0];
      expect(mod.isFlagOn(flag), `${key} is not statically read`).toBe(true);
      process.env = { ...SNAPSHOT };
    }
  });

  it("a live env value still wins over the snapshot, so the server stays dynamic", async () => {
    // The snapshot must not pin the value: on the server process.env is real and
    // current, and the test suite above depends on mutating it after import.
    process.env.NEXT_PUBLIC_FLAG_GATING_V1 = "1";
    vi.resetModules();
    const mod = await import("./feature-flags");
    process.env.NEXT_PUBLIC_FLAG_GATING_V1 = "0";
    setNodeEnv("production");
    expect(mod.isFlagOn("GATING_V1")).toBe(false);
  });
});
