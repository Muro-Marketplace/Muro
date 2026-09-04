/**
 * persistRender writes the capture to storage and records a row.
 *
 * The cost_units column is constrained to 1..10 by migration 035, from when
 * every render spent a quota unit. A client capture is free, and passing 0
 * had production rejecting the row after the file had already uploaded.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { persistRender } from "./renders-db";

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => {
    throw new Error("the test must pass its own client");
  },
}));

function fakeClient() {
  const insert = vi.fn(() => ({
    select: () => ({
      single: async () => ({
        data: {
          id: "r1",
          layout_id: "lay-1",
          user_id: "u1",
          kind: "standard",
          output_path: "u1/r1.webp",
          layout_hash: "h",
          cost_units: 1,
          kept: false,
          provider: "client_capture",
          prompt_seed: null,
          created_at: "2026-09-04T00:00:00Z",
        },
        error: null,
      }),
    }),
  }));
  const upload = vi.fn(async () => ({ error: null }));
  const client = {
    storage: {
      from: () => ({
        upload,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://public/${path}` } }),
      }),
    },
    from: () => ({ insert }),
  };
  return { client: client as unknown as SupabaseClient, insert, upload };
}

async function persistWith(costUnits: number) {
  const { client, insert, upload } = fakeClient();
  const result = await persistRender(
    {
      userId: "u1",
      layoutId: "lay-1",
      kind: "standard",
      layoutHash: "h",
      costUnits,
      imageBuffer: Buffer.from([1, 2, 3]),
      provider: "client_capture",
    },
    client,
  );
  return { result, insert, upload };
}

function costUnitsWritten(insert: ReturnType<typeof fakeClient>["insert"]): number {
  const row = (insert.mock.calls as unknown as Array<[{ cost_units: number }]>)[0][0];
  return row.cost_units;
}

describe("persistRender and the cost_units constraint", () => {
  it("records the minimum for a free capture, because the column cannot express zero", async () => {
    const { result, insert, upload } = await persistWith(0);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(costUnitsWritten(insert)).toBe(1);
    expect(result).not.toBeNull();
  });

  it("keeps a real render's cost", async () => {
    const { insert } = await persistWith(2);
    expect(costUnitsWritten(insert)).toBe(2);
  });

  it("never writes past the column's ceiling", async () => {
    const { insert } = await persistWith(99);
    expect(costUnitsWritten(insert)).toBe(10);
  });
});
