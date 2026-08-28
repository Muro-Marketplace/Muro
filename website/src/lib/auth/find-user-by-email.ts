// "Which auth user has this email?", answered once and answered correctly.
//
// Three call sites hand-rolled this and all three had the same two bugs, because
// each was written separately:
//
//   const { data } = await db.auth.admin.listUsers();
//   const user = data?.users?.find((u) => u.email === app.email);
//
// 1. NO PAGINATION. `listUsers()` defaults to 50 per page. There are 40 users
//    in production today, so every one of these works right now and stops
//    working at user 51, silently, by returning null for a user that exists.
//    In `admin/applications/[id]` that means approving an application creates a
//    SECOND auth account for someone who already has one.
//
// 2. CASE-SENSITIVE COMPARISON. GoTrue stores addresses lowercased. The values
//    compared against come from forms, so an application submitted as
//    "Maya@Example.com" never matches the existing "maya@example.com" user, on
//    any page. Same duplicate-account outcome, available today.
//
// One function, one behaviour, tested once.

import type { SupabaseClient, User } from "@supabase/supabase-js";

const PER_PAGE = 200;

/**
 * Hard stop on how far we will page. 50 x 200 is 10,000 users; past that this
 * approach is wrong anyway and should be a SECURITY DEFINER lookup against
 * auth.users. The cap exists so a bad response shape cannot spin forever.
 */
const MAX_PAGES = 50;

export async function findUserByEmail(
  db: SupabaseClient,
  email: string | null | undefined,
): Promise<User | null> {
  const needle = (email ?? "").trim().toLowerCase();
  if (!needle) return null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error("[find-user-by-email] listUsers failed:", error.message);
      return null;
    }
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").trim().toLowerCase() === needle);
    if (match) return match;
    // A short page is the last page. Checking the length rather than trusting a
    // `nextPage` field keeps this working across supabase-js versions.
    if (users.length < PER_PAGE) return null;
  }

  console.error(`[find-user-by-email] gave up after ${MAX_PAGES} pages; use a SQL lookup instead`);
  return null;
}

/** Convenience for the common case, where only the id is wanted. */
export async function findUserIdByEmail(
  db: SupabaseClient,
  email: string | null | undefined,
): Promise<string | null> {
  return (await findUserByEmail(db, email))?.id ?? null;
}

/**
 * The batch form: one pass over the user list for many addresses.
 *
 * Calling `findUserIdByEmail` in a loop is correct but pages once per address.
 * This pages once total and returns a lowercase-keyed map, which is what a
 * "match these enquiry senders to accounts" query actually wants.
 */
export async function findUserIdsByEmails(
  db: SupabaseClient,
  emails: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const wanted = new Set(
    emails.map((e) => (e ?? "").trim().toLowerCase()).filter(Boolean),
  );
  const found = new Map<string, string>();
  if (wanted.size === 0) return found;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error("[find-user-by-email] listUsers failed:", error.message);
      return found;
    }
    const users = data?.users ?? [];
    for (const u of users) {
      const key = (u.email ?? "").trim().toLowerCase();
      if (key && wanted.has(key) && !found.has(key)) found.set(key, u.id);
    }
    // Everything asked for has been located, or this was the last page.
    if (found.size === wanted.size || users.length < PER_PAGE) return found;
  }
  return found;
}

/**
 * EVERY account on one address.
 *
 * GoTrue allows more than one user row per address (different providers), and
 * `/api/account/roles` uses that to offer a "switch portal" menu when the same
 * person has both an artist and a customer account. That needs all the matches,
 * so unlike `findUserByEmail` this cannot stop at the first and always reads to
 * the end of the list.
 */
export async function findAllUsersByEmail(
  db: SupabaseClient,
  email: string | null | undefined,
): Promise<User[]> {
  const needle = (email ?? "").trim().toLowerCase();
  if (!needle) return [];

  const matches: User[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error("[find-user-by-email] listUsers failed:", error.message);
      return matches;
    }
    const users = data?.users ?? [];
    for (const u of users) {
      if ((u.email ?? "").trim().toLowerCase() === needle) matches.push(u);
    }
    if (users.length < PER_PAGE) return matches;
  }
  return matches;
}
