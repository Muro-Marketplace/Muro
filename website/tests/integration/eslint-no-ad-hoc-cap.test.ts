import { createRequire } from "node:module";
import { Linter } from "eslint";
import { describe, it, expect } from "vitest";

const require = createRequire(import.meta.url);
const rule = require("../../eslint-rules/no-ad-hoc-cap.js") as import("eslint").Rule.RuleModule;

const config = [
  {
    files: ["**/*.ts"],
    languageOptions: { ecmaVersion: "latest" as const, sourceType: "module" as const },
    plugins: { wallplace: { rules: { "no-ad-hoc-cap": rule } } },
    rules: { "wallplace/no-ad-hoc-cap": "error" as const },
  },
];

function lint(code: string, filename = "src/app/api/some/route.ts") {
  const linter = new Linter();
  return linter.verify(code, config, filename);
}

describe("wallplace/no-ad-hoc-cap", () => {
  // --- invalid: chains that must be flagged ---

  it("flags a placements daily-count chain", () => {
    const messages = lint(
      `db.from("placements").select("id", { count: "exact", head: true }).gte("created_at", since)`,
    );
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].ruleId).toBe("wallplace/no-ad-hoc-cap");
  });

  it("flags a messages daily-count chain", () => {
    const messages = lint(
      `db.from("messages").select("id", { count: "exact", head: true }).gte("created_at", since)`,
    );
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].ruleId).toBe("wallplace/no-ad-hoc-cap");
  });

  it("flags when gte comes before select in the chain", () => {
    // Supabase allows any order of filter methods; both orderings must be caught.
    const messages = lint(
      `db.from("placements").gte("created_at", since).select("id", { count: "exact", head: true })`,
    );
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].ruleId).toBe("wallplace/no-ad-hoc-cap");
  });

  it("flags a chain with additional eq filters between from and gte", () => {
    const messages = lint(
      `db.from("placements").select("id", { count: "exact", head: true }).eq("requester_user_id", uid).gte("created_at", since)`,
    );
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].ruleId).toBe("wallplace/no-ad-hoc-cap");
  });

  // --- valid: chains and calls that must NOT be flagged ---

  it("allows the same chain inside src/lib/outreach-cap.ts (exempt file)", () => {
    const messages = lint(
      `db.from("placements").select("id", { count: "exact", head: true }).gte("created_at", since)`,
      "src/lib/outreach-cap.ts",
    );
    expect(messages).toHaveLength(0);
  });

  it("allows the same chain inside a test file (exempt)", () => {
    const messages = lint(
      `db.from("placements").select("id", { count: "exact", head: true }).gte("created_at", since)`,
      "src/app/api/some/route.test.ts",
    );
    expect(messages).toHaveLength(0);
  });

  it("allows the same chain inside a cron route (exempt analytics)", () => {
    const messages = lint(
      `db.from("placements").select("id", { count: "exact", head: true }).gte("created_at", weekAgo)`,
      "src/app/api/cron/weekly-artist-digest/route.ts",
    );
    expect(messages).toHaveLength(0);
  });

  it("allows a placements select without a count indicator (ordinary row read)", () => {
    const messages = lint(
      `db.from("placements").select("*").gte("created_at", since)`,
    );
    expect(messages).toHaveLength(0);
  });

  it("allows a count select on placements without a gte(created_at) (all-time count)", () => {
    const messages = lint(
      `supabase.from("placements").select("id", { count: "exact", head: true }).eq("status", "active")`,
    );
    expect(messages).toHaveLength(0);
  });

  it("allows a count+gte chain on a different table (not capped)", () => {
    const messages = lint(
      `db.from("orders").select("id", { count: "exact", head: true }).gte("created_at", since)`,
    );
    expect(messages).toHaveLength(0);
  });

  it("allows a call to checkArtistOutreachCap directly", () => {
    const messages = lint(
      `const result = await checkArtistOutreachCap(db, artistUserId, 1)`,
    );
    expect(messages).toHaveLength(0);
  });

  it("allows a messages select with count but no created_at gte (total unread count)", () => {
    const messages = lint(
      `db.from("messages").select("id", { count: "exact", head: true }).eq("sender_name", slug)`,
    );
    expect(messages).toHaveLength(0);
  });
});
