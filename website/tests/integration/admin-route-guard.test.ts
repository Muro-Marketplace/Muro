// E30b — the invariant AdminGate depends on.
//
// AdminGate moves the *decision* about who sees the admin shell to the server,
// but the security *boundary* is still the per-route check inside every handler
// under src/app/api/admin. 03 §2.2 is explicit that it must stay that way: a
// client-executed gate can always be bypassed with devtools, so the only thing
// stopping a self-declared admin reading data is that each route asks
// `getAdminUser` / `isAdminRequest` for itself.
//
// The failure mode this guards is the boring one: someone adds
// api/admin/something/route.ts, forgets the check, and an admin page fetches
// from it. Nothing else in the build would notice.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const ADMIN_API_DIR = path.join(process.cwd(), "src/app/api/admin");

/** Every route.ts under src/app/api/admin, repo-relative. */
async function adminRouteFiles(dir = ADMIN_API_DIR): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await adminRouteFiles(full)));
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      out.push(path.relative(process.cwd(), full));
    }
  }
  return out.sort();
}

const GUARDS = /getAdminUser|isAdminRequest|withAdmin/;

describe("every admin API route enforces admin auth (E30b)", () => {
  it("finds the admin routes at all, so an empty sweep cannot pass vacuously", async () => {
    const files = await adminRouteFiles();
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it("has no route under api/admin without a server-side admin check", async () => {
    const files = await adminRouteFiles();
    const offenders = files.filter((f) => !GUARDS.test(readFileSync(f, "utf8")));
    expect(offenders, "these admin routes render for anyone with a valid token").toEqual([]);
  });

  it("checks admin auth in every exported handler, not just once per file", async () => {
    // A file can guard its GET and forget its POST. Count the exported HTTP
    // handlers and require at least as many guard calls.
    const files = await adminRouteFiles();
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const handlers = source.match(
        /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g,
      );
      if (!handlers) continue;
      const guardCalls = source.match(new RegExp(GUARDS.source, "g")) ?? [];
      if (guardCalls.length < handlers.length) {
        offenders.push(`${file}: ${handlers.length} handlers, ${guardCalls.length} guard calls`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
