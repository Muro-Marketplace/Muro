import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";

/**
 * Server-decided answer to "is the caller an admin?" (E30b, 03 §2.2).
 *
 * The /admin route group had no server-side guard: `admin/layout.tsx` returned
 * its children unwrapped, and the only check was a render-time comparison
 * inside a client component against `user_metadata.user_type`, which the user
 * signs themselves. Anyone could sign up with `user_type: "admin"` and render
 * the entire admin shell.
 *
 * `AdminGate` calls this so the decision comes from the real predicate on the
 * server instead. Be clear about what that buys: the *decision* moves, the
 * *enforcement* is still client-executed, and someone with devtools can still
 * paint the UI. The security boundary is, and must remain, the per-route
 * `getAdminUser` check on every route under api/admin. `admin-route-guard.test.ts`
 * holds that invariant.
 *
 * Deliberately returns no admin-only data, only the caller's own email, so it
 * discloses nothing to a non-admin beyond the status code they could infer by
 * calling any other admin route.
 */
export async function GET(request: Request) {
  const { user, error } = await getAdminUser(request);
  if (error) return error;
  return NextResponse.json({ ok: true, email: user!.email ?? null });
}
