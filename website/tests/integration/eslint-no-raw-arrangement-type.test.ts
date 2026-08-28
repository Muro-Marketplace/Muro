// 09 item 4.6. `no-raw-arrangement-type` was the one registered rule with no
// test, which for a rule at `error` means nothing verified it fires at all.
//
// What it guards: the DB column is overloaded. `free_loan` is a legacy alias
// that means a PAID loan when a monthly fee is attached and a genuine FREE
// display when there is not; `paid_loan` is the canonical paid value. So a
// hand-rolled `=== "free_loan"` silently mishandles every `paid_loan` row, which
// is what produced "paid loan renders as Direct Purchase" and the missing
// "Set up payment" chip.

import { createRequire } from "node:module";
import { Linter } from "eslint";
import { describe, it, expect } from "vitest";

const require = createRequire(import.meta.url);
const rule = require("../../eslint-rules/no-raw-arrangement-type.js") as import("eslint").Rule.RuleModule;

const config = [
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: "latest" as const, sourceType: "module" as const },
    plugins: { wallplace: { rules: { "no-raw-arrangement-type": rule } } },
    rules: { "wallplace/no-raw-arrangement-type": "error" as const },
  },
];

function lint(code: string, filename = "src/app/api/thing/route.ts") {
  return new Linter().verify(code, config, filename);
}

const ids = (messages: Linter.LintMessage[]) => messages.map((m) => m.messageId);

describe("wallplace/no-raw-arrangement-type", () => {
  it("flags === against free_loan", () => {
    expect(ids(lint(`if (p.arrangement_type === "free_loan") { pay(); }`))).toEqual([
      "rawArrangementType",
    ]);
  });

  it("flags === against paid_loan", () => {
    expect(ids(lint(`if (p.arrangement_type === "paid_loan") { pay(); }`))).toEqual([
      "rawArrangementType",
    ]);
  });

  it("flags !== as well as ===", () => {
    // A negated raw check is the same bug: it misses one of the two values.
    expect(ids(lint(`if (t !== "paid_loan") { skip(); }`))).toEqual(["rawArrangementType"]);
  });

  it("flags the literal on either side", () => {
    expect(ids(lint(`if ("free_loan" === t) { pay(); }`))).toEqual(["rawArrangementType"]);
  });

  it("names the offending value in the message, so the fix is obvious", () => {
    const [message] = lint(`if (t === "free_loan") {}`);
    expect(message.message).toContain("free_loan");
    expect(message.message).toContain("@/lib/arrangement-type");
  });

  it("leaves the other arrangement values alone", () => {
    // Only free_loan and paid_loan are overloaded. revenue_share, purchase and
    // mixed mean exactly one thing, so comparing them is not the bug pattern
    // and flagging them would make the rule noise.
    for (const value of ["revenue_share", "purchase", "mixed"]) {
      expect(ids(lint(`if (t === "${value}") {}`)), value).toEqual([]);
    }
  });

  it("leaves non-equality uses of the string alone", () => {
    expect(ids(lint(`const label = { free_loan: "Paid loan" }; const x = "paid_loan";`))).toEqual([]);
  });

  it("exempts the canonical predicate and label modules, which must define the values", () => {
    for (const file of ["src/lib/arrangement-type.ts", "src/lib/arrangement-labels.ts"]) {
      expect(ids(lint(`export const x = type === "paid_loan";`, file)), file).toEqual([]);
    }
  });

  it("exempts them whether ESLint hands over a relative or an absolute path", () => {
    // The exemptions used to be `endsWith("/src/lib/...")`, so they only fired
    // on an absolute path. ESLint supplies one here, which is why lint stayed
    // green and the gap went unseen until this rule got a test.
    // The absolute form has to sit under cwd, or flat config declines to match
    // it against `files` at all and the result is a config warning, not a rule
    // report.
    for (const file of [
      "src/lib/arrangement-type.ts",
      `${process.cwd()}/src/lib/arrangement-type.ts`,
    ]) {
      expect(ids(lint(`export const x = type === "paid_loan";`, file)), file).toEqual([]);
    }
  });

  it("exempts the placement request form, whose union makes free_loan the paid option", () => {
    expect(
      ids(lint(`if (t === "free_loan") {}`, "src/components/SpacesPlacementRequestForm.tsx")),
    ).toEqual([]);
  });

  it("does not exempt a file that merely mentions arrangement-type in its path", () => {
    // The exemptions are endsWith matches on specific files, not a directory
    // sweep. A new module under lib/ is still linted.
    expect(ids(lint(`if (t === "paid_loan") {}`, "src/lib/arrangement-type-helpers.ts"))).toEqual([
      "rawArrangementType",
    ]);
  });
});
