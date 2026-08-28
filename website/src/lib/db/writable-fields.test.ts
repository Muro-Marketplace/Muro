import { describe, it, expect } from "vitest";
import {
  pickWritable,
  assertNoServerOwned,
  ARTIST_PROFILE_WRITABLE,
  ARTIST_PROFILE_SERVER_OWNED,
  VENUE_PROFILE_WRITABLE,
  VENUE_PROFILE_SERVER_OWNED,
  ARTIST_WORK_WRITABLE,
  ARTIST_WORK_SERVER_OWNED,
} from "./writable-fields";

// 06-validation-massassign.md A2. These two functions are the only thing standing
// between a request body and a DB write once the routes are converted, so the
// edge cases matter more than the happy path.

describe("pickWritable", () => {
  it("keeps allowlisted keys", () => {
    const out = pickWritable({ name: "Maya", short_bio: "Painter" }, ARTIST_PROFILE_WRITABLE);
    expect(out).toEqual({ name: "Maya", short_bio: "Painter" });
  });

  it("drops keys that are not on the allowlist", () => {
    // E44: the exact payload that self-approves, self-grants Pro and redirects
    // the payout destination.
    const out = pickWritable(
      {
        name: "Maya",
        review_status: "approved",
        subscription_plan: "pro",
        subscription_status: "active",
        stripe_connect_account_id: "acct_attacker",
        user_id: "someone-else",
      },
      ARTIST_PROFILE_WRITABLE,
    );
    expect(out).toEqual({ name: "Maya" });
  });

  it("omits absent keys rather than writing undefined over them", () => {
    // A partial PATCH must stay partial. Writing `undefined` would null the
    // column in the DB payload.
    const out = pickWritable({ name: "Maya" }, ARTIST_PROFILE_WRITABLE);
    expect(Object.keys(out)).toEqual(["name"]);
    expect("short_bio" in out).toBe(false);
  });

  it("keeps an explicit null, which is a real value", () => {
    const out = pickWritable({ short_bio: null }, ARTIST_PROFILE_WRITABLE);
    expect(out).toEqual({ short_bio: null });
    expect("short_bio" in out).toBe(true);
  });

  it("ignores a JSON __proto__ key", () => {
    const body = JSON.parse('{"name":"Maya","__proto__":{"review_status":"approved"}}');
    const out = pickWritable(body, ARTIST_PROFILE_WRITABLE);
    expect(out).toEqual({ name: "Maya" });
    expect(Object.prototype.hasOwnProperty.call(out, "__proto__")).toBe(false);
    // The prototype chain must not have been polluted into the result either.
    expect((out as Record<string, unknown>).review_status).toBeUndefined();
  });

  it("ignores inherited keys such as constructor", () => {
    const parent = { name: "inherited-name" };
    const child = Object.create(parent) as Record<string, unknown>;
    child.short_bio = "own";
    const out = pickWritable(child, ARTIST_PROFILE_WRITABLE);
    // `name` lives on the prototype, so it is not the caller's own field.
    expect(out).toEqual({ short_bio: "own" });
    expect(pickWritable({}, ARTIST_PROFILE_WRITABLE)).toEqual({});
  });

  it("returns an empty object for null, undefined, arrays and primitives", () => {
    for (const body of [null, undefined, [], ["name"], "name", 42, true]) {
      expect(pickWritable(body, ARTIST_PROFILE_WRITABLE)).toEqual({});
    }
  });

  it("works for every entity's allowlist", () => {
    expect(pickWritable({ name: "The Kettle", user_id: "x" }, VENUE_PROFILE_WRITABLE)).toEqual({
      name: "The Kettle",
    });
    expect(pickWritable({ title: "Study", artist_id: "x" }, ARTIST_WORK_WRITABLE)).toEqual({
      title: "Study",
    });
  });
});

describe("assertNoServerOwned", () => {
  it("passes a clean payload", () => {
    expect(() =>
      assertNoServerOwned({ name: "Maya" }, ARTIST_PROFILE_SERVER_OWNED, "artist_profiles"),
    ).not.toThrow();
  });

  it("throws and names every violating column", () => {
    let message = "";
    try {
      assertNoServerOwned(
        { name: "Maya", review_status: "approved", subscription_plan: "pro", user_id: "x" },
        ARTIST_PROFILE_SERVER_OWNED,
        "artist_profiles",
      );
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("artist_profiles");
    expect(message).toContain("review_status");
    expect(message).toContain("subscription_plan");
    expect(message).toContain("user_id");
    // It should point at the fix, not just complain.
    expect(message).toContain("pickWritable");
  });

  it("throws rather than stripping, so a wrong caller is loud", () => {
    const payload = { review_status: "approved" };
    expect(() =>
      assertNoServerOwned(payload, ARTIST_PROFILE_SERVER_OWNED, "artist_profiles"),
    ).toThrow();
    // The payload is untouched: this is an assertion, not a sanitiser.
    expect(payload.review_status).toBe("approved");
  });

  it("guards venue and work payloads too", () => {
    expect(() =>
      assertNoServerOwned({ slug: "x" }, VENUE_PROFILE_SERVER_OWNED, "venue_profiles"),
    ).toThrow(/slug/);
    expect(() =>
      assertNoServerOwned({ artist_id: "x" }, ARTIST_WORK_SERVER_OWNED, "artist_works"),
    ).toThrow(/artist_id/);
  });
});

describe("allowlist integrity", () => {
  it("never lists a column as both writable and server-owned", () => {
    const pairs: [readonly string[], readonly string[], string][] = [
      [ARTIST_PROFILE_WRITABLE, ARTIST_PROFILE_SERVER_OWNED, "artist_profiles"],
      [VENUE_PROFILE_WRITABLE, VENUE_PROFILE_SERVER_OWNED, "venue_profiles"],
      [ARTIST_WORK_WRITABLE, ARTIST_WORK_SERVER_OWNED, "artist_works"],
    ];
    for (const [writable, serverOwned, table] of pairs) {
      const overlap = writable.filter((c) => serverOwned.includes(c));
      expect(overlap, `${table} lists ${overlap.join(", ")} on both lists`).toEqual([]);
    }
  });

  it("is frozen, so a route cannot push onto an allowlist at runtime", () => {
    expect(Object.isFrozen(ARTIST_PROFILE_WRITABLE)).toBe(true);
    expect(Object.isFrozen(ARTIST_PROFILE_SERVER_OWNED)).toBe(true);
    expect(Object.isFrozen(VENUE_PROFILE_WRITABLE)).toBe(true);
    expect(Object.isFrozen(VENUE_PROFILE_SERVER_OWNED)).toBe(true);
    expect(Object.isFrozen(ARTIST_WORK_WRITABLE)).toBe(true);
    expect(Object.isFrozen(ARTIST_WORK_SERVER_OWNED)).toBe(true);
  });

  it("allowlists in_store_price now that migration 118 created it", () => {
    // INVERTED 2026-08-28 (owner decision 14). Same lifecycle as the two
    // shipping columns below: excluded while the column did not exist, because
    // allowlisting a phantom would let one stray field fail the whole save,
    // then admitted the moment the migration made it real.
    expect(ARTIST_WORK_WRITABLE).toContain("in_store_price");
  });

  it("allowlists the two shipping-scope columns that migration 081 created", () => {
    // These were on the list above until 2026-07-30 for the same reason as
    // in_store_price. Migration 081 created them, so the reason expired: the
    // artist portal's "Ships internationally" toggle needs them to persist, and
    // api/checkout reads the result to decide whether it can deliver abroad
    // (G-C / Bug 10). Both must reach the write for the toggle to mean anything.
    expect(ARTIST_PROFILE_WRITABLE).toContain("ships_internationally");
    expect(ARTIST_PROFILE_WRITABLE).toContain("international_shipping_price");
  });
});

// ── A5/A7: the per-call-site exemption ───────────────────────────────────────
//
// assertNoServerOwned originally refused every server-owned column outright,
// which made it unusable on three real call sites: the artist PUT derives lat/lng
// from the postcode, and the two creation paths choose the slug and the initial
// review_status. A guard that cannot be satisfied gets dropped, and a dropped
// guard is E23a all over again (a control that exists and does nothing).
//
// So an entitlement is declared per call and enforced inside the upsert function,
// where no caller can skip it.
describe("assertNoServerOwned allowServerOwned (A5/A7)", () => {
  it("still refuses a server-owned column that is not allowed", () => {
    expect(() =>
      assertNoServerOwned({ subscription_plan: "pro" }, ARTIST_PROFILE_SERVER_OWNED, "artist_profiles"),
    ).toThrow(/subscription_plan/);
  });

  it("permits exactly the columns named in the allowlist", () => {
    expect(() =>
      assertNoServerOwned(
        { lat: 51.5, lng: -0.1 },
        ARTIST_PROFILE_SERVER_OWNED,
        "artist_profiles",
        ["lat", "lng"],
      ),
    ).not.toThrow();
  });

  it("does NOT widen to the rest of the list when something is allowed", () => {
    // The important property: being entitled to set lat must not smuggle
    // subscription_plan through on the same call.
    expect(() =>
      assertNoServerOwned(
        { lat: 51.5, subscription_plan: "pro" },
        ARTIST_PROFILE_SERVER_OWNED,
        "artist_profiles",
        ["lat"],
      ),
    ).toThrow(/subscription_plan/);
  });

  it("names every violation, not just the first", () => {
    let msg = "";
    try {
      assertNoServerOwned(
        { subscription_plan: "pro", stripe_connect_account_id: "acct_x" },
        ARTIST_PROFILE_SERVER_OWNED,
        "artist_profiles",
      );
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/subscription_plan/);
    expect(msg).toMatch(/stripe_connect_account_id/);
  });

  it("tells the caller how to fix it, including the exemption route", () => {
    let msg = "";
    try {
      assertNoServerOwned({ slug: "squatted" }, VENUE_PROFILE_SERVER_OWNED, "venue_profiles");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/pickWritable/);
    expect(msg).toMatch(/allowServerOwned/);
  });

  it("an empty allowlist behaves exactly as the original blanket refusal", () => {
    expect(() =>
      assertNoServerOwned({ user_id: "someone-else" }, VENUE_PROFILE_SERVER_OWNED, "venue_profiles", []),
    ).toThrow(/user_id/);
  });
});
