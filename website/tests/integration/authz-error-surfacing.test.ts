// 01 §1.3 / Phase E item 14.
//
// Every route that phases B to D touched ended in a bare `catch {}` that answered
// `{ error: "Invalid request" }` with 400. Three different things collapsed into
// that one response:
//
//   an AuthzError, which means 403 or 404 and is the whole point of the assert*
//   helpers those phases introduced;
//   a schema or JSON failure, which genuinely is 400;
//   a real server fault, which is 500 and which nobody could see because the
//   error object was discarded.
//
// The third one cost real time three separate times while building phases C and
// D: a fixture gap surfaced as a generic 400 that was indistinguishable from "the
// new guard rejected this", and each time the only way to tell them apart was to
// temporarily add a console.error and re-run. That is the argument for logging,
// not just for handleAuthzError.
//
// This test is the CI gate the item asks for: it fails if a handler-level catch
// goes back to swallowing.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/app/api");

/**
 * The routes phases B to D changed. Listed explicitly rather than globbed: the
 * item is scoped to these, and a wildcard would silently pull in routes nobody
 * has reviewed for this pattern.
 */
const PHASE_B_TO_D_ROUTES = [
  "artist-works/route.ts",
  "artist-profile/route.ts",
  "venue-profile/route.ts",
  "orders/route.ts",
  "checkout/session/route.ts",
  "artwork-requests/[id]/route.ts",
  "artwork-requests/[id]/responses/route.ts",
  "artwork-requests/[id]/fulfill/route.ts",
  "messages/route.ts",
  "messages/[conversationId]/route.ts",
  "placements/route.ts",
];

/**
 * Source with comments removed, so the scan reads EXECUTABLE code.
 *
 * The second time this session that a source-reading assertion had to learn this:
 * the CI-gates test needed the same treatment for YAML. Here the comments
 * explaining each converted catch contain the literal `} catch {`, so an
 * uncommented scan reported the very thing the comment says was fixed.
 *
 * Deliberately naive about strings containing comment markers: none of these
 * route files has one, and a real parser is not worth the dependency for a gate.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const read = (rel: string) => withoutComments(readFileSync(path.join(API, rel), "utf8"));

/**
 * Every `catch` block in the file, as {bound, body} where body runs to the
 * closing brace at the catch's own indentation.
 *
 * Block-scoped on purpose. The first version of this test matched a regex window
 * of 400 characters after `catch (err) {` and then asked whether the WHOLE FILE
 * mentioned handleAuthzError. Both halves were wrong: the window was shorter than
 * the explanatory comments now inside these catches, so it silently stopped
 * matching, and a file-wide search would be satisfied by a mention anywhere. A
 * probe that removed the call and the import passed. Scoping to the block fixes
 * both.
 */
function catchBlocks(source: string): { bound: boolean; body: string }[] {
  const out: { bound: boolean; body: string }[] = [];
  const re = /\}[ \t]*catch[ \t]*(\([^)]*\))?[ \t]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    // Walk braces from the opening one so nested blocks are included exactly.
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      i++;
    }
    out.push({ bound: !!m[1] && m[1].trim() !== "()", body: source.slice(m.index + m[0].length, i) });
  }
  return out;
}

/** Does this catch body answer the blanket "Invalid request" 400? */
const isBlanket400 = (body: string) => /error:\s*"Invalid request"/.test(body);

function blanketBareCatches(source: string): number {
  return catchBlocks(source).filter((c) => !c.bound && isBlanket400(c.body)).length;
}

describe("no phase B-D route swallows an AuthzError (01 §1.3)", () => {
  it.each(PHASE_B_TO_D_ROUTES)("%s has no blanket bare catch", (rel) => {
    const source = read(rel);
    const count = blanketBareCatches(source);
    expect(
      count,
      `${rel} has ${count} bare catch(es) returning a blanket 400. Bind the error ` +
        `and call handleAuthzError first, so a 403/404 keeps its status and a real ` +
        `fault is logged rather than disguised as a malformed body.`,
    ).toBe(0);
  });

  it("every blanket-400 catch consults handleAuthzError inside its own block", () => {
    // Binding `err` and then ignoring it would satisfy the check above while
    // still discarding the denial, so this asserts the call is in the same block.
    const offenders: string[] = [];
    for (const rel of PHASE_B_TO_D_ROUTES) {
      for (const c of catchBlocks(read(rel))) {
        if (isBlanket400(c.body) && !c.body.includes("handleAuthzError")) offenders.push(rel);
      }
    }
    expect(offenders, `blanket 400 without handleAuthzError in-block:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("logs the swallowed fault, which is what made three fixture bugs invisible", () => {
    const missing: string[] = [];
    for (const rel of PHASE_B_TO_D_ROUTES) {
      for (const c of catchBlocks(read(rel))) {
        if (isBlanket400(c.body) && !/console\.error\([^)]*err/.test(c.body)) missing.push(rel);
      }
    }
    expect(missing, `converted but silent:\n${missing.join("\n")}`).toEqual([]);
  });
});

describe("the assert* helpers can still reach the client (01 §1.3)", () => {
  // Behavioural coverage for the two routes that actually throw AuthzError lives
  // with those findings: messages/route.test.ts asserts the E33 404 is not
  // flattened to 400, and orders/route.test.ts asserts the E21 404
  // order_not_found. This pins that those assertions exist, so deleting them
  // fails here rather than silently removing the only behavioural proof.
  it("keeps the E33 status-surfacing assertion", () => {
    const t = readFileSync(path.join(API, "messages/route.test.ts"), "utf8");
    expect(t).toMatch(/surfaces the authz status rather than the bare catch/);
  });

  it("keeps the E21 order_not_found assertion", () => {
    const t = readFileSync(path.join(API, "orders/route.test.ts"), "utf8");
    expect(t).toMatch(/order_not_found/);
  });
});
