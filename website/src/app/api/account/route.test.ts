// DELETE /api/account. Someone's right to erasure.
//
// This route ran nine unchecked writes and then reported success. FOUR of them
// could not have worked, each a phantom-column or phantom-table rejection that
// PostgREST returns as an error nobody read:
//
//   artist_profiles.image      does not exist (the column is `profile_image`), and
//                              PostgREST rejects the WHOLE update, so the artist
//                              scrub did nothing at all: name, both bios, location,
//                              Instagram and website all survived.
//   from("waitlist")           does not exist (`waitlist_signups` does).
//   from("applications")       does not exist (`artist_applications` does).
//   artist_applications.phone  does not exist, so even the right table would fail.
//
// Verified against production. The result: a person asks to be deleted, gets
// `{ success: true }`, their auth user is removed so they cannot log in and
// check, and their name, biography, location, social handles, waitlist entry and
// full application stay in the database.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const { fromMock, deleteUserMock, getAuthMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  deleteUserMock: vi.fn(async () => ({ error: null })),
  getAuthMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, auth: { admin: { deleteUser: deleteUserMock } } }),
}));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: getAuthMock }));
vi.mock("@/lib/demo-guard", () => ({ assertNotDemo: () => null }));

import { DELETE } from "./route";

const SCHEMA: Record<string, string[]> = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../../tests/integration/schema-columns.json"), "utf8"),
);

interface Write {
  table: string;
  op: "update" | "delete";
  payload?: Record<string, unknown>;
}

let writes: Write[] = [];

/**
 * A fake that behaves like PostgREST: an unknown TABLE and an unknown COLUMN
 * both reject the whole statement. Anything less makes this suite an assertion
 * about the shape of a payload rather than a reproduction of the failure.
 */
function installDb() {
  writes = [];
  fromMock.mockImplementation((table: string) => {
    const known = SCHEMA[table];
    const reject = (message: string) => ({ eq: async () => ({ error: { message } }) });
    if (!known) {
      return {
        update: () => reject(`relation "public.${table}" does not exist`),
        delete: () => reject(`relation "public.${table}" does not exist`),
      };
    }
    return {
      update: (payload: Record<string, unknown>) => {
        writes.push({ table, op: "update", payload });
        const bad = Object.keys(payload).find((k) => !known.includes(k));
        return bad
          ? reject(`Could not find the '${bad}' column of '${table}'`)
          : { eq: async () => ({ error: null }) };
      },
      delete: () => {
        writes.push({ table, op: "delete" });
        return { eq: async () => ({ error: null }) };
      },
    };
  });
}

function req(confirm: unknown = "DELETE"): Request {
  return new Request("http://localhost/api/account", {
    method: "DELETE",
    headers: { authorization: "Bearer x", "content-type": "application/json" },
    body: JSON.stringify({ confirm }),
  });
}

const payloadFor = (table: string) => writes.find((w) => w.table === table)?.payload ?? {};

beforeEach(() => {
  fromMock.mockReset();
  deleteUserMock.mockClear();
  getAuthMock.mockReset();
  getAuthMock.mockResolvedValue({ user: { id: "u-1", email: "jo@example.com" }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  installDb();
});

describe("DELETE /api/account actually erases", () => {
  it("succeeds, with every write landing", async () => {
    const res = await DELETE(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("delists the scrubbed artist profile, or the shell stays in /browse", async () => {
    // Migration 117 lets the profile survive deletion (user_id SET NULL), and
    // approved profiles list. An anonymised shell named "[deleted-…]" on the
    // public grid is not erasure.
    await DELETE(req());
    expect(payloadFor("artist_profiles")).toMatchObject({ review_status: "rejected" });
  });

  it("scrubs the artist profile, which used to fail entirely", async () => {
    // THE regression. `image` is not a column, so PostgREST rejected the whole
    // update and NONE of these were cleared.
    await DELETE(req());

    const p = payloadFor("artist_profiles");
    expect(p.name).toBe("[deleted-u-1]");
    for (const field of ["short_bio", "extended_bio", "location", "instagram", "website"]) {
      expect(p[field], field).toBe("");
    }
  });

  it("clears the profile image under its real column name", async () => {
    await DELETE(req());

    const keys = Object.keys(payloadFor("artist_profiles"));
    expect(keys).toContain("profile_image");
    // `image` is the name that was there, and it is why the whole update was
    // rejected. Asserting its absence is the point, not decoration.
    expect(keys).not.toContain("image");
  });

  it("deletes the waitlist entry from the table that exists", async () => {
    await DELETE(req());
    expect(writes.some((w) => w.table === "waitlist_signups" && w.op === "delete")).toBe(true);
    expect(writes.some((w) => w.table === "waitlist")).toBe(false);
  });

  it("anonymises the application in the table that exists", async () => {
    await DELETE(req());

    const p = payloadFor("artist_applications");
    expect(p.email).toBe("[deleted-u-1]");
    expect(p.name).toBe("[deleted-u-1]");
    // The free-text statement is personal data too, and was never scrubbed.
    expect(p.artist_statement).toBe("");
    expect(writes.some((w) => w.table === "applications")).toBe(false);
  });

  it("names no column any of these tables lacks", async () => {
    // The fake rejects unknown columns, so a phantom makes the run fail. This
    // states the invariant directly as well, so a future edit is caught by the
    // assertion and not only by the side effect.
    await DELETE(req());

    for (const w of writes) {
      if (!w.payload) continue;
      for (const key of Object.keys(w.payload)) {
        expect(SCHEMA[w.table], `${w.table}.${key}`).toContain(key);
      }
    }
  });
});

describe("DELETE /api/account refuses to half-erase", () => {
  it("does NOT delete the auth user when a scrub fails", async () => {
    // This is what made the bug invisible: the account went, so nobody could log
    // in and notice their bio was still on the site.
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_profiles") {
        return { update: () => ({ eq: async () => ({ error: { message: "boom" } }) }) };
      }
      return {
        update: () => ({ eq: async () => ({ error: null }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
    });

    const res = await DELETE(req());

    expect(res.status).toBe(500);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("keeps scrubbing after the first failure rather than stopping", async () => {
    // A scrub that short-circuits leaves MORE data behind than one that carries
    // on and reports what it could not do.
    let failed = false;
    fromMock.mockImplementation((table: string) => {
      writes.push({ table, op: "update" });
      const err = table === "artist_profiles" ? { message: "boom" } : null;
      if (err) failed = true;
      return {
        update: () => ({ eq: async () => ({ error: err }) }),
        delete: () => ({ eq: async () => ({ error: err }) }),
      };
    });
    writes = [];

    await DELETE(req());

    expect(failed).toBe(true);
    expect(writes.map((w) => w.table)).toContain("messages");
    expect(writes.map((w) => w.table)).toContain("waitlist_signups");
  });

  it("tells the person their account is untouched rather than half-gone", async () => {
    fromMock.mockImplementation(() => ({
      update: () => ({ eq: async () => ({ error: { message: "boom" } }) }),
      delete: () => ({ eq: async () => ({ error: { message: "boom" } }) }),
    }));

    const body = await (await DELETE(req())).json();

    expect(body.error).toMatch(/not closed the account|contact support/i);
  });

  it("still requires the confirmation word", async () => {
    const res = await DELETE(req("yes"));
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
