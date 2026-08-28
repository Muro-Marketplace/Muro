// Guards for migration 074 and the code change it is welded to.
//
// The RLS state itself is verified against prod with the D15.3 assertion (5 rows
// before, 0 after) and a role-switched read; that evidence lives in PROGRESS.md.
// What a test CAN hold is the part that rots: the pairing invariant, and the exact
// set of policies dropped.
//
// D15.4's trap: 074 drops both `WITH CHECK (true)` INSERT policies on
// artist_applications, so /api/apply MUST use the service-role client. Revert the
// route to the anon client and every public artist application fails RLS
// silently, with the form still returning success to the applicant.
//
// D15.2's trap in the other direction: four tables carry `USING (true)` SELECT
// policies ON PURPOSE, and they are the public marketplace. A migration that
// drops those takes the whole public site down.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATION = readFileSync(
  path.join(ROOT, "supabase/migrations/074_rls_gap_closure.sql"),
  "utf8",
);
const APPLY_ROUTE = readFileSync(
  path.join(ROOT, "src/app/api/apply/route.ts"),
  "utf8",
);

/** SQL with comments stripped, so a policy named in prose cannot satisfy an assertion. */
const SQL = MIGRATION.split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

describe("074: all five leaking SELECT policies are dropped", () => {
  // 02 §11 dropped four and missed enquiries, whose policy uses USING (true)
  // rather than an auth.role() comparison. Four out of five closed reads as
  // green on D12's assertion while enquiries stays wide open, which is the
  // precise reason D15.1 exists.
  const FIVE = [
    ["waitlist_signups", "Authenticated can read waitlist"],
    ["contact_submissions", "Authenticated can read contact"],
    ["venue_registrations", "Authenticated can read venue reg"],
    ["artist_applications", "Authenticated users can read applications"],
    ["enquiries", "Artists can read their enquiries"],
  ] as const;

  it.each(FIVE)("drops %s.%s", (table, policy) => {
    const dropped = new RegExp(
      `drop\\s+policy\\s+if\\s+exists\\s+"${policy}"\\s+on\\s+public\\.${table}`,
      "i",
    ).test(SQL.replace(/\s+/g, " "));
    expect(dropped, `074 must drop "${policy}" on ${table}`).toBe(true);
  });

  it("drops BOTH artist_applications INSERT policies, not just one", () => {
    // Prod had two, each WITH CHECK (true). Dropping one leaves the table
    // writable by anon and the lockdown is decorative.
    const flat = SQL.replace(/\s+/g, " ");
    for (const policy of ["Anyone can insert applications", "Allow public inserts"]) {
      const re = new RegExp(
        `drop policy if exists "${policy}" on public\\.artist_applications`,
        "i",
      );
      expect(re.test(flat), `074 must drop the "${policy}" INSERT policy`).toBe(true);
    }
  });
});

describe("074 does not touch the intentionally public marketplace (D15.2)", () => {
  // Never a blanket "drop all permissive SELECT policies".
  const PUBLIC_ON_PURPOSE = [
    "artist_profiles_select",
    "artist_works_select",
    "Anyone can read collections",
    "venue_profiles_select_public",
  ];

  it.each(PUBLIC_ON_PURPOSE)("leaves %s alone", (policy) => {
    const flat = SQL.replace(/\s+/g, " ");
    expect(
      new RegExp(`drop policy if exists "?${policy}"?`, "i").test(flat),
      `074 must NOT drop ${policy}; it is the public site`,
    ).toBe(false);
  });

  it("revokes venue PII by column without dropping the table policy", () => {
    expect(SQL).toMatch(/revoke select on public\.venue_profiles from authenticated/i);
    // The re-grant is by exclusion, so a new column is non-PII by default.
    expect(SQL).toMatch(/grant select \(%s\) on public\.venue_profiles to authenticated/i);
  });
});

describe("/api/apply is welded to the 074 lockdown (D15.4)", () => {
  it("uses the service-role client for the artist_applications insert", () => {
    expect(APPLY_ROUTE).toMatch(/getSupabaseAdmin\(\)/);
    expect(APPLY_ROUTE).toMatch(/applyDb\s*\.from\("artist_applications"\)\.insert/);
  });

  it("does not import the anon client, which RLS now refuses", () => {
    // The failure this prevents is silent: the insert is rejected, the applicant
    // still sees a success page, and the application is simply gone.
    expect(
      /from\s+"@\/lib\/supabase"/.test(APPLY_ROUTE),
      "/api/apply must not use the anon client after 074 dropped the INSERT policies",
    ).toBe(false);
  });

  it("has no remaining bare `supabase.from(` call", () => {
    expect(/\bsupabase\s*\.from\(/.test(APPLY_ROUTE)).toBe(false);
  });
});

describe("074 hygiene", () => {
  it("never uses `when others`, the E29c bug it exists to repair", () => {
    // 012_security_hardening.sql swallowed foreign_key_violation this way and
    // reported success while adding nothing.
    expect(/when\s+others/i.test(SQL)).toBe(false);
  });

  it("guards the placement_record_versions block, which prod does not have", () => {
    // Unguarded, the ALTER fails 42P01 and takes the whole migration with it.
    expect(SQL).toMatch(/information_schema\.tables[\s\S]{0,200}placement_record_versions/);
  });

  it("declares no explicit COMMIT, which would end the MCP's transaction early", () => {
    expect(/^\s*commit\s*;/im.test(SQL)).toBe(false);
    expect(/^\s*begin\s*;/im.test(SQL)).toBe(false);
  });
});
