import { createRequire } from "node:module";
import { Linter } from "eslint";
import { describe, it, expect } from "vitest";

const require = createRequire(import.meta.url);
const rule = require("../../eslint-rules/no-raw-or-filter.js") as import("eslint").Rule.RuleModule;

function lint(code: string) {
  const linter = new Linter();
  return linter.verify(code, {
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    plugins: { wallplace: { rules: { "no-raw-or-filter": rule } } },
    rules: { "wallplace/no-raw-or-filter": "error" },
  });
}

describe("wallplace/no-raw-or-filter", () => {
  it("flags a flat interpolated .or() template literal", () => {
    const messages = lint(
      "db.from('x').select('*').or(`a.eq.${b},c.eq.${d}`)",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("wallplace/no-raw-or-filter");
  });

  it("allows orFilter() wrapped call", () => {
    const messages = lint(
      "db.from('x').or(orFilter([`a.eq.${b}`, `c.eq.${d}`]))",
    );
    expect(messages).toHaveLength(0);
  });

  it("allows a static string argument", () => {
    const messages = lint("db.from('x').or('a.eq.1,b.eq.2')");
    expect(messages).toHaveLength(0);
  });

  it("allows a group expression with and()", () => {
    const messages = lint(
      "db.from('x').or(`and(a.eq.${b},c.eq.${d}),and(c.eq.${b},a.eq.${d})`)",
    );
    expect(messages).toHaveLength(0);
  });

  it("allows zod-style .or(z.literal(''))", () => {
    const messages = lint("schema.or(z.literal(''))");
    expect(messages).toHaveLength(0);
  });
});
