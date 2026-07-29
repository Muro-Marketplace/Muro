# 08 — Surface cull: evidence base for Keep / Cut / Defer

Status: proposal, awaiting owner decision on three items (§7).
Scope: read-only audit. No source file was modified to produce this document.
Date of measurement: 2026-07-29, branch `claude/wallplace-stress-test-035bd9`.

---

## 0. Headline

Measured surface, `wc -l` on `website/src`:

| Metric | Count |
|---|---|
| `page.tsx` route files | **119** |
| `api/**/route.ts` files | **119** |
| Total TS/TSX LOC under `src` | **136,398** |
| `src/app` | 77,044 |
| `src/components` | 24,896 |
| `src/lib` | 18,933 |
| `src/emails` | 8,758 |
| Test files (`*.test.*`, `*.spec.*`) | 130 |

Three numbers matter for the decision:

1. **2,126 LOC and 15 routes are provably dead** — nothing anywhere in the repo links to them, imports them, or calls them. This is a no-judgement-required deletion.
2. **3,255 LOC of email templates (59 of 123) have no runtime send path.** They exist only as entries in a registry consumed by a dev preview page which is itself unreachable.
3. **The wall visualizer is ~14,000 production LOC — roughly double the previously recorded estimate** of ~7,400 in `docs/plans/2026-07-11-stress-test-remediation-spec.md:491`, because that figure omitted `components/visualizer/*` (5,230), the artist showroom (1,117) and a legacy duplicate component. It is fully reachable, flag-on in production, and is the single largest Keep/Cut question in the codebase.

The good news: this is a **clean codebase**. Zero `.bak` / `.old` / `.orig` files. Exactly **one** orphaned React component out of ~90. Migrations are numbered and documented with rollback notes. The waste is concentrated in a handful of identifiable surfaces, not smeared across the repo.

---

## 1. Method and its limits

Every reachability claim below was produced by the same procedure:

1. **Inbound link grep** — for a route `/x`, grep all of `src` for `"/x"`, `'/x'`, `` `/x ``, `href="/x`, `push("/x`, `redirect("/x`, excluding the surface's own files.
2. **Config sweep** — `next.config.ts` `redirects()`, `src/app/sitemap.ts` `STATIC_ROUTES`, `src/app/robots.ts`, `vercel.json` `crons`. There is **no `middleware.ts`** in this project, so there is no route-matcher layer to check.
3. **Nav config read** — the four portal layouts and `Header.tsx` / `Footer.tsx` hold every UI-navigable path as literal arrays. These are the definitive "what can a user click" source.
4. **API caller scan** — for each of the 119 route files, grep for the route path; for dynamic routes, grep the static prefix (`/api/placements/[id]` → `/api/placements`) so template-literal callers (`` `/api/placements/${id}` ``) are caught. The naive version of this scan produces ~44 false orphans; the prefix version produces 13, of which 11 are external-by-design.
5. **Import-graph check** — for each component/module, grep its export name across `src`, excluding itself and its own test file.

**Known limits, stated honestly:**

- Grep cannot see a path assembled at runtime from fragments (`` `/api/${resource}/${id}` ``). I spot-checked for this pattern and found none, but it is not a proof.
- "Zero importers" for a component does not prove zero runtime use if something resolves it dynamically by string. Next.js file-based routing is the main dynamic resolver here, and it is covered by the route-file enumeration.
- Email templates pasted into the Supabase Auth dashboard would have no code reference by design. This materially affects the `Account*` templates — see §4.2.
- I did not query the production database. Table-usage claims come from migrations and code, not from row counts. **Before any table drop, check row counts in production.**

---

## 2. Feature flags — the governing context

`src/lib/feature-flags.ts` is the whole flag system. Five flags, env-driven, with `NODE_ENV`-aware defaults:

| Flag | dev default | **prod default** | Governs |
|---|---|---|---|
| `WALL_VISUALIZER_V1` | true | **ON** | walls, showroom, customer wall sheet, mockups |
| `OAUTH_GOOGLE_APPLE` | false | OFF | Google/Apple buttons on login + signup |
| `PAID_LOAN_V2` | true | OFF | monthly Stripe subscription billing for paid loans |
| `GATING_V1` | false | OFF | subscription gating on publish, placements, `/browse` |
| `BLOGS_V1` | true | **OFF** | artist blog editor, public `/blog`, admin review queue |

```ts
// src/lib/feature-flags.ts:114-121
export function isFlagOn(flag: FeatureFlag): boolean {
  const def = FLAGS[flag];
  if (!def) return false;
  const explicit = readBoolEnv(def.envKey);
  if (explicit !== null) return explicit;
  const isProd = process.env.NODE_ENV === "production";
  return isProd ? def.prodDefault : def.devDefault;
}
```

**Two findings drop out of this immediately.**

### 2.1 The visualizer is live in production, not dormant

`WALL_VISUALIZER_V1` is the **only** flag that is on in prod. Any assumption that the visualizer is a dark-launched experiment is wrong. Its kill-switch quality is genuinely good — 11 of 11 API routes and every page check the flag — with one leak documented in §5.3.

### 2.2 The blog surface is linked in production but disabled in production

`BLOGS_V1` has `prodDefault: false`, and gates only the **write** paths:

```ts
// src/app/api/blogs/route.ts:84  (POST)
if (!isFlagOn("BLOGS_V1")) {
  return NextResponse.json({ error: "Blog editor isn't enabled yet." }, { status: 403 });
}
```

`GET /api/blogs` is ungated. Neither `(pages)/blog/page.tsx`, `(pages)/blog/[slug]/page.tsx` nor `(pages)/artist-portal/blogs/page.tsx` calls `isFlagOn` at all — grep returns nothing. And the nav links are unconditional:

```tsx
// src/components/ArtistPortalLayout.tsx:35
{ label: "Blogs", href: "/artist-portal/blogs" },

// src/components/Header.tsx:33, :44, :52, :73, :79 — five separate nav arrays
{ label: "Blog", href: "/blog", match: (p: string) => p.startsWith("/blog") },

// src/components/Footer.tsx:29
{ label: "Blog", href: "/blog" },
```

`/blog` is also in the sitemap (`src/app/sitemap.ts:21`) and published blog slugs are enumerated from the DB into the sitemap (`sitemap.ts`, the `dbBlogs` block).

**Net production behaviour today:** an artist sees "Blogs" in their sidebar, opens the editor, writes a post, hits save, and gets a 403 reading "Blog editor isn't enabled yet." Meanwhile the public `/blog` link in the header and footer leads to a page listing whatever is in the `blogs` table. This is a live broken journey on a nav-linked path — it is a bug regardless of whether the surface is kept or cut, and it should be fixed in the same PR that decides the surface's fate.

---

## 3. Page route inventory (119 routes)

Classification: **Core** = one of the three MVP journeys (venue finds art, artist lists and gets paid, customer buys). **Supporting** = needed but not launch-critical. **Speculative** = built ahead of demand.

### 3.1 Core — Keep, no discussion

| Route | LOC | What it does |
|---|---|---|
| `/` | 605 | Homepage |
| `/browse` | 2,883 | Marketplace grid, the primary discovery surface |
| `/browse/[slug]` | 696 | Artist profile |
| `/browse/[slug]/[workSlug]` | 304 (+ client) | Artwork detail, buy CTA |
| `/browse/collections/[collectionId]` | 547 | Collection detail |
| `/checkout` | 952 | Stripe checkout |
| `/checkout/confirmation` | 289 | Post-purchase |
| `/orders/[id]` | 298 | Order detail |
| `/orders/track` | 308 | Guest order tracking |
| `/artist-portal` | 527 | Artist dashboard |
| `/artist-portal/portfolio` | 4,851 | Largest file in the repo; artwork CRUD |
| `/artist-portal/profile` | 1,490 | Public profile editor |
| `/artist-portal/orders` | 596 | Sales |
| `/artist-portal/billing` | 643 | Stripe Connect payouts |
| `/artist-portal/placements` | 1,941 | Placement negotiation |
| `/artist-portal/offers`, `/messages`, `/saved`, `/settings`, `/collections`, `/labels`, `/analytics`, `/artwork-requests*` | 35–881 each | Portal workflow |
| `/venue-portal` + `/profile` `/placements` `/orders` `/offers` `/messages` `/saved` `/labels` `/analytics` `/settings` `/artwork-requests*` `/enquiries` | 37–2,071 each | Venue workflow |
| `/customer-portal` + `/saved` `/addresses` `/messages` `/settings` | 40–482 each | Buyer account |
| `/placements/[id]` + `/payment` + `/review` | 9 / 78 / 150 | Placement detail, payment setup, review |
| `/admin` + `/applications` `/artists` `/venues` `/disputes` `/financials` `/moderation`-backed pages | 82–369 each | Ops |
| `/login` `/signup*` `/forgot-password` `/reset-password` `/auth/callback` `/check-your-inbox` `/apply` `/apply/claim` | 33–475 each | Auth + onboarding |
| `/account/*` (email, security, export, appeal, unsubscribe) | 52–180 each | GDPR + account management |
| Legal: `/terms` `/privacy` `/cookies` `/returns` `/ip-policy` `/complaints` `/artist-agreement` `/venue-agreement` | 96–289 each | Non-negotiable |

### 3.2 Supporting — Keep

| Route | LOC | Reachability evidence |
|---|---|---|
| `/spaces` | 730 | `Header.tsx:21,31,41` (all three nav variants), `page.tsx:430`, `Footer.tsx:11`, `checkout/confirmation:156,273`, sitemap. Venue discovery — heavily linked. |
| `/venues/[slug]` | 22 + `VenueProfileBody` | Public venue profile, gated by `/api/venues/[slug]/profile` |
| `/artists` | 82 | `page.tsx:303`, `not-found.tsx:53`, `VenueArtistToggle.tsx:23`, sitemap. SEO landing page. |
| `/venues` | 75 | `about:203`, `pricing:121`, `not-found:75`, `VenueArtistToggle.tsx:15`, sitemap. SEO landing page. |
| `/customer` | 74 | `how-it-works/HowItWorksClient.tsx:52`, sitemap. Weakest of the three, but it is the only "for buyers" landing page. |
| `/how-it-works` `/about` `/faqs` `/pricing` `/contact` `/partners` `/sustainability` | 12–389 | All footer- or header-linked, all in sitemap |
| `/register-venue` | 5 | Redirect stub → `/signup/venue`. Costs nothing, protects an external link. |
| `/blog` `/blog/[slug]` | 173 / 357 | Reachable — see §2.2 for the flag problem |

The `/artists`, `/venues`, `/customer` trio flagged in the brief as "possibly redundant" are **not** redundant. They are thin (74–82 LOC) because the substance lives in shared components (`components/marketing/ArtistGuide`, `VenueGuide`, `CustomerGuide`) which are also used by `/how-it-works`. They are in the sitemap, linked from `not-found.tsx`, and `Header.tsx:90` gives them immersive-hero treatment:

```ts
// src/components/Header.tsx:90
const immersiveRoutes = ["/", "/venues", "/artists", "/about"];
```

Cutting them saves ~230 LOC and loses three indexed SEO landing pages. Not worth it.

### 3.3 Speculative or dead — the candidate set

| Route | LOC | Inbound links | Verdict |
|---|---|---|---|
| `/dev/profile-designs/[slug]` | 580 | **ZERO** | Cut |
| `/profile-designs` | 555 | **ZERO** | Cut |
| `/email-preview`, `/email-preview/[id]` | 243 | **ZERO** (only a `robots.ts` disallow) | Cut |
| `/galleries` | 5 | **ZERO** | Cut |
| `/feature-requests` | 246 | **ZERO** | Cut |
| `/artist-portal/showroom/*` | 1,117 | Nav-linked | Owner decision (§7.1) |
| `/venue-portal/walls/*` | 1,233 | Nav-linked | Owner decision (§7.1) |
| `/curated/*` | 1,255 | Heavily linked | Keep + audit (§7.2) |
| `/artist-portal/blogs/*` | 188 | Nav-linked, flag OFF in prod | Defer behind flag (§7.3) |
| `/artist-portal/posts` | 109 | Nav-linked | Defer behind flag |
| `/demo` | 260 | `page.tsx:120` | Keep (pre-launch asset) |
| `/waitlist` | 600 | Sitemap only | Keep (pre-launch asset) |
| `/artwork-requests` (public) | 12 + client | `Footer.tsx:10` | Keep |

---

## 4. Reachability analysis — the evidence

This is the section that carries the recommendations. Each claim is a grep result.

### 4.1 Provably dead: zero inbound references

**`(pages)/dev/profile-designs/[slug]/page.tsx` (580 LOC) and `(pages)/profile-designs/page.tsx` (555 LOC)**

```
$ grep -rn "profile-designs" src --include="*.ts" --include="*.tsx" \
    | grep -v "^src/app/(pages)/dev/profile-designs" \
    | grep -v "^src/app/(pages)/profile-designs"
(no output — exit 1)
```

Nothing links to either. They do not link to each other. They are not in `sitemap.ts`, not in `next.config.ts` redirects, not in any nav array. They are design playgrounds that were shipped to production and forgotten. Both import `@/data/artists` and `@/data/categories` for sample data — that is their only coupling, and it is one-directional.

**`app/email-preview/page.tsx` (151) + `app/email-preview/[id]/page.tsx` (92)**

The only references anywhere are a robots disallow and a doc line:

```ts
// src/app/robots.ts:21
"/email-preview/",
```
```
src/emails/README.md:386: The preview lives at `/email-preview`. It's not gated by auth by
```

The README acknowledges it is **unauthenticated**. It renders every template in `src/emails/registry.ts`, including templates containing mock personal data (`src/emails/data/mockData.ts`). A `robots.txt` disallow is not access control — it is a request to crawlers. This is a live unauthenticated route in production whose only purpose is local development.

**`(pages)/galleries/page.tsx` (5 LOC)**

```tsx
import { redirect } from "next/navigation";

export default function GalleriesRedirect() {
  redirect("/browse?view=gallery");
}
```

Zero inbound references. Contrast with `(pages)/register-venue/page.tsx`, an identical 5-line stub that redirects to `/signup/venue` — which *is* worth keeping because `/signup/venue` is linked from `Footer.tsx:19` and printed marketing may carry the old path. `galleries` has no such history in the repo: `next.config.ts` already carries explicit legacy redirects (`/spaces-looking-for-art`, `/venue-portal/qr-labels`, `/artist-portal/qr-labels`, `/artist-portal/social`, `/browse/finlay-coles`) and `galleries` is not among them.

**`components/PlacementQRModal.tsx` (188 LOC)** — the single orphaned component in the repo:

```
$ for each component in src/components/**.tsx: grep export name across src, excluding self + own test
ORPHAN 188 src/components/PlacementQRModal.tsx
(no other results)
```

QR modal functionality lives in the labels pages instead. This is superseded code.

**`/api/stats/public` (44 LOC)** and **`/api/admin/refresh-stats` (25 LOC)**

```
$ grep -rn "stats/public\|refresh-stats" src --include="*.tsx" --include="*.ts" | grep -v "^src/app/api/"
(no output)
```

Neither is in `vercel.json` crons. Neither is a webhook. `refresh-stats` has a test file (`route.test.ts`) but no production caller — the test is testing a route nothing invokes. `/api/admin/stats` (143 LOC, 1 caller) is the one the admin dashboard actually uses.

### 4.2 Two parallel feature-request systems, one of them orphaned

`(pages)/feature-requests/page.tsx` (246 LOC) has zero inbound links — not in `Header.tsx`, not in `Footer.tsx`, not in `sitemap.ts`, not in any portal nav. The only self-reference is its own login bounce:

```tsx
// src/app/(pages)/feature-requests/page.tsx:108
window.location.href = `/login?next=${encodeURIComponent("/feature-requests")}`;
```

It is the sole caller of `/api/feature-requests` (76 LOC) and `/api/feature-requests/[id]/upvote` (44 LOC):

```tsx
// src/app/(pages)/feature-requests/page.tsx:52, :73, :114
const res = await fetch(`/api/feature-requests?status=${filter}`);
const res = await fetch("/api/feature-requests", { ... });
const res = await authFetch(`/api/feature-requests/${id}/upvote`, { method: "POST" });
```

Meanwhile the **actual** feature-request capture mechanism is a globally-mounted bubble that posts somewhere else entirely:

```tsx
// src/app/(pages)/layout.tsx:7, :34
import FeedbackBubble from "@/components/FeedbackBubble";
<FeedbackBubble />

// src/components/FeedbackBubble.tsx:4
// request and feedback. Submissions hit /api/moderation, which stores

// src/components/FeedbackBubble.tsx:71
const res = await fetch("/api/moderation", { ... });
```

And the admin review page (`/admin/feature-requests`, nav-linked at `AdminPortalLayout.tsx:15`) reads the moderation queue, not `/api/feature-requests` — confirmed by the grep above showing the public page as the API's only caller.

**So there are two independent feature-request implementations.** One (bubble → `/api/moderation` → `/admin/feature-requests`) is live and wired end to end. The other (`/feature-requests` page → `/api/feature-requests` + upvote → `feature_requests` / `feature_request_upvotes` tables) is reachable only by typing the URL. 366 LOC plus two tables.

Note the orphaned system does still have a DB tie-in — the GDPR delete cascade references its table:

```ts
// src/app/api/account/delete/route.ts:53
{ table: "feature_request_upvotes", col: "user_id" },
```

That line must be removed in the same PR if the tables are dropped.

### 4.3 Orphaned API routes — full classification

Prefix-aware scan of all 119 route files returned 13 with zero in-repo callers. Eleven are external-by-design:

| Route | LOC | Why zero callers is correct |
|---|---|---|
| `/api/cron/weekly-artist-digest` | 81 | `vercel.json` cron `0 9 * * 2` |
| `/api/cron/weekly-venue-digest` | 70 | `vercel.json` cron `0 9 * * 3` |
| `/api/cron/placement-ending-soon` | 72 | `vercel.json` cron `0 10 * * *` |
| `/api/cron/placement-review-request` | 76 | `vercel.json` cron `0 11 * * *` |
| `/api/cron/inactive-users` | 204 | `vercel.json` cron `0 10 * * *` |
| `/api/cron/onboarding-nudges` | 317 | `vercel.json` cron `0 10 * * *` |
| `/api/cron/qr-scan-digest` | 178 | `vercel.json` cron `0 9 * * *` |
| `/api/cron/order-delivery-followup` | 212 | `vercel.json` cron `0 12 * * *` |
| `/api/webhooks/stripe` | 1,252 | Stripe dashboard webhook |
| `/api/webhooks/supabase` | 126 | Supabase DB webhook |
| `/api/account/email/unsubscribe` | 74 | Linked from email footers — `src/emails/_components/EmailShell.tsx:102`, and from the `List-Unsubscribe` header at `src/lib/email/send.ts:199` |

`vercel.json` in full — all nine entries account for eight `cron/*` routes plus `stripe-connect/process-pending`:

```json
{
  "crons": [
    { "path": "/api/cron/weekly-artist-digest",    "schedule": "0 9 * * 2" },
    { "path": "/api/cron/weekly-venue-digest",     "schedule": "0 9 * * 3" },
    { "path": "/api/cron/placement-ending-soon",   "schedule": "0 10 * * *" },
    { "path": "/api/cron/placement-review-request","schedule": "0 11 * * *" },
    { "path": "/api/cron/inactive-users",          "schedule": "0 10 * * *" },
    { "path": "/api/cron/onboarding-nudges",       "schedule": "0 10 * * *" },
    { "path": "/api/cron/qr-scan-digest",          "schedule": "0 9 * * *" },
    { "path": "/api/stripe-connect/process-pending","schedule": "0 8 * * *" },
    { "path": "/api/cron/order-delivery-followup", "schedule": "0 12 * * *" }
  ]
}
```

The remaining two are **genuinely orphaned**: `/api/stats/public` and `/api/admin/refresh-stats` (see §4.1).

Two further orphans exist at **handler** rather than route level, both in the visualizer:

- `DELETE /api/works/[id]/mockups` (`route.ts:209`) — the UI attaches mockups (`WallVisualizer.tsx:768`, `method: "POST"`) but never detaches them. ~80 LOC of unreachable handler.
- `DELETE /api/walls/[id]/layouts/[lid]` (`route.ts:116`) — no UI deletes a layout. The only `DELETE` fetches target `/api/walls/${wallId}` at wall level. ~40 LOC.

### 4.4 Email templates — 59 of 123 have no send path

Procedure: for each of the 123 `.tsx` files under `src/emails/templates`, grep its export name across `src`, excluding (a) itself, (b) `src/emails/registry.ts`, (c) `src/app/email-preview/**`. Exclusions (b) and (c) are the point: the registry and the preview page reference *every* template by construction, which makes a naive "is it imported?" test return 100% and tell you nothing.

**Result: 64 wired, 59 unwired, 3,255 LOC unwired.**

The unwired set clusters by theme, which is itself informative:

| Cluster | Count | Examples |
|---|---|---|
| Account lifecycle | 10 | `AccountEmailVerification`, `AccountPasswordReset`, `AccountTwoFactorDisabled`, `AccountTeamInvite` |
| Newsletters | 5 | `NewsletterMonthlyGallery`, `NewsletterCuratorsPicks`, `NewsletterLocalArtNearYou` |
| Customer order lifecycle | 8 | `CustomerOrderOutForDelivery`, `CustomerOrderDelivered`, `CustomerConfirmDelivery48h` |
| Saved-work / re-engagement | 7 | `CustomerSavedWorkPriceDrop`, `CustomerAbandonedCheckout1h`, `UserRepermissionCampaign` |
| Upsell | 6 | `VenueManagedCurationPitch`, `ArtistTierCapHit`, `VenueAnalyticsUpgrade` |
| Operational / legal | 7 | `OperationalPlatformIncident`, `LegalTermsUpdate`, `ArtistTaxDocumentReady` |
| QR / engagement | 4 | `ArtistFirstQrScan`, `ArtistQrScanMilestone` |
| Remainder | 12 | `ArtistYearInReview`, `PlacementMidwayCheckin`, `VenuePaidLoanInvoice`, … |

**Important caveat — do not blind-delete the `Account*` cluster.** Templates like `AccountEmailVerification` and `AccountPasswordReset` correspond to emails that Supabase Auth (GoTrue) sends from the Supabase dashboard, not from application code. If someone rendered these to HTML and pasted them into the dashboard, the `.tsx` file is the design source of truth even though it has no import. **Verify against the Supabase Auth email template settings before deleting any `Account*` template.** The other 49 have no such excuse.

The unwired templates are not free: they carry ~40 registry import + entry lines each in `src/emails/registry.ts` (320 LOC total), plus mock fixtures in `src/emails/data/mockData.ts`, and they are the reason `/email-preview` exists.

---

## 5. Coupling cost per cut candidate

### 5.1 The clean cuts (no coupling)

| Surface | What imports it | Deletion risk |
|---|---|---|
| `/dev/profile-designs`, `/profile-designs` | Nothing. They import `@/data/artists` + `@/data/categories`, one-directional. | None |
| `/email-preview` | Nothing but `robots.ts:21` (one line to remove) | None |
| `/galleries` | Nothing | None |
| `PlacementQRModal.tsx` | Nothing | None |
| `/api/stats/public`, `/api/admin/refresh-stats` | Nothing (plus one orphan test file) | None |
| `/feature-requests` + its 2 API routes | Nothing, **except** `api/account/delete/route.ts:53` referencing `feature_request_upvotes` | Low — one line + two tables |

### 5.2 The visualizer — coupling is real but narrow

**Outbound** (what the visualizer needs): almost nothing app-specific. `lib/visualizer/*` imports only `@/lib/supabase-admin` and `@/lib/rate-limit`. `components/visualizer/*` imports `@/context/AuthContext`, `@/lib/format-dimensions`, `@/components/ImageWithFallback`, `@/lib/feature-flags`, `@/lib/use-media-query`. All stable shared infrastructure.

**Inbound** (what would break): five files outside the surface.

1. **The core artwork page imports it.** This is the load-bearing coupling:

```tsx
// src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.tsx:11-20
import WallVisualiser from "@/components/WallVisualiser";
import CustomerWallSheet from "@/components/visualizer/CustomerWallSheet";
import type { PanelWork } from "@/components/visualizer/WorksPanel";
} from "@/lib/visualizer/dimensions";
```

It runs a **dual implementation** switched on the flag, keeping a 139-LOC legacy component alive alongside the new one (note the spelling: `WallVisualiser` with an `s` is a *different file* from `components/visualizer/WallVisualizer.tsx` with a `z`):

```tsx
// ArtworkPageClient.tsx:695-717
{wallVizOpen && useNewVisualizer && (
  <CustomerWallSheet ... />
)}
{wallVizOpen && !useNewVisualizer && (
  ... <WallVisualiser ... />
)}
```

Since `WALL_VISUALIZER_V1` is on in prod, the `WallVisualiser` branch is **dead code in production** — 139 LOC of legacy fallback that only executes if someone flips the kill-switch.

2. **The artist showroom is a declared mirror of the venue walls flow.** Its own header comment says so:

```
// src/app/(pages)/artist-portal/showroom/[id]/page.tsx:6
* Mirror of /venue-portal/walls/[id], retargeted to artist mode:
```

3. **The public venue profile reads the `walls` table directly, with no flag check.** This is the kill-switch leak:

```ts
// src/app/api/venues/[slug]/profile/route.ts:123-126
.from("walls")
.select("id, name, width_cm, height_cm, kind, wall_color_hex, source_image_path, is_public_on_profile")
.eq("user_id", venueUserId)
.eq("is_public_on_profile", true)
```
```ts
// src/app/api/venues/[slug]/profile/route.ts:140
.from("wall-photos")
```

`grep -n "isFlagOn"` on that file returns nothing. Rendered via `VenueProfileBody.tsx:272` → `components/VenueWallCard.tsx` (247 LOC), which sits outside the visualizer directories. **Turning the flag off does not stop this query.** Dropping the `walls` table without editing this route breaks `/venues/[slug]`.

4. **A JSONB column was added to a core table.** The visualizer migration mutates `artist_works`:

```sql
-- supabase/migrations/035_visualizer_core.sql:244
ADD COLUMN IF NOT EXISTS mockups JSONB NOT NULL DEFAULT '[]'::jsonb;
```

The migration documents its own rollback at line 49: `--     ALTER TABLE artist_works DROP COLUMN IF EXISTS mockups;`

5. **Six of 22 production dependencies exist solely for this surface**: `three`, `@react-three/drei`, `@react-three/fiber`, `konva`, `react-konva`, `use-image`. Only `Wall3DCanvas.tsx` and `WallCanvas.tsx` import them, and both are `dynamic(..., { ssr: false })`, so they are client-bundle weight.

**DB coupling verdict: clean.** Migration `035_visualizer_core.sql` creates five tables — `walls`, `wall_layouts`, `wall_renders`, `visualizer_usage`, `visualizer_quota_overrides` — and a regex for inbound foreign keys across all 73 migrations returns only self-references:

```sql
-- the only REFERENCES pointing at wall tables, both internal:
035_visualizer_core.sql:126:  wall_id UUID NOT NULL REFERENCES walls(id) ON DELETE CASCADE,
035_visualizer_core.sql:167:  layout_id UUID REFERENCES wall_layouts(id) ON DELETE SET NULL,
```

**Nothing in `placements`, `works`, `artist_works` or `artworks` has a foreign key to any wall table.** Two storage buckets: `wall-photos` (private) and `wall-renders` (public). The bucket name `wall-photos` is duplicated as a string literal in five places rather than shared from one module.

**Test coverage of the surface is uneven** and this matters for the cut decision: 13 vitest suites cover `lib/visualizer` and four API routes, but `components/visualizer/*` (5,230 LOC) has **zero tests**, seven of 11 API routes are untested, and the only E2E spec (`tests/e2e/visualizer-customer.spec.ts`) covers the customer sheet, with its own header noting that the venue editor is uncovered.

### 5.3 Curated — keep, but it is unaudited revenue plumbing

`/curated` is heavily linked: `Header.tsx:43,72,77`, `Footer.tsx:20`, `page.tsx:237`, `venues/page.tsx:54`, `pricing:122`, `signup/venue:257`, `how-it-works:32`, `venue-portal/page.tsx:366`, and the sitemap. It is not a candidate for cutting on reachability grounds.

It is, however, a **live Stripe surface** with five price points that has never been audited:

```ts
// src/app/api/curation/route.ts:15-19
single_wall:       { kind: "one_off", label: "Single wall",       priceGbp: 49,     payFirst: true },
full_space:        { kind: "one_off", label: "Full space",        priceGbp: 149,    payFirst: true },
bespoke:           { kind: "one_off", label: "Bespoke project",   priceGbp: 299,    payFirst: false },
managed_monthly:   { kind: "managed", ..., priceGbp: 79.99,  interval: "month",   priceEnvVar: "STRIPE_PRICE_CURATION_MONTHLY" },
managed_quarterly: { kind: "managed", ..., priceGbp: 199.99, interval: "quarter", priceEnvVar: "STRIPE_PRICE_CURATION_QUARTERLY" },
```

It creates real Stripe checkout sessions (`route.ts:161`), including **recurring subscriptions**. The brief described it as "a £49 managed-curation upsell"; it is in fact a five-tier product carrying up to £199.99/quarter recurring. It couples into the Stripe webhook (`api/webhooks/stripe/route.ts:72-91` mutates `curation_requests`) and into the GDPR delete cascade (`api/account/delete/route.ts:83`).

`/api/curation` does have an auth check (it does not appear in the service-role-without-auth scan). But note `route.ts:156`, `:190`, `:231` — the route **deletes the `curation_requests` row** on several failure paths, which means a Stripe failure after row creation loses the enquiry. That is worth a look during the audit.

**Recommendation: Keep, and schedule a dedicated security + payment audit as its own workstream.** Cutting a live revenue surface pre-launch on the grounds that it is unaudited would be solving the wrong problem. If the owner does not intend to sell managed curation at launch, the cheaper move is to remove the *managed* tiers (subscriptions) and keep the one-off enquiry flow.

### 5.4 Security note surfaced in passing

The scan for service-role routes lacking any auth check (`getAuthenticatedUser` / `getAdminUser` / `requireCronAuth` / Stripe signature verification) returned 13. Most are legitimately public reads (`/api/venues/[slug]`, `/api/browse-collections`, `/api/orders/track` — token-based, `/api/qr/[slug]` — public scan target). Admin routes are clean: they all use `getAdminUser` (`src/lib/admin-auth`). Cron routes are clean: `requireCronAuth` from `api/cron/_auth`.

The ones worth a second look, listed here because a surface cull is the natural moment to reduce the count of service-role routes: `/api/venues/[slug]/profile` (224 LOC — reads venue PII and signs private-bucket URLs), `/api/venues/demand` (131), `/api/register-venue` (113), `/api/enquiry` (78), `/api/newsletter` (47), `/api/analytics/track` (59). **This is out of scope for this document — flagging, not diagnosing.**

---

## 6. Recommendation per surface

### 6.1 Cut — no owner input needed (provably dead)

| Surface | LOC | Routes | Evidence |
|---|---|---|---|
| `(pages)/dev/profile-designs/[slug]` | 580 | 1 page | Zero inbound refs |
| `(pages)/profile-designs` | 555 | 1 page | Zero inbound refs |
| `app/email-preview` (2 pages) | 243 | 2 pages | Zero inbound refs; unauthenticated in prod |
| `(pages)/galleries` | 5 | 1 page | Zero inbound refs; not a legacy path in `next.config.ts` |
| `(pages)/feature-requests` + `/api/feature-requests` + `/api/feature-requests/[id]/upvote` | 366 | 1 page, 2 API | Zero inbound links; superseded by `FeedbackBubble` → `/api/moderation` |
| `components/PlacementQRModal.tsx` | 188 | — | Only orphaned component in repo |
| `/api/stats/public` | 44 | 1 API | Zero callers, not cron, not webhook |
| `/api/admin/refresh-stats` | 25 | 1 API | Zero callers; `/api/admin/stats` is the live one |
| `DELETE /api/works/[id]/mockups` handler | ~80 | — | UI attaches, never detaches |
| `DELETE /api/walls/[id]/layouts/[lid]` handler | ~40 | — | No UI path |
| **Subtotal** | **~2,126** | **6 pages, 4 API** | |

### 6.2 Cut — email templates

| Surface | LOC | Evidence |
|---|---|---|
| 49 unwired templates (excluding the 10 `Account*` pending Supabase verification) | ~2,700 | No send path outside registry + preview |
| 10 `Account*` templates | ~496 | **Verify against Supabase Auth dashboard first** |
| Their `registry.ts` entries + `mockData.ts` fixtures | ~200 | Follows the templates |
| **Subtotal** | **~2,900–3,455** | |

Deleting `/email-preview` (§6.1) and the unwired templates are the same decision — the preview page is the only thing making the unwired templates look referenced.

### 6.3 Defer behind flag — reachable but not launch-critical

| Surface | LOC | Action |
|---|---|---|
| `(pages)/artist-portal/blogs/*`, `(pages)/blog/*`, `/api/blogs/**`, `(pages)/admin/blogs`, `/api/admin/blogs/[id]`, `components/BlogEditor.tsx`, `src/data/blog-posts.ts` | ~1,853 | **Do not delete. Fix the flag leak.** Gate the nav entries and the pages on `isFlagOn("BLOGS_V1")`, and remove `/blog` from `sitemap.ts` while the flag is off. Cost of the fix: ~20 lines. This converts a broken production journey into a correctly dark-launched one. |
| `(pages)/artist-portal/posts` + `components/social/InstagramPostGenerator.tsx` | 419 | Same treatment — either gate it or accept it. No flag currently governs it. |

### 6.4 Keep

Everything in §3.1 and §3.2, plus `/curated` (§5.3), `/demo` (linked from homepage at `page.tsx:120`, a pre-launch sales asset), `/waitlist` (sitemap-only but a standalone pre-launch capture page outside the `(pages)` layout group, so it deliberately has no header/footer).

### 6.5 Owner decision — the visualizer

See §7.1. Stated cost of keeping, so the decision can be made on facts.

---

## 7. Decisions that genuinely need the owner

These three depend on business intent, not on code. I am not making the call.

### 7.1 Is the wall visualizer part of the pitch?

**Cost of keeping, measured:**

| Component | LOC (prod) | LOC (incl. tests) |
|---|---|---|
| `src/lib/visualizer/*` | 4,114 | 6,122 |
| `src/components/visualizer/*` | 5,230 | 5,230 (zero tests) |
| `(pages)/venue-portal/walls/*` | 1,233 | 1,233 |
| `(pages)/artist-portal/showroom/*` | 1,117 | 1,117 |
| `api/walls/**` | 1,623 | 2,570 |
| `api/works/[id]/mockups` | 290 | 290 |
| `components/WallVisualiser.tsx` (legacy) | 139 | 139 |
| `components/VenueWallCard.tsx` | 247 | 247 |
| Migrations 035 + 037 | 330 | 330 |
| **Total** | **~14,000** | **16,948** |

That is **~12% of the codebase** and 15 of 119 API routes. It also carries 6 of 22 production npm dependencies (`three`, `@react-three/*`, `konva`, `react-konva`, `use-image`), 5 DB tables, 2 storage buckets, and 5,230 LOC of untested canvas/3D component code.

**Three options:**

| Option | LOC removed | Risk | Notes |
|---|---|---|---|
| **A. Keep whole** | 0 | Ongoing: 5,230 untested LOC, an unaudited private-bucket path, 6 heavy deps | Correct if "see art on your wall" is a differentiator in the pitch |
| **B. Keep the customer slice, cut venue walls + artist showroom** | ~7,900 | Medium | Keeps the `/browse` artwork-page preview (the buyer-facing wow moment) using preset walls only. Cuts the wall-photo upload, layouts, renders, quotas, tier limits, showroom, and 4 of 5 tables. Requires editing `api/venues/[slug]/profile` to stop reading `walls`, and removing `VenueWallCard`. |
| **C. Cut whole** | ~14,000 | High | Removes a customer-facing feature from the core artwork page. Requires the 4 non-obvious edits in §5.2. |

**My read, offered as input not as the decision:** option B is the best value if the visualizer is a nice-to-have rather than the pitch. The venue-side wall management (upload a photo of your wall, save layouts, hit render quotas, tier limits) is the expensive, untested, quota-metered half, and it serves the venue journey which already works without it. The customer-side preview is ~600 LOC and is the part a buyer actually sees.

**Regardless of the option chosen, three things should happen now:**
- Delete the legacy `components/WallVisualiser.tsx` fallback (139 LOC) — with the flag on in prod it is dead code, and the dual-implementation branch in `ArtworkPageClient.tsx` is confusing.
- Delete the two orphaned DELETE handlers (~120 LOC).
- Close the kill-switch leak in `api/venues/[slug]/profile/route.ts` — it should check `isFlagOn("WALL_VISUALIZER_V1")` before reading `walls`, otherwise the kill-switch does not work.

### 7.2 Do you intend to sell managed curation at launch?

`/curated` sells five tiers up to £199.99/quarter recurring (§5.3). If launch scope is enquiry-only, removing the two `managed_*` subscription tiers cuts the riskiest code path (recurring Stripe subscriptions + webhook subscription handling) without touching the linked `/curated` marketing surface. If managed curation *is* the plan, the surface needs a dedicated payment + auth audit before launch. Either way it should not be cut on reachability grounds — it is the most heavily linked non-core surface in the app.

### 7.3 Are `/demo` and `/waitlist` still pre-launch assets?

`/demo` (260 LOC + `/api/demo/login` 136 + `src/data/demo.ts` 40) is linked from the homepage as "Tour the platform" and funnels into a read-only sandbox account. `/waitlist` (600 LOC + `/api/waitlist` 64) is a standalone campaign landing page, in the sitemap but linked from no UI. Both are plausible pre-launch marketing assets and both are plausible leftovers. **If either is no longer part of the go-to-market, that is another ~1,100 LOC.** I have classified both as Keep because cutting a live homepage CTA on a pre-launch product is an owner call, not an engineering one.

---

## 8. Deletion procedure

The governing principle: **one surface per PR, pure deletion, no behaviour change elsewhere.** A pure-deletion PR that leaves `npm run check` green is itself the strongest available evidence that the surface was unused — if anything depended on it, the type-checker or the 130-file test suite would say so.

### 8.1 Per-PR checklist

For each surface:

1. **Branch from `main`.** One surface, one PR. Do not batch unrelated surfaces — batching destroys the "green suite = it was unused" signal, because you can no longer tell which deletion broke what.
2. **Delete the route directory / component file.** Nothing else in the same commit.
3. **Remove inbound references**, in this order, so the build never sits broken:
   - nav arrays (`Header.tsx`, `Footer.tsx`, the four `*PortalLayout.tsx` files)
   - `src/app/sitemap.ts` `STATIC_ROUTES`
   - `src/app/robots.ts` disallow entries
   - `next.config.ts` redirects
   - `src/components/portal-nav.test.ts` — **this file hardcodes a parity list of every portal nav path** (e.g. `:50` `/artist-portal/posts`, `:65` `/venue-portal/walls`, `:99` `/admin/feature-requests`). Removing a nav entry without updating it fails the suite. That is the test doing its job; update it deliberately, in the same PR.
4. **Decide route disposition** — redirect or 404:
   - **Redirect** (add to `next.config.ts` `redirects()`) if the path was ever in the sitemap, has external inbound links, or appears in printed marketing. From the cut list, `/feature-requests` was never in the sitemap and needs no redirect.
   - **404** for everything else. `/dev/profile-designs`, `/profile-designs`, `/email-preview`, `/galleries` were never indexed (`/email-preview` is explicitly `robots.ts`-disallowed) — let them 404.
   - Note `next.config.ts` already carries five legacy redirects; follow that pattern.
5. **Decide DB disposition** — this is the step that is hard to reverse, so default to leaving tables alone:
   - **Leave the table** in the deletion PR. Dropping code and dropping data in one PR means a revert restores the code but not the rows.
   - **Drop in a follow-up migration**, after the deletion has been in production long enough to be confident, and **after checking production row counts**. A table with real rows is a business record, not dead weight.
   - For `feature_requests` / `feature_request_upvotes`: remove the `api/account/delete/route.ts:53` cascade entry in the same PR as the code deletion, since a cascade referencing a dropped table would throw at GDPR-delete time.
   - For the visualizer (if cut): drop `walls`, `wall_layouts`, `wall_renders`, `visualizer_usage`, `visualizer_quota_overrides`, plus the `artist_works.mockups` column (rollback SQL already written at `035_visualizer_core.sql:49`), plus the `wall-photos` and `wall-renders` storage buckets. **The `wall-photos` bucket contains user-uploaded photographs of venue interiors — treat as user data, not as build artefacts.**
6. **Run the gate**: `npm run check` (lint + typecheck + `vitest run`). Then `npm run test:e2e` for anything touching a nav or a public page. `npm run depcheck` (dependency-cruiser) will catch a dangling import the type-checker misses.
7. **Remove now-unused dependencies** in a separate follow-up PR, not the deletion PR — `package.json` changes force a lockfile change and a full reinstall, which muddies the diff.

### 8.2 Why green tests are the evidence

The suite is 130 test files and includes `portal-nav.test.ts` (nav parity), `sitemap.test.ts` (asserts specific paths are present), `robots.test.ts`, and five Playwright specs including `smoke.spec.ts`, `a11y.spec.ts` and `security-no-leaks.spec.ts`. `tsc --noEmit` catches every dangling import. A pure-deletion PR that passes all of it has demonstrated that no typed code path and no tested user journey reached the deleted surface. That is not proof of zero runtime use, but combined with the grep evidence in §4 it is a sound basis for the call.

The one thing tests cannot tell you: whether a **human** was using the surface. `/email-preview` in particular may be part of someone's development workflow. Confirm before deleting, and note that `src/emails/README.md` documents running it locally — local use survives if the route is kept out of the production build, but the simplest honest answer is to delete it and render templates in a test instead.

### 8.3 Ordered deletion sequence

Ordered by ascending risk, so each PR builds confidence for the next.

| # | PR | LOC | Routes | Risk |
|---|---|---|---|---|
| 1 | Delete `components/PlacementQRModal.tsx` | 188 | 0 | Trivial — zero importers |
| 2 | Delete `/api/stats/public` + `/api/admin/refresh-stats` (+ its orphan test) | ~110 | 2 API | Trivial |
| 3 | Delete `(pages)/galleries` | 5 | 1 page | Trivial |
| 4 | Delete `(pages)/dev/*` + `(pages)/profile-designs` | 1,135 | 2 pages | Low |
| 5 | Delete `app/email-preview/**` + `robots.ts:21` | 243 | 2 pages | Low — confirm no one uses it locally first |
| 6 | Delete the 49 non-`Account*` unwired email templates + registry entries + mock fixtures | ~2,900 | 0 | Low — depends on #5 landing first |
| 7 | Delete `(pages)/feature-requests` + 2 API routes + `account/delete` cascade line | 366 | 1 page, 2 API | Low-medium — verify `/admin/feature-requests` still renders |
| 8 | Delete the 2 orphaned visualizer DELETE handlers + legacy `WallVisualiser.tsx`; close the flag leak in `api/venues/[slug]/profile` | ~260 | 0 | Low-medium — touches the artwork page's dual-implementation branch |
| 9 | Gate blogs + social posts properly behind their flags (nav, pages, sitemap) | +20 (a fix, not a cut) | 0 | Low — fixes a live broken journey |
| 10 | **Owner decision required** — visualizer option A / B / C | 0 / ~7,900 / ~14,000 | 0 / 8 / 15 API | Medium-high |
| 11 | Follow-up: drop orphaned DB tables after production soak | 0 | 0 | Irreversible — check row counts |
| 12 | Follow-up: prune newly-unused npm dependencies | 0 | 0 | Low |

Verify the `Account*` email templates against the Supabase Auth dashboard between #5 and #6; if they are not the dashboard's source of truth, fold their ~496 LOC into #6.

---

## 9. Summary table

| Surface | Verdict | LOC saved | Routes | Risk |
|---|---|---|---|---|
| `components/PlacementQRModal.tsx` | **Cut** | 188 | 0 | Trivial |
| `/api/stats/public`, `/api/admin/refresh-stats` | **Cut** | 110 | 2 API | Trivial |
| `(pages)/galleries` | **Cut** | 5 | 1 page | Trivial |
| `(pages)/dev/profile-designs`, `(pages)/profile-designs` | **Cut** | 1,135 | 2 pages | Low |
| `app/email-preview/**` | **Cut** | 243 | 2 pages | Low |
| 49–59 unwired email templates + registry/fixtures | **Cut** | 2,900–3,455 | 0 | Low |
| `(pages)/feature-requests` + 2 API routes | **Cut** | 366 | 1 page, 2 API | Low-medium |
| Orphaned visualizer DELETE handlers + legacy `WallVisualiser` | **Cut** | 260 | 0 | Low-medium |
| `(pages)/blog/*`, `artist-portal/blogs`, `/api/blogs`, `admin/blogs` | **Defer behind flag** | 0 (fix the leak) | 0 | Low |
| `artist-portal/posts` + `InstagramPostGenerator` | **Defer behind flag** | 0 | 0 | Low |
| Wall visualizer — venue walls + artist showroom | **Owner decision (§7.1)** | 0 / 7,900 / 14,000 | 0 / 8 / 15 API | Medium-high |
| `/curated` (5 Stripe tiers) | **Keep + audit (§7.2)** | 0 | 0 | Keeping is the risk |
| `/demo`, `/waitlist` | **Keep (owner: §7.3)** | 0 (or ~1,100) | 0 (or 2 pages) | Low |
| `/artists`, `/venues`, `/customer`, `/spaces`, `/partners` | **Keep** | 0 | 0 | — |
| `/register-venue` redirect stub | **Keep** | 0 | 0 | — |
| Core journeys, auth, admin, legal | **Keep** | 0 | 0 | — |

### Totals

| | LOC | Page routes | API routes |
|---|---|---|---|
| **Removable with no owner input** | **~5,200–5,760** | **6** | **4** |
| Additional if visualizer option B | +7,900 | +6 | +8 |
| Additional if visualizer option C | +14,000 | +6 | +15 |
| Additional if `/demo` + `/waitlist` dropped | +1,100 | +2 | +2 |
| **Maximum removable** | **~20,900** | **14** | **21** |

At the low end that is **~4% of the codebase and 10 routes** with no judgement calls required. At the high end, **~15% of the codebase and 35 of 238 routes**, contingent on the three owner decisions in §7.

---

## Appendix A — files to touch, by PR

| PR | Delete | Edit |
|---|---|---|
| 1 | `src/components/PlacementQRModal.tsx` | — |
| 2 | `src/app/api/stats/public/`, `src/app/api/admin/refresh-stats/` | — |
| 3 | `src/app/(pages)/galleries/` | — |
| 4 | `src/app/(pages)/dev/`, `src/app/(pages)/profile-designs/` | — |
| 5 | `src/app/email-preview/` | `src/app/robots.ts:21`, `src/app/robots.test.ts:19`, `src/emails/README.md` |
| 6 | 49–59 files under `src/emails/templates/` | `src/emails/registry.ts`, `src/emails/data/mockData.ts` |
| 7 | `src/app/(pages)/feature-requests/`, `src/app/api/feature-requests/` | `src/app/api/account/delete/route.ts:53` |
| 8 | `src/components/WallVisualiser.tsx`; DELETE handlers in `api/works/[id]/mockups/route.ts:209` and `api/walls/[id]/layouts/[lid]/route.ts:116` | `src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.tsx:11,695-717`; `src/app/api/venues/[slug]/profile/route.ts:123` (add flag check) |
| 9 | — | `src/components/ArtistPortalLayout.tsx:33,35`; `src/components/Header.tsx:33,44,52,73,79`; `src/components/Footer.tsx:29`; `src/components/AdminPortalLayout.tsx:18`; `src/app/sitemap.ts:21`; `src/components/portal-nav.test.ts` |

## Appendix B — commands used

```bash
find src/app -name "page.tsx" | wc -l                       # 119
find src/app/api -name "route.ts" | wc -l                   # 119
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l         # 136,398

# inbound-link check for a route
grep -rn '"/x"\|'"'"'/x'"'"'\|href="/x\|push("/x\|redirect("/x' src --include="*.ts" --include="*.tsx"

# API orphan scan (prefix-aware, handles template literals)
for f in $(find src/app/api -name "route.ts"); do
  p=${f#src/app}; p=${p%/route.ts}; pre=${p%%/\[*}
  hits=$(grep -rn "$pre" src --include="*.ts" --include="*.tsx" | grep -v "^src/app/api" | grep -c "api/")
  [ "$hits" -eq 0 ] && echo "ZERO $p"
done

# unimported component scan
for f in $(find src/components -name "*.tsx" ! -name "*.test.tsx"); do
  n=$(basename "$f" .tsx)
  h=$(grep -rln "\b$n\b" src --include="*.ts" --include="*.tsx" | grep -v "^$f$" | grep -v "^${f%.tsx}.test.tsx$" | wc -l)
  [ "$h" -eq 0 ] && echo "ORPHAN $f"
done

# email wiring audit (excludes registry + preview, which reference everything)
for f in $(find src/emails/templates -name "*.tsx"); do
  n=$(basename "$f" .tsx)
  h=$(grep -rln "\b$n\b" src --include="*.ts" --include="*.tsx" \
      | grep -v "^src/emails/registry.ts$" | grep -v "^src/app/email-preview" | grep -v "^$f$" | wc -l)
  [ "$h" -eq 0 ] && echo "UNWIRED $n"
done

# gate for every deletion PR
npm run check          # lint + tsc --noEmit + vitest run
npm run test:e2e       # 5 Playwright specs
npm run depcheck       # dependency-cruiser
```
