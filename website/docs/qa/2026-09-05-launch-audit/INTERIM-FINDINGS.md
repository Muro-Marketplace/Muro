# Launch audit 2026-09-05: INTERIM findings (sweep paused, 38 fixed, the rest unverified)

**Status: interim and unverified.** The owner paused the audit for usage on 2026-09-05 at 12:32 BST after 10 of 49 sweep finders had reported. Every entry below is a FINDER's candidate: the adversarial verification pass (a second agent instructed to disprove each claim) has NOT run, no fix has been made, and the severities are the finders' own. Treat each as a claim with quoted evidence, not a confirmed defect. The full structured data, including every `verified_ok` line, is in `interim-candidates.json`.

## Fixed in this session (2026-09-05, after the pause)

The owner asked for the four Highs and the main Medium and Low themes to be fixed. 38 findings are fixed across 39 commits on this branch, each with a test written first and watched to fail, then `npm run check` green on the final tree (result recorded at the end of this section). Counts: 3 High, 27 Medium, 8 Low. These fixes were made directly, without further agents; the adversarial verification pass was replaced by the failing test for each finding, which is the reproduction.

| Finding | Severity | Commit | What a user can now do |
|---|---|---|---|
| LA-C002 | High | 67341283 | Guest who opens the receipt email's tracking link with an expired or altered token gets a blank page: the error is set but never rendered |
| LA-C003 | High | 84bc3d56 | Venue's Saved page only shows works from the 41 seed artists; a saved work by any real artist silently never appears |
| LA-C004 | High | dd64ce24 | Signed-out venue following an email deep link (Pay now for an accepted offer, Open conversation, Print labels) lands on the dashboard after login; the deep link is dropped and the auto-checkout never fires |
| LA-C005 | Medium | 79d97fde, 98bd41d4 | Analytics shows zeros as fact when any of its three API calls fails; no error state on the page |
| LA-C006 | Medium | 20d55657 | Analytics placements table shows lower-case raw status text and never colours a badge |
| LA-C007 | Medium | 68ab311d | Analytics 'Performance by Venue' table renders as an empty header-only table for every artist with no placements |
| LA-C008 | Medium | 65e67f1c | Analytics placements table 'Revenue' column is always '-' even for placements that have earned money |
| LA-C009 | Medium | 2ff30d0c | Analytics Placements table never shows revenue; it reads the dead placements.revenue column instead of the revenue_earned_gbp the API computes |
| LA-C010 | Medium | 9d1de60b | Billing 'Change Plan' feature bullets are hard-coded and disagree with the canonical plan feature list |
| LA-C011 | Medium | 1100be5f | Billing 'Change Plan' cards list 'Message venues directly' as a Premium/Pro feature while the same page and /pricing say Core can message venues |
| LA-C015 | Medium | fdc2eaac | Deleting a collection or toggling Published/Draft fails silently: the card snaps back with no message |
| LA-C020 | Medium | 93d9164d, 302c7cf0 | Browse page has no error state: if the artists or collections fetch fails it silently shows only the seed catalogue |
| LA-C022 | Medium | 48f9a1e3 | Address book empty state's "Add address" button links to "#" and does nothing |
| LA-C023 | Medium | c22d97cc | A failed or non-2xx address load is shown as "No saved addresses" |
| LA-C024 | Medium | 87f03e77 | Customer with a collect-from-venue order is shown "Shipping to" with a blank address and never sees where to collect the work |
| LA-C027 | Medium | d27096f0 | /feature-requests shows 'No open requests yet.' when the API fails |
| LA-C028 | Medium | 3d2e250e | A signed-in user's feature request is saved as anonymous and they get no acknowledgement email |
| LA-C029 | Medium | d9307774 | Confirm delivery failure replaces the whole order view with one line, and a network failure shows nothing |
| LA-C030 | Medium | 5f8fa28f | Pricing hero says the tiers differ by platform fee, but every tier pays the same flat 15% |
| LA-C032 | Medium | 41cbbe54 | Pricing comparison table tells artists they get 3/6/15 venue approaches a week while the FAQ and plan cards on the same page say 7/15/30 |
| LA-C034 | Medium | 9ce3fca9 | Venue confirmation email and admin alert are sent before the account exists; a failed signUp leaves a 'registered' venue with no account |
| LA-C035 | Medium | 9b77867d | Venue registration posts the venue's plaintext password to /api/register-venue, which neither needs nor stores it |
| LA-C036 | Medium | bfa9baf9 | Analytics tiles 'Unique works scanned' and 'Artists scanned' can never exceed 10 because they count the API's top-10 lists, not the distinct totals |
| LA-C037 | Medium | f33937f1 | Venue analytics shows 'No scans yet' and 0 in every tile when the analytics API fails or the venue profile is missing; no error message, no retry |
| LA-C045 | Medium | 8375b51d | Placements page shows 'No placements found.' when the list request fails |
| LA-C046 | Medium | dc6aab7b | A just-sent placement request is shown with a fake id, so its Open, Cancel and QR-label actions fail until the page is reloaded |
| LA-C047 | Medium | 50e3d6dd | Wall editor bounces a dual-role venue owner to the homepage on userType alone, unlike the rest of the portal |
| LA-C048 | Medium | 4c5f8e45 | Artist agreement acceptance is recorded without the signed-in user's identity (user_id NULL on every live row) |
| LA-C053 | Medium | b9ec59de | An account that owns both an artist and a venue profile is let into the venue portal but Dashboard, Orders and Placements are served the artist's data |
| LA-C054 | Medium | 18c88c64 | Delete-account copy says orders are permanently deleted; the route keeps them and anonymises personal details |
| LA-C064 | Low | 8bcd6f9d | Terms impose a £100 signed-for delivery duty on artists that the Artist Agreement never mentions |
| LA-C065 | Low | 601405cb | Returning from Stripe Connect onboarding, the billing page ignores the stripe_connect=complete|refresh parameter it is sent |
| LA-C066 | Low | 801371de | A failed payout-status lookup renders the Payouts panel as 'Set Up Payouts' for an artist whose payouts are already active |
| LA-C067 | Low | aa0b5c04 | Referral code 'Copy' button gives no confirmation and ignores clipboard failures |
| LA-C080 | Low | d5311733 | After confirming delivery, the "Request Refund" control disappears until the page is reloaded |
| LA-C081 | Low | 8bcd6f9d | Saved artists that no longer exist in the catalogue still render a title-cased slug linking to a 404 |
| LA-C084 | Low | 7d1bcadc | Order tracking form placeholder shows an order-ID format that no real order has |
| LA-C094 | Low | f4ea1dc8 | Dashboard stat tiles render an em dash while loading |

**High not fixed, owner action:** LA-C001, the three QA test blog posts published in production. Production data, not code; the SQL is already in `docs/qa/LAUNCH-MANUAL-CHECKLIST.md` section 1.

**Left open in the themes worked, with the reason:**

- Silent failures not yet converted to an error state: LA-C012 (collections delete or publish toggle reverts silently), LA-C017 (browse shows only the seed catalogue on a failed fetch, a deliberate fallback that now lacks a notice), LA-C026 (order stepper confirm-delivery error replaces the view), LA-C042 (venue placements list, a 2,000-line page), LA-C087 and LA-C088 (venue settings contact fields and payouts card), LA-C090 and LA-C091 (wall editor saves). Same pattern as the fixes above; each needs its own test and commit.
- Buy path: LA-C016 and LA-C019 (lightbox and gallery-overlay cart lines omit per-size shipping, frame and dimensions, so shipping can differ from the artwork page for the same work), LA-C068 (collection page offers Buy Collection with no bundle price), LA-C049 (cart size label cap of 50 versus 100 plus 80 at the source). Not started.
- Identity and roles: LA-C050 (an account owning both an artist and a venue profile is served the artist's data in the venue portal; needs a portal-context parameter on three routes), LA-C031 (venue registration record and emails are written before the auth account exists), LA-C052 and LA-C100 (competing portal guards). Not started; LA-C050 and LA-C031 change request flows and want a second look before they are fixed.
- Owner-side, not code: LA-C056 (rate limiting is per serverless instance because the Upstash variables are unset in production).
- Every other Low in the list below remains OPEN and unverified.

**Sweep coverage is unchanged:** only the eight page slices ran. Routes, emails, copy sweeps, money paths, auth and RLS, crons, invariants, the deployed-site crawl and the guards' blind spots are still unaudited.

**Gate on the final tree (`npm run check`, exit 0):** eslint `✖ 216 problems (0 errors, 216 warnings)` (the 216-warning baseline held, no new warnings); tsc clean; vitest `Test Files 453 passed (453)`, `Tests 4725 passed (4725)` (from 439 files and 4,664 tests at the start); audit:allowlist, depcheck, email:render and email:audit all passed.

## Coverage so far

- Page slices completed: 8 of 11 (97 of 125 pages read for every role). Completed: P01 public marketing A, P02 public legal, blog, misc, P03 auth and signup entry, P04 browse and buy, P05 customer portal and account, P06 artist portal A, P08 venue portal A, P09 venue portal B.
- Page slices NOT run: P07 artist portal B, P10 admin, P11 placements, showroom, rest (28 pages).
- P03 and P06 were run twice (the resume re-ran them instead of replaying the cache); both runs are merged here, with near-duplicates collapsed (same file, line within 8, title overlap).
- NOT run at all: all 12 API route slices (Section B, 135 routes), all 8 live-email slices plus the pipeline and dormant checks (Section C), the four copy sweeps (Section D), the three money-path reviews (Section E), auth/RLS (Section F), the 12 crons (Section G), data invariants (Section H), the deployed-site crawl and env defaults (Section I), the guards' blind spots (Section J), and the mobile/a11y e2e run. The live-configuration reads I performed directly are in `LIVE-CONFIG-EVIDENCE.md`.
- Candidate findings: 123 after merging (0 Blocker, 4 High, 52 Medium, 67 Low); 117 judged fixable by the finder, 6 not.
- `verified_ok` notes recorded: 179. Items the finders could not fully check: 122 (listed at the end).

## Blocker (0)

## High (4)

### LA-C001  [High]  Public /blog lists three QA/test posts (one gibberish), and the sitemap advertises them

Where: `website/src/app/(pages)/blog/page.tsx:35`  
Area: A · Slice: P02  
Journey: Logged-out visitor (and every role) opens /blog and sees, among eight cards, 'QA test blog 2026-08-30 (delete me)', 'teest' with the body 'testjfqewifjniej3dfbqwie ewioufdh1epioufh21fd edpiouewdhp§e2n', and 'QA-TEST post for the production verification pass. Safe to delete. ## A heading Some **bold text**...'; the same three URLs are handed to search engines in /sitemap.xml.  
Evidence (finder's, unverified): Read-only SQL on prod: `select status, count(*), count(cover_image_url) from blogs group by status` -> published 3, rejected 1; the three published slugs are qa-test-markdown-rendering-check-delete-me-i4465r (2026-08-30), qa-test-blog-2026-08-30-delete-me-ngj7rw (2026-08-30) and teest-791hwe (2026-05-27, author shown as 'Fin Coles'). Live GET https://www.wallplace.co.uk/blog -> HTTP 200 and the HTML contains all three slugs plus the strings 'QA test blog 2026-08-30 (delete me)', 'teest' and the gibberish body. Live GET /sitemap.xml lists https://wallplace.co.uk/blog/<each of the three>. Live GET /blog/teest-791hwe -> HTTP 200, <title>teest | Wallplace</title>. page.tsx:30-37 renders every `status = 'published'` row, force-dynamic.  
Root cause (claimed): Test fixtures were published to production during the May and 30 August QA passes and never unpublished; the index and sitemap faithfully show every published row.  
Fixable (finder's view): no, Production data, not code: the three blog rows must be unpublished or deleted by the owner/admin (via /admin/blogs or a reviewed UPDATE). This phase makes no production writes.  
Suggested fix: Unpublish or delete the three rows through the admin blog console; /blog and /sitemap.xml read live and self-correct. Optionally add a launch checklist item: no 'delete me' / QA-prefixed titles in `blogs` with status published.  
Status: OPEN, unverified  

### LA-C002  [High]  Guest who opens the receipt email's tracking link with an expired or altered token gets a blank page: the error is set but never rendered

Where: `website/src/app/(pages)/orders/track/page.tsx:187`  
Area: A · Slice: P04  
Journey: Logged-out guest buyer clicks the receipt email's primary 'View order' button (/orders/track?t=<token>) after the 90-day token TTL, or with a mangled link. The page shows the heading and intro paragraph and nothing else: no error message, no manual lookup form, no hint about where to find the order ID.  
Evidence (finder's, unverified): page.tsx:75-99 token effect sets tokenAuthed=true then, on !res.ok, setError(data.error || 'This tracking link has expired or is invalid.'). The only render of error is line 187, inside the <form> that line 157 renders only when !tokenAuthed. Line 153 shows 'Looking up your order…' only while loading; line 301 hides the order-ID hint when error is set. Route src/app/api/orders/track/route.ts:59-66 returns 401 {error:'Invalid or expired link'} when verifyOrderToken throws. Receipt emails link exactly here: src/emails/templates/orders/CustomerOrderReceipt.tsx:34 and CustomerOrderPlaced.tsx:35 build https://wallplace.co.uk/orders/track?t=…; TTL is 90 days (src/lib/order-tracking-token.ts:14); ORDER_TOKEN_SECRET is present in production (vercel-env-names.txt) so the path is live. SQL: 19 orders, all 19 with buyer_email. orders/track/page.test.tsx covers only the manual form path.  
Root cause (claimed): The error paragraph lives inside the manual-lookup form, and the token branch hides that form, so the token-path error has no render site.  
Fixable (finder's view): yes  
Suggested fix: Render {error && …} outside the form, and when tokenAuthed && error also show the manual form so the guest can fall back to ID + email. Pin with a jsdom test: stub window.location.search='?t=bad', mock fetch 401 {error:'Invalid or expired link'}, expect the message and the form to be visible.  
Status: FIXED in 67341283 (this session, test-first, gate green)  

### LA-C003  [High]  Venue's Saved page only shows works from the 41 seed artists; a saved work by any real artist silently never appears

Where: `website/src/app/(pages)/venue-portal/saved/page.tsx:20`  
Area: A · Slice: P09  
Journey: Venue hearts a real (database) artist's work on /browse, opens Venue Portal > Saved, Works tab reads 'No saved works yet' and the tab count excludes it. No message.  
Evidence (finder's, unverified): saved/page.tsx:20-29: `const allWorks = getGalleryWorks(); return savedItems.filter(s => s.type === "work").map(s => { const work = allWorks.find(w => w.id === s.id); if (!work) return null; ... }).filter(Boolean)`. src/data/galleries.ts:45-47: `export function getGalleryWorks() { return artistsToGalleryWorks(artists); }` where `artists` is the static seed import. Browse saves the DB work id: browse/page.tsx:2509 `<SaveButton type="work" itemId={work.id}>` on the merged list built from /api/browse-artists (browse/page.tsx:569, 1017). The other two portals already resolve saved works through the API: customer-portal/saved/page.tsx:95 and artist-portal/saved/page.tsx:73 both `fetch("/api/browse-artists")`; customer-portal/saved/page.tsx:75-76 comment: 'an empty or failed /api/browse-artists would make every saved work look deleted'.  
Root cause (claimed): The venue saved page was never migrated from the static seed catalogue to the merged /api/browse-artists catalogue, so any work id not in src/data/artists.ts is dropped by the `.filter(Boolean)`.  
Fixable (finder's view): yes  
Suggested fix: Resolve saved work ids against /api/browse-artists (as customer-portal/saved does, including its catalogueLoaded guard) instead of getGalleryWorks(). Pin with a jsdom test: savedItems containing a work id absent from the seed renders a card once /api/browse-artists returns it.  
Status: FIXED in 84bc3d56 (this session, test-first, gate green)  

### LA-C004  [High]  Signed-out venue following an email deep link (Pay now for an accepted offer, Open conversation, Print labels) lands on the dashboard after login; the deep link is dropped and the auto-checkout never fires

Where: `website/src/components/PortalGuard.tsx:105`  
Area: A · Slice: P08 (also P06)  
Journey: Venue, signed out (typical on a phone), taps 'Pay now' in the offer-accepted email (href /venue-portal/offers?pay=<id>). They are sent to /login with no return path; after signing in they land on /venue-portal dashboard with no message, no checkout, and have to find My Offers and the right card themselves. Same for /venue-portal/messages?c=<conv> from message_unread_notification and /venue-portal/labels?placement=<id> from the placements email.  
Evidence (finder's, unverified): PortalGuard.tsx:104-107 `if (!loading && !user) { router.replace("/login"); return; }` and :193 `if (!user) return null;` so the page never mounts for a signed-out visitor. VenuePortalLayout.tsx:91-94 does the same bare `router.replace("/login")`. The offers page's own preservation code, offers/page.tsx:15-20 `window.location.href = `/login?next=${encodeURIComponent(next)}``, is therefore dead: it lives in a child PortalGuard renders null instead of. The login page DOES honour a return path: login/page.tsx:99-105 `const next = params.get("next") ?? params.get("redirect"); router.replace(safeRedirect(next, portalPathForRole(userType)))`. The link is live: offers/[id]/route.ts:322 builds `${SITE}/venue-portal/offers?pay=${encodeURIComponent(id)}` for offer_outcome_notification (live-ids.txt:70, send-sites.txt:73); OffersList.tsx:144-152 only auto-pays when the page loads with ?pay= present. No proxy.ts/middleware.ts exists to redirect server-side (ls confirmed). grep for `login?next` in PortalGuard/VenuePortalLayout: no matches.  
Root cause (claimed): Both portal guards redirect to a bare /login and never append ?next=, so every deep link into the venue portal is lost for a signed-out user even though the login page supports ?next= and the offers page was written expecting it.  
Fixable (finder's view): yes  
Suggested fix: In PortalGuard (and VenuePortalLayout.tsx:92) replace with `router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`)` (usePathname is already in scope; read window.location.search inside the effect as login/page.tsx does). Pin with a PortalGuard.test.tsx case: logged out at /venue-portal/offers?pay=off_1 expects replace called with '/login?next=%2Fvenue-portal%2Foffers%3Fpay%3Doff_1'. The dead block in offers/page.tsx:15-20 can then be removed.  
Status: FIXED in dd64ce24 (this session, test-first, gate green)  

## Medium (52)

### LA-C005  [Medium]  Analytics shows zeros as fact when any of its three API calls fails; no error state on the page

Where: `website/src/app/(pages)/artist-portal/analytics/page.tsx:107`  
Area: A · Slice: P06 (also P06)  
Journey: Artist opens Analytics while /api/analytics/artist returns 404 (no profile yet), 500, or the network drops; every metric card renders 0, the placements table says 'No placements logged yet', with no indication anything failed.  
Evidence (finder's, unverified): Lines 90, 95, 107: `.catch(() => {})` on all three fetches. Line 105 `if (data.totals) setAnalytics(data)` silently ignores `{error: "Artist profile not found"}` (analytics/artist/route.ts:37 returns 404 without `totals`). Lines 213-231 render `analytics?.totals.profile_views ?? 0`. No error state exists anywhere in the component (grep for 'error' state: none).  
Root cause (claimed): All load errors are swallowed and the UI falls back to zero defaults.  
Fixable (finder's view): yes  
Suggested fix: Track a loadError per fetch and render an inline 'Could not load analytics. Try again.' message in place of the zero cards; test with authFetch mocked to reject and assert the message appears and no '0' metric is shown.  
Status: FIXED in 79d97fde, 98bd41d4 (this session, test-first, gate green)  

### LA-C006  [Medium]  Analytics placements table shows lower-case raw status text and never colours a badge

Where: `website/src/app/(pages)/artist-portal/analytics/page.tsx:427`  
Area: A · Slice: P06 (also P06)  
Journey: Artist opens Analytics with placements; every row's Status badge prints 'active', 'pending', 'sold' in lower case with the grey fallback colour, while the summary tiles above use 'Active'/'Pending'.  
Evidence (finder's, unverified): Lines 427-429 compare `p.status === "Active"`, `"Sold"`, `"Pending"` (title case); line 84 maps status straight from the API (`status: (p.status || "active")`) and line 431 prints `{p.status}`. Read-only SQL on prod (`select status, count(*) from placements group by status`): active 38, pending 34, cancelled 8, completed 5, declined 5, sold 1, all lower case. The same file's own comment at lines 111-113 says status is stored lower-case and the counts at 114-119 lowercase before comparing; the badge block was not updated.  
Root cause (claimed): Title-case string comparison against lower-case stored values, left behind when the count logic was fixed (bugs 12/13).  
Fixable (finder's view): yes  
Suggested fix: Compare `p.status.toLowerCase()` and render a labelled status (e.g. a STATUS_LABELS map) instead of the raw value; add a render test with a lower-case 'active' placement asserting the green class and 'Active' text.  
Status: FIXED in 20d55657 (this session, test-first, gate green)  

### LA-C007  [Medium]  Analytics 'Performance by Venue' table renders as an empty header-only table for every artist with no placements

Where: `website/src/app/(pages)/artist-portal/analytics/page.tsx:443`  
Area: A · Slice: P06 (also P06)  
Journey: Artist (any new artist, zero placements) opens Analytics, sees 'No placements logged yet' and directly beneath it a 'Performance by Venue' table with column headers and no rows.  
Evidence (finder's, unverified): Line 443: `{venuePerformance.length > 0 && (` tests the imported FUNCTION, not the computed `venuePerformanceRows` (line 137). Probe run from website/: `npx tsx -e "import { venuePerformance } from './src/lib/finance/venue-performance'; console.log(venuePerformance.length, venuePerformance([], [], () => 0))"` printed `3 []`, so the condition is always true while the rows array is empty. The table body maps `venuePerformanceRows` (line 460), which is [] for zero placements.  
Root cause (claimed): Typo: the guard references the function identifier (arity 3) instead of the memoised rows array.  
Fixable (finder's view): yes  
Suggested fix: Change line 443 to `venuePerformanceRows.length > 0`. Pin with a jsdom render test that mocks /api/placements and /api/orders as empty and asserts 'Performance by Venue' is absent.  
Status: FIXED in 68ab311d (this session, test-first, gate green)  

### LA-C008  [Medium]  Analytics placements table 'Revenue' column is always '-' even for placements that have earned money

Where: `website/src/app/(pages)/artist-portal/analytics/page.tsx:86`  
Area: A · Slice: P06  
Journey: Artist with QR sales opens Analytics; the Placements table shows '-' in Revenue for every row while the Total Sales tile and Performance by Venue table (same page) show non-zero figures.  
Evidence (finder's, unverified): Line 86: `revenue: p.revenue ? \`£${p.revenue}\` : null` reads the raw `placements.revenue` column. GET /api/placements spreads the raw row and adds the computed figure under a different key: route.ts:311-316 `...p, revenue_earned_gbp: pid && earnedByPlacement[pid] ? Math.round(...) : 0`. Read-only SQL on prod: `select count(*) from placements where revenue is not null` = 0 (of 91 rows). lib/finance/venue-performance.ts:6-8 documents the same: '`placements.revenue` is NULL because nothing writes it back (bug 24)'. Line 433 renders `{p.revenue ?? "-"}`.  
Root cause (claimed): The page reads the dead `revenue` column instead of the `revenue_earned_gbp` the route computes from orders.  
Fixable (finder's view): yes  
Suggested fix: Map `revenue` from `p.revenue_earned_gbp` (format with formatPounds, null when 0). Pin with a render test feeding a placement with revenue_earned_gbp: 120 and asserting '£120.00'.  
Status: FIXED in 65e67f1c (this session, test-first, gate green)  

### LA-C009  [Medium]  Analytics Placements table never shows revenue; it reads the dead placements.revenue column instead of the revenue_earned_gbp the API computes

Where: `website/src/app/(pages)/artist-portal/analytics/page.tsx:86`  
Area: A · Slice: P06  
Journey: Artist with realised sales on a placement opens Analytics. The Revenue column of the Placements table reads '-' on every row, while the same placement's earnings are computed by the API.  
Evidence (finder's, unverified): page.tsx:86 `revenue: p.revenue ? `£${p.revenue}` : null` and :433 `{p.revenue ?? "-"}`. GET /api/placements (src/app/api/placements/route.ts:296-318) returns `{ ...p, revenue_earned_gbp: ... }`: the computed figure is `revenue_earned_gbp`, while `revenue` is the raw DB column that POST sets to null (route.ts:562 `revenue: null`) and that, per src/lib/finance/venue-performance.ts:6-7, 'is NULL because nothing writes it back (bug 24)'.  
Root cause (claimed): The page maps the wrong field from the placements response.  
Fixable (finder's view): yes  
Suggested fix: Map `revenue: p.revenue_earned_gbp > 0 ? formatPounds(p.revenue_earned_gbp) : null`. Test: feed a placement with revenue_earned_gbp 120 and assert '£120.00' renders in the table.  
Status: FIXED in 2ff30d0c (this session, test-first, gate green)  

### LA-C010  [Medium]  Billing 'Change Plan' feature bullets are hard-coded and disagree with the canonical plan feature list

Where: `website/src/app/(pages)/artist-portal/billing/page.tsx:561`  
Area: A · Slice: P06  
Journey: Subscribed artist weighing an upgrade reads Premium/Pro bullets 'Message venues directly' (implying Core cannot), 'Dedicated support', 'Priority in venue recommendations', with no mention of the active-placement caps that are the tier value metric; the pricing page and trial email say something different.  
Evidence (finder's, unverified): Lines 561-563 hard-code: core 'Up to 8 works / Standard profile / Basic analytics'; premium adds 'Message venues directly', 'Full analytics'; pro adds 'Dedicated support'. src/lib/plan-features.ts (header: 'What each artist plan includes, in one place') lists for Core `Approach ${OUTREACH_WEEKLY_LIMIT.core} new venues a week` (7, so Core can message venues), `Up to ${ACTIVE_PLACEMENT_CAP.core} active venue placements at a time`, and has no 'Message venues directly' line for any plan; Pro says 'Dedicated account support', 'Unlimited active venue placements', 'Priority for programme placements'. PLAN_DETAILS on this page (line 31) itself gives Core `approaches: 7`.  
Root cause (claimed): The billing page kept its own inline bullet list instead of rendering `planFeaturesFor(p)`; plan-features.ts was introduced to stop exactly this drift.  
Fixable (finder's view): yes  
Suggested fix: Replace the three inline `<li>` groups with `planFeaturesFor(p).map(...)`; pin with a test asserting the Premium card contains 'Approach 15 new venues a week' and no card contains 'Message venues directly'.  
Status: FIXED in 9d1de60b (this session, test-first, gate green)  

### LA-C011  [Medium]  Billing 'Change Plan' cards list 'Message venues directly' as a Premium/Pro feature while the same page and /pricing say Core can message venues

Where: `website/src/app/(pages)/artist-portal/billing/page.tsx:562`  
Area: A · Slice: P06  
Journey: A Core subscriber on Billing reads their plan card '7 new venue approaches a week', then three cards below reads that upgrading to Premium or Pro adds 'Message venues directly'. The upsell claim is false.  
Evidence (finder's, unverified): billing/page.tsx:395 renders `${details.approaches} new venue approaches a week` from OUTREACH_WEEKLY_LIMIT.core = 7 (src/lib/outreach-cap.ts:34-38). Lines 562-563 put 'Message venues directly' in the Premium and Pro bullet lists; line 561 (Core) omits it. src/app/(pages)/pricing/page.tsx:35-38 says feature 'Message venues': core 'Yes'. The messages route only blocks artist-to-artist first contact (src/app/api/messages/route.ts:429), never artist-to-venue.  
Root cause (claimed): Hard-coded bullet lists that predate the outreach-cap model.  
Fixable (finder's view): yes  
Suggested fix: Remove 'Message venues directly' from the Premium/Pro lists (or state the approach counts on all three cards from OUTREACH_WEEKLY_LIMIT). Render test asserting no card claims venue messaging as an upgrade-only feature.  
Status: FIXED in 1100be5f (this session, test-first, gate green)  

### LA-C012  [Medium]  Billing page uses US spelling 'Canceled' in the status badge and lapsed-subscription banner

Where: `website/src/app/(pages)/artist-portal/billing/page.tsx:71`  
Area: A · Slice: P06  
Journey: Artist whose subscription lapsed opens Billing and reads 'Your subscription has been canceled. Choose a plan below to reactivate.' and (if the badge renders) 'Canceled'; the same page's Change Plan copy says 'cancelled' (line 534).  
Evidence (finder's, unverified): Line 71: `canceled: "Canceled"` (user-visible label). Line 447: 'Your subscription has been canceled.' Line 534 on the same page: 'your old plan is cancelled'. The stored value `canceled` is Stripe's enum and is fine in code; the labels are copy.  
Root cause (claimed): Stripe's American enum leaked into the display strings.  
Fixable (finder's view): yes  
Suggested fix: Change the two labels to 'Cancelled'; add an assertion to billing/page.test.tsx rendering status 'canceled' and expecting /cancelled/i.  
Status: OPEN, unverified  

### LA-C013  [Medium]  Blogs list shows 'You haven't written anything yet' when the load fails, and a network failure is an unhandled rejection

Where: `website/src/app/(pages)/artist-portal/blogs/page.tsx:88`  
Area: A · Slice: P06 (also P06)  
Journey: Artist with existing drafts opens My blogs while /api/blogs/mine returns 500 (or the request drops); the page says they have written nothing, with no error or retry.  
Evidence (finder's, unverified): Lines 83-97: `const res = await authFetch("/api/blogs/mine"); if (!cancelled && res.ok) {...}` inside an async IIFE with `try { } finally { }` and no catch: a non-OK response leaves `rows` [] and line 123-124 renders the empty state; a thrown NetworkError propagates as an unhandled promise rejection. blogs/mine/route.ts:23-26 returns 500 `{error: "Could not load blogs"}` on a DB error. Contrast blogs/[id]/edit/page.tsx:33-49, which has both `!res.ok` and catch error states. Caveat: BLOGS_V1's production value could not be read from a logged-out GET; NEXT_PUBLIC_FLAG_BLOGS_V1 is set in Vercel and prod holds 3 published + 1 rejected blogs created through a POST that 403s when the flag is off, so the surface is very likely live.  
Root cause (claimed): Only the happy path is handled; no error state and no catch.  
Fixable (finder's view): yes  
Suggested fix: Add a `loadError` state set on `!res.ok` and in a catch, and render it instead of the empty state. Test: authFetch resolves `{ok:false}` → text 'Could not load' shown and 'You haven't written anything yet' absent.  
Status: OPEN, unverified  

### LA-C014  [Medium]  Collections: a failed delete or publish toggle silently reverts with no message

Where: `website/src/app/(pages)/artist-portal/collections/page.tsx:214`  
Area: A · Slice: P06  
Journey: Artist clicks Delete on a collection (confirms), the card vanishes then reappears when the DELETE returns 500/403 or the network drops, with nothing said. Same for the Published/Draft toggle on any error other than the 402 paywall.  
Evidence (finder's, unverified): Lines 211-216: `try { await mutate(\`/api/collections?id=...\`, { method: "DELETE" }) } catch { setUserCollections(prev); }` with an empty catch. Lines 255-264: toggle catch reverts and only handles `err.code === "subscription_required"`; every other ApiError/NetworkError is dropped. `formError` state exists (line 60) but is only used inside the form.  
Root cause (claimed): Optimistic updates with a bare revert and no error surface.  
Fixable (finder's view): yes  
Suggested fix: Set a list-level error (e.g. `listError`) from `apiErrorMessage(err, ...)` in both catches and render it above the grid. Test: mutate rejects with ApiError(500) on delete → card still present and an alert with the message is shown.  
Status: OPEN, unverified  

### LA-C015  [Medium]  Deleting a collection or toggling Published/Draft fails silently: the card snaps back with no message

Where: `website/src/app/(pages)/artist-portal/collections/page.tsx:214`  
Area: A · Slice: P06  
Journey: Artist confirms Delete on a collection; the card disappears then reappears. Or clicks 'Published' to make it a draft; it snaps back. Nothing explains why.  
Evidence (finder's, unverified): handleDelete lines 208-216: `try { await mutate(`/api/collections?id=...`, { method: "DELETE" }); } catch { setUserCollections(prev); }` with no error state. toggleAvailability lines 255-264: the catch reverts and only opens UpgradePrompt when `err.code === "subscription_required"`; a 500, a 404 'Artist profile not found' or a network failure reverts with nothing said. Contrast handleSave (lines 182-189) which sets formError.  
Root cause (claimed): Two mutation handlers revert optimistic state without surfacing the failure.  
Fixable (finder's view): yes  
Suggested fix: Add a list-level error string set from apiErrorMessage(err, ...) in both catches and render it above the grid. Test: mutate rejects, assert the alert text renders and the card is restored.  
Status: FIXED in fdc2eaac (this session, test-first, gate green)  

### LA-C016  [Medium]  Signed-out artist following the offer email link lands on /login and is not returned to the offers page after signing in

Where: `website/src/app/(pages)/artist-portal/offers/page.tsx:13`  
Area: A · Slice: P06  
Journey: Artist clicks the 'view offer' CTA in an offer email while signed out, is sent to /login, signs in, and lands on the portal dashboard instead of /artist-portal/offers?focus=<id>; the offer is not highlighted and they must find it.  
Evidence (finder's, unverified): offers/page.tsx:11-18 comment 'Email CTA → signed-out lands here → bounce to login with `next`' and sets `window.location.href = /login?next=...`. But the page never mounts signed-out: layout.tsx wraps it in PortalGuard, which at PortalGuard.tsx:104-105 does `router.replace("/login")` (no next) and at :193 `if (!user) return null;`, so the page's effect never runs. Email deep links exist: api/offers/[id]/route.ts:198 `basePath = ... "/artist-portal/offers"` with `?focus=` (route.test.ts:300 expects '/artist-portal/offers?focus=off_1'). login/page.tsx:101-105 honours `?next=` when present, so only the guard's omission loses it. Same applies to /artist-portal/blogs?..., /artist-portal/messages?venue=... deep links.  
Root cause (claimed): PortalGuard's signed-out redirect drops the requested path; the page-level fallback is unreachable dead code.  
Fixable (finder's view): yes  
Suggested fix: In PortalGuard, redirect to `/login?next=${encodeURIComponent(pathname + window.location.search)}` (usePathname is already in scope) and delete the dead effect in offers/page.tsx. Pin in PortalGuard.test.tsx: signed-out on /artist-portal/offers?focus=x → replace called with '/login?next=%2Fartist-portal%2Foffers%3Ffocus%3Dx'.  
Status: OPEN, unverified  

### LA-C017  [Medium]  A blog cover image on any host outside remotePatterns would 500 the whole /blog index

Where: `website/src/app/(pages)/blog/page.tsx:132`  
Area: A · Slice: P02  
Journey: An artist pastes a cover URL from any host other than images.unsplash.com, picsum.photos or the Supabase project into the editor's free-text 'Cover image URL (optional)' field; an admin approves the post; from then on every visitor to /blog (and that post) gets a 500 until the row is changed.  
Evidence (finder's, unverified): page.tsx:130-139 renders `<Image src={post.cover_image_url} ... />` for every published DB row (and blog/[slug]/page.tsx:267). next.config.ts:65-68 allows only picsum.photos, images.unsplash.com and uwkuhygwvasdzwsusiym.supabase.co. node_modules/next/dist/shared/lib/image-loader.js:91-96 throws `Invalid src prop (...) on next/image, hostname "..." is not configured under images` whenever NODE_ENV !== 'test' and the runtime is not edge, i.e. in production. No host check on the way in: api/blogs/route.ts:25 `cover_image_url: z.string().max(2000).optional()`, api/blogs/[id]/route.ts:37 `z.string().max(2000).nullable().optional()`, api/admin/blogs/[id]/route.ts:94 `z.string().url().nullable().optional()`; BlogEditor.tsx:236-241 is a plain text input. No live instance: SQL shows with_cover = 0 for all published rows.  
Root cause (claimed): A free-text URL is accepted end to end and the renderer assumes an allowed host; next/image turns that into a render-time throw.  
Fixable (finder's view): yes  
Suggested fix: Validate the cover host against the allowed image hosts at submit-for-review and admin approval (or render DB covers with `unoptimized`, which bypasses the loader check); test: a published row with cover_image_url 'https://example.com/x.jpg' either renders the index without throwing or is rejected at PATCH.  
Status: OPEN, unverified  

### LA-C018  [Medium]  Blog index excerpts and DB-post meta descriptions print raw markdown syntax

Where: `website/src/app/(pages)/blog/page.tsx:162`  
Area: A · Slice: P02  
Journey: Any visitor on /blog reads a card excerpt such as '...Safe to delete. ## A heading Some **bold text** and some *italic text* and a [link](https://www.wallplace.co.uk/browse)'; a shared or indexed DB post gets the same raw syntax as its description.  
Evidence (finder's, unverified): page.tsx:162 `{(post.body_markdown ?? "").slice(0, 240)}`; blog/[slug]/page.tsx:159 `description: (dbRecord.blog.body_markdown ?? "").slice(0, 160)`. Live GET /blog HTML contains, inside the card <p class="... line-clamp-2">, the text `## A heading\n\nSome **bold text** and some *italic text* and a [link](https://www.wallplace.co.uk/browse)`. The post body itself was fixed (A32: renderMarkdown at blog/[slug]/page.tsx:308); the index and generateMetadata were not.  
Root cause (claimed): A32 fixed only the body render; the excerpt and the metadata description still slice the raw markdown string.  
Fixable (finder's view): yes  
Suggested fix: Add one plain-text-excerpt helper (strip heading markers, emphasis, link syntax, collapse whitespace) used by the index card and by generateMetadata; test: a body starting '## A heading\n\nSome **bold**' yields 'A heading Some bold' in both.  
Status: OPEN, unverified  

### LA-C019  [Medium]  Lightbox and gallery-overlay Buy Now build cart lines without per-size shipping, frame or dimensions, so shipping differs from the artwork page for the same work

Where: `website/src/app/(pages)/browse/[slug]/ArtistProfileClient.tsx:1138`  
Area: A · Slice: P04  
Journey: Buyer opens a work in the profile lightbox (or the hover overlay on the portfolio grid) and clicks Buy Now. Checkout quotes and charges shipping from the work-level shippingPrice or the £14.50 fallback, ignoring the artist's per-size shipping price, the chosen frame and the size, whereas the same configuration bought from the artwork page uses all of them.  
Evidence (finder's, unverified): ArtistProfileClient.tsx:1127-1139 (lightbox) passes shippingPrice: currentWork.shippingPrice ?? undefined and no dimensions, framed or frameLabel even when a frame is selected (sizeLabel at :1109 carries the frame); :614-628 (gallery overlay Buy now) passes work-level shippingPrice and framed:false. The artwork page passes effectiveShippingPrice (per-size first, ArtworkPageClient.tsx:116-119), dimensions, framed and frameLabel (:462-479, B11/E46c). src/lib/shipping-checkout.ts:71-82 resolves each line from exactly those fields and falls back to FALLBACK_MEDIUM_UK = 14.5 (:40, :82) when there is no manual price and dimensions is null.  
Root cause (claimed): B11 corrected the artwork page's cart line but the two add-to-cart sites on the profile page still build the older line shape.  
Fixable (finder's view): yes  
Suggested fix: Build the lightbox and overlay cart lines with the same fields as ArtworkPageClient (per-size shippingPrice, dimensions from the selected label, framed, frameLabel). Extend ArtistProfileClient.test.tsx to assert addItem receives them for a framed, per-size-shipping work.  
Status: OPEN, unverified  

### LA-C020  [Medium]  Browse page has no error state: if the artists or collections fetch fails it silently shows only the seed catalogue

Where: `website/src/app/(pages)/browse/page.tsx:575`  
Area: A · Slice: P04  
Journey: Any visitor on /browse when /api/browse-artists or /api/browse-collections fails or returns non-JSON. The page keeps the 41 fictional Sample artists and no live artists or collections, with no message that anything is missing and no way to retry.  
Evidence (finder's, unverified): page.tsx:569-584: both fetches end in .catch(() => { /* keep static data */ }) and Promise.allSettled(...).then(() => setDataReady(true)). A grep of the file finds no fetch-failure copy (the only error string is the postcode line at :1291). page.test.tsx covers a never-resolving fetch (Sample pill) but not a rejected one.  
Root cause (claimed): Fetch failures are swallowed to preserve the seed paint, with no user-visible fallback notice.  
Fixable (finder's view): yes  
Suggested fix: Keep the seed paint but set a loadError flag in the catch and render a small 'Live listings could not be loaded' banner with a retry button. Test: mock fetch rejecting, assert the banner renders.  
Status: FIXED in 93d9164d, 302c7cf0 (this session, test-first, gate green)  

### LA-C021  [Medium]  Clearing "Address line 2" when editing a saved address is silently ignored; the old line reappears after "Address updated"

Where: `website/src/app/(pages)/customer-portal/addresses/page.tsx:100`  
Area: A · Slice: P05  
Journey: Customer, edits an address, blanks the second line, clicks Save address, sees the toast "Address updated", and the list reloads with the old line 2 still there.  
Evidence (finder's, unverified): addresses/page.tsx:100 builds `line2: form.line2.trim() || undefined`; JSON.stringify drops an undefined key so the PATCH body has no `line2`. `customerAddressUpdateSchema` is `.partial()` (lib/validations.ts:498-501), and app/api/customer-addresses/[id]/route.ts:56 only writes `if (parsed.data.line2 !== undefined) updates.line2 = parsed.data.line2 || null;`, so the column is untouched. `optionalString` (validations.ts:23-27) preprocesses null to "" and accepts `z.literal("")`, so sending an empty string would clear it.  
Root cause (claimed): The create and edit paths share one payload builder that treats an empty line2 as "not provided", which is correct for POST but wrong for a partial PATCH where absence means keep.  
Fixable (finder's view): yes  
Suggested fix: On PATCH send `line2: form.line2.trim()` (empty string) so the route's `|| null` clears the column; pin with a jsdom test that edits an address with a line2 to blank and asserts the mutate body contains `"line2":""`.  
Status: OPEN, unverified  

### LA-C022  [Medium]  Address book empty state's "Add address" button links to "#" and does nothing

Where: `website/src/app/(pages)/customer-portal/addresses/page.tsx:305`  
Area: A · Slice: P05  
Journey: Customer with no saved addresses, sees "No saved addresses" with a prominent "Add address" button, clicks it, the page scrolls to top and no form opens.  
Evidence (finder's, unverified): addresses/page.tsx:302-307 passes `cta={{ label: "Add address", href: "#" }}` to EmptyState, which renders `<Link href={cta.href}>` (src/components/EmptyState.tsx:26-33). The working control is the separate header button at :184-190 calling `startCreate`. The existing test mocks EmptyState to null (page.test.tsx:23) so nothing pins this.  
Root cause (claimed): EmptyState only supports an href CTA, so a placeholder anchor was used instead of the startCreate handler.  
Fixable (finder's view): yes  
Suggested fix: Remove the `cta` from this EmptyState (the header "Add address" button is already visible) or extend EmptyState with an `onClick` action and wire it to `startCreate`; add a test asserting the empty state renders no anchor with href "#".  
Status: FIXED in 48f9a1e3 (this session, test-first, gate green)  

### LA-C023  [Medium]  A failed or non-2xx address load is shown as "No saved addresses"

Where: `website/src/app/(pages)/customer-portal/addresses/page.tsx:55`  
Area: A · Slice: P05  
Journey: Customer, /api/customer-addresses answers 500 (or the token has expired, 401); the page shows the "No saved addresses" empty state with no toast and no retry, so a customer with saved addresses is told they have none.  
Evidence (finder's, unverified): addresses/page.tsx:55-61: `authFetch("/api/customer-addresses").then((r) => r.json()).then((data) => { if (Array.isArray(data.addresses)) setAddresses(data.addresses); }).catch(() => showToast("Couldn't load your addresses.", ...))`. There is no `r.ok` check; a `{ error: "Failed to fetch addresses" }` body (route.ts:27) parses fine, has no `addresses` array, the catch never runs, and :302 renders EmptyState because `addresses.length === 0 && !creating`. On a network throw the toast fires but the persistent UI is still the empty state.  
Root cause (claimed): Same class as the C2 fix already applied to the orders dashboard: the read path has no error state distinct from the empty state.  
Fixable (finder's view): yes  
Suggested fix: Throw on `!r.ok`, track a `loadError` flag and render an error line with a retry button (mirroring customer-portal/page.tsx:569-578) instead of EmptyState; test with a 500 Response asserting "No saved addresses" is absent.  
Status: FIXED in c22d97cc (this session, test-first, gate green)  

### LA-C024  [Medium]  Customer with a collect-from-venue order is shown "Shipping to" with a blank address and never sees where to collect the work

Where: `website/src/app/(pages)/customer-portal/page.tsx:368`  
Area: A · Slice: P05  
Journey: Customer, opens a collect_venue order on /customer-portal, sees a "Shipping to" block reading their name then ", " and no collection address, then a "Confirm collection" button asking "Have you picked this up?" without saying where.  
Evidence (finder's, unverified): page.tsx:367-372 renders `Shipping to` + `{selected.shipping?.fullName}` and `{selected.shipping?.addressLine1}, {selected.shipping?.city} {selected.shipping?.postcode}` unconditionally. `collection_address?: string | null` is declared on the Order interface at page.tsx:39 and `grep -rn collection_address` shows no other occurrence in the file, so it is never rendered. For collect_venue the checkout schema `collectionShippingSchema` (lib/validations.ts:347-357) makes addressLine1/city/postcode `optionalString`, and the webhook stores them as `""` (app/api/webhooks/stripe/route.ts:977-987) while writing the venue address to `orders.collection_address` (route.ts:1012). The existing test fixture `collectOrder` (page.test.tsx:455-462) carries `collection_address: "The Copper Kettle, 1 High St, Hampton"` and nothing asserts it renders.  
Root cause (claimed): The detail panel was written for shipped orders; when collection orders were added (rows 870-874) the confirm control was adapted but the address block was not, and the `collection_address` field was typed but never read.  
Fixable (finder's view): yes  
Suggested fix: When `isCollectionOrder(selected)`, render a "Collect from" block with `selected.collection_address` (with a fallback line if null) instead of the shipping block; add a test on the existing collectOrder fixture asserting the address text is present and "Shipping to" is absent.  
Status: FIXED in 87f03e77 (this session, test-first, gate green)  

### LA-C025  [Medium]  A failed saved-items load, or a failed catalogue load, is shown as "No saved works yet" with no feedback

Where: `website/src/app/(pages)/customer-portal/saved/page.tsx:92`  
Area: A · Slice: P05  
Journey: Customer, /api/saved answers 500 or the public /api/browse-artists request fails; the Saved page shows "No saved works yet" and "Tap the heart icon...", no toast, no error, no retry.  
Evidence (finder's, unverified): saved/page.tsx:92-106: `Promise.all([authFetch("/api/saved").then((r) => r.json()), fetch("/api/browse-artists").then((r) => r.json())]).then(([savedData, artistsData]) => { if (savedData.items) setItems(savedData.items); ... }).catch(() => {}).finally(() => setLoading(false))`. No `r.ok` check on either request, an empty `catch(() => {})`, and Promise.all rejects the saved result if the catalogue request throws. With `items` still [] line 160 renders the EmptyState for every tab.  
Root cause (claimed): Read path swallows failures and has no error state; the C7 work only addressed catalogue-empty versus work-gone, not fetch failure.  
Fixable (finder's view): yes  
Suggested fix: Check `r.ok` on both, use Promise.allSettled so a catalogue failure does not discard saved items, add an error state with retry; test with /api/saved rejecting asserting no EmptyState and an error message.  
Status: OPEN, unverified  

### LA-C026  [Medium]  FAQ says Premium and Pro 'offer lower platform fees on sales', contradicting the flat 15% stated three questions earlier on the same page

Where: `website/src/app/(pages)/faqs/page.tsx:53`  
Area: A · Slice: P01  
Journey: An artist on /faqs opens 'How much does it cost to join Wallplace as an artist?' and reads 'Higher tiers (Premium at £24.99/month, Pro at £49.99/month) offer lower platform fees on sales and more visibility.' The General FAQ above it says 'a flat 15% platform fee on artwork sales'.  
Evidence (finder's, unverified): faqs/page.tsx:52-54: 'Higher tiers (Premium at £24.99/month, Pro at £49.99/month) offer lower platform fees on sales and more visibility.' faqs/page.tsx:25-26: 'a flat 15% platform fee on artwork sales'. src/lib/pricing.ts:24 PLATFORM_FEE_PERCENT = 15 for every plan. Probe render of FaqsPage matched both /offer lower platform\s+fees on sales/ and /flat 15% platform fee/.  
Root cause (claimed): Stale copy from the retired 15/8/5 fee ladder.  
Fixable (finder's view): yes  
Suggested fix: Replace with 'Higher tiers (Premium at £24.99/month, Pro at £49.99/month) give you more works, more active placements, more venue approaches and more visibility; the 15% platform fee is the same on every plan.' Add a public-claims assertion forbidding /lower platform fees/ in faqs/page.tsx.  
Status: OPEN, unverified  

### LA-C027  [Medium]  /feature-requests shows 'No open requests yet.' when the API fails

Where: `website/src/app/(pages)/feature-requests/page.tsx:52`  
Area: A · Slice: P02  
Journey: Any visitor loads /feature-requests while GET /api/feature-requests returns 500; the page renders the empty state 'No open requests yet.' with no error message and no retry, so a working board and a broken one look identical.  
Evidence (finder's, unverified): page.tsx:52-59: `const res = await fetch(...); const data = await res.json(); setRequests(data.requests || []);` with no `res.ok` check; the catch (:55-56) also just sets `[]`. api/feature-requests/route.ts:40-43 returns `{ error: "Could not load requests" }` with status 500 on a DB error. Empty-state text at :211.  
Root cause (claimed): No error state exists; a failed load collapses into the empty state.  
Fixable (finder's view): yes  
Suggested fix: Check `res.ok`, hold an `error` state and render 'Couldn't load requests. Try again.' with a retry that calls load(); test: mock fetch to 500 and assert the empty-state text is absent and the error text present.  
Status: FIXED in d27096f0 (this session, test-first, gate green)  

### LA-C028  [Medium]  A signed-in user's feature request is saved as anonymous and they get no acknowledgement email

Where: `website/src/app/(pages)/feature-requests/page.tsx:73`  
Area: A · Slice: P02  
Journey: Artist, venue or customer signs in, opens /feature-requests, presses Submit idea (the email field is hidden because they are signed in), sees 'Submitted. Thanks!'. The row lands with user_id null and email null, the admin alert reads 'From: anonymous', and the feedback_received acknowledgement is never sent.  
Evidence (finder's, unverified): page.tsx:73-82 posts with bare `fetch("/api/feature-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body })` and sends `email: !user && email.trim() ? email.trim() : undefined` (undefined when signed in; field hidden at :173). route.ts:59-60 `const auth = await getAuthenticatedUser(request); const userId = auth.error ? null : auth.user?.id || null;` and src/lib/api-auth.ts:9 reads only `request.headers.get("authorization")`. route.ts:85 `contactEmail = parsed.data.email || (userId ? auth.user?.email || null : null)` -> null, and :106 `if (contactEmail)` gates the acknowledgement send. By contrast the page's upvote uses `mutate` (page.tsx:116), which attaches the bearer token (src/lib/api-client.ts:36-38).  
Root cause (claimed): The submit handler uses plain fetch instead of authFetch/mutate, so the route never receives the session it is written to link to.  
Fixable (finder's view): yes  
Suggested fix: Send the POST through `mutate` (already imported and used for upvotes) so the bearer token reaches the route; test: with useAuth returning a user, assert the request carries Authorization, and a route unit test asserts user_id and email are recorded and feedback_received is sent.  
Status: FIXED in 3d2e250e (this session, test-first, gate green)  

### LA-C029  [Medium]  Confirm delivery failure replaces the whole order view with one line, and a network failure shows nothing

Where: `website/src/app/(pages)/orders/[id]/page.tsx:169`  
Area: A · Slice: P04  
Journey: Buyer (signed in or via the receipt token) on /orders/[id] presses 'Confirm delivery'. On any non-2xx (a transient 5xx, or the 403 'Only the buyer can confirm delivery' that an artist or venue viewer gets, since GET admits them but POST does not) the stepper, the Confirm button and the dispute panel vanish and only 'Could not confirm delivery, please try again.' remains until a reload. If fetch throws (offline) the button just flips back with no message.  
Evidence (finder's, unverified): page.tsx:156-176 handleConfirm is try/finally with no catch; line 169 writes the page-level error state; the render at lines 248-252 shows error ? <p>{error}</p> instead of the stepper branch (lines 263-469) that holds the Confirm button and dispute panel. Route src/app/api/orders/[id]/events/route.ts:101-110 lets buyer, artist or venue GET the order, while POST lines 190-196 return 403 to anyone but the buyer, so the Confirm button is shown to viewers who cannot use it.  
Root cause (claimed): Confirm failures reuse the load-error state instead of a local one, and the handler has no catch for thrown fetches.  
Fixable (finder's view): yes  
Suggested fix: Add a confirmError state rendered inside the Confirm panel, wrap the request in try/catch, and only show the Confirm button when order.buyerEmail matches the viewer or a token is present. Test: mock POST 403 and a rejected fetch; assert the stepper stays and a message appears.  
Status: FIXED in d9307774 (this session, test-first, gate green)  

### LA-C030  [Medium]  Pricing hero says the tiers differ by platform fee, but every tier pays the same flat 15%

Where: `website/src/app/(pages)/pricing/page.tsx:139`  
Area: A · Slice: P01  
Journey: A visitor on /pricing reads in the hero 'The difference is visibility and the platform fee on sales', then two sections down reads '15% / 15% / 15%' in the table and 'Every plan pays the same 15% fee on sales' in the Pro case box.  
Evidence (finder's, unverified): pricing/page.tsx:138-140: 'All tiers give you access to the Wallplace platform and venue network. The difference is visibility and the platform fee on sales.' pricing/page.tsx:59-62 platform fee row 15/15/15; :312 'Every plan pays the same 15% fee on sales'. src/lib/pricing.ts:20-24: PLATFORM_FEE_PERCENT = 15 with comment 'Flat fee on every plan (owner decision 2026-08-28). The old inverted ladder (15/8/5)...'. Probe render matched both sentences in one output.  
Root cause (claimed): Hero copy written for the old 15/8/5 fee ladder was not updated when the fee went flat on 2026-08-28.  
Fixable (finder's view): yes  
Suggested fix: Rewrite to 'The difference is visibility and capacity: how many works, placements and venue approaches you get.' Pin with a public-claims assertion that pricing/page.tsx does not match /difference is .* platform fee/.  
Status: FIXED in 5f8fa28f (this session, test-first, gate green)  

### LA-C031  [Medium]  Pricing comparison table promises Premium a 'Featured' artist profile, which only Pro receives

Where: `website/src/app/(pages)/pricing/page.tsx:25`  
Area: A · Slice: P01  
Journey: An artist on /pricing deciding between Premium and Pro reads 'Artist profile: Core Standard / Premium Featured / Pro Premium' and expects a Premium subscription to make their profile Featured; the marketplace only features Pro.  
Evidence (finder's, unverified): pricing/page.tsx:22-27: `feature: "Artist profile", core: "Standard", premium: "Featured", pro: "Premium"`. src/lib/tier-features.ts:4-7 and :18-20: 'Pro: Featured artist (chip, first in the marketplace sort, the only tier ?featured=1 returns). Premium: Artwork of the Week only.' and `isFeaturedArtistPlan = plan === "pro"`. src/lib/plan-features.ts:27-35 lists no Featured perk for Premium; :40 gives 'Featured artist: your profile leads the marketplace' to Pro. public-claims.test.ts:44-54 pins plan-features.ts but not this table.  
Root cause (claimed): The table predates the 2026-09-02 tier-perk decision and was not regenerated from tier-features/plan-features.  
Fixable (finder's view): yes  
Suggested fix: Change the row to core 'Standard', premium 'Standard, plus Artwork of the Week', pro 'Featured' (or derive labels from tier-features). Extend the public-claims test to read pricing/page.tsx and forbid `premium: "Featured"`.  
Status: OPEN, unverified  

### LA-C032  [Medium]  Pricing comparison table tells artists they get 3/6/15 venue approaches a week while the FAQ and plan cards on the same page say 7/15/30

Where: `website/src/app/(pages)/pricing/page.tsx:42`  
Area: A · Slice: P01 (also P06)  
Journey: Any visitor (logged out or artist) on /pricing comparing tiers reads 'New venue approaches: 3 a week / 6 a week / 15 a week' in the Feature comparison table, then reads 'Core covers 7 new venue approaches a week, Premium 15, and Pro 30' in the Pricing questions accordion and 'Approach 7 new venues a week' on the Core card.  
Evidence (finder's, unverified): pricing/page.tsx:40-45 hard-codes `core: "3 a week", premium: "6 a week", pro: "15 a week"`. src/lib/outreach-cap.ts:34-38 defines OUTREACH_WEEKLY_LIMIT = { core: 7, premium: 15, pro: 30 } with the comment 'owner decision 2026-09-03: raised from 3/6/15'. pricing/page.tsx:93 interpolates OUTREACH_WEEKLY_LIMIT into the FAQ; src/lib/plan-features.ts:23 interpolates it into the card perks. Scratchpad jsdom probe (renderToStaticMarkup of PricingPage) matched both /3 a week/ and /Core covers 7 new venue approaches a week, Premium 15, and Pro 30/ in the same rendered output. No test reads the comparisonRows (public-claims.test.ts only reads plan-features.ts).  
Root cause (claimed): The comparison table was left as literals when the cap was raised on 2026-09-03; every other surface reads OUTREACH_WEEKLY_LIMIT.  
Fixable (finder's view): yes  
Suggested fix: Build the row from the constant: `core: \`${OUTREACH_WEEKLY_LIMIT.core} a week\``, etc. Pin with a source-read assertion in tests/integration/public-claims.test.ts that pricing/page.tsx contains no `"\d+ a week"` literal.  
Status: FIXED in 41cbbe54 (this session, test-first, gate green)  

### LA-C033  [Medium]  Privacy policy names 'Wallplace Ltd' as data controller while the company is not incorporated

Where: `website/src/app/(pages)/privacy/page.tsx:24`  
Area: A · Slice: P02  
Journey: Any visitor reads 'Wallplace Ltd ("Wallplace", "we"...) operates the website ... We are the data controller' and a contact block 'Wallplace Ltd, London, UK' (:272), while /terms, /artist-agreement and /venue-agreement carry the note 'Wallplace is the trading name of a business in the process of being incorporated'.  
Evidence (finder's, unverified): privacy/page.tsx:24 `Wallplace Ltd (&ldquo;Wallplace&rdquo;, ...` and :272 `Wallplace Ltd`; src/lib/company.ts:10-12 `legalName: "", number: "", registeredOffice: ""`, so isIncorporated() is false; LegalEntityNote.tsx:26 renders the pre-incorporation sentence on the other legal pages; the brief states the legal name is a placeholder and that rendering it as real is a finding.  
Root cause (claimed): The privacy page hard-codes an entity name instead of using COMPANY / LegalEntityNote like the other legal pages.  
Fixable (finder's view): yes  
Suggested fix: Replace both literals with the trading name and add <LegalEntityNote /> under the title (reading registered details from COMPANY once set); test: extend tests/integration/public-claims.test.ts so privacy/page.tsx cannot contain 'Wallplace Ltd' while isIncorporated() is false.  
Status: OPEN, unverified  

### LA-C034  [Medium]  Venue confirmation email and admin alert are sent before the account exists; a failed signUp leaves a 'registered' venue with no account

Where: `website/src/app/(pages)/signup/venue/page.tsx:161`  
Area: A · Slice: P03 (also P03)  
Journey: Venue registers with an email that already has a Wallplace account (or any other signUp failure). /api/register-venue inserts the venue_registrations row and queues 'Your venue is registered on Wallplace' to the venue plus 'New venue registration' to the admin, then supabase.auth.signUp fails and the page shows the Supabase error. The venue has been told they are registered and the admin has a lead, but no account was created.  
Evidence (finder's, unverified): Call order at page.tsx:161 (register-venue POST) then :174 (signUp). src/app/api/register-venue/route.ts:99-134 sends both emails whenever the insert succeeds. A retry is absorbed as a duplicate (route.ts:70-72; live constraint venue_registrations_email_key UNIQUE (email)) so the second attempt sends nothing and the journey depends entirely on signUp succeeding. Live: 6 registrations, 0 without a matching auth.users email, so no live instance today.  
Root cause (claimed): The registration record and the emails that announce it are committed before the account creation they describe.  
Fixable (finder's view): yes  
Suggested fix: Call supabase.auth.signUp first and POST /api/register-venue only after it succeeds (ensureVenueProfile already tolerates a missing registration by falling back to display_name). Pin the order in signup/venue/page.test.tsx with mock invocationCallOrder.  
Status: FIXED in 9ce3fca9 (this session, test-first, gate green)  

### LA-C035  [Medium]  Venue registration posts the venue's plaintext password to /api/register-venue, which neither needs nor stores it

Where: `website/src/app/(pages)/signup/venue/page.tsx:164`  
Area: A · Slice: P03 (also P03)  
Journey: Venue submitting Register Your Venue. The entire form state, including password and confirmPassword, is JSON-posted to /api/register-venue before supabase.auth.signUp is called.  
Evidence (finder's, unverified): page.tsx:161-165 `body: JSON.stringify(form)`; VenueFormState (lines 54-71) includes password and confirmPassword. registerVenueSchema (src/lib/validations.ts) has no password field and zod ^4.3.6 z.object strips unknown keys, so nothing is persisted; the route logs only `error` (route.ts:74) and no body logging was found in register-venue/route.ts, rate-limit.ts or client-ip.ts. The credential still leaves the browser to an endpoint with no use for it.  
Root cause (claimed): The whole form state object is serialised wholesale instead of the registration fields.  
Fixable (finder's view): yes  
Suggested fix: Destructure password and confirmPassword out of form before JSON.stringify in the register-venue POST. Add an assertion to signup/venue/page.test.tsx that the /api/register-venue fetch body contains no password key.  
Status: FIXED in 9b77867d (this session, test-first, gate green)  

### LA-C036  [Medium]  Analytics tiles 'Unique works scanned' and 'Artists scanned' can never exceed 10 because they count the API's top-10 lists, not the distinct totals

Where: `website/src/app/(pages)/venue-portal/analytics/page.tsx:106`  
Area: A · Slice: P08  
Journey: Venue with more than ten distinct scanned works (or artists) in the period sees the tile stuck at 10. Also, scans recorded without a work id (labels whose work could not be matched to the artist roster) count in 'QR scans' but never in 'Unique works scanned', so the two tiles disagree.  
Evidence (finder's, unverified): analytics/page.tsx:106 `{loading ? "…" : data?.top_works.length ?? 0}` under the 'Unique works scanned' heading, :113 `data?.top_artists.length ?? 0` under 'Artists scanned'. The route truncates both: analytics/venue/route.ts:84-86 `const topWorkIds = Object.entries(workScanCounts).sort(...).slice(0, 10)` and :115-117 `.slice(0, 10)` for artists, and only events with `event.work_id` enter workScanCounts (:79). The labels page only sets a work id when the placement title matches a roster work: labels/page.tsx:237 `const work = artist?.works?.find((w) => w.title === p.work_title)`, :252 `workId: work?.id`, and LabelSheet.tsx:80 only sets `w=` when `l.workId` exists.  
Root cause (claimed): The page derives distinct counts from lists the API caps at ten, and the API exposes no distinct-count fields.  
Fixable (finder's view): yes  
Suggested fix: Return `unique_works: Object.keys(workScanCounts).length` and `unique_artists: Object.keys(artistScanCounts).length` from the route (additive fields) and read them on the page. Pin with a route test feeding 12 distinct work ids and asserting unique_works === 12 while top_works.length === 10.  
Status: FIXED in bfa9baf9 (this session, test-first, gate green)  

### LA-C037  [Medium]  Venue analytics shows 'No scans yet' and 0 in every tile when the analytics API fails or the venue profile is missing; no error message, no retry

Where: `website/src/app/(pages)/venue-portal/analytics/page.tsx:48`  
Area: A · Slice: P08  
Journey: Venue opens Analytics while /api/analytics/venue returns 404 (no venue_profiles row yet, e.g. self-heal failed) or 500 (query failure) or the request drops. They see 'QR scans 0', 'No scans yet. Print QR labels for your placements and we'll start tracking them here.' and believe they have no scans.  
Evidence (finder's, unverified): analytics/page.tsx:47-56 `if (d.error) { console.warn("[venue analytics]", d.error); setData(null); } ... .catch(() => setData(null))`; :99 `{loading ? "…" : data?.totals.qr_scans ?? 0}`; :124-125 `!data || data.top_works.length === 0 ? <p>No scans yet. ...`; :186-187 same for artists. The route returns those error bodies: analytics/venue/route.ts:48-50 `return NextResponse.json({ error: "Venue profile not found" }, { status: 404 })` and :65-67 `{ error: "Analytics query failed" }, { status: 500 }`. No error state exists in the page (grep for 'error' in JSX: none).  
Root cause (claimed): The error path collapses into the same null data the empty state renders from; the page has no error state.  
Fixable (finder's view): yes  
Suggested fix: Hold an `error` string in state when `!res.ok`, `d.error` or the catch fires; render it with a 'Try again' button instead of the empty copy. Add analytics/page.test.tsx (jsdom, mock authFetch returning `{error:'Venue profile not found'}` with status 404) asserting the error text renders and 'No scans yet' does not.  
Status: FIXED in f33937f1 (this session, test-first, gate green)  

### LA-C038  [Medium]  QR Labels page shows 'No active placements yet' when the placements request fails, hiding the error from a venue that does have placements

Where: `website/src/app/(pages)/venue-portal/labels/page.tsx:99`  
Area: A · Slice: P08  
Journey: Venue opens QR Labels while /api/placements returns a non-2xx (e.g. 401/500, or the `{error}` body the route sends when the venue profile is missing) or the network drops. The page renders the empty state 'No active placements yet. Once an artist has accepted a placement for your venue, you'll be able to print QR labels...' although they have active placements.  
Evidence (finder's, unverified): labels/page.tsx:98-101 `const res = await authFetch("/api/placements"); const data = await res.json(); const all = (data.placements || []) as Placement[];` with no `res.ok` check (authFetch never throws on non-2xx, api-client.ts:52-59); :183-186 `catch (e) { console.error("labels load error", e); } finally { setLoading(false); }`; :301-305 `placements.length === 0 ? <div>...No active placements yet...`. No error state exists in the page.  
Root cause (claimed): A failed load leaves `placements` as [] and the only non-loading branch for that is the empty state; the error is logged to the console only.  
Fixable (finder's view): yes  
Suggested fix: Check `res.ok` and hold a `loadError` state rendered with a Retry button (the same F18 pattern MessageInbox uses at MessageInbox.tsx:306-338 and :931-949). Extend labels/page.test.tsx with authFetch returning a 500 `{error}` for /api/placements and assert the error copy renders and 'No active placements yet' does not.  
Status: OPEN, unverified  

### LA-C039  [Medium]  Orders page shows 'No placement sales yet' when the orders request fails

Where: `website/src/app/(pages)/venue-portal/orders/page.tsx:66`  
Area: A · Slice: P09  
Journey: Venue opens Orders while /api/orders returns 500 or the network drops: stats read 0 / £0.00 and the empty state with 'Discover art' appears, as if they had no sales.  
Evidence (finder's, unverified): orders/page.tsx:58-68 `authFetch("/api/orders").then(...).catch(() => {}).finally(() => setLoading(false))`; no error state exists, and 276-287 renders `<EmptyState title={tab === "sales" ? "No placement sales yet" : ...}>` whenever `visibleOrders.length === 0`.  
Root cause (claimed): Silent catch on the only data fetch; loading false plus empty array is indistinguishable from a genuine empty ledger.  
Fixable (finder's view): yes  
Suggested fix: Set an error state in the catch (and on !res.ok) and render a 'Couldn't load your orders' banner with Retry instead of the empty state; jsdom test with a rejected authFetch asserts the banner and not 'No placement sales yet'.  
Status: OPEN, unverified  

### LA-C040  [Medium]  Dashboard shows £0 / 0 tiles and an all-incomplete checklist when its data requests fail

Where: `website/src/app/(pages)/venue-portal/page.tsx:114`  
Area: A · Slice: P09  
Journey: Venue lands on the dashboard while /api/dashboard or /api/placements fails: 'Total Spent £0', 'Revenue Share Earned £0', 'Getting Started 0 of 5', 'No recent activity yet', all presented as fact.  
Evidence (finder's, unverified): page.tsx:112-130 every fetch ends `.catch(() => ({}))`, `.catch(() => ({ placements: [] }))`, `.catch(() => ({ totals: { qr_scans: 0 } }))`, `.catch(() => ({}))`, `.catch(() => ({ walls: [] }))`; 162-167 `setStats([...])` is computed from those fallbacks and 170-193 the checklist from `dashboardData.profile || {}`. No error state is rendered anywhere in the component.  
Root cause (claimed): Every failure is coerced to an empty success object, so the page cannot tell an outage from a new account.  
Fixable (finder's view): yes  
Suggested fix: Record which fetches failed and show a small 'Some figures couldn't load' banner (leave tiles at their loading glyph rather than £0); jsdom test with /api/dashboard rejected asserts the banner.  
Status: OPEN, unverified  

### LA-C041  [Medium]  A paid-loan fee under £15 is rejected with the unexplained 'Invalid placement data'; the form never mentions the floor

Where: `website/src/app/(pages)/venue-portal/placements/page.tsx:1030`  
Area: A · Slice: P09  
Journey: Venue ticks Paid loan, types a fee of £10 (input allows min 0), clicks Request, sees 'Invalid placement data' with no hint what to change.  
Evidence (finder's, unverified): placements/page.tsx:1030-1043 `<input type="number" min={0} step={1} ... placeholder="e.g. 50">`; no client-side floor check and grep for 'PAID_LOAN_MIN_GBP|start at £|£15|minimum' in the page returns nothing. src/lib/validations.ts:13-19 `monthlyFeeGbp ... .refine((v) => v === 0 || v >= PAID_LOAN_MIN_GBP, { message: 'Monthly loan fees start at £15. Set 0 for a free loan.' })`, pricing.ts:52 `PAID_LOAN_MIN_GBP = 15`. placements/route.ts:367-369 `if (!parsed.success) return NextResponse.json({ error: "Invalid placement data" }, { status: 400 })` discards the zod message. Executed probe with the page's payload and monthlyFeeGbp 10 => REJECTED '0.monthlyFeeGbp: Monthly loan fees start at £15. Set 0 for a free loan.'; fee 50 and fee 0 => ACCEPTED.  
Root cause (claimed): The floor is enforced only server-side and the route replaces the specific zod message with a generic one, so the form gives no feedback the user can act on.  
Fixable (finder's view): yes  
Suggested fix: Validate the fee client-side (0 or >= PAID_LOAN_MIN_GBP) with the same wording beside the input, and/or have the route return the first zod issue message; jsdom test: fee 10 shows the £15 message and does not POST.  
Status: OPEN, unverified  

### LA-C042  [Medium]  Status dropdown offers 'Completed' and 'Sold' but both are rejected by the API with 'ID and valid status required'

Where: `website/src/app/(pages)/venue-portal/placements/page.tsx:1470`  
Area: A · Slice: P09  
Journey: Venue on an Active placement (desktop table) picks Completed or Sold in the status pill dropdown; the row flips then rolls back with an error toast 'ID and valid status required'.  
Evidence (finder's, unverified): placements/page.tsx:1470-1478 `<select ... onChange={(e) => updateStatus(p.id, e.target.value)}>` with `<option value="Completed">` and `<option value="Sold">`. src/lib/placements/status-update.ts:14-20 maps `Completed: "completed", Sold: "completed"` and PATCHes `{ id, status: apiStatus }` (57-60). src/lib/validations.ts:273 `status: z.enum(["pending","active","declined","paused","cancelled"]).optional()` with the comment 'completed is deliberately absent ... No client sends it'. placements/route.ts:906-909 returns 400 'ID and valid status required' on parse failure. Executed probe: `placementUpdateSchema.safeParse({id:"abc",status:"completed"})` => REJECTED 'Invalid option: expected one of "pending"|"active"|"declined"|"paused"|"cancelled"'. status-update.test.ts:75-82 shows the client path with newStatus 'Completed' (mutate mocked, so the schema is never hit).  
Root cause (claimed): E23b removed 'completed' from the PATCH schema (completion must go through stage 'collected') but the venue page's dropdown still offers the two statuses that map to it.  
Fixable (finder's view): yes  
Suggested fix: Drop Completed/Sold from the select (completion is driven by the PlacementStepper's collected stage, already on the same expanded row) or render the pill read-only for Active rows; test that the select options are all accepted by placementUpdateSchema.  
Status: OPEN, unverified  

### LA-C043  [Medium]  On mobile the expanded placement card always shows 'QR Scans 0' whatever the real count

Where: `website/src/app/(pages)/venue-portal/placements/page.tsx:1920`  
Area: A · Slice: P09  
Journey: Venue on a phone expands a live placement that has been scanned; QR Scans reads 0. The same row on desktop shows the real number.  
Evidence (finder's, unverified): placements/page.tsx:1918-1921 `<p className="text-muted mb-0.5">QR Scans</p><p className="text-foreground font-medium">0</p>` (literal). Desktop at 1611-1612 renders `{p.qrScans ?? 0}`. The API supplies it: placements/route.ts:317 `qr_scans: pid ? (qrByPlacement[pid] || 0) : 0`, mapped at page 535.  
Root cause (claimed): Hard-coded placeholder left in the mobile card.  
Fixable (finder's view): yes  
Suggested fix: Render `{p.qrScans ?? 0}` in the mobile card; jsdom test at a narrow viewport with qr_scans 4 asserts '4'.  
Status: OPEN, unverified  

### LA-C044  [Medium]  The 'Saved' group in the Request Placement artist picker never populates

Where: `website/src/app/(pages)/venue-portal/placements/page.tsx:211`  
Area: A · Slice: P09  
Journey: Venue with saved artists opens Request Placement; the picker shows Messaged / Previously placed groups but never a Saved group, or the fallback text if those are empty too.  
Evidence (finder's, unverified): placements/page.tsx:209-211 `const savedRes = await authFetch("/api/saved"); const savedData = await savedRes.json(); const items = savedData.savedItems || [];` then 213 filters `x.type === "artist"` and reads `i.itemId`. src/app/api/saved/route.ts:24 `return NextResponse.json({ items: data || [] })` (rows are `select("*")`, snake_case). SavedContext.tsx:52-58 reads the same endpoint correctly: `data.items.map((row: { item_type, item_id, created_at }) => ...)`.  
Root cause (claimed): The picker reads a response key (savedItems) and field names (type/itemId) that the endpoint does not return; the endpoint returns items with item_type/item_id.  
Fixable (finder's view): yes  
Suggested fix: Read `savedData.items` and filter on `item_type === 'artist'` / `item_id` (or reuse useSaved() which already holds the list); jsdom test mocking /api/saved with `{ items: [{ item_type: 'artist', item_id: 'fin-coles' }] }` asserts a Saved group renders.  
Status: OPEN, unverified  

### LA-C045  [Medium]  Placements page shows 'No placements found.' when the list request fails

Where: `website/src/app/(pages)/venue-portal/placements/page.tsx:543`  
Area: A · Slice: P09  
Journey: Venue opens Placements while /api/placements fails: the tabs show 0 counts and the table says 'No placements found.' with no error.  
Evidence (finder's, unverified): placements/page.tsx:464-546 loadPlacements: `try { ... } catch { /* ignore */ } finally { setLoading(false); }`; also 470 `if (!data.placements) return;` swallows an `{error}` body. Empty copy at 1783-1785 and 2063-2065 `No placements found.` renders for any empty `filtered`.  
Root cause (claimed): Silent catch on the primary fetch with no error state.  
Fixable (finder's view): yes  
Suggested fix: Track a loadError and render an error banner with Retry; jsdom test with rejected authFetch asserts the banner.  
Status: FIXED in 8375b51d (this session, test-first, gate green)  

### LA-C046  [Medium]  A just-sent placement request is shown with a fake id, so its Open, Cancel and QR-label actions fail until the page is reloaded

Where: `website/src/app/(pages)/venue-portal/placements/page.tsx:646`  
Area: A · Slice: P09  
Journey: Venue sends a request, the new row appears; clicking 'Open full placement' gives 'not found' (/placements/p-1757…), Cancel gives an error toast, the direction column shows '-' and the header count is stale.  
Evidence (finder's, unverified): placements/page.tsx:645-646 `id: \`p-${Date.now()}-${Math.random()...}\``; 662-675 `await mutate("/api/placements", { method: "POST", ... })` then 677-695 `setPlacements([...mapped, ...placements])` using that id; there is no `loadPlacements()`/`loadLiveActiveCount()` call and no `wallplace:placement-changed` dispatch in the success path (696-703 only reset form state). placements/route.ts:885 `return NextResponse.json({ success: true })` returns no ids. The row's actions use p.id: 1751 `href={\`/placements/${encodeURIComponent(p.id)}\`}`, 1520 Cancel -> cancelPlacement -> PATCH `{ id }` (852-855), 1726 labels link, 1527-1539 archive DELETE `?id=`.  
Root cause (claimed): Optimistic insert with a client-generated id and no refetch after the POST, while the API returns no created row.  
Fixable (finder's view): yes  
Suggested fix: After a successful POST call loadPlacements(), loadLiveActiveCount() (and dispatch the placement-changed event) instead of inserting a synthetic row; jsdom test: after POST resolves, authFetch('/api/placements') is called again and no id starting 'p-' is rendered.  
Status: FIXED in dc6aab7b (this session, test-first, gate green)  

### LA-C047  [Medium]  Wall editor bounces a dual-role venue owner to the homepage on userType alone, unlike the rest of the portal

Where: `website/src/app/(pages)/venue-portal/walls/[id]/page.tsx:88`  
Area: A · Slice: P09  
Journey: Venue whose auth user also owns an artist profile (userType 'artist') opens My Walls, clicks a wall card, lands on '/' instead of the editor.  
Evidence (finder's, unverified): walls/[id]/page.tsx:88-91: `if (userType && userType !== "venue") { router.replace("/"); return; }`. The gate that admitted them uses ownership instead: VenuePortalLayout.tsx:87 `const venueAllowed = userType === "venue" || ownsVenue === true;` and PortalGuard.tsx:110-111 `if (ownRoles === null) return; if (ownRoles.includes(allowedType)) return;`. The wall list page (walls/page.tsx) renders inside VenuePortalLayout and so does not bounce, which is how the venue reaches the card.  
Root cause (claimed): The full-bleed editor replicates an older metadata-only role check inline (its header comment says so) and was not updated with the ownership-based check.  
Fixable (finder's view): yes  
Suggested fix: Remove the inline userType bounce (venue-portal/layout.tsx already wraps this route in PortalGuard allowedType="venue") or mirror the ownsVenue check; jsdom test: userType 'artist' with a session does not call router.replace('/').  
Status: FIXED in 50e3d6dd (this session, test-first, gate green)  

### LA-C048  [Medium]  Artist agreement acceptance is recorded without the signed-in user's identity (user_id NULL on every live row)

Where: `website/src/components/ApplicationForm.tsx:312`  
Area: A · Slice: P03 (also P03)  
Journey: Artist, signed in (the /apply gate requires it), submits the application. Two terms_acceptances rows (platform_tos and artist_agreement) are written with user_id NULL and an email taken from the request body, even though a verified token was available.  
Evidence (finder's, unverified): ApplicationForm.tsx:285 submits /api/apply through mutate(), which attaches the bearer token (src/lib/api-client.ts:17-19), but lines 312-321 post /api/terms/accept twice with a bare fetch and no Authorization header. src/app/api/terms/accept/route.ts:38-61 derives identity only from a token; without one it inserts user_id: null and the body's userEmail. Live SQL (SELECT user_type, terms_type, count(*), count(user_id) FROM terms_acceptances GROUP BY 1,2): artist/artist_agreement 12 rows, with_user_id 0; all 62 rows across every type have user_id NULL. The venue and customer signup pages fire pre-session, but the application form is the one caller that always has a session.  
Root cause (claimed): The two terms POSTs predate the auth gate on /apply and were never moved to mutate() when the /api/apply call was.  
Fixable (finder's view): yes  
Suggested fix: Replace both fetch("/api/terms/accept") calls in ApplicationForm with mutate("/api/terms/accept", …).catch(() => {}) so the route's authenticated branch stamps user_id and the token email. Pin with a jsdom ApplicationForm test that mocks mutate and asserts it is called for both terms types.  
Status: FIXED in 4c5f8e45 (this session, test-first, gate green)  

### LA-C049  [Medium]  A transient failure of /api/artist-profile sends an approved artist to the application form with no message

Where: `website/src/components/ArtistPortalLayout.tsx:218`  
Area: A · Slice: P06  
Journey: Approved artist opens any portal page while /api/artist-profile times out or returns a non-JSON error (e.g. a 504); they are silently redirected to /apply and shown the artist application form as if they had never applied.  
Evidence (finder's, unverified): Lines 198-226: `.then((r) => r.json())` (throws on a non-JSON body) and `.catch(() => { setProfileCheck("missing"); router.replace("/apply"); })`. Also line 210: any response without `profile` (including a 500 `{error}` JSON) is treated as 'no profile' and redirected. apply/page.tsx and ApplicationForm.tsx contain no existing-profile detection (grep 'artist-profile|already|existing': none relevant), so the artist sees a blank application.  
Root cause (claimed): Server errors are conflated with 'no profile row'; the redirect fires on every failure mode.  
Fixable (finder's view): yes  
Suggested fix: Redirect to /apply only when the response is 2xx with `profile === null`; on other failures render an inline 'Could not load your portal. Try again.' with a retry. Test: authFetch rejects → replace('/apply') not called and the retry copy renders.  
Status: OPEN, unverified  

### LA-C050  [Medium]  Venue pages say there is 'No contract' while the FAQ says venues must sign one and a Venue Partnership Agreement exists

Where: `website/src/components/marketing/VenueGuide.tsx:128`  
Area: A · Slice: P01  
Journey: A venue owner on /venues (or the venues tab of /how-it-works) opens 'Is there a contract?' and reads 'No. Just a simple partnership agreement covering the basics.' and the final CTA 'No curation fee. No contract.' The same visitor on /faqs reads 'Do we need to sign a contract? Yes, a simple partnership agreement covers care of artwork...' linking to /venue-agreement, and the home page card says 'Free to browse and enquire. No contracts.'  
Evidence (finder's, unverified): VenueGuide.tsx:126-129: `question: "Is there a contract?", answer: "No. Just a simple partnership agreement covering the basics. 30 days' notice to end at any time."`; VenueGuide.tsx:320 'No curation fee. No contract.'; src/app/page.tsx:441 'Free to browse and enquire. No contracts.'. faqs/page.tsx:304-311: 'Do we need to sign a contract? Yes, a simple partnership agreement covers care of artwork, display period, sales, and damage... read the full venue agreement here' → /venue-agreement (exists in pages.txt). faqs/page.tsx:172-173 and 321-327 rely on that agreement for venue liability. Probe render of VenuesPage matched /No\. Just a simple partnership agreement/ and /No curation fee\. No contract\./.  
Root cause (claimed): Marketing copy treats 'no contract' as a synonym for 'no fee', while the FAQ and legal pages correctly describe a binding partnership agreement.  
Fixable (finder's view): yes  
Suggested fix: Change the VenueGuide answer to 'Yes, a short plain-English partnership agreement covering care of artwork, display period and sales, cancellable on 30 days\' notice', and change 'No contract(s).' on VenueGuide.tsx:320 and page.tsx:441 to 'No fees.' Pin with a public-claims assertion forbidding /No contracts?\./ in those three files.  
Status: OPEN, unverified  

### LA-C051  [Medium]  Offers list shows 'No offers yet.' when the offers API fails

Where: `website/src/components/offers/OffersList.tsx:122`  
Area: A · Slice: P06 (also P06)  
Journey: Artist with pending offers opens Offers while GET /api/offers?role=artist returns 500 or 401 (expired token) or the network drops; the page says 'No offers yet.' and nothing else.  
Evidence (finder's, unverified): Lines 115-127: `catch { setOffers([]); }` and for a non-2xx authFetch resolves, `data.offers` is undefined → `setOffers([])`. Lines 268-278 return the empty-state paragraph before the `error` banner at line 282 is ever reachable, and `setError` is never called on the load path.  
Root cause (claimed): Load failures are indistinguishable from an empty list.  
Fixable (finder's view): yes  
Suggested fix: Set `error` when `!res.ok` or in the catch and render it ahead of the empty state (with a retry). Test: authFetch rejects → 'Could not load offers' shown, 'No offers yet.' absent. Does not touch the owner-gated pay() handler.  
Status: OPEN, unverified  

### LA-C052  [Medium]  Cart line size is capped at 50 characters while artists may save 100-character size labels plus 80-character frame labels, and the buyer only sees 'Cart items and shipping required'

Where: `website/src/lib/validations.ts:309`  
Area: A · Slice: P04  
Journey: Buyer of a work whose selected size label, or size label plus frame label, exceeds 50 characters completes the whole checkout form and presses Proceed to Payment. The amber banner says 'Cart items and shipping required' under a fully completed form and the purchase cannot proceed.  
Evidence (finder's, unverified): validations.ts:217 sizePricingSchema.label = safeString(100); :250 frame label = safeString(80); :309 checkoutItemSchema.size = safeString(50). ArtworkPageClient.tsx:445-446 builds size as `${selectedPricing.label} + ${selectedFrame.label}` (same shape at ArtistProfileClient.tsx:1109). src/app/api/checkout/route.ts:51-53 answers every schema failure with {error:'Cart items and shipping required'}, shown by checkout/page.tsx:520-529. Scratch tsx probe against the real schemas: a 57-character label is accepted by sizePricingSchema (true) and rejected by checkoutSchema with issue items.0.size 'Too big: expected string to have <=50 characters', both bare and with a frame appended. Live SQL: 0 available works with a label over 50 chars (max 18) and 0 label+frame combinations over 50, so a guard blind spot with no live instance.  
Root cause (claimed): The cart-line cap was set independently of the artist-side caps whose output it must accept, and the route collapses every schema failure into one generic message.  
Fixable (finder's view): yes  
Suggested fix: Raise checkoutItemSchema.size to max(200) (100 + ' + ' + 80 = 183) and add a validations test that a 100-character label with an 80-character frame label parses through checkoutSchema.  
Status: OPEN, unverified  

### LA-C053  [Medium]  An account that owns both an artist and a venue profile is let into the venue portal but Dashboard, Orders and Placements are served the artist's data

Where: `website/src/app/api/dashboard/route.ts:22`  
Area: B · Slice: P09  
Journey: Dual-role user (the two production accounts PortalGuard.tsx:45-47 describes) opens /venue-portal: stats, checklist, orders and placements are the artist side's, not the venue's.  
Evidence (finder's, unverified): PortalGuard.tsx:108-111 admits the user when `/api/account/roles` ownRoles includes 'venue' regardless of userType. But every backing GET picks artist first: dashboard/route.ts:22-30 `.from("artist_profiles")...single(); const { data: venueProfile } = !artistProfile ? ... : { data: null }`; orders/route.ts:48-51 same pattern, so venueSlug is null (orders/page.tsx:73-75 then classifies sales by venue_revenue only); placements/route.ts:67-83 `getUserRole` returns artist if an artist_profiles row exists, and GET at 122-126 then queries `artist_user_id`, not `venue_user_id`.  
Root cause (claimed): The 3.9 fix made the client-side gate ownership-aware, but the three APIs still infer one role per user with artist taking precedence, so a venue portal page for a dual-role user reads the wrong side.  
Fixable (finder's view): yes  
Suggested fix: Let the three GETs accept an explicit portal context (e.g. `?as=venue`, honoured only when the caller owns a venue_profiles row) and have the venue pages send it; pin with a route test for a user who owns both profiles.  
Status: FIXED in b9ec59de (this session, test-first, gate green)  

### LA-C054  [Medium]  Delete-account copy says orders are permanently deleted; the route keeps them and anonymises personal details

Where: `website/src/components/AccountDangerZone.tsx:55`  
Area: D · Slice: P05  
Journey: Customer (also artist and venue) on Settings reads "This permanently deletes your profile, messages, saved items, and any orders attached to your account", deletes, and their order rows are in fact retained.  
Evidence (finder's, unverified): AccountDangerZone.tsx:54-57 copy quoted above, rendered on customer-portal/settings/page.tsx:126. app/api/account/delete/route.ts:15-21 states "even the hard path RETAINS those rows and anonymises the personal identifiers"; :148-149 excludes orders and refund_requests from TABLES_USER_ID; :328-345 runs `db.from("orders").update({ buyer_email: anonTag, shipping: {} })` rather than delete.  
Root cause (claimed): The component copy predates the C14a retention policy change in the route and was not updated.  
Fixable (finder's view): yes  
Suggested fix: Reword to say profile, messages and saved items are deleted and that order records are kept for tax and legal reasons with personal details removed; pin the sentence in AccountDangerZone.test.tsx.  
Status: FIXED in 18c88c64 (this session, test-first, gate green)  

### LA-C055  [Medium]  An account that owns an artist profile but carries a different user_type cannot open any artist portal page; ArtistPortalLayout bounces on metadata alone

Where: `website/src/components/ArtistPortalLayout.tsx:181`  
Area: F · Slice: P06 (also P06)  
Journey: A user whose user_metadata.user_type is 'admin' (or 'venue') but who owns an artist_profiles row visits /artist-portal/analytics (or any page in this slice): PortalGuard admits them via ownRoles, then ArtistPortalLayout immediately router.replace('/login'), and the login page forwards them to /admin (or /venue-portal). They can never reach the artist portal.  
Evidence (finder's, unverified): ArtistPortalLayout.tsx:181-183 `if (!loading && (!user || userType !== "artist")) { router.replace("/login") }` and :255 `if (!user || userType !== "artist" || ...) return null;`. PortalGuard.tsx (pass 2 item 3.9) waits for /api/account/roles and admits when `ownRoles.includes(allowedType)`; VenuePortalLayout.tsx:68-100 was updated to the same ownership check (`venueAllowed = userType === "venue" || ownsVenue === true`); ArtistPortalLayout was not (grep ownRoles: PortalGuard, VenuePortalLayout, roles route only). auth-roles.ts:7 includes 'admin' in ALLOWED_ROLES so parseRole('admin') = 'admin'; portalPathForRole('admin') = '/admin' (auth-roles.ts:47). login/page.tsx:105 redirects an already-signed-in user to portalPathForRole(userType). Live instance (read-only SQL, artist_profiles ⋈ venue_profiles ⋈ auth.users): user cb00196e-01f3-4f14-a320-358deb6f67e7 has metadata_user_type 'admin' and an artist profile (review_status pending); /api/account/roles (route.ts:55) would return ownRoles containing 'artist' for it.  
Root cause (claimed): The artist layout still keys access on user_metadata.user_type, the weaker authority the 3.9 fix moved away from, so PortalGuard and the layout disagree.  
Fixable (finder's view): yes  
Suggested fix: Mirror VenuePortalLayout: fetch /api/account/roles, compute `artistAllowed = userType === "artist" || ownsArtist === true`, and only bounce when ownership is resolved false. Add to ArtistPortalLayout.test.tsx: userType 'admin' + ownRoles ['artist'] renders the portal and does not call replace('/login').  
Status: OPEN, unverified  

### LA-C056  [Medium]  Login, forgot-password, resend-verification and signup rate limits are per serverless instance in production (no Upstash), and the precheck's assumed Cloudflare edge layer is not in front of the site

Where: `website/src/lib/rate-limit.ts:27`  
Area: J · Slice: P03  
Journey: Any visitor hitting /api/auth/precheck (login 8/min, forgot-password 3/5 min), /api/auth/resend-verification (3/5 min), /api/register-venue, /api/apply or /api/terms/accept is limited only by the in-memory Map of whichever instance served the request; a brute-force or mail-bombing attempt spread across instances is not counted.  
Evidence (finder's, unverified): rate-limit.ts:27-35 falls back to memStore when UPSTASH_REDIS_REST_URL/_TOKEN are unset and its own warning reads "Each serverless instance has its own store, so this provides NO protection in production". docs/qa/2026-09-05-launch-audit/vercel-env-names.txt (25 names) contains neither variable. precheck/route.ts:4-5 says "Cloudflare edge rules are the primary line of defence", but verify-turnstile/route.ts:73-75 records that production is fronted by Vercel, not Cloudflare.  
Root cause (claimed): The durable limiter depends on env vars that were never provisioned, and the fallback fails open by design.  
Fixable (finder's view): no, Needs the owner to provision Upstash Redis and set the two env vars; no code change closes it.  
Suggested fix: Provision Upstash, set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in production, then confirm the [rate-limit] warning stops appearing in runtime logs.  
Status: OPEN, unverified  

## Low (67)

### LA-C057  [Low]  Email preferences: a non-2xx JSON answer on load leaves "Loading your preferences…" on screen indefinitely

Where: `website/src/app/(pages)/account/email/page.tsx:45`  
Area: A · Slice: P05  
Journey: Signed-in user whose token has expired (401 `{error}`) or any non-2xx JSON body: the page shows the heading and "Loading your preferences…" forever, with no error and nothing to click.  
Evidence (finder's, unverified): email/page.tsx:45-48 `authFetch(...).then((r) => r.json()).then((data) => { if (!cancelled && data?.preferences) setPrefs(data.preferences); }).catch(...)`; no `r.ok` check, so an `{ error }` body sets neither prefs nor error, and :119-120 renders the loading text while `prefs` is null.  
Root cause (claimed): Missing `r.ok` check on the read path.  
Fixable (finder's view): yes  
Suggested fix: Throw on `!r.ok` so the existing catch sets the error message; test with a 401 Response asserting the error text renders.  
Status: OPEN, unverified  

### LA-C058  [Low]  Email preferences: when a save fails the toggle stays in the new, unsaved position

Where: `website/src/app/(pages)/account/email/page.tsx:55`  
Area: A · Slice: P05  
Journey: Signed-in user toggles a category, the PATCH fails, sees "Could not save. Try again." but the switch still shows the new state, so the screen disagrees with what the server holds.  
Evidence (finder's, unverified): email/page.tsx:52-68: `setPrefs(next)` runs before `await mutate(...)`; the catch only calls `setError("Could not save. Try again.")` and never restores `prefs`. Contrast src/lib/use-notification-prefs.ts:103-107, which reverts the field on failure.  
Root cause (claimed): Optimistic update without a revert path.  
Fixable (finder's view): yes  
Suggested fix: Capture the previous prefs and `setPrefs(previous)` in the catch; jsdom test with mutate rejecting asserts the checkbox returns to its prior checked state.  
Status: OPEN, unverified  

### LA-C059  [Low]  Signed-out email-preferences page links "Use the link in your most recent email" to the bare unsubscribe page, which can only show its error state

Where: `website/src/app/(pages)/account/email/page.tsx:99`  
Area: A · Slice: P05  
Journey: Signed-out visitor on /account/email clicks the "Use the link in your most recent email" link and lands on "We couldn't read the unsubscribe details from the link. Please use the link in the email..."  
Evidence (finder's, unverified): email/page.tsx:99 `<Link href="/account/email/unsubscribe">` with no `u` or `c`; unsubscribe/page.tsx:63-64 computes `state = !u || !category ? "missing" : ...` and :82-86 renders the error copy.  
Root cause (claimed): The sentence is advice, not a destination, but it was marked up as a link to a page that needs query parameters the link cannot carry.  
Fixable (finder's view): yes  
Suggested fix: Render the sentence as plain text (or link to `/login?next=/account/email`); test that the signed-out state has no anchor to the bare /account/email/unsubscribe path.  
Status: OPEN, unverified  

### LA-C060  [Low]  Unsubscribe "critical category" state sends every role to /customer-portal/settings to delete their account

Where: `website/src/app/(pages)/account/email/unsubscribe/page.tsx:78`  
Area: A · Slice: P05  
Journey: An artist or venue landing on the critical state clicks "delete your account from your settings page", PortalGuard shows "This is the customer portal. Redirecting to your artist portal." and lands them on their dashboard, not a delete control.  
Evidence (finder's, unverified): unsubscribe/page.tsx:78 hard-codes `href="/customer-portal/settings"`; PortalGuard.tsx:108-119 redirects a non-customer to `portalPathForRole(...)` (the portal root). Reachable only by hand-typed URLs today because tx-category emails render no unsubscribe link (emails/_components/EmailShell.tsx:83-93).  
Root cause (claimed): The page assumes every recipient is a customer.  
Fixable (finder's view): yes  
Suggested fix: Link to /account/email (role-neutral) or say "from your portal's settings page" without a link; test the critical state's href.  
Status: OPEN, unverified  

### LA-C061  [Low]  Opening /account/export runs a full data export and sends a receipt email on every page load, including a refresh

Where: `website/src/app/(pages)/account/export/page.tsx:32`  
Area: A · Slice: P05  
Journey: Signed-in user opens /account/export (or follows the "download" button in the export receipt email, which points back at this page), gets another export and another "Your Wallplace data export is ready" email each time; on the fourth load in five minutes the page shows "Too many requests. Please try again later."  
Evidence (finder's, unverified): export/page.tsx:26-61 fires `authFetch("/api/account/export")` from a mount effect with no button. app/api/account/export/route.ts:154-175 sends `account_data_export_ready` (a live id per live-ids.txt) on every 200, and :26 rate-limits to 3 per 300s; rate-limit.ts:96-100 returns `{ error: "Too many requests. Please try again later." }` which the page surfaces. The email's downloadUrl is `${SITE}/account/export` (route.ts:167).  
Root cause (claimed): The C30/C31 rewrite made the export synchronous and auto-ran it on mount; the receipt email is sent per export, so page loads and emails are one to one.  
Fixable (finder's view): no, Gating the export behind an explicit button changes the interaction the C30/C31 note chose deliberately; it is a product decision for the owner rather than a correctness fix.  
Suggested fix: Show an "Export my data" button and run the fetch on click; test that no authFetch fires on mount.  
Status: OPEN, unverified  

### LA-C062  [Low]  "Secure your account" page bounces artists and venues to profile editors that have no password control

Where: `website/src/app/(pages)/account/security/page.tsx:22`  
Area: A · Slice: P05  
Journey: Signed-in artist or venue opens /account/security (the page says "secure it now by resetting your password"), is immediately redirected to /artist-portal/profile or /venue-portal/profile, where there is no password or reset control.  
Evidence (finder's, unverified): security/page.tsx:22-23 `router.replace("/artist-portal/profile")` / `router.replace("/venue-portal/profile")`. `grep -n -i "password"` over artist-portal/profile/page.tsx and venue-portal/profile/page.tsx returns nothing; the controls live in artist-portal/settings/page.tsx:76 (handlePasswordChange) and venue-portal/settings/page.tsx:362-368 ("Change password" link to /forgot-password). Severity is Low because no live email links here: `account_suspicious_login` and `account_two_factor_disabled` are both in dormant-ids.txt, and grep finds no other inbound link to /account/security.  
Root cause (claimed): The redirect comment says "Each portal owns its own settings surface, where password reset + session controls live" but the artist and venue targets point at the profile pages, not settings.  
Fixable (finder's view): yes  
Suggested fix: Redirect artists to /artist-portal/settings and venues to /venue-portal/settings; add a jsdom test with mocked useAuth asserting the router.replace target for each of the three roles.  
Status: OPEN, unverified  

### LA-C063  [Low]  /apply/claim creates an account with no terms acceptance and no Turnstile check

Where: `website/src/app/(pages)/apply/claim/page.tsx:76`  
Area: A · Slice: P03  
Journey: Logged-out visitor following an old email link to /apply/claim fills name, email and password; supabase.auth.signUp runs with no TermsCheckbox, no /api/terms/accept POST and no /api/auth/verify-turnstile call, unlike /signup/artist which requires all three.  
Evidence (finder's, unverified): page.tsx:65-143 handleSubmit contains no terms or turnstile calls; compare signup/artist/page.tsx:80-123. grep for 'apply/claim' finds only ApplicationForm.tsx:333 as an inbound link, and signed-in arrivals are redirected to /artist-portal/profile?welcome=1 (page.tsx:52-55, test passing), so only stale external links reach the form. Terms acceptance rows are the evidence trail for a contractual act (terms/accept/route.ts:8-9).  
Root cause (claimed): The claim page predates the terms and Turnstile hardening applied to the three signup pages.  
Fixable (finder's view): yes  
Suggested fix: Add TermsCheckbox (required, gating submit) and the /api/terms/accept POST to the claim form, or retire the signed-out form by redirecting to /signup/artist?next=/apply. Render test asserting submit is gated on the checkbox.  
Status: OPEN, unverified  

### LA-C064  [Low]  Terms impose a £100 signed-for delivery duty on artists that the Artist Agreement never mentions

Where: `website/src/app/(pages)/artist-agreement/page.tsx:104`  
Area: A · Slice: P02  
Journey: An artist reading their agreement (section 7, Fulfilment Obligations) learns nothing about signed-for delivery or keeping proof of signature, yet the Terms tell buyers 'Artworks sold for £100 or more require a signed-for delivery service. Artists are responsible for arranging this and must retain proof of signature for at least 12 months.'  
Evidence (finder's, unverified): terms/page.tsx:98 carries the signed-for rule; terms/page.tsx:75 says 'Full artist obligations are set out in the Artist Agreement'; artist-agreement/page.tsx:104-111 lists packing, shipping within 5 business days, tracking 'where available', condition and 7-day responses only.  
Root cause (claimed): The rule was added to the buyer terms without the matching clause in the artist document.  
Fixable (finder's view): yes  
Suggested fix: Add the signed-for (£100+) and proof-of-signature bullet to Artist Agreement section 7; pin with a public-claims test that both files mention signed-for delivery.  
Status: FIXED in 8bcd6f9d (this session, test-first, gate green)  

### LA-C065  [Low]  Returning from Stripe Connect onboarding, the billing page ignores the stripe_connect=complete|refresh parameter it is sent

Where: `website/src/app/(pages)/artist-portal/billing/page.tsx:119`  
Area: A · Slice: P06  
Journey: Artist finishes (or abandons) Stripe Connect onboarding and is returned to /artist-portal/billing?stripe_connect=complete or ?stripe_connect=refresh. On refresh (expired link) they see the Payouts panel with no message; the parameter stays in the address bar in both cases.  
Evidence (finder's, unverified): src/app/api/stripe-connect/onboard/route.ts:104-111 sets refresh_url `/artist-portal/billing?stripe_connect=refresh` and return_url `/artist-portal/billing?stripe_connect=complete`. billing/page.tsx:116-127 reads only `changed` and `subscribed`.  
Root cause (claimed): The page reads two of the four query parameters it is sent.  
Fixable (finder's view): yes  
Suggested fix: Read stripe_connect: on refresh show 'Your Stripe link expired, start again', on complete a success line, then replaceState. jsdom test with each parameter present.  
Status: FIXED in 601405cb (this session, test-first, gate green)  

### LA-C066  [Low]  A failed payout-status lookup renders the Payouts panel as 'Set Up Payouts' for an artist whose payouts are already active

Where: `website/src/app/(pages)/artist-portal/billing/page.tsx:202`  
Area: A · Slice: P06  
Journey: Stripe is unavailable or the stored account id is stale; the artist's Billing page tells them to 'Set up payouts to receive earnings directly to your bank account.' although payouts are connected.  
Evidence (finder's, unverified): Lines 201-207 `authFetch("/api/stripe-connect/status").then((res) => res.json()).then((data) => setConnectStatus(data)).catch(() => {})`. The status route calls `stripe.accounts.retrieve(accountId)` unguarded (src/app/api/stripe-connect/status/route.ts:33), so a Stripe error becomes an unhandled 500 whose body is not JSON; res.json() throws, connectStatus stays null and the final else branch (lines 646-660) renders the 'Set Up Payouts' copy and button.  
Root cause (claimed): No error state for the payout-status load; null is treated as 'no account'.  
Fixable (finder's view): yes  
Suggested fix: Check res.ok and set connectError('Couldn't check your payout status right now.') for the load path instead of falling into the no-account branch. Test with a 500 Response.  
Status: FIXED in 801371de (this session, test-first, gate green)  

### LA-C067  [Low]  Referral code 'Copy' button gives no confirmation and ignores clipboard failures

Where: `website/src/app/(pages)/artist-portal/billing/page.tsx:374`  
Area: A · Slice: P06  
Journey: Artist clicks Copy next to their referral code; nothing changes on screen, so they cannot tell whether it copied (and on a denied clipboard permission the promise rejection is unhandled).  
Evidence (finder's, unverified): Line 374: `onClick={() => { navigator.clipboard.writeText(sub.referral_code || ""); }}` with no await, no toast, no state change; useToast is already imported on the page (line 8).  
Root cause (claimed): Fire-and-forget clipboard call without feedback.  
Fixable (finder's view): yes  
Suggested fix: `await navigator.clipboard.writeText(...)` then `showToast("Referral code copied")`, with a catch that toasts an error; test asserts showToast is called.  
Status: FIXED in aa0b5c04 (this session, test-first, gate green)  

### LA-C068  [Low]  Collections list shows 'No collections yet.' when the list request fails, and the API itself answers 200 with an empty list on a database error

Where: `website/src/app/(pages)/artist-portal/collections/page.tsx:78`  
Area: A · Slice: P06  
Journey: Artist with collections opens the page during a failure and is offered 'Create your first collection'.  
Evidence (finder's, unverified): page.tsx:72-83: no res.ok check, `.catch(() => { if (!cancelled) setUserCollections([]); })`; lines 873-887 render the empty state. src/app/api/collections/route.ts:160-163 returns `{ collections: [] }` with status 200 when the query errors, so the server hides the failure as well.  
Root cause (claimed): Failure mapped to the empty state at both layers.  
Fixable (finder's view): yes  
Suggested fix: Route: return 500 on error. Page: check res.ok and render a loadError. Test each.  
Status: OPEN, unverified  

### LA-C069  [Low]  Enquiries empty state CTA says 'View your public profile' but opens the Edit Profile page

Where: `website/src/app/(pages)/artist-portal/enquiries/page.tsx:156`  
Area: A · Slice: P06 (also P06)  
Journey: Artist with no enquiries clicks 'View your public profile' expecting their public page and lands on the portal's Edit Profile form.  
Evidence (finder's, unverified): Line 156: `cta={{ label: "View your public profile", href: "/artist-portal/profile" }}`. profile/page.tsx:634 `<h1>Edit Profile</h1>`; the public page is /browse/[slug] (pages.txt: src/app/(pages)/browse/[slug]/page.tsx).  
Root cause (claimed): Label and target disagree.  
Fixable (finder's view): yes  
Suggested fix: Either relabel to 'Edit your profile' or link to `/browse/${artist.slug}` (useCurrentArtist is available in sibling pages). Pin with a render test on the empty state's link href.  
Status: OPEN, unverified  

### LA-C070  [Low]  QR Labels venue dropdown reads 'No placements yet' when the placements request fails, so scans cannot be attributed and the artist is not told why

Where: `website/src/app/(pages)/artist-portal/labels/page.tsx:161`  
Area: A · Slice: P06  
Journey: Artist with placements opens QR Labels during a failure: the Venue picker offers only 'No venue' and the note 'No placements yet'; a ?venue= deep link from a placement email cannot resolve.  
Evidence (finder's, unverified): Lines 153-162 `authFetch("/api/placements").then((r) => r.json()).then((data) => { if (data.placements) setVenues(...) }).catch(() => {})`; no res.ok check and no error state; lines 408-410 render 'No placements yet' for an empty list; lines 142-150 resolve the deep link only against the loaded list.  
Root cause (claimed): Failure mapped to the empty state.  
Fixable (finder's view): yes  
Suggested fix: Hold a venuesError and render it in the dropdown ('Couldn't load your venues'). Test with a 500.  
Status: OPEN, unverified  

### LA-C071  [Low]  QR Labels page has no empty state for an artist with no works and shows 'Deselect All' over an empty grid

Where: `website/src/app/(pages)/artist-portal/labels/page.tsx:174`  
Area: A · Slice: P06  
Journey: New artist with zero works opens QR Labels: the 'Individual Works' header shows a 'Deselect All' button and nothing beneath it; no hint to add works first.  
Evidence (finder's, unverified): Line 174: `const allSelected = selected.size === currentArtist.works.length;` is true when both are 0, so lines 449-454 render 'Deselect All'. Lines 458-559 map `currentArtist.works` with no zero-length branch. Compare collections/page.tsx:634-635 which renders 'Add works to your portfolio to build a collection.'  
Root cause (claimed): Missing empty branch; select-all predicate not guarded for zero items.  
Fixable (finder's view): yes  
Suggested fix: Render an EmptyState (cta to /artist-portal/portfolio) when works.length === 0 and guard allSelected with `works.length > 0`. Test: artist with works: [] shows the hint and no 'Deselect All'.  
Status: OPEN, unverified  

### LA-C072  [Low]  QR Labels editorial helper text uses a hyphen as a dash

Where: `website/src/app/(pages)/artist-portal/labels/page.tsx:343`  
Area: A · Slice: P06 (also P06)  
Journey: Artist picks the Editorial label style and reads 'Toggles only affect what shows up on the printed card - the QR code itself always points to the work.'  
Evidence (finder's, unverified): Lines 340-345 JSX text contains ' - ' used as sentence punctuation; AGENTS.md public-copy rule forbids single hyphens intended as dashes.  
Root cause (claimed): Dash substituted with a hyphen rather than rewritten.  
Fixable (finder's view): yes  
Suggested fix: Rewrite as two sentences: '...on the printed card. The QR code itself always points to the work.'  
Status: OPEN, unverified  

### LA-C073  [Low]  Buy Now buttons print unformatted money such as '£162.5'

Where: `website/src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.tsx:488`  
Area: A · Slice: P04  
Journey: Buyer selects a size or frame whose price or uplift carries pence and the primary CTA reads 'Buy Now, £162.5' (and the collection sidebar 'Save £12.5 vs. buying individually').  
Evidence (finder's, unverified): Line 488 renders `Buy Now, £{totalPrice}` where totalPrice = Math.round((price + frameUplift) * 100) / 100 (lines 107-109); same at ArtistProfileClient.tsx:1154 and browse/collections/[collectionId]/page.tsx:395. Prices may carry pence: validations.ts:214 money() is z.number().finite().min(0).max(n) with no integer constraint, and frame-uplift.ts:31 rounds to 2 dp. The off-the-wall button at ArtworkPageClient.tsx:583 already uses toFixed(2).  
Root cause (claimed): Ad hoc template interpolation instead of a shared money formatter.  
Fixable (finder's view): yes  
Suggested fix: Format these with toFixed(2) (or a shared gbp helper) and add a test with price 150 and uplift 12.5 expecting '£162.50'.  
Status: OPEN, unverified  

### LA-C074  [Low]  'Collect from venue, £null' can render when a ticked in-store work has no pricing rows

Where: `website/src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.tsx:654`  
Area: A · Slice: P04  
Journey: Visitor on an artwork with availableInStore ticked, an active placement and an empty pricing array sees a button reading 'Collect from <venue>, £null'; pressing it adds a £0 line that checkout rejects.  
Evidence (finder's, unverified): The gate at lines 594-599 admits work.availableInStore === true with !selectedPricing (pricing empty) and selectedInStorePrice null; the label at lines 653-654 interpolates `£${selectedPricing?.price ?? selectedInStorePrice}` which is then null, and the cart price at line 637 falls to 0. Live SQL: 0 available works with the in-store tick and empty pricing, so a blind spot with no live instance.  
Root cause (claimed): The legacy collect CTA's gate does not require a resolved price.  
Fixable (finder's view): yes  
Suggested fix: Require (selectedPricing?.price ?? selectedInStorePrice) != null in the gate; jsdom test with availableInStore true and pricing [] asserts no collect button.  
Status: OPEN, unverified  

### LA-C075  [Low]  Artwork page meta description fallback prints pixel dimensions and orphan commas for most live works

Where: `website/src/app/(pages)/browse/[slug]/[workSlug]/page.tsx:53`  
Area: A · Slice: P04  
Journey: Anyone sharing or searching an artwork without a description sees a social/search description such as 'Title, Photography, 1920 × 1080 px. Available. By X on Wallplace.' or 'Title, , 40 x 60 cm. …'.  
Evidence (finder's, unverified): Line 51-53 builds `${work.title}, ${work.medium}, ${work.dimensions}. …` whenever description is empty; the transform maps medium and dimensions raw (src/lib/db/artist-profiles-transform.ts:215-216), while the page body guards with formatDimensionsForDisplay (ArtworkPageClient.tsx:243-257). SQL over available works: 25 of 32 have no description; of those 12 have dimensions matching 'px', 3 have medium = '' and 3 have dimensions = ''.  
Root cause (claimed): The metadata fallback was not given the same formatting and empty-field guards as the page body.  
Fixable (finder's view): yes  
Suggested fix: Compose the fallback from non-empty parts using formatDimensionsForDisplay(work.dimensions) and skip blank medium. Unit-test generateMetadata with px dimensions and a blank medium.  
Status: OPEN, unverified  

### LA-C076  [Low]  Collection page always offers 'Buy Collection' even when the collection has no bundle price, yielding 'Buy Collection, ' and a £0 line the checkout rejects

Where: `website/src/app/(pages)/browse/collections/[collectionId]/page.tsx:456`  
Area: A · Slice: P04  
Journey: Visitor on a collection whose bundle_price is null presses the button labelled 'Buy Collection, ' (trailing comma, no price); checkout then fails with the generic 'Cart items and shipping required'.  
Evidence (finder's, unverified): page.tsx:451-457 gates the button on collection.available only; src/app/api/collections/[id]/route.ts GET sets available: true unconditionally, bundlePrice: row.bundle_price || 0 and bundlePriceBand: row.bundle_price ? `£…` : ''. bundle_price is nullable NUMERIC (supabase/migrations/005_artist_collections.sql:13). handleBuyCollection (page.tsx:120-134) adds price 0, which checkoutItemSchema price: positive() (validations.ts:310) rejects. Live SQL: 1 available collection, 0 without a price; the artist form requires a positive price (artist-portal/collections/page.tsx:98-102), so only legacy or API-created rows reach this.  
Root cause (claimed): The GET route hard-codes available and the page trusts it rather than the price.  
Fixable (finder's view): yes  
Suggested fix: Hide the Buy button (and Make an offer) when bundlePrice <= 0; jsdom test with bundlePrice 0 asserts no Buy button.  
Status: OPEN, unverified  

### LA-C077  [Low]  Collection 'Request placement' sends a prefillMessage the placements page never reads

Where: `website/src/app/(pages)/browse/collections/[collectionId]/page.tsx:485`  
Area: A · Slice: P04  
Journey: Venue clicks 'Request placement' on a collection expecting the drafted message ('Hi, we'd love to host the … collection…') to be waiting in the form; it arrives empty.  
Evidence (finder's, unverified): page.tsx:481-487 puts prefillMessage into the URLSearchParams for /venue-portal/placements. A grep of src/app/(pages)/venue-portal/placements/page.tsx shows the only params read are artist, artistName, work, workImage, works (lines 368-376) and payment (line 919); prefillMessage never appears.  
Root cause (claimed): The sender and the receiver of the query parameter were never wired together.  
Fixable (finder's view): yes  
Suggested fix: Read prefillMessage in the placements page's params effect and seed the message field (or drop the parameter). Test the effect with a URL carrying prefillMessage.  
Status: OPEN, unverified  

### LA-C078  [Low]  /check-your-inbox says an unverified account 'expires on its own after 7 days'; nothing deletes it

Where: `website/src/app/(pages)/check-your-inbox/page.tsx:20`  
Area: A · Slice: P02  
Journey: A new signup who lands on /check-your-inbox (only when signUp returns no session, signup-destination.ts:36) reads that an account created with a mistyped address will expire after 7 days.  
Evidence (finder's, unverified): No code purges unconfirmed users: cron/inactive-users/route.ts:1-2 only sends re-engagement mail; a repo-wide grep for email_confirmed_at / deleteUser finds only the account-deletion routes. Read-only SQL on prod `auth.users`: 2 unconfirmed rows, 1 created 2026-04-13 (older than 7 days, still present). signup-destination.ts:10 records that confirmation is off in production, so the page is rarely reached today.  
Root cause (claimed): The copy asserts a cleanup that neither the app nor Supabase performs.  
Fixable (finder's view): yes  
Suggested fix: Reword to what is true (the unverified account cannot be signed in to; email hello@wallplace.co.uk to have it removed), or implement the purge; test: a page test asserting the sentence.  
Status: OPEN, unverified  

### LA-C079  [Low]  Checkout submits despite a postcode-format error and the API's generic message hides the cause

Where: `website/src/app/(pages)/checkout/page.tsx:403`  
Area: A · Slice: P04  
Journey: Buyer with a mistyped UK postcode presses Proceed to Payment; the request is sent, the API rejects it, and the buyer sees the amber 'Cart items and shipping required' banner under a fully completed form (the inline postcode hint appears only if the field blurred first).  
Evidence (finder's, unverified): handleSubmit (page.tsx:399-420) checks only required fields and the email regex; errors.postcodeFormat, set on blur at lines 779-788, is never consulted. The route's superRefine (validations.ts:444-459) rejects the postcode and src/app/api/checkout/route.ts:51-53 returns {error:'Cart items and shipping required'}, rendered by page.tsx:520-529.  
Root cause (claimed): The client-side format check is advisory only and the server collapses field errors into one string.  
Fixable (finder's view): yes  
Suggested fix: In handleSubmit, for ship mode, set errors.postcodeFormat and return when !isValidPostcode(shipping.postcode, shipping.country). Test: invalid postcode, assert fetch is not called and the inline message shows.  
Status: OPEN, unverified  

### LA-C080  [Low]  After confirming delivery, the "Request Refund" control disappears until the page is reloaded

Where: `website/src/app/(pages)/customer-portal/page.tsx:190`  
Area: A · Slice: P05  
Journey: Customer clicks Confirm delivery on a shipped order; the status moves to delivered but the refund section renders nothing until they refresh, when "Request Refund" appears.  
Evidence (finder's, unverified): page.tsx:189-191 updates local state with `{ ...o, status: "delivered" }` and no `delivered_at`. `isRefundEligible` (src/lib/order-status-labels.ts:77) requires `order.status === "delivered" && order.delivered_at`, so :470 `if (!refundEligible) return null` hides the section; the server stamps `delivered_at` (app/api/orders/route.ts:236-238) but the page does not re-fetch (comment at :188).  
Root cause (claimed): The optimistic local update inside the confirmDelivery handler omits the field the eligibility check depends on.  
Fixable (finder's view): no, owner-gated money handler  
Suggested fix: Add `delivered_at: new Date().toISOString()` to the local map in confirmDelivery's success branch, or re-fetch orders after a 2xx; test that "Request Refund" is offered immediately after a successful confirm.  
Status: FIXED in d5311733 (this session, test-first, gate green)  

### LA-C081  [Low]  Saved artists that no longer exist in the catalogue still render a title-cased slug linking to a 404

Where: `website/src/app/(pages)/customer-portal/saved/page.tsx:237`  
Area: A · Slice: P05  
Journey: Customer on Saved > Artists whose saved artist has been unpublished or removed sees "Alice Arden" linking to /browse/alice-arden, which 404s.  
Evidence (finder's, unverified): saved/page.tsx:235-241 renders `<Link href={linkForItem(item.item_type, item.item_id)}>{formatName(item.item_id)}</Link>` for every non-work item with no lookup against `allArtists`; the C7 "no longer available" treatment at :215-225 applies only to `item_type === "work"`.  
Root cause (claimed): C7 fixed the work case only; the artist case has the same failure shape for a removed artist.  
Fixable (finder's view): yes  
Suggested fix: For artist items, resolve `allArtists.find((a) => a.slug === item.item_id)`; when `catalogueLoaded` and no match, render "This artist is no longer available" without a link; extend the C7 test.  
Status: FIXED in 8bcd6f9d (this session, test-first, gate green)  

### LA-C082  [Low]  Resend-verification from the login page drops the destination, so the new confirmation link lands on /browse instead of /apply

Where: `website/src/app/(pages)/login/page.tsx:147`  
Area: A · Slice: P03 (also P03)  
Journey: Unconfirmed artist arrives at /login?next=/apply from the original confirmation email, gets 'Email not confirmed', clicks 'Send me a new link'. The resent link carries next=/browse, so after confirming and signing in they land on /browse rather than the application.  
Evidence (finder's, unverified): login/page.tsx:147-151 posts { email } only; src/app/api/auth/resend-verification/route.ts:69-70 defaults next to /browse when absent; the original link from signup/artist/page.tsx:104 carried next=/apply and the login page already has that value in window.location (page.tsx:101) but does not forward it. Live: 2 unconfirmed artist accounts exist (SQL group by user_type).  
Root cause (claimed): The resend body omits the page's own ?next.  
Fixable (finder's view): yes  
Suggested fix: Include next: params.get('next') ?? params.get('redirect') in the resend body. Login page test asserting the body when ?next is present.  
Status: OPEN, unverified  

### LA-C083  [Low]  /newsletter/confirmed?status=toString renders a blank page

Where: `website/src/app/(pages)/newsletter/confirmed/page.tsx:38`  
Area: A · Slice: P02  
Journey: Only reachable by editing the URL: a visitor at /newsletter/confirmed?status=toString (or constructor, hasOwnProperty) sees an empty heading, body and note with just the 'Browse the work' button.  
Evidence (finder's, unverified): page.tsx:38 `COPY[(status as Status) in COPY ? (status as Status) : "invalid"]`; `in` includes prototype keys. Node reproduction of the exact expression: 'toString' -> typeof copy 'function', heading undefined; 'constructor' the same; 'nonsense' and undefined correctly fall to 'invalid'. The API only ever emits ok/expired/invalid (api/newsletter/confirm/route.ts:37-39), so no real link hits this.  
Root cause (claimed): Prototype-inheriting `in` check used for a key lookup.  
Fixable (finder's view): yes  
Suggested fix: Use `Object.hasOwn(COPY, status)`; test: status=toString renders 'That link didn't work'.  
Status: OPEN, unverified  

### LA-C084  [Low]  Order tracking form placeholder shows an order-ID format that no real order has

Where: `website/src/app/(pages)/orders/track/page.tsx:169`  
Area: A · Slice: P04  
Journey: Guest on /orders/track reads the Order ID field hint 'e.g. ord_2604a8…' while their receipt shows an ID like WS-3F9A1B2C4D5E6F70, and doubts they have the right value.  
Evidence (finder's, unverified): Placeholder text at line 169. src/lib/orders/order-id.ts:17-19 derives `${prefix}-${16 upper-case chars}`; the webhook uses prefixes 'WS' (src/app/api/webhooks/stripe/route.ts:727) and 'OFR' (:285). SQL over orders: 19 total, 18 start with 'WS-', 1 with 'OFR-', 0 anything else.  
Root cause (claimed): Placeholder written before the order-ID scheme and never updated.  
Fixable (finder's view): yes  
Suggested fix: Change the placeholder to the real shape, e.g. 'e.g. WS-3F9A1B2C4D5E6F70', and assert it in orders/track/page.test.tsx.  
Status: FIXED in 7d1bcadc (this session, test-first, gate green)  

### LA-C085  [Low]  Programmes form fields have no length limits, so an over-long note is rejected as 'Please complete the required fields'

Where: `website/src/app/(pages)/programmes/ProgrammesClient.tsx:605`  
Area: A · Slice: P02  
Journey: A buyer fills the programme quote form correctly but writes more than 2,000 characters in 'Anything else?' (or a company name over 200 characters); the API returns 400 and the page shows 'Please complete the required fields' although every required field is complete.  
Evidence (finder's, unverified): ProgrammesClient.tsx:605-612 textarea has no maxLength and :497-503 venueName input has none; :215 sends `referencesNotes: form.notes`; api/curation/route.ts:34 `referencesNotes: optional(2000)`, :22 `venueName: safe(200).min(1)`, :76 returns `{ error: "Please complete the required fields" }` on any schema failure, which :220 displays verbatim.  
Root cause (claimed): Client inputs are not bounded to the schema, and the route has one generic message for every validation failure.  
Fixable (finder's view): yes  
Suggested fix: Add maxLength={2000} to the notes textarea and maxLength={200}/{120} to the name inputs to match the schema; test asserts the attributes.  
Status: OPEN, unverified  

### LA-C086  [Low]  After a password reset the page says 'Redirecting you to login' but /login immediately bounces the still-signed-in user to their portal with a second toast

Where: `website/src/app/(pages)/reset-password/page.tsx:77`  
Area: A · Slice: P03  
Journey: Any role completing a password reset. updateUser succeeds on the recovery session, which stays active; three seconds later router.push('/login') runs, the login page sees a signed-in user, shows 'You're already signed in. Redirecting…' and replaces to the portal.  
Evidence (finder's, unverified): reset-password/page.tsx:68 updateUser, :77 push('/login'), :114 copy 'Redirecting you to login...'; login/page.tsx:79-106 redirects any signed-in user via portalPathForRole with the toast at :92-97.  
Root cause (claimed): The success redirect targets the login page while the recovery session is still live.  
Fixable (finder's view): yes  
Suggested fix: Push to portalPathForRole(userType) and change the copy to 'Taking you to your account', or signOut() before pushing /login. Page test asserting the push target.  
Status: OPEN, unverified  

### LA-C087  [Low]  /signup/customer's "Sign in" link drops the ?next= that the signup index and login page carefully forward

Where: `website/src/app/(pages)/signup/customer/page.tsx:263`  
Area: A · Slice: P03  
Journey: Customer arrives at /signup/customer?next=/some-path (from /login's Sign up link or /signup, both of which forward next), realises they already have an account and presses Sign in: /login opens without next, and after signing in they land on /customer-portal instead of where they started.  
Evidence (finder's, unverified): Line 263 `<Link href="/login" ...>Sign in</Link>` with no suffix, while signup/page.tsx:135 uses `/login${nextSuffix}` and login/page.tsx:423 uses `/signup${signupNextSuffix}`; the page already computes postSignupNext from ?next= at lines 30-34. Checkout allows guests (checkout/page.tsx:131-135), so this is a funnel-consistency defect, not a purchase blocker.  
Root cause (claimed): The cross-link was hard-coded when ?next= forwarding was added to the sibling pages.  
Fixable (finder's view): yes  
Suggested fix: Build the href with the same validated next (`/login${inboundNext ? `?next=${encodeURIComponent(postSignupNext)}` : ""}`); pin with a page test mirroring signup/page.test.tsx.  
Status: OPEN, unverified  

### LA-C088  [Low]  Venue Type and wall-space 'required' markers are not enforced: blank wall space submits fine, blank Venue Type comes back as a generic server error

Where: `website/src/app/(pages)/signup/venue/page.tsx:315`  
Area: A · Slice: P03  
Journey: Venue leaves 'Venue Type *' or 'Approximate wall space *' unselected. Wall space: the form submits successfully with it blank. Venue type: the request reaches the server and comes back 'Please fill in all required fields' with no field highlighted.  
Evidence (finder's, unverified): Dropdown.tsx:149 renders aria-required only, no native constraint, so the browser does not block submit. Server: registerVenueSchema venueType is safeString(100) (min 1) so the route answers 400 with the generic message (route.ts:17-22); wallSpace is optionalString(100) so it is accepted empty despite the asterisk at page.tsx:381.  
Root cause (claimed): The custom Dropdown cannot participate in native form validation and the page adds no pre-submit check; the schema and the label disagree on wallSpace.  
Fixable (finder's view): yes  
Suggested fix: Add a client-side check for venueType and wallSpace before the POST with field-level messages (or make wallSpace safeString to match the label). Page test covering each blank.  
Status: OPEN, unverified  

### LA-C089  [Low]  Venue Type is marked required but nothing enforces it; leaving it unselected submits the form and comes back as a generic "Please fill in all required fields" with no field indicated

Where: `website/src/app/(pages)/signup/venue/page.tsx:315`  
Area: A · Slice: P03  
Journey: Venue leaves Venue Type on "Select type", completes everything else and presses Register. The browser submits (Dropdown renders a <button aria-required> with no native input, Dropdown.tsx:63-70), the Turnstile verify call runs, then /api/register-venue answers 400 and the page shows the generic error at line 430 near the submit button with nothing highlighted.  
Evidence (finder's, unverified): handleSubmit (lines 122-143) checks only password length, password match and the Turnstile token. registerVenueSchema has `venueType: safeString(100)` (validations.ts:112) and safeString is `z.string().trim().min(1)` (validations.ts:6), so an empty venueType fails and the route returns { error: "Please fill in all required fields" } (register-venue/route.ts:17-22). The same applies to the wall-space Dropdown at line 382, although wallSpace is optional server-side.  
Root cause (claimed): The custom Dropdown has no native required semantics and the page has no client-side check for venueType.  
Fixable (finder's view): yes  
Suggested fix: Add a client check before the network calls (`if (!form.venueType) { setError("Please choose a venue type."); return; }`), or render a hidden required input inside Dropdown; pin with a page test.  
Status: OPEN, unverified  

### LA-C090  [Low]  Terms dispute steps read 'Step 1 : Raise a Dispute' with a spaced colon

Where: `website/src/app/(pages)/terms/page.tsx:167`  
Area: A · Slice: P02  
Journey: Any visitor reading Terms section 11 sees five headings 'Step 1 : Raise a Dispute' ... 'Step 5 : Escalation' with a space before each colon.  
Evidence (finder's, unverified): terms/page.tsx:167, 172, 177, 182, 187: `<h3 ...>Step 1 : Raise a Dispute</h3>` and so on.  
Root cause (claimed): A dash was replaced with ' : ' when the em dashes were removed.  
Fixable (finder's view): yes  
Suggested fix: Use 'Step 1: Raise a dispute' (no space before the colon) on the five headings.  
Status: OPEN, unverified  

### LA-C091  [Low]  Hyphen used as a dash in the label-toggle help copy on QR Labels

Where: `website/src/app/(pages)/venue-portal/labels/page.tsx:366`  
Area: A · Slice: P08  
Journey: Venue reads the help text above the Medium/Dimensions/Price toggles: 'Toggles only affect what shows up on the printed card - the QR code itself always points to the work.'  
Evidence (finder's, unverified): labels/page.tsx:363-368 renders `...the printed card - the QR code itself always points to the work.` inside a <p>. AGENTS.md public-copy rules: 'Do not substitute em dashes with double hyphens or single hyphens intended as dashes.' This is JSX text, not a comment.  
Root cause (claimed): A spaced hyphen is doing an em dash's job in user-facing copy.  
Fixable (finder's view): yes  
Suggested fix: Rewrite as two sentences: '...what shows up on the printed card. The QR code itself always points to the work.' No test needed beyond the existing copy lint if one covers this path.  
Status: OPEN, unverified  

### LA-C092  [Low]  Print preview shows a 'Size on label' control with no options for every venue label

Where: `website/src/app/(pages)/venue-portal/labels/page.tsx:575`  
Area: A · Slice: P08  
Journey: Venue clicks Preview & Print, opens Edit Labels: each label card has a 'Size on label' heading with nothing under it (or a single non-clickable chip when the placement recorded a size), because the venue page passes no sizes.  
Evidence (finder's, unverified): labels/page.tsx:571-578 `<LabelPreview labels={previewLabels} initialVisibility={...} availableSizes={[]} .../>`. LabelPreview.tsx:184-206 always renders `<span>Size on label</span>` then `{availableSizes.map(...)}` (empty) and only shows a static chip `{label.workDimensions && !availableSizes.includes(label.workDimensions) && <span>...</span>}`.  
Root cause (claimed): LabelPreview is shared with the artist labels page, which supplies real sizes; it does not hide the block when the caller supplies none.  
Fixable (finder's view): yes  
Suggested fix: In LabelPreview render the 'Size on label' block only when `availableSizes.length > 0 || label.workDimensions`; pin with a LabelPreview render test passing availableSizes=[] and no workDimensions asserting the heading is absent.  
Status: OPEN, unverified  

### LA-C093  [Low]  Orders 'Contact us' link carries a ?subject= the contact form does not read

Where: `website/src/app/(pages)/venue-portal/orders/page.tsx:268`  
Area: A · Slice: P09  
Journey: Venue clicks 'Something wrong? Contact us' on an order; the contact form opens blank with no order reference carried over.  
Evidence (finder's, unverified): orders/page.tsx:268 `<Link href={\`/contact?subject=Order ${selected.id}\`}>`. src/components/ContactForm.tsx:7-8 reads only `searchParams.get("artist")`; no other searchParams read in the contact page.  
Root cause (claimed): Query parameter added on the link side only.  
Fixable (finder's view): yes  
Suggested fix: Read `subject` in ContactForm to prefill the subject/message, or drop the parameter; test that /contact?subject=Order X prefills.  
Status: OPEN, unverified  

### LA-C094  [Low]  Dashboard stat tiles render an em dash while loading

Where: `website/src/app/(pages)/venue-portal/page.tsx:397`  
Area: A · Slice: P09  
Journey: Venue sees four '—' glyphs in the stats row on every dashboard load.  
Evidence (finder's, unverified): page.tsx:397 `{loading ? "—" : stat.value}` (U+2014 EM DASH). The placements page uses an ellipsis for the same purpose: placements/page.tsx:942 `{liveActiveCount === null ? "…" : ...}`. Public-copy rule in website/AGENTS.md bans em dashes.  
Root cause (claimed): Loading placeholder glyph chosen as an em dash.  
Fixable (finder's view): yes  
Suggested fix: Use '…' (as the placements header does) or a skeleton bar; extend page.test.tsx to assert no U+2014 in the rendered stats.  
Status: FIXED in f4ea1dc8 (this session, test-first, gate green)  

### LA-C095  [Low]  Submit button says 'Request 3 Placements' when one placement carrying three works is created

Where: `website/src/app/(pages)/venue-portal/placements/page.tsx:1234`  
Area: A · Slice: P09  
Journey: Venue selects several works; the button reads 'Request N Placements', then one row appears with '+N-1 more'.  
Evidence (finder's, unverified): placements/page.tsx:1234 `{submitting ? "Sending..." : \`Request ${count} Placement${count !== 1 ? "s" : ""}\`}` where count is the number of selected works; 625-660 builds `newPlacements = [{ ... extraWorks }]`, a single placement (comment: 'every work the venue ticked is now rolled into ONE placement').  
Root cause (claimed): Label predates the multi-work-per-placement change.  
Fixable (finder's view): yes  
Suggested fix: Label it 'Request placement' with '(N works)' when count > 1; test asserts the text for count 3.  
Status: OPEN, unverified  

### LA-C096  [Low]  Saved collections are listed under their database id instead of their name

Where: `website/src/app/(pages)/venue-portal/saved/page.tsx:247`  
Area: A · Slice: P09  
Journey: Venue saves a collection from /browse, opens Saved > Collections and sees a title-cased id string as the collection's name.  
Evidence (finder's, unverified): saved/page.tsx:246-248 renders `{item.id.includes(" ") ? item.id : item.id.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}`. The saved id is the row id: CollectionCard.tsx:54 and browse/collections/[collectionId]/page.tsx:175 `<SaveButton type="collection" itemId={collection.id}>`, and browse-collections/route.ts:48 `id: row.id`. No name lookup is made.  
Root cause (claimed): The page never resolves the collection id to its record.  
Fixable (finder's view): yes  
Suggested fix: Resolve names via /api/browse-collections (or /api/collections/[id]) and fall back to 'Collection'; jsdom test asserts the fetched title renders.  
Status: OPEN, unverified  

### LA-C097  [Low]  Settings contact fields load silently fails, and a Save from that state writes null over all six contact fields

Where: `website/src/app/(pages)/venue-portal/settings/page.tsx:172`  
Area: A · Slice: P09  
Journey: Venue opens Settings while GET /api/venue-profile fails: contact fields are empty with no notice; pressing Save Details then nulls contact_name, phone, address_line1/2, city and postcode on the server.  
Evidence (finder's, unverified): settings/page.tsx:156-181 `.catch(() => { /* fields start empty; a failed save will surface the real error */ })`; 188-201 handleContactSave sends `contact_name: contact.contact_name || null, phone: ... || null, ...` for all six fields; venue-profile/route.ts:33-41 writes them via the allowlist; all six are nullable in live-not-null-no-default.json (only name and slug are NOT NULL).  
Root cause (claimed): Load failure is indistinguishable from an empty profile, and Save is enabled either way.  
Fixable (finder's view): yes  
Suggested fix: Keep Save disabled and show a load error until the GET has succeeded; jsdom test with GET rejected asserts Save Details is disabled and an error is shown.  
Status: OPEN, unverified  

### LA-C098  [Low]  Settings payouts card shows 'Set Up Payouts' whenever the Stripe status request fails

Where: `website/src/app/(pages)/venue-portal/settings/page.tsx:220`  
Area: A · Slice: P09  
Journey: Venue whose payouts are already active opens Settings while /api/stripe-connect/status fails; the card tells them to set up payouts.  
Evidence (finder's, unverified): settings/page.tsx:216-222 `authFetch("/api/stripe-connect/status").then(res => res.json()).then(setConnectStatus).catch(() => {}).finally(() => setConnectLoading(false))`; 456-505 falls to the 'Set up payouts' branch when connectStatus is null.  
Root cause (claimed): Silent catch with no error state.  
Fixable (finder's view): yes  
Suggested fix: Set a status error and render 'Couldn't load payout status' with Retry; jsdom test with rejected authFetch asserts no 'Set Up Payouts' button.  
Status: OPEN, unverified  

### LA-C099  [Low]  Notification preference label text does nothing when clicked; only the 16px box toggles

Where: `website/src/app/(pages)/venue-portal/settings/page.tsx:403`  
Area: A · Slice: P09  
Journey: Venue clicks 'Message notifications' or 'Wallplace news' text (shown with a pointer cursor); nothing changes. Only the small square toggles.  
Evidence (finder's, unverified): settings/page.tsx:402-435 `<label className="flex items-start gap-3 cursor-pointer group">` contains a `<span ... onClick={() => togglePref(notif.id)}>` (413) and text, but no input element, so the label has no associated control and its own click has no effect.  
Root cause (claimed): Visual checkbox implemented as a span; the label wrapper is decorative.  
Fixable (finder's view): yes  
Suggested fix: Move the onClick to the label (or render a visually-hidden <input type="checkbox">); jsdom test: clicking the label text calls togglePref.  
Status: OPEN, unverified  

### LA-C100  [Low]  Wall editor: 'Show on public profile' quietly reverts when the save fails

Where: `website/src/app/(pages)/venue-portal/walls/[id]/page.tsx:321`  
Area: A · Slice: P09  
Journey: Venue ticks 'Show on public profile'; if PATCH /api/walls/[id] fails the box unticks itself with no message.  
Evidence (finder's, unverified): walls/[id]/page.tsx:321-334 `if (!res.ok) { // Revert on failure. setState(...) }` and 335-347 `catch { setState(...) }`; neither path calls showToast, although useToast is imported and used for delete at 198.  
Root cause (claimed): Optimistic toggle with revert but no user feedback.  
Fixable (finder's view): yes  
Suggested fix: Call showToast('Could not update wall visibility', { variant: 'error' }) in both failure paths; jsdom test with PATCH 500 asserts the toast.  
Status: OPEN, unverified  

### LA-C101  [Low]  New wall: when the wall saves but its first layout fails, the venue is redirected with no message

Where: `website/src/app/(pages)/venue-portal/walls/new/page.tsx:233`  
Area: A · Slice: P09  
Journey: Venue submits New Wall; POST /api/walls succeeds, POST /api/walls/[id]/layouts fails; they land on My Walls with no explanation.  
Evidence (finder's, unverified): walls/new/page.tsx:233-238 `if (!layoutRes.ok) { // Wall exists; layout failed. Send them to the list and surface the issue ... router.replace("/venue-portal/walls"); return; }`, but nothing is surfaced (no toast, no query flag; My Walls has no banner for it).  
Root cause (claimed): Comment promises feedback that was never implemented.  
Fixable (finder's view): yes  
Suggested fix: Show a toast (useToast) or pass ?layoutFailed=1 and render a banner on My Walls; jsdom test with layouts POST 500 asserts the message.  
Status: OPEN, unverified  

### LA-C102  [Low]  Wall cards print the internal kind value ('uploaded' / 'preset') in the caption

Where: `website/src/app/(pages)/venue-portal/walls/page.tsx:255`  
Area: A · Slice: P09  
Journey: Venue on My Walls reads '300 × 240 cm · uploaded' under each card.  
Evidence (finder's, unverified): walls/page.tsx:254-256 `{wall.width_cm} × {wall.height_cm} cm · {wall.kind}`; kind is the API enum from createWallSchema ('preset' | 'uploaded', walls/route.ts:145,156).  
Root cause (claimed): Raw enum rendered without a label map.  
Fixable (finder's view): yes  
Suggested fix: Map to 'Photo' / 'Preset' (or drop the segment); extend walls/page.test.tsx to assert the caption text.  
Status: OPEN, unverified  

### LA-C103  [Low]  A logged-in venue (or admin) viewing another venue's profile is told to 'Subscribe' and sent to artist pricing, which they cannot buy

Where: `website/src/app/(pages)/venues/[slug]/VenueProfileBody.tsx:143`  
Area: A · Slice: P01  
Journey: A venue owner reaches another venue via /spaces → /venues/[slug] and sees 'This venue is for subscribers. Subscribe to see this venue's name, photos... See plans' → /pricing (artist Core/Premium/Pro plans). Venues have no subscription to buy; an admin sees the same teaser.  
Evidence (finder's, unverified): src/lib/venue-visibility.ts:18-25: `if (role === "venue") return false;` before the subscription check, and admin falls to `return subscriptionActive` (admins hold no artist subscription). api/venues/[slug]/profile/route.ts:206-208 passes the role and sub.active through, so both roles get `locked: true`. VenueProfileBody.tsx:129-165 renders one locked teaser for every locked viewer with 'See plans' → /pricing, and never reads useAuth to vary the message. spaces/page.tsx:216-218 confirms 'Venues are locked out of viewing other venues'.  
Root cause (claimed): The locked teaser assumes every locked viewer is an unsubscribed artist.  
Fixable (finder's view): yes  
Suggested fix: Read useAuth().userType in VenueProfileBody; for 'venue' render 'Venue profiles are shown to artists and customers' with only the back link, for 'admin' show the profile or a link to /admin/venues; keep the subscribe CTA for logged-out and artist viewers. Test the three branches.  
Status: OPEN, unverified  

### LA-C104  [Low]  Venue profile shows 'Space not found' for server errors and network failures, so a real outage reads as a missing venue

Where: `website/src/app/(pages)/venues/[slug]/VenueProfileBody.tsx:78`  
Area: A · Slice: P01  
Journey: Any role opening /venues/[slug] while /api/venues/[slug]/profile returns 500 (or the request throws offline) sees 'Space not found' with a link back to /spaces, with no retry and no hint that the venue exists.  
Evidence (finder's, unverified): VenueProfileBody.tsx:78-86: `if (!res.ok) { setState({ status: "notfound" }); return; }` and `catch { setState({ status: "notfound" }); }`; the State union at :63-66 has only loading | notfound | ready. Scratchpad probe: mocked authFetch returning { ok:false, status:500 } rendered 'Space not found'; mocked authFetch throwing rendered 'Space not found'; 404 rendered the same.  
Root cause (claimed): The component collapses every failure into the not-found branch; there is no error state.  
Fixable (finder's view): yes  
Suggested fix: Add `{ status: "error" }` set when res.status !== 404 or on throw, rendering 'Something went wrong loading this space' with a retry button; add a VenueProfileBody.test.tsx covering 404, 500 and throw.  
Status: OPEN, unverified  

### LA-C105  [Low]  Admin on the home page sees an 'Artist Portal' button that bounces them off /artist-portal with a redirect toast

Where: `website/src/app/page.tsx:51`  
Area: A · Slice: P01  
Journey: A logged-in admin opens / and the hero's second button reads 'ARTIST PORTAL' linking to /artist-portal; clicking it, PortalGuard shows 'This is the artist portal. Redirecting to your admin portal.' and replaces the route with /admin.  
Evidence (finder's, unverified): page.tsx:51-52: `portalBase = userType === "venue" ? "/venue-portal" : userType === "customer" ? "/customer-portal" : "/artist-portal"` and the matching label ternary, so "admin" falls into the artist branch. src/lib/auth-roles.ts:7 ALLOWED_ROLES includes "admin"; :45-57 portalPathForRole maps admin → /admin. src/components/PortalGuard.tsx:108-118 toasts 'This is the ${allowedType} portal. Redirecting to your ${theirRole} portal.' and calls router.replace(portalPathForRole(...)). Scratchpad jsdom probe with useAuth mocked to { user, userType: "admin" } found the link named /artist portal/i with href '/artist-portal'. page.test.tsx only covers user: null.  
Root cause (claimed): The home page hand-rolls the role → portal mapping instead of using portalPathForRole, and has no admin branch.  
Fixable (finder's view): yes  
Suggested fix: Use `portalPathForRole(userType)` for the href and a four-entry label map (admin → 'Admin'); add a page.test.tsx case with userType 'admin' expecting href '/admin'.  
Status: OPEN, unverified  

### LA-C106  [Low]  Sitemap advertises /waitlist, a page marked noindex,nofollow and deliberately unsurfaced

Where: `website/src/app/sitemap.ts:27`  
Area: A · Slice: P02  
Journey: Crawlers receive https://wallplace.co.uk/waitlist from the sitemap while the page's metadata says index:false, follow:false; the layout comment says the page is 'unsurfaced from the nav and excluded from search'.  
Evidence (finder's, unverified): sitemap.ts:27 `"/waitlist"` in STATIC_ROUTES; waitlist/layout.tsx:9-15 robots index:false, follow:false; live GET /sitemap.xml contains `https://wallplace.co.uk/waitlist`; sitemap.test.ts has no assertion about /waitlist.  
Root cause (claimed): The route was left in STATIC_ROUTES when the page was taken out of search.  
Fixable (finder's view): yes  
Suggested fix: Remove '/waitlist' from STATIC_ROUTES and pin it in src/app/sitemap.test.ts.  
Status: OPEN, unverified  

### LA-C107  [Low]  'You're signed in as a admin.' on /apply for an admin account

Where: `website/src/components/ApplicationGate.tsx:93`  
Area: A · Slice: P03 (also P03)  
Journey: Admin opens /apply. The wrong-role notice reads 'You're signed in as a admin.'  
Evidence (finder's, unverified): ApplicationGate.tsx:93 `You&rsquo;re signed in as a {userType}.`; userType 'admin' passes the `userType !== 'artist'` branch at :89. Live: 1 admin user (SQL group by raw_user_meta_data->>'user_type').  
Root cause (claimed): Indefinite article hard-coded before an interpolated role.  
Fixable (finder's view): yes  
Suggested fix: Rewrite as 'You're signed in with a {userType} account.' Extend ApplicationGate.test.tsx with the admin case.  
Status: OPEN, unverified  

### LA-C108  [Low]  Blog editor prints the raw status enum and internal roadmap copy to the artist

Where: `website/src/components/BlogEditor.tsx:199`  
Area: A · Slice: P06 (also P06)  
Journey: Artist opens a blog post and reads 'Status: pending_review' (underscore, lower case) and under the body field 'Plain-text/markdown for now. Phase 3 introduces a rich-text editor.'  
Evidence (finder's, unverified): Line 199: `Status: <strong>{status}</strong>` renders the DB value; blogs/page.tsx:26-32 already has STATUS_LABELS ('Pending review') that this component does not use. Line 257: 'Plain-text/markdown for now. Phase 3 introduces a rich-text editor.' is a development-phase note shown to users. Reached from blogs/new/page.tsx:13 and blogs/[id]/edit/page.tsx:62.  
Root cause (claimed): Placeholder-era copy and an unlabelled enum left in a shipped surface.  
Fixable (finder's view): yes  
Suggested fix: Reuse STATUS_LABELS (move to a shared module) for the status line and replace the roadmap sentence with 'Markdown is supported.' Test: status 'pending_review' renders 'Pending review'.  
Status: OPEN, unverified  

### LA-C109  [Low]  In the artist inbox a venue's name and 'View Spaces' link to the generic /spaces listing, not the venue's page

Where: `website/src/components/MessageInbox.tsx:1080`  
Area: A · Slice: P06 (also P06)  
Journey: Artist opens a conversation with a venue and clicks the venue's name (or 'View Spaces') expecting that venue; they land on the full /spaces directory.  
Evidence (finder's, unverified): Line 1080: `<Link href="/spaces">{selectedConvData.otherPartyDisplayName}</Link>` and line 1112 `<Link href="/spaces">View Spaces</Link>` for `otherPartyType === "venue"`; the artist counterpart at 1078/1109 links to `/browse/${otherParty}`. A per-venue page exists (pages.txt: venues/[slug]/page.tsx) and OffersList.tsx:316 already links `/venues/${o.venue.slug}`.  
Root cause (claimed): Venue branch hard-codes the directory route.  
Fixable (finder's view): yes  
Suggested fix: Link to `/venues/${selectedConvData.otherParty}` once it is confirmed `otherParty` holds the venue slug for venue threads (it is used as a slug for artists); pin with a render test.  
Status: OPEN, unverified  

### LA-C110  [Low]  An artist, customer or admin opening a venue-portal URL is bounced by two competing guards; when the page-level one wins they detour via /login and see 'You're already signed in. Redirecting…' instead of the intended 'This is the venue portal' message

Where: `website/src/components/VenuePortalLayout.tsx:98`  
Area: A · Slice: P08  
Journey: Signed-in artist (no venue profile) follows a link to /venue-portal/messages. Both guards fetch /api/account/roles; if the VenuePortalLayout fetch resolves first they are sent to /login, the login page toasts 'You're already signed in. Redirecting…' and forwards them to /artist-portal. They end up in the right place but via a misleading detour; PortalGuard's explanatory toast may never show.  
Evidence (finder's, unverified): PortalGuard.tsx:108-118 (route layout): waits for ownRoles then `showToast(`This is the ${allowedType} portal. Redirecting to your ${theirRole} portal.`); router.replace(portalPathForRole(parseRole(userType)))`; it renders children as soon as subscriptionChecked (immediately true for allowedType venue, :122-126, :351). VenuePortalLayout.tsx:95-98 (rendered inside every page in this slice): `if (userType === "venue") return; if (ownsVenue === null) return; if (!ownsVenue) router.replace("/login");` after its own /api/account/roles fetch (:70-85). Child effects run before parent effects, so the layout component's fetch is dispatched first. login/page.tsx:74-105 then redirects a signed-in user to portalPathForRole with the 'already signed in' toast. Which redirect fires is decided by response order; the outcome is not pinned by any test (VenuePortalLayout.test.tsx covers only self-heal, lines 41-52).  
Root cause (claimed): Two guards with different redirect targets for the same condition; the page-level VenuePortalLayout duplicates the route layout's PortalGuard and picks /login rather than the user's own portal.  
Fixable (finder's view): yes  
Suggested fix: Make VenuePortalLayout defer to PortalGuard for role bouncing (drop the `!ownsVenue → /login` replace, or replace to portalPathForRole(userType) so both agree). Pin with a VenuePortalLayout test: userType 'artist', ownRoles [] must not call replace('/login').  
Status: OPEN, unverified  

### LA-C111  [Low]  Customers opening a venue wall are told to 'Apply as an artist', contrary to the component's own stated behaviour

Where: `website/src/components/VenueWallCard.tsx:249`  
Area: A · Slice: P01  
Journey: A logged-in customer (entitled to see venue profiles) on /venues/[slug] taps a wall card; the lightbox footer shows 'Apply as an artist' → /apply and 'Once approved, you can request placements on venues' walls.'  
Evidence (finder's, unverified): VenueWallCard.tsx:226-262: the ternary is `userType === "artist" ? ... : userType === "venue" ? 'Venues view-only' : <Link href="/apply">Apply as an artist</Link>`, so 'customer' takes the final branch. The header comment at :11-12 states 'Customers and venues see the same card without the artist CTA.' VenueWallCard.test.tsx:115-136 pins only userType 'venue' and null, not 'customer'. canSeeVenueIdentity (venue-visibility.ts:24) returns true for customers, so they reach this card.  
Root cause (claimed): The else branch was written for logged-out visitors and never given a customer case.  
Fixable (finder's view): yes  
Suggested fix: Add `userType === "customer"` rendering a neutral line ('Artists can propose work for this wall') with no apply CTA; add a test case for 'customer' asserting no 'Apply as an artist' link.  
Status: OPEN, unverified  

### LA-C112  [Low]  Venue and artist guides sell an 'optional paid installation add-on' and FAQ promises framing and courier partners that exist nowhere in the product

Where: `website/src/components/marketing/VenueGuide.tsx:103`  
Area: A · Slice: P01  
Journey: A venue on /venues reads 'Installation is not included as standard, it's an optional paid add-on'; an artist on /artists reads 'We do offer optional installation add-on packages'; an artist on /faqs reads 'We can help arrange framing at competitive rates through our partners' and 'We'll add recommended courier partners in the artist portal soon'. None of these can be bought, requested or found anywhere on the site.  
Evidence (finder's, unverified): VenueGuide.tsx:103 'Installation is not included as standard, it's an optional paid add-on.'; ArtistGuide.tsx:143 'We do offer optional installation add-on packages for artists who want that support.'; faqs/page.tsx:165 'We can help arrange framing at competitive rates through our partners'; faqs/page.tsx:151-152 'We'll add recommended courier partners in the artist portal soon.' `grep -rn -i -E "add-on|addon|add_on|installation package" src --include='*.ts' --include='*.tsx'` returns only those two marketing strings plus an unrelated 'frame add-ons' UI comment in artist-portal/portfolio/page.tsx:2413; no route, price constant, form or portal surface implements an installation add-on, framing partner or courier partner. routes.txt contains no install/framing/courier route.  
Root cause (claimed): Aspirational service copy left in from an earlier product plan; public-claims.test.ts pins several such claims but not these.  
Fixable (finder's view): no, Whether Wallplace offers installation, framing or courier partners offline is owner knowledge; the copy either needs removing or the service confirming, and that is a product decision not a code fix.  
Suggested fix: Owner confirms whether these services exist; if not, rewrite to 'arranged directly between you and the artist' and drop the partner/coming-soon promises, then pin with public-claims assertions.  
Status: OPEN, unverified  

### LA-C113  [Low]  Withdraw confirmation tells an artist withdrawing their own counter that 'The artist will see this offer as withdrawn'

Where: `website/src/components/offers/OffersList.tsx:583`  
Area: A · Slice: P06  
Journey: Artist who sent a counter offer clicks Withdraw on /artist-portal/offers and reads a dialog naming the artist as the affected party, when it is the venue.  
Evidence (finder's, unverified): Line 470 shows Withdraw for any `iAmSender && o.status === "pending"`, which includes an artist's counter row; lines 580-584 render the fixed body 'The artist will see this offer as withdrawn and won't be able to accept it.' Rendered on the artist page via offers/page.tsx:30.  
Root cause (claimed): Copy written for the venue-only case, then the component was shared.  
Fixable (finder's view): yes  
Suggested fix: Choose the noun from iAmArtist ('The venue will see...'). Test both sides.  
Status: OPEN, unverified  

### LA-C114  [Low]  When the profile API fails, useCurrentArtist can identify a real artist as a seed artist by email prefix

Where: `website/src/hooks/useCurrentArtist.ts:97`  
Area: A · Slice: P06  
Journey: Artist whose email local part matches a seed slug (e.g. maya-chen@…) opens Collections, Labels or Messages during an API failure; the pages render the seed artist's works and the inbox posts with `userSlug` set to the seed slug (MessageInbox.tsx:558, 569, 601 use it as sender_name).  
Evidence (finder's, unverified): Lines 93-104: after any API failure (`catch { /* API unavailable, fall through to static */ }`) the hook matches `artists.find(a => a.slug === emailPrefix || a.slug === slugify(emailPrefix))` from src/data/artists.ts and sets it as the current artist. The comment calls this a fallback 'for seed/demo accounts'; demo mode was removed 2026-09-02 (brief), so the fallback now only serves mis-identification. Consumers in this slice: collections/page.tsx:50, labels/page.tsx:24, messages/page.tsx:9.  
Root cause (claimed): Legacy static fallback retained after the demo accounts it served were removed.  
Fixable (finder's view): yes  
Suggested fix: Delete the static fallback and return artist null with an error flag on failure; test that an API rejection yields artist null rather than a seed match.  
Status: OPEN, unverified  

### LA-C115  [Low]  Unsubscribe page's browser tab title reads "Unsubscribed" before the user has confirmed anything

Where: `website/src/app/(pages)/account/email/unsubscribe/page.tsx:7`  
Area: D · Slice: P05  
Journey: Any recipient opening an unsubscribe link sees a tab titled "Unsubscribed" while the page is asking "Stop receiving ... ?" with an Unsubscribe button, and also on the missing/critical error states.  
Evidence (finder's, unverified): unsubscribe/page.tsx:6-10 `metadata = { title: "Unsubscribed", ... }`; since C24 the write happens only on the button in ConfirmUnsubscribe.tsx:26-38 and the page has confirm, critical and missing states (:72-86).  
Root cause (claimed): Metadata was written when the page applied the unsubscribe on GET and was not revisited in the C24 change.  
Fixable (finder's view): yes  
Suggested fix: Change the title to "Unsubscribe" or "Email preferences".  
Status: OPEN, unverified  

### LA-C116  [Low]  /apply/claim tells a signed-out visitor "Account created, please sign in from the login page" when the account already existed and the password was wrong

Where: `website/src/app/(pages)/apply/claim/page.tsx:99`  
Area: D · Slice: P03  
Journey: Signed-out visitor following an old email link to /apply/claim enters an email that already has an account plus the wrong password; signUp's "already registered" error is swallowed, signInWithPassword fails, and the page states an account was created.  
Evidence (finder's, unverified): Lines 87-94 swallow errors matching /already registered|already exists/; lines 97-101 print "Account created, please sign in from the login page." on any sign-in error. The only in-app link to /apply/claim (ApplicationForm.tsx:333) is shown to signed-in users, who are redirected away at claim/page.tsx:52-55, so the form is reached only via old links, hence Low.  
Root cause (claimed): The sign-in failure message does not distinguish the pre-existing-account case it deliberately falls through from.  
Fixable (finder's view): yes  
Suggested fix: Track whether signUp reported an existing account and, on sign-in failure, say "An account already exists for this email. Sign in instead." with a /login?next=/artist-portal/profile link; pin with a page test.  
Status: OPEN, unverified  

### LA-C117  [Low]  Billing uses the US spelling 'canceled' in artist-facing copy

Where: `website/src/app/(pages)/artist-portal/billing/page.tsx:447`  
Area: D · Slice: P06  
Journey: Artist whose subscription has lapsed reads 'Your subscription has been canceled. Choose a plan below to reactivate.' and a 'Canceled' status badge.  
Evidence (finder's, unverified): Line 71 `canceled: "Canceled"` (display label) and line 447 the banner sentence. The Stripe status key `canceled` is fine as a key; the two displayed strings are US spellings against the British English rule.  
Root cause (claimed): Copy mirrored the Stripe enum spelling.  
Fixable (finder's view): yes  
Suggested fix: 'Cancelled' in both display strings, keys unchanged; assert the banner text in billing/page.test.tsx.  
Status: OPEN, unverified  

### LA-C118  [Low]  Login page metadata says the page is for artists or venues; customers sign in there too

Where: `website/src/app/(pages)/login/layout.tsx:5`  
Area: D · Slice: P03  
Journey: Search result or link preview for /login reads "Log in to your Wallplace account as an artist or venue." while /signup offers Customer and portalPathForRole sends customers to /customer-portal from this page.  
Evidence (finder's, unverified): login/layout.tsx:5 description string; signup/page.tsx:55 Customer option; auth-roles.ts:51-52 customer branch.  
Root cause (claimed): Description written before the customer role existed.  
Fixable (finder's view): yes  
Suggested fix: Change to "Log in to your Wallplace account as an artist, venue or customer."  
Status: OPEN, unverified  

### LA-C119  [Low]  /login tells a hinted visitor they have "more than one Wallplace account on this email address" with separate sign-in details; production has one account per email and the only users who see this share a single account across roles

Where: `website/src/app/(pages)/login/page.tsx:216`  
Area: D · Slice: P03  
Journey: A signed-in user whose one account owns profiles in two role tables (2 such users exist) opens the header portal menu and presses "Switch to X portal" (Header.tsx:838-850): they are signed out and land on /login?email=…&hint=X, read that a second account with its own password exists, sign in with the only credentials they have, and are bounced back to their original portal with the "Those details signed you into your … account" toast (login/page.tsx:89-97). The control can never reach the other portal.  
Evidence (finder's, unverified): SQL: 46 auth users, 46 distinct emails, 0 emails with multiple accounts; 2 users own profile rows in two of artist_profiles/venue_profiles/customer_profiles. /api/account/roles (route.ts:51-58) derives roles from profile rows owned by the same user_id, so for these two the "other" role is the same account. Copy at login/page.tsx:216-218 and 202-204.  
Root cause (claimed): The hint copy assumes a per-email multi-account design that GoTrue's email provider does not allow and that no production row matches.  
Fixable (finder's view): yes  
Suggested fix: When the hinted role is one the same account owns, link straight to that portal instead of signing out, or reword the notice to "sign in again to open your X portal"; pin with a login page test on the hint copy.  
Status: OPEN, unverified  

### LA-C120  [Low]  After a successful password reset the page says "Redirecting you to login..." but the user never sees the login form

Where: `website/src/app/(pages)/reset-password/page.tsx:114`  
Area: D · Slice: P03  
Journey: Any role completes /reset-password. updateUser leaves them signed in, router.push("/login") fires after 3 s (line 77), and /login sees the session and immediately replaces to their portal with a "You're already signed in. Redirecting…" toast (login/page.tsx:79-106).  
Evidence (finder's, unverified): reset-password/page.tsx:76-77 `setSuccess(true); setTimeout(() => router.push("/login"), 3000);` and line 114 copy; login/page.tsx:79-106 redirect effect for a signed-in user.  
Root cause (claimed): The post-success destination predates the login page's signed-in redirect.  
Fixable (finder's view): yes  
Suggested fix: Push to portalPathForRole(userType) and say "Taking you to your account..."; pin with a reset-password test on the pushed path.  
Status: OPEN, unverified  

### LA-C121  [Low]  The application success screen's contact address (applications@wallplace.co.uk) is spelled with a different domain elsewhere and is not the address used anywhere else on the site

Where: `website/src/components/ApplicationForm.tsx:383`  
Area: D · Slice: P03  
Journey: Artist who has just applied reads "Questions? applications@wallplace.co.uk" and emails it; whether that mailbox is monitored cannot be verified here, and the same purpose address appears as applications@wallplace.art in PortalGuard.  
Evidence (finder's, unverified): grep of src for @wallplace addresses: hello@wallplace.co.uk 34 occurrences, applications@wallplace.co.uk 2 (ApplicationForm.tsx:383-384), applications@wallplace.art 2 (PortalGuard.tsx:309); no config or env name references an applications@ inbox.  
Root cause (claimed): Two spellings of a purpose-specific address with no single source of truth for contact addresses.  
Fixable (finder's view): no, Owner must confirm which mailbox is monitored before the link is changed; PortalGuard is outside this slice.  
Suggested fix: Owner confirms applications@wallplace.co.uk exists and forwards to a read inbox, or both links move to hello@wallplace.co.uk.  
Status: OPEN, unverified  

### LA-C122  [Low]  Logged-out visitor deep-linking into the customer portal loses the target URL on the login bounce

Where: `website/src/components/PortalGuard.tsx:105`  
Area: F · Slice: P05  
Journey: Logged-out customer opens /customer-portal?order=<id> (the shape /customer-portal/orders rescues), is sent to /login with no return path, signs in and lands on /customer-portal with no order selected.  
Evidence (finder's, unverified): PortalGuard.tsx:104-107 `if (!loading && !user) { router.replace("/login"); return; }` carries no `next`; login/page.tsx:101 already reads `params.get("next")`. The orders redirect at customer-portal/orders/page.tsx:27-31 preserves `?order=` precisely so the dashboard can open it. Live impact is small: order emails link to `${SITE}/customer-portal` with no order param (app/api/orders/route.ts:416) and bell links are only visible when signed in.  
Root cause (claimed): The guard's signed-out redirect predates the login page's `next` support.  
Fixable (finder's view): yes  
Suggested fix: `router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`)`; a jsdom test on PortalGuard with user null asserting the replace target includes the encoded path. Shared component: the same change covers every portal.  
Status: OPEN, unverified  

### LA-C123  [Low]  CSP omits challenges.cloudflare.com, so the Turnstile widget the three signup forms depend on would be blocked the day the policy is enforced with keys set (dormant)

Where: `website/next.config.ts:24`  
Area: J · Slice: P03  
Journey: With TURNSTILE keys configured and the CSP switched from Report-Only to enforcing, the Turnstile script and iframe fail to load, turnstileToken stays null and the Create Account / Register buttons stay disabled on /signup/artist, /signup/customer and /signup/venue.  
Evidence (finder's, unverified): Turnstile.tsx:93-95 injects https://challenges.cloudflare.com/turnstile/v0/api.js and renders an iframe from that host; next.config.ts:24 script-src lists only self, stripe and vercel hosts and :29 frame-src only self and stripe. Harmless today because the header is Content-Security-Policy-Report-Only and no Turnstile keys are set (absent from vercel-env-names.txt), so the component emits the dev-bypass token (Turnstile.tsx:61-63) and the buttons enable.  
Root cause (claimed): The CSP was written for Stripe, Supabase, Resend and Vercel and never extended for Turnstile.  
Fixable (finder's view): yes  
Suggested fix: Add https://challenges.cloudflare.com to script-src, frame-src and connect-src; pin with a test on the exported CSP string.  
Status: OPEN, unverified  

## Not covered, as reported by the finders

- [P05] src/app/(pages)/account/appeal/page.tsx: no jsdom render test exists; behaviour read from code only
- [P05] src/app/(pages)/account/email/page.tsx: no jsdom render test exists; behaviour read from code only
- [P05] src/app/(pages)/account/email/unsubscribe/page.tsx (and ConfirmUnsubscribe.tsx): no jsdom render test exists; behaviour read from code only
- [P05] src/app/(pages)/account/security/page.tsx: no jsdom render test exists; behaviour read from code only
- [P05] src/components/CustomerPortalLayout.tsx: no test exists; nav hrefs verified against portal-nav.ts and pages.txt by reading only
- [P05] PortalGuard cross-role behaviour on the six customer-portal pages: every existing test in the slice mocks CustomerPortalLayout, so the guard is exercised by no test here; read from PortalGuard.tsx only. The brief render of children before /api/account/roles resolves (PortalGuard.tsx:108-111, shared by all portals) is left to the guards slice.
- [P05] Live rendering of the 11 pages on www.wallplace.co.uk: all but /account/appeal are auth-gated client pages or a server redirect, so a logged-out GET would only show the loading or sign-in state; not fetched
- [P05] /api/browse-artists response shape used by the Saved page: assumed to be {artists:[{slug,name,image,works:[{id,title,image}]}]} as the saved page tests assume; the route file was not read in this slice
- [P05] Emails sent without a userId still carry a footer unsubscribe link with only ?c= and land on the page's "missing" state: the landing page behaves correctly for that input; the send sites that omit userId are area C and were not audited here
- [P01] src/app/(pages)/about/page.tsx: no jsdom render test exists; behaviour read from code only (a throwaway scratchpad probe rendered it once and was deleted)
- [P01] src/app/(pages)/artists/page.tsx: no jsdom render test exists; behaviour read from code only (scratchpad probe rendered it once, deleted)
- [P01] src/app/(pages)/complaints/page.tsx: no jsdom render test exists; behaviour read from code only (scratchpad probe rendered it once, deleted)
- [P01] src/app/(pages)/contact/page.tsx: no jsdom render test exists for the page itself (ContactForm.test.tsx covers the form); page read from code only (scratchpad probe rendered it once, deleted)
- [P01] src/app/(pages)/customer/page.tsx: no jsdom render test exists; behaviour read from code only (scratchpad probe rendered it once, deleted)
- [P01] src/app/(pages)/faqs/page.tsx: no jsdom render test exists (faq-coverage.test.ts only greps the source); behaviour read from code only (scratchpad probe rendered it once, deleted)
- [P01] src/app/(pages)/partners/page.tsx: no jsdom render test exists; behaviour read from code only (scratchpad probe rendered it once, deleted)
- [P01] src/app/(pages)/pricing/page.tsx: no jsdom render test exists; behaviour read from code only (scratchpad probe rendered it once, deleted)
- [P01] src/app/(pages)/sustainability/page.tsx: no jsdom render test exists; behaviour read from code only (scratchpad probe rendered it once, deleted)
- [P01] src/app/(pages)/venues/page.tsx: no jsdom render test exists; behaviour read from code only (scratchpad probe rendered it once, deleted)
- [P01] src/app/(pages)/venues/[slug]/page.tsx and VenueProfileBody.tsx: no jsdom render test exists; behaviour read from code only (scratchpad probe covered 404/500/throw/locked/ready across logged-out, artist and customer, then deleted); the ready state with a non-empty walls list was not rendered inside the body (VenueWallCard.test.tsx covers the card in isolation)
- [P01] Pages WITH a repo render test, for the record: src/app/page.tsx (page.test.tsx) and src/app/(pages)/how-it-works (HowItWorksClient.test.tsx): listed so the report can state coverage; both green
- [P01] Mailboxes hello@, complaints@ and partners@wallplace.co.uk: whether these addresses exist and route to a monitored inbox is live mail configuration, not verifiable from code or the MCPs available to this finder
- [P01] External links (citizensadvice.org.uk, cedr.com, ico.org.uk, instagram.com/thewallplace) and the images.unsplash.com photo URLs: not fetched; the brief permits logged-out GETs of www.wallplace.co.uk only, and third-party hosts were left alone
- [P01] Live rendering of these 13 pages at https://www.wallplace.co.uk: audited by static reading plus jsdom only; no deployed-site GET was made in this slice
- [P01] Shared Header and Footer rendered on every slice page via (pages)/layout.tsx and directly on src/app/page.tsx: shared shell components, not assigned to this slice; only their hrefs to /, /login, /signup and the portal messages/saved links were glanced at
- [P01] CustomerGuide claims about Apple Pay and Google Pay availability: depends on Stripe Checkout wallet configuration in the live account; not checked here (guest checkout and the 48-hour damage window were verified against checkout/page.tsx and returns/page.tsx)
- [P01] Pricing FAQ 'Can I change my tier?' description of the upgrade flow (new plan checkout, old plan cancelled): describes the artist-portal billing route in slice P06; not verified in this slice
- [P03] src/app/(pages)/forgot-password/page.tsx: no jsdom render test exists; behaviour read from code only
- [P03] src/app/(pages)/register-venue/page.tsx: no jsdom render test exists; behaviour read from code only (live GET confirms the 307 to /signup/venue)
- [P03] src/app/(pages)/apply/page.tsx: the page itself has no render test; ApplyClient and ApplicationGate have passing render tests, but ApplicationForm (the actual form) has only a source-grep test (ApplicationForm.submit.test.ts) and no jsdom render test
- [P03] Live rendering of every slice page for signed-in artist, venue, customer and admin: the local dev server cannot reach Supabase and logged-in requests against production are out of scope; role behaviour was read from the guard code and the passing redirect tests
- [P03] Supabase Auth Site URL and redirect allow-list for emailRedirectTo https://www.wallplace.co.uk/login?next=…: GoTrue configuration is not queryable through execute_sql; known owner item (Site URL still localhost per the launch checklist), not re-verified here
- [P03] Whether supabase.auth.resend(type 'signup') still delivers a link now that autoconfirm is on (affects the two unconfirmed artist accounts using the login resend path): proving it requires a write (a resend call); read-only audit
- [P03] Turnstile challenge UX with a real site key: NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are absent in production and locally, so only the bypass path is exercised
- [P03] OAuth (Google/Apple) sign-in and /auth/callback end to end: providers disabled and the flag is off in production; only the unit tests were run
- [P03] Legacy accounts with passwords shorter than the login form's minLength 8: password lengths are not inspectable; if any exist the browser blocks their login before submit
- [P03] signup/venue 'You're In' success block (page.tsx:223-248): unreachable dead code (setSubmitted is never called; success routes via signupDestination); not user-facing, so not reported as a finding
- [P06] src/app/(pages)/artist-portal/analytics/page.tsx: no jsdom render test exists; behaviour read from code only
- [P06] src/app/(pages)/artist-portal/artwork-requests/page.tsx: no jsdom render test exists; behaviour read from code only (server redirect confirmed against production HTML)
- [P06] src/app/(pages)/artist-portal/artwork-requests/[id]/page.tsx: no jsdom render test exists; behaviour read from code only (server redirect confirmed against production HTML)
- [P06] src/app/(pages)/artist-portal/collections/page.tsx: no jsdom render test exists; behaviour read from code only
- [P06] src/app/(pages)/artist-portal/enquiries/page.tsx: no jsdom render test exists; behaviour read from code only
- [P06] src/app/(pages)/artist-portal/offers/page.tsx: no jsdom render test exists; behaviour read from code only (OffersList has no test either)
- [P06] Production value of NEXT_PUBLIC_FLAG_BLOGS_V1: the env var name is set in Vercel but its value cannot be read from a logged-out GET: /artist-portal/blogs/new returns the same title/markers as an ungated page, /blog and GET /api/blogs are not flag-gated, and probing POST /api/blogs (which 403s when off) is a write attempt the brief forbids. Inferred on from the 3 published + 1 rejected blogs in prod; the blog findings' severity assumes the surface is live
- [P06] src/components/MessageInbox.tsx (2,013 lines): audited by grep for every fetch/mutate/href/router call, empty handlers and copy; not read line by line, so per-branch loading/empty/error states inside the thread view were not individually verified
- [P06] LabelPreview / QRLabel / LabelSheet print output: only handlers and links checked; printed label rendering was not exercised
- [P06] Live Stripe Checkout, Connect onboarding and billing-portal redirects from billing/page.tsx: no logins or purchases permitted; verified the client POSTs and route contracts only
- [P06] Whether MessageInbox `otherParty` holds a venue slug for venue conversations: needed to confirm the suggested /venues/[slug] fix for the /spaces link finding; not traced through the messages API
- [P06] Venue-side branches of OffersList and MessageInbox (Withdraw, Complete payment, ?pay= deep link): outside the artist slice; only the artist-visible branches were audited
- [P08] src/app/(pages)/venue-portal/analytics/page.tsx: no jsdom render test exists; behaviour read from code only
- [P08] src/app/(pages)/venue-portal/artwork-requests/page.tsx: no jsdom render test exists; behaviour read from code only (unconditional server redirect to /venue-portal)
- [P08] src/app/(pages)/venue-portal/artwork-requests/new/page.tsx: no jsdom render test exists; behaviour read from code only (unconditional server redirect to /venue-portal)
- [P08] src/app/(pages)/venue-portal/artwork-requests/[id]/page.tsx: no jsdom render test exists; behaviour read from code only (unconditional server redirect to /venue-portal)
- [P08] src/app/(pages)/venue-portal/artwork-requests/[id]/edit/page.tsx: no jsdom render test exists; behaviour read from code only (unconditional server redirect to /venue-portal)
- [P08] src/app/(pages)/venue-portal/offers/page.tsx: no jsdom render test exists; behaviour read from code only (OffersList itself has 2 passing tests)
- [P08] Outcome of the PortalGuard vs VenuePortalLayout redirect race for non-venue roles (finding 7): depends on the order two /api/account/roles responses arrive; no test pins it and I could not run the app against real auth, so the reported detour is the likely order, not an observed one
- [P08] MessageInbox.tsx lines 130-180 and the sidebar-resize code: 2,013-line component; I read every handler, network call, link, button and state branch but not the state-declaration block, so hooks-order or unused-state issues there are unchecked
- [P08] Message attachment upload target (lib/upload.ts uploadMessageAttachment) and PlacementContextPanel internals: only the MessageInbox call sites were checked; the storage/route the helper posts to and the panel's own buttons were not traced
- [P08] Live GET of the slice pages on https://www.wallplace.co.uk as a logged-out visitor: not performed; all four live pages are client-guarded so an anonymous GET returns only the loading shell and would not exercise any of the checks above
- [P08] Live artwork-request emails (venue_brief_response_received, artist_brief_invitation, live-ids.txt:12,103) still build hrefs to the parked /venue-portal/artwork-requests/<id> pages (responses/route.ts:352,386, fulfill/route.ts:237): not reported as a finding: the pages redirect to the dashboard rather than 404, and the API routes that send these emails have no UI surface since the feature was parked; flagged here for the routes/emails slices to weigh
- [P02] src/app/(pages)/artist-agreement/page.tsx: no jsdom render test exists; behaviour read from code only
- [P02] src/app/(pages)/blog/[slug]/page.tsx: no jsdom render test exists; behaviour read from code only (live GET of one DB post confirmed a 200)
- [P02] src/app/(pages)/blog/page.tsx: no jsdom render test exists; behaviour read from code only (live GET confirmed a 200 and the content)
- [P02] src/app/(pages)/check-your-inbox/page.tsx: no jsdom render test exists; behaviour read from code only
- [P02] src/app/(pages)/cookies/page.tsx: no jsdom render test exists; behaviour read from code only
- [P02] src/app/(pages)/dev/profile-designs/[slug]/page.tsx: no jsdom render test exists; behaviour read from code only; 404 in production confirmed live, so its dev-only UI was not audited further
- [P02] src/app/(pages)/feature-requests/page.tsx: no jsdom render test exists; behaviour read from code only
- [P02] src/app/(pages)/galleries/page.tsx: no jsdom render test exists; redirect read from code and confirmed with a live GET
- [P02] src/app/(pages)/ip-policy/page.tsx: no jsdom render test exists; behaviour read from code only
- [P02] src/app/(pages)/newsletter/confirmed/page.tsx: no jsdom render test exists; behaviour read from code only (status lookup reproduced in Node)
- [P02] src/app/(pages)/privacy/page.tsx: no jsdom render test exists; behaviour read from code only
- [P02] src/app/(pages)/profile-designs/page.tsx: no jsdom render test exists; behaviour read from code only; 404 in production confirmed live
- [P02] src/app/(pages)/programmes/page.tsx and ProgrammesClient.tsx: no jsdom render test exists (case-study.test.tsx checks the CASE_STUDY constant only); form and copy read from code; Accordion and AnimateIn audited for props only
- [P02] src/app/(pages)/returns/page.tsx: no jsdom render test exists; behaviour read from code only
- [P02] src/app/(pages)/terms/page.tsx: no jsdom render test exists; behaviour read from code only
- [P02] src/app/(pages)/venue-agreement/page.tsx: no jsdom render test exists; behaviour read from code only
- [P02] src/app/email-preview/page.tsx and src/app/email-preview/[id]/page.tsx: page.test.tsx invokes the server page functions with mocks (gate order, 404 in production) but there is no jsdom render of EmailPreviewIndex; dev-only UI read from code
- [P02] src/app/waitlist/page.tsx: no jsdom render test exists; behaviour read from code only
- [P02] src/app/(pages)/spaces/page.tsx logged-out path: page.test.tsx renders only signed-in customer and artist states; the logged-out (user null) rendering and the admin role were read from code only
- [P02] Authenticated live behaviour of every page in the slice: the brief forbids logins and form submissions on the deployed site; live checks were logged-out GETs only (/blog, /blog/teest-791hwe, /sitemap.xml, /galleries, /profile-designs, /dev/profile-designs/x, /email-preview)
- [P02] /api/placements POST handler behind the spaces inline form: only the payload was compared with placementSchema; the 2,500-line handler's tier, quota and outreach rules belong to the routes slice and were not traced
- [P02] blog/[slug] generateStaticParams combined with dynamic = 'force-dynamic': not verified against the Next 16 docs; production is deployed and serving, so it was not pursued
- [P09] src/app/(pages)/venue-portal/orders/page.tsx: no jsdom render test exists; behaviour read from code only
- [P09] src/app/(pages)/venue-portal/placements/page.tsx: no jsdom render test exists; behaviour read from code only
- [P09] src/app/(pages)/venue-portal/saved/page.tsx: no jsdom render test exists; behaviour read from code only
- [P09] src/app/(pages)/venue-portal/walls/[id]/page.tsx: no jsdom render test exists; behaviour read from code only
- [P09] src/app/(pages)/venue-portal/walls/new/page.tsx: no jsdom render test exists; behaviour read from code only
- [P09] Live browser session as a venue, artist, customer or admin on www.wallplace.co.uk: logins are prohibited for this audit; role redirects and gating were verified from PortalGuard/VenuePortalLayout code and their 20 unit tests, not observed live
- [P09] WallVisualizer (Konva canvas) internals mounted by walls/[id]/page.tsx: dynamically imported separate component; only the props contract (mode, wall, initialLayout, bgImageUrl, authToken, onClose) was checked, not its own buttons and auto-save handlers
- [P09] Internal handlers of PlacementStepper, CounterPlacementDialog, PaidLoanPaymentChip, PlacementActionItems, ImageLightbox, PayoutExplainerModal rendered on these pages: prop contracts checked against their interfaces; their own onClick/API paths belong to the components slice
- [P09] useSearchParams() without a Suspense boundary in placements/page.tsx:316 and walls/[id]/page.tsx:70: the production deployment built READY on this commit, so it did not fail the build; runtime CSR bailout behaviour not assessed
- [P09] Type validation of venue-profile PUT values (no zod on the route; allowlist only): route-side concern (B); the page sends correctly typed values so the form/route contract holds, but malformed values from other callers were not tested
- [P03] src/app/(pages)/register-venue/page.tsx: no jsdom render test exists; behaviour read from code only (live 307 to /signup/venue confirmed by curl)
- [P03] src/app/(pages)/apply/page.tsx: no direct render test for the server wrapper; ApplyClient.test.tsx covers the body, and ApplicationGate.test.tsx does not exercise the logged-out redirect branch, which was read from code only
- [P03] Supabase Auth Site URL and redirect allow-list for emailRedirectTo (signup pages, resend-verification) and redirectTo (/forgot-password → /reset-password): not readable through the MCP; a mismatch would send confirmation and reset links to the Site URL instead; known owner item from earlier sessions
- [P03] Legacy accounts with passwords shorter than the login form's minLength=8 (login/page.tsx:244): password hashes are not readable; the two seed accounts use 26+ character defaults (scripts/seed-demo-accounts.ts:23-24); the admin account's password is unknown; /forgot-password provides recovery
- [P03] Whether applications@wallplace.co.uk is a monitored mailbox: no config or env name references it; EMAIL_REPLY_TO value not readable
- [P03] Real OAuth round trip through /auth/callback with Google or Apple: providers are off in production; only the jsdom tests were run
- [P03] Destination pages outside this slice (/check-your-inbox, /artist-portal/profile, /venue-portal's ensureVenueProfile, /api/account/roles and the Header portal switcher): read only as far as needed to judge the slice pages' hand-offs; they belong to other slices
- [P03] The 2026-08-31 unconfirmed artist account (confirmation_sent_at set, still unconfirmed, recovery email sent): not created by these pages under the autoconfirm setting; likely the admin accept path in /api/admin/applications/[id] (P10), not traced
- [P03] Native browser validation (required, minLength, type=email) on the slice forms: assumed from HTML semantics; not executed in a real browser
- [P06] src/app/(pages)/artist-portal/analytics/page.tsx: no jsdom render test exists; behaviour read from code only (one tsx probe run for the venuePerformance.length guard)
- [P06] src/app/(pages)/artist-portal/artwork-requests/page.tsx: no jsdom render test exists; behaviour read from code only, plus one logged-out production GET
- [P06] src/app/(pages)/artist-portal/artwork-requests/[id]/page.tsx: no jsdom render test exists; behaviour read from code only
- [P06] src/app/(pages)/artist-portal/offers/page.tsx (and OffersList as rendered by it): no jsdom render test exists; behaviour read from code only
- [P06] src/app/(pages)/artist-portal/blogs/new/page.tsx and blogs/[id]/edit/page.tsx flag-on paths: only the flag-gate test exists; the edit page's load, error and editor states were read from code only; the surface is dormant in production
- [P06] src/components/MessageInbox.tsx (2,013 lines): audited around every fetch, mutate, href and error handler only; the placement/offer card rendering, flag and report flows, pinning, editing and attachment upload paths were not read line by line
- [P06] src/components/labels/LabelPreview.tsx, LabelSheet.tsx, QRLabel.tsx: scanned for links, fetches, buttons and dash copy only; the printed layout and QR URL composition were not verified
- [P06] Production responses: HTTP 200 for /artist-portal/blogs/new (body is the not-found page) and HTTP 200 for /artist-portal/artwork-requests (body carries NEXT_REDIRECT): observed as a logged-out visitor; the reason these prerendered pages return 200 rather than 404/307 was not diagnosed. A browser shows the not-found page and follows the redirect respectively, so no user-visible defect was established
- [P06] Logged-in behaviour on the deployed site for any role: brief forbids logins; all role behaviour is from code and jsdom tests
- [P06] Process note for the orchestrator: during my ArtistPortalLayout probe, vitest's mergeConfig concatenated include globs and swept up another finder's files under scratchpad/probe/src/ (e.g. security.test.tsx); my clean-up `rm -rf scratchpad/probe` then deleted that directory (a probe/ directory has since reappeared, so its owner may have recreated it): those were throwaway probes by the brief's rule, but the owner of that directory should know; my own scratch files (probe-vp-length.ts, blogs-new.html, awr.html, the p06-artist-layout-probe-* directories) were deleted and nothing else in the scratchpad was touched
- [P04] src/app/(pages)/browse/[slug]/page.tsx: no jsdom render test exists; behaviour read from code only (the ArtistProfileClient it renders has 14 tests)
- [P04] src/app/(pages)/browse/[slug]/[workSlug]/page.tsx: no jsdom render test exists; behaviour read from code only (the ArtworkPageClient it renders has 6 tests)
- [P04] src/app/(pages)/browse/[slug]/showroom/page.tsx: no jsdom render test exists; behaviour read from code only
- [P04] src/app/(pages)/curated/[tier]/page.tsx: no jsdom render test exists; behaviour read from code only. It is a client page calling notFound() for an unknown tier; Next 16 docs (not-found.md) describe notFound() as throwing NEXT_HTTP_ERROR_FALLBACK;404 without restricting it to server components, but no test exercises the unknown-tier path.
- [P04] src/app/(pages)/curated/enquiry-sent/page.tsx: no jsdom render test exists; behaviour read from code only
- [P04] src/app/(pages)/curated/page.tsx: no jsdom render test of the Suspense wrapper itself; CuratedClient has 7 tests
- [P04] src/app/(pages)/browse/page.tsx (2,941 lines): audited by targeted greps (hrefs, handlers, fetches, disabled, placeholders, dashes, state strings) plus its 10 passing tests; not read line by line, so filter-panel behaviour beyond the tested URL sync is unverified
- [P04] Shared components rendered by these pages: WallVisualiser, CustomerWallSheet, ShowroomViewer viewer controls, MakeOfferModal offer form, PostcodeInput geocoding, SearchInput, SubscriptionUpsellBanner, ArtworkImageViewer: only their link targets, fetch targets and role branches were checked; their internal forms and handlers were not audited
- [P04] Admin role on these pages: none of the 13 pages branches on the admin gate; an admin behaves as their underlying userType, so there was no admin-specific path to test
- [P04] Deployed site behaviour: no live GETs were made; all page behaviour comes from code reading, the existing tests, one scratch schema probe (deleted) and read-only SQL counts
- [P04] Emails triggered from these pages (receipt, dispute opened, curation enquiry): content and recipients belong to section C and were not audited here

## Verified-ok notes (finders' claims of soundness, also unverified)

- [P05] All seven existing test files in the slice pass: `npx vitest run` on account/export, customer-portal, customer-portal/{addresses,messages,orders,saved,settings} page.test.tsx: 7 files, 38 tests passed (2026-09-05).
- [P05] Pages WITH a jsdom render test: account/export, customer-portal (17 tests), customer-portal/addresses, customer-portal/messages, customer-portal/orders (server redirect unit test), customer-portal/saved, customer-portal/settings. Pages WITHOUT: account/appeal, account/email, account/email/unsubscribe (+ConfirmUnsubscribe), account/security, and the shared CustomerPortalLayout.
- [P05] /customer-portal/orders redirect: preserves the query string, maps legacy ?id= onto ?order= without clobbering an explicit ?order=, keeps repeated params (orders/page.test.tsx, 5 tests pass).
- [P05] Customer dashboard routes all exist in routes.txt and body shapes match: GET /api/orders; PATCH /api/orders {orderId,status} (orders/route.ts:151); GET /api/refunds reads `refundRequests` (refunds/route.ts:65-69, pinned by tests 2.1/6.1); POST /api/refunds/request {orderId,reason,type,amount?} (request/route.ts:43-60); GET /api/disputes scoped to opener_user_id (disputes/route.ts:73-90).
- [P05] Dashboard loading, error-with-retry (C2), empty (EmptyState -> /browse) and no-match states are all present and reachable (customer-portal/page.tsx:566-585, 650); C2 tests pass including recovery on retry.
- [P05] Refund form: submit disabled until reason is non-empty and, for partial, amount is finite, > 0 and <= total (page.tsx:476-480, 533), mirroring the server's checks (request/route.ts:58, 120); server 409 message and network failure both surface (C6 tests pass); confirmation only on 2xx.
- [P05] Confirm delivery (OWNER-GATED, page.tsx:169-197) surfaces both a server error body and a network error via confirmError; reported, not changed.
- [P05] Order lines use readOrderItem's dual-shape read (lib/order-items.ts:63-80) and formatCurrency never prints NaN or undefined (lib/format-currency.ts:16, 57-72); totals fall back to 0; `Order {order_number || id}`.
- [P05] Every filter control on the dashboard has a handler (status tabs, from/to dates, search, conditional Clear) via useUrlState; the Close button clears the selection.
- [P05] Address book: POST /api/customer-addresses, PATCH and DELETE /api/customer-addresses/[id] exist; payload field names (fullName, line1, line2, city, postcode, country, isDefault) match customerAddressFieldsShape (lib/validations.ts:466-474); zod field errors are read from `err.payload.issues.fieldErrors`, matching the route's `issues: parsed.error.flatten()` (route.ts:47); setDefault and delete toast on success and on error (tests pass); Save is disabled only until the four required fields are filled, so it cannot stay disabled forever.
- [P05] Saved page: DELETE /api/saved body {itemType,itemId} matches saved/route.ts:71; removal only on a confirmed 2xx with an error toast otherwise; work links `/browse/<artistSlug>?work=<slugified title>` are matched by ArtistProfileClient.tsx:246 (`slugify(w.title) === workParam || w.id === workParam`); `/browse?view=portfolios|collections` is read at browse/page.tsx:338 and 402-404; C7 vanished-work handling pinned by 4 passing tests.
- [P05] Messages page: honest explainer, CTA `/browse/<slug>?enquiry=1` is read by ArtistProfileClient.tsx:219; ?artist=/?artistName= legacy funnel honoured (tests pass).
- [P05] Settings: password reset success, Supabase error, thrown error and retry-clears-error all pinned (C10 tests); /account/email link present (C23 test); notification toggles PATCH {field:boolean} which /api/account/preferences whitelists (preferences/route.ts:158-164) and upserts for customers (C11, :176-195); prefs GET failure keeps defaults and the next PATCH surfaces a real error (use-notification-prefs.ts:72-74, 103-107).
- [P05] AccountDangerZone: POST /api/account/delete {confirm:"DELETE MY ACCOUNT"} matches delete/route.ts:220; button disabled until the exact string is typed; server error string surfaced via err.code; signOut then router.push("/") only on 2xx.
- [P05] /account/email: GET and PATCH /api/account/email-preferences exist; the PATCH whitelist (email-preferences/route.ts:74-86) accepts exactly the seven booleans plus vacation_until ISO or null that the page sends; success shows "Saved HH:MM"; signed-out state links `/login?next=/account/email` and login reads `next` (login/page.tsx:101).
- [P05] /account/email/unsubscribe: no write on GET since C24; ConfirmUnsubscribe POSTs to /api/account/email/unsubscribe with u, s and c, which the POST handler reads (unsubscribe/route.ts:113-118); done and failed states both rendered; the send pipeline injects `?u=<id>&s=<sig>` into every footer unsubscribe link for sends with a userId (lib/email/send.ts:245-263, pinned by send.test.ts C24 block), so the confirm state is reachable from real mail; ORDER_TOKEN_SECRET is set in production (vercel-env-names.txt:4) so links are signed.
- [P05] /account/export: GET /api/account/export exists (POST aliased at export/route.ts:189); download, API-error and signed-out states pinned by 3 passing tests; a 429 body `{error}` is surfaced by the page's error state.
- [P05] /account/appeal: static server page; mailto and /complaints (present in pages.txt) resolve; reached from `operational_account_restricted`, which is live (send-sites.txt:76 -> app/api/admin/artists/route.ts:192). No dashes or placeholder copy.
- [P05] /account/security: /forgot-password and /login exist in pages.txt; the customer redirect target /customer-portal/settings does carry the Change Password control; admin stays on the static page.
- [P05] CustomerPortalLayout: nav is read from customerPortalNav() (lib/portal-nav.ts:130-141); every href (/customer-portal, /saved, /addresses, /messages, /settings, /browse) exists in pages.txt; Logout calls signOut and PortalGuard then bounces to /login.
- [P05] Role gating (read from PortalGuard.tsx, every slice test mocks the layout): logged out -> replace /login; customer -> renders; artist, venue and admin -> info toast and redirect to their own portal once /api/account/roles resolves, unless ownRoles includes "customer" (PortalGuard.tsx:104-119).
- [P05] Copy sweep over the 14 files (11 pages, ConfirmUnsubscribe, CustomerPortalLayout, AccountDangerZone): no em/en dashes or &mdash;/&ndash; in JSX (the only grep hits are comments in AccountDangerZone.tsx:7,10,38); no US spellings in user-visible copy (hits were className/SVG attributes and the cancelEdit function name); interpolations fall back (`displayName || "Not set"`, `user?.email || "Not set"`, avatar `|| "C"`, `order_number || id`).
- [P01] Render (logged out): all 11 static pages in the slice (about, artists, complaints, contact, customer, faqs, how-it-works, partners, pricing, sustainability, venues) render via renderToStaticMarkup with an h1 and no thrown error (scratchpad jsdom probe, 11/11 pass, probe deleted afterwards); none reads auth, so artist/venue/customer/admin get identical output
- [P01] Render (home): src/app/page.test.tsx 10/10 pass for user null; probe confirmed artist → 'Artist Portal' /artist-portal, venue → 'Venue Portal' /venue-portal, customer → 'Customer Portal' /customer-portal (page.tsx:51-52, 124-128)
- [P01] Render (venues/[slug]): server page awaits params and passes slug (probe); VenueProfileBody reaches loading skeleton (:101-111), notfound (:113-124), locked (:129-165) and ready (:175-337) states; probe covered 404, locked, ready for logged-out (CTA 'Apply to be displayed here' → /signup/artist), artist ('Message this venue' → /artist-portal/messages?venue=v&venueName=Copper+Kettle), customer (no header CTA); document.title only set when unlocked (:95-99)
- [P01] Links: every href rendered across the 13 pages resolves to pages.txt: /apply, /venues, /artists, /spaces, /spaces#postcode (id at spaces/page.tsx:317), /ip-policy, /privacy, /browse, /browse/[slug], /signup, /signup/artist, /signup/customer, /signup/venue, /orders/track, /faqs, /returns, /complaints, /pricing, /how-it-works, /how-it-works?tab=artist, /artist-agreement, /venue-agreement, /artist-portal/billing, /artist-portal/messages, /venue-portal/placements, /terms, /contact, /programmes, /curated; in-page anchors #hiw-detail (HowItWorksClient.tsx:210) and #main-content exist; no '#' or self-links
- [P01] Query params read by their targets: ?tab=artist read by HowItWorksClient.tsx:67 (HowItWorksClient.test.tsx 3/3 pass); ?plan=pro read by ApplicationForm.tsx:193-202 (A17); ?venue=&venueName= read by artist-portal/messages/page.tsx:25-27; ?artist= read by ContactForm.tsx:8
- [P01] Contact form → POST /api/contact (routes.txt): form sends {name, email, type, message}; contactSchema (validations.ts:45-50) accepts exactly those, type safeString(50) covers artist/venue/buyer/commercial/other/artist-message; 400/500 (route.ts:41,59) and 429 (rate-limit.ts:97-98) all return {error} which ContactForm.tsx:95-96 surfaces (probe rendered 'Too many requests'); success shows 'Message Sent' plus reference (route.ts:117, ContactForm.tsx:126-132); network throw shows 'Network error' (:104-107); missing type shows inline error without fetching (probe); submit disabled only while submitting and re-enabled on failure (:97,106,176); ContactForm.test.tsx 6/6 pass
- [P01] Contact ?artist= path → POST /api/enquiry: body {senderName, senderEmail, artistSlug, enquiryType:'general', message} matches enquirySchema (validations.ts:52-58, workTitle optional); POST needs no auth (enquiry/route.ts:129-133); failed enquiry changes wording rather than claiming notification (ContactForm.tsx:64-85, 120-123)
- [P01] Home → GET /api/browse-artists exists (routes.txt); tile grid hidden until data and on any failure (page.tsx:37-49, 181); ISR revalidate 60 on the route
- [P01] venues/[slug] → GET /api/venues/[slug]/profile exists; response shape {locked, venue (+acceptsArtistOutreach), walls, openRequests} (route.ts:214-224, 252-257) matches ProfileResponse (VenueProfileBody.tsx:56-61) and VenueWallCard's venue.acceptsArtistOutreach cast; owner always entitled, customers entitled, artists need active subscription (route.ts:200-210, venue-visibility.ts:18-25)
- [P01] Arrangement label consistency: venue profile form binds interested_in_free_loan to ARRANGEMENT_LABEL.paid_loan (venue-portal/profile/page.tsx:603-605) and VenueProfileBody.tsx:170 maps the same flag to the same label 'Paid loan' (probe rendered 'Paid loan' and 'Revenue share')
- [P01] Buttons/onClick in slice: FaqsClient tabs (setAudience), HowItWorks tabs (setAudience), Accordion toggles (setOpenIndex), ScrollButton scrollIntoView on existing ids artist-content/venue-content/customer-content, home scrollToContent ref, ArtistPricingCards monthly/annual toggle, VenueWallCard open/close/fullscreen; no empty or console.log-only handlers, no disabled state that can stick
- [P01] Pricing figures from lib: PLAN_PRICES 9.99/24.99/49.99 match every '£9.99/mo', '£24.99/month', '£49.99/month' literal on artists/faqs/pricing; WORKS_CAP 8/20/50 matches 'Up to 8/20/50'; ACTIVE_PLACEMENT_CAP 2/5/null matches '2/5/Unlimited'; PLATFORM_FEE_PERCENT 15 matches every '15%'; gbp(79.99)='£79.99', gbp(49)='£49'; PROGRAMME_RENT_SHARE_TARGET renders '40%'; PROGRAMME_PIECE_STINT_MONTHS=6 and rent target £10 render as '£10'/'6 months'/'£60'; every interpolated constant is defined, so no undefined/NaN/null can print
- [P01] ArtistPricingCards annual maths: 99.99/9.99×12 = 16.6% saving matches 'Save 17%'; floor-rounded monthly equivalent never overstates (ArtistPricingCards.tsx:103-111)
- [P01] Copy: no em dash, en dash, &mdash; or &ndash; in visible text of any slice file or its marketing components (grep hits only JSX comments at artists:77, customer:68, FaqsClient:91, venues:70, VenueGuide:135, page.tsx:85, all code); no US spellings in copy (grep hits only the `behavior:` scrollIntoView option and a code comment); probe asserted rendered text of all 11 static pages contains no [—–]
- [P01] Legal/consistency: CustomerGuide '48 hours' damage window matches returns/page.tsx:71; complaints page avoids printing the blank company.ts registered office (asks to email for a postal address); complaints external links carry rel='noopener noreferrer'; FeedbackBubble hides on legal pages only, so it appears on all 13 slice pages by design
- [P01] Images: every remote image in the slice is images.unsplash.com, allowed by next.config images.remotePatterns; public/images/programmes assets are not referenced by the forbidden pages (programmes-photography-scope.test.ts would fail otherwise)
- [P01] Existing tests covering the slice all green: page.test.tsx (10), HowItWorksClient.test.tsx (3), faq-coverage.test.ts (3), ContactForm.test.tsx (6), VenueWallCard.test.tsx (7), Button.test.tsx (10), Breadcrumbs.test.tsx (4), SamplePill.test.tsx (1), founding-offer-surfaced.test.ts (14), public-claims.test.ts (9), one-curated-price-source.test.ts (7): 74/74
- [P01] Metadata: every page.tsx in the slice exports title and description; venues/[slug] deliberately keeps a generic title so the paywalled name does not leak server-side (page.tsx:4-9)
- [P03] All 10 existing jsdom test files for the slice pass: 53 tests (login 25, signup hub 5, auth/callback 4, signup/venue 4, signup/artist 3, signup/customer 3, reset-password 3, apply/claim 2, ApplyClient 2, ApplicationGate 2); `npx vitest run` 2026-09-05.
- [P03] Logged-out GET on the deployed site: 200 for /apply, /apply/claim, /forgot-password, /login, /reset-password, /signup, /signup/artist, /signup/customer, /signup/venue, /auth/callback, /check-your-inbox; /register-venue 307 to https://www.wallplace.co.uk/signup/venue (matches redirect('/signup/venue') at register-venue/page.tsx:4).
- [P03] Role gating on /login: signed-in user of any role is redirected to safe ?next or portalPathForRole (artist /artist-portal, venue /venue-portal, customer /customer-portal, admin /admin, none /browse); external ?next and ?redirect fall back to the portal (login/page.test.tsx, 5 redirect tests). Form renders only when logged out (page.tsx:162-163).
- [P03] Role gating on /signup, /signup/artist, /signup/customer, /signup/venue: RedirectIfLoggedIn.tsx:22-29 replaces to safe ?next or portalPathForRole for any signed-in role and renders children while auth loads; RedirectIfLoggedIn.test.tsx exists.
- [P03] Role gating on /apply: logged out -> router.replace('/signup/artist?next=/apply' + current query) (ApplicationGate.tsx:56-67); venue or customer -> wrong-role notice whose CTA signs out before navigating (ApplicationGate.test.tsx passes, order asserted); artist or missing user_type -> ApplicationForm. /apply/claim: signed in -> replace to /artist-portal/profile?welcome=1 (page.test.tsx passes); profile page reads welcome at profile/page.tsx:352 and seeds an empty profile when no artist row exists (395-403), so the claim flow has no dead end.
- [P03] Every onClick and submit handler reaches a real route in routes.txt: /api/auth/precheck (login, forgot-password), /api/auth/resend-verification (login), /api/auth/oauth-sign-state (login, signup/artist, signup/customer), /api/auth/oauth-finalize via mutate (auth/callback), /api/auth/verify-turnstile (three signup pages), /api/terms/accept (three signup pages, ApplicationForm), /api/register-venue (signup/venue), /api/apply via mutate (ApplicationForm), /api/artist-profile POST (apply/claim). No empty or console.log-only handlers; venue art-interest and application sub-style/plan buttons are pure state toggles.
- [P03] Every Link and href resolves to a real page in pages.txt: /login, /signup, /signup/artist, /signup/venue, /signup/customer, /forgot-password, /terms, /privacy, /venue-agreement, /artist-agreement, /curated, /browse, /venue-portal, /, /check-your-inbox, /artist-portal/profile; /terms#cancellation is an anchor on an existing page; mailto:applications@wallplace.co.uk is external. No '#' or same-page anchors. Forwarded ?next= is read by every target (login/page.tsx:101, signup/page.tsx:76-82, signup/*/page.tsx, RedirectIfLoggedIn); signup hub test proves clean links when next is absent or external.
- [P03] ApplicationForm payload matches applySchema field for field: traderStatus enum or '', discipline enum, subStyles array, sampleWorkUrls max 3 (empties filtered in artist-application-row.ts:39-47), selectedPlan enum matches planOptions ids core/premium/pro, acknowledgedCoolingOff, referralCode within optionalString(20). Server 400 fieldErrors and the 403 email-mismatch message are surfaced through ApiError (ApplicationForm.tsx:293-302, api-client.ts:101).
- [P03] Venue form payload matches registerVenueSchema (venueName, venueType, customVenueType, contactName, email, phone, addressLine1/2, city, postcode, wallSpace, artInterests, message, hearAbout); 'Other' free text is folded into message (route.ts:30-37). Server errors are surfaced via data.error (page.tsx:166-171).
- [P03] termsAcceptSchema accepts exactly {userEmail, userType, termsVersion, termsType} as sent by all callers; live terms_acceptances rows exist for artist, customer and venue at both v1.0-2026-04 and v1.1-2026-09, so the fire-and-forget posts land. /api/auth/precheck accepts {kind}; resend-verification schema accepts {email, next?}.
- [P03] /api/apply row builder coerces primary_medium, portfolio_link and artist_statement to '' (artist-application-row.ts:65-69), closing the 23502 primary_medium cluster in vercel-runtime-errors-7d.txt (last seen 2026-08-30 on an older deployment, none on the current one).
- [P03] Success and error states exist and are reachable: login (error line, unconfirmed-account resend block with sent state), forgot-password (sent screen showing the address, error line, 429 message), reset-password (checking / missing / success / error, A55 race test passes), auth/callback (error with Back to login anchor), apply (submitted card replaces banner and sidebar, ApplyClient test), signup pages (error line), apply/claim (error line). Loading states: login returns null while auth loads (so the prerendered HTML carries no form and the ?next-suffixed Sign up link cannot hydration-mismatch), ApplicationGate 'Checking your account…', claim 'Loading…', reset 'Checking your reset link…', callback 'Signing you in…'.
- [P03] Disabled conditions cannot stick: signup submits gate on agreedToTos (+ venue agreement) and turnstileToken; Turnstile emits 'dev-bypass' immediately when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (Turnstile.tsx:61-63) and verify-turnstile answers ok with an ERROR log when TURNSTILE_SECRET_KEY is unset (route.ts:53-62); the runtime cluster '[turnstile] TURNSTILE_SECRET_KEY is UNSET IN PRODUCTION' count 7 confirms signups proceeding, known owner decision 21. forgot-password gates on email, reset-password on both fields, ApplicationForm on the four attestations plus traderStatus.
- [P03] Rate limiting with Upstash vars absent in production fails open: rate-limit.ts:27-36 warns once and falls back to a per-instance in-memory store, checkRateLimit returns null on success (124-128), so login and forgot-password are not blocked.
- [P03] Copy: no em dashes, en dashes, &mdash; or &ndash; in rendered copy of any slice page, ApplicationGate, ApplicationForm, TermsCheckbox or RedirectIfLoggedIn (grep hits are code comments only); no US spellings ('practice' is the noun, 'behavior'/'center' are code); no interpolation can print undefined or null (login toast guards on !!userType and !!hint, names and email are required before they render). FOUNDING_OFFER_SHORT resolves to 'First 20 artists: 6 months free' (180/30 = 6, no NaN) in apply metadata, ApplyClient and signup/artist.
- [P03] OAuth surfaces are hidden in production: FLAGS.OAUTH_GOOGLE_APPLE prodDefault false and NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE absent from vercel-env-names.txt; when on, oauth-sign-state rejects admin (route.ts:23) and oauth-finalize re-checks (route.ts:64); login H1 tests (8) pass.
- [P03] Open-redirect guard: safeRedirect validates ?next on login, signup hub, all three signup pages, RedirectIfLoggedIn and auth/callback; auth/callback test proves external next and external state-derived next both fall back to /browse.
- [P03] Email confirmation is currently off in production: the four most recent signups (2026-09-03 to 2026-09-05) have email_confirmed_at set and no confirmation_sent_at; signupDestination (signup-destination.ts:30-37) routes on the returned session so both settings are handled. The two unconfirmed artist accounts (latest created 2026-08-31, confirmation_sent, never signed in) are served by the login page's 'Email not confirmed' resend path.
- [P03] Venue registration data: venue_registrations has UNIQUE (email) live; 6 registrations, 0 without an auth.users account, 0 mixed-case emails; ensureVenueProfile matches registrations with ilike (venue-profile/route.ts findVenueRegistration) so case cannot break hydration; 9 venue_profiles, 0 ownerless.
- [P03] register-venue redirect page: only inbound link is PlacementCTA.tsx:30 href='/register-venue' with no query, so the query-dropping redirect() loses nothing.
- [P06] artwork-requests/page.tsx and artwork-requests/[id]/page.tsx: server-component `redirect("/artist-portal")` for every role; production HTML for /artist-portal/artwork-requests carries `NEXT_REDIRECT;replace;/artist-portal;307` (streamed redirect, hence the 200 status seen by curl).
- [P06] Existing jsdom render tests all pass: billing/page.test.tsx (6), blogs/page.test.tsx (4), blogs/blogs-flag-gate.test.tsx (4, covers list/new/edit notFound gate), labels/page.test.tsx (4), messages/page.test.tsx (3); `npx vitest run` → 5 files, 21 tests passed.
- [P06] Role model via layout.tsx → PortalGuard: signed-out → replace('/login') and renders null (prod SSR of every slice page shows only 'Loading...'); unverified email → verify screen with working resend (POST /api/auth/resend-verification exists) and sign-out; past_due/canceled → 'Choose Your Plan' gate except on /artist-portal/billing and /settings (PortalGuard.tsx:120-124); rejected → 'Application not approved' with mailto; pending → under-review banner; approved+none/incomplete → billing banner. Venue/customer users end up in their own portal (ArtistPortalLayout:181 → /login → login/page.tsx:105 portalPathForRole).
- [P06] Billing forms match routes: POST /api/subscribe body {plan, billing} (route reads body.plan, body.billing==='annual'); POST /api/stripe-connect/onboard {accountType:'artist'} validated at onboard/route.ts:11; POST /api/stripe-connect/dashboard and /api/subscribe/portal exist and return {url}; GET /api/stripe-connect/status returns {hasAccount, onboardingComplete, chargesEnabled, payoutsEnabled} matching the ConnectStatus interface. Every handler surfaces errors via toast or inline role=alert.
- [P06] Billing 'Save 17%' badge matches annualSavingsPercent for all three plans from PLAN_PRICES (99.99/119.88, 249.99/299.88, 499.99/599.88 all round to 17%); trial copy comes from trialOffer() and is pinned by tests; success/cancel URLs from /api/subscribe (?subscribed=true) are handled at page.tsx:116-127 with the 30s poll.
- [P06] Blogs: BlogEditor POST /api/blogs body {title, body_markdown, cover_image_url?, featured_artwork_ids} matches createSchema (blogs/route.ts:22-27); PATCH /api/blogs/[id] body incl. cover_image_url:null and submit_for_review matches updateSchema (nullable/optional, [id]/route.ts:35-39); DELETE /api/blogs/[id] wired and tested; errors surfaced via describeSaveError; edit page has loading and error states; links /artist-portal/blogs/new and /artist-portal/blogs/[id]/edit exist.
- [P06] Collections: POST/PATCH payload keys (name, description, bundlePrice string, workIds, workSizes array, thumbnail, bannerImage, available, id on PATCH) match parseBody in collections/route.ts:50-100; client and server both require ≥2 works; DELETE passes ?id= which the route reads from searchParams (route.ts:335-336); 402 subscription_required opens UpgradePrompt whose 'See plans' → /artist-portal/billing exists; Save disabled state `!isFormValid || saving || uploading !== null` cannot stick (name/works/price are plain controlled inputs).
- [P06] Enquiries: GET /api/enquiry returns {enquiries} with exactly the fields the page reads; PATCH body {id, status} accepts number|string id and 'pending'|'handled' (enquiry/route.ts:101-102); page has loading, load-error, update-error, empty and filtered-empty states; enquiryTypeLabel handles null ('Enquiry'); prod enquiries: 16 rows all 'pending'.
- [P06] Labels: PUT /api/artist-profile {label_theme} is on the route's allowlist and deliberately ungated (artist-profile/route.ts:115); venue dropdown carries {name, slug} pairs from buildVenueOptions and deep links resolve by slug then name; LabelPreview's Print calls window.print(); labels/page.test.tsx pins the theme picker save and failure toast.
- [P06] Messages page: ?venue/?venueName and ?artist/?artistName both feed MessageInbox (test pins). MessageInbox calls only existing routes with existing methods: GET/POST/PATCH /api/messages, GET/PATCH/DELETE /api/messages/[conversationId], PATCH/DELETE /api/messages/item/[messageId], POST /api/messages/block, POST /api/messages/report, GET /api/browse-artists, PATCH /api/offers/[id], PATCH /api/placements. Its links /browse, /browse/[slug], /spaces, /contact, /faqs all exist in pages.txt. No empty onClick, console.log-only handler or TODO in MessageInbox, OffersList, LabelPreview, BlogEditor or the slice pages.
- [P06] MessageInbox offer-card accept on the artist side also POSTs /api/offers/[id]/checkout via mutate; the route refuses non-buyers (checkout/route.ts:44-45 'Only the buyer can check out', 403) and the client swallows it, so the artist path is inert and creates no Stripe session. OffersList.pay() remains the OWNER-GATED authFetch site, unchanged.
- [P06] Offers: GET /api/offers?role=artist is a supported filter (offers/route.ts:142-150); Accept/Decline/Withdraw PATCH {action} and Counter POST match the routes; success toasts are gated on confirmed 2xx (E43); expired offers hide actions via isOfferLapsed.
- [P06] ArtistPortalLayout nav (src/lib/portal-nav.ts artistPortalNav): every href (/artist-portal, /profile, /portfolio, /collections, /showroom, /messages, /enquiries, /placements, /offers, /orders, /posts, /blogs [flag], /saved, /labels, /analytics, /billing, /settings) resolves to a page in pages.txt; PortalGuard links /artist-portal/profile, /artist-portal/billing, /pricing exist; analytics links /artist-portal/placements and /artist-portal/billing exist; OutreachAllowance links /pricing; PayoutExplainerModal links /artist-agreement.
- [P06] Copy: grep for em dash, en dash, &mdash;, &ndash; across all 12 slice pages, layout.tsx and every rendered component finds occurrences only in code comments (exempt); no US spellings in user-visible strings except the 'Canceled' pair reported above; analytics 'view{s}', 'venue{s}', billing 'day{s}', labels 'label{s}' pluralisation guarded; no interpolation prints undefined/NaN (MetricCard value always numeric, `?? 0` fallbacks, dates guarded).
- [P06] Analytics API contract otherwise sound: /api/analytics/artist returns totals/views_over_time/top_works/traffic_sources/venue_viewers/venue_viewer_count/is_premium as the page types them; is_premium true for premium and pro (route.ts:182) so 'Premium Feature' only shows for Core; 'Earnings Over Time' caption correctly says 'Last 7 months' (D6); MetricCards have a loading skeleton.
- [P06] Read-only SQL spot checks used as evidence: placements.status values (all lower-case: active 38, pending 34, cancelled 8, completed 5, declined 5, sold 1); placements.revenue is NULL on all 91 rows; blogs: 3 published, 1 rejected; dual-role accounts: 2 (one admin-typed, one artist-typed).
- [P08] Tests: the two render tests in the slice pass with the 2 component suites they depend on: labels/page.test.tsx (2), messages/page.test.tsx (4), components/offers/OffersList.test.tsx (2), components/MessageInbox.test.tsx (19); 4 files, 27 tests green (npx vitest run, 907ms).
- [P08] Role gating, all 8 pages (venue-portal/layout.tsx:10 <PortalGuard allowedType="venue">): logged out → router.replace('/login') and null render (PortalGuard.tsx:104-107,193); venue → children (:351); venue whose email is unconfirmed → 'Verify your email' screen with resend to /api/auth/resend-verification (exists in routes.txt) and sign-out (:195-237); artist/customer/admin → toast + replace(portalPathForRole) unless /api/account/roles ownRoles includes 'venue' (:108-118; roles route derives ownRoles from artist/venue/customer_profiles rows, account/roles/route.ts:48-58); pinned by PortalGuard.test.tsx lines 79-141 and 285-345. Admin's userType parses as 'admin' (auth-roles.ts:7,15) → /admin (:47-48).
- [P08] Parked pages (artwork-requests, /new, /[id], /[id]/edit): each is a server component whose body is `redirect("/venue-portal")` (lines 4-8 of each file), so every role is redirected server-side before any client guard; no rendered surface links to them (grep: only API email builders, ArtworkRequestsList behind the also-parked public /artwork-requests page which redirects to /spaces, and tests). Owner decision 2026-08-28 in the file header; not a finding.
- [P08] Analytics: /api/analytics/venue exists (routes.txt); page range params 7d/30d/90d/12m/all (page.tsx:17-26) all handled by getDateCutoff (route.ts:17-33); response shape totals.qr_scans, top_works[{work_id,title,artist_slug,scans}], top_artists[{artist_slug,artist_name,scans}] matches the page interface (page.tsx:28-34 vs route.ts:107-131,156-164); 'Unknown work' fallback from route.ts:109 is rewritten to 'Artwork no longer available' (page.tsx:135-142); links /browse/[slug] and /venue-portal/labels exist in pages.txt; dropdown buttons are pure state changes (page.tsx:70-89); loading state ('…', 'Loading…') at :99,106,113,123,185.
- [P08] Labels data path: /api/placements GET exists, venue branch `.eq("venue_user_id", auth.user!.id)` on select('*') with `...p` spread into the response (placements/route.ts:110-127, 330-340) so status/extra_works/work_size/work_image/artist_slug/venue reach the page; /api/browse-artists returns {artists} (route.ts:16-18) whose works are ArtistWork with required id/title/medium/dimensions/priceBand (data/artists.ts:33-37), and toPublicArtist strips only postcode/coordinates (public-artist.ts:33-45); /api/venue-profile GET returns {profile} (venue-profile/route.ts:13-18) read at page.tsx:178-181.
- [P08] Labels QR encoding: LabelSheet.tsx:68-88 builds `${siteUrl}/api/qr/${artistSlug}?w=&t=&vs=&v=&size=`; /api/qr/[slug]/route.ts:28-34 reads exactly w, t/work, vs, v, size, resolves vs→venue_user_id (:51-66) and logs qr_scan (:68-83); the ?placement= deep link is read (labels/page.tsx:54,132-137) and is what venue-portal/placements/page.tsx:1726,2032, PlacementDetailClient.tsx:607, PlacementQRModal.tsx:177 and placements/route.ts:1824 emit.
- [P08] Labels buttons: style/size/toggle/select-all/select/qty/Clear are state changes (page.tsx:318-329,336-345,376-385,411-416,460,470,503-511,555-560); Print → and Preview & Print open LabelPreview (:516-525,562-567); LabelPreview Close → onClose, Print Labels → window.print(), size/copies/remove/toggles are state (LabelPreview.tsx:93-115,131-140,156-178,220-229); qty clamped 1–50 (page.tsx:212). Loading (:299-300) and empty (:301-305) states exist.
- [P08] Messages page: reads ?artist and ?artistName (page.tsx:12-13) which MessageInbox consumes to select or compose (MessageInbox.tsx:346-377); ?c= from message_unread_notification (notifications.ts:54, live-ids.txt:68) is consumed (:388-395); loading, no-slug failure with Retry, and inbox states pinned by the 4 passing tests; useCurrentVenue → /api/venue-profile and dbVenueToVenue maps slug (venue-profiles-transform.ts:44).
- [P08] MessageInbox endpoints all exist in routes.txt and bodies match schemas: GET /api/messages?slug= (route reads slug :49); POST /api/messages {conversationId?, senderName, senderType:'venue', recipientSlug, content, attachments} ⊂ messageSchema (validations.ts:133-155, senderType enum includes 'venue', attachments shape identical); GET/PATCH/DELETE /api/messages/[conversationId] (route.ts:12,50,94); PATCH /api/messages/item/[id] {action:'pin'|'unpin'} (route.ts:30) and DELETE (:63); POST /api/messages/report {otherParty, conversationId, reason} (report/route.ts:44-50); POST /api/messages/block {otherParty} (block/route.ts:37-40); PATCH /api/offers/[id] {action} ∈ accept|decline|withdraw (offers/[id]/route.ts:51); POST /api/offers/[id]/checkout → {url} (checkout/route.ts:350); PATCH /api/placements {id, status:'active'|'declined'} ∈ placementUpdateSchema (validations.ts:267-273); CounterPlacementDialog PATCH /api/placements {id, counter:{...}} and CounterOfferDialog POST /api/offers (dialog lines 90-101 / 95-104); GET /api/browse-artists.
- [P08] MessageInbox links and states: /browse, /browse/[slug], /spaces, /contact, /faqs all in pages.txt; conversation-load failure has its own state with Try again (MessageInbox.tsx:306-338,931-949) distinct from the empty state (:950-971) which links venues to /browse; send errors surfaced inline (:585-588,1017-1025,1647-1655); delete/pin/offer/placement failures toast and revert (:628-636,649-653,670-673,694-701,732-741); Report/Delete/Block confirm only on 2xx via submitFlagAction (flag-action.ts:33-46); Send disabled when empty, sending or >5000 chars (:1041,1716); attach disabled at 10 files (:1693); support thread is read-only with a /contact CTA (:1633-1644).
- [P08] Offers page: /api/offers?role=buyer is read by the route (offers/route.ts:142-150); OffersList Accept/Counter/Decline shown only to the recipient of a pending, unlapsed offer and Withdraw only to its sender (OffersList.tsx:437-478), Pay only to the buyer of an accepted offer (:479-488); Send counter disabled unless amount > 0 (:549-562); counter POST body {artistSlug, workIds, collectionId, amountPence, message, parentOfferId} ⊂ createOffer schema (offers/route.ts:26-36); Withdraw behind ConfirmDialog with success and failure toasts gated on the server result (:577-603); inline error banner (:282); loading (:268) and empty state with /browse link (:269-278); ?pay= and ?focus= handled once loaded (:137-168); links /browse/[slug] and /venues/[slug] exist; pay() is OWNER-GATED (:208-211) and was read only; paid_order_id shown at :490 is set by the Stripe webhook (webhooks/stripe/route.ts:395).
- [P08] VenuePortalLayout shell (rendered by all four live pages): 11 sidebar hrefs from portal-nav.ts:103-118 (/venue-portal, /profile, /messages, /placements, /offers, /walls, /saved, /labels, /analytics, /orders, /settings) all exist in pages.txt; Logout calls signOut() and the auth effect then replaces to /login (VenuePortalLayout.tsx:89-94,218-223); self-heal PATCH /api/venue-profile {ensureProfile:true} failure shows a Retry banner (:119-143,279-290), pinned by VenuePortalLayout.test.tsx; per-route document titles (:21-42).
- [P08] Copy sweep over the 4 live pages plus VenuePortalLayout, PortalGuard, OffersList, LabelPreview, LabelThemePicker, QRLabel, LabelSheet, portal-nav: every em/en dash and &mdash;/&ndash; hit is inside a code comment; every US-spelling hit is a CSS-in-JS property (color, alignItems:'center', behavior:'smooth'); user-visible text uses 'colour' (LabelThemePicker.tsx:26, labels/page.tsx:396), 'behaviour' (MessageInbox.tsx:1920); no lorem/placeholder text; interpolations guarded (formatArtistName falls back to 'Artist', venueName to 'Your venue', artist_name to slug server-side). The one copy defect found is the hyphen-as-dash reported above.
- [P02] Existing slice tests green: `npx vitest run` on spaces/page.test.tsx (8), programmes/case-study.test.tsx (1), email-preview/page.test.tsx (4), email-preview/access.test.ts (7): 4 files, 20 tests passed.
- [P02] /galleries: page.tsx:4 redirects to /browse?view=gallery; live GET returns 307 to https://www.wallplace.co.uk/browse?view=gallery; /browse reads `view` (browse/page.tsx:338) and treats 'gallery' as the default Galleries view (:402-408), so the param is honoured.
- [P02] /email-preview and /email-preview/[id]: access.ts allowlist fails closed (unset or unrecognised NEXT_PUBLIC_SITE_URL reads as production); page.test.tsx proves both pages call the gate before any template lookup; live GET /email-preview -> 404; robots.ts disallows /email-preview/.
- [P02] /profile-designs and /dev/profile-designs/[slug]: NODE_ENV === 'production' -> notFound (profile-designs/page.tsx:71, dev/.../page.tsx:73); live GETs -> 404; robots.ts disallows /dev/. Their handler-less mock buttons are unreachable in production.
- [P02] /newsletter/confirmed: the confirm route emits exactly ok | expired | invalid (api/newsletter/confirm/route.ts:37-39) and each has heading/body/note copy; absent or unknown status falls to 'invalid'; CTA /browse exists; metadata noindex.
- [P02] /check-your-inbox: 'Go to sign in' -> /login exists; metadata noindex; robots.ts disallows /check-your-inbox/.
- [P02] Legal pages (terms, privacy, cookies, returns, ip-policy, artist-agreement, venue-agreement): every internal href resolves to a page in pages.txt (/terms, /privacy, /cookies, /artist-agreement, /venue-agreement, /complaints, /pricing); external links (cedr.com, citizensadvice.org.uk, ico.org.uk) carry target=_blank rel=noopener noreferrer; terms in-page ids (about ... contact, cooling-off) exist.
- [P02] Copy sweep: grep for —, –, &mdash;, &ndash; across all 20 slice files and src/data/blog-posts.ts returns nothing in copy; grep for US spellings (color, center, organiz, favor, behavior, catalog, fulfill, canceled, recogniz, realiz, customiz, personaliz, gray) finds only code (className, scrollIntoView behavior, Unsplash URL params); no placeholder text found.
- [P02] Artist Agreement figures match src/lib/pricing.ts: £9.99/£24.99/£49.99 = PLAN_PRICES, 15% = PLATFORM_FEE_PERCENT, 2/5/unlimited placements = ACTIVE_PLACEMENT_CAP {2,5,null}; `Math.round(STANDARD_TRIAL_DAYS/30)` = 1 -> '1 month'; FOUNDING_ARTIST_LIMIT 20 and FOUNDING_TRIAL_MONTHS 6; 9A rent gbp(10) '£10' target and gbp(5) '£5' floor (curation-tiers.ts:105,108). Note the plan prices and caps are literals on this page, so a reprice must edit it.
- [P02] Terms, Artist Agreement and Venue Agreement render the pre-incorporation LegalEntityNote (company.ts number is empty -> isIncorporated() false -> LegalEntityNote.tsx:26).
- [P02] Cookie policy claims hold: browser session is supabase-js `createClient` (src/lib/supabase.ts:6, localStorage), `@supabase/ssr` is not a dependency (AdminGate.tsx:28 comment) and no code writes document.cookie / Set-Cookie (repo grep); no Stripe.js or Vercel analytics loaded on the client (grep for loadStripe, @stripe/stripe-js, @vercel/analytics: none); consent key is 'wallplace-cookie-consent' (CookieConsentContext.tsx:5); cart keys are 'wallplace-cart:guest' / 'wallplace-cart:u:<id>' (CartContext.tsx:25-27, covered by the 'wallplace-cart' row and the 'Other wallplace-... keys' row); analytics visitor id is sha256(ip:userAgent:YYYY-MM-DD) (analytics.ts:45-50) and analytics/track/route.ts:28 uses it.
- [P02] Returns page instructions match the UI: 'My Orders' heading (customer-portal/page.tsx:275) and 'Request Refund' button (customer-portal/page.tsx:557); Terms' 'Item not received' dispute reason exists (orders/[id]/page.tsx:45).
- [P02] Programmes form contract: tier 'programme' is in CURATION_TIER_KEYS; contactPhone '' accepted by optional(40); sector and rotationCadence (biannual/quarterly/none) match the route enums; siteCount 1-50 and piecesEstimate 1-60 inputs match z.number().int().positive().max(50/60); success returns mode 'enquiry' (route.ts:251) and the page routes to /curated/enquiry-sent, which exists; error path displays data.error; '#enquire' (ProgrammesClient.tsx:484) and 'programmes-content' (:304) anchor ids exist; interpolations gbp(79.99)='£79.99', Math.round(0.4*100)=40, ladder plural correct for 3/6/10/16; all four /images/programmes/*.webp srcs exist under public/; CASE_STUDY is null so no fabricated case renders (case-study.test.tsx).
- [P02] Waitlist form contract: name/email/userType (artist|venue, a subset of the schema enum) plus optional phone/venueName/venueLocation match waitlistSchema (validations.ts:30-43); route answers 400/500 with `error` and 200 `{success:true}`; the page renders both the error <p> and SuccessState; submit is disabled until name, email and type are set and re-enabled on error; links /login, /apply, /signup/venue exist; FOUNDING_OFFER_SHORT renders 'First 20 artists: 6 months free'; layout sets noindex.
- [P02] Spaces: /api/venues/demand returns {venues, stats} with every field the page reads and redacts identity for anon/unsubscribed callers (venue-visibility.ts:30-52), matching the blurred-card UI; /api/venue-profile returns {profile} (:18) and /api/artist-works returns {works} (:31); Message -> /artist-portal/messages?artist=&artistName= and that page reads both params (messages/page.tsx:25-27); View walls -> /venues/[slug]#walls and the id exists (VenueProfileBody.tsx:225); inline placement form payload matches placementSchema (null extraWorks.size accepted via optionalString's preprocess, validations.ts:23-26) and the messages schema (senderName/senderType/recipientSlug/content); venue role gets the 'Spaces is for artists' block with /venue-portal/profile and own-venue links; loading, empty ('No venues match these filters' + Clear filters) and paywalled states all reachable; live venue image hosts (images.unsplash.com x5, uwkuhygwvasdzwsusiym.supabase.co x4 per SQL) are both in next.config remotePatterns.
- [P02] Feature requests: GET ?status= values open/planned/shipped/declined match the route's .eq('status'); upvote route exists and returns {upvotes} which the page reads; logged-out upvote -> /login?next=/feature-requests and login reads `next` (login/page.tsx:101); client maxLength attributes (160/4000/40/320) match the schema maxima; submit errors are surfaced; live feature_requests table is empty (SQL: 0 rows) so every tab currently shows the empty state by design.
- [P02] Blog: the five static posts use images.unsplash.com (allowed host), ISO dates, and slugs that generateStaticParams covers; /blog/[slug] links (/browse, /apply, /browse/[authorSlug], /browse/[slug]/[workSlug]) all exist in pages.txt; unknown slug -> notFound; DB post bodies render through renderMarkdown (A32).
- [P09] Role gating for all nine pages: venue-portal/layout.tsx wraps children in PortalGuard allowedType="venue"; logged out -> router.replace('/login') (PortalGuard.tsx:104-106); artist/customer/admin without a venue profile -> info toast + portalPathForRole (113-118); account owning a venue profile admitted via /api/account/roles ownRoles (108-111, roles/route.ts:43-77); unconfirmed email -> 'Verify your email' with resend + sign out (195-237). PortalGuard.test.tsx 15/15 passed.
- [P09] VenuePortalLayout applies the same ownership check (87-99), renders nothing until resolved (163-167), self-heals the venue row via PATCH /api/venue-profile {ensureProfile:true} (119-135) which the route handles at venue-profile/route.ts:77-79, and surfaces self-heal failure with a Retry button (279-290). VenuePortalLayout.test.ts (3) and .test.tsx (2) passed.
- [P09] Every sidebar href in venuePortalNav (portal-nav.ts:103-118) and every internal Link/href on the nine pages resolves to a page in pages.txt: /venue-portal/{profile,messages,placements,offers,walls,walls/new,walls/[id],saved,labels,analytics,orders,settings}, /browse, /browse/[slug], /browse/collections/[id], /pricing, /programmes, /placements/[id], /contact, /account/email, /forgot-password, /venues/[slug], /login, /.
- [P09] Existing jsdom render tests pass: venue-portal/page.test.tsx (3), profile/page.test.tsx (7), settings/page.test.tsx (7), walls/page.test.tsx (1); 23/23 with the layout tests.
- [P09] Dashboard data contract: /api/dashboard venue branch returns profile, orders, sentMessageCount (dashboard/route.ts:129-141); /api/analytics/venue reads ?range and returns totals.qr_scans (analytics/venue/route.ts:52,71,156); /api/stripe-connect/status returns hasAccount/onboardingComplete (status/route.ts:30-40); /api/walls returns {walls, cap} (walls/route.ts:83-87); PROGRAMME_LADDER[0] = {pieces 3, monthlyGbp 79.99} so the promo reads '£79.99 a month for 3 pieces' (curation-tiers.ts:97-98, page.tsx:82-86).
- [P09] Orders page: /api/orders returns orders, userEmail, venueSlug (orders/route.ts:124-130); ?tab=purchases is read (orders/page.tsx:50) inside a Suspense boundary (37-41); OrderStatusTracker props currentStatus/statusHistory/compact match its interface (OrderStatusTracker.tsx:20-26); tracking link uses target=_blank rel=noopener noreferrer (154-158); price interpolations guard typeof number (178-195, 235-239).
- [P09] Placements request form: the exact payload (id, workTitle, workImage '', venueSlug 'self', type 'free_loan', qrEnabled, revenueSharePercent, extraWorks with image '', requestedDimensions undefined) is ACCEPTED by placementSchema for fee 50, fee 0 and revenue-share only (executed probe against src/lib/validations.ts); route requires fromVenue + artistSlug which the page sends (route 361, 414-427; page 665-675); success closes the form and error shows submitError (704-711, 1222-1224).
- [P09] Placements list actions: PATCH {id, status:'active'|'declined'|'cancelled'} ACCEPTED by placementUpdateSchema (probe); DELETE ?id=&unarchive=1 matches route (placements/route.ts:2509, 2552); GET ?archived=1 matches (161, 193); GET emits revenue_earned_gbp and qr_scans (314-317); Decline (721-728) and Cancel (2104-2126, naming the monthly fee at 2110-2117) and Archive (1531-1538) all confirm first; ?payment=setup-complete is acknowledged (919-930); canRespond hides Accept/Decline from the requester and from rows without a requester (placement-permissions.ts:35-58); Accept/Decline disabled only while responding (1664, 1686).
- [P09] Placements deep links carry params their targets read: /venue-portal/messages?artist=&artistName= (messages/page.tsx:12-13), /venue-portal/labels?placement= (labels/page.tsx:54), /placements/[id]?record=open (PlacementDetailClient.tsx:158). Artist picker's 'Messaged' filter relies on otherPartyType, which /api/messages emits (messages/route.ts:241); size picker relies on works[].pricing/dimensions, which /api/browse-artists carries (artist-profiles-transform.ts:216,222; toPublicArtist spreads the rest, public-artist.ts:40-43).
- [P09] Venue Profile page: all 18 PUT body keys (name, type, location, wall_space, approximate_footfall, preferred_styles, preferred_themes, images, interested_in_free_loan/revenue_share/direct_purchase/collections/local_artists, display_wall_space/lighting/install_notes/rotation_frequency) are on VENUE_PROFILE_WRITABLE (writable-fields.ts:135-175) and present in live venue_profiles columns (live-columns.json, 27/27 checked); cleared fields send null not undefined (360-379, test E42-d); success 'Saved' + error toast (383-396); section Cancel reverts (337-349, test E6); unsaved-changes guard via shared hook (318, test E42-e); Save disabled only while saving (429, 732); venue_profiles.name is NOT NULL in prod (live-not-null-no-default.json) so a null name is refused (500 -> toast) rather than blanking the row; uploadImage bucket 'collections' is a valid member of the bucket union (upload.ts:91); public preview links /venues/[slug] exist (413-425, 748).
- [P09] Settings page: contact PUT keys on the allowlist and live; onboard POST sends accountType 'venue' which the route requires (onboard/route.ts:10-12) and both Connect handlers redirect only on a url, toasting otherwise (224-266; tests pass); useNotificationPrefs PATCHes /api/account/preferences per field with optimistic revert and error text surfaced (use-notification-prefs.ts:83-108; settings 437-439); outreach toggle writes user_metadata.accepts_artist_outreach through supabase.auth.updateUser, the key outreach-preference.ts:19-28 reads, with revert + error toast (126-140); AccountDangerZone posts /api/account/delete only when the exact confirm string is typed and the button is disabled until then (AccountDangerZone.tsx:26-49, 73); 'Manage every email category' -> /account/email (test passes); 'Change password' -> /forgot-password matches the codebase convention (account/security/page.tsx:19, 37).
- [P09] My Walls: WALL_VISUALIZER_V1 prodDefault true (feature-flags.ts:52-61) so the walls pages and /api/walls are live in production without the env var; load error banner (149-153), skeleton (155-156) and empty state (157-162) all reachable; cap state is a real disabled <button> with title (121-132); preview_image_url is derived per request from wall_layouts.last_render_id (walls/route.ts:49-75, walls-db.ts getWallPreviewUrls select), so its absence from live walls columns is expected; card links /venue-portal/walls/[id] exist.
- [P09] New Wall: <form onSubmit> posts createWallSchema fields kind/owner_type/name/preset_id|source_image_path/width_cm/height_cm/wall_color_hex (page 174-193; walls/route.ts:104, 144-165); 402 cap surfaced with /pricing link (204-210, 273-286); 400/5xx surfaced inline (211-213, 288-292); layouts POST sends wall_id equal to the URL id as the route demands (226-231; layouts/route.ts:80-83); upload-photo MAX_BYTES 15 MB matches 'up to 15 MB' (upload-photo/route.ts:67; page 443) and accept list matches allowed mimes (page 453; route 72-75); submit disabled only while submitting or, in upload mode, until a photo path exists (542-544); name must contain a letter or number (162-165).
- [P09] Wall editor: GET /api/walls/[id] returns {wall, sourceImageUrl} (walls/[id]/route.ts:82-87); 404 -> 'Wall not found' screen with back link (112-115, 223-240); other errors -> message screen (242-257); layouts GET/POST shapes match (127-163; layouts/route.ts:55-60, 63-149); PATCH is_public_on_profile is accepted (route 90-119); DELETE returns {ok:true} and the page navigates to /venue-portal/walls (192-201) behind a confirm dialog (382-420); ?lid= is read (71).
- [P09] Saved page: Artists tab renders non-seed slugs with a slug-derived name and initial placeholder rather than an empty image (48-68, 181-203); Remove buttons call toggleSaved with the stored type/id (151, 256); /browse?view=portfolios and ?view=collections are read by browse (browse/page.tsx:338); /browse/[slug]?work= is read (ArtistProfileClient.tsx:244).
- [P09] Copy: grep of the nine page files for em/en dashes and &mdash;/&ndash; finds only comments plus the dashboard loading glyph (reported); no US spellings in rendered text (grep for favorite/center/organiz/analyz/behavior/catalog/license/color/gray/canceled matched only classNames and code identifiers); no interpolation on these pages prints undefined/NaN (every money/count path guards typeof or ?? 0).
- [P09] Disabled states on all nine pages are tied only to in-flight flags (saving, submitting, responding, uploading, deleting, savingOutreach, connectRedirecting, bulkBusy) or the wall cap, so no Save can stay disabled forever.
- [P03] All 11 slice pages return 200 to a logged-out GET on https://www.wallplace.co.uk (2026-09-05 curl), /register-venue answers 307 to /signup/venue as coded (register-venue/page.tsx:4)
- [P03] Existing jsdom render tests pass: 9 files, 51 tests (apply/claim 2, ApplyClient 2, login 25, reset-password 3, signup index 5, signup/artist 3, signup/customer 3, signup/venue 4, auth/callback 4) via npx vitest run
- [P03] Supporting route and lib tests pass: apply route 26, register-venue route 18, terms/accept 12, oauth-finalize 12, resend-verification 10, verify-turnstile 8, oauth-sign-state 5, artist-application-row 17, auth-roles 22, safe-redirect 7, signup-destination 4, RedirectIfLoggedIn 4, ApplicationGate 2, ApplicationForm.submit 1 (all green 2026-09-05)
- [P03] /login per role: logged out renders the form; artist, venue, customer, admin and no-type users are replaced to a validated ?next=/?redirect= or portalPathForRole (/admin for admin, /browse for null) at login/page.tsx:79-106; tests cover artist/venue/customer, internal, external and legacy redirect params
- [P03] /login form: precheck body {kind:"login"} matches precheck/route.ts:14; 429 surfaced; signIn via AuthContext.signInWithPassword; "Invalid login credentials" mapped to a friendly message and other Supabase messages surfaced; "Email not confirmed" toggles the resend block whose POST body {email} matches the resend-verification schema (email required, next optional); loading, error and sent states all present
- [P03] /login links: /forgot-password, /signup(+forwarded next, 2 tests), /terms and /privacy all exist in pages.txt; OAuth buttons hidden because OAUTH_GOOGLE_APPLE has prodDefault false and no env override (feature-flags.ts:62-71, vercel-env-names.txt); when on, they post a SIGNUP_ROLES role and validated next to /api/auth/oauth-sign-state (8 tests)
- [P03] /forgot-password: precheck {kind:"forgot-password"} (3 per 5 min), resetPasswordForEmail redirectTo /reset-password, error and success ("sent to {email}") states rendered, button disabled only while loading or with an empty email, both "Back to login" links resolve
- [P03] /reset-password: checking/missing/ready states with retry and auth-event listener (A55, 3 tests); logged-out direct visit gets "Invalid or Expired Link" with a working /forgot-password link; ≥8 chars and match validated; updateUser error surfaced; signed-in roles reach the form because a recovery session is a session, which is the intended case
- [P03] /signup index (async server component, Next 16 searchParams Promise): three role links and the Sign in link forward a safeRedirect-validated ?next= and drop external URLs (5 tests); RedirectIfLoggedIn sends every signed-in role to ?next= or its portal and shows a redirect notice (4 tests)
- [P03] /signup/artist, /signup/customer, /signup/venue: wrapped in RedirectIfLoggedIn; Turnstile verify posts {token} matching verify-turnstile/route.ts:38-47; signUp metadata user_type is a SIGNUP_ROLES value; emailRedirectTo carries the validated next (3 tests each); terms POST bodies match termsAcceptSchema field names and enum; destination via signupDestination (session → next, else /check-your-inbox; 4 tests); submit disabled until every required checkbox is ticked and a token exists; client dev-bypass and server no-secret bypass are consistent so the buttons enable in production today
- [P03] /signup/venue form ↔ registerVenueSchema: all 14 schema fields are sent with matching names and types (venueName, venueType, customVenueType, contactName, email, phone, addressLine1, addressLine2, city, postcode, wallSpace, artInterests[], message, hearAbout); the route folds customVenueType into message (A43) and surfaces its 400/500 bodies through data.error at page.tsx:166-170; duplicate registrations are silent by design (E36d, tested)
- [P03] /signup/venue copy "paid shortlists from £49" matches CURATION_TIERS.single_wall.priceGbp = 49 (curation-tiers.ts:66)
- [P03] /apply: ApplyClient hides banner and sidebar after submit (2 tests); FOUNDING_OFFER_SHORT and foundingOfferLine() come from pricing.ts; ApplicationGate shows a loading hint, replaces logged-out visitors to /signup/artist?next=/apply(+query) (ApplicationGate.tsx:56-67), shows venue/customer a sign-out-then-signup CTA that breaks the old redirect loop (A49 test), and renders the form for artists and legacy no-type users
- [P03] /apply ApplicationForm ↔ applySchema: every posted field is accepted (name/email/location required and pre-checked client-side; discipline enum guarded by the client pre-check; traderStatus ""|enum; sampleWorkUrls ≤3; acknowledgedCoolingOff boolean); server fieldErrors are mapped inline; ApiError and network errors both render; the success screen renders; primary_medium "" coercion is pinned by artist-application-row.test.ts (17 tests), closing runtime error cluster 2
- [P03] /apply plan cards: £9.99/£24.99/£49.99, "15% platform fee", 2/5/unlimited placements and 8/20/50 works all equal PLAN_PRICES, PLATFORM_FEE_PERCENT, ACTIVE_PLACEMENT_CAP and WORKS_CAP in pricing.ts; "Your first month is free" matches STANDARD_TRIAL_DAYS = 30 and trialOffer(); /terms#cancellation resolves (terms/page.tsx:225 id="cancellation"); /apply/claim and / links resolve
- [P03] /apply/claim: signed-in users are replaced to /artist-portal/profile?welcome=1, which reads welcome (profile/page.tsx:352) and seeds an empty form when no profile row exists (profile/page.tsx:393-405), so a failed profile POST is not a dead end; the signed-out form's POST body keys (name, slug, location, primaryMedium, shortBio, website) are exactly the keys artist-profile/route.ts:165 reads, review_status is server-owned as pending
- [P03] /auth/callback: waits for the session with retries, posts {state} to /api/auth/oauth-finalize through mutate() so the bearer token is attached (api-client.ts:33-45), safeRedirects next with /browse fallback (4 tests), error state offers a working /login anchor; unreachable in production while OAuth is off
- [P03] Copy: no em dashes, en dashes, &mdash; or &ndash; in rendered copy on any slice page, ApplicationGate, ApplicationForm, TermsCheckbox or RedirectIfLoggedIn (grep hits are code comments only); no US spellings in copy (grep hits only class names and the Unsplash URL); interpolations checked ({email} on forgot-password, {form.name} required on /apply, ROLE_LABEL[...] ?? userType on /login) cannot print undefined/NaN/null
- [P03] Live production facts for the funnel: email confirmation is off (last 10 auth.users confirmed 0 s after creation with no confirmation email), so signupDestination sends new users straight to next and /check-your-inbox is not reached today; 4 self-signups on 3 to 5 Sept coincide with the 4 users in the Turnstile bypass error cluster, showing signup completing end to end; artist_application_submitted emails 6 for 6 applications in the last 30 days
- [P03] Turnstile fail-open is coherent client and server side (Turnstile.tsx:61-63, verify-turnstile/route.ts:53-63), logs at error level in production and is already runtime error cluster 1 and owner decision 21; not re-reported
- [P03] /signup/venue's "You're In" success screen (page.tsx:223-248) is unreachable because setSubmitted is never called; the live flow routes through signupDestination instead, so no user impact
- [P03] Absent env vars touching this slice behave as intended: NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE off by prodDefault, NEXT_PUBLIC_SITE_URL is present so resend and apply build links on the configured origin (and the non-www fallback 307s to www anyway)
- [P06] Role gate (all 12 pages, via artist-portal/layout.tsx → PortalGuard): logged out → router.replace('/login') (PortalGuard.tsx:104-106); venue or customer metadata without an artist profile → info toast + redirect to own portal after /api/account/roles answers (lines 108-118, test 'toasts before redirecting a customer'); roles lookup failure fails closed (test 'bounces when the roles lookup fails'); unverified email → 'Verify your email' with working resend to /api/auth/resend-verification and sign-out (tests C1); artist pending → under-review banner + page; approved with subscription none/incomplete → 'Set up billing' banner + page; past_due/canceled → 'Choose Your Plan' gate except on /artist-portal/billing and /settings (lines 130-134, test 'keeps the lapsed-subscription paywall'); rejected → 'Application not approved' with mailto. PortalGuard.test.tsx 15/15 passed today.
- [P06] ArtistPortalLayout: waits for both auth and the /api/artist-profile existence check before rendering (line 237); no profile row → /apply (210-213); failed check → /apply, fail closed (218-226); Logout calls signOut() and PortalGuard's effect then lands on /login; all 17 sidebar hrefs from src/lib/portal-nav.ts resolve to entries in pages.txt (dashboard, profile, portfolio, collections, showroom, messages, enquiries, placements, offers, orders, posts, blogs [flag], saved, labels, analytics, billing, settings).
- [P06] Existing jsdom tests in the slice all pass today: billing/page.test.tsx (6), blogs/page.test.tsx (4), blogs/blogs-flag-gate.test.tsx (4), labels/page.test.tsx (4), messages/page.test.tsx (3), components/PortalGuard.test.tsx (15): 36 tests, 6 files, 0 failures.
- [P06] artwork-requests/page.tsx and artwork-requests/[id]/page.tsx: server components that call redirect('/artist-portal') for every role (owner decision 2026-08-28, parked). Production GET as a logged-out visitor returned the prerendered page (x-nextjs-prerender: 1) carrying a NEXT_REDIRECT payload that the client router follows; the visitor then meets PortalGuard and lands on /login.
- [P06] Blog pages are gated on BLOGS_V1 (blogs/page.tsx:48, blogs/new/page.tsx:10, blogs/[id]/edit/page.tsx:20) and the nav entry is conditional (portal-nav.ts:86); flag-gate tests pass for all three; production GET of /artist-portal/blogs/new returned the not-found page body, so the surface is dormant in prod as the code comments claim. With the flag on: POST /api/blogs body {title, body_markdown, cover_image_url|undefined, featured_artwork_ids} matches createSchema; PATCH body with cover null matches patchSchema (nullable); submit-for-review 422 issues are surfaced via describeSaveError; DELETE /api/blogs/[id] is owner-gated and the list surfaces its failure with role=alert (test 'keeps the row and says so when the delete fails'); /api/artist-works GET exists for the featured picker.
- [P06] Billing: handleSubscribe sends {plan, billing} and /api/subscribe reads body.plan/body.billing (route.ts:22-23), redirects to the returned Stripe URL, and surfaces ApiError messages via toast (test 'surfaces the server error when opening the billing portal fails'); handleManage → POST /api/subscribe/portal whose 404 'No subscription found' reaches the toast; Connect onboard sends {accountType:'artist'} matching the route's check and renders errors inline (role=alert); Connect dashboard → POST /api/stripe-connect/dashboard exists. Trial copy comes from trialOffer() and matches /api/subscribe's trial rule (tests 'opens on Set up billing…', 'states the founding offer…', 'keeps the allowance card once a plan is live'). Annual 'save 17%' arithmetic holds for all three plans (99.99/119.88, 249.99/299.88, 499.99/599.88 → 17). Works caps 8/20/50 in the bullets match WORKS_CAP. Post-checkout ?subscribed=true polls the profile up to 30 s and clears the URL. Referral panel renders only when referral_code is present (tests D9). No button can stay disabled: redirecting/connectRedirecting reset on every failure path.
- [P06] QR Labels: label colour change PUTs {label_theme} to /api/artist-profile; label_theme is on ARTIST_PROFILE_WRITABLE (src/lib/db/writable-fields.ts:81) and deliberately ungated (artist-profile/route.ts:114-118); a failed save keeps the picked colour and toasts with variant 'warn', which ToastVariant permits (ToastContext.tsx:5) (labels tests 3 and 4). Deep-link params venue, venueSlug, works, sizes, size are all read. LabelPreview contains no links or fetches; its buttons are state changes, window.print() and onClose; empty state 'No labels. Close and select some works.'
- [P06] Enquiries: GET and PATCH /api/enquiry exist; PATCH body {id, status} matches the route's validation (id number|string, status pending|handled) and is scoped to the caller's artist_slug; loading ('Loading enquiries...'), load error (server error string or fallback), empty (All tab EmptyState vs 'No enquiries in this category.') and update-error states are all rendered (lines 145-160); a non-artist's 403 'Only artist accounts receive enquiries' is surfaced as loadError; 'Reply by email' builds a mailto with the encoded address and a subject.
- [P06] Collections: POST/PATCH payload keys {name, description, bundlePrice, workIds, workSizes, thumbnail, bannerImage, available} (+id on PATCH) match parseBody in api/collections/route.ts:50-100; DELETE uses ?id= as the route expects; a 402 subscription_required opens UpgradePrompt whose 'See plans' links to /artist-portal/billing (exists); save errors render as formError; Save is disabled only while invalid, saving or uploading, and all three reset; the over-priced-bundle confirm and inline saving hint work off the same arithmetic.
- [P06] Offers page: OffersList filter='artist' → GET /api/offers?role=artist; Accept/Decline PATCH {action} matches patchSchema in api/offers/[id]/route.ts:50-52 and errors render inline; Counter POSTs {artistSlug, workIds, collectionId, amountPence, message, parentOfferId} matching createSchema; Withdraw is behind ConfirmDialog and only toasts success when the server confirmed (E43); the Pay/checkout handler is venue-only, OWNER-GATED and left untouched; 'Paid · order <id>' renders only after the Stripe webhook sets paid_order_id together with status paid (webhooks/stripe/route.ts:389-396). The page's own signed-out redirect effect is unreachable (see finding) but harmless.
- [P06] Messages page: ?venue/?venueName and ?artist/?artistName deep links both feed MessageInbox (3 tests pass). MessageInbox: conversation load checks res.ok and renders 'We couldn't load your conversations.' (lines 306-330, F18); send, compose, delete-conversation, offer response and placement response all surface failures (lines 585-588, 613-616, 628-635, 694-700, 732-741); every href resolves (/browse, /browse/[slug], /spaces, /contact, /faqs in pages.txt); every route it calls exists with the verb used: /api/messages GET (reads ?slug=, route.ts:49) POST PATCH, /api/messages/[conversationId] GET PATCH DELETE, /api/messages/item/[messageId] PATCH DELETE, /api/offers/[id] PATCH, /api/offers/[id]/checkout POST, /api/placements PATCH, /api/browse-artists GET.
- [P06] Analytics: date-range labels map to the range values api/analytics/artist accepts (7d/30d/90d/12m/all); metric cards read analytics?.totals with ?? 0; formatPounds never prints NaN or undefined (format-currency.ts:15-18); the earnings chart always has seven points so points[points.length - 1] is safe; the earnings caption states 'Last 7 months' rather than echoing the range (D6); the 'Upgrade to Premium' link resolves to /artist-portal/billing; the internal <a href='/artist-portal/placements'> resolves.
- [P06] Copy sweep across the 12 pages and the 18 components they render: no em dash, en dash, &mdash; or &ndash; in rendered JSX text (every hit is inside a code comment); British spellings throughout except the billing 'canceled' strings reported above; no placeholder text on live surfaces; no interpolation found that prints undefined/NaN/null on a reachable path.
- [P06] useCurrentArtist's static seed-artist fallback (useCurrentArtist.ts:93-106) cannot surface inside these pages: ArtistPortalLayout renders children only after /api/artist-profile returns a profile row, in which case the hook takes the DB branch.
- [P04] All existing tests in the slice pass: npx vitest run over src/app/(pages)/browse, checkout, curated, orders gives 17 files, 152 tests, 0 failures.
- [P04] jsdom render tests exist for browse/page.tsx (10), browse/collections/[collectionId]/page.tsx (4), checkout/page.tsx (8), checkout/confirmation/page.tsx (10 across two files), curated/success/page.tsx (4), orders/track/page.tsx (2), orders/[id]/page.tsx (dispute-entry.test.tsx, 5); client components ArtistProfileClient (14), ArtworkPageClient (6) and CuratedClient (7) also have tests.
- [P04] Role gating on the artist profile and artwork pages: MessageArtistButton returns null for artists, routes venues to /venue-portal/messages?artist&artistName (read at venue-portal/messages/page.tsx:12-13) and customers/guests to /browse/[slug]?enquiry=1 (read at ArtistProfileClient.tsx:219); PlacementButton returns null for artists, sends non-venues to /register-venue and venues to /venue-portal/placements?artist&artistName (read at venue-portal/placements/page.tsx:368-369).
- [P04] Artwork page CTAs reach real targets: Buy Now / Add to basket call CartContext.addItem then /checkout?backTo (checkout reads backTo through safeRedirect at page.tsx:44-46); venue Request Placement params artist/artistName/work/workImage are all read (venue-portal/placements/page.tsx:368-371); Message the artist routes artists to /artist-portal/messages?artist&artistName (read at :25-27); Make an offer opens MakeOfferModal which sends guests to /login?next= (login reads next at :101), shows an explainer to non-venues and POSTs /api/offers (route exists) for venues.
- [P04] Every internal href in the slice resolves to a page in pages.txt: /browse (view param read at browse/page.tsx:338), /browse/[slug], /browse/[slug]/[workSlug], /browse/[slug]/showroom, /browse/collections/[id], /programmes, /returns, /terms, /contact, /spaces, /signup (reads next via safeRedirect), /signup/customer (reads next at :33), /signup/venue, /apply, /pricing, /register-venue, /venue-portal, /venue-portal/orders?tab=purchases (tab read at :50), /artist-portal, /artist-portal/orders, /artist-portal/placements, /customer-portal, /orders/track, /curated, /curated/[tier] (keys single_wall, full_space, bespoke, programme), /curated/enquiry-sent, /curated/success; in-page anchors #plans, #brief, #curated-content point at ids present in CuratedClient (:536, :728, :406); grep finds no href="#", empty href, or empty/console-only onClick in the slice.
- [P04] Checkout form to route contract: the body {items, shipping, expectedShippingCost, expectedSubtotal, source, venueSlug, venueAttributionToken, fulfilmentMethod, collectionNotes} matches checkoutSchema (validations.ts:377-461) including venueSlug '' via optionalString and blank address fields in collection/collect_venue modes; success redirects to Stripe (page.tsx:533-542) and 409, other non-2xx and network failures each render the alert banner (:489-553).
- [P04] Curated brief form to route contract: CuratedClient's body matches curationSchema (src/app/api/curation/route.ts:19-51; tier enum includes programme; placementMethods enum matches); the 400 'Please complete the required fields' is displayed (client :287-291); mode 'enquiry' routes to /curated/enquiry-sent and mode 'checkout' redirects to session.url; cancel_url /curated?cancelled=1 renders the cancellation banner (:124, :397-404).
- [P04] Enquiry form: guests and customers POST /api/enquiry, artists and venues POST /api/messages (ArtistProfileClient.tsx:1323-1364); fields match enquirySchema (workTitle null accepted by optionalString); confirmation shows only after mutate resolves and failures toast (tests E43-h and B9/F19 pass).
- [P04] Dispute form on /orders/[id] posts {orderId, category, description} matching /api/disputes schema (category 2-100, description 10-2000); client pre-check at 10 characters; API error message surfaced (:196-201); success panel rendered (:367-375); guests get a mailto fallback (tests pass).
- [P04] Order tracking manual form posts {orderId, email} which /api/orders/track accepts (route.ts:47-76); 404 'No matching order', 400 and network errors render inside the form path (page.tsx:187).
- [P04] /api/orders/[id]/events GET and POST accept either ?t= token or bearer auth and the page's POST body {event_type:'order.delivery_confirmed'} is exactly what route.ts:151 requires; the events response shape {order, events} matches the page's types.
- [P04] /api/checkout/session returns {id, status, amountTotal, lineItems[{name, quantity, amount}]} exactly as the confirmation page's StripeOrder expects; the cart is cleared only on payment_status 'paid' (payment-status.test.tsx B20/B21 pass).
- [P04] curated/success verifies the Stripe session server-side and never claims receipt unless payment_status is 'paid' (page.test.tsx D24, 4 tests pass).
- [P04] Disabled states are correct: checkout submit disabled only while submitting; quantity stepper disabled at 1 and at the stock cap; curated submit disabled until a tier is selected, which a card click or ?tier= sets (CuratedClient.tsx:197-202, :618), so it cannot stay disabled forever; artwork Buy disabled only when per-size stock is 0; browse distance sort option disabled until coordinates exist.
- [P04] Loading, empty and error states exist: checkout 'Loading checkout...' and 'Your bag is empty'; collections 'Loading collection...' and notFound() for a missing collection; browse empty grids ('No artists match these filters.', 'No works match these filters.', 'No collections available yet.'); profile 'No works under this theme.' with a reset button; showroom 'showroom is empty' (ShowroomViewer.tsx:34-42); orders/[id] loading, error and not-found branches; confirmation loading, no_session, error, processing and paid branches.
- [P04] Copy scan: no em dashes, en dashes, &mdash;/&ndash;, US spellings or lorem/TODO placeholders in user-facing text across the 13 pages, their client components and the shared copy modules they render (enquiry-types, curated-tiers, curation-tiers, order-status-labels, arrangement-labels); matches were code comments only.
- [P04] Static assets and image hosts: /images/programmes/how-it-works-conversation.webp, programmes-rotation.webp and curated-measuring-wall.webp exist under public/; images.unsplash.com and picsum.photos are in next.config.ts remotePatterns (:65-68).
- [P04] The 8 live available works with empty pricing labels (all maya-chen) still check out: CartContext.normaliseSize maps a blank size to 'Original' (CartContext.tsx:32, :152-155), and the artwork page's dropdown falls back to the price alone.
- [P04] Order tracking token path is live and configured: ORDER_TOKEN_SECRET is among the 25 production env names; token TTL 90 days; verifyOrderToken is used by both /api/orders/track and /api/orders/[id]/events.
- [P04] Checkout displays and charges from the same calculateOrderShipping helper the API uses (checkout/page.tsx:320-337, src/lib/shipping-checkout.ts), and /api/checkout recomputes and trusts its own numbers (route.ts:757-760).
