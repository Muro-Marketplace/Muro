import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import playwrightConfig from "../../playwright.config";

// Task 0 (MASTER-RUNBOOK §1.1): the CI gaps that make the rest of the
// remediation plan enforceable. Every custom ESLint rule in the plan is theatre
// while the lint step may fail silently, and the RLS work in §02 has no
// regression gate unless the advisor snapshot runs in CI. Both are one-line
// mistakes to undo, so both are locked here.

const here = path.dirname(fileURLToPath(import.meta.url));
const CI_WORKFLOW = path.resolve(here, "../../../.github/workflows/ci.yml");

const lines = readFileSync(CI_WORKFLOW, "utf8").split("\n");

const indentOf = (line: string): number => line.match(/^\s*/)![0].length;
const isStepMarker = (line: string): boolean => /^\s*-\s/.test(line);
/** A job key, i.e. `  check:` at the two-space indent under `jobs:`. */
const isJobKey = (line: string): boolean => /^ {2}[A-Za-z0-9_-]+:\s*$/.test(line);

const runLine = (command: string): RegExp =>
  new RegExp(`^\\s*(-\\s+)?run:\\s*${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);

function indexOfStepRunning(command: string): number {
  const idx = lines.findIndex((l) => runLine(command).test(l));
  if (idx === -1) throw new Error(`no step in ci.yml runs \`${command}\``);
  return idx;
}

/**
 * The YAML lines of the step running `command`, from its `- ` marker up to
 * (excluding) the next sibling step.
 */
function stepBlock(command: string): string[] {
  const runIdx = indexOfStepRunning(command);

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

/** The YAML lines of the whole job containing the step that runs `command`. */
function jobBlock(command: string): string[] {
  const runIdx = indexOfStepRunning(command);

  let start = runIdx;
  while (start >= 0 && !isJobKey(lines[start])) start--;

  let end = runIdx + 1;
  while (end < lines.length && !isJobKey(lines[end])) end++;

  return lines.slice(start, end);
}

describe("CI lint gate", () => {
  it("has a step that runs `npm run lint`", () => {
    expect(() => stepBlock("npm run lint")).not.toThrow();
  });

  it("does not let the lint step pass when lint fails", () => {
    // `continue-on-error: true` here means an error-level rule cannot break the
    // build, which silently disables every lint-based guard in the repo.
    expect(stepBlock("npm run lint").join("\n")).not.toMatch(/continue-on-error/);
  });
});

describe("CI advisor gate", () => {
  it("has a step that runs `npm run audit:advisors`", () => {
    expect(() => stepBlock("npm run audit:advisors")).not.toThrow();
  });

  it("does not let the advisor step pass when a new lint appears", () => {
    expect(stepBlock("npm run audit:advisors").join("\n")).not.toMatch(/continue-on-error/);
  });

  it("passes SUPABASE_ACCESS_TOKEN from repo secrets to the advisor job", () => {
    // snapshot-advisors.ts exits 2 without this token, so a job that omits it
    // can never do anything but fail.
    expect(jobBlock("npm run audit:advisors").join("\n")).toMatch(
      /SUPABASE_ACCESS_TOKEN:\s*\$\{\{\s*secrets\.SUPABASE_ACCESS_TOKEN\s*\}\}/,
    );
  });
});

describe("CI security-e2e gate", () => {
  // Runbook §1.1 row 3 asks whether security-no-leaks.spec.ts reaches CI. It
  // does: `npm run test:e2e` collects everything under testDir, so the separate
  // `audit:e2e-security` script is a convenience for running it alone, not the
  // only path to it. What needs locking is that nothing narrows the collection
  // so the spec quietly stops running. (Whether its assertions are *meaningful*
  // in CI is a separate, open question, see PROGRESS.md.)
  const SPEC = "tests/e2e/security-no-leaks.spec.ts";
  const websiteRoot = path.resolve(here, "../..");

  it("has a CI step that runs the Playwright suite", () => {
    expect(() => stepBlock("npm run test:e2e")).not.toThrow();
  });

  it("keeps the security spec on disk where the suite looks for it", () => {
    expect(existsSync(path.join(websiteRoot, SPEC))).toBe(true);
    expect(path.resolve(websiteRoot, playwrightConfig.testDir ?? ".")).toBe(
      path.join(websiteRoot, "tests/e2e"),
    );
  });

  it("does not narrow Playwright collection in a way that could drop the spec", () => {
    // Any of these silently shrinks the suite. The security spec is the one we
    // can least afford to lose, so treat narrowing as a config error.
    expect(playwrightConfig.testMatch, "testMatch would override the default glob").toBeUndefined();
    expect(playwrightConfig.testIgnore, "testIgnore could exclude the spec").toBeUndefined();
    expect(playwrightConfig.grep, "grep could exclude the spec").toBeUndefined();
    expect(playwrightConfig.grepInvert, "grepInvert could exclude the spec").toBeUndefined();
    for (const project of playwrightConfig.projects ?? []) {
      expect(project.testMatch, `project ${project.name} narrows testMatch`).toBeUndefined();
      expect(project.testIgnore, `project ${project.name} narrows testIgnore`).toBeUndefined();
      expect(project.grep, `project ${project.name} narrows grep`).toBeUndefined();
      expect(project.grepInvert, `project ${project.name} narrows grepInvert`).toBeUndefined();
    }
  });
});
