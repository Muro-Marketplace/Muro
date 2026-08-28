// A cron route that nothing schedules is dead code that looks alive.
//
// `AGENTS.md` states the rule for the case that already bit: "A database column
// that mirrors a computed value must be either written by a DB trigger, or
// written by a scheduled job listed in vercel.json. A column written only by a
// manual admin endpoint is banned." That was 07 K5 —
// `artist_profiles.total_views` and its three siblings were written only by
// `POST /api/admin/refresh-stats`, which no cron ever hit, so an artist's
// dashboard reported 0 profile views against 2,295 real view events.
//
// The same failure has two other shapes, and neither had a guard:
//
//   a route under api/cron with no entry in vercel.json  — never runs, and looks
//                                                          like it does
//   an entry in vercel.json with no route                — 404s on a schedule,
//                                                          silently, forever
//
// Also asserts every cron route is authenticated, because these send email in
// bulk and a public one is a spam cannon with a URL.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const CRON_DIR = path.join(ROOT, "src/app/api/cron");

interface CronEntry {
  path: string;
  schedule: string;
}

function scheduled(): CronEntry[] {
  const vercel = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  return (vercel.crons ?? []) as CronEntry[];
}

/** Every directory under api/cron that actually has a route. */
function cronRoutes(): string[] {
  return readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(CRON_DIR, e.name, "route.ts")))
    .map((e) => `/api/cron/${e.name}`)
    .sort();
}

describe("cron routes and their schedules agree", () => {
  it("finds routes and schedules at all", () => {
    expect(cronRoutes().length).toBeGreaterThan(3);
    expect(scheduled().length).toBeGreaterThan(3);
  });

  it("every cron route is scheduled in vercel.json", () => {
    const paths = new Set(scheduled().map((c) => c.path));
    const orphans = cronRoutes().filter((r) => !paths.has(r));
    expect(
      orphans,
      "these exist, are tested, and never run. Add a `crons` entry or delete the route.",
    ).toEqual([]);
  });

  it("every scheduled path resolves to a route file", () => {
    const missing = scheduled()
      .map((c) => c.path)
      .filter((p) => !existsSync(path.join(ROOT, "src/app", `${p}/route.ts`)));
    expect(
      missing,
      "Vercel will call these on a schedule and get a 404, silently, forever.",
    ).toEqual([]);
  });

  it("no path is scheduled twice", () => {
    const paths = scheduled().map((c) => c.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("every schedule is a five-field cron expression", () => {
    for (const c of scheduled()) {
      expect(c.schedule.trim().split(/\s+/), `${c.path}: "${c.schedule}"`).toHaveLength(5);
    }
  });

  it("every cron route authenticates, because these send email in bulk", () => {
    // A public one is a spam cannon with a URL.
    const unguarded = cronRoutes().filter((r) => {
      const file = path.join(ROOT, "src/app", `${r}/route.ts`);
      return !readFileSync(file, "utf8").includes("requireCronAuth");
    });
    expect(unguarded).toEqual([]);
  });
});
