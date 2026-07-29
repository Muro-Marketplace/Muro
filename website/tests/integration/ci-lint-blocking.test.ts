import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

// Task 0 (MASTER-RUNBOOK §1.1): lint must block CI. Every custom ESLint rule in
// the remediation plan (no-raw-arrangement-type, no-missing-authz,
// no-body-spread-write, ...) is theatre while the lint step is allowed to fail
// silently, so the absence of `continue-on-error` on that step is itself an
// invariant worth locking.

const here = path.dirname(fileURLToPath(import.meta.url));
const CI_WORKFLOW = path.resolve(here, "../../../.github/workflows/ci.yml");

const lines = readFileSync(CI_WORKFLOW, "utf8").split("\n");

const indentOf = (line: string): number => line.match(/^\s*/)![0].length;
const isStepMarker = (line: string): boolean => /^\s*-\s/.test(line);

/**
 * The YAML lines belonging to the step that runs `npm run lint`, from its `- `
 * marker up to (excluding) the next sibling step. Throws if no step runs lint.
 */
function lintStepBlock(): string[] {
  const runIdx = lines.findIndex((l) => /^\s*(-\s+)?run:\s*npm run lint\s*$/.test(l));
  if (runIdx === -1) {
    throw new Error("no step in ci.yml runs `npm run lint`");
  }

  let start = runIdx;
  while (start >= 0 && !isStepMarker(lines[start])) start--;
  const stepIndent = indentOf(lines[start]);

  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim() === "") {
      end++;
      continue;
    }
    // Next sibling step, or a dedent out of the `steps:` list entirely.
    if (isStepMarker(line) && indentOf(line) === stepIndent) break;
    if (!isStepMarker(line) && indentOf(line) <= stepIndent) break;
    end++;
  }

  return lines.slice(start, end);
}

describe("CI lint gate", () => {
  it("has a step that runs `npm run lint`", () => {
    expect(() => lintStepBlock()).not.toThrow();
  });

  it("does not let the lint step pass when lint fails", () => {
    // `continue-on-error: true` here means an error-level rule cannot break the
    // build, which silently disables every lint-based guard in the repo.
    expect(lintStepBlock().join("\n")).not.toMatch(/continue-on-error/);
  });
});
