#!/usr/bin/env tsx
/**
 * Stale-allowlist guard for eslint-rules/public-routes.js.
 *
 * ESLint cannot report an allowlist entry that no longer matches any file, so a
 * renamed or deleted route would quietly keep its authz exemption, and the next
 * route created at that path would inherit it. This fails the build instead.
 *
 * Checks:
 *   1. every PUBLIC_ROUTES / DEMO_EXEMPT_ROUTES key resolves to a real file
 *   2. every entry carries a non-trivial reason
 *   3. every key looks like a route handler under src/app/api
 *
 * Run via `npm run audit:allowlist`, which `npm run check` includes.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PUBLIC_ROUTES, DEMO_EXEMPT_ROUTES } = require("../../eslint-rules/public-routes.js") as {
  PUBLIC_ROUTES: Record<string, string>;
  DEMO_EXEMPT_ROUTES: Record<string, string>;
};

const WEBSITE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const MIN_REASON_LENGTH = 20;
const ROUTE_KEY = /^src\/app\/api\/.+\/route\.ts$/;

const problems: string[] = [];

for (const [listName, list] of [
  ["PUBLIC_ROUTES", PUBLIC_ROUTES],
  ["DEMO_EXEMPT_ROUTES", DEMO_EXEMPT_ROUTES],
] as const) {
  for (const [route, reason] of Object.entries(list)) {
    if (!ROUTE_KEY.test(route)) {
      problems.push(`${listName}: "${route}" is not a src/app/api/**/route.ts path`);
    }
    if (!existsSync(path.join(WEBSITE_ROOT, route))) {
      problems.push(
        `${listName}: "${route}" does not exist. If the route was deleted or renamed, ` +
          `remove or update the entry, otherwise the exemption outlives the code it excused.`,
      );
    }
    if (typeof reason !== "string" || reason.trim().length < MIN_REASON_LENGTH) {
      problems.push(
        `${listName}: "${route}" needs a reason of at least ${MIN_REASON_LENGTH} characters ` +
          `stating which alternative control authenticates it.`,
      );
    }
  }
}

// Every public route must also be demo-exempt: an unauthenticated route has no
// user id to test, so requiring a demo guard there is impossible to satisfy.
for (const route of Object.keys(PUBLIC_ROUTES)) {
  if (!Object.prototype.hasOwnProperty.call(DEMO_EXEMPT_ROUTES, route)) {
    problems.push(`DEMO_EXEMPT_ROUTES is missing "${route}", which is in PUBLIC_ROUTES`);
  }
}

if (problems.length > 0) {
  console.error(`\nFAIL: ${problems.length} problem(s) in eslint-rules/public-routes.js:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("");
  process.exit(1);
}

console.log(
  `PASS: ${Object.keys(PUBLIC_ROUTES).length} public route(s) and ` +
    `${Object.keys(DEMO_EXEMPT_ROUTES).length} demo-exempt route(s) all resolve, with reasons.`,
);
