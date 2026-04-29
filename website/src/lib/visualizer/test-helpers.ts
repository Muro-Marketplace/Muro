// Mock Supabase client builders for visualizer tests.
//
// The visualizer code uses a small surface of supabase-js (.from, .select,
// .eq (chained), .maybeSingle, .insert). Real Supabase typing makes a
// hand-rolled chainable mock noisy, so this helper centralises the shape.
//
// Each call to `from("table_name")` returns the chainable object built by
// `tableHandlers[table_name]`. If you don't supply a handler for a table,
// the default returns no rows (success path = "user has no profile").
//
// The chain object returned by every `.select()` / `.eq()` step exposes:
//   - .eq()        → keep chaining
//   - .maybeSingle / .single → terminate to a SelectResponse
//   - .then()      → terminate via await to the `list` response
// This lets us write `.from(t).select(c).eq(a,b).eq(c,d)` and await it.

import type { SupabaseClient } from "@supabase/supabase-js";

type AnyRow = Record<string, unknown>;

interface SelectResponse {
  data: AnyRow | AnyRow[] | null;
  error: { message: string } | null;
}

export interface TableHandler {
  /** Returned by `.maybeSingle()` (typed-by-row callers). */
  maybeSingle?: () => SelectResponse;
  /** Returned by `.single()`. */
  single?: () => SelectResponse;
  /** Returned by awaiting a chain without a terminal. */
  list?: () => SelectResponse;
  /** Inserts capture rows for assertions; returns { error: null } by default. */
  insert?: (row: AnyRow) => { error: { message: string } | null };
}

export interface MockSupabaseOptions {
  tables: Record<string, TableHandler>;
  /** All rows passed to insert end up here so tests can assert on them. */
  insertedRows?: Map<string, AnyRow[]>;
}

interface ChainNode {
  eq: (col: string, val: unknown) => ChainNode;
  /** Inclusive lower bound, for created_at >= cutoff. */
  gte: (col: string, val: unknown) => ChainNode;
  /** Inclusive upper bound, for created_at <= cutoff. */
  lte: (col: string, val: unknown) => ChainNode;
  /** IN (...) filter. */
  in: (col: string, vals: unknown[]) => ChainNode;
  /** ORDER BY. */
  order: (col: string, opts?: unknown) => ChainNode;
  /** LIMIT N. */
  limit: (n: number) => ChainNode;
  maybeSingle: () => SelectResponse;
  single: () => SelectResponse;
  then: <T>(onFulfilled: (r: SelectResponse) => T) => Promise<T>;
}

/**
 * Build a partial SupabaseClient that responds to .from(table) with
 * the chainable methods our visualizer code uses.
 */
export function buildMockSupabase(opts: MockSupabaseOptions): SupabaseClient {
  const inserted = opts.insertedRows ?? new Map<string, AnyRow[]>();

  function makeChain(handler: TableHandler | undefined): ChainNode {
    // Every refining method (eq / gte / lte / in / order / limit) returns
    // a fresh chain pointing at the same handler, handlers are responsible
    // for returning the right data regardless of refinement (tests that
    // need filter-aware behaviour can swap a stateful handler in).
    const node: ChainNode = {
      eq: () => makeChain(handler),
      gte: () => makeChain(handler),
      lte: () => makeChain(handler),
      in: () => makeChain(handler),
      order: () => makeChain(handler),
      limit: () => makeChain(handler),
      maybeSingle: () => handler?.maybeSingle?.() ?? { data: null, error: null },
      single: () => handler?.single?.() ?? { data: null, error: null },
      then(onFulfilled) {
        const result = handler?.list?.() ?? { data: [], error: null };
        return Promise.resolve(onFulfilled(result));
      },
    };
    return node;
  }

  const client = {
    from(tableName: string) {
      const handler = opts.tables[tableName];

      return {
        select(_columns?: string) {
          return makeChain(handler);
        },
        insert(row: AnyRow) {
          const arr = inserted.get(tableName) ?? [];
          arr.push(row);
          inserted.set(tableName, arr);
          return handler?.insert?.(row) ?? { error: null };
        },
      };
    },
  };

  return client as unknown as SupabaseClient;
}
