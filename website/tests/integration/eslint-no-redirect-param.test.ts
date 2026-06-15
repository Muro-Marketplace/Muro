import { createRequire } from "node:module";
import { Linter } from "eslint";
import { describe, it, expect } from "vitest";

const require = createRequire(import.meta.url);
const rule = require("../../eslint-rules/no-redirect-param.js") as import("eslint").Rule.RuleModule;

const config = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { ecmaVersion: "latest" as const, sourceType: "module" as const },
    plugins: { wallplace: { rules: { "no-redirect-param": rule } } },
    rules: { "wallplace/no-redirect-param": "error" as const },
  },
];

function lint(code: string, filename = "src/app/api/some/route.ts") {
  const linter = new Linter();
  return linter.verify(code, config, filename);
}

const SIGNUP_FILE = "src/app/(pages)/signup/customer/page.tsx";
const NON_SIGNUP_FILE = "src/components/SomeWidget.tsx";

describe("wallplace/no-redirect-param", () => {
  // --- invalid: must be flagged ---

  it("flags a string literal containing ?redirect=", () => {
    const messages = lint(`const url = "/login?redirect=/x";`);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].ruleId).toBe("wallplace/no-redirect-param");
    expect(messages[0].messageId).toBe("redirectParam");
  });

  it("flags a template literal quasi containing ?redirect=", () => {
    const messages = lint("const url = `/login?redirect=${dest}`;");
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].ruleId).toBe("wallplace/no-redirect-param");
    expect(messages[0].messageId).toBe("redirectParam");
  });

  it("flags a { next: '/browse' } property in a signup file", () => {
    const messages = lint(`const opts = { next: "/browse" };`, SIGNUP_FILE);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].ruleId).toBe("wallplace/no-redirect-param");
    expect(messages[0].messageId).toBe("hardcodedNext");
  });

  // --- valid: must NOT be flagged ---

  it("allows ?next= in a string literal", () => {
    const messages = lint(`const url = "/login?next=/x";`);
    expect(messages).toHaveLength(0);
  });

  it("allows the bare word 'redirect' as a .get() argument (no ?...=)", () => {
    // params.get("redirect") reads a param name, it is not a generated URL.
    const messages = lint(`const v = params.get("redirect");`);
    expect(messages).toHaveLength(0);
  });

  it("allows a { next: someVar } non-literal value in a signup file", () => {
    const messages = lint(`const opts = { next: postSignupNext };`, SIGNUP_FILE);
    expect(messages).toHaveLength(0);
  });

  it("allows a { next: '/browse' } property in a NON-signup file", () => {
    // check (b) is scoped to signup pages only.
    const messages = lint(`const opts = { next: "/browse" };`, NON_SIGNUP_FILE);
    expect(messages).toHaveLength(0);
  });

  it("allows safeRedirect(x, '/browse') call expression as next value in signup", () => {
    const messages = lint(`const opts = { next: safeRedirect(x, "/browse") };`, SIGNUP_FILE);
    expect(messages).toHaveLength(0);
  });

  it("allows ?redirect= appearing only in a comment (not a Literal node)", () => {
    // Comments are not visited by Literal/TemplateLiteral visitors.
    const messages = lint(`// back-compat: reads ?redirect= at login only`);
    expect(messages).toHaveLength(0);
  });

  it("does not flag in a test file (exempt)", () => {
    const messages = lint(
      `const url = "/login?redirect=/x";`,
      "src/app/(pages)/login/page.test.ts",
    );
    expect(messages).toHaveLength(0);
  });
});
