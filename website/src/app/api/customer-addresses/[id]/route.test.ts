// DELETE /api/customer-addresses/[id].
//
// G L2359 (production pass, 2026-08-30). A DELETE naming an address id
// belonging to someone else answered 200 with {success:true}. The delete
// itself is scoped by user_id, so nothing of anyone else's was ever removed,
// which is the part that was already right. What was wrong is that the caller
// could not distinguish a real deletion from a no-op, and neither could we
// reading the logs.
//
// The scoping is what these tests are really pinning: every query the handler
// makes must carry the caller's user_id, and a row the caller does not own
// must look exactly like a row that does not exist.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock, getAuthMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getAuthMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: getAuthMock }));

import { DELETE } from "./route";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OWNED_ID = "aaaaaaaa-0000-0000-0000-000000000001";

type Filter = { column: string; value: unknown };
let selectFilters: Filter[] = [];
let deleteFilters: Filter[] = [];
let deletesIssued = 0;

/**
 * Stands in for the address table. `rows` is what the caller owns, so a
 * SELECT filtered by a foreign id simply finds nothing, exactly as PostgREST
 * would once the user_id filter is applied.
 */
function installDb(rows: Array<{ id: string; is_default: boolean }>) {
  selectFilters = [];
  deleteFilters = [];
  deletesIssued = 0;

  fromMock.mockImplementation((table: string) => {
    if (table !== "customer_addresses") throw new Error(`unexpected table ${table}`);

    const selectChain = (filters: Filter[]) => {
      const chain: Record<string, unknown> = {
        eq: (column: string, value: unknown) => {
          filters.push({ column, value });
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          const match = rows.find((r) =>
            filters.every((f) =>
              f.column === "id" ? r.id === f.value : f.column !== "user_id" || f.value === USER_ID,
            ),
          );
          // A user_id filter naming anyone else matches nothing.
          const scoped = filters.some((f) => f.column === "user_id" && f.value !== USER_ID);
          return { data: scoped ? null : (match ?? null), error: null };
        },
      };
      return chain;
    };

    return {
      select: () => selectChain(selectFilters),
      delete: () => {
        deletesIssued += 1;
        const chain: Record<string, unknown> = {
          eq: (column: string, value: unknown) => {
            deleteFilters.push({ column, value });
            return chain;
          },
          then: undefined,
        };
        // The handler awaits the delete chain directly.
        return Object.assign(
          Promise.resolve({ error: null }),
          chain,
        );
      },
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    };
  });
}

function call(id: string) {
  return DELETE(new Request("https://wallplace.co.uk/api/customer-addresses/x", { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getAuthMock.mockResolvedValue({ error: null, user: { id: USER_ID } });
});

describe("DELETE /api/customer-addresses/[id]", () => {
  it("deletes an address the caller owns", async () => {
    installDb([{ id: OWNED_ID, is_default: false }]);
    const res = await call(OWNED_ID);
    expect(res.status).toBe(200);
    expect(deletesIssued).toBe(1);
  });

  it("answers 404, not 200, for an id the caller does not own", async () => {
    // The row exists; it is simply not this user's. Before the fix this
    // returned {success:true} having removed nothing.
    installDb([]);
    const res = await call("bbbbbbbb-0000-0000-0000-000000000002");
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Address not found" });
  });

  it("issues no delete at all when the row is not the caller's", async () => {
    installDb([]);
    await call("bbbbbbbb-0000-0000-0000-000000000002");
    expect(deletesIssued).toBe(0);
  });

  it("gives a foreign id and a non-existent id the same answer", async () => {
    // Otherwise the endpoint becomes an oracle for whether an address id is real.
    installDb([]);
    const foreign = await call("bbbbbbbb-0000-0000-0000-000000000002");
    const missing = await call("cccccccc-0000-0000-0000-000000000003");
    expect(foreign.status).toBe(missing.status);
    await expect(foreign.json()).resolves.toEqual(await missing.json());
  });

  it("scopes every read and every delete by the caller's user id", async () => {
    installDb([{ id: OWNED_ID, is_default: false }]);
    await call(OWNED_ID);
    expect(selectFilters).toContainEqual({ column: "user_id", value: USER_ID });
    expect(deleteFilters).toContainEqual({ column: "user_id", value: USER_ID });
    expect(deleteFilters).toContainEqual({ column: "id", value: OWNED_ID });
  });

  it("rejects an unauthenticated caller before touching the database", async () => {
    installDb([{ id: OWNED_ID, is_default: false }]);
    getAuthMock.mockResolvedValue({ error: new Response(null, { status: 401 }), user: null });
    await call(OWNED_ID);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("requires an id", async () => {
    installDb([]);
    const res = await call("");
    expect(res.status).toBe(400);
  });
});
