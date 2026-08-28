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

/**
 * Admin route wrapper: resolve the admin, run the handler, write the audit row
 * (E30a, 03 §2.1).
 *
 * There is no shared wrapper today, so every admin route calls `getAdminUser`
 * by hand and then, optionally and from memory, calls `recordAdminAction`.
 * Nothing enforces the pairing, so audit coverage tracked whichever phase of
 * work last touched a file: the platform's admission gate, the curation
 * lifecycle (which includes `paid` and `refunded`) and admin-approved Stripe
 * refunds all mutated state with no trail at all.
 *
 * The handler is given an `audit(context)` it calls to say what it did. It does
 * NOT have to restructure its early returns to thread a context back, which is
 * what made §2.1's proposed signature risky for a 250-line handler with several
 * of them. The rules:
 *
 *   - handler called `audit(...)`  -> that row is written;
 *   - handler returned 2xx without calling it -> a row is still written, with
 *     no context, so a successful mutation is never invisible;
 *   - handler returned non-2xx without calling it -> nothing, because a
 *     rejected request did not change anything.
 *
 * The write happens BEFORE the response is returned, matching the precedent in
 * api/messages. Keep `context` to the decision, the target id and the target's
 * email: the column is JSONB and will otherwise accumulate PII.
 */
export async function withAdmin(
  request: Request,
  action: string,
  handler: (ctx: {
    user: User;
    /**
     * Record what this request did. The second argument refines the action
     * name when one route covers two decisions, e.g. accept vs reject on the
     * applications gate, so the audit log stays queryable by action.
     */
    audit: (context?: Record<string, unknown>, actionOverride?: string) => void;
  }) => Promise<NextResponse>,
): Promise<NextResponse> {
  const { user, error } = await getAdminUser(request);
  if (error) return error;

  let requested = false;
  let context: Record<string, unknown> | undefined;
  let resolvedAction = action;
  const audit = (ctx?: Record<string, unknown>, actionOverride?: string) => {
    requested = true;
    context = ctx;
    if (actionOverride) resolvedAction = actionOverride;
  };

  const response = await handler({ user: user!, audit });

  if (requested || response.ok) {
    const { recordAdminAction } = await import("@/lib/admin-audit");
    await recordAdminAction({ adminUserId: user!.id, action: resolvedAction, context });
  }

  return response;
}
