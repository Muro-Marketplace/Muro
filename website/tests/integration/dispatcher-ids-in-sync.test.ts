// 09 item 4.1. The dispatcher's id list has two copies, so they must agree.
//
// `DISPATCHER_TEMPLATE_IDS` exists because a script cannot import
// `dispatcher.ts`: that pulls in sendEmail, then supabase-admin, then
// `server-only`, which throws outside a Server Component. So the render harness
// reads the extracted set instead.
//
// A second copy of anything is what this whole remediation has been removing, so
// it gets the treatment: a test that fails the moment it drifts. A stale list
// would silently downgrade a real "this token goes out literally" failure into a
// warning, which is the direction that matters.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  DISPATCHER_NAME_TO_REGISTRY_ID,
  DISPATCHER_TEMPLATE_IDS,
} from "@/lib/email/dispatcher-ids";

/** Registry ids on the right-hand side of TEMPLATE_BINDINGS. */
function bindingsFromSource(): Set<string> {
  const source = readFileSync("src/lib/email/dispatcher.ts", "utf8");
  const block = source.slice(
    source.indexOf("const TEMPLATE_BINDINGS"),
    source.indexOf("};", source.indexOf("const TEMPLATE_BINDINGS")),
  );
  const ids = new Set<string>();
  for (const m of block.matchAll(/:\s*"([a-z0-9_]+)"/g)) ids.add(m[1]);
  return ids;
}

describe("DISPATCHER_TEMPLATE_IDS stays in sync with TEMPLATE_BINDINGS", () => {
  it("parses the bindings at all, so an empty sweep cannot pass vacuously", () => {
    expect(bindingsFromSource().size).toBeGreaterThan(3);
  });

  it("matches exactly", () => {
    expect([...DISPATCHER_TEMPLATE_IDS].sort()).toEqual([...bindingsFromSource()].sort());
  });

  it("maps every dispatcher NAME to the same registry id the bindings do", () => {
    // The name-to-id map is the second half of the copy, and the one the audit
    // uses to avoid reporting seven false "missing template" positives.
    const source = readFileSync("src/lib/email/dispatcher.ts", "utf8");
    const block = source.slice(
      source.indexOf("const TEMPLATE_BINDINGS"),
      source.indexOf("};", source.indexOf("const TEMPLATE_BINDINGS")),
    );
    const pairs: Record<string, string> = {};
    for (const m of block.matchAll(/^\s*([a-z0-9_]+):\s*"([a-z0-9_]+)",/gm)) pairs[m[1]] = m[2];
    expect(pairs).toEqual({ ...DISPATCHER_NAME_TO_REGISTRY_ID });
  });

  it("names only ids the registry actually carries", async () => {
    const { EMAIL_REGISTRY } = await import("@/emails/registry");
    const registryIds = new Set(EMAIL_REGISTRY.map((t) => t.id));
    for (const id of DISPATCHER_TEMPLATE_IDS) {
      expect(registryIds.has(id), `${id} is not in EMAIL_REGISTRY`).toBe(true);
    }
  });
});
