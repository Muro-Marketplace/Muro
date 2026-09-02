import { createRequire } from "node:module";
import { Linter } from "eslint";
import { describe, it, expect } from "vitest";

const require = createRequire(import.meta.url);
const rule = require("../../eslint-rules/require-authz-on-mutation.js") as import("eslint").Rule.RuleModule;
const { PUBLIC_ROUTES } = require("../../eslint-rules/public-routes.js") as {
  PUBLIC_ROUTES: Record<string, string>;
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
// A @/lib/db/* helper is service-role-equivalent: those modules use the admin
// client internally, so a route importing one writes past RLS without ever
// naming supabase-admin. This is E32's exact shape (01 Phase E item 15).
const DB_HELPER = `import { upsertWork } from "@/lib/db/artist-works";`;
const AUTHZ = `import { assertOwnsWork } from "@/lib/authz";`;
// No type annotations in these fixtures: the Linter runs the default parser, so
// TS syntax would surface as a parse error rather than a rule report.
const POST = `export async function POST() { return new Response(); }`;

describe("wallplace/require-authz-on-mutation", () => {
  // --- must be flagged ---

  it("flags a mutating service-role route with no authorisation import", () => {
    const messages = lint(`${SERVICE_ROLE}\n${POST}`);
    expect(ids(messages)).toEqual(["missingAuthz"]);
    expect(messages[0].message).toContain("BYPASSES RLS");
  });

  it("flags every mutating method the file exports", () => {
    const code = `${SERVICE_ROLE}
export async function POST() { return new Response(); }
export async function PATCH() { return new Response(); }
export async function DELETE() { return new Response(); }`;
    const messages = lint(code);
    expect(messages).toHaveLength(3);
    expect(messages.filter((m) => m.messageId === "missingAuthz")).toHaveLength(3);
  });

  it("flags `export const POST = ...` too, not just function declarations", () => {
    // src/app/api/stripe-connect/process-pending/route.ts uses this form, so an
    // AST match on FunctionDeclaration alone would leave a real hole.
    const messages = lint(`${SERVICE_ROLE}\nexport const POST = async () => new Response();`);
    expect(ids(messages)).toEqual(["missingAuthz"]);
  });

  // --- must NOT be flagged ---

  it("treats a @/lib/db/* import as service-role-equivalent, which is E32's shape", () => {
    // E32 was invisible to this rule: api/artist-works never imported
    // supabase-admin, it called lib/db/artist-works.ts, so the unscoped update
    // went unflagged. A route of that shape must now be caught.
    const messages = lint(`${DB_HELPER}\n${POST}`);
    expect(ids(messages)).toEqual(["missingAuthz"]);
  });

  it("still ignores a @/lib/db/* route that only reads", () => {
    const messages = lint(`${DB_HELPER}\nexport async function GET() { return new Response(); }`);
    expect(messages).toEqual([]);
  });

  it("accepts a @/lib/db/* route that does import authz", () => {
    const messages = lint(`${DB_HELPER}\n${AUTHZ}\n${POST}`);
    expect(messages).toEqual([]);
  });

  it("does not treat a non-db lib import as service-role-equivalent", () => {
    // The match is scoped to @/lib/db/, not any @/lib/ path, or every route in
    // the app would be flagged and the rule would be noise.
    const messages = lint(`import { slugify } from "@/lib/slugify";\n${POST}`);
    expect(messages).toEqual([]);
  });

  it("accepts an @/lib/authz import", () => {
    expect(lint(`${SERVICE_ROLE}\n${AUTHZ}\n${POST}`)).toHaveLength(0);
  });

  it("accepts an @/lib/admin-auth import, since admin routes gate there", () => {
    const admin = `import { getAdminUser } from "@/lib/admin-auth";`;
    expect(lint(`${SERVICE_ROLE}\n${admin}\n${POST}`)).toHaveLength(0);
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
    const messages = lint(`${SERVICE_ROLE}\n${POST}`, "src/app/api/webhooks/stripe/route.ts");
    expect(ids(messages)).toEqual([]);
  });

  it("exempts a second allowlisted route the same way", () => {
    expect(lint(`${SERVICE_ROLE}\n${POST}`, "src/app/api/newsletter/route.ts")).toHaveLength(0);
  });

  it("still flags a non-exempt route even at a real path", () => {
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
      `${SERVICE_ROLE}\n${POST}`,
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
  });
});
