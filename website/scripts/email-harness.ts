#!/usr/bin/env tsx
/**
 * Email harness (09 §E.1, item 4.1).
 *
 *   npm run email:render     # render every registry entry with its mock
 *   npm run email:audit      # registry ids with no trigger, triggers with no id
 *
 * `email-preview` already proves a template renders, but only for whichever one
 * a human opens, and only in a browser. This is the same check over ALL of them,
 * in CI, plus the one `email-preview` cannot do: catching a subject whose
 * `{{token}}` never gets substituted, which is how a literal "{{orderNumber}}"
 * reaches an inbox.
 *
 * `render` is in `npm run check`. `audit` is a report, not a gate: the registry
 * is a library built ahead of the product, so "no trigger" is expected for many
 * ids and failing on it would be noise. The reverse direction is a real bug
 * class and is called out separately in the output.
 */

import { createElement } from "react";
import { render } from "@react-email/components";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { EMAIL_REGISTRY } from "../src/emails/registry";
import {
  DISPATCHER_NAME_TO_REGISTRY_ID,
  DISPATCHER_TEMPLATE_IDS,
} from "../src/lib/email/dispatcher-ids";
import { substituteTokens, unsubstitutedTokens } from "../src/lib/email/subject-tokens";

const SRC = path.join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

async function cmdRender(): Promise<number> {
  const failures: string[] = [];
  const warnings: string[] = [];
  let checked = 0;

  for (const entry of EMAIL_REGISTRY) {
    const id = entry.id;
    try {
      const element = createElement(entry.component, entry.mock);
      const html = await render(element);
      const text = await render(element, { plainText: true });

      if (!html.trim()) failures.push(`${id}: rendered empty HTML`);
      if (!text.trim()) failures.push(`${id}: rendered empty plaintext`);

      // The check email-preview cannot do. A subject token that the mock does
      // not supply goes out literally.
      const subject = substituteTokens(entry.subject, entry.mock as Record<string, unknown>);
      // A leftover token only reaches an inbox literally on the DISPATCHER
      // path, because that is the only sender that substitutes: every
      // sendEmail() caller passes an explicit subject and the registry's is
      // documentation. So it fails there and reports elsewhere, rather than
      // blocking `check` on a docstring.
      const leftover = unsubstitutedTokens(subject);
      if (leftover.length) {
        const line =
          `${id}: subject still contains ${leftover.join(", ")} after substitution ` +
          `against its own mock`;
        if (DISPATCHER_TEMPLATE_IDS.has(id)) {
          failures.push(`${line} — this template IS dispatcher-reachable, so that token goes out literally`);
        } else {
          warnings.push(`${line} (not dispatcher-reachable; its senders pass an explicit subject)`);
        }
      }
      checked += 1;
    } catch (err) {
      failures.push(`${id}: threw during render: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`email:render checked ${checked}/${EMAIL_REGISTRY.length} templates`);
  if (warnings.length) {
    console.warn(`\n${warnings.length} subject(s) with a token their own mock does not supply:`);
    for (const w of warnings) console.warn(`  - ${w}`);
    console.warn("  (A report. The mock is the template's contract, so these are worth completing.)");
  }
  if (failures.length) {
    console.error(`\n${failures.length} template(s) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }
  console.log(
    warnings.length
      ? "All templates render, in HTML and plaintext. No dispatcher-reachable subject can emit a literal token."
      : "All templates render, in HTML and plaintext, with no unsubstituted subject tokens.",
  );
  return 0;
}

function cmdAudit(): number {
  const registryIds = new Set(EMAIL_REGISTRY.map((e) => e.id));

  // Ids named by a real send: sendEmail({ template: "..." }) and the
  // dispatcher's TEMPLATE_BINDINGS values.
  const referenced = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(/template:\s*["']([a-z0-9_]+)["']/g)) referenced.add(m[1]);
    for (const m of source.matchAll(/^\s*[a-z_]+:\s*["']([a-z0-9_]+)["'],\s*$/gm)) {
      if (file.endsWith("dispatcher.ts")) referenced.add(m[1]);
    }
  }

  // A sendTransactional({ template: "order_placed" }) names a DISPATCHER name,
  // not a registry id. Resolve those first, or the audit reports seven false
  // positives and the real ones get lost in them.
  const resolved = new Set(
    [...referenced].map((id) => DISPATCHER_NAME_TO_REGISTRY_ID[id] ?? id),
  );

  const unwired = [...registryIds].filter((id) => !resolved.has(id)).sort();
  const missing = [...resolved].filter((id) => !registryIds.has(id)).sort();

  console.log(`Registry: ${registryIds.size} templates. Referenced by a send: ${resolved.size}.`);

  console.log(`\n${unwired.length} registry template(s) with no send path:`);
  for (const id of unwired) console.log(`  - ${id}`);
  console.log("  (Expected for a library built ahead of the product; a report, not a failure.)");

  if (missing.length) {
    // `sendEmail`'s `template` is documented as the label written to
    // email_events, not as a registry id, so these sends are not broken. The
    // divergence still matters for two concrete reasons:
    //
    //   1. the per-category throttle filters `.eq("template", input.template)`,
    //      so two labels for one template throttle as two templates;
    //   2. an operator asking "did that email send?" greps email_events by the
    //      id they know, which is the registry's, and finds nothing.
    //
    // Reported, not failed: §E.1 says this half becomes an error once clean, and
    // these five are pre-existing.
    console.error(`\n${missing.length} send(s) whose email_events label is not a registry id:`);
    for (const id of missing) console.error(`  - ${id}`);
    console.error(
      "  (Not broken sends. But the throttle keys on this label and an operator " +
        "greps email_events by it, so a template with two names throttles and reads as two.)",
    );
    return 1;
  }
  console.log("\nEvery send names a template the registry carries.");
  return 0;
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "render") process.exit(await cmdRender());
  if (cmd === "audit") process.exit(cmdAudit());
  console.error("Usage: email-harness.ts <render|audit>");
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
