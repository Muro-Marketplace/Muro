# Wallplace Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the site from the 2 September audit's 46/100 to launch-ready: nothing fabricated or unverifiable visible in production, Programmes sold as the main product, every artist-facing claim consistent with the agreement, and the owner's manual actions kept in their own list.

**Architecture:** Code and copy only, zero migrations. One new feature flag (`SEED_CATALOG`) can remove the fictional catalogue from every surface with one env var; under decision D1 it stays on in production for now, and the only visible change to a seed artist is a blue "Sample" pill. A handful of exported constants and helpers in `src/lib/pricing.ts` and `src/lib/curation-tiers.ts` become the single source for the founding offer, the rent share and the rotation cadence, so marketing pages derive figures rather than retype them. Source-scan tests pin every claim fixed here so it cannot creep back.

**Tech Stack:** Next.js (nonstandard build, read `node_modules/next/dist/docs/` before touching a route), React client components, TypeScript, Vitest + Testing Library (jsdom), Supabase via `getSupabaseAdmin()`. Stripe is not touched.

## Global Constraints

- Work from `website/`. Run `npm run check` before every commit. The gate is green at 3,909 tests at plan time, so any failure is yours.
- Public copy: British English, no em dashes, no en dashes, no `&mdash;` / `&ndash;`, never "program". This applies to every string a visitor can read, including data files that render.
- Money and offer figures derive from constants: `src/lib/pricing.ts` (plans, founding cohort) and `src/lib/curation-tiers.ts` (curated, programme, rent). Never retype a pound figure a constant already holds. `tests/integration/one-curated-price-source.test.ts` enforces this for `curated-tiers.ts` and `CuratedClient.tsx`.
- Never edit `tests/integration/schema-columns.json` or any grandfather list. This plan needs no migration. If you think a task does, stop and say so.
- Stage by path, never `git add -A`. Never push. Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- Photography under `/images/programmes/` is allowed only on `/curated` and `/programmes` unless decision D2 says otherwise (`tests/integration/programmes-photography-scope.test.ts` enforces it).
- Check before changing (AGENTS.md rule): if a step's target already matches, skip it and say so in your report.

---

## Part A: Owner actions (manual, kept separate)

None of these are code. Each says what it unblocks.

- **A1. Incorporate.** Both agreements and the terms page open with "in the process of being incorporated". Two reviewers rated it critical: artists hand over card details and workplaces sign a twelve-month contract with an entity that has no company number. When it's done, give me the legal name, company number and registered office. Task 13 ships the switch in advance, so filling three constants in `src/lib/company.ts` is all that remains.
- **A2. Supabase Auth Site URL.** Still `localhost` in production (memory, 31 August). Every invite and password reset in prod is dead until it's set to the production domain in the Supabase dashboard under Authentication, URL Configuration.
- **A3. Stripe live webhook endpoint.** The webhook route handles 17 events and none are registered in live mode. Add an endpoint for `https://<prod-domain>/api/webhooks/stripe` subscribed to: `account.updated`, `charge.dispute.closed`, `charge.dispute.created`, `charge.refunded`, `checkout.session.async_payment_failed`, `checkout.session.async_payment_succeeded`, `checkout.session.completed`, `customer.source.expiring`, `customer.subscription.created`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `customer.subscription.updated`, `invoice.paid`, `invoice.payment_failed`, `payout.failed`, `payout.paid`, `transfer.reversed`. Then set the signing secret in Vercel as `STRIPE_WEBHOOK_SECRET`. Without this, programme rent never accrues and refunds are never voided.
- **A4. Regenerate the QR image.** `public/images/programmes/venues-qr-scan.webp` shows a generated photograph hanging above the QR code, which contradicts the "No AI art" badge. Prompt for ChatGPT: "Editorial photograph, warm muted colour grade, a cafe customer's hands holding a phone and scanning a small printed QR card mounted on a bare limewashed wall beside an empty picture hook; no artwork, no framed picture, no faces; shallow depth of field; 3:2." Save over the same filename, same dimensions. No code change.
- **A5. Photograph one real installation.** One named venue, one real quote with a name and role, permission to use both. The reviewer's exact words: this substitutes for a dozen findings. Task 14 ships the slot; when you have the photo, drop it at `public/images/programmes/case-study-1.webp` and fill the four fields.
- **A6. Confirm the installer arrangement.** Programmes includes installation. Confirm who installs and that they carry public liability insurance. Task 11 uses wording that is true today ("we appoint the installer, insurance details on request"); once cover is confirmed, upgrade the FAQ to say damage during a Wallplace-arranged install is claimed against the installer's policy.
- **A7. Decide the decisions in Part B.** Each has a default I'll take if you say nothing.
- **A8. Push and deploy.** After Wave 1 is green I'll ask; I won't push without a yes.

Nothing needs setting in Vercel for the seed flag while D1 stands. When you want the seed gone, set `NEXT_PUBLIC_FLAG_SEED_CATALOG=0` in Vercel and redeploy; nothing else changes.

---

## Part B: Decisions (defaults apply if you say nothing)

- **D1. Seed catalogue in production. Decided 2 September: keep it visible, change nothing about the seed artists except a blue "Sample" pill.** The flag ships on in production and one env var (`NEXT_PUBLIC_FLAG_SEED_CATALOG=0`) hides the seed later. Task 2 is the pill. The Verified tick, the invented credentials in the bios, and the buy, message and placement controls on seed profiles all stay as they are; the two fixes for those are held back at the end of this plan and slot in on request. Costs that stay while this stands: the bios name real art schools and galleries as credentials; a "Verified" tooltip sits beside the "Sample" pill; a venue's placement request to a seed artist is accepted and never answered; seed works reach the checkout before being refused; the seed works' images are Picsum placeholders that contradict their titles; the 21 seed venues on `/spaces` cannot be messaged (the API refuses unknown venues with an error).
- **D2. Commissioned photography beyond /curated and /programmes.** Default: no, because you reverted homepage imagery before. Task 9 fixes the fabricated captions on `/venues` without new images; Task 9b and Task 15 are the versions that use the commissioned set, if you want them.
- **D3. Curated pay-first.** Single Wall (£49) and Full Space (£149) charge before a curator reads the brief; Bespoke does not. The reviewer called it backwards. Default: leave it, it's already refundable in full if nothing fits. If you want enquire-first for all three, say so and I'll plan the checkout change separately (it touches billing).
- **D4. Programme notice period after the first twelve months.** Default: 30 days, matching everything else on the site. Task 11 writes it into the Programmes FAQ.

---

## Part C: Tasks

Order matters within a wave. Waves 1 and 2 are the launch-critical set.

### Wave 1: blockers

### Task 1: `SEED_CATALOG` flag gating every seed surface (on in production for now, decision D1)

**Files:**
- Modify: `src/lib/feature-flags.ts`
- Modify: `src/lib/feature-flags.test.ts`
- Modify: `src/lib/db/merged-data.ts`
- Create: `src/lib/db/merged-data.test.ts`
- Modify: `src/app/sitemap.ts`, `src/app/sitemap.test.ts`
- Modify: `src/app/api/venues/demand/route.ts` (the seed venues are fictional too; the demand tracker follows the same flag)
- Create: `src/app/api/venues/demand/route.test.ts`
- Modify: `src/app/(pages)/browse/page.tsx` (initial state, around line 459)
- Modify: `src/app/(pages)/browse/[slug]/page.tsx` (the `generateStaticParams` returning `artists.map(...)` near line 27) and `src/app/(pages)/browse/[slug]/[workSlug]/page.tsx` (the one returning `artists.flatMap(...)` near line 14)

**Interfaces:**
- Produces: `FeatureFlag` gains `"SEED_CATALOG"`; `isFlagOn("SEED_CATALOG")` is the only question any surface asks. Seed artists returned by `getAllArtists()` / `getArtistBySlug()` carry `isSeedArtist: true`, which is what the Sample pill (Task 2) keys off. Nothing else about them changes.
- Leave alone: `src/app/api/messages/route.ts` and `src/app/(pages)/venue-portal/saved/page.tsx` only use the static list to resolve a display name for a slug someone already messaged or saved. `src/app/(pages)/profile-designs/page.tsx` is already `notFound()` in production. `src/app/(pages)/demo/page.tsx` falls back to static only when the DB demo artist is missing.

- [ ] **Step 1: Write the failing flag tests**

Append to `src/lib/feature-flags.test.ts` (it already imports `isFlagOn`, `FLAGS`, `CLIENT_ENV` and defines `setNodeEnv`):

```ts
describe("SEED_CATALOG (launch audit, blocker 1)", () => {
  const SNAPSHOT = { ...process.env };
  afterEach(() => {
    process.env = { ...SNAPSHOT };
  });

  it("is on in production by default (decision D1, 2 September 2026)", () => {
    delete process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG;
    setNodeEnv("production");
    expect(isFlagOn("SEED_CATALOG")).toBe(true);
  });

  it("env=0 hides the seed everywhere", () => {
    process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG = "0";
    setNodeEnv("production");
    expect(isFlagOn("SEED_CATALOG")).toBe(false);
  });

  it("is on in development by default", () => {
    delete process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG;
    setNodeEnv("development");
    expect(isFlagOn("SEED_CATALOG")).toBe(true);
  });

  it("is inlined for the client bundle", () => {
    expect(Object.keys(CLIENT_ENV)).toContain(FLAGS.SEED_CATALOG.envKey);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run src/lib/feature-flags.test.ts`
Expected: FAIL, `FLAGS.SEED_CATALOG` is undefined / type error on `"SEED_CATALOG"`.

- [ ] **Step 3: Add the flag**

In `src/lib/feature-flags.ts`:

```ts
export type FeatureFlag =
  | "WALL_VISUALIZER_V1"
  | "OAUTH_GOOGLE_APPLE"
  | "GATING_V1"
  | "BLOGS_V1"
  | "SEED_CATALOG";
```

Add to `FLAGS` after `BLOGS_V1`:

```ts
  SEED_CATALOG: {
    envKey: "NEXT_PUBLIC_FLAG_SEED_CATALOG",
    devDefault: true,
    prodDefault: true,
    description:
      "Launch audit: the 41 seed artists in src/data/artists.ts and the 21 " +
      "seed venues in src/data/venues.ts are fictional. Owner decision D1 " +
      "(2026-09-02) keeps them visible in production for now, as labelled " +
      "sample listings with no Verified badge, purchase, enquiry or " +
      "placement request. Set NEXT_PUBLIC_FLAG_SEED_CATALOG=0 in Vercel to " +
      "remove them from the marketplace, sitemap, homepage and venue demand " +
      "tracker in one go.",
  },
```

Add to `CLIENT_ENV`:

```ts
  NEXT_PUBLIC_FLAG_SEED_CATALOG: process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG,
```

- [ ] **Step 4: Run the flag tests, expect pass**

Run: `npx vitest run src/lib/feature-flags.test.ts`
Expected: PASS (including the existing test that every `FLAGS` envKey appears in `CLIENT_ENV`).

- [ ] **Step 5: Write the failing merged-data test**

Create `src/lib/db/merged-data.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

// Launch audit, blocker 1, as scoped by the owner on 2 September: the seed
// catalogue is fictional, so one flag must be able to remove it everywhere,
// and every seed row must say it is one (isSeedArtist) so the Sample pill
// can find it. Nothing else about a seed row changes.
vi.mock("@/data/artists", () => ({
  artists: [{ slug: "seed-one", name: "Seed One", isVerified: true, works: [] }],
}));
vi.mock("./artist-profiles", () => ({
  getAllDatabaseArtists: vi.fn(async () => [
    { slug: "real-one", name: "Real One", isVerified: true, subscriptionStatus: "active", works: [] },
  ]),
  getArtistProfileBySlug: vi.fn(async () => null),
  dbProfileToArtist: vi.fn(),
}));

import { getAllArtists, getArtistBySlug } from "./merged-data";

function setNodeEnv(value: string): void {
  (process.env as Record<string, string>).NODE_ENV = value;
}

describe("seed catalogue gating", () => {
  const SNAPSHOT = { ...process.env };
  afterEach(() => {
    process.env = { ...SNAPSHOT };
  });

  it("hides seed artists when the flag is off", async () => {
    process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG = "0";
    setNodeEnv("production");
    const all = await getAllArtists();
    expect(all.map((a) => a.slug)).toEqual(["real-one"]);
    expect(await getArtistBySlug("seed-one")).toBeNull();
  });

  it("shows seed artists by default in production, each marked as seed", async () => {
    delete process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG;
    setNodeEnv("production");
    const seed = (await getAllArtists()).find((a) => a.slug === "seed-one");
    expect(seed?.isSeedArtist).toBe(true);
    expect((await getArtistBySlug("seed-one"))?.isSeedArtist).toBe(true);
  });
});
```

- [ ] **Step 6: Run it, expect failure**

Run: `npx vitest run src/lib/db/merged-data.test.ts`
Expected: FAIL, the flag does not exist yet and the by-slug fallback has no `isSeedArtist`.

- [ ] **Step 7: Gate merged-data**

Replace the body of `getAllArtists` from `const staticOnly` down to `const merged` and the whole of `getArtistBySlug` in `src/lib/db/merged-data.ts`:

```ts
  // Launch audit, blocker 1, scoped by the owner on 2 September. The seed
  // catalogue is fictional. It surfaces only while SEED_CATALOG is on (on
  // everywhere for now under decision D1; NEXT_PUBLIC_FLAG_SEED_CATALOG=0
  // hides it). isSeedArtist drives the Sample pill; nothing else changes.
  const staticOnly = isFlagOn("SEED_CATALOG")
    ? staticArtists
        .filter((a) => !dbSlugs.has(a.slug))
        .map((a) => ({ ...a, isVerified: a.isVerified ?? true, isSeedArtist: true }))
    : [];

  const merged = [...dbArtists, ...staticOnly];
```

```ts
/**
 * Get a single artist by slug, database first, then static fallback
 * (static only while SEED_CATALOG is on, and marked isSeedArtist).
 */
export async function getArtistBySlug(slug: string): Promise<Artist | null> {
  const dbResult = await getArtistProfileBySlug(slug);
  if (dbResult) {
    return dbProfileToArtist(dbResult.profile, dbResult.works);
  }
  if (!isFlagOn("SEED_CATALOG")) return null;
  const staticArtist = staticArtists.find((a) => a.slug === slug);
  if (!staticArtist) return null;
  return { ...staticArtist, isVerified: staticArtist.isVerified ?? true, isSeedArtist: true };
}
```

Leave the existing "Plan F #12" comment about seed verification where it is; the owner has kept that behaviour.

- [ ] **Step 8: Run merged-data tests, expect pass**

Run: `npx vitest run src/lib/db/merged-data.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing sitemap test**

In `src/app/sitemap.test.ts`, replace the existing `vi.mock("@/data/artists", () => ({ artists: [] }));` with a hoisted, mutable array, and add `afterEach` to the vitest import:

```ts
const { fromMock, seedArtists } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  seedArtists: [] as Array<{ slug: string; works: Array<{ title: string }> }>,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

// Live array so individual tests can add a seed artist (launch audit).
vi.mock("@/data/artists", () => ({ artists: seedArtists }));
```

(Remove the earlier separate `const { fromMock } = vi.hoisted(...)` so `fromMock` is declared once.) Append:

```ts
describe("sitemap seed gating (launch audit, blocker 1)", () => {
  const SNAPSHOT = { ...process.env };
  afterEach(() => {
    process.env = { ...SNAPSHOT };
    seedArtists.length = 0;
  });

  it("omits seed artist URLs when the flag is off", async () => {
    seedArtists.push({ slug: "seed-one", works: [{ title: "Study One" }] });
    process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG = "0";
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).not.toContain(`${SITE_URL}/browse/seed-one`);
    expect(urls).not.toContain(`${SITE_URL}/browse/seed-one/study-one`);
  });

  it("includes them by default", async () => {
    seedArtists.push({ slug: "seed-one", works: [{ title: "Study One" }] });
    delete process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG;
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${SITE_URL}/browse/seed-one`);
  });
});
```

- [ ] **Step 10: Run it, expect the production case to fail**

Run: `npx vitest run src/app/sitemap.test.ts`
Expected: "omits seed artist URLs when the flag is off" FAILS; the rest pass.

- [ ] **Step 11: Gate the sitemap**

In `src/app/sitemap.ts` add `import { isFlagOn } from "@/lib/feature-flags";` and wrap the seed loop:

```ts
  // Seed artist + artwork pages from static data, only while the seed
  // catalogue is switched on (NEXT_PUBLIC_FLAG_SEED_CATALOG=0 hides it).
  const seedEntries: MetadataRoute.Sitemap = [];
  if (isFlagOn("SEED_CATALOG")) {
    for (const artist of artists) {
      // ...existing loop body unchanged...
    }
  }
```

- [ ] **Step 12: Run sitemap tests, expect pass**

Run: `npx vitest run src/app/sitemap.test.ts`
Expected: PASS.

- [ ] **Step 13: Write the failing venue demand test**

Create `src/app/api/venues/demand/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

// Launch audit, blocker 2. The "Active Demand" sections on / and /artists
// point at this endpoint, so what they promise is whatever it returns. The
// 21 seed venues are fictional and must not be counted in production.
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/api-auth", () => ({ getOptionalUser: vi.fn(async () => ({ user: null })) }));
vi.mock("@/lib/subscriptions", () => ({ resolveSubscription: vi.fn(async () => ({ active: false })) }));
vi.mock("@/lib/venue-visibility", () => ({
  canSeeVenueIdentity: () => false,
  redactDemandVenue: (v: unknown) => v,
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ order: async () => ({ data: [], error: null }) }),
    }),
  }),
}));
vi.mock("@/data/venues", () => ({
  venues: [
    {
      slug: "seed-cafe", name: "Seed Cafe", type: "Café", location: "Peckham",
      coordinates: { lat: 51.47, lng: -0.07 }, approximateFootfall: "", audienceType: "",
      interestedInFreeLoan: true, interestedInRevenueShare: false, interestedInDirectPurchase: false,
      interestedInCollections: false, interestedInLocalArtists: false, interestedInFramedWork: false,
      interestedInRotatingArtwork: false, wallSpace: "", preferredStyles: [], preferredThemes: [],
      description: "", image: "",
    },
  ],
}));

import { GET } from "./route";

const req = () => new Request("http://localhost/api/venues/demand");

describe("GET /api/venues/demand seed gating", () => {
  const SNAPSHOT = { ...process.env };
  afterEach(() => {
    process.env = { ...SNAPSHOT };
  });

  it("returns no seed venues when the flag is off", async () => {
    process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG = "0";
    const json = await (await GET(req())).json();
    expect(json.venues).toEqual([]);
    expect(json.stats.total).toBe(0);
  });

  it("returns them by default", async () => {
    delete process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG;
    const json = await (await GET(req())).json();
    expect(json.venues.map((v: { slug: string }) => v.slug)).toEqual(["seed-cafe"]);
  });
});
```

- [ ] **Step 14: Run it, expect the production case to fail**

Run: `npx vitest run src/app/api/venues/demand/route.test.ts`
Expected: the flag-off test FAILS with one venue returned.

- [ ] **Step 15: Gate the demand route**

In `src/app/api/venues/demand/route.ts` add `import { isFlagOn } from "@/lib/feature-flags";` and replace the `staticOnly` line:

```ts
    // Launch audit, blocker 2. The seed venues are fictional and only
    // surface while SEED_CATALOG is on (NEXT_PUBLIC_FLAG_SEED_CATALOG=0
    // hides them). The venue sections on / and /artists point here, so
    // this is what they promise.
    const staticOnly = isFlagOn("SEED_CATALOG")
      ? staticVenues.filter((v) => !dbSlugs.has(v.slug))
      : [];
```

- [ ] **Step 16: Run demand tests, expect pass**

Run: `npx vitest run src/app/api/venues/demand/route.test.ts`
Expected: PASS.

- [ ] **Step 17: Gate the browse page's first paint and the static params**

`src/app/(pages)/browse/page.tsx`: add `import { isFlagOn } from "@/lib/feature-flags";`, then:

```ts
  const [artists, setArtists] = useState<Artist[]>(isFlagOn("SEED_CATALOG") ? staticArtists : []);
  const [collections, setCollections] = useState<ArtistCollection[]>(isFlagOn("SEED_CATALOG") ? staticCollections : []);
```

In the same file's fetch effect, change `if (data.artists?.length) setArtists(data.artists);` to:

```ts
        // An empty live list must replace the seed paint, not lose to it.
        if (Array.isArray(data.artists)) setArtists(data.artists);
```

`src/app/(pages)/browse/[slug]/page.tsx`: add the import and make the first line of the function that returns `artists.map((artist) => ({ slug: ... }))`:

```ts
  if (!isFlagOn("SEED_CATALOG")) return [];
```

`src/app/(pages)/browse/[slug]/[workSlug]/page.tsx`: same guard as the first line of the function that returns `artists.flatMap(...)`.

- [ ] **Step 18: Full gate, then commit**

Run: `npx tsc --noEmit && npm run check`
Expected: green.

```bash
git add src/lib/feature-flags.ts src/lib/feature-flags.test.ts src/lib/db/merged-data.ts src/lib/db/merged-data.test.ts src/app/sitemap.ts src/app/sitemap.test.ts src/app/api/venues/demand/route.ts src/app/api/venues/demand/route.test.ts "src/app/(pages)/browse/page.tsx" "src/app/(pages)/browse/[slug]/page.tsx" "src/app/(pages)/browse/[slug]/[workSlug]/page.tsx"
git commit -m "feat(catalogue): seed artists and venues surface only behind SEED_CATALOG

The 41 seed artists and 21 seed venues are fictional. One env var
(NEXT_PUBLIC_FLAG_SEED_CATALOG=0) now removes them from the marketplace,
sitemap, artist pages and the venue demand tracker together. They stay
visible for now (owner decision D1).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: A blue "Sample" pill on every seed artist (owner instruction, 2 September)

Owner instruction: the seed artists stay exactly as they are, plus a blue "Sample" pill. Nothing else on their profiles changes: the Verified tick, the buy, message and placement controls all stay. For the record, what already fails safely if someone tries: checkout refuses a work that isn't in the database (409, "no longer available"), and a message to an unknown slug is refused with an error. A venue's placement request to a seed artist is accepted and stored "to claim on sign-up"; that stays too, per the instruction. The two held-back items at the end of this plan are the fixes for that, ready when wanted.

Blue means blue: the site accent is terracotta (`--color-accent: #C17C5A`), so the pill uses Tailwind's `bg-blue-600 text-white` explicitly rather than the accent.

**Files:**
- Create: `src/components/SamplePill.tsx`, `src/components/SamplePill.test.tsx`
- Modify: `src/data/galleries.ts` (the flattened work type at ~line 35; the flatten at ~line 76)
- Modify: `src/app/(pages)/browse/[slug]/page.tsx` (the name row with `VerifiedBadge`, ~line 279)
- Modify: `src/app/(pages)/browse/page.tsx` (portfolio card `<h3>` at ~1863; works card `{work.artistName}` at ~2538)
- Modify: `src/app/(pages)/browse/[slug]/[workSlug]/page.tsx` (the `<ArtworkPageClient` element, ~line 180)
- Modify: `src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.tsx` (props at line 26; the artist name link at ~176)
- Modify: `src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.test.tsx`

**Interfaces:**
- Consumes: `artist.isSeedArtist` (set on both merged-data paths in Task 1).
- Produces: `<SamplePill className? />`; `artistIsSeed?: boolean` on the flattened gallery work; `ArtworkPageClientProps.isSample?: boolean`.

- [ ] **Step 1: Write the failing tests**

`src/components/SamplePill.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SamplePill from "./SamplePill";

afterEach(() => cleanup());

describe("<SamplePill />", () => {
  it("reads Sample, in blue, with an explanation on hover", () => {
    render(<SamplePill />);
    const pill = screen.getByText("Sample");
    expect(pill.className).toContain("bg-blue-600");
    expect(pill.getAttribute("title")).toMatch(/sample profile/i);
  });
});
```

Append to `src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.test.tsx`:

```tsx
describe("sample pill (owner instruction, 2 September)", () => {
  it("shows a Sample pill beside a seed artist's name and changes nothing else", () => {
    render(
      <ArtworkPageClient work={workWithPerSizeShipping()} artistName="Seed Artist" artistSlug="seed-artist" isSample />,
    );
    expect(screen.getByText("Sample")).toBeTruthy();
    expect(screen.getByText(/Size & Price/i)).toBeTruthy();
  });

  it("shows no pill for a real artist", () => {
    render(
      <ArtworkPageClient work={workWithPerSizeShipping()} artistName="Alice Rivers" artistSlug="alice-rivers" />,
    );
    expect(screen.queryByText("Sample")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them, expect failure**

Run: `npx vitest run src/components/SamplePill.test.tsx "src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.test.tsx"`
Expected: FAIL, module missing and `isSample` unknown.

- [ ] **Step 3: Create the pill**

`src/components/SamplePill.tsx`:

```tsx
/**
 * Owner instruction (2026-09-02): the seed artists stay on the site exactly
 * as they are, plus this pill. Blue on purpose: the site accent is
 * terracotta, and the owner asked for blue so it reads as a label rather
 * than a badge of merit.
 */
export default function SamplePill({ className = "" }: { className?: string }) {
  return (
    <span
      title="A sample profile showing the kind of work Wallplace places"
      className={`inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-medium tracking-wide text-white ${className}`}
    >
      Sample
    </span>
  );
}
```

- [ ] **Step 4: Render it in the four places a seed artist's name appears**

`src/data/galleries.ts`: after `artistIsFounding?: boolean;` in the type add

```ts
  /** Seed (sample) artist; drives the Sample pill on marketplace cards. */
  artistIsSeed?: boolean;
```

and after `artistIsFounding: artist.isFoundingArtist,` in the flatten add `artistIsSeed: artist.isSeedArtist,`.

`src/app/(pages)/browse/[slug]/page.tsx`: add `import SamplePill from "@/components/SamplePill";` and, directly after the `{artist.isVerified && (<VerifiedBadge className="self-center" />)}` block, add `{artist.isSeedArtist && <SamplePill className="self-center" />}`.

`src/app/(pages)/browse/page.tsx`: add the same import. In the portfolio card, directly after the `</h3>` that holds `{artist.name}` (still inside the `<Link>`), add `{artist.isSeedArtist && <SamplePill className="mb-2" />}`. In the works card, directly after the `</Link>` that holds `{work.artistName}`, add `{work.artistIsSeed && <SamplePill className="ml-1.5 align-middle" />}`.

`src/app/(pages)/browse/[slug]/[workSlug]/page.tsx`: add `isSample={Boolean(artist.isSeedArtist)}` to the `<ArtworkPageClient` element.

`src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.tsx`: add the import, add to the props interface

```ts
  /** Seed (sample) artist's work: shows the Sample pill beside the name. Changes nothing else. */
  isSample?: boolean;
```

destructure `isSample = false` with the other props, and directly after the `</Link>` that wraps `{artistName}` add `{isSample && <SamplePill className="ml-2 normal-case tracking-normal" />}` (the parent paragraph is uppercase with wide tracking; the two utilities keep the pill reading "Sample").

- [ ] **Step 5: Run tests, gate, commit**

Run: `npx vitest run src/components/SamplePill.test.tsx "src/app/(pages)/browse/[slug]" && npx tsc --noEmit && npm run check`
Expected: PASS, gate green.

```bash
git add src/components/SamplePill.tsx src/components/SamplePill.test.tsx src/data/galleries.ts "src/app/(pages)/browse/[slug]/page.tsx" "src/app/(pages)/browse/page.tsx" "src/app/(pages)/browse/[slug]/[workSlug]/page.tsx" "src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.tsx" "src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.test.tsx"
git commit -m "feat(catalogue): blue Sample pill on seed artists

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Homepage trust bar counts through the service-role client

**Files:**
- Modify: `src/app/api/stats/public/route.ts`
- Create: `src/app/api/stats/public/route.test.ts`

**Interfaces:** response shape unchanged: `{ total_artists, total_artworks, total_placements, total_venues, artworks_sold }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Launch audit, blocker 3. This route counted with the anon client, and
// production grants anon no SELECT on artist_profiles or venue_profiles, so
// every count came back 0 and the trust bar rendered nothing.
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));

const counts: Record<string, number> = {
  "artist_profiles|review_status=approved": 11,
  "artist_works|": 35,
  "artist_works|available=false": 4,
  "placements|status=active": 38,
  "venue_profiles|": 9,
};

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const filters: string[] = [];
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push(`${col}=${String(val)}`);
          return chain;
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ count: counts[`${table}|${filters.join(",")}`] ?? 0, error: null }).then(resolve),
      };
      return chain;
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/stats/public", () => {
  it("counts through the service-role client, not anon", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/stats/public/route.ts"), "utf8");
    expect(src).toContain("getSupabaseAdmin");
    expect(src).not.toMatch(/from "@\/lib\/supabase"/);
  });

  it("returns approved artists, artworks, active placements, venues and sold", async () => {
    const json = await (await GET(new Request("http://localhost/api/stats/public"))).json();
    expect(json).toEqual({
      total_artists: 11,
      total_artworks: 35,
      total_placements: 38,
      total_venues: 9,
      artworks_sold: 4,
    });
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run src/app/api/stats/public/route.test.ts`
Expected: FAIL, the route imports `@/lib/supabase`.

- [ ] **Step 3: Switch the client**

In `src/app/api/stats/public/route.ts` replace `import { supabase } from "@/lib/supabase";` with `import { getSupabaseAdmin } from "@/lib/supabase-admin";` and, as the first line inside the `try`:

```ts
    // Launch audit, blocker 3. The anon client has no SELECT on
    // artist_profiles or venue_profiles in production, so this returned
    // zeros. The service-role client reads the same tables; the approved
    // filter below is what keeps the number honest, not RLS.
    const supabase = getSupabaseAdmin();
```

Everything else in the file stays as it is.

- [ ] **Step 4: Run it, expect pass, then gate and commit**

Run: `npx vitest run src/app/api/stats/public/route.test.ts && npm run check`
Expected: PASS, gate green.

```bash
git add src/app/api/stats/public/route.ts src/app/api/stats/public/route.test.ts
git commit -m "fix(stats): homepage trust bar counts through the service-role client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Venue sections describe the venues listed, not live demand

**Files:**
- Modify: `src/app/page.tsx` (the section around lines 372 to 395)
- Modify: `src/components/marketing/ArtistGuide.tsx` (the section around lines 400 to 420)
- Modify: `src/app/(pages)/spaces/page.tsx` (hero, lines 298 to 301)
- Create: `tests/integration/public-claims.test.ts`
- Possibly modify: `src/app/(pages)/spaces/page.test.tsx` if it asserts on the old heading

- [ ] **Step 1: Write the failing test**

Create `tests/integration/public-claims.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Files under `dirs` containing `needle`, or [] (grep exits 1 on no match). */
function grepFiles(needle: string, dirs: string[]): string[] {
  try {
    return execFileSync("grep", ["-rl", needle, ...dirs], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch (e) {
    const out = (e as { stdout?: string }).stdout ?? "";
    return out.split("\n").filter(Boolean);
  }
}

// Launch audit. Each entry is a claim the site made that it could not
// evidence, pinned so it cannot come back.
describe("public claims the site cannot evidence stay out", () => {
  it("no page says venues are looking for art 'right now'", () => {
    for (const p of [
      "src/app/page.tsx",
      "src/components/marketing/ArtistGuide.tsx",
      "src/app/(pages)/spaces/page.tsx",
    ]) {
      expect(read(p), p).not.toMatch(/looking for art right now|actively seeking|Active Demand/i);
    }
  });
});

export { grepFiles, read };
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run tests/integration/public-claims.test.ts`
Expected: FAIL on all three files.

- [ ] **Step 3: Rewrite the three sections**

`src/app/page.tsx`, inside the section that currently reads "Active Demand":

```tsx
              <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">Venues</p>
              <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-white mb-4">
                See the venues on Wallplace
              </h2>
              <p className="text-lg text-white/50 max-w-lg mx-auto mb-10">
                Caf&eacute;s, restaurants, hotels and offices, and what each one is open to. See who is near you.
              </p>
```

and the first button's label `See Venue Demand` becomes `See Venues`.

`src/components/marketing/ArtistGuide.tsx`, the "Venue Demand" section:

```tsx
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">Venues</p>
          <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-3">See the venues on Wallplace</h2>
          <p className="text-muted max-w-lg mx-auto mb-8">
            Venues on Wallplace and the styles and arrangements each one is open to. Enter your postcode to see who is near you.
          </p>
```

and `SEE VENUE DEMAND` becomes `SEE VENUES`.

`src/app/(pages)/spaces/page.tsx`, hero:

```tsx
          <h1 className="font-serif text-2xl sm:text-4xl lg:text-5xl text-white mb-4">Venues on Wallplace</h1>
          <p className="text-base sm:text-lg text-white/50 max-w-lg mx-auto mb-8">
            Venues and what each one is open to. Enter your postcode to see who is near you.
          </p>
```

- [ ] **Step 4: Run the claim test and the spaces test**

Run: `npx vitest run tests/integration/public-claims.test.ts "src/app/(pages)/spaces/page.test.tsx"`
Expected: PASS. If the spaces test asserts on "Venues Looking for Art", change that assertion to "Venues on Wallplace".

- [ ] **Step 5: Gate and commit**

Run: `npm run check`

```bash
git add src/app/page.tsx src/components/marketing/ArtistGuide.tsx "src/app/(pages)/spaces/page.tsx" "src/app/(pages)/spaces/page.test.tsx" tests/integration/public-claims.test.ts
git commit -m "fix(copy): venue sections describe the venues listed, not live demand

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Homepage featured artists come from the live catalogue; honest hero alt

The grid links six seed artists by name today. It now reads the same endpoint `/browse` uses, where database artists come before the seed, so real artists lead while the seed is visible and the grid follows the flag automatically once it is hidden.

**Files:**
- Modify: `src/app/page.tsx` (import at line 12, `featuredArtists` at line 14, the grid at lines 284 to 291, the hero `alt` at line 97)
- Modify: `src/app/page.test.tsx`
- Check: `next.config.*` `images.remotePatterns` includes the Supabase storage host (`*.supabase.co`); add it if absent, since artist images now come from the database.

- [ ] **Step 1: Write the failing tests**

In `src/app/page.test.tsx` add `import { readFileSync } from "node:fs";` and `import { join } from "node:path";`, and before `import Home from "./page";` stub fetch:

```tsx
const fetchMock = vi.fn((url: string) => {
  if (String(url).startsWith("/api/browse-artists")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        artists: [
          { slug: "maya-chen", name: "Maya Chen", image: "https://example.test/maya.jpg" },
          { slug: "no-image", name: "No Image", image: "" },
        ],
      }),
    });
  }
  return Promise.resolve({ ok: false, json: async () => null });
});
vi.stubGlobal("fetch", fetchMock);
```

Append:

```tsx
describe("homepage featured artists (launch audit, blocker 1)", () => {
  it("renders real artists from the browse endpoint, never the seed file", async () => {
    render(<Home />);
    const tile = await screen.findByRole("link", { name: /maya chen/i });
    expect(tile.getAttribute("href")).toBe("/browse/maya-chen");
    expect(screen.queryByRole("link", { name: /no image/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /james okafor/i })).toBeNull();
  });

  it("does not import the seed catalogue at all", () => {
    const src = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
    expect(src).not.toMatch(/from "@\/data\/artists"/);
  });

  it("describes the hero image honestly", () => {
    render(<Home />);
    expect(screen.queryByLabelText("Gallery interior")).toBeNull();
    expect(screen.getByLabelText("Close-up of textured paint strokes on canvas")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run src/app/page.test.tsx`
Expected: the three new tests FAIL (seed import present, James Okafor tile present, old alt present).

- [ ] **Step 3: Replace the seed grid with a live fetch**

In `src/app/page.tsx` delete `import { artists } from "@/data/artists";` and `const featuredArtists = artists.slice(0, 6);`. After the `PublicStats` interface add:

```tsx
interface FeaturedArtist {
  slug: string;
  name: string;
  image: string;
}
```

After `const [stats, setStats] = useState<PublicStats | null>(null);` add:

```tsx
  const [featured, setFeatured] = useState<FeaturedArtist[]>([]);

  // Launch audit, blocker 1. This grid used to render six seed artists from
  // src/data/artists.ts: fictional people linking to fictional portfolios.
  // It now shows the first six real, approved artists from the endpoint
  // /browse uses. Empty until the fetch lands, and empty if the catalogue
  // is: no tile is better than a made-up one.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/browse-artists")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { artists?: FeaturedArtist[] } | null) => {
        if (cancelled || !data || !Array.isArray(data.artists)) return;
        setFeatured(data.artists.filter((a) => a.slug && a.name && a.image).slice(0, 6));
      })
      .catch(() => {
        /* No tiles is the honest fallback. */
      });
    return () => {
      cancelled = true;
    };
  }, []);
```

Replace the grid (`{artists.slice(0, 6).map((a) => (` and its wrapper) with:

```tsx
                <div className={`order-2 lg:order-1 grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 ${featured.length === 0 ? "hidden" : ""}`}>
                  {featured.map((a) => (
                    <Link key={a.slug} href={`/browse/${a.slug}`} className="aspect-[4/5] relative rounded-sm overflow-hidden group">
                      <Image src={a.image} alt={a.name} fill className="object-cover group-hover:scale-[1.03] transition-transform duration-500" sizes="20vw" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                      <p className="absolute bottom-2 left-2 text-white text-xs font-medium">{a.name}</p>
                    </Link>
                  ))}
                </div>
```

Change the hero `alt="Gallery interior"` (line 97) to `alt="Close-up of textured paint strokes on canvas"`.

Run `grep -n "\bartists\b" src/app/page.tsx` and remove any other use of the deleted import; `tsc` will confirm.

- [ ] **Step 4: Run tests, gate, commit**

Run: `npx vitest run src/app/page.test.tsx && npx tsc --noEmit && npm run check`
Expected: PASS, gate green.

```bash
git add src/app/page.tsx src/app/page.test.tsx
git commit -m "fix(home): featured artists come from the live catalogue; honest hero alt text

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

If you had to add the Supabase host to `next.config`, stage that file too.

---

### Wave 2: revenue

### Task 6: Programmes leads the paid pitch

**Files:**
- Modify: `src/app/page.tsx` (new section between FOR VENUES and FOR ARTISTS; the Paid Loan line at ~226; the curated link at ~258; venue Step 03 at ~340)
- Modify: `src/app/(pages)/how-it-works/HowItWorksClient.tsx:32` (+ import)
- Modify: `src/app/(pages)/pricing/page.tsx:143-146` (+ import)
- Modify: `src/app/(pages)/faqs/page.tsx` (lines 24 to 27 and 202 to 205)
- Modify: `src/app/(pages)/venue-agreement/page.tsx:42,44`
- Modify: `src/app/(pages)/venues/page.tsx:53-58`
- Modify: `src/components/Header.tsx` (`moreLinks`: Programmes before Wallplace Curated)
- Modify: `src/components/Footer.tsx` (For Venues: Programmes before Wallplace Curated)
- Create: `tests/integration/programmes-lead.test.ts`
- Modify: `src/app/page.test.tsx`

**Interfaces:** consumes `CURATION_TIERS.programme.priceGbp`, `CURATION_TIERS.single_wall.priceGbp`, `PROGRAMME_LADDER` and `gbp()` from `@/lib/curation-tiers`. No new exports.

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/programmes-lead.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { grepFiles } from "./public-claims.test";

// Launch audit, section 02. Programmes is the product the business needs to
// sell, and the prose kept naming Curated as the example paid option.
describe("Programmes leads the paid pitch", () => {
  it("no public copy names Curated as the example paid service", () => {
    expect(grepFiles("such as Wallplace Curated", ["src/app", "src/components"])).toEqual([]);
  });

  it("no public copy offers Curated as the 'or explore' alternative", () => {
    expect(grepFiles("explore Curated", ["src/app", "src/components"])).toEqual([]);
  });
});
```

Append to `src/app/page.test.tsx` (add `import { PROGRAMME_LADDER } from "@/lib/curation-tiers";`):

```tsx
describe("homepage sells Programmes (launch audit, section 02)", () => {
  it("has a Programmes section with the price ladder and a link to /programmes", () => {
    render(<Home />);
    expect(screen.getAllByText(/Wallplace Programmes/).length).toBeGreaterThan(0);
    const link = screen.getAllByRole("link", { name: /^see programmes$/i })[0];
    expect(link.getAttribute("href")).toBe("/programmes");
    for (const rung of PROGRAMME_LADDER) {
      expect(screen.getByText(`${rung.pieces} pieces`)).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run them, expect failure**

Run: `npx vitest run tests/integration/programmes-lead.test.ts src/app/page.test.tsx`
Expected: FAIL (five files still say "such as Wallplace Curated" / "explore Curated"; no Programmes section).

- [ ] **Step 3: Add the homepage section**

In `src/app/page.tsx` add `import { CURATION_TIERS, PROGRAMME_LADDER, gbp } from "@/lib/curation-tiers";`. Insert between the FOR VENUES section's closing `</section>` and `{/* ─── FOR ARTISTS ─── */}`:

```tsx
          {/* ─── PROGRAMMES ─── */}
          <section className="py-16 lg:py-24 bg-surface border-y border-border">
            <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
              <AnimateIn>
              <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
                <div className="lg:col-span-7">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">Wallplace Programmes</p>
                  <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mb-6 leading-tight">
                    Walls handled for you, from {gbp(CURATION_TIERS.programme.priceGbp)} a month.
                  </h2>
                  <p className="text-lg text-muted leading-relaxed mb-8">
                    For offices, hotels and restaurants that want the art dealt with.
                    We curate, install and rotate original work through the year,
                    and every artist on your walls is paid rent out of your fee.
                    Quoted per site, twelve-month term.
                  </p>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <Link href="/programmes" className="inline-flex items-center justify-center px-5 sm:px-7 py-3 sm:py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
                      See Programmes
                    </Link>
                    <Link href="/curated" className="inline-flex items-center justify-center px-5 sm:px-7 py-3 sm:py-3.5 border border-border text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-foreground hover:text-white transition-colors">
                      One-off shortlist from {gbp(CURATION_TIERS.single_wall.priceGbp)}
                    </Link>
                  </div>
                </div>
                <div className="lg:col-span-5">
                  <ul className="bg-background rounded-md divide-y divide-border/60">
                    {PROGRAMME_LADDER.map((rung) => (
                      <li key={rung.pieces} className="flex items-baseline justify-between px-5 py-4">
                        <span className="text-sm text-foreground">{rung.pieces} pieces</span>
                        <span className="font-serif text-lg text-foreground">
                          {gbp(rung.monthlyGbp)}
                          <span className="text-xs text-muted font-sans"> a month</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted mt-3">
                    A guide to how pricing scales. Every site is quoted individually. Prices exclusive of VAT.
                  </p>
                </div>
              </div>
              </AnimateIn>
            </div>
          </section>
```

Same file, three small edits:

Paid Loan description: `Pay the artist a monthly fee to display the work on your wall.` becomes `Pay one artist a monthly fee to keep one piece on your wall.`

The curated line under the venue buttons becomes:

```tsx
                  <p className="mt-5 text-sm text-muted">
                    Want it handled for you?{" "}
                    <Link href="/programmes" className="text-accent hover:underline font-medium">
                      See Wallplace Programmes &rarr;
                    </Link>
                  </p>
```

Venue Step 03 description becomes: `Display for free with optional revenue share, pay a monthly loan fee for one piece, or have the whole space handled on a Programme.`

- [ ] **Step 4: Switch the five references**

`src/app/(pages)/how-it-works/HowItWorksClient.tsx`: add `import { CURATION_TIERS, gbp } from "@/lib/curation-tiers";` and replace line 32:

```ts
    secondary: { href: "/programmes", label: `Or have your walls handled for you: Programmes from ${gbp(CURATION_TIERS.programme.priceGbp)} a month` },
```

`src/app/(pages)/pricing/page.tsx`: change line 6 to `import { gbp, CURATION_TIERS, PROGRAMME_PIECE_RENT_TARGET_GBP } from "@/lib/curation-tiers";` and the aside body to:

```tsx
                <strong>Are you a venue?</strong> Browsing and enquiring is free. See{" "}
                <Link href="/venues" className="underline">how it works for venues</Link>, or have your walls handled for you with{" "}
                <Link href="/programmes" className="underline">Wallplace Programmes</Link> from {gbp(CURATION_TIERS.programme.priceGbp)} a month.
```

`src/app/(pages)/faqs/page.tsx`: in "How does Wallplace make money?" replace `and optional paid services for venues such as Wallplace Curated.` with `and optional paid services for venues: Wallplace Programmes (walls handled for you on a monthly fee) and Wallplace Curated (a one-off shortlist).` In "How much does it cost for a venue to display art?" replace `optional services venues can choose, such as Wallplace Curated.` with `optional services venues can choose, such as Wallplace Programmes.`

`src/app/(pages)/venue-agreement/page.tsx`: line 42, `such as Wallplace Curated.` becomes `such as Wallplace Programmes and Wallplace Curated.`; line 44, `Optional paid services, such as Wallplace Curated, are priced` becomes `Optional paid services, such as Wallplace Programmes and Wallplace Curated, are priced`.

`src/app/(pages)/venues/page.tsx` lines 53 to 58 become:

```tsx
              <p className="mt-6 text-sm text-white/60">
                Want your walls handled for you?{" "}
                <Link href="/programmes" className="text-white underline underline-offset-2 hover:text-white/80">
                  See Wallplace Programmes
                </Link>
                , from {gbp(CURATION_TIERS.programme.priceGbp)} a month.
              </p>
```

`src/components/Header.tsx` `moreLinks`: move `{ label: "Programmes", href: "/programmes" }` above `{ label: "Wallplace Curated", href: "/curated" }`. `src/components/Footer.tsx` For Venues: same swap.

- [ ] **Step 5: Run tests, gate, commit**

Run: `npx vitest run tests/integration/programmes-lead.test.ts src/app/page.test.tsx src/components/Header.test.tsx && npm run check`
Expected: PASS, gate green.

```bash
git add src/app/page.tsx src/app/page.test.tsx "src/app/(pages)/how-it-works/HowItWorksClient.tsx" "src/app/(pages)/pricing/page.tsx" "src/app/(pages)/faqs/page.tsx" "src/app/(pages)/venue-agreement/page.tsx" "src/app/(pages)/venues/page.tsx" src/components/Header.tsx src/components/Footer.tsx tests/integration/programmes-lead.test.ts
git commit -m "feat(home): Programmes section leads the paid pitch; copy stops naming Curated as the example

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The founding-artist offer on every artist-facing page, derived from pricing.ts

`FOUNDING_ARTIST_LIMIT = 20` and `FOUNDING_TRIAL_DAYS = 180` are live, admin-capped and on the printed flyer. The site says "first month free" everywhere.

**Files:**
- Modify: `src/lib/pricing.ts` (after `FOUNDING_TRIAL_DAYS`), `src/lib/pricing.test.ts`
- Create: `src/lib/founding-offer-surfaced.test.ts`
- Modify: `src/components/marketing/ArtistGuide.tsx` (banner at 246 to 258; line 435)
- Modify: `src/app/(pages)/apply/page.tsx` (metadata line 7; banner lines 47 to 53)
- Modify: `src/app/(pages)/pricing/page.tsx` (metadata line 11; lines 161 to 170; 357 to 360)
- Modify: `src/app/(pages)/artists/page.tsx` (lines 66 to 68)
- Modify: `src/app/page.tsx` (Step 02 at ~352; card at ~420)
- Modify: `src/app/(pages)/how-it-works/HowItWorksClient.tsx` (lines 35, 38, 41)
- Modify: `src/components/ApplicationForm.tsx:880`
- Modify: `src/app/(pages)/signup/artist/layout.tsx:6`
- Modify: `src/app/(pages)/faqs/page.tsx:49`

**Interfaces:**
- Produces: `FOUNDING_TRIAL_MONTHS: number` (6), `FOUNDING_OFFER_SHORT: string` ("First 20 artists: 6 months free"), `foundingOfferLine(): string`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/pricing.test.ts` (extend the existing import from `./pricing`):

```ts
describe("founding offer copy derives from the constants", () => {
  it("is a whole number of months", () => {
    expect(Number.isInteger(FOUNDING_TRIAL_MONTHS)).toBe(true);
    expect(FOUNDING_TRIAL_MONTHS).toBe(6);
  });

  it("names the cohort size and the trial length", () => {
    expect(FOUNDING_OFFER_SHORT).toBe("First 20 artists: 6 months free");
    expect(foundingOfferLine()).toContain("first 20 artists");
    expect(foundingOfferLine()).toContain("6 months free");
  });
});
```

Create `src/lib/founding-offer-surfaced.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Launch audit, section 04. The offer is built, admin-capped and printed on
// the flyer; the site said "first month free" everywhere. Every artist-facing
// page renders it from src/lib/pricing.ts so the numbers cannot drift.
const PAGES = [
  "src/app/page.tsx",
  "src/app/(pages)/artists/page.tsx",
  "src/app/(pages)/pricing/page.tsx",
  "src/app/(pages)/apply/page.tsx",
  "src/app/(pages)/how-it-works/HowItWorksClient.tsx",
  "src/components/marketing/ArtistGuide.tsx",
  "src/components/ApplicationForm.tsx",
];

describe("the founding-artist offer is on every artist-facing page", () => {
  for (const p of PAGES) {
    it(`${p} renders it from pricing.ts and drops the blanket claim`, () => {
      const src = readFileSync(join(process.cwd(), p), "utf8");
      expect(src).toMatch(/FOUNDING_OFFER_SHORT|foundingOfferLine\(\)/);
      expect(src).not.toMatch(/First month free on all plans/);
    });
  }
});
```

- [ ] **Step 2: Run them, expect failure**

Run: `npx vitest run src/lib/pricing.test.ts src/lib/founding-offer-surfaced.test.ts`
Expected: FAIL, exports missing; seven pages fail the scan.

- [ ] **Step 3: Add the constants**

In `src/lib/pricing.ts`, directly after `export const FOUNDING_TRIAL_DAYS = 180;`:

```ts
/** Founding trial length in whole months, for copy. 180 days is six months. */
export const FOUNDING_TRIAL_MONTHS = FOUNDING_TRIAL_DAYS / 30;

/**
 * The founding-artist offer, in one place. The flyer says "First 20 artists:
 * 6 months free"; the site said "first month free" everywhere. Every
 * artist-facing page renders one of these so the numbers cannot drift from
 * the constants the admin cap and the trial length are built on.
 */
export const FOUNDING_OFFER_SHORT = `First ${FOUNDING_ARTIST_LIMIT} artists: ${FOUNDING_TRIAL_MONTHS} months free`;

export function foundingOfferLine(): string {
  return `The first ${FOUNDING_ARTIST_LIMIT} artists accepted get ${FOUNDING_TRIAL_MONTHS} months free. After that, every plan starts with a month free.`;
}
```

- [ ] **Step 4: Render it on each page**

Each file imports what it uses: `import { FOUNDING_OFFER_SHORT, foundingOfferLine } from "@/lib/pricing";`

`src/components/marketing/ArtistGuide.tsx`, the banner:

```tsx
            {/* Founding Artist Offer, derived from src/lib/pricing.ts */}
            <div className="border-2 border-accent rounded-sm p-6 md:p-8 mb-10 bg-accent/5 text-center">
              <p className="text-sm font-medium text-accent uppercase tracking-wider mb-2">
                Founding Artist Offer
              </p>
              <p className="text-2xl md:text-3xl font-serif text-accent">
                {FOUNDING_OFFER_SHORT}
              </p>
              <p className="mt-2 text-muted">
                {foundingOfferLine()} Places are confirmed when your application is accepted.
              </p>
            </div>
```

Same file, line 435: `First month free. Membership from &pound;9.99/month.` becomes `{FOUNDING_OFFER_SHORT}. Membership from &pound;9.99/month.`

`src/app/(pages)/apply/page.tsx`, the banner text:

```tsx
              <p className="text-foreground font-medium">
                {FOUNDING_OFFER_SHORT}.
              </p>
              <p className="text-muted text-sm mt-1">
                {foundingOfferLine()} No long-term contract, 30 days&rsquo; notice to leave.
              </p>
```

and the metadata description becomes a template: `` description: `Apply to join Wallplace, the curated platform connecting artists with independent venues. ${FOUNDING_OFFER_SHORT}.`, ``

`src/app/(pages)/pricing/page.tsx`, the Free Trial banner:

```tsx
                <p className="text-foreground font-medium text-lg">
                  {FOUNDING_OFFER_SHORT}
                </p>
                <p className="text-muted text-sm mt-1">
                  {foundingOfferLine()} No long-term contract, 30 days&rsquo; notice to leave.
                </p>
```

its button label `Apply to join, first month free if accepted` becomes `Apply to join`; the Final CTA paragraph becomes `{foundingOfferLine()} No long-term contract, 30 days&rsquo; notice to leave.` and its button `Apply to join`. In the metadata description replace `First month free.` with `${FOUNDING_OFFER_SHORT}.` (convert to a template literal).

`src/app/(pages)/artists/page.tsx` strip: `<span>1 month free trial</span>` becomes `<span>{FOUNDING_OFFER_SHORT}</span>`; `<span>Cancel anytime</span>` becomes `<span>30 days&rsquo; notice to leave</span>`.

`src/app/page.tsx`: Step 02 `description="Pass our curation review. First month free."` becomes `` description={`Pass our curation review. ${FOUNDING_OFFER_SHORT}.`} ``; the Artists card `First month free. From &pound;9.99/month.` becomes `{FOUNDING_OFFER_SHORT}. From &pound;9.99/month.`

`src/app/(pages)/how-it-works/HowItWorksClient.tsx`: artist `lede` becomes `` `Apply to join Wallplace's curated roster. Every application is reviewed personally. ${foundingOfferLine()}` ``; Step 02 description `` `Pass curation review and your profile goes live. ${FOUNDING_OFFER_SHORT}.` ``; cta label `Apply to join`.

`src/components/ApplicationForm.tsx:880`: `First month free on all plans. You can change your plan at any time after joining.` becomes `{foundingOfferLine()} You can change your plan at any time after joining.`

`src/app/(pages)/signup/artist/layout.tsx:6`: description becomes `` `Apply to join Wallplace's curated artist roster. ${FOUNDING_OFFER_SHORT}.` ``

`src/app/(pages)/faqs/page.tsx:49`: `£9.99/month (Core plan) with your first month free. Higher tiers` becomes `£9.99/month (Core plan). {foundingOfferLine()} Higher tiers` (the answer is JSX; keep it inside the existing `<p>`).

- [ ] **Step 5: Run tests, gate, commit**

Run: `npx vitest run src/lib/pricing.test.ts src/lib/founding-offer-surfaced.test.ts src/app/page.test.tsx && npm run check`
Expected: PASS, gate green.

```bash
git add src/lib/pricing.ts src/lib/pricing.test.ts src/lib/founding-offer-surfaced.test.ts src/components/marketing/ArtistGuide.tsx "src/app/(pages)/apply/page.tsx" "src/app/(pages)/pricing/page.tsx" "src/app/(pages)/artists/page.tsx" src/app/page.tsx "src/app/(pages)/how-it-works/HowItWorksClient.tsx" src/components/ApplicationForm.tsx "src/app/(pages)/signup/artist/layout.tsx" "src/app/(pages)/faqs/page.tsx"
git commit -m "feat(offer): founding-artist offer on every artist page, derived from pricing.ts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Notice period, reach and verification claims match what the platform does

**Files:**
- Modify: `src/components/ArtistPricingCards.tsx:185`
- Modify: `src/components/marketing/CustomerGuide.tsx:101`
- Modify: `src/app/(pages)/signup/page.tsx:20`, `src/app/(pages)/browse/layout.tsx:6`, `src/app/(pages)/browse/page.tsx:2896`, `src/app/waitlist/page.tsx:345`
- Modify: `tests/integration/public-claims.test.ts`

- [ ] **Step 1: Extend the failing test**

Append inside the existing `describe` in `tests/integration/public-claims.test.ts`:

```ts
  it("artist-facing pages do not say 'cancel any time' (the agreement needs 30 days' notice)", () => {
    for (const p of [
      "src/app/(pages)/pricing/page.tsx",
      "src/app/(pages)/apply/page.tsx",
      "src/app/(pages)/artists/page.tsx",
      "src/components/ArtistPricingCards.tsx",
      "src/components/marketing/ArtistGuide.tsx",
      "src/app/(pages)/how-it-works/HowItWorksClient.tsx",
      "src/components/ApplicationForm.tsx",
    ]) {
      expect(read(p), p).not.toMatch(/cancel any ?time/i);
    }
  });

  it("no page claims reach 'across the UK'", () => {
    expect(grepFiles("across the UK", ["src/app", "src/components"])).toEqual([]);
  });

  it("the buyer FAQ does not promise reviews or identity checks the platform lacks", () => {
    expect(read("src/components/marketing/CustomerGuide.tsx")).not.toMatch(/and reviews|verify identity/i);
  });
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run tests/integration/public-claims.test.ts`
Expected: three new FAILs.

- [ ] **Step 3: Fix the copy**

`src/components/ArtistPricingCards.tsx:185`: `Annual plans include two months free (save ~17%). Cancel anytime.` becomes `Annual plans include two months free (save ~17%). 30 days&rsquo; notice to leave.`

`src/components/marketing/CustomerGuide.tsx:101`, the answer becomes:
`Every artist on Wallplace is reviewed by our curation team before going live. We review the portfolio and confirm the work is theirs. Profiles show the artist's work and where it has been placed.`

`src/app/(pages)/signup/page.tsx:20`: `across the UK` becomes `across London`.
`src/app/(pages)/browse/layout.tsx:6`: `independent artists across the UK` becomes `independent artists in London`.
`src/app/(pages)/browse/page.tsx:2896`: `venues across the UK.` becomes `venues across London.`
`src/app/waitlist/page.tsx:345`: `across the UK` becomes `across London`.

Venue-facing "cancel any time" (`signup/venue/layout.tsx`, `PaymentClient.tsx`) is true for venues and stays.

- [ ] **Step 4: Run, gate, commit**

Run: `npx vitest run tests/integration/public-claims.test.ts && npm run check`

```bash
git add src/components/ArtistPricingCards.tsx src/components/marketing/CustomerGuide.tsx "src/app/(pages)/signup/page.tsx" "src/app/(pages)/browse/layout.tsx" "src/app/(pages)/browse/page.tsx" src/app/waitlist/page.tsx tests/integration/public-claims.test.ts
git commit -m "fix(copy): notice period, reach and verification claims match what the platform does

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Wave 3: trust and legal

### Task 9: Venue photo captions stop inventing places (9b uses the commissioned set, only if D2 says yes)

`VenueGuide.tsx` renders on `/venues` and `/how-it-works`. Its three stock photos are captioned "Independent cafe, Peckham", "Wine bar, Bermondsey", "Brunch spot, Hackney". The identical bug was fixed on `/curated` with a code comment explaining why; the fix never crossed over.

**Files:**
- Modify: `src/components/marketing/VenueGuide.tsx` (`venuePhotos` at lines 80 to 93; the Image Break at ~274)
- Modify: `tests/integration/public-claims.test.ts`
- 9b only: modify `tests/integration/programmes-photography-scope.test.ts`

- [ ] **Step 1: Extend the failing test**

Append inside the `describe` in `tests/integration/public-claims.test.ts`:

```ts
  it("venue photo captions name a type, never an invented place", () => {
    expect(read("src/components/marketing/VenueGuide.tsx")).not.toMatch(
      /caption: "[^"]*, (Peckham|Bermondsey|Hackney|Margate|Shoreditch|Camberwell|Islington|Deptford)"/,
    );
  });
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run tests/integration/public-claims.test.ts`

- [ ] **Step 3a (default, D2 = no): captions by type, decorative banner**

In `VenueGuide.tsx` change the three captions to `Independent café`, `Wine bar`, `Brunch spot` (images unchanged). On the Image Break, the wine-bar photo is reused a few hundred pixels below the grid; it is decorative behind text, so change `alt="Wine bar with art"` to `alt=""`.

- [ ] **Step 3b (only if D2 = yes): commissioned photography, captioned by type**

Replace `venuePhotos`:

```ts
// Real Wallplace-commissioned photography, captioned with the venue TYPE
// only (no place name, no business name), matching /curated. See the
// comment above VENUE_PLACEMENTS in CuratedClient.tsx for why.
const venuePhotos = [
  {
    caption: "Café",
    alt: "An empty café with a long bare wall, ready for art",
    image: "/images/programmes/venues-cafe-before.webp",
  },
  {
    caption: "Hotel lounge",
    alt: "A hotel lounge with armchairs and a large bare wall",
    image: "/images/programmes/programmes-hotel-lounge.webp",
  },
  {
    caption: "Office reception",
    alt: "An office reception with a large bare wall behind the desk",
    image: "/images/programmes/programmes-office-reception.webp",
  },
];
```

In the render change `alt={venue.caption}` to `alt={venue.alt}`. Replace the Image Break `src` with `/images/programmes/programmes-installation.webp` and `alt=""`. In `tests/integration/programmes-photography-scope.test.ts` remove `"src/components/marketing/VenueGuide.tsx"` from `FORBIDDEN_FILES` and add a comment: `// VenueGuide left this list under decision D2 (2026-09-02).`

- [ ] **Step 4: Run, gate, commit**

Run: `npx vitest run tests/integration/public-claims.test.ts tests/integration/programmes-photography-scope.test.ts && npm run check`

```bash
git add src/components/marketing/VenueGuide.tsx tests/integration/public-claims.test.ts tests/integration/programmes-photography-scope.test.ts
git commit -m "fix(venues): photo captions stop inventing places

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: The artist agreement covers programme rent; rent copy matches the rotation cadence

Two contradictions and one omission: `/pricing` says a placement is worth £120 a year while `/programmes` says pieces rotate twice a year; the site never states the artists' share of a programme fee; and the signed agreement has no programme rent clause at all.

**Files:**
- Modify: `src/lib/curation-tiers.ts` (after `PROGRAMME_RENT_SHARE_MAX`), `src/lib/curation-tiers.test.ts`
- Modify: `src/app/(pages)/artist-agreement/page.tsx` (imports; "Last updated" at line 16; new section before "10. Direct Purchase")
- Modify: `src/app/(pages)/pricing/page.tsx` (FAQ answer at ~117; paragraph at ~315 to 327; import)
- Modify: `src/app/(pages)/faqs/page.tsx` (programme rent answer at ~105 to 125; import)
- Modify: `src/app/(pages)/programmes/ProgrammesClient.tsx` (after the VAT note at ~349; import)
- Modify: `tests/integration/public-claims.test.ts`

**Interfaces:**
- Produces: `PROGRAMME_RENT_SHARE_TARGET = 0.4`, `PROGRAMME_STANDARD_ROTATIONS_PER_YEAR = 2`, `PROGRAMME_PIECE_STINT_MONTHS = 6`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/curation-tiers.test.ts` (extend its import from `./curation-tiers`):

```ts
describe("programme rent copy constants", () => {
  it("states a rent-share target below the pool guard that the ladder actually lands on", () => {
    expect(PROGRAMME_RENT_SHARE_TARGET).toBeLessThan(PROGRAMME_RENT_SHARE_MAX);
    for (const rung of PROGRAMME_LADDER) {
      const share = (rung.pieces * PROGRAMME_PIECE_RENT_TARGET_GBP) / rung.monthlyGbp;
      expect(Math.abs(share - PROGRAMME_RENT_SHARE_TARGET)).toBeLessThan(0.06);
    }
  });

  it("a standard stint is six months, from two rotations a year", () => {
    expect(PROGRAMME_STANDARD_ROTATIONS_PER_YEAR).toBe(2);
    expect(PROGRAMME_PIECE_STINT_MONTHS).toBe(6);
  });
});
```

Append inside the `describe` in `tests/integration/public-claims.test.ts`:

```ts
  it("artist rent copy uses the stint length, not twelve months on one wall", () => {
    const pricing = read("src/app/(pages)/pricing/page.tsx");
    expect(pricing).not.toMatch(/PROGRAMME_PIECE_RENT_TARGET_GBP \* 12/);
    expect(pricing).toMatch(/PROGRAMME_PIECE_STINT_MONTHS/);
    expect(read("src/app/(pages)/artist-agreement/page.tsx")).toMatch(/9A\. Programme Rent/);
  });
```

- [ ] **Step 2: Run them, expect failure**

Run: `npx vitest run src/lib/curation-tiers.test.ts tests/integration/public-claims.test.ts`

- [ ] **Step 3: Add the constants**

In `src/lib/curation-tiers.ts`, after `PROGRAMME_RENT_SHARE_MAX`:

```ts
/**
 * Operating target for the artist rent pool as a share of a site's
 * monthly-equivalent fee. PROGRAMME_RENT_SHARE_MAX (70%) is the mis-quote
 * guard; this is where a normal quote lands, and it is the figure the
 * public pages state so nobody has to reverse-engineer it from the ladder.
 */
export const PROGRAMME_RENT_SHARE_TARGET = 0.4;

/** Standard rotation cadence, twice a year, so a piece hangs about six months. */
export const PROGRAMME_STANDARD_ROTATIONS_PER_YEAR = 2;
export const PROGRAMME_PIECE_STINT_MONTHS = 12 / PROGRAMME_STANDARD_ROTATIONS_PER_YEAR;
```

- [ ] **Step 4: Add section 9A to the artist agreement**

In `src/app/(pages)/artist-agreement/page.tsx` add `import { gbp, PROGRAMME_PIECE_RENT_MIN_GBP, PROGRAMME_PIECE_RENT_TARGET_GBP } from "@/lib/curation-tiers";`, change `Last updated: April 2026` to `Last updated: September 2026`, and insert before the `<div>` holding `10. Direct Purchase`:

```tsx
              <div>
                <h2 className="text-2xl mb-4">9A. Programme Rent</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Some venues pay Wallplace a recurring fee for a managed programme (a &ldquo;Programme&rdquo;), under which Wallplace curates, installs and rotates artwork on the venue&rsquo;s walls. Where your artwork is placed under a Programme, you are paid rent for each month it hangs there, funded from the venue&rsquo;s fee.</p>
                  <p>The rent for each piece is set when the placement is agreed and shown on the placement record. It is typically around {gbp(PROGRAMME_PIECE_RENT_TARGET_GBP)} per piece per month and never less than {gbp(PROGRAMME_PIECE_RENT_MIN_GBP)}.</p>
                  <p>Rent accrues each time the venue&rsquo;s Programme invoice is paid, for the pieces on the wall in that billing period, and is settled to you quarterly through Stripe Connect. You must have payouts enabled to receive it. Rent stops when a piece is taken down at a rotation, when it sells, or when the venue&rsquo;s Programme ends or lapses.</p>
                  <p>If a Programme invoice is refunded or disputed, rent accrued for that invoice but not yet paid to you is cancelled. Rent already paid to you is not reclaimed automatically; Wallplace will contact you if a refund affects a period you have already been paid for.</p>
                  <p>Programme placements are allocated by Wallplace&rsquo;s curators to suit each venue. They are not guaranteed, and a piece may be rotated off a wall at Wallplace&rsquo;s discretion. Sales of Programme pieces are handled under sections 3 and 10 as normal.</p>
                </div>
              </div>
```

- [ ] **Step 5: Reconcile the rent copy**

`src/app/(pages)/pricing/page.tsx`: import becomes `import { gbp, CURATION_TIERS, PROGRAMME_PIECE_RENT_TARGET_GBP, PROGRAMME_PIECE_STINT_MONTHS } from "@/lib/curation-tiers";`. The FAQ answer "Can a placement earn me money before it sells?" becomes:

```ts
    answer:
      `Yes, on a programme. Some venues pay Wallplace a monthly fee to have their walls handled for them, and a share of that fee goes to the artists whose work is hanging there, usually around ${gbp(PROGRAMME_PIECE_RENT_TARGET_GBP)} per piece per month. A piece hangs for about ${PROGRAMME_PIECE_STINT_MONTHS} months before the standard rotation, so one placement is worth around ${gbp(PROGRAMME_PIECE_RENT_TARGET_GBP * PROGRAMME_PIECE_STINT_MONTHS)}, and rent stops when the piece comes down or sells. Rent is settled quarterly through Stripe Connect. Programme placements are not guaranteed.`,
```

The Pro paragraph (the one containing "Over a year that is") becomes:

```tsx
              <p className="text-muted leading-relaxed mb-4">
                Some venues pay us a monthly fee to have their walls handled,
                and a share of that goes to the artists hanging there, usually
                around {gbp(PROGRAMME_PIECE_RENT_TARGET_GBP)} per piece per
                month. A piece on a standard programme hangs for about{" "}
                {PROGRAMME_PIECE_STINT_MONTHS} months before rotation, so one
                placement is worth around{" "}
                {gbp(PROGRAMME_PIECE_RENT_TARGET_GBP * PROGRAMME_PIECE_STINT_MONTHS)},
                and two placements across a year cover a Core membership. Rent
                stops when a piece comes down or sells. Programme placements
                are not guaranteed; they depend on venue demand like any other.
              </p>
```

`src/app/(pages)/faqs/page.tsx`: import becomes `import { gbp, PROGRAMME_PIECE_RENT_TARGET_GBP, PROGRAMME_PIECE_STINT_MONTHS, PROGRAMME_RENT_SHARE_TARGET } from "@/lib/curation-tiers";`. Add a third `<p>` to "How does programme rent work?":

```tsx
        <p>
          A piece usually hangs for about {PROGRAMME_PIECE_STINT_MONTHS} months
          before the standard rotation, and rent stops when it comes down or
          sells. Across a site, artist rent is typically around{" "}
          {Math.round(PROGRAMME_RENT_SHARE_TARGET * 100)}% of what the venue
          pays; the rest covers curation, installation, rotation and
          Wallplace&rsquo;s margin.
        </p>
```

`src/app/(pages)/programmes/ProgrammesClient.tsx`: add `PROGRAMME_RENT_SHARE_TARGET` to its `@/lib/curation-tiers` import and, directly after the VAT note paragraph:

```tsx
              <p className="text-xs text-muted mt-2 max-w-xl">
                Around {Math.round(PROGRAMME_RENT_SHARE_TARGET * 100)}% of your fee is paid to the
                artists on your walls as rent.
              </p>
```

- [ ] **Step 6: Run, gate, commit**

Run: `npx vitest run src/lib/curation-tiers.test.ts tests/integration/public-claims.test.ts tests/integration/one-curated-price-source.test.ts && npm run check`

```bash
git add src/lib/curation-tiers.ts src/lib/curation-tiers.test.ts "src/app/(pages)/artist-agreement/page.tsx" "src/app/(pages)/pricing/page.tsx" "src/app/(pages)/faqs/page.tsx" "src/app/(pages)/programmes/ProgrammesClient.tsx" tests/integration/public-claims.test.ts
git commit -m "feat(programmes): artist agreement covers programme rent; rent copy matches the rotation cadence

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: FAQ gaps: installer, physical theft, programme lead time and end of term

**Files:**
- Modify: `src/app/(pages)/faqs/page.tsx` ("Who installs the artwork, us or the artist?" at ~248; "Is my artwork protected from theft?" at ~188)
- Modify: `src/app/(pages)/programmes/ProgrammesClient.tsx` (`FAQ_ITEMS`, lines 112 to 133)
- Create: `src/app/(pages)/faqs/faq-coverage.test.ts`

Wording note: the installer answer states what is true today (we appoint the installer, insurance details on request). Once owner action A6 confirms cover, upgrade it to say damage during a Wallplace-arranged install is claimed against the installer's policy. The 30-day notice figure is decision D4's default.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// Launch audit, section 05: questions a buyer asks that the site did not answer.
describe("FAQ coverage", () => {
  it("answers physical theft, not only image theft", () => {
    expect(read("src/app/(pages)/faqs/page.tsx")).toMatch(/In a venue: if a piece goes missing/);
  });

  it("says who installs on a Programme", () => {
    expect(read("src/app/(pages)/faqs/page.tsx")).toMatch(/On a Wallplace Programme, installation is included/);
  });

  it("the Programmes FAQ covers installer, lead time and end of term", () => {
    const src = read("src/app/(pages)/programmes/ProgrammesClient.tsx");
    expect(src).toMatch(/Who installs, and what if something gets damaged\?/);
    expect(src).toMatch(/How long from quote to art on the walls\?/);
    expect(src).toMatch(/What happens at the end of the term\?/);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run "src/app/(pages)/faqs/faq-coverage.test.ts"`

- [ ] **Step 3: Add the answers**

`src/app/(pages)/faqs/page.tsx`, "Who installs the artwork, us or the artist?": add a third `<p>` after the art-handling paragraph:

```tsx
        <p>
          On a Wallplace Programme, installation is included and arranged by
          us. We appoint the installer and we are your point of contact if
          anything goes wrong on the day; the installer&rsquo;s insurance
          details are available on request before the visit.
        </p>
```

Same file, "Is my artwork protected from theft?": convert the string answer to JSX. Keep the existing sentence about reduced resolution, right-click and dragging verbatim inside the first `<p>`, prefixed with `Online: `, then add:

```tsx
        <p>
          In a venue: if a piece goes missing, the venue is liable under the
          Venue Partnership Agreement where it failed to take reasonable care,
          and we help you pursue it through{" "}
          <Link href="/complaints">our complaints process</Link>. Insure the
          work for its full value while it is on display.
        </p>
```

`src/app/(pages)/programmes/ProgrammesClient.tsx`, append to `FAQ_ITEMS`:

```ts
  {
    question: "Who installs, and what if something gets damaged?",
    answer: "We arrange installation and appoint the installer, so we are your point of contact on the day and afterwards. The installer's insurance details are available on request before the visit.",
  },
  {
    question: "How long from quote to art on the walls?",
    answer: "Usually three to four weeks from accepting a quote: a site visit, a shortlist for you to approve, then a single installation day.",
  },
  {
    question: "What happens at the end of the term?",
    answer: "After the first twelve months the programme rolls on month to month. Give 30 days' notice and we collect the work at the next visit and leave the walls as we found them.",
  },
```

- [ ] **Step 4: Run, gate, commit**

Run: `npx vitest run "src/app/(pages)/faqs/faq-coverage.test.ts" tests/integration/one-curated-price-source.test.ts && npm run check`

```bash
git add "src/app/(pages)/faqs/page.tsx" "src/app/(pages)/faqs/faq-coverage.test.ts" "src/app/(pages)/programmes/ProgrammesClient.tsx"
git commit -m "feat(faq): installer, physical theft, programme lead time and end of term answered

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Venues confirm insurance per placement, not at registration

"Completely free, no commitments" sits directly above a mandatory liability tick. The venue agreement they already accept carries section 4 (Damage and Liability) and section 5 (Insurance), and the consignment record captures the insured value per piece (`src/app/api/placements/[id]/record/route.ts`, `insuredValueGbp`). The tick is not sent to any API; it is client-side gating only.

**Files:**
- Modify: `src/app/(pages)/signup/venue/page.tsx` (state at line 99; label block at lines 446 to 458; `disabled` at line 469)
- Modify: `src/app/(pages)/signup/venue/page.test.tsx` (line 132)

- [ ] **Step 1: Write the failing test**

In `src/app/(pages)/signup/venue/page.test.tsx` delete line 132 (`fireEvent.click(screen.getByRole("checkbox", { name: /public liability insurance/i }));`) and add:

```tsx
describe("venue sign-up asks nothing about insurance (launch audit, section 05)", () => {
  it("has no insurance declaration; the agreement and the placement record carry it", () => {
    render(<RegisterVenuePage />);
    expect(screen.queryByRole("checkbox", { name: /public liability insurance/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run "src/app/(pages)/signup/venue/page.test.tsx"`
Expected: the new test FAILS (checkbox present); the submit tests still pass because the tick is no longer clicked but is still required, so they FAIL too. Both failures clear in Step 3.

- [ ] **Step 3: Remove the tick**

In `src/app/(pages)/signup/venue/page.tsx`: delete `const [acknowledgedInsurance, setAcknowledgedInsurance] = useState(false);`; delete the whole `<label className="flex items-start gap-3 cursor-pointer select-none">` block containing the insurance sentence; change the submit `disabled` expression to `submitting || !agreedToTos || !agreedToVenueTerms || !turnstileToken`. Directly after the `TermsCheckbox` with `termsType="venue_agreement"` add:

```tsx
                <p className="text-xs text-muted">
                  The agreement covers care of artwork and your insurance position. You confirm cover for each piece when a placement is recorded, not now.
                </p>
```

- [ ] **Step 4: Run, gate, commit**

Run: `npx vitest run "src/app/(pages)/signup/venue/page.test.tsx" && npm run check`

```bash
git add "src/app/(pages)/signup/venue/page.tsx" "src/app/(pages)/signup/venue/page.test.tsx"
git commit -m "fix(signup): venues confirm insurance per placement, not at registration

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Wave 4: ships now, fills in when owner inputs arrive

### Task 13: Company identity in one place; agreements switch the moment it is filled in

Ships before incorporation (A1) so that, when it lands, the owner fills three strings and every legal page and the footer update together.

**Files:**
- Create: `src/lib/company.ts`, `src/lib/company.test.ts`
- Create: `src/components/LegalEntityNote.tsx`, `src/components/LegalEntityNote.test.tsx`
- Modify: `src/app/(pages)/artist-agreement/page.tsx` (the note `<div>` at lines 18 to 22), `src/app/(pages)/venue-agreement/page.tsx` (the same note near line 18 to 22), `src/app/(pages)/terms/page.tsx` (the same note; find it with `grep -n "being incorporated"`)
- Modify: `src/components/Footer.tsx` (the copyright line; find it with `grep -n "All rights" src/components/Footer.tsx`)

**Interfaces:**
- Produces: `COMPANY` `{ tradingName, legalName, number, registeredOffice }`, `isIncorporated(): boolean`, `<LegalEntityNote />`.

- [ ] **Step 1: Write the failing tests**

`src/lib/company.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COMPANY, isIncorporated } from "./company";

describe("company identity", () => {
  it("is not incorporated while the number is blank", () => {
    expect(isIncorporated()).toBe(COMPANY.number.trim().length > 0);
  });

  it("once a number is set, the legal name and office must be too", () => {
    if (isIncorporated()) {
      expect(COMPANY.legalName.trim()).not.toBe("");
      expect(COMPANY.registeredOffice.trim()).not.toBe("");
    }
  });
});
```

`src/components/LegalEntityNote.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { company } = vi.hoisted(() => ({
  company: { tradingName: "Wallplace", legalName: "", number: "", registeredOffice: "" },
}));
vi.mock("@/lib/company", () => ({
  COMPANY: company,
  isIncorporated: () => company.number.trim().length > 0,
}));

import LegalEntityNote from "./LegalEntityNote";

afterEach(() => {
  cleanup();
  company.legalName = "";
  company.number = "";
  company.registeredOffice = "";
});

describe("<LegalEntityNote />", () => {
  it("shows the pre-incorporation note while there is no company number", () => {
    render(<LegalEntityNote />);
    expect(screen.getByText(/in the process of being incorporated/)).toBeTruthy();
  });

  it("shows the registered details once they exist", () => {
    company.legalName = "Wallplace Ltd";
    company.number = "12345678";
    company.registeredOffice = "1 Example Street, London";
    render(<LegalEntityNote />);
    expect(screen.getByText(/company number 12345678/)).toBeTruthy();
    expect(screen.queryByText(/being incorporated/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them, expect failure**

Run: `npx vitest run src/lib/company.test.ts src/components/LegalEntityNote.test.tsx`
Expected: FAIL, modules missing.

- [ ] **Step 3: Create the module and component**

`src/lib/company.ts`:

```ts
/**
 * Legal identity, filled in once incorporation completes (owner action A1 in
 * docs/superpowers/plans/2026-09-02-launch-readiness.md). While `number` is
 * blank the agreements and terms show the pre-incorporation note; once it is
 * set they show the registered details. One place, so the legal pages and the
 * footer cannot disagree.
 */
export const COMPANY = {
  tradingName: "Wallplace",
  legalName: "",
  number: "",
  registeredOffice: "",
};

export function isIncorporated(): boolean {
  return COMPANY.number.trim().length > 0;
}
```

`src/components/LegalEntityNote.tsx`:

```tsx
import { COMPANY, isIncorporated } from "@/lib/company";

/** The identity block at the top of each agreement and the terms page. */
export default function LegalEntityNote() {
  return (
    <div className="bg-surface border border-border rounded-sm p-5 mb-16">
      <p className="text-sm text-muted leading-relaxed">
        {isIncorporated() ? (
          <>
            <strong className="text-foreground">{COMPANY.tradingName}</strong> is the trading name of {COMPANY.legalName}, a company registered in England and Wales (company number {COMPANY.number}), registered office {COMPANY.registeredOffice}.
          </>
        ) : (
          <>
            <strong className="text-foreground">Note:</strong> Wallplace is the trading name of a business in the process of being incorporated as a limited company in England and Wales. Once incorporated, this document will be updated to reflect the registered company name and number.
          </>
        )}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Use it on the three legal pages and in the footer**

In `artist-agreement/page.tsx`, `venue-agreement/page.tsx` and `terms/page.tsx`, replace the whole `<div className="bg-surface border border-border rounded-sm p-5 mb-16">` note block with `<LegalEntityNote />` and add `import LegalEntityNote from "@/components/LegalEntityNote";`.

In `src/components/Footer.tsx` add `import { COMPANY, isIncorporated } from "@/lib/company";` and, immediately after the copyright line's element:

```tsx
          {isIncorporated() && (
            <p className="text-xs text-muted">
              {COMPANY.legalName}, company number {COMPANY.number}. Registered office: {COMPANY.registeredOffice}.
            </p>
          )}
```

- [ ] **Step 5: Run, gate, commit**

Run: `npx vitest run src/lib/company.test.ts src/components/LegalEntityNote.test.tsx && npm run check`

```bash
git add src/lib/company.ts src/lib/company.test.ts src/components/LegalEntityNote.tsx src/components/LegalEntityNote.test.tsx "src/app/(pages)/artist-agreement/page.tsx" "src/app/(pages)/venue-agreement/page.tsx" "src/app/(pages)/terms/page.tsx" src/components/Footer.tsx
git commit -m "feat(legal): company identity in one place, agreements switch once incorporated

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

When A1 completes: fill `legalName`, `number`, `registeredOffice` in `src/lib/company.ts`, run the gate, commit as `chore(legal): registered company details`.

---

### Task 14: A case-study slot on /programmes that renders only when a real installation exists

**Files:**
- Modify: `src/app/(pages)/programmes/ProgrammesClient.tsx` (export a `CASE_STUDY` const near `PROOF_PLACEMENTS`; render block above the "Every artist has a real portfolio" section)
- Create: `src/app/(pages)/programmes/case-study.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { CASE_STUDY } from "./ProgrammesClient";

// Launch audit, section 05. Every "proof" photo on the site was a before
// shot and the only testimonial was attributed to Wallplace itself. This
// slot renders nothing until the owner supplies a real installation (A5),
// so the page can never show a fabricated case.
describe("CASE_STUDY", () => {
  it("is null or complete", () => {
    if (CASE_STUDY === null) return;
    expect(CASE_STUDY.image).toMatch(/^\/images\/programmes\/case-study-/);
    for (const key of ["venue", "quote", "attribution"] as const) {
      expect(CASE_STUDY[key].trim()).not.toBe("");
    }
  });
});
```

The file is `.tsx` because the link mock contains JSX.

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run "src/app/(pages)/programmes/case-study.test.tsx"`
Expected: FAIL, `CASE_STUDY` is not exported.

- [ ] **Step 3: Add the slot**

In `ProgrammesClient.tsx`, after `PROOF_PLACEMENTS`:

```ts
/**
 * The first real installation (owner action A5). Null until the owner
 * supplies the photo (public/images/programmes/case-study-1.webp), a venue
 * name they have permission to use, and a quote with attribution. Nothing
 * renders until all four exist.
 */
export const CASE_STUDY: {
  image: string;
  venue: string;
  quote: string;
  attribution: string;
} | null = null;
```

Above the `{/* ... "Every artist has a real portfolio" ... */}` section:

```tsx
        {CASE_STUDY && (
          <section className="py-20 lg:py-28 bg-surface">
            <div className="max-w-[1200px] mx-auto px-6">
              <AnimateIn>
                <div className="grid lg:grid-cols-2 gap-10 items-center">
                  <div className="aspect-[4/3] rounded-sm overflow-hidden relative">
                    <Image
                      src={CASE_STUDY.image}
                      alt={`Artwork installed at ${CASE_STUDY.venue}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-accent uppercase tracking-wider">On the wall</span>
                    <h2 className="text-3xl md:text-4xl mt-2 mb-6">{CASE_STUDY.venue}</h2>
                    <blockquote className="text-lg text-foreground leading-relaxed">&ldquo;{CASE_STUDY.quote}&rdquo;</blockquote>
                    <p className="mt-4 text-sm text-muted">{CASE_STUDY.attribution}</p>
                  </div>
                </div>
              </AnimateIn>
            </div>
          </section>
        )}
```

- [ ] **Step 4: Run, gate, commit**

Run: `npx vitest run "src/app/(pages)/programmes/case-study.test.tsx" tests/integration/one-curated-price-source.test.ts && npm run check`

```bash
git add "src/app/(pages)/programmes/ProgrammesClient.tsx" "src/app/(pages)/programmes/case-study.test.tsx"
git commit -m "feat(programmes): case-study slot, renders only when a real installation is supplied

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15 (only if D2 = yes): homepage For Venues grid uses the commissioned photography

The five-tile grid beside "Earn from your empty walls" cycles through an alpine lake, fog, a vintage camera, a deer and a night sky.

**Files:**
- Modify: `src/app/page.tsx` (the `hidden sm:grid grid-cols-5 grid-rows-4` block, ~lines 268 to 282)
- Modify: `tests/integration/programmes-photography-scope.test.ts` (remove `src/app/page.tsx` from `FORBIDDEN_FILES` with a D2 comment)
- Modify: `src/app/page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
describe("homepage venue grid (decision D2)", () => {
  it("shows rooms, not landscapes", () => {
    render(<Home />);
    expect(screen.getByLabelText("An empty café with a long bare wall, ready for art")).toBeTruthy();
    expect(screen.queryByLabelText("Misty forest landscape")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect failure, then replace the five tiles**

Keep the wrapper and the five `<div>` cells with their `col-span`/`row-span` classes; replace only each `<Image ... />`:

```tsx
<Image src="/images/programmes/programmes-office-reception.webp" alt="An office reception with a large bare wall behind the desk" fill className="object-cover" sizes="30vw" />
<Image src="/images/programmes/venues-cafe-before.webp" alt="An empty café with a long bare wall, ready for art" fill className="object-cover" sizes="20vw" />
<Image src="/images/programmes/programmes-hotel-lounge.webp" alt="A hotel lounge with armchairs and a large bare wall" fill className="object-cover" sizes="20vw" />
<Image src="/images/programmes/programmes-installation.webp" alt="Two people hanging a framed artwork, checking it with a spirit level" fill className="object-cover" sizes="20vw" />
<Image src="/images/programmes/programmes-rotation.webp" alt="A bare wall with the faded outline of a frame, wrapped canvases leaning below" fill className="object-cover" sizes="30vw" />
```

Remove `"src/app/page.tsx"` from `FORBIDDEN_FILES` in the scope test with `// page.tsx left this list under decision D2 (2026-09-02).`

- [ ] **Step 3: Run, gate, commit**

Run: `npx vitest run src/app/page.test.tsx tests/integration/programmes-photography-scope.test.ts && npm run check`

```bash
git add src/app/page.tsx src/app/page.test.tsx tests/integration/programmes-photography-scope.test.ts
git commit -m "feat(home): venue grid shows rooms from the commissioned set (decision D2)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Held back by owner instruction (say the word and they slot in after Task 2)

### Held back A: Seed bios stop claiming credentials at real institutions

Not scheduled: the owner asked that nothing about the seed artists change beyond the pill. Kept ready because every claim below can be checked against a real institution in minutes, and they are live today.

**Files:**
- Modify: `src/data/artists.ts` (the bios listed in Step 3, plus any the test finds)
- Create: `src/data/artists.seed-claims.test.ts`

**Rule for every edit:** a fictional artist may describe a practice, materials, subjects, a neighbourhood and a series. They may not name a real institution, prize, publisher, gallery, fair, employer or person as a credential (studied at, exhibited at, shortlisted for, commissioned by, published by, held in the collection of, assisted, lectures at). Remove the claim, keep the practice. While you are in a sentence, drop any `—` in it (public copy, no em dashes).

- [ ] **Step 1: Write the failing test**

Create `src/data/artists.seed-claims.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Launch audit, blocker 1. The seed artists are fictional. Their bios claimed
// study, exhibitions, awards, commissions, publications, teaching posts and
// acquisitions at real, named institutions, rendered under a Verified badge
// above live purchase controls. A fictional person cannot hold a real
// credential, so bios may describe a practice but never name one of these.
const BANNED = [
  "Royal College of Art", "National Portrait Gallery", "Taylor Wessing",
  "Victoria and Albert", "V&A", "Saatchi", "Deutsche", "Thames & Hudson",
  "Hiscox", "Government Art Collection", "Foster + Partners", "Zaha Hadid",
  "Foam Talent", "British Journal of Photography", "Whitechapel",
  "Truman Brewery", "Photo London", "Central Saint Martins",
  "Camberwell College", "Beaux-Arts", "University of Westminster",
  "Mary McCartney", "Nadav Kander", "Bartlett", "Photographers' Gallery",
  "Japan House", "Jerwood", "Photoworks", "Autograph", "GOST Books",
  "London College of Communication", "Design Museum", "Serpentine",
  "London Design Festival", "Palazzo Strozzi", "Paris Photo", "at Collect",
  "BP Portrait", "Lynn Painter", "University of South Wales", "Slade",
  "Goldsmiths", "Tate", "Hayward", "Royal Academy", "Frieze", "Sotheby",
  "Christie's", "Barbican Centre", "at the Barbican",
];

function bios(source: string): string[] {
  const out: string[] = [];
  const re = /(shortBio|extendedBio):\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.push(m[2]);
  return out;
}

describe("seed artist bios claim no real credentials", () => {
  const source = readFileSync(join(process.cwd(), "src/data/artists.ts"), "utf8");
  const all = bios(source);

  it("finds the bios (sanity)", () => {
    expect(all.length).toBeGreaterThan(40);
  });

  for (const name of BANNED) {
    it(`no bio names ${name}`, () => {
      const hits = all.filter((b) => b.includes(name));
      expect(hits, hits.join("\n\n")).toEqual([]);
    });
  }

  it("no seed artist is hard-coded as verified", () => {
    expect(source).not.toMatch(/isVerified:\s*true/);
  });
});
```

- [ ] **Step 2: Run it, expect failures naming the bios**

Run: `npx vitest run src/data/artists.seed-claims.test.ts`
Expected: FAIL on at least Royal College of Art, National Portrait Gallery, Taylor Wessing and the others found at plan time. The failure message prints each offending bio.

- [ ] **Step 3: Rewrite the sentences**

Apply these exact replacements in `src/data/artists.ts` (line numbers as of plan time; match on the text).

Kai Williams, `extendedBio` (line 562). Replace the final three sentences, from "Kai studied at the Royal College of Art" to the end of the string, with:
`Kai works with both digital and analogue processes, and their monochrome and desaturated colour prints are made in small editions. Alongside the photography they write a regular newsletter on urban observation.`

Elise Moreau, `extendedBio` (line 660). Replace from "She studied at École des Beaux-Arts" to the end with:
`Elise trained as a painter before moving to photography, and her practice sits firmly in the fine art tradition: each image is conceived as a singular artwork rather than part of a documentary record. Her prints are produced in strictly limited editions.`

Anika Byrne, `shortBio` (line 854). Replace "Her intimate, carefully lit work has been exhibited at the National Portrait Gallery and published in The British Journal of Photography." with:
`Her intimate, carefully lit work is shot in her own studio and printed in small editions.`

Anika Byrne, `extendedBio` (line 856). Replace from "Her ongoing series 'Neighbours'" to the end with:
`Her ongoing series 'Neighbours' is a set of intimate portraits of the people who live on her street, made over several years and still growing.`

Daniel Frost, `extendedBio` (line 1151). Replace from "Daniel studied Architecture at the Bartlett" to the end with:
`Daniel trained in architecture before turning to photography, and that structural understanding is evident in every composition. His ongoing series 'Verticals' is printed at large scale for offices and lobbies.`

Yuki Tanaka, `extendedBio` (line 1249). Replace "before moving to London to study at the Royal College of Art, eventually settling" with `before moving to London, eventually settling`; replace from "Her work has been shown at The Photographers' Gallery" to the end with:
`Her prints are made in small editions and held in private collections in Japan and Europe.`

Chloe Baptiste, `extendedBio` (line 1347). Replace from "Chloe studied Documentary Photography" to the end with:
`Her long-running series 'Tottenham Stories' is the heart of her practice, and she prints from it in small editions.`

Freya Anderson, `extendedBio` (line 1543). Replace "Freya studied Textile Design at the Royal College of Art before turning to photography" with `Freya trained in textile design before turning to photography`; delete the final sentence "Her work has been shown at The Design Museum, Serpentine Gallery, and London Design Festival."

Jasmine Duval, `extendedBio` (line 1937). Replace from "Jasmine studied Photography at the Royal College of Art" to the end with:
`Jasmine trained in photography in London and spent a year working in Florence, where much of the series on her profile was begun.`

Bea (line 3510). Replace "Swedish-born Bea studied ceramics at the Royal College of Art before establishing" with `Swedish-born Bea trained in ceramics before establishing`; replace the final sentence "Bea exhibits at Collect, the international art fair for contemporary craft." with `Bea shows new work each year at contemporary craft fairs.`

Callum (line 3609). Replace "Callum studied Drawing at Camberwell College of Arts before relocating to Leeds" with `Callum trained in drawing in London before relocating to Leeds`; replace the final sentence beginning "Callum has exhibited at the National Portrait Gallery's BP Portrait Award" with `Callum shows regularly with galleries across the North of England.`

Then rerun the test. For any further bio it names, apply the rule at the top of this task.

- [ ] **Step 4: Run it, expect pass**

Run: `npx vitest run src/data/artists.seed-claims.test.ts`
Expected: PASS, every banned name has zero hits.

- [ ] **Step 5: Gate and commit**

Run: `npm run check`
Expected: green.

```bash
git add src/data/artists.ts src/data/artists.seed-claims.test.ts
git commit -m "fix(catalogue): seed bios no longer claim credentials at real institutions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Held back B: No Verified tick on seed artists

Not scheduled, same instruction. A "Verified artist, reviewed and approved by Wallplace" tooltip beside a blue "Sample" pill contradicts itself; this is the one-line fix.

**Files:**
- Modify: `src/lib/db/merged-data.ts` (both places Task 1 leaves as `isVerified: ... ?? true`)
- Modify: `src/lib/db/merged-data.test.ts`

- [ ] **Step 1: Extend the test**

In the "shows seed artists by default in production" test add `expect(seed?.isVerified).toBe(false);` and `expect((await getArtistBySlug("seed-one"))?.isVerified).toBe(false);`.

- [ ] **Step 2: Run it, expect failure, then change both lines**

In `getAllArtists` the map becomes `.map((a) => ({ ...a, isVerified: false, isSeedArtist: true }))`; in `getArtistBySlug` the static return becomes `return { ...staticArtist, isVerified: false, isSeedArtist: true };`. Delete the "Plan F #12: hand-curated seed artists are verified by definition" comment, which is no longer true.

- [ ] **Step 3: Run, gate, commit**

Run: `npx vitest run src/lib/db/merged-data.test.ts && npm run check`

```bash
git add src/lib/db/merged-data.ts src/lib/db/merged-data.test.ts
git commit -m "fix(catalogue): seed artists never carry the Verified badge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Deliberately left alone

- `/venues` as a page. It duplicates the How It Works venue tab but is linked from four places and is the natural landing page for a flyer or cold email. Keep it, don't promote it.
- The artwork detail page's grey padding at desktop. Design judgement, not a defect; needs the owner's eye.
- The identical section rhythm across six marketing pages. Real, but not a launch blocker.
- Curated pay-first (D3) unless the owner asks.
- VAT. Copy already says "if Wallplace becomes VAT registered"; registration is a threshold question for the owner.
- The Picsum placeholder images on seed works. They contradict their own titles, and they stay for exactly as long as D1 keeps the seed visible; the fix is the env var, not new images.

## Order of execution

Wave 1 (Tasks 1 to 5) then push and deploy after the owner's yes (A8). Wave 2 (6 to 8) is the revenue set and can follow in the same deploy. Wave 3 (9 to 12) before the first workplace pitch. Wave 4 (13 to 15) ships now and fills in as A1, A5 and D2 land.
