import { describe, it, expect, beforeEach, vi } from "vitest";

// E32: upsertWork matched rows by `id` alone while writing the caller's
// artist_id, so any artist could overwrite another artist's artwork AND take
// ownership of it. deleteWork, twelve lines below, was always scoped correctly.
//
// The fake below records every query it is handed, which lets the tests assert
// the invariant that actually matters: no write or read-back touches
// artist_works without an artist_id predicate in the same query.

interface Recorded {
  table: string;
  op: "select" | "update" | "insert" | "delete";
  filters: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

const hoisted = vi.hoisted(() => ({
  db: null as unknown as { from: (t: string) => unknown },
  calls: [] as Recorded[],
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => hoisted.db }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }) } }));

const { upsertWork, deleteWork } = await import("./artist-works");

interface Row {
  id: string;
  artist_id: string;
}

/** @param failFirstUpdate force the strip-and-retry fallback path. */
function installFakeDb(rows: Row[], failFirstUpdate = false) {
  hoisted.calls = [];
  let updatesSeen = 0;

  const matches = (rec: Recorded): Row | null => {
    const found = rows.find(
      (r) =>
        (rec.filters.id === undefined || r.id === rec.filters.id) &&
        (rec.filters.artist_id === undefined || r.artist_id === rec.filters.artist_id),
    );
    return found ?? null;
  };

  const chain = (rec: Recorded) => {
    const settle = () => {
      if (rec.op === "update") {
        updatesSeen += 1;
        if (failFirstUpdate && updatesSeen === 1) {
          return { data: null, error: { message: "column does not exist" } };
        }
      }
      return { data: rec.op === "select" ? matches(rec) : null, error: null };
    };
    const obj: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        rec.filters[col] = val;
        return obj;
      },
      maybeSingle: () => Promise.resolve(settle()),
      single: () => Promise.resolve(settle()),
      // Supabase builders are thenable, so `await db.from(x).update(y).eq(...)`
      // resolves without an explicit terminator.
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(settle()).then(onFulfilled),
    };
    return obj;
  };

  hoisted.db = {
    from: (table: string) => ({
      select: () => chain(push({ table, op: "select", filters: {} })),
      update: (payload: Record<string, unknown>) =>
        chain(push({ table, op: "update", filters: {}, payload })),
      insert: (payload: Record<string, unknown>) =>
        chain(push({ table, op: "insert", filters: {}, payload })),
      delete: () => chain(push({ table, op: "delete", filters: {} })),
    }),
  };

  function push(rec: Recorded): Recorded {
    hoisted.calls.push(rec);
    return rec;
  }
}

const MINE = "artist-mine";
const THEIRS = "artist-theirs";
const work = (id: string) => ({
  id,
  title: "Study",
  medium: "oil",
  dimensions: "10x10",
  price_band: "a",
  pricing: [],
  available: true,
  color: "#000",
  image: "img",
  orientation: "landscape" as const,
  sort_order: 0,
});

const writes = () => hoisted.calls.filter((c) => c.op === "update" || c.op === "insert");

beforeEach(() => {
  hoisted.calls = [];
});

describe("upsertWork ownership scoping (E32)", () => {
  it("refuses to touch a work owned by another artist, and writes nothing", async () => {
    installFakeDb([{ id: "victim-work", artist_id: THEIRS }]);

    const result = await upsertWork(MINE, work("victim-work") as never);

    expect(result.error, "an ownership refusal must be reported").toBeTruthy();
    expect(result.savedRow).toBeNull();
    // The whole point: no UPDATE and no INSERT reached the table.
    expect(writes(), `unexpected writes: ${JSON.stringify(writes())}`).toEqual([]);
  });

  it("never reassigns artist_id on someone else's row", async () => {
    installFakeDb([{ id: "victim-work", artist_id: THEIRS }]);
    await upsertWork(MINE, work("victim-work") as never);
    for (const w of writes()) {
      expect(w.payload?.artist_id).not.toBe(MINE);
    }
  });

  it("still updates the caller's own work", async () => {
    installFakeDb([{ id: "my-work", artist_id: MINE }]);

    const result = await upsertWork(MINE, work("my-work") as never);

    expect(result.error).toBeFalsy();
    const updates = hoisted.calls.filter((c) => c.op === "update");
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0].filters).toMatchObject({ id: "my-work", artist_id: MINE });
  });

  it("still inserts a genuinely new work", async () => {
    installFakeDb([]);

    const result = await upsertWork(MINE, work("brand-new") as never);

    expect(result.error).toBeFalsy();
    const inserts = hoisted.calls.filter((c) => c.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload?.artist_id).toBe(MINE);
  });

  it("scopes every artist_works query by artist_id, including the read-back", async () => {
    installFakeDb([{ id: "my-work", artist_id: MINE }]);
    await upsertWork(MINE, work("my-work") as never);

    const unscoped = hoisted.calls.filter(
      (c) =>
        c.table === "artist_works" &&
        c.op !== "insert" && // an insert carries artist_id in its payload, not a filter
        c.filters.artist_id === undefined,
    );
    expect(
      unscoped,
      `these queries are keyed on id alone: ${JSON.stringify(unscoped)}`,
    ).toEqual([]);
  });

  it("keeps the fallback path scoped too, not just the first write", async () => {
    // The strip-and-retry chain issues per-column updates. Those are writes as
    // real as the first one, and the doc's fix only covered the main update.
    installFakeDb([{ id: "my-work", artist_id: MINE }], true);

    await upsertWork(MINE, {
      ...work("my-work"),
      description: "a description",
      shipping_price: 5,
    } as never);

    const updates = hoisted.calls.filter((c) => c.op === "update");
    expect(updates.length).toBeGreaterThan(1);
    for (const u of updates) {
      expect(u.filters, "a fallback update escaped the artist_id scope").toMatchObject({
        artist_id: MINE,
      });
    }
  });
});

describe("deleteWork", () => {
  it("was already scoped, and stays that way", async () => {
    installFakeDb([{ id: "my-work", artist_id: MINE }]);
    await deleteWork("my-work", MINE);
    const del = hoisted.calls.find((c) => c.op === "delete");
    expect(del?.filters).toMatchObject({ id: "my-work", artist_id: MINE });
  });
});
