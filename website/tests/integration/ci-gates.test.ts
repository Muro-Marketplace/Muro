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

/**
 * Executable YAML only, with whole-line `#` comments dropped. These workflows
 * explain their own reasoning in prose, so a comment saying "there is no
 * continue-on-error here" must not read as the setting itself.
 */
function withoutComments(yaml: string): string {
  return yaml
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

// 09 item 4.4. `npm run check` is the local gate, and CI ran only three of its
// six parts, so the public-route allowlist, the one-email-entrypoint dependency
// rule and the template render pass gated nothing on a PR. They passed on a
// developer's machine and were decoration everywhere it counted.
//
// The required list is DERIVED from package.json rather than hand-written here,
// so adding a script to `check` and forgetting the CI step fails this test
// instead of silently un-gating the guard it was added for.
describe("CI runs every gate that `npm run check` runs (09 item 4.4)", () => {
  const pkg = JSON.parse(
    readFileSync(path.resolve(here, "../../package.json"), "utf8"),
  ) as { scripts: Record<string, string> };

  /** The `npm run X` names `check` chains together, in order. */
  const checkParts = [...pkg.scripts.check.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]);

  it("parses the check script into parts, so an empty list cannot pass vacuously", () => {
    expect(checkParts.length).toBeGreaterThanOrEqual(4);
    expect(checkParts).toContain("lint");
  });

  it.each(checkParts.map((part) => [part]))("has a CI step running `npm run %s`", (part) => {
    expect(
      () => stepBlock(`npm run ${part}`),
      `\`npm run ${part}\` is part of \`npm run check\` but no CI step runs it, ` +
        "so whatever it guards does not block a PR",
    ).not.toThrow();
  });

  it("does not let any of them pass when they fail", () => {
    for (const part of checkParts) {
      expect(stepBlock(`npm run ${part}`).join("\n"), part).not.toMatch(/continue-on-error/);
    }
  });
});

describe("advisor runs nightly, not as a PR gate (D12 ruling 3)", () => {
  const NIGHTLY_WORKFLOW = path.resolve(here, "../../../.github/workflows/advisors-nightly.yml");
  const nightly = existsSync(NIGHTLY_WORKFLOW)
    ? withoutComments(readFileSync(NIGHTLY_WORKFLOW, "utf8"))
    : "";

  it("does not run the advisor in the PR-gating workflow", () => {
    // D12: the advisor demonstrably misses this codebase's leak class (a clean
    // run is not evidence of RLS health), GitHub withholds secrets from fork
    // PRs so the job would hard-fail on any external contribution, and a per-PR
    // job holding a prod management token widens the blast radius for little
    // gain. The blocking gate is the pg_policies assertion, run via MCP.
    expect(withoutComments(readFileSync(CI_WORKFLOW, "utf8"))).not.toMatch(/audit:advisors/);
  });

  it("runs the advisor on a schedule instead", () => {
    expect(nightly, "advisors-nightly.yml is missing").toMatch(/audit:advisors/);
    expect(nightly).toMatch(/^\s*schedule:/m);
  });

  it("never triggers the advisor workflow from a pull request", () => {
    expect(nightly).not.toMatch(/pull_request/);
  });

  it("passes SUPABASE_ACCESS_TOKEN from repo secrets", () => {
    // snapshot-advisors.ts exits 2 without this token.
    expect(nightly).toMatch(
      /SUPABASE_ACCESS_TOKEN:\s*\$\{\{\s*secrets\.SUPABASE_ACCESS_TOKEN\s*\}\}/,
    );
  });

  it("does not silence advisor failures in the nightly run", () => {
    // It gates nothing, so failing loudly is the whole point: a red nightly is
    // the drift signal. continue-on-error here would leave no signal at all.
    expect(nightly).not.toMatch(/continue-on-error/);
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
