import { createRequire } from "node:module";
import { Linter } from "eslint";
import { describe, it, expect } from "vitest";

// 05 E43 / supervisor D67. The rule that drives the false-success migration:
// authFetch resolves on a non-2xx response (it does not throw), so a mutation
// written with it runs its success path on a 403/500. mutate() throws instead.

const require = createRequire(import.meta.url);
const rule = require("../../eslint-rules/no-authfetch-mutation.js") as import("eslint").Rule.RuleModule;

const config = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { ecmaVersion: "latest" as const, sourceType: "module" as const },
    plugins: { wallplace: { rules: { "no-authfetch-mutation": rule } } },
    rules: { "wallplace/no-authfetch-mutation": "error" as const },
  },
];

function lint(code: string, filename = "src/components/Thing.tsx") {
  const messages = new Linter().verify(code, config, filename);
  // A parse error arrives with ruleId null, which would satisfy toHaveLength(1)
  // without the rule ever firing. Refuse a broken fixture.
  const fatal = messages.filter((m) => m.ruleId === null);
  if (fatal.length > 0) {
    throw new Error(`fixture does not parse: ${fatal.map((m) => m.message).join("; ")}`);
  }
  return messages;
}

describe("wallplace/no-authfetch-mutation", () => {
  // ── invalid: mutating authFetch calls ─────────────────────────────────────

  it("flags a PATCH", () => {
    const messages = lint(`await authFetch("/api/x", { method: "PATCH", body: b });`);
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("wallplace/no-authfetch-mutation");
    expect(messages[0].messageId).toBe("authFetchMutation");
    expect(messages[0].message).toContain("PATCH");
  });

  it("flags POST, PUT and DELETE", () => {
    expect(lint(`authFetch("/api/x", { method: "POST" });`)).toHaveLength(1);
    expect(lint(`authFetch("/api/x", { method: "PUT" });`)).toHaveLength(1);
    expect(lint(`authFetch("/api/x", { method: "DELETE" });`)).toHaveLength(1);
  });

  it("is case-insensitive on the method", () => {
    // Every call in the codebase uppercases the verb, but a lowercase one is the
    // same mutation and must not sneak past.
    expect(lint(`authFetch("/api/x", { method: "delete" });`)).toHaveLength(1);
  });

  it("flags a method set alongside a spread options object", () => {
    const messages = lint(`authFetch("/api/x", { ...opts, method: "POST" });`);
    expect(messages).toHaveLength(1);
  });

  it("reports once per offending call, not once per file", () => {
    const messages = lint(`
      authFetch("/api/a", { method: "POST" });
      authFetch("/api/b", { method: "DELETE" });
    `);
    expect(messages).toHaveLength(2);
  });

  // ── valid: reads and the correct primitive ────────────────────────────────

  it("does not flag a GET (no options)", () => {
    expect(lint(`const res = await authFetch("/api/x");`)).toHaveLength(0);
  });

  it("does not flag an explicit GET or an options object with no method", () => {
    expect(lint(`authFetch("/api/x", { method: "GET" });`)).toHaveLength(0);
    expect(lint(`authFetch("/api/x", { headers: { a: "b" } });`)).toHaveLength(0);
  });

  it("does not flag mutate(), which is the fix", () => {
    expect(lint(`await mutate("/api/x", { method: "PATCH", body: b });`)).toHaveLength(0);
  });

  it("does not flag when the verb is not a string literal (documented limitation)", () => {
    // The AST cannot see the verb through a variable; the ratchet count is the
    // backstop against a new dynamic-method mutation.
    expect(lint(`authFetch("/api/x", { method: verb });`)).toHaveLength(0);
    expect(lint(`authFetch("/api/x", opts);`)).toHaveLength(0);
  });

  it("does not flag in a test file", () => {
    expect(lint(`authFetch("/api/x", { method: "POST" });`, "src/components/Thing.test.tsx")).toHaveLength(0);
  });
});
