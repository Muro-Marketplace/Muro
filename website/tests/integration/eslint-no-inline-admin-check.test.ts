import { createRequire } from "node:module";
import { Linter } from "eslint";
import { describe, it, expect } from "vitest";

const require = createRequire(import.meta.url);
const rule = require("../../eslint-rules/no-inline-admin-check.js") as import("eslint").Rule.RuleModule;

const config = [
  {
    files: ["**/*.ts"],
    languageOptions: { ecmaVersion: "latest" as const, sourceType: "module" as const },
    plugins: { wallplace: { rules: { "no-inline-admin-check": rule } } },
    rules: { "wallplace/no-inline-admin-check": "error" as const },
  },
];

function lint(code: string, filename = "src/app/api/some/route.ts") {
  const linter = new Linter();
  return linter.verify(code, config, filename);
}

describe("wallplace/no-inline-admin-check", () => {
  it("flags a read of process.env.ADMIN_EMAILS", () => {
    const messages = lint("const x = process.env.ADMIN_EMAILS;");
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("wallplace/no-inline-admin-check");
  });

  it("flags a .from('admin_users') call", () => {
    const messages = lint('db.from("admin_users").select("id")');
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("wallplace/no-inline-admin-check");
  });

  it("allows isAdminRequest usage", () => {
    const messages = lint("if (isAdminRequest(request)) {}");
    expect(messages).toHaveLength(0);
  });

  it("allows a write to process.env.ADMIN_EMAILS (test setup)", () => {
    const messages = lint('process.env.ADMIN_EMAILS = "a@b.com"');
    expect(messages).toHaveLength(0);
  });

  it("allows other env var reads", () => {
    const messages = lint("const x = process.env.OTHER_VAR");
    expect(messages).toHaveLength(0);
  });

  it("allows .from() with other table names", () => {
    const messages = lint('db.from("orders").select("*")');
    expect(messages).toHaveLength(0);
  });

  it("does not flag anything inside admin-auth.ts", () => {
    const messages = lint(
      'const x = process.env.ADMIN_EMAILS; db.from("admin_users").select("id")',
      "src/lib/admin-auth.ts",
    );
    expect(messages).toHaveLength(0);
  });
});
