// K1 (07 §1.5). One email pipeline.
//
// There were two. `src/lib/email.ts` had nineteen exported notifiers, each with
// its own Resend client, hand-written HTML, a hardcoded `from` on an unverified
// domain, and no idempotency key, suppression check, preference check,
// unsubscribe header or `email_events` row. `src/lib/email/send.ts` has all of
// those. There was no path where the legacy module did something the pipeline
// could not; it was strictly worse, and it was still sending.
//
// The third assertion is the one that matters long term: it stops anyone
// starting a THIRD path without noticing.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)));
    else if (/\.tsx?$/.test(entry.name)) out.push(path.relative(process.cwd(), full));
  }
  return out.sort();
}

describe("K1: one email pipeline", () => {
  it("src/lib/email.ts does not exist", () => {
    expect(existsSync("src/lib/email.ts")).toBe(false);
  });

  it("nothing imports the legacy module", async () => {
    const files = [
      ...(await sourceFiles(path.join(process.cwd(), "src"))),
      ...(await sourceFiles(path.join(process.cwd(), "tests"))),
    ];
    const offenders = files.filter((f) =>
      /from\s+["']@\/lib\/email["']|import\(\s*["']@\/lib\/email["']\s*\)|vi\.mock\(\s*["']@\/lib\/email["']/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("only one module constructs a Resend client", async () => {
    // THE long-term guard. A second `new Resend(...)` anywhere is a second
    // sending path with its own `from`, its own retry behaviour and no shared
    // suppression list, which is exactly how the first split happened.
    const files = await sourceFiles(path.join(process.cwd(), "src"));
    const constructors = files.filter((f) => /new\s+Resend\s*\(/.test(readFileSync(f, "utf8")));
    expect(constructors).toEqual([path.join("src", "lib", "email", "send.ts")]);
  });

  it("finds source files at all, so an empty sweep cannot pass vacuously", async () => {
    const files = await sourceFiles(path.join(process.cwd(), "src"));
    expect(files.length).toBeGreaterThan(200);
  });

  it("every template the migrated routes name is in the registry", async () => {
    // A `sendEmail({ template: "..." })` naming an id the registry does not
    // carry sends fine but is invisible to the preview library and to every
    // audit that walks EMAIL_REGISTRY. Item 1.6 found one template in exactly
    // that state.
    const { EMAIL_REGISTRY } = await import("@/emails/registry");
    const ids = new Set(EMAIL_REGISTRY.map((t) => t.id));
    for (const id of [
      "admin_alert",
      "artist_new_placement_invitation",
      "artist_refund_requested",
      "curation_enquiry_received",
      "curation_payment_received",
      "customer_order_status_update",
      "customer_refund_rejected",
      "venue_sale_from_placement",
    ]) {
      expect(ids.has(id), `${id} is not in EMAIL_REGISTRY`).toBe(true);
    }
  });
});
