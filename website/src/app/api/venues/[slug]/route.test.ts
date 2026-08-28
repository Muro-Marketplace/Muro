// The lean-select fallback that used to sit in this route is deleted.
//
// It retried with a narrower column list "if the migration isn't applied". All
// five supposedly-optional columns exist in production, so it could never fire
// for the reason it claimed. What it DID do was run on the far more common path:
// the primary read is `.maybeSingle()`, so `data` is null both when a column is
// missing and when the slug simply does not exist, which meant a second full
// query on every 404 of a public route. It also swallowed the error, so a real
// PostgREST rejection read as "no such venue".

import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock, getOptionalUserMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getOptionalUserMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/api-auth", () => ({ getOptionalUser: getOptionalUserMock }));
vi.mock("@/lib/subscriptions", () => ({ resolveSubscription: vi.fn(async () => ({ active: false })) }));

import { GET } from "./route";

const VENUE = {
  user_id: "u-venue",
  slug: "the-copper-kettle",
  name: "The Copper Kettle",
  type: "cafe",
  location: "Hampton",
  city: "Hampton",
  postcode: "TW12 2TH",
  description: "A cafe",
};

let selects: string[] = [];

function installDb(opts: { row?: unknown; error?: unknown } = {}) {
  selects = [];
  fromMock.mockImplementation(() => ({
    select: (cols: string) => {
      selects.push(cols);
      return {
        eq: () => ({
          maybeSingle: async () => ({
            data: "row" in opts ? opts.row : VENUE,
            error: opts.error ?? null,
          }),
        }),
      };
    },
  }));
}

const ctx = { params: Promise.resolve({ slug: "the-copper-kettle" }) };
const req = () => new Request("http://localhost/api/venues/the-copper-kettle");

beforeEach(() => {
  fromMock.mockReset();
  getOptionalUserMock.mockReset();
  getOptionalUserMock.mockResolvedValue({ user: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  installDb();
});

describe("GET /api/venues/[slug]", () => {
  it("reads the profile in ONE query", async () => {
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(selects).toHaveLength(1);
  });

  it("asks for the display columns, not a lean subset", async () => {
    await GET(req(), ctx);
    for (const col of ["images", "display_wall_space", "display_lighting", "display_rotation_frequency"]) {
      expect(selects[0], col).toContain(col);
    }
  });

  it("does NOT run a second query when the row is not in the database", async () => {
    // The old fallback ran a full second read here, because a missing row and a
    // missing column were indistinguishable to it. This route then falls back to
    // the static seed data, which is pre-existing behaviour and not what this
    // test is about: the count is.
    installDb({ row: null });

    await GET(req(), ctx);

    expect(selects).toHaveLength(1);
  });

  it("reports a database error as an error, not as a missing venue", async () => {
    // The phantom-column class: swallowing the error is what turns a rejected
    // query into a plausible-but-wrong answer.
    installDb({ row: null, error: { message: "column does not exist" } });

    const res = await GET(req(), ctx);

    expect(res.status).toBe(500);
    expect(selects).toHaveLength(1);
  });

  it("never exposes the owner's user_id to an anonymous caller", async () => {
    const body = await (await GET(req(), ctx)).json();
    expect(JSON.stringify(body)).not.toContain("u-venue");
  });

  it("nulls the exact postcode for an anonymous caller", async () => {
    const body = await (await GET(req(), ctx)).json();
    expect(JSON.stringify(body)).not.toContain("TW12 2TH");
  });
});
