import { createRequire } from "node:module";
import { Linter } from "eslint";
import { describe, it, expect } from "vitest";

const require = createRequire(import.meta.url);
const rule = require("../../eslint-rules/require-authz-on-mutation.js") as import("eslint").Rule.RuleModule;
const { PUBLIC_ROUTES, DEMO_EXEMPT_ROUTES } = require("../../eslint-rules/public-routes.js") as {
  PUBLIC_ROUTES: Record<string, string>;
  DEMO_EXEMPT_ROUTES: Record<string, string>;
};

const config = [
  {
    files: ["**/*.ts"],
    languageOptions: { ecmaVersion: "latest" as const, sourceType: "module" as const },
    plugins: { wallplace: { rules: { "require-authz-on-mutation": rule } } },
    rules: { "wallplace/require-authz-on-mutation": "error" as const },
  },
];

function lint(code: string, filename = "src/app/api/thing/route.ts") {
  return new Linter().verify(code, config, filename);
}

const ids = (messages: Linter.LintMessage[]) => messages.map((m) => m.messageId).sort();

const SERVICE_ROLE = `import { getSupabaseAdmin } from "@/lib/supabase-admin";`;
const AUTHZ = `import { assertOwnsWork } from "@/lib/authz";`;
const DEMO = `import { assertNotDemo } from "@/lib/demo-guard";`;
// No type annotations in these fixtures: the Linter runs the default parser, so
// TS syntax would surface as a parse error rather than a rule report.
const POST = `export async function POST() { return new Response(); }`;

describe("wallplace/require-authz-on-mutation", () => {
  // --- must be flagged ---

  it("flags a mutating service-role route with no authorisation import", () => {
    const messages = lint(`${SERVICE_ROLE}\n${DEMO}\n${POST}`);
    expect(ids(messages)).toEqual(["missingAuthz"]);
    expect(messages[0].message).toContain("BYPASSES RLS");
  });

  it("flags a missing demo guard separately, so the two roll out independently", () => {
    const messages = lint(`${SERVICE_ROLE}\n${AUTHZ}\n${POST}`);
    expect(ids(messages)).toEqual(["missingDemoGuard"]);
  });

  it("reports both when neither import is present", () => {
    const messages = lint(`${SERVICE_ROLE}\n${POST}`);
    expect(ids(messages)).toEqual(["missingAuthz", "missingDemoGuard"]);
  });

  it("flags every mutating method the file exports", () => {
    const code = `${SERVICE_ROLE}
export async function POST() { return new Response(); }
export async function PATCH() { return new Response(); }
export async function DELETE() { return new Response(); }`;
    const messages = lint(code);
    // 3 methods x 2 concerns
    expect(messages).toHaveLength(6);
    expect(messages.filter((m) => m.messageId === "missingAuthz")).toHaveLength(3);
  });

  it("flags `export const POST = ...` too, not just function declarations", () => {
    // src/app/api/stripe-connect/process-pending/route.ts uses this form, so an
    // AST match on FunctionDeclaration alone would leave a real hole.
    const messages = lint(`${SERVICE_ROLE}\nexport const POST = async () => new Response();`);
    expect(ids(messages)).toEqual(["missingAuthz", "missingDemoGuard"]);
  });

  // --- must NOT be flagged ---

  it("accepts an @/lib/authz import", () => {
    expect(lint(`${SERVICE_ROLE}\n${AUTHZ}\n${DEMO}\n${POST}`)).toHaveLength(0);
  });

  it("accepts an @/lib/admin-auth import, since admin routes gate there", () => {
    const admin = `import { getAdminUser } from "@/lib/admin-auth";`;
    expect(lint(`${SERVICE_ROLE}\n${admin}\n${DEMO}\n${POST}`)).toHaveLength(0);
  });

  it("ignores a route that never touches the service-role client", () => {
    expect(lint(`${POST}`)).toHaveLength(0);
  });

  it("ignores a read-only route", () => {
    const get = `export async function GET() { return new Response(); }`;
    expect(lint(`${SERVICE_ROLE}\n${get}`)).toHaveLength(0);
  });

  it("ignores files that are not route handlers", () => {
    expect(lint(`${SERVICE_ROLE}\n${POST}`, "src/lib/db/artist-works.ts")).toHaveLength(0);
    expect(lint(`${SERVICE_ROLE}\n${POST}`, "src/app/api/thing/helper.ts")).toHaveLength(0);
  });

  it("exempts an allowlisted public route from the authz requirement", () => {
    const messages = lint(`${SERVICE_ROLE}\n${DEMO}\n${POST}`, "src/app/api/webhooks/stripe/route.ts");
    expect(ids(messages)).toEqual([]);
  });

  it("exempts an allowlisted route from the demo requirement as well", () => {
    // PUBLIC_ROUTES is spread into DEMO_EXEMPT_ROUTES: an unauthenticated route
    // has no user id to test.
    expect(lint(`${SERVICE_ROLE}\n${POST}`, "src/app/api/newsletter/route.ts")).toHaveLength(0);
  });

  it("exempts a demo-only route from the demo guard but still wants authz", () => {
    const messages = lint(`${SERVICE_ROLE}\n${POST}`, "src/app/api/account/delete/route.ts");
    expect(ids(messages)).toEqual(["missingAuthz"]);
  });

  it("slices a prefixed path down to the repo-relative allowlist key", () => {
    // relPath() cuts everything before "src/app/api/", which is how an absolute
    // filename from a real lint run matches an allowlist key. A fully absolute
    // path cannot be asserted through Linter directly: ESLint answers
    // "No matching configuration found" for files outside the cwd, before the
    // rule ever runs. A nested relative path exercises the same slice.
    const messages = lint(
      `${SERVICE_ROLE}\n${DEMO}\n${POST}`,
      "website/src/app/api/webhooks/stripe/route.ts",
    );
    expect(ids(messages)).toEqual([]);
  });
});

describe("the allowlist itself", () => {
  it("gives every entry a non-empty reason", () => {
    for (const [route, reason] of Object.entries(PUBLIC_ROUTES)) {
      expect(reason.trim().length, `${route} has no reason`).toBeGreaterThan(20);
    }
    for (const [route, reason] of Object.entries(DEMO_EXEMPT_ROUTES)) {
      expect(reason.trim().length, `${route} has no reason`).toBeGreaterThan(20);
    }
  });

  it("treats every public route as demo-exempt", () => {
    for (const route of Object.keys(PUBLIC_ROUTES)) {
      expect(DEMO_EXEMPT_ROUTES, `${route} missing from DEMO_EXEMPT_ROUTES`).toHaveProperty(route);
    }
  });
});
