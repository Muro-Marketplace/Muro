// One place answers "which auth user has this email?".
//
// Three routes hand-rolled it and all three had the same two bugs, because each
// was written from scratch:
//
//   const { data } = await db.auth.admin.listUsers();
//   const user = data?.users?.find((u) => u.email === app.email);
//
// `listUsers()` with no arguments returns the FIRST 50 users. Production has 40
// today, so all three worked and all three were going to stop working at user 51,
// silently, by reporting "no such user" for a user that exists. In
// `admin/applications/[id]` that means approving an application creates a SECOND
// auth account for someone who already has one.
//
// And `u.email === app.email` is case-sensitive against a store that lowercases.
// That one bites at any user count.
//
// This guard is a ratchet: it allows the helper, and one deliberate full scan in
// a cron job that genuinely wants every user, and nothing else.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

/** The helper itself, plus the one caller that wants the whole list, not a lookup. */
const ALLOWED = new Set([
  "src/lib/auth/find-user-by-email.ts",
  // Sweeps every user to find dormant accounts. Not an email lookup, and it
  // passes an explicit perPage.
  "src/app/api/cron/inactive-users/route.ts",
]);

function sourceFilesCalling(needle: string): string[] {
  let out = "";
  try {
    out = execFileSync(
      "grep",
      ["-rl", "--include=*.ts", "--include=*.tsx", needle, "src"],
      { cwd: ROOT, encoding: "utf8" },
    );
  } catch {
    return []; // grep exits 1 when nothing matches
  }
  return out
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));
}

/** Strip comments, so a file that only MENTIONS the pattern does not trip this. */
function code(file: string): string {
  return readFileSync(path.join(ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("one auth-user lookup", () => {
  it("nothing outside the helper calls listUsers directly", () => {
    const offenders = sourceFilesCalling("auth.admin.listUsers")
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => code(f).includes("auth.admin.listUsers"));

    expect(
      offenders,
      "Use findUserByEmail / findUserIdsByEmails / findAllUsersByEmail from " +
        "@/lib/auth/find-user-by-email. A direct listUsers() call defaults to 50 " +
        "users per page and will silently miss accounts once there are more.",
    ).toEqual([]);
  });

  it("no listUsers call anywhere omits its page size", () => {
    // The specific defect: `listUsers()` rather than `listUsers({ page, perPage })`.
    const bare: string[] = [];
    for (const file of sourceFilesCalling("auth.admin.listUsers")) {
      if (/auth\.admin\.listUsers\(\s*\)/.test(code(file))) bare.push(file);
    }
    expect(bare, "listUsers() with no arguments returns only the first 50 users").toEqual([]);
  });

  it("the helper is what the three former call sites now use", () => {
    // Named individually so deleting the import from any one of them is a
    // failing test rather than a quiet regression.
    const callers = [
      "src/app/api/admin/applications/[id]/route.ts",
      "src/app/api/account/roles/route.ts",
      "src/app/api/placements/venues/route.ts",
    ];
    for (const file of callers) {
      expect(code(file), file).toContain("@/lib/auth/find-user-by-email");
    }
  });

  it("nothing compares an email with a case-sensitive equality", () => {
    // GoTrue stores addresses lowercased; forms do not. `u.email === x` is the
    // shape that made an application from "Maya@Example.com" miss the existing
    // "maya@example.com" account.
    const offenders: string[] = [];
    for (const file of sourceFilesCalling("u.email ===")) {
      if (/\bu\.email\s*===/.test(code(file))) offenders.push(file);
    }
    expect(offenders, "compare lowercased, or use the shared helper").toEqual([]);
  });
});
