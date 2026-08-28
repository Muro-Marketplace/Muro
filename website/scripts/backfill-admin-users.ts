#!/usr/bin/env tsx
/**
 * Mirror the ADMIN_EMAILS allowlist into the admin_users table
 * (03 §1.4 step 2, after migration 101 created it).
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... ADMIN_EMAILS=... npm run admin:backfill
 *   npm run admin:backfill -- --dry-run     # print the plan, write nothing
 *
 * WHY THIS EXISTS, and why it must run before the predicate changes.
 *
 * The live admin rule is a conjunction:
 *
 *   user_metadata.user_type = 'admin'  AND  (email IN ADMIN_EMAILS OR user_id IN admin_users)
 *
 * The `user_metadata` conjunct is the problem 03 §1.2 sets out: the field is
 * writable by the user it belongs to, so it raises no attacker cost, while
 * anything that overwrites an admin's metadata silently revokes their access
 * (api/admin/applications/[id] does exactly that, replacing metadata wholesale).
 * Removing it is the fix.
 *
 * But the second operand of the OR was, until migration 101, a table that did
 * not exist. Verified against prod on 2026-08-28: `to_regclass('public.admin_users')`
 * returned NULL, so every admin in production is held up by ADMIN_EMAILS alone.
 * Change the predicate before this table mirrors that list and you lock out
 * anyone the list would no longer reach.
 *
 * So the order is: create (101), backfill (this), then the predicate cutover.
 * Each step leaves every current admin authorised, and this one only ever
 * widens, never narrows.
 *
 * WHY IT IS NOT A MIGRATION. The rows depend on the deployed ADMIN_EMAILS value
 * and on auth.users ids, neither of which belongs in a checked-in .sql file.
 * Running it in an environment reads that environment's own allowlist, which is
 * the only correct source.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function adminEmails(): string[] {
  const list = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "";
  return list
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// `SupabaseClient` without a generated Database generic, matching
// src/lib/supabase-admin.ts. The default generic narrows an unknown table's
// insert payload to `never`, and admin_users is new (migration 101).
type AdminClient = SupabaseClient;

/** Every auth user, paged, because listUsers caps a page at 1000. */
async function allAuthUsers(admin: AdminClient): Promise<{ id: string; email: string }[]> {
  const out: { id: string; email: string }[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers page ${page} failed: ${error.message}`);
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.email) out.push({ id: u.id, email: u.email.toLowerCase() });
    }
    if (users.length < 1000) break;
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Both are required: this writes to a table that is service-role only.",
    );
    process.exit(2);
  }

  const emails = adminEmails();
  if (emails.length === 0) {
    console.error(
      "ADMIN_EMAILS (or ADMIN_EMAIL) is empty.\n" +
        "Refusing to run: an empty allowlist would back-fill nothing and read as success,\n" +
        "which is exactly the state that makes the later predicate cutover lock everyone out.",
    );
    process.exit(2);
  }

  const admin: AdminClient = createClient(url, serviceKey, { auth: { persistSession: false } });

  console.log(`ADMIN_EMAILS lists ${emails.length} address(es): ${emails.join(", ")}`);

  const users = await allAuthUsers(admin);
  const byEmail = new Map(users.map((u) => [u.email, u.id]));

  const resolved: { email: string; id: string }[] = [];
  const unresolved: string[] = [];
  for (const email of emails) {
    const id = byEmail.get(email);
    if (id) resolved.push({ email, id });
    else unresolved.push(email);
  }

  for (const email of unresolved) {
    console.warn(`  NO AUTH USER for ${email} — they have never signed up, so no row can be made.`);
  }

  if (dryRun) {
    console.log(`\nDry run. Would upsert ${resolved.length} row(s):`);
    for (const r of resolved) console.log(`  ${r.email} -> ${r.id}`);
    return;
  }

  for (const r of resolved) {
    const { error } = await admin
      .from("admin_users")
      .upsert(
        { user_id: r.id, note: `backfilled from ADMIN_EMAILS (${r.email})` },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(`upsert failed for ${r.email}: ${error.message}`);
    console.log(`  upserted ${r.email} -> ${r.id}`);
  }

  // Assert the table is now a complete mirror, per 03 §1.4 step 2. A partial
  // mirror is the dangerous state: it looks done and still narrows the admin
  // set at cutover.
  const { count, error: countErr } = await admin
    .from("admin_users")
    .select("user_id", { count: "exact", head: true });
  if (countErr) throw new Error(`count failed: ${countErr.message}`);

  console.log(`\nadmin_users now holds ${count ?? 0} row(s).`);
  if (unresolved.length > 0) {
    console.error(
      `\nINCOMPLETE: ${unresolved.length} allowlisted address(es) have no auth user (${unresolved.join(", ")}).\n` +
        "Do NOT remove the user_metadata conjunct until every intended admin has a row,\n" +
        "or they lose access. Have them sign up, then re-run this.",
    );
    process.exit(1);
  }
  console.log("Complete: every allowlisted address now has an admin_users row.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
