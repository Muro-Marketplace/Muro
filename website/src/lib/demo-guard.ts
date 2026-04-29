/**
 * Demo-account write protection.
 *
 * The /demo funnel signs visitors into a designated read-only artist
 * or venue account so they can experience the platform end-to-end.
 * Mutation API routes wrap their handler in `assertNotDemo(userId)` to
 * stop those sessions from corrupting the demo state.
 *
 * Activation:
 *   The guard is dormant until DEMO_ARTIST_USER_ID / DEMO_VENUE_USER_ID
 *   env vars are set in production. With no IDs configured, every
 *   `assertNotDemo` call short-circuits to "not a demo user" so this
 *   helper is safe to wire in before the demo accounts exist.
 *
 * Response shape:
 *   When a demo user attempts a mutation we return 200 (so the UI's
 *   optimistic state doesn't roll back jarringly) with an explicit
 *   `{ demo: true, message: "..." }` payload. Client code that wants
 *   to react can check `data.demo` and surface a toast. Routes that
 *   need to fail-fast can use `assertNotDemoStrict` which returns 403.
 *
 * Naming:
 *   `assert*` for clarity at the call site, these are intentionally
 *   short-circuit guards that the caller branches on.
 */

import { NextResponse } from "next/server";

function readDemoUserIds(): string[] {
  const raw = [
    process.env.DEMO_ARTIST_USER_ID,
    process.env.DEMO_VENUE_USER_ID,
  ];
  return raw.filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * Whether this user id is one of the configured demo users. Returns
 * false unconditionally when no demo IDs are configured (i.e. before
 * Phase 2 demo accounts are set up).
 */
export function isDemoUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const ids = readDemoUserIds();
  if (ids.length === 0) return false;
  return ids.includes(userId);
}

/**
 * Soft-block: if the user is demo, respond with 200 + `{ demo: true,
 * message }` so the UI can flash a toast without optimistic state
 * unwinding. Use this from PATCH/POST handlers that update visible
 * UI state (favourites, profile edits, placement accepts).
 */
export function assertNotDemo(
  userId: string | null | undefined,
  opts: { message?: string } = {},
): NextResponse | null {
  if (!isDemoUser(userId)) return null;
  return NextResponse.json(
    {
      demo: true,
      message:
        opts.message ??
        "You're touring a demo account, changes aren't saved. Sign up to make it real.",
    },
    { status: 200 },
  );
}

/**
 * Hard-block: returns 403 with the same payload. Use this on routes
 * where letting a demo session through could leak content somewhere
 * non-demo users see (e.g. publishing to a public venue page,
 * sending real emails to non-demo recipients).
 */
export function assertNotDemoStrict(
  userId: string | null | undefined,
  opts: { message?: string } = {},
): NextResponse | null {
  if (!isDemoUser(userId)) return null;
  return NextResponse.json(
    {
      demo: true,
      message:
        opts.message ??
        "Demo accounts can't perform this action. Sign up for a real account to use it.",
    },
    { status: 403 },
  );
}
