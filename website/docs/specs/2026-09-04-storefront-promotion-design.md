# Promoting the online storefront: design

**Date:** 2026-09-04
**Status:** Approved (design). Implementation plan to follow in `website/docs/plans/`.
**Branch:** `claude/storefront-website-promotion-3394e6`

---

## 1. Why this exists

Wallplace has a fully working online storefront that the site never sells as a thing in its own right.

**Built and working.** [`ArtistProfileClient.tsx`](../../src/app/(pages)/browse/[slug]/ArtistProfileClient.tsx) and [`ArtworkPageClient.tsx`](../../src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.tsx) both carry Buy Now and Add to Basket, wired to a real checkout, orders, collections and a showroom. A buyer can land cold on an artist page and complete a purchase with no venue involved at any point.

**Described only as a by-product of venue placement.** Every mention of the shop on the marketing site routes through a wall:

| Where | Current text | Problem |
|---|---|---|
| [`page.tsx:206`](../../src/app/page.tsx) | "Sell directly online, every QR scan leads to your store" | The shop exists only as a QR destination |
| [`ArtistGuide.tsx`](../../src/components/marketing/ArtistGuide.tsx) `valueBlocks` | "QR codes at venues drive customers straight to your store" | Same |
| Same file | "Customers find you via QR codes in the venues you're placed in" | The only named route to the shop is a venue |
| Same file | "buy, right from the venue wall" | Same |
| Same file, `comparisonData` | Audience: Instagram "Followers" vs Wallplace "Daily venue footfall" | Frames Instagram as a rival channel to choose between, when Instagram has no checkout and Wallplace is the checkout |

The gap this leaves: an artist arriving with an existing social following is never told that the thing they lack, somewhere for those followers to buy, is the product. That audience is warm, already sold on the artist, and needs nothing but a link and a payment page.

**A live bug sits exactly on that path.** [`InstagramPostGenerator.tsx:33`](../../src/components/social/InstagramPostGenerator.tsx) builds captions ending `wallplace.co.uk/{artistSlug}`. There is no bare-slug route, no catch-all, and no redirect covering it, so every caption an artist has copied out of the post studio points at a 404. The single place the product already asks artists to send their own audience is broken.

The same tool also pre-fills "NOW SHOWING AT" from active placements, so an accepted artist with no wall yet has nothing useful to generate on day one.

**Why the site reads this way.** [`plan/01-business-thesis.md:83`](../../../plan/01-business-thesis.md) states "Online sales are noise. Instagram, Etsy, and online galleries are saturated. Organic discovery is nearly impossible without paid promotion." That is correct about **cold** discovery and it is the right reason not to compete with Etsy on browse traffic. It says nothing against being the transaction layer for traffic an artist already owns. This design does not reverse the thesis; it separates the two cases.

---

## 2. Positioning

One line the whole change hangs off:

> **The wall gets you discovered. The link gets you paid. Both land on the same shop.**

Walls stay the headline and stay the differentiator, because physical placement is the one claim Etsy and Saatchi cannot make. The shop is positioned as the conversion layer underneath, the destination every route ends at, not a second parallel pitch. Concretely this means:

- No new top-level marketing route, no nav entry, no homepage restructure.
- The storefront gains its own sentences inside the existing artist story rather than its own page.
- Instagram moves from rival column to feeder in the comparison table, without the column being deleted.

---

## 3. Scope

**In:**

1. Copy rewrites across three marketing surfaces (section 4).
2. A vanity URL, `wallplace.co.uk/{slug}`, that resolves (section 5).
3. A reserved-slug guard so a vanity URL can never shadow a real page (section 6).
4. A "Share your shop" block in the artist portal (section 7).
5. A placement-free mode for the post studio (section 8).
6. A section on the artist guide showing the toolkit (section 9).

**Out:** a `/sell` route, nav changes, homepage restructure, any change to checkout, pricing or the buy flow. Fixing the duplicated local `slugify` in `apply/claim/page.tsx` beyond what section 6 requires.

---

## 4. Copy

All proposed copy is public-facing, so it follows the `AGENTS.md` rule: no em dashes, no en dashes, no `&mdash;` or `&ndash;`, and no hyphens standing in for dashes.

### 4.1 Homepage, For Artists section

`src/app/page.tsx`, around lines 199 to 215.

Lead paragraph, current:

> Showcase, get discovered, and sell, all in one place. Your Wallplace profile is your portfolio, your storefront, and your route into the best commercial venues.

Replace with:

> Showcase, get discovered, and sell, all in one place. Your Wallplace page is a working shop with checkout built in, and every route leads to it: the wall you are placed on, the QR label beside it, and the link you post yourself.

Bullets, current:

1. Get displayed in cafés, restaurants, hotels, and offices
2. Sell directly online, every QR scan leads to your store
3. Flat 15% platform fee. No gallery taking 50%.

Replace bullet 2 only:

2. Sell from your own shop link, share it anywhere you already post

Bullets 1 and 3 are unchanged. The result is one bullet for the wall, one for the link, one for the economics, with the QR demoted into the paragraph where it belongs as one route among three rather than the only named way to reach the shop.

### 4.2 Artist guide, value blocks

`src/components/marketing/ArtistGuide.tsx`, `valueBlocks`. Titles unchanged, descriptions rewritten. Icons unchanged.

| Block | Current description | New description |
|---|---|---|
| Your own online storefront | Your Wallplace page is your shop. QR codes at venues drive customers straight to your store to browse and buy. | Your Wallplace page is a real shop with checkout built in. You get a short link to put in your bio, so the people already following you have somewhere to buy. |
| Venue + online visibility | Venues find you by style and medium. Customers find you via QR codes in the venues you're placed in. | Two ways in. Venues find you by style and medium, and you send your own audience straight to your shop. |
| QR to checkout in seconds | Customers scan, browse, and buy, right from the venue wall. Every scan is a sale opportunity with your name on it. | Customers scan the label beside your work, browse your whole shop, and buy. Every scan lands on the same page your link does. |

The other three blocks (high-intent venue demand, curated marketplace, fair platform fees) are unchanged.

### 4.3 Artist guide, comparison table

`comparisonData` in the same file. Two changes.

Add a row, placed directly after "Physical display":

| Category | Gallery | Marketplace | Instagram | Wallplace |
|---|---|---|---|---|
| Takes payment | Yes | Yes | **No** | Yes |

Change one cell in the existing Audience row: Wallplace goes from "Daily venue footfall" to "Daily venue footfall and your own following".

Nothing else in the table moves. The Instagram column stays, because the point is not that Instagram is bad, it is that Instagram cannot take money and Wallplace can. The new row makes that concrete in one glance and turns the column from a competitor into a reason to use both.

### 4.4 Artist guide, FAQ

`faqItems` in the same file. Add one entry:

> **I already have an Instagram following. What does Wallplace add?**
>
> Somewhere for them to buy. Instagram has no checkout, so a follower who wants a piece has to message you, and you handle the payment, the packing and the paperwork yourself. Your Wallplace page is a real shop with a short link you can put in your bio, and it takes the payment, produces the invoice and sets the shipping options. The venue side brings you people who have never heard of you. The link converts the ones who already have.

### 4.5 Customer guide

`src/components/marketing/CustomerGuide.tsx`. Light touch only. A buyer arriving cold from an artist's bio link currently reads a page written for someone who found Wallplace first. Add one sentence near the top:

> If an artist sent you here, their page is their shop. Everything on it is an original you can buy, and the same work may be hanging in a venue near you.

This is the smallest item in the change.

---

## 5. The vanity URL

### 5.1 The decision

`wallplace.co.uk/{slug}` resolves to the artist's shop. This is the part of the change that makes the copy true: an artist will put a clean vanity URL in their bio, and will quietly not post one with `/browse/` in the middle of it.

It is also the only part that adds a permanent constraint, because from the moment it ships, no future top-level page may take a name an artist already holds, and no artist may take a name a page already holds. Section 6 is that constraint, made enforceable.

### 5.2 Implementation

New file `src/app/(pages)/[artistSlug]/page.tsx`, a server component:

1. Guard the shape first. If the segment does not match `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, call `notFound()` without touching the database. Junk and probe traffic never reaches Supabase.
2. Look the slug up with a new lightweight helper (section 5.4). If it does not exist, `notFound()`.
3. If it exists, `redirect()` to `/browse/{slug}`.

### 5.3 Two decisions inside that, both deliberate

**Not a `redirects()` entry in `next.config.ts`.** Next resolves `redirects()` before the filesystem, as the existing `/curated/programme` comment in that file already notes. A `/:slug` rule there would swallow `/about`, `/pricing`, `/browse` and every other page on the site. A dynamic route is matched **after** the filesystem, so every real page keeps winning. This is the only safe placement.

**A 307, via `redirect()`, not a 308 via `permanentRedirect()`.** A 308 is cached by browsers indefinitely. On a catch-all that would mean any path a visitor mistypes today is pinned in their browser as a redirect forever, including paths we might later want to ship as real pages. The repo has already been bitten by exactly this: see the `K8` comment on the `/browse/finlay-coles` rule in `next.config.ts`. The SEO cost of 307 is nil here, because `/browse/{slug}` is and stays canonical; it is what `sitemap.ts` emits and what the profile's own metadata points at. The vanity URL is a doorway, not an address.

### 5.4 New helper

`artistSlugExists(slug: string): Promise<boolean>` in `src/lib/db/artist-profiles.ts`. A single `select("slug").eq("slug", slug).maybeSingle()`.

Explicitly **not** `getArtistProfileBySlug`, which pulls the entire profile row plus every work plus a placements read. That is the right shape for rendering a profile and the wrong shape for deciding whether to redirect.

### 5.5 Visibility

The vanity route redirects on slug existence alone and lets `/browse/[slug]` make the visibility call, which it already does at [`page.tsx:154`](../../src/app/(pages)/browse/[slug]/page.tsx). This keeps one owner for "should this profile be visible" rather than two that can drift apart.

Accepted consequence: for a slug that exists but is delisted, a visitor gets a 404 at `/browse/{slug}` rather than at `/{slug}`, which distinguishes "delisted artist" from "no such artist" to anyone probing. The information disclosed is that a slug is taken, which the signup uniqueness check already reveals. Not worth a second visibility implementation to close.

### 5.6 Fix the caption

`InstagramPostGenerator.tsx:33` keeps emitting `wallplace.co.uk/{artistSlug}`, which now resolves. No change to that line is needed once the route exists, which is the point: the tool was already right about what the URL should be, and the routing was missing.

---

## 6. Reserved slugs

Nothing today stops an artist taking the slug `pricing`, `checkout` or `login`. Before the vanity route that was harmless, because slugs only ever appeared under `/browse/`. After it, it is a live shadowing risk in both directions.

### 6.1 The list is derived, not typed

A hand-maintained list of reserved names rots the first time someone adds a route and forgets. Instead:

- `src/lib/reserved-slugs.ts` exports `RESERVED_SLUGS`, a frozen set, and `isReservedSlug(slug)`.
- A test derives the same set from the filesystem and asserts every derived name is present. Adding a route without adding its name fails CI.

The derivation rule, stated precisely so the test and the seed list cannot disagree:

1. Every directory name directly under `src/app/(pages)/`, excluding the `[artistSlug]` route itself and any other bracketed segment.
2. Every directory name directly under `src/app/`, excluding route groups (names wrapped in parentheses).
3. Every entry name directly under `public/`.
4. The route-handler file stems directly under `src/app/` that serve a fixed path, currently `robots` and `sitemap`. These emit `/robots.txt` and `/sitemap.xml`, so both the stem and the full filename are reserved.
5. The framework-owned prefix `_next`.

Items 1 to 3 are read from disk by the test. Items 4 and 5 are a short literal list inside the test, because they cannot be inferred from a directory walk.

Seed contents: every current top-level route (`about`, `account`, `admin`, `apply`, `artist-agreement`, `artist-portal`, `artists`, `artwork-requests`, `blog`, `browse`, `check-your-inbox`, `checkout`, `complaints`, `contact`, `cookies`, `curated`, `customer`, `customer-portal`, `dev`, `faqs`, `feature-requests`, `forgot-password`, `galleries`, `how-it-works`, `ip-policy`, `login`, `newsletter`, `orders`, `partners`, `placements`, `pricing`, `privacy`, `profile-designs`, `programmes`, `register-venue`, `reset-password`, `returns`, `signup`, `spaces`, `sustainability`, `terms`, `venue-agreement`, `venue-portal`, `venues`), plus `api`, `auth`, `email-preview`, `waitlist`, plus the framework and asset names (`_next`, `images`, `favicon.ico`, `robots.txt`, `sitemap.xml`), plus a small forward-looking block (`sell`, `shop`, `store`, `help`, `support`, `press`, `careers`).

### 6.2 Where it is enforced

Four paths assign an artist slug today. All four gain the guard, appending a numeric suffix on collision exactly as the existing uniqueness loops already do:

| Path | File | Current behaviour |
|---|---|---|
| Application intake | [`api/apply/route.ts:175`](../../src/app/api/apply/route.ts) | `slugify(name)`, then a uniqueness loop with numeric suffix |
| OAuth signup | [`api/auth/oauth-finalize/route.ts:148`](../../src/app/api/auth/oauth-finalize/route.ts) | Base slug, then a uniqueness loop |
| Claim flow | [`apply/claim/page.tsx:74`](../../src/app/(pages)/apply/claim/page.tsx) | Client-side, its **own local** `slugify`, no uniqueness loop, writes `user_metadata.artist_slug` |
| Portal profile fallback | [`artist-portal/profile/page.tsx:364`](../../src/app/(pages)/artist-portal/profile/page.tsx) | Derives a display slug when the profile has none |

The claim flow is the weak one: it duplicates `slugify` with divergent behaviour (it keeps underscores via `\w` and does not strip accents) and never checks uniqueness. Within this change it should call the shared `slugify` and the shared guard. Consolidating it fully into a server-side creation path is a larger job and stays out of scope.

### 6.3 Existing data

A migration is not needed unless a live artist already holds a reserved slug. The implementation plan opens with a read-only check against `artist_profiles.slug` for intersections with `RESERVED_SLUGS`. If any exist, they are surfaced for an owner decision rather than renamed automatically, because a slug is a public URL that may already be in circulation.

---

## 7. Share your shop

Today there is no way for an artist to get a link or a code for their shop as a whole. [`artist-portal/labels`](../../src/app/(pages)/artist-portal/labels/page.tsx) produces per-artwork print labels only, and [`generateQRDataURL`](../../src/lib/qr.ts) exists but is only ever called for those.

New `ShareYourShop` component, rendered in two places:

- **`/artist-portal` dashboard**, compact: the vanity URL with a copy button, and a link through to the full version.
- **`/artist-portal/profile`**, full: the vanity URL with a copy button, a downloadable profile QR at print resolution via `generateQRDataURL`, and a short line of instruction for putting the link in an Instagram bio.

It reads the artist's slug from the existing `useCurrentArtist` hook. No new API route and no new table.

---

## 8. Post studio without a placement

[`artist-portal/posts/page.tsx`](../../src/app/(pages)/artist-portal/posts/page.tsx) fetches active placements and matches the selected work against them to pre-fill a "NOW SHOWING AT" line. With no active placement the generated image falls back to a title and medium card, and the caption still works, but the whole surface is framed as something to do once you are on a wall.

Change: make the shop-link variant a first-class choice rather than a fallback. The generator gains an explicit mode toggle, "Now showing at" (requires an active placement, disabled with a short explanation when there is none) and "Share my shop" (always available). The second mode drops the venue line and leads on the work plus the shop link, so a newly accepted artist has something to post on day one.

The canvas rendering in `InstagramPostGenerator.tsx` already branches on `showingAtVenueName`, so this is largely surfacing an existing branch as a deliberate choice rather than new drawing code.

---

## 9. Showing the toolkit

One section added to `ArtistGuide.tsx`, below the value blocks: the shop link, the profile QR and a generated post shown together, so the claim in section 4 is demonstrated rather than asserted. Static presentational content, no data fetching.

---

## 10. Testing

| Area | Test |
|---|---|
| Reserved slugs | Unit tests for `isReservedSlug`. The derivation test in 6.1 that walks the route tree and fails when a route is missing from the set. |
| Vanity route | Existing slug redirects to `/browse/{slug}` with a 307. Unknown slug returns 404. Malformed segment returns 404 without a database call. A reserved name still renders its real page. |
| Slug assignment | Each of the four paths in 6.2 refuses a reserved slug and suffixes instead. |
| Redirect targets | Extend [`tests/integration/redirect-targets.test.ts`](../../tests/integration/redirect-targets.test.ts), which already holds the `finlay-coles` pairing. |
| Share block | Renders the correct URL for a given slug, copy button writes to the clipboard, QR download produces a data URL. |
| Post studio | Shop mode renders with zero placements. Venue mode is disabled with an explanation when there is no active placement. |
| Copy | Homepage tests barely assert marketing strings, so the rewrites are low risk. Add an assertion for the new comparison-table row, since that one carries an argument rather than decoration. |

Gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, all green before the branch is proposed for merge.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Vanity URL shadows a future page | Reserved list, derived from the route tree and enforced by a CI test (6.1) |
| A 308 pins a mistyped path in browsers forever | 307 instead, with the reasoning recorded in 5.3 and in a comment at the route |
| Catch-all route becomes a database probe surface | Format guard before the lookup, and a single indexed `maybeSingle()` on a UNIQUE column (5.2, 5.4) |
| The shop story dilutes "seen on real walls" | Positioning fixed in section 2: no new route, no nav change, the shop gains sentences inside the existing artist story rather than a pitch of its own |
| An existing artist already holds a reserved slug | Read-only check first, surfaced for an owner decision rather than renamed automatically (6.3) |

---

## 12. Open question for the owner

`plan/01-business-thesis.md:83` currently reads "Online sales are noise", and the strategy docs contain no mention of the storefront at all. This design does not contradict the thesis, it narrows it to cold discovery, but the plan doc will now be out of step with what the site says. Worth a short amendment to that line so a future reader does not take it as an argument against the change. Not blocking, and not included in this scope.
