import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Owner-reported 2 September: the application form posted /api/apply with a
// bare fetch and no session, so the server could not link the application
// to the account, never created the artist_profiles row, and the portal
// bounced the applicant back to the form. The submit must go through
// mutate(), which carries the bearer token.
describe("ApplicationForm submits with the session", () => {
  const src = readFileSync(join(process.cwd(), "src/components/ApplicationForm.tsx"), "utf8");
  it("uses mutate() for /api/apply, never a bare fetch", () => {
    expect(src).toMatch(/mutate\("\/api\/apply"/);
    expect(src).not.toMatch(/fetch\("\/api\/apply"/);
  });
});

// LA-C045 (launch audit 2026-09-05). The two terms acceptances fired after the
// application with bare fetch() and no Authorization header, so the route's
// authenticated branch never ran and every artist_agreement row in production
// carries user_id NULL. The application form is the one caller that always has
// a session (the /apply gate requires it), so both posts go through mutate().
describe("ApplicationForm records terms acceptance under the session", () => {
  const src = readFileSync(join(process.cwd(), "src/components/ApplicationForm.tsx"), "utf8");
  it("uses mutate() for /api/terms/accept, never a bare fetch", () => {
    expect((src.match(/mutate\("\/api\/terms\/accept"/g) || []).length).toBe(2);
    expect(src).not.toMatch(/fetch\("\/api\/terms\/accept"/);
  });
});
