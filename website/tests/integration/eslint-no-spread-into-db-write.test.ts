import { createRequire } from "node:module";
import { Linter } from "eslint";
import { describe, it, expect } from "vitest";

// 06-validation-massassign.md C3. The rule that stops E44 / E45 coming back:
// `.update({ ...body })` with the service-role client handed the client every
// column, including review_status, subscription_plan, stripe_connect_account_id
// and user_id.

const require = createRequire(import.meta.url);
const rule = require("../../eslint-rules/no-spread-into-db-write.js") as import("eslint").Rule.RuleModule;

const config = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { ecmaVersion: "latest" as const, sourceType: "module" as const },
    plugins: { wallplace: { rules: { "no-spread-into-db-write": rule } } },
    rules: { "wallplace/no-spread-into-db-write": "error" as const },
  },
];

function lint(code: string, filename = "src/app/api/some/route.ts") {
  const messages = new Linter().verify(code, config, filename);
  // A parse error arrives as a message with ruleId null, so a broken fixture
  // would satisfy toHaveLength(1) without the rule ever firing. Refuse it.
  const fatal = messages.filter((m) => m.ruleId === null);
  if (fatal.length > 0) {
    throw new Error(`fixture does not parse: ${fatal.map((m) => m.message).join("; ")}`);
  }
  return messages;
}

describe("wallplace/no-spread-into-db-write", () => {
  // ── invalid: the shapes that shipped ──────────────────────────────────────

  it("flags a spread of body inside .update()", () => {
    const messages = lint(`await db.from("artist_profiles").update({ ...body }).eq("user_id", u);`);
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("wallplace/no-spread-into-db-write");
    expect(messages[0].messageId).toBe("spreadIntoWrite");
    expect(messages[0].message).toContain("body");
    expect(messages[0].message).toContain("update");
  });

  it("flags .insert({ ...payload })", () => {
    const messages = lint(`await db.from("t").insert({ ...payload, user_id: u });`);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain("payload");
  });

  it("flags .upsert({ ...data })", () => {
    const messages = lint(`await db.from("t").upsert({ ...data });`);
    expect(messages).toHaveLength(1);
  });

  it("flags the assemble-then-write shape, which is the one that actually shipped", () => {
    // artist-profiles.ts builds insertPayload on one line and writes it on the
    // next. A rule that only looks inside the call arguments misses this.
    const messages = lint(`
      const insertPayload = { ...body, user_id: userId };
      await db.from("artist_profiles").insert(insertPayload);
    `);
    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe("spreadIntoWrite");
  });

  it("flags a spread nested deeper inside the written object", () => {
    const messages = lint(`await db.from("t").update({ meta: { ...data } });`);
    expect(messages).toHaveLength(1);
  });

  it("reports once per offending spread, not once per write in the file", () => {
    const messages = lint(`
      await db.from("a").update({ ...body });
      await db.from("b").insert({ ...payload });
    `);
    expect(messages).toHaveLength(2);
  });

  // ── valid: must not be flagged ────────────────────────────────────────────

  it("allows a payload built by pickWritable", () => {
    const messages = lint(`
      const payload = pickWritable(body, ARTIST_PROFILE_WRITABLE);
      await db.from("artist_profiles").update(payload).eq("user_id", u);
    `);
    expect(messages).toHaveLength(0);
  });

  it("allows a spread that is itself inside pickWritable()", () => {
    const messages = lint(`await db.from("t").update(pickWritable({ ...body }, ALLOW));`);
    expect(messages).toHaveLength(0);
  });

  it("allows a spread of a differently-named object", () => {
    // venue-profiles.ts strips unknown columns into `safeData` and writes that.
    const messages = lint(`await db.from("t").update({ ...safeData, user_id: u });`);
    expect(messages).toHaveLength(0);
  });

  it("allows a spread that never reaches a write", () => {
    // lib/authz.ts returns `{ ...data, role }` from a SELECT. Reads are fine.
    const messages = lint(`function toArtist(data, role) { return { ...data, role }; }`);
    expect(messages).toHaveLength(0);
  });

  it("allows a spread into a variable that is never written", () => {
    const messages = lint(`function merge(data, role) { const merged = { ...data, role }; return merged; }`);
    expect(messages).toHaveLength(0);
  });

  it("allows spreading an iterable into a call, which is not an object write", () => {
    const messages = lint(`const max = Math.max(...data.map((d) => d.v), 1);`);
    expect(messages).toHaveLength(0);
  });

  it("does not flag in a test file", () => {
    const messages = lint(
      `await db.from("t").update({ ...body });`,
      "src/app/api/some/route.test.ts",
    );
    expect(messages).toHaveLength(0);
  });

  // ── the earned exemption ──────────────────────────────────────────────────

  it("allows the spread when the enclosing function calls assertNoServerOwned", () => {
    // upsertArtistProfile / upsertVenueProfile: the boundary guard refuses every
    // server-owned column before the spread happens, which is what makes it safe.
    const messages = lint(`
      export async function upsertArtistProfile(userId, data, opts = {}) {
        assertNoServerOwned(data, ARTIST_PROFILE_SERVER_OWNED, "artist_profiles", opts.allowServerOwned);
        await db.from("artist_profiles").update({ ...data, updated_at: now() }).eq("user_id", userId);
      }
    `);
    expect(messages).toHaveLength(0);
  });

  it("flags it again the moment the guard is deleted", () => {
    // The property that keeps the exemption honest: it is earned by the guard
    // being present, not by the file's name.
    const messages = lint(`
      export async function upsertArtistProfile(userId, data, opts = {}) {
        await db.from("artist_profiles").update({ ...data, updated_at: now() }).eq("user_id", userId);
      }
    `);
    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe("spreadIntoWrite");
  });

  it("does not let a guard in one function exempt a spread in another", () => {
    const messages = lint(`
      function guarded(data) {
        assertNoServerOwned(data, LIST, "t");
        return data;
      }
      async function unguarded(body) {
        await db.from("t").update({ ...body });
      }
    `);
    expect(messages).toHaveLength(1);
  });

  it("does not accept a comment mentioning the guard in place of calling it", () => {
    // The trap this rule was written to avoid: a text scan would pass here.
    const messages = lint(`
      async function pretend(body) {
        // assertNoServerOwned(body, LIST, "t") is called by the caller, honest
        await db.from("t").update({ ...body });
      }
    `);
    expect(messages).toHaveLength(1);
  });
});
