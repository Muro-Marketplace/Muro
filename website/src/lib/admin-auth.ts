import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { User } from "@supabase/supabase-js";

// Admin emails are sourced only from env. Accepts either ADMIN_EMAILS
// (comma-separated) or ADMIN_EMAIL (single). No hardcoded default, so a
// misconfigured production deploy fails closed instead of granting the
// author's personal account admin rights.
function adminEmails(): string[] {
  const list = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "";
  return list.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/**
 * Resolve the Bearer token from a request to a Supabase user.
 * Returns null for missing, empty, or invalid tokens; never throws.
 */
async function resolveUser(request: Request): Promise<User | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "").trim();
  if (!token) return null;

  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

/**
 * The canonical admin predicate (ADR 0001).
 *
 * A user is an admin iff:
 *   user_metadata.user_type === "admin"
 *   AND (email in ADMIN_EMAILS env list OR user_id in admin_users table)
 *
 * The metadata check comes first so we never reach the DB for non-admin roles.
 * The email allowlist short-circuits so allowlisted admins never hit the DB.
 *
 * The `user_metadata` conjunct is a known weakness, documented in 03 §1.2: the
 * field is writable by the user it belongs to (anon-key signUp, and GoTrue's
 * PUT /auth/v1/user), so it raises no attacker cost, while anything that
 * overwrites an admin's metadata silently revokes their access. Removing it is
 * an owner-gated cutover and deliberately NOT done here. Migration 101 and the
 * backfill script are its prerequisites, per 03 §1.4: create and backfill
 * `admin_users` first, or the cutover locks every admin out.
 */
async function userIsAdmin(user: User): Promise<boolean> {
  const role = (user.user_metadata as { user_type?: unknown } | null)?.user_type;
  if (role !== "admin") return false;

  const email = user.email?.toLowerCase();
  if (email && adminEmails().includes(email)) return true;

  return adminUsersHasRow(user.id);
}

/**
 * True iff `admin_users` carries a row for this user.
 *
 * Migration 101 created the table. Before it, the table did not exist in any
 * environment (verified against prod 2026-08-28: `to_regclass` returned NULL),
 * the select below errored, `data` came back null, and this branch silently
 * returned false for everyone. So the deployed rule was never ADR 0001's
 * three-source conjunction, it was `metadata AND email IN ADMIN_EMAILS`. The
 * select also asked for `id`, a column the table does not have.
 *
 * A failure is logged rather than swallowed, so the next time this branch stops
 * working it says so instead of quietly denying every table-only admin.
 */
async function adminUsersHasRow(userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .limit(1);
  if (error) {
    console.error("[admin-auth] admin_users lookup failed:", error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Returns true iff the request carries a valid token for a user who satisfies
 * the admin predicate (ADR 0001). Never throws; auth failures return false.
 *
 * Use this for lightweight, non-response-producing admin checks (e.g. inside
 * middleware or route handlers that want to branch on admin status without
 * committing to a specific error response).
 */
export async function isAdminRequest(request: Request): Promise<boolean> {
  const user = await resolveUser(request);
  if (!user) return false;
  return userIsAdmin(user);
}

/**
 * Validate the request is from the admin user.
 * Returns the user or a 401/403/503 error response.
 *
 * Preserves the 503 guard for when ADMIN_EMAILS is unset, which is
 * intentionally not part of the shared predicate: the env list being empty
 * is a deployment misconfiguration, not an authorisation failure.
 */
export async function getAdminUser(request: Request) {
  const user = await resolveUser(request);

  if (!user) {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "").trim();
    return {
      user: null,
      error: NextResponse.json(
        { error: token ? "Invalid or expired token" : "Authentication required" },
        { status: 401 },
      ),
    };
  }

  const allowed = adminEmails();
  if (allowed.length === 0) {
    console.error("ADMIN_EMAILS/ADMIN_EMAIL is not configured, admin access is disabled");
    return {
      user: null,
      error: NextResponse.json({ error: "Admin access not configured" }, { status: 503 }),
    };
  }

  if (!(await userIsAdmin(user))) {
    return {
      user: null,
      error: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
  }

  return { user, error: null };
}
