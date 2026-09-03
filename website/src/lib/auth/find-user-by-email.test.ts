// Both bugs this replaces were in three separate copies of four lines.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findUserByEmail,
  findUserIdByEmail,
  findUserIdsByEmails,
  findAllUsersByEmail,
  findUsersByIds,
} from "./find-user-by-email";

const listUsers = vi.fn();
const db = { auth: { admin: { listUsers } } } as never;

/** A page-serving fake over a fixed user list. */
function withUsers(emails: (string | null)[]) {
  const users = emails.map((email, i) => ({ id: `u-${i}`, email }));
  listUsers.mockImplementation(async ({ page, perPage }: { page: number; perPage: number }) => ({
    data: { users: users.slice((page - 1) * perPage, page * perPage) },
    error: null,
  }));
  return users;
}

beforeEach(() => {
  listUsers.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("findUserByEmail", () => {
  it("finds a user on the first page", async () => {
    withUsers(["a@x.com", "b@x.com"]);
    expect((await findUserByEmail(db, "b@x.com"))?.id).toBe("u-1");
  });

  it("finds a user PAST the first page", async () => {
    // THE regression. `listUsers()` with no arguments returns 50 rows. Every
    // previous call site stopped there and reported "no such user" for one that
    // exists, which in admin/applications means creating a second account for
    // someone who already has one.
    const users = withUsers(Array.from({ length: 640 }, (_, i) => `u${i}@x.com`));
    expect(users).toHaveLength(640);

    const found = await findUserByEmail(db, "u601@x.com");

    expect(found?.id).toBe("u-601");
    expect(listUsers.mock.calls.length).toBeGreaterThan(1);
  });

  it("matches case-insensitively", async () => {
    // The second regression, and this one bites at any user count. GoTrue
    // lowercases what it stores; forms do not.
    withUsers(["maya@example.com"]);
    expect((await findUserByEmail(db, "Maya@Example.com"))?.id).toBe("u-0");
  });

  it("matches despite surrounding whitespace on either side", async () => {
    withUsers(["  maya@example.com "]);
    expect((await findUserByEmail(db, " MAYA@example.com"))?.id).toBe("u-0");
  });

  it("returns null for a user who genuinely is not there", async () => {
    withUsers(["a@x.com", "b@x.com"]);
    expect(await findUserByEmail(db, "nobody@x.com")).toBeNull();
  });

  it("stops paging as soon as it finds the match", async () => {
    withUsers(Array.from({ length: 1000 }, (_, i) => `u${i}@x.com`));
    await findUserByEmail(db, "u3@x.com");
    expect(listUsers).toHaveBeenCalledTimes(1);
  });

  it("stops at the first short page rather than paging forever", async () => {
    withUsers(Array.from({ length: 210 }, (_, i) => `u${i}@x.com`));
    await findUserByEmail(db, "nobody@x.com");
    // 200 + 10, so two pages, and the second is short.
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it("returns null without calling out at all for an empty address", async () => {
    expect(await findUserByEmail(db, "")).toBeNull();
    expect(await findUserByEmail(db, null)).toBeNull();
    expect(await findUserByEmail(db, undefined)).toBeNull();
    expect(await findUserByEmail(db, "   ")).toBeNull();
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("survives a user row with no email", async () => {
    withUsers([null, "a@x.com"]);
    expect((await findUserByEmail(db, "a@x.com"))?.id).toBe("u-1");
  });

  it("returns null on an API error rather than throwing", async () => {
    listUsers.mockResolvedValue({ data: null, error: { message: "rate limited" } });
    expect(await findUserByEmail(db, "a@x.com")).toBeNull();
  });

  it("gives up after the page cap instead of looping without end", async () => {
    // A response shape that always returns a full page would otherwise spin.
    listUsers.mockResolvedValue({
      data: { users: Array.from({ length: 200 }, (_, i) => ({ id: `x-${i}`, email: `x${i}@x.com` })) },
      error: null,
    });

    expect(await findUserByEmail(db, "nobody@x.com")).toBeNull();
    expect(listUsers).toHaveBeenCalledTimes(50);
  });
});

describe("findUserIdByEmail", () => {
  it("returns just the id", async () => {
    withUsers(["a@x.com"]);
    expect(await findUserIdByEmail(db, "a@x.com")).toBe("u-0");
  });

  it("returns null when there is no match", async () => {
    withUsers(["a@x.com"]);
    expect(await findUserIdByEmail(db, "b@x.com")).toBeNull();
  });
});

describe("findUserIdsByEmails", () => {
  it("resolves many addresses in ONE pass over the user list", async () => {
    // The loop-over-findUserIdByEmail version is correct and pages once per
    // address. This is the same answer for one scan.
    withUsers(Array.from({ length: 150 }, (_, i) => `u${i}@x.com`));

    const map = await findUserIdsByEmails(db, ["u3@x.com", "u9@x.com", "u140@x.com"]);

    expect(listUsers).toHaveBeenCalledTimes(1);
    expect(map.get("u3@x.com")).toBe("u-3");
    expect(map.get("u140@x.com")).toBe("u-140");
    expect(map.size).toBe(3);
  });

  it("keys the map lowercased regardless of how the address was typed", async () => {
    withUsers(["maya@example.com"]);
    const map = await findUserIdsByEmails(db, ["Maya@Example.COM"]);
    expect(map.get("maya@example.com")).toBe("u-0");
  });

  it("omits addresses with no account rather than mapping them to null", async () => {
    withUsers(["a@x.com"]);
    const map = await findUserIdsByEmails(db, ["a@x.com", "ghost@x.com"]);
    expect(map.size).toBe(1);
    expect(map.has("ghost@x.com")).toBe(false);
  });

  it("keeps paging until every requested address is found", async () => {
    withUsers(Array.from({ length: 500 }, (_, i) => `u${i}@x.com`));
    const map = await findUserIdsByEmails(db, ["u1@x.com", "u450@x.com"]);
    expect(map.size).toBe(2);
    expect(listUsers).toHaveBeenCalledTimes(3);
  });

  it("stops early once everything asked for has been located", async () => {
    withUsers(Array.from({ length: 5000 }, (_, i) => `u${i}@x.com`));
    await findUserIdsByEmails(db, ["u1@x.com"]);
    expect(listUsers).toHaveBeenCalledTimes(1);
  });

  it("calls out at all only when there is something to look for", async () => {
    expect((await findUserIdsByEmails(db, [null, undefined, "", "  "])).size).toBe(0);
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("returns what it found so far on an API error", async () => {
    listUsers.mockResolvedValue({ data: null, error: { message: "down" } });
    expect((await findUserIdsByEmails(db, ["a@x.com"])).size).toBe(0);
  });
});

describe("findAllUsersByEmail", () => {
  it("returns every account on one address", async () => {
    // GoTrue allows more than one user row per address, and the switch-portal
    // menu exists because of it.
    listUsers.mockResolvedValue({
      data: {
        users: [
          { id: "u-0", email: "jo@x.com", user_metadata: { user_type: "artist" } },
          { id: "u-1", email: "other@x.com" },
          { id: "u-2", email: "JO@X.COM", user_metadata: { user_type: "customer" } },
        ],
      },
      error: null,
    });

    const all = await findAllUsersByEmail(db, "jo@x.com");

    expect(all.map((u) => u.id)).toEqual(["u-0", "u-2"]);
  });

  it("reads past the first page rather than stopping at the default 50", async () => {
    // The regression. The inline version called `listUsers()` with no arguments
    // under a comment claiming it pages at 1000, so a second account landing
    // past user 50 made the switch-portal menu vanish.
    const emails = Array.from({ length: 300 }, (_, i) => (i === 250 ? "jo@x.com" : `u${i}@x.com`));
    emails[0] = "jo@x.com";
    withUsers(emails);

    const all = await findAllUsersByEmail(db, "jo@x.com");

    expect(all.map((u) => u.id)).toEqual(["u-0", "u-250"]);
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it("returns an empty array for an address with no account", async () => {
    withUsers(["a@x.com"]);
    expect(await findAllUsersByEmail(db, "nobody@x.com")).toEqual([]);
  });

  it("returns an empty array without calling out for a blank address", async () => {
    expect(await findAllUsersByEmail(db, null)).toEqual([]);
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("returns what it found so far on an API error", async () => {
    listUsers.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await findAllUsersByEmail(db, "a@x.com")).toEqual([]);
  });
});

describe("findUsersByIds", () => {
  function pagedDb(pages: Array<Array<{ id: string }>>) {
    const listUsers = vi.fn(async ({ page }: { page: number; perPage: number }) => ({
      data: { users: pages[page - 1] ?? [] },
      error: null,
    }));
    return { db: { auth: { admin: { listUsers } } } as unknown as SupabaseClient, listUsers };
  }

  it("finds the requested ids across pages and stops once it has them all", async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => ({ id: `p1-${i}` }));
    const page2 = [{ id: "venue-a" }, { id: "venue-b" }];
    const { db, listUsers } = pagedDb([page1, page2, [{ id: "never-read" }]]);
    const found = await findUsersByIds(db, ["venue-a", "venue-b"]);
    expect(Array.from(found.keys()).sort()).toEqual(["venue-a", "venue-b"]);
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it("returns an empty map for no ids without calling the API, and partial results when a page fails", async () => {
    const { db, listUsers } = pagedDb([[{ id: "x" }]]);
    expect((await findUsersByIds(db, [])).size).toBe(0);
    expect(listUsers).not.toHaveBeenCalled();
    const failing = { auth: { admin: { listUsers: vi.fn(async () => ({ data: { users: [] }, error: { message: "down" } })) } } } as unknown as SupabaseClient;
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await findUsersByIds(failing, ["x"])).size).toBe(0);
    warn.mockRestore();
  });
});

