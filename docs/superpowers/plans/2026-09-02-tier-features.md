# Tier Features: Featured Artist (Pro) and Artwork of the Week (Premium and Pro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two paid tiers deliver two distinct, visible perks: Pro artists lead the marketplace as Featured artists; Premium and Pro artists can push one artwork to the top of the gallery for seven days ("Artwork of the Week").

**Architecture:** One nullable column, `artist_works.featured_until`, is the whole data model: an artwork is "of the week" while that timestamp is in the future, so expiry needs no cron. A single server-owned endpoint sets it, gated on an active Premium or Pro subscription and one live boost per artist. The marketplace's existing "Featured" sort gains a first pass for live boosts and its artist-level weighting narrows from Pro + Premium to Pro only. Two pure helpers hold the rules so the API, the marketplace and the portal cannot disagree.

**Tech Stack:** Next.js (nonstandard, read `node_modules/next/dist/docs/` before route work), TypeScript, Supabase via `getSupabaseAdmin()`, Vitest + Testing Library.

## Owner decision this plan implements (2 September 2026)

- **Pro:** Featured artist (chip on the card, first in the marketplace sort, the only tier the `?featured=1` filter returns) **and** Artwork of the Week.
- **Premium:** Artwork of the Week **only**. Premium loses the Featured chip and its second-place weighting in the sort.
- **Core:** neither.

Defaults taken where the instruction was silent (say if you want them different): a boost lasts **7 days**; an artist can have **one live boost at a time** and can boost again the moment it ends; a boost cannot be cancelled early; boosts show only in the works ("gallery") view of `/browse`, not on the homepage.

## What exists today (verified)

- "Featured" is real for **both** Pro and Premium: `BrowseArtistCard.tsx` shows a Featured chip for either plan, the `/browse` "Featured" sort weights Pro first then Premium, and `?featured=1` returns both. The Premium pricing card promises "Featured artist profile and badge".
- "Artwork of the Week" does not exist anywhere: no column, no endpoint, no control.
- Two other Premium and Pro card promises have no mechanic behind them: "Priority visibility in venue recommendations" (Premium) and "Premium profile with enhanced presentation" (Pro). This plan replaces the Premium line with the boost; the Pro line is flagged in Task 6 for the owner to keep or drop.

## Global Constraints

- Work from `website/`. `npm run check` before every commit. Stage by path; never push. Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- Public copy: British English, no em or en dashes, no `&mdash;`/`&ndash;`.
- The migration must be applied to production (Supabase MCP, project `uwkuhygwvasdzwsusiym`) and `tests/integration/schema-columns.json` regenerated **before** `phantom-columns.test.ts` and `phantom-write-columns.test.ts` can pass. Never edit the snapshot by hand or grandfather a column. Task 1 says exactly when.
- `featured_until` is server-owned: it goes in `ARTIST_WORK_SERVER_OWNED`, never in `ARTIST_WORK_WRITABLE`, so the portal's ordinary save cannot set it.
- No `Date.now()` inside pure rules; pass `now` in (the codebase's convention from `programme-rent.ts`).

---

### Task 1: The column, the row type, and the transform

**Files:**
- Create: `supabase/migrations/133_artist_works_featured_until.sql`
- Modify: `src/lib/db/artist-profiles-transform.ts` (`DbArtistWork` at line 66; the work mapping at ~line 220)
- Modify: `src/data/artists.ts` (`ArtistWork`, next to `createdAt?: string` at line 69)
- Modify: `src/data/galleries.ts` (type at ~line 35; flatten at ~line 76)
- Modify: `src/lib/db/writable-fields.ts` (`ARTIST_WORK_SERVER_OWNED` at line 237)
- Modify: `tests/integration/schema-columns.json` (regenerated, not edited)

**Interfaces:**
- Produces: `DbArtistWork.featured_until?: string | null`; `ArtistWork.featuredUntil?: string`; gallery work `featuredUntil?: string`.

- [ ] **Step 1: Write the migration**

```sql
-- 133: artist_works.featured_until, the "Artwork of the Week" boost.
--
-- Owner decision 2026-09-02: Premium and Pro artists can push one artwork to
-- the top of the /browse gallery for seven days. The whole model is this one
-- timestamp: a work is "of the week" while featured_until is in the future,
-- so expiry is a comparison, not a cron. Written only by
-- POST /api/artist-works/[id]/feature (server-owned in writable-fields.ts);
-- the portal's ordinary save cannot touch it.

ALTER TABLE artist_works
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ;

COMMENT ON COLUMN artist_works.featured_until IS
  'Artwork of the Week: the work sorts first in the /browse gallery while this is in the future. Set by POST /api/artist-works/[id]/feature for Premium and Pro artists, one live boost per artist. NULL means never boosted or boost expired and cleared.';

CREATE INDEX IF NOT EXISTS artist_works_featured_until_idx
  ON artist_works (featured_until)
  WHERE featured_until IS NOT NULL;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Types and transform**

`src/lib/db/artist-profiles-transform.ts`, in `DbArtistWork` after `created_at?: string;`:

```ts
  /** Migration 133: Artwork of the Week. ISO timestamptz; the work is
   *  boosted while this is in the future. */
  featured_until?: string | null;
```

and in the work mapping after `createdAt: w.created_at ?? undefined,`:

```ts
      featuredUntil: w.featured_until ?? undefined,
```

`src/data/artists.ts`, in `ArtistWork` after `createdAt?: string;`:

```ts
  /** Artwork of the Week: ISO timestamp; boosted while in the future. */
  featuredUntil?: string;
```

`src/data/galleries.ts`: in the flattened type after `artistIsFounding?: boolean;` add `featuredUntil?: string;` and in the flatten after `artistIsFounding: artist.isFoundingArtist,` add `featuredUntil: work.featuredUntil,`.

`src/lib/db/writable-fields.ts`, in `ARTIST_WORK_SERVER_OWNED` after `"mockups", // written by the visualizer API`:

```ts
  "featured_until", // Artwork of the Week, written only by /api/artist-works/[id]/feature
```

- [ ] **Step 3: Typecheck, then apply the migration and refresh the snapshot**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run tests/integration/phantom-columns.test.ts tests/integration/phantom-write-columns.test.ts`
Expected: they may already pass (nothing selects the column by name yet). If they fail naming `featured_until`, that is the expected state until the migration is applied.

Apply `133_artist_works_featured_until.sql` to production through the Supabase MCP (`apply_migration`, name `133_artist_works_featured_until`), then regenerate the snapshot by adding `featured_until` to `artist_works` through the real serialiser, exactly as was done for 130 to 132:

```ts
// scripts/_regen133.ts (delete after running)
import fs from "node:fs";
import { serialize, toSnapshot, type Snapshot } from "./schema-snapshot.lib";
const FILE = "tests/integration/schema-columns.json";
const cur = toSnapshot(JSON.parse(fs.readFileSync(FILE, "utf8")));
if (cur.artist_works.includes("featured_until")) throw new Error("already present");
const out: Snapshot = {};
for (const [k, v] of Object.entries(cur)) out[k] = k === "artist_works" ? [...v, "featured_until"] : v;
fs.writeFileSync(FILE, serialize(out));
```

Run: `npx tsx scripts/_regen133.ts && rm scripts/_regen133.ts && git diff --stat tests/integration/schema-columns.json`
Expected: exactly one line added.

- [ ] **Step 4: Gate and commit**

Run: `npm run check`

```bash
git add supabase/migrations/133_artist_works_featured_until.sql src/lib/db/artist-profiles-transform.ts src/data/artists.ts src/data/galleries.ts src/lib/db/writable-fields.ts tests/integration/schema-columns.json
git commit -m "feat(works): featured_until column for Artwork of the Week

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The rules, in one place

**Files:**
- Create: `src/lib/tier-features.ts`, `src/lib/tier-features.test.ts`

**Interfaces:**
- Produces: `ARTWORK_OF_THE_WEEK_DAYS = 7`; `isFeaturedArtistPlan(plan?: string | null): boolean` (Pro only); `canFeatureArtwork(plan?: string | null): boolean` (Premium or Pro); `isArtworkOfTheWeek(featuredUntil: string | null | undefined, now: Date): boolean`; `featuredUntilFrom(now: Date): Date`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  ARTWORK_OF_THE_WEEK_DAYS,
  canFeatureArtwork,
  featuredUntilFrom,
  isArtworkOfTheWeek,
  isFeaturedArtistPlan,
} from "./tier-features";

// Owner decision 2026-09-02: Pro is the Featured artist tier; Premium and
// Pro can boost one artwork for a week; Core gets neither.
describe("tier features", () => {
  it("only Pro is a Featured artist", () => {
    expect(isFeaturedArtistPlan("pro")).toBe(true);
    expect(isFeaturedArtistPlan("PRO")).toBe(true);
    expect(isFeaturedArtistPlan("premium")).toBe(false);
    expect(isFeaturedArtistPlan("core")).toBe(false);
    expect(isFeaturedArtistPlan(null)).toBe(false);
  });

  it("Premium and Pro can feature an artwork, Core cannot", () => {
    expect(canFeatureArtwork("premium")).toBe(true);
    expect(canFeatureArtwork("pro")).toBe(true);
    expect(canFeatureArtwork("core")).toBe(false);
    expect(canFeatureArtwork(undefined)).toBe(false);
  });

  it("a work is of the week only while featured_until is in the future", () => {
    const now = new Date("2026-09-02T12:00:00Z");
    expect(isArtworkOfTheWeek("2026-09-09T12:00:00Z", now)).toBe(true);
    expect(isArtworkOfTheWeek("2026-09-02T11:59:59Z", now)).toBe(false);
    expect(isArtworkOfTheWeek(null, now)).toBe(false);
    expect(isArtworkOfTheWeek("not a date", now)).toBe(false);
  });

  it("a boost lasts seven days from now", () => {
    expect(ARTWORK_OF_THE_WEEK_DAYS).toBe(7);
    const now = new Date("2026-09-02T12:00:00Z");
    expect(featuredUntilFrom(now).toISOString()).toBe("2026-09-09T12:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run src/lib/tier-features.test.ts`

- [ ] **Step 3: Implement**

```ts
/**
 * Tier perks, owner decision 2026-09-02.
 *
 *   Pro:      Featured artist (chip, first in the marketplace sort, the only
 *             tier ?featured=1 returns) AND Artwork of the Week.
 *   Premium:  Artwork of the Week only.
 *   Core:     neither.
 *
 * The API, the marketplace sort and the portal all read these so they cannot
 * drift. Pure: `now` is passed in.
 */
export const ARTWORK_OF_THE_WEEK_DAYS = 7;

function norm(plan?: string | null): string {
  return (plan || "").toLowerCase();
}

export function isFeaturedArtistPlan(plan?: string | null): boolean {
  return norm(plan) === "pro";
}

export function canFeatureArtwork(plan?: string | null): boolean {
  const p = norm(plan);
  return p === "pro" || p === "premium";
}

export function isArtworkOfTheWeek(featuredUntil: string | null | undefined, now: Date): boolean {
  if (!featuredUntil) return false;
  const t = Date.parse(featuredUntil);
  return Number.isFinite(t) && t > now.getTime();
}

export function featuredUntilFrom(now: Date): Date {
  return new Date(now.getTime() + ARTWORK_OF_THE_WEEK_DAYS * 24 * 60 * 60 * 1000);
}
```

- [ ] **Step 4: Run, commit**

Run: `npx vitest run src/lib/tier-features.test.ts && npm run check`

```bash
git add src/lib/tier-features.ts src/lib/tier-features.test.ts
git commit -m "feat(tiers): one source for Featured artist and Artwork of the Week rules

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `POST /api/artist-works/[id]/feature`

**Files:**
- Create: `src/app/api/artist-works/[id]/feature/route.ts`, `src/app/api/artist-works/[id]/feature/route.test.ts`

Read `node_modules/next/dist/docs/` on route handlers and the `params` promise shape before writing this; mirror the existing `src/app/api/artist-works/route.ts` for auth.

**Interfaces:**
- Consumes: `getAuthenticatedUser`, `getArtistProfileByUserId`, `resolveSubscription` (`{ active, plan, user_type }`), Task 2 helpers.
- Produces: `POST` returns `200 { featuredUntil: string }`; `403 { code: "plan_required" }` when the plan is Core or the subscription is not active; `404` when the work is not the caller's; `409 { code: "boost_live", workId, featuredUntil }` when another of the caller's works is still boosted.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, getProfileMock, resolveSubscriptionMock, rows } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getProfileMock: vi.fn(),
  resolveSubscriptionMock: vi.fn(),
  rows: [] as Array<{ id: string; artist_id: string; featured_until: string | null }>,
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/db/artist-profiles", () => ({ getArtistProfileByUserId: getProfileMock }));
vi.mock("@/lib/subscriptions", () => ({ resolveSubscription: resolveSubscriptionMock }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const filters: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => { filters[col] = val; return q; },
        update: (patch: Record<string, unknown>) => {
          const upd = {
            eq: (col: string, val: unknown) => { filters[col] = val; return upd; },
            select: () => upd,
            maybeSingle: async () => {
              const row = rows.find((r) => r.id === filters.id && r.artist_id === filters.artist_id);
              if (!row) return { data: null, error: null };
              Object.assign(row, patch);
              return { data: row, error: null };
            },
          };
          return upd;
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            data: rows.filter((r) => r.artist_id === filters.artist_id),
            error: null,
          }).then(resolve),
      };
      return q;
    },
  }),
}));

import { POST } from "./route";

const NOW = new Date("2026-09-02T12:00:00Z");

function call(id: string) {
  return POST(new Request(`http://localhost/api/artist-works/${id}/feature`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  rows.length = 0;
  rows.push(
    { id: "w1", artist_id: "ap1", featured_until: null },
    { id: "w2", artist_id: "ap1", featured_until: null },
    { id: "w9", artist_id: "ap9", featured_until: null },
  );
  authMock.mockResolvedValue({ user: { id: "u1" } });
  getProfileMock.mockResolvedValue({ profile: { id: "ap1", subscription_plan: "premium" }, works: [] });
  resolveSubscriptionMock.mockResolvedValue({ active: true, plan: "premium", user_type: "artist" });
});

describe("POST /api/artist-works/[id]/feature", () => {
  it("boosts the caller's own work for seven days", async () => {
    const res = await call("w1");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.featuredUntil).toBe("2026-09-09T12:00:00.000Z");
    expect(rows[0].featured_until).toBe("2026-09-09T12:00:00.000Z");
  });

  it("refuses Core, and any inactive subscription", async () => {
    resolveSubscriptionMock.mockResolvedValueOnce({ active: true, plan: "core", user_type: "artist" });
    expect((await call("w1")).status).toBe(403);
    resolveSubscriptionMock.mockResolvedValueOnce({ active: false, plan: "pro", user_type: "artist" });
    expect((await call("w1")).status).toBe(403);
  });

  it("allows one live boost per artist", async () => {
    rows[1].featured_until = "2026-09-05T12:00:00.000Z";
    const res = await call("w1");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "boost_live", workId: "w2" });
  });

  it("lets an expired boost be replaced", async () => {
    rows[1].featured_until = "2026-09-01T12:00:00.000Z";
    expect((await call("w1")).status).toBe(200);
  });

  it("404s on someone else's work", async () => {
    expect((await call("w9")).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run "src/app/api/artist-works/[id]/feature/route.test.ts"`

- [ ] **Step 3: Implement the route**

```ts
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getArtistProfileByUserId } from "@/lib/db/artist-profiles";
import { resolveSubscription } from "@/lib/subscriptions";
import { canFeatureArtwork, featuredUntilFrom, isArtworkOfTheWeek } from "@/lib/tier-features";

/**
 * POST /api/artist-works/[id]/feature
 *
 * Artwork of the Week (owner decision 2026-09-02). Premium and Pro artists
 * push one of their own works to the top of the /browse gallery for seven
 * days. One live boost per artist; a boost cannot be ended early, but an
 * expired one can be replaced at once. `featured_until` is server-owned:
 * this is the only writer.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const { id } = await params;

  const result = await getArtistProfileByUserId(auth.user!.id);
  if (!result) return NextResponse.json({ error: "Artist profile not found" }, { status: 404 });

  const sub = await resolveSubscription(auth.user!.id);
  if (!sub.active || !canFeatureArtwork(sub.plan)) {
    return NextResponse.json(
      { error: "Artwork of the Week is included with Premium and Pro.", code: "plan_required" },
      { status: 403 },
    );
  }

  const db = getSupabaseAdmin();
  const now = new Date();

  // One live boost per artist. Ownership is enforced by artist_id in every
  // query below (service-role client bypasses RLS).
  const { data: mine, error: listErr } = await db
    .from("artist_works")
    .select("id, featured_until")
    .eq("artist_id", result.profile.id);
  if (listErr) return NextResponse.json({ error: "Could not read your works" }, { status: 500 });
  const live = (mine || []).find(
    (w: { id: string; featured_until: string | null }) => w.id !== id && isArtworkOfTheWeek(w.featured_until, now),
  );
  if (live) {
    return NextResponse.json(
      { error: "You already have an Artwork of the Week running.", code: "boost_live", workId: live.id, featuredUntil: live.featured_until },
      { status: 409 },
    );
  }

  const featuredUntil = featuredUntilFrom(now).toISOString();
  const { data: updated, error } = await db
    .from("artist_works")
    .update({ featured_until: featuredUntil })
    .eq("id", id)
    .eq("artist_id", result.profile.id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not feature this work" }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Work not found" }, { status: 404 });

  return NextResponse.json({ featuredUntil });
}
```

- [ ] **Step 4: Run, gate, commit**

Run: `npx vitest run "src/app/api/artist-works/[id]/feature/route.test.ts" tests/integration && npm run check`
Expected: PASS. If `authz-import-ratchet` or `eslint-require-authz-on-mutation` flags the new route, it authorises by self-scoping on `artist_id` (the same pattern the ratchet describes as acceptable); add it to that test's allowlist with the reason `self-scoped on artist_id`, never by disabling the rule.

```bash
git add "src/app/api/artist-works/[id]/feature/route.ts" "src/app/api/artist-works/[id]/feature/route.test.ts"
git commit -m "feat(works): Artwork of the Week endpoint for Premium and Pro

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The marketplace: Featured is Pro only; boosted works lead the gallery

**Files:**
- Modify: `src/components/BrowseArtistCard.tsx` (chip at ~line 116)
- Create: `src/components/BrowseArtistCard.test.tsx`
- Modify: `src/app/(pages)/browse/page.tsx` (`?featured=1` filter at ~979; artist sort `tierWeight` at ~995; works sort `tierWeight` at ~1127; works card chip slot at ~2489)
- Create: `src/lib/marketplace-featured-sort.ts`, `src/lib/marketplace-featured-sort.test.ts`

**Interfaces:**
- Produces: `artistTierWeight(plan): 0 | 1` (Pro 0, everyone else 1) and `workFeaturedWeight(work, now): 0 | 1 | 2` (live boost 0, Pro artist's work 1, else 2) so the two inline comparators read one rule.

- [ ] **Step 1: Write the failing tests**

`src/lib/marketplace-featured-sort.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { artistTierWeight, workFeaturedWeight } from "./marketplace-featured-sort";

const now = new Date("2026-09-02T12:00:00Z");

describe("marketplace Featured ordering (owner decision 2026-09-02)", () => {
  it("only Pro artists are weighted first; Premium is no longer second", () => {
    expect(artistTierWeight("pro")).toBe(0);
    expect(artistTierWeight("premium")).toBe(1);
    expect(artistTierWeight("core")).toBe(1);
  });

  it("a live Artwork of the Week beats everything, then Pro works, then the rest", () => {
    expect(workFeaturedWeight({ featuredUntil: "2026-09-09T00:00:00Z", artistSubscriptionPlan: "core" }, now)).toBe(0);
    expect(workFeaturedWeight({ featuredUntil: "2026-09-01T00:00:00Z", artistSubscriptionPlan: "pro" }, now)).toBe(1);
    expect(workFeaturedWeight({ artistSubscriptionPlan: "premium" }, now)).toBe(2);
  });
});
```

`src/components/BrowseArtistCard.test.tsx` (mirror the mocks the browse page test uses for `next/link`, `next/image` and `SaveButton`; render one card per plan):

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/SaveButton", () => ({ default: () => null }));

import BrowseArtistCard from "./BrowseArtistCard";

afterEach(cleanup);

function artist(plan: string) {
  return {
    slug: `a-${plan}`, name: `Artist ${plan}`, image: "", location: "London", primaryMedium: "Oil",
    styleTags: [], works: [], subscriptionPlan: plan,
  };
}

describe("<BrowseArtistCard /> Featured chip", () => {
  it("shows Featured for Pro only", () => {
    render(<BrowseArtistCard artist={artist("pro") as never} />);
    expect(screen.getByText("Featured")).toBeTruthy();
    cleanup();
    render(<BrowseArtistCard artist={artist("premium") as never} />);
    expect(screen.queryByText("Featured")).toBeNull();
  });
});
```

If `BrowseArtistCard` takes props other than `artist`, pass the minimal extra props its type requires; the assertion is the chip.

- [ ] **Step 2: Run them, expect failure**

Run: `npx vitest run src/lib/marketplace-featured-sort.test.ts src/components/BrowseArtistCard.test.tsx`

- [ ] **Step 3: Implement the rule module**

```ts
import { isArtworkOfTheWeek, isFeaturedArtistPlan } from "./tier-features";

/** Pro first, everyone else after (owner decision 2026-09-02: Premium is no longer second). */
export function artistTierWeight(plan?: string | null): 0 | 1 {
  return isFeaturedArtistPlan(plan) ? 0 : 1;
}

/** Live Artwork of the Week first, then a Pro artist's work, then the rest. */
export function workFeaturedWeight(
  work: { featuredUntil?: string | null; artistSubscriptionPlan?: string | null },
  now: Date,
): 0 | 1 | 2 {
  if (isArtworkOfTheWeek(work.featuredUntil, now)) return 0;
  return isFeaturedArtistPlan(work.artistSubscriptionPlan) ? 1 : 2;
}
```

- [ ] **Step 4: Wire the marketplace**

`src/components/BrowseArtistCard.tsx`: import `isFeaturedArtistPlan` from `@/lib/tier-features`; the chip condition becomes `{isFeaturedArtistPlan(artist.subscriptionPlan) && (`; the inner class ternary collapses to the Pro fill (`bg-accent/95 text-white`); update the comment to say Pro only, owner decision 2026-09-02.

`src/app/(pages)/browse/page.tsx`: import `{ artistTierWeight, workFeaturedWeight }` from `@/lib/marketplace-featured-sort` and `{ isFeaturedArtistPlan, isArtworkOfTheWeek }` from `@/lib/tier-features`.

The `?featured=1` filter becomes:

```ts
      if (featuredFilter && !isFeaturedArtistPlan(artist.subscriptionPlan)) {
        return false;
      }
```

The artist comparator's inline `tierWeight` is deleted; use:

```ts
      const wa = artistTierWeight(a.subscriptionPlan);
      const wb = artistTierWeight(b.subscriptionPlan);
      if (wa !== wb) return wa - wb;
```

The works comparator's inline `tierWeight` is deleted; use (with `const now = new Date();` computed once at the top of that `useMemo`):

```ts
      const wa = workFeaturedWeight(a, now);
      const wb = workFeaturedWeight(b, now);
      if (wa !== wb) return wa - wb;
```

In the works card, directly after the `<div className="absolute top-3 left-3 z-10 ...">` that holds `<SaveButton type="work" .../>`, add:

```tsx
                            {isArtworkOfTheWeek(work.featuredUntil, now) && (
                              <span className="absolute top-3 left-12 z-10 inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white shadow-sm pointer-events-none">
                                Artwork of the week
                              </span>
                            )}
```

(`now` here is the same `useMemo` value; if the card renders outside that memo, compute `const now = new Date();` once in the component body.)

- [ ] **Step 5: Run, gate, commit**

Run: `npx vitest run src/lib/marketplace-featured-sort.test.ts src/components/BrowseArtistCard.test.tsx "src/app/(pages)/browse" && npx tsc --noEmit && npm run check`

```bash
git add src/components/BrowseArtistCard.tsx src/components/BrowseArtistCard.test.tsx "src/app/(pages)/browse/page.tsx" src/lib/marketplace-featured-sort.ts src/lib/marketplace-featured-sort.test.ts
git commit -m "feat(browse): Featured is Pro only; Artwork of the Week leads the gallery

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The portal control

**Files:**
- Modify: `src/app/(pages)/artist-portal/portfolio/page.tsx` (hover actions at ~line 3240, between Edit and Duplicate)
- Modify: `src/app/(pages)/artist-portal/portfolio/page.test.tsx`

The page already has `artist` from `useCurrentArtist()` (the transformed `Artist`, so `artist.subscriptionPlan` is available), `authFetch`, `showToast`, and `works` state with `featuredUntil` after Task 1.

- [ ] **Step 1: Write the failing test**

Append to `page.test.tsx`, reusing its mocks (`useCurrentArtist` is mocked there; set `subscriptionPlan` on the mocked artist for each case):

```tsx
describe("Artwork of the Week control (owner decision 2 September)", () => {
  it("offers Feature for a week to a Premium artist and posts to the feature endpoint", async () => {
    useCurrentArtistMock.mockReturnValue({ artist: { ...baseArtist, subscriptionPlan: "premium", works: [baseWork] }, loading: false });
    authFetchMock.mockImplementation((url: string) =>
      url.endsWith("/feature")
        ? Promise.resolve({ ok: true, json: async () => ({ featuredUntil: "2026-09-09T12:00:00.000Z" }) })
        : Promise.resolve({ ok: true, json: async () => ({ profile: {} }) }),
    );
    render(<PortfolioPage />);
    fireEvent.mouseEnter(await screen.findByText(baseWork.title));
    fireEvent.click(screen.getByRole("button", { name: /feature for a week/i }));
    await waitFor(() => expect(authFetchMock).toHaveBeenCalledWith(`/api/artist-works/${baseWork.id}/feature`, expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText(/featured until/i)).toBeTruthy();
  });

  it("tells a Core artist it is a Premium and Pro perk", async () => {
    useCurrentArtistMock.mockReturnValue({ artist: { ...baseArtist, subscriptionPlan: "core", works: [baseWork] }, loading: false });
    render(<PortfolioPage />);
    fireEvent.mouseEnter(await screen.findByText(baseWork.title));
    const btn = screen.getByRole("button", { name: /feature for a week/i });
    expect(btn.getAttribute("title")).toMatch(/premium and pro/i);
    expect(btn.hasAttribute("disabled")).toBe(true);
  });
});
```

`baseArtist`, `baseWork`, `useCurrentArtistMock` and `authFetchMock` are whatever that file already names its fixtures and mocks; use those names. If hover is driven by `onMouseEnter` on the card wrapper rather than the title, fire it on the wrapper.

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run "src/app/(pages)/artist-portal/portfolio/page.test.tsx"`

- [ ] **Step 3: Add the control**

Import `{ canFeatureArtwork, isArtworkOfTheWeek } from "@/lib/tier-features"`. Inside the component add:

```tsx
  const canFeature = canFeatureArtwork(artist?.subscriptionPlan);

  async function featureWork(index: number) {
    const w = works[index];
    if (!w || !canFeature) return;
    try {
      const res = await authFetch(`/api/artist-works/${encodeURIComponent(w.id)}/feature`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || "Could not feature this work");
        return;
      }
      setWorks((prev) => prev.map((x, i) => (i === index ? { ...x, featuredUntil: json.featuredUntil } : x)));
      showToast("Featured at the top of the gallery for seven days");
    } catch {
      showToast("Could not feature this work");
    }
  }
```

In the hover actions, between the Edit and Duplicate buttons:

```tsx
                        <button
                          onClick={() => featureWork(index)}
                          disabled={!canFeature || isArtworkOfTheWeek(work.featuredUntil, new Date())}
                          title={
                            !canFeature
                              ? "Artwork of the Week is included with Premium and Pro"
                              : isArtworkOfTheWeek(work.featuredUntil, new Date())
                                ? "Already featured"
                                : "Put this work at the top of the gallery for seven days"
                          }
                          className="text-xs font-medium bg-blue-600 text-white px-4 py-1.5 rounded-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Feature for a week
                        </button>
```

On the card itself (near the existing status indicators above the hover layer), show the state when live:

```tsx
                    {isArtworkOfTheWeek(work.featuredUntil, new Date()) && (
                      <span className="absolute top-2 left-2 z-10 inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white">
                        Featured until {new Date(work.featuredUntil as string).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    )}
```

(`work` is the map variable the card already uses; if the card iterates as `w`, use that.)

- [ ] **Step 4: Run, gate, commit**

Run: `npx vitest run "src/app/(pages)/artist-portal/portfolio/page.test.tsx" && npx tsc --noEmit && npm run check`

```bash
git add "src/app/(pages)/artist-portal/portfolio/page.tsx" "src/app/(pages)/artist-portal/portfolio/page.test.tsx"
git commit -m "feat(portal): Feature for a week control for Premium and Pro artists

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The pricing cards say what each tier now does

**Files:**
- Modify: `src/components/ArtistPricingCards.tsx` (Premium features at ~line 48; Pro features at ~line 61)
- Modify: `tests/integration/public-claims.test.ts` (from the launch plan; create it with the same `read` helper if that plan has not run yet)

- [ ] **Step 1: Write the failing test**

Append inside the `describe` in `tests/integration/public-claims.test.ts`:

```ts
  it("the pricing cards match the tier perks (Pro is Featured; Premium and Pro get Artwork of the Week)", () => {
    const cards = read("src/components/ArtistPricingCards.tsx");
    expect(cards).not.toMatch(/Featured artist profile and badge/);
    expect((cards.match(/Artwork of the Week/g) || []).length).toBe(2);
    expect(cards).toMatch(/Featured artist: your profile leads the marketplace/);
  });
```

- [ ] **Step 2: Run it, expect failure, then change the copy**

Premium `features`: replace `"Featured artist profile and badge",` with

```ts
      "Artwork of the Week: put one work at the top of the gallery for seven days",
```

Pro `features`: replace `"Premium profile with enhanced presentation",` with

```ts
      "Featured artist: your profile leads the marketplace",
      "Artwork of the Week: put one work at the top of the gallery for seven days",
```

Owner note: "Priority visibility in venue recommendations" (Premium) has no mechanic behind it today. Left in place; say if you want it removed or built.

- [ ] **Step 3: Run, gate, commit**

Run: `npx vitest run tests/integration/public-claims.test.ts && npm run check`

```bash
git add src/components/ArtistPricingCards.tsx tests/integration/public-claims.test.ts
git commit -m "feat(pricing): cards describe Featured (Pro) and Artwork of the Week (Premium and Pro)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Sequencing with the launch plan

Runs after Wave 2 of `2026-09-02-launch-readiness.md` (Task 6 there touches the same pricing page), before Wave 3. Task 1 here is the only migration in either plan.
