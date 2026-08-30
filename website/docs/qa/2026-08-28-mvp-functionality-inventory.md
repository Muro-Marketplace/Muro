# MVP functionality inventory, 2026-08-28

Every individual piece of functionality on the site, enumerated from the code
on `main` (post remediation merge, PRs #66/#67) and assessed for whether it is
the RIGHT functionality for that user and situation. Eight areas, each walked
exhaustively by a dedicated reviewer reading the actual pages, components and
API routes.

**How to read this document**

- Column 1 names one concrete piece of functionality: a button, a form, a
  badge, a gate, a redirect, an email or bell an action triggers.
- Column 2 is the assessment. "Yes" means sound. "FLAG:" means the reviewer
  judged it wrong, confusing, misgated, dead, misleading, or broken by
  construction, with the reason. Judgements are grounded in the code read,
  not in behaviour observed live.
- Column 3 is deliberately EMPTY. It is for the production-testing pass,
  which happens later against the live site.

**Totals**

| Area | Perspective | Rows | Flags |
|---|---|---|---|
| A. Public visitor and auth entry | Visitor, prospective signups | 301 | 58 |
| B. Browse and buy | Buyer | 252 | 31 |
| C. Customer portal and account | User | 133 | 36 |
| D. Artist portal | Artist | 254 | 29 |
| E. Venue portal and curation | Venue | 306 | 38 |
| F. Messaging and placement negotiation | Artist, Venue, User | 228 | 51 |
| G. Admin portal | Admin | 169 | 30 |
| H. Roles, demo, notifications, system | All, incl. User who is also an Artist | 150 | 29 |
| **Total** | | **1,793** | **302** |

A flag is a judgement, not a verdict: some flags are copy problems, some are
dead code, some are real defects. The production pass (column 3) and a fix
round should both work from this list.

---

# A. Public visitor and auth entry

Scope: public marketing pages, legal pages, blog, waitlist, demo, feature requests, newsletter, global chrome (Header, Footer, CookieBanner, DemoBanner, page shell), and the full auth entry surface (login, signup, apply, claim, register-venue, forgot/reset password, OAuth callback) with their backing APIs. Every judgement below is grounded in the source read for this audit. Column 3 is intentionally blank; production testing happens later.

## Global chrome: Header (site-wide) [All users]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Wallplace logo links to / from every page; colour flips white on portal pages and transparent immersive heroes | Yes | WORKS (public pages). Logo anchors to / in the header and footer on every page checked; on the immersive hero the logo computes rgb(255,255,255) at scroll 0 and rgb(26,26,26) after scrolling. Portal colour flip covered in C/D/E. |
| Immersive transparent header on /, /venues, /artists, /about that fades to solid white after 80px scroll | Yes, and /how-it-works is deliberately excluded because its hero is light | WORKS. On / the header computes background rgba(0,0,0,0) at scroll 0 and rgb(255,255,255) after scrollTo(0,300); class list is bg-transparent border-b border-transparent at rest. |
| Logged-out desktop nav: Marketplace (/browse), How It Works, Blog, Spaces | Yes | WORKS. Accessibility tree on / shows navigation "Main navigation" with Marketplace /browse, How It Works, Blog, Spaces, plus Login and Sign Up. |
| Logged-in desktop nav (artist/customer): Marketplace, Spaces; venue variant swaps Spaces for Wallplace Curated and Blog | Yes, venue variant matches the /spaces lockout for venues | WORKS. Signed in as an artist the desktop nav is Marketplace (/browse) and Spaces; signed in as a customer it is the same pair. The venue variant is checked in area E. |
| Inside /browse or /spaces the nav is replaced by marketplace tabs (Galleries, Portfolios, Collections, Spaces); logged-out visitors also get How It Works and Blog tabs; venue users get Curated and Blog instead of Spaces | Yes, tab active-state logic matches what /browse renders for each ?view= value | WORKS (logged out). On /browse the desktop nav is Galleries, Portfolios (?view=portfolios), Collections (?view=collections), Spaces, plus How It Works and Blog. |
| Mobile menu marketplace tabs use only the default or venue tab set, never the public variant, so logged-out mobile users inside the marketplace lose the How It Works and Blog links that desktop shows | FLAG: mobile picks `(userType === "venue" ? venueMarketplaceTabs : marketplaceTabs)` and ignores the public variant, an inconsistency with the desktop logged-out experience | FLAG STANDS. At 390x844 on /browse logged out, the visible mobile overlay lists only Galleries, Portfolios, Collections, Spaces, Login, Sign Up; How It Works and Blog are present only in the hidden desktop nav. |
| More dropdown (logged in only): Curated, How It Works, Blog, About, Contact, FAQs, Pricing, filtered to avoid duplicating the user's primary nav | Yes | WORKS. The More dropdown (artist) lists Curated, How It Works, Blog, About, Contact, FAQs and Pricing, none of which duplicate the artist's primary nav. |
| Saved heart icon links to `<portal>/saved` for the signed-in role | Yes | WORKS. Artist header links /artist-portal/saved (aria-label "Saved"); customer header links /customer-portal/saved. |
| Messages envelope icon with unread badge, polled every 60s from /api/messages/unread; badge caps at 9+ | Yes | WORKS. As the artist the envelope showed badge "1" and GET /api/messages/unread returned {"count":1}; the notifications badge rendered "9+" against 30 rows, so the cap holds. DIFFERS for customers, see the next row. |
| Messages dropdown lists up to 6 conversations fetched from /api/messages?slug=, requiring the user's artist or venue profile slug (tries /api/artist-profile then /api/venue-profile) | FLAG: customers have neither profile, so resolvedSlug stays empty and the dropdown always shows "No messages yet" for customer accounts even when the unread badge shows a count; the customer portal messages page uses a different lookup | DIFFERS, and the flagged symptom is gone by removal. For the artist the dropdown does populate: GET /api/messages?slug=fin-coles returns 16 conversations and the panel lists 6. For the QA-TEST customer account the header renders NO messages envelope at all, so there is no badge-without-list mismatch. Worth noting: the panel shows "No messages yet" for the ~1s before the fetch resolves, so a slow network shows a false empty state. |
| Messages dropdown "Mark all read" optimistically zeroes badge and per-row dots then PATCHes /api/messages {all:true}, best effort | Yes, next poll reconciles | BLOCKED, deliberately. Marking the artist's inbox read would destroy the unread-message evidence area F depends on; the identical PATCH pattern is proven on the notifications bell in the row below. |
| Messages dropdown row click routes to `<portal>/messages?artist=<slug>&artistName=` | Yes | WORKS. Clicking a venue row from the marketplace routes to /artist-portal/messages?artist=the-copper-kettle-demo&artistName=The%20Copper%20Kettle. |
| "View All" and "Open Full Inbox" links to the portal messages page | Yes | WORKS. Both "View All" and "Open Full Inbox" render in the artist messages dropdown. |
| Notifications bell with unread badge from /api/notifications; dropdown lists up to 12 rows with per-type icons | Yes | WORKS. Bell badge showed 9+ and the dropdown listed rows with distinct titles and dates (QR scan digest, paid loan started, live on wall, install date set, counter offer, artwork sold). |
| Notifications "Mark all read" optimistic then PATCH /api/notifications {all:true} | Yes | WORKS, and it persists. Clicking Mark all read fired PATCH /api/notifications {"all":true} -> 200 {"success":true}, the 9+ badge cleared immediately, and after a full page reload the badge was still empty. No silent no-op. |
| Notification row click marks the row read (skips ids starting msg-) and navigates to row link or a type-derived fallback (messages, orders, placements, portal home) | Yes, the fallback avoids dead clicks on legacy rows | WORKS. Row links are type-correct: qr_scan_digest -> /artist-portal/analytics, paid_loan_started -> /artist-portal/placements, placement_* -> /placements/p-1787927775352-gbjb, offer rows -> /artist-portal/offers, sale rows -> /artist-portal/orders. |
| Portal label link (Artist Portal / Venue Portal / My Account) to the portal home, plus a chevron dropdown mirroring the full portal sidebar per role | Yes | WORKS. "Artist Portal" links /artist-portal and the chevron (aria-label "Portal menu") opens the full sidebar: profile, portfolio, messages, enquiries, placements, offers, collections, saved, orders, labels, posts, blogs, analytics, billing, settings. Customer shows "My Account" -> /customer-portal. |
| "Switch to X portal" entries (from /api/account/roles when the same email has other roles) sign the user out and push /login?email=...&hint=role | FLAG: the login page reads ?email= but nothing ever reads ?hint=, so the target role is dropped; the user must know to enter the other account's password, and nothing on /login explains which account they are switching into | BLOCKED. GET /api/account/roles returns {"roles":["artist"]} for the artist and {"roles":["customer"]} for the QA-TEST customer, so no switch entries render on any account available. The ?hint= half of the flag is separately FIXED, see the /login row. |
| Logout button calls signOut() | Yes | WORKS. Logout clears localStorage['sb-uwkuhygwvasdzwsusiym-auth-token'] and lands on /login; reloading /artist-portal afterwards redirects back to /login. |
| Logged-out CTAs: Login link and Sign Up button | Yes | WORKS. / renders link "Login" to /login and link "Sign Up" to /signup for anonymous visitors. |
| CartIndicator rendered for all users including logged out | Yes, guest carts are a normal marketplace pattern | WORKS. The indicator is hidden while the cart is empty (which is why it is absent for a guest, artist and customer at rest) and appears as soon as an item is added, as <a href="/checkout" aria-label="Shopping cart: 1 item">. Verified as a signed-in customer. |
| Mobile hamburger opens overlay menu with nav links, portal link, More links, Messages (with badge) and Notifications links, Logout or Login/Sign Up | Yes | WORKS. At 390x844 signed in as the artist, the overlay shows Marketplace, Spaces, Artist Portal, the More links (Curated, How It Works, Blog, About, Contact, FAQs, Pricing), Messages with its badge, Notifications with its badge, and Logout. Notifications being reachable on mobile is the wave-4 fix holding. |
| Dropdowns close on outside click and on route change | Yes | WORKS. Opening the notifications dropdown then clicking the page body closes it; opening it and navigating to /spaces also closes it. |

## Global chrome: Footer (site-wide) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Brand column with logo link to / and one-line description | Yes | WORKS. Footer brand column links / and carries "The curated art marketplace connecting artists with commercial spaces." |
| Mailing list block "Be first to see new works" with NewsletterForm (source "footer") | Yes | WORKS. Submitting the footer form posted {"email":"...","source":"footer"} to /api/newsletter -> 200 {"ok":true} and the inline success "Thanks, you're on the list." replaced the field. |
| Instagram link to https://instagram.com/thewallplace, new tab with rel noopener | Yes | WORKS. Anchor is target="_blank" rel="noopener noreferrer" to https://instagram.com/thewallplace. |
| For Artists column: Apply to Join (/apply), Pricing, Artwork Requests (/artwork-requests), Browse Venues (/spaces), FAQs | Yes, all routes exist | DIFFERS. Column now reads Apply to Join, Pricing, Browse Venues, FAQs. The Artwork Requests link is gone and /artwork-requests 307s to /spaces (the parked state). |
| For Venues column: Discover Art (/browse), Register Your Venue (/signup/venue), Wallplace Curated (/curated), How It Works, FAQs | Yes | WORKS. Discover Art /browse, Register Your Venue /signup/venue, Wallplace Curated /curated, How It Works, FAQs all present and resolving. |
| Company column: About, Blog, How It Works, Sustainability, Partner with us, Contact, Complaints, Terms, Artist Agreement, Venue Agreement, Privacy, Cookies, Returns and Refunds, IP Policy | Yes, complete legal set, all routes exist | WORKS. All 14 links present; each resolves 200 (checked About, Blog, How It Works, Sustainability, Partners, Contact, Complaints, Terms, Artist Agreement, Venue Agreement, Privacy, Cookies, Returns, IP Policy). |
| Copyright line with current year | Yes | WORKS. Footer renders "© 2026 Wallplace. All rights reserved." |

## Global chrome: Cookie banner (site-wide) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Banner appears after 300ms when no stored choice; copy says "We use essential cookies to make this site work" with a link to /cookies | Yes on the copy, essential-only is what the cookie policy claims | WORKS. Banner renders with "We use essential cookies to make this site work. See our cookie policy." linking /cookies. |
| Accept button stores "true" in localStorage key `wallplace-cookie-consent` and hides banner | Yes | WORKS. Clicking Accept writes localStorage['wallplace-cookie-consent']='true' and hides the banner; document.cookie stays empty. |
| Decline button stores "false" and hides banner | FLAG: nothing anywhere reads the stored consent value except the banner itself, and the site sets no non-essential cookies to decline, so Accept and Decline are functionally identical; for an essential-only site a single "OK" dismiss would be honest, and offering a Decline that changes nothing is mildly misleading | FLAG STANDS. Decline writes localStorage['wallplace-cookie-consent']='false' and hides the banner; document.cookie is empty before and after either choice, so nothing behaves differently between Accept and Decline. |
| Choice persists across visits (localStorage) | Yes, though the cookie policy describes it as a 12-month cookie named `wallplace_cookie_consent`, which does not match (see Cookies page section) | WORKS as behaviour, and confirms the mismatch. The value survives reload; clearing the key brings the banner back. It is a localStorage entry named wallplace-cookie-consent with no expiry, not a 12-month cookie named wallplace_cookie_consent. |

## Global chrome: Demo banner (portal pages) [Demo user]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Sticky banner renders only when the signed-in user id matches NEXT_PUBLIC_DEMO_ARTIST_USER_ID or NEXT_PUBLIC_DEMO_VENUE_USER_ID; never renders when unset | Yes, safe default | BLOCKED. No demo session can be established in production: the demo cards link public profiles, /api/demo/login 405s on GET, and neither the artist, customer nor venue account matches a demo user id, so the banner never renders. |
| Copy: "You're touring a demo account, changes aren't saved. Sign up to make it real." | Yes, matches the assertNotDemo write guard on the APIs | BLOCKED. Same reason, the banner never renders. |
| Sign up button links /signup?next=<current path> | Yes | BLOCKED. Same reason. |
| Exit demo signs out and hard-redirects to / | Yes | BLOCKED. Same reason. |
| Dismiss (multiplication-sign button) hides for the session, returns on reload | Yes | BLOCKED. Same reason. |

## Global chrome: page shell and metadata [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| (pages) layout: skip-to-content link, Header, DemoBanner, main with top padding, Footer (hidden on portal and admin routes), FeedbackBubble | Yes | WORKS. Skip-to-content link, Header, main and Footer render on every (pages) route checked; FeedbackBubble present on /, /about, /pricing but see the legal-route row. |
| Homepage (src/app/page.tsx) sits outside the (pages) group and renders its own Header and Footer, so it has no skip link, no DemoBanner and no FeedbackBubble | FLAG: the skip-to-content accessibility link is missing on the single highest-traffic page; a demo user landing on / also loses the demo banner context | FIXED. / now renders the skip-to-content link, the shared Header/Footer, the FeedbackBubble and the CookieBanner, so it is on the shared shell. |
| Root metadata: title template, description, OpenGraph and Twitter cards pointing at /og-image.png | FLAG: public/ contains no og-image.png (only the Next starter SVGs), so every social share requests a 404 image; the code comment admits this TODO but it is a launch-visible gap | FLAG STANDS, partly narrowed. The homepage og:image now points at a working generated /opengraph-image (200, image/png, 55KB), but its twitter:image and the og:image on every other page (/browse, /pricing, /about checked) still point at https://wallplace.co.uk/og-image.png, which 404s. |
| Root robots: index true | Yes | WORKS. /robots.txt returns 200 and allows /, disallowing only /api/, /admin/, the portals, /checkout/, /email-preview/, /dev/, /demo/, /auth/ and /check-your-inbox/. |
| FeedbackBubble on all public pages except legal routes; Feature request tab posts {entity_type feature_request, title, description, contact_email} and Feedback tab posts {message, rating, contact_email, source_url} to /api/moderation (anonymous allowed), toast "Thanks, we'll have a look." | Yes, though feature requests from the bubble land in moderation_queue while /feature-requests board submissions land in feature_requests, two disjoint pipelines an admin must remember to check separately; worth a note rather than a defect | WORKS, and the two-pipeline note is confirmed. Feature-request tab POSTed {entity_type:'feature_request',title,description,contact_email} to /api/moderation anonymously -> 200 {"status":"ok","id":"e9609e8b-..."} and the row landed in moderation_queue as status pending, not in feature_requests. DIFFERS on placement: the bubble also renders on /returns and /complaints, which the other legal routes exclude. |
| CookieBanner mounted from the root layout so it also covers /waitlist and /email-preview | Yes | WORKS. CookieBanner renders on /waitlist. /email-preview is 404 in production so it cannot be observed there. |

## Homepage (/) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Full-screen hero with background image, WALLPLACE title, strapline | Yes | WORKS. Hero renders img "Gallery interior", h1 WALLPLACE and the strapline "The curated art marketplace for commercial spaces." |
| Hero CTA "Discover Art" links /browse | Yes | WORKS. link "Discover Art" -> /browse in the hero. |
| Hero CTA shows "Sign Up" linking /signup when logged out, or the role's portal label linking the portal when logged in | Yes, good state awareness | WORKS logged out: link "Sign Up" -> /signup renders beside Discover Art. Logged-in variant covered in H. |
| Demo funnel line "Just looking? Browse a demo artist or venue account" links /demo, hidden when logged in | Yes | WORKS. "Just looking? Browse a demo artist or venue account" with the anchor on /demo renders for anonymous visitors. |
| "Scroll to see more" button smooth-scrolls to the content sections | Yes | WORKS. button "Scroll to see more" is present and focusable in the accessibility tree below the hero. |
| Trust bar (desktop only): "40+ Curated Artists, 90+ Original Artworks, 20+ Active Venues" style counts computed by bucketing the static seed files artists.ts and venues.ts | FLAG: counts come from the static seed, not the live database, and /api/stats/public (built for exactly this) has zero callers; DB-only artists never show up in these numbers, so the trust bar can drift from reality in either direction | FLAG STANDS. Live trust bar reads 30+ / 230+ / 20+ while /api/stats/public returns 14 artists, 35 artworks, 9 venues, and no request to /api/stats/public appears in the homepage network log. Overstates by roughly 2x, 6.5x and 2x. |
| Trust bar tagline "No AI art. Every artist reviewed." | Yes, consistent with the application flow | WORKS. Renders "No AI art" and "Every artist reviewed". |
| For Venues section: three arrangement cards (Revenue Share, Paid Loan "Pay the artist a monthly fee", Direct Purchase) | Yes, matches the canonical paid-loan semantics from the arrangement-labels remediation | WORKS. Three cards render: Revenue Share, Paid Loan "Pay the artist a monthly fee to display the work on your wall.", Direct Purchase. |
| For Venues CTAs: "Discover Art" (/browse) and "REGISTER YOUR VENUE" (/signup/venue) | Yes | WORKS. Both links present with the stated hrefs. |
| "Professional curation services also available" link to /curated | Yes, route exists | WORKS. "Professional curation services also available →" -> /curated, which returns 200. |
| For Artists section: grid of 6 seed artists linking /browse/<slug>, bullets including "5 to 15% platform fee" | Yes, fee range matches pricing | WORKS. Six artist tiles link /browse/james-okafor, priya-sharma, tom-hadley, sofia-ruiz, kai-williams, elise-moreau; bullet reads "5 to 15% platform fee. No gallery taking 50%." |
| For Artists CTAs: "Apply to Join" (/apply) and "LEARN MORE" (/artists) | Yes | WORKS. Apply to Join -> /apply, LEARN MORE -> /artists. |
| How Wallplace works section: 3 steps per side plus Register Your Venue and Apply to Join CTAs | Yes, venue step 03 "Display art for free with optional revenue share, or purchase outright" omits paid loan but the section above covers it | WORKS as described, and the venue step 03 omission is real: "Display art for free with optional revenue share, or purchase outright", no paid loan. |
| Testimonials section: three named quotes (Eloise Bramley of The Copper Kettle, Tomi Okafor, David Chen of Roots and Vine) with roles and Venue/Artist badges | FLAG: the source comment says these names and roles are placeholders to be replaced "as real quotes land", i.e. they are invented people and venues presented as genuine customer testimonials; on a pre-launch marketplace this is materially misleading (The Copper Kettle is also the seeded demo venue name) and should be removed or clearly marked illustrative before launch | FIXED. The testimonials section is gone from the rendered homepage. Greps for Eloise Bramley, Tomi Okafor, David Chen, "Copper Kettle" and "Roots and Vine" all return nothing. |
| Venue demand section: "See Venue Demand" (/spaces) and "Apply to Join" (/apply) over a photo | Yes | WORKS. "See Venue Demand" -> /spaces and "Apply to Join" -> /apply under heading "Venues are looking for art right now". |
| Final CTA: three cards (Venues to /signup/venue, Artists to /apply with "First month free. From £9.99/month.", Customers to /signup/customer) | Yes, pricing claims match /pricing | WORKS. Three cards render with /signup/venue, /apply ("First month free. From £9.99/month.") and /signup/customer. |
| Curated banner image strip "Curated, not crowded." | Yes | WORKS. Strip renders "Curated, not crowded." and "Every artist personally reviewed. No AI art." |
| Unused sub-components NavCard, DealCard, ValueBlock defined at the bottom of the file with zero usages | FLAG: dead code, harmless but should be culled | BLOCKED. Dead code in the source is not observable from production; nothing on the rendered page corresponds to it. |

## About (/about) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Hero, story, curation process (Application, Review, Onboarding), values, Original Work Only (no AI art) sections, all static | Yes | WORKS. All sections render: hero, story, Application/Review/Onboarding, What We Believe, Original Work Only. |
| For Artists CTA "Apply to Join" (/apply) | Yes | WORKS. Apply to Join -> /apply. |
| For Venues CTA "Get Art for Your Space" (/venues) | Yes, route exists | WORKS. "Get Art for Your Space" -> /venues, which returns 200. |
| Onboarding copy "We handle everything from there" versus the same page's earlier "Delivery and installation are arranged directly between the artist and the venue" | FLAG: mildly contradictory within one page; the rest of the site is consistent that logistics are the artist's job, so "we handle everything" oversells | FIXED. The Onboarding step now reads "Accepted artists work with us to photograph their portfolio, set pricing, and get matched with suitable venues. From there you and the venue arrange the details together." The "we handle everything" claim is gone and the page is internally consistent. |

## For Artists (/artists) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| VenueArtistToggle pill (For Venues to /venues, For Artists to /artists) floating over the hero | Yes, active state also treats /how-it-works as the venue side which matches that page's default tab | WORKS. The pill renders over the hero with For Venues -> /venues and For Artists -> /artists. |
| Immersive hero with "APPLY TO JOIN" (/apply) and "Applications reviewed within 5 business days." | Yes on the CTA; see the /api/apply section for the 3-day email contradiction | WORKS. Hero renders APPLY TO JOIN -> /apply with "Applications reviewed within 5 business days." |
| Banner strip: "1 month free trial, Cancel anytime, From £9.99/mo" | Yes | WORKS. Banner strip renders the three claims. |
| ScrollButton "See what you get" scrolls to the guide | Yes | WORKS. Clicking "See what you get" scrolled the window from 0 to 900px, landing on the guide. |
| ArtistGuide value blocks (venue demand, curation, storefront, visibility, "5 to 15%" fees, QR checkout) | Yes | WORKS. All six blocks render: venue demand, curation, storefront, visibility, the 5 to 15% fee line and QR checkout. |
| The Process pipeline (Apply, Get Accepted, Choose Plan, Get Discovered, Get Placed and Sold) | Yes | WORKS. The pipeline renders as Apply, Get Accepted, Choose Plan, Get Discovered, Get Placed & Sold. |
| ArtistPricingCards with Monthly/Annual toggle; annual shows floored per-month equivalent, "billed annually" line and Save 17% chip; all card CTAs go to /apply | Yes, the floor-rounding keeps the equivalent honest and 99.99 vs 119.88 is 16.6 percent, fairly rounded to 17 | WORKS. Toggling Annual switches Core £9.99 -> £8.33/mo with "£99.99 billed annually", Premium £24.99 -> £20.83 (£249.99), Pro £49.99 -> £41.66 (£499.99); SAVE 17% chip shown. All per-month figures are floored, so none overstates the saving. |
| Value anchoring table (gallery hire, art fair, Instagram promo versus Wallplace Core £9.99) | Yes | WORKS. The anchoring table renders gallery hire, art fair and Instagram promo against Wallplace Core £9.99. |
| Comparison table (fees, display, logistics, cost, audience, curation) | Yes | WORKS. Rows present for Platform fee, Display, Logistics, Cost, Audience and Curation. |
| FAQ accordion: "We provide feedback on every application. You're welcome to reapply after three months. Many successful artists are accepted on their second application." | FLAG: "many successful artists are accepted on their second application" is a fabricated track-record claim on a pre-launch product; the feedback-on-every-application promise also needs the admin flow to actually send feedback | FIXED. The FAQ now reads "We give feedback where we can, and you're welcome to reapply after three months." The fabricated second-application claim is gone and the feedback promise is hedged. |
| FAQ: "most of our artists use Parcelforce, DHL, or specialist art couriers" | FLAG: invented usage statistics about a user base that does not exist yet; rephrase as recommendations | FIXED. No mention of Parcelforce, DHL or any courier usage statistic remains on /artists. |
| FAQ: payment "within 14 days via bank transfer" | FLAG: /faqs says funds are held until delivery is confirmed or 14 days pass without dispute, then transferred; the two descriptions overlap but read differently, pick one wording | FIXED. /artists now uses the same mechanics as /faqs: "funds are held until the artwork is confirmed delivered (or 14 days pass without a buyer dispute, whichever comes first)". |
| FAQ: image protection claims (reduced resolution, right-click disabled, no drag or select) | Yes, ArtworkImageViewer and ArtworkThumb do implement contextmenu/drag blocking | WORKS. On /browse/fin-coles/mt-fitz-roy the image is served through the Next optimiser at w=750&q=75 (natural 700x466, so downscaled), carries draggable="false", computes user-select: none and pointer-events: none, and a dispatched contextmenu event is preventDefault'd. |
| Venue demand banner with two CTAs "SEE VENUE DEMAND" and "SEARCH BY POSTCODE" | FLAG: both buttons link to the same /spaces URL; two differently-labelled CTAs to one destination is confusing, either point the second at the postcode input anchor or drop it | FLAG STANDS. Both CTAs still resolve to href="/spaces": "SEE VENUE DEMAND" and "SEARCH BY POSTCODE". |
| Final CTA "APPLY TO JOIN" with "First month free. Membership from £9.99/month." | Yes | WORKS. Final CTA renders as described. |

## Galleries redirect (/galleries) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Server redirect to /browse?view=gallery | Yes, /browse treats view=gallery the same as the default Galleries view | WORKS. GET /galleries -> 307 to /browse?view=gallery. |

## Spaces (/spaces) [Visitor, Artist, Venue, Customer]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Hero with postcode search: input uppercases as you type, Enter or Search geocodes via geocodePostcode, error "Postcode not found, try again" on failure | Yes | WORKS. Typing "tw12 2th" uppercases the input to "TW12 2TH"; Search geocodes via api.postcodes.io and the header becomes "Showing venues near TW12 2TH". |
| Location persists to the shared localStorage keys used by /browse so a postcode carries across both pages; "clear" resets coords, input, distance and storage | Yes | WORKS. After search, localStorage holds wallplace-postcode="TW12 2TH" and wallplace-coords={"lat":51.417389,"lng":-0.363,...}; "clear" empties both keys, blanks the input, removes the distance pills and restores the full 29-venue list. |
| Distance filter pills (5, 10, 25, 50 miles, All) shown once a postcode resolves; venues sorted by distance with per-card mileage badge | Yes | WORKS. Pills 5/10/25/50/All appear once a postcode resolves; cards carry mileage badges (9.5 mi, 9.7 mi) and 5 mi narrows 29 venues to 9. |
| Walls / Open requests tabs driven by ?view=requests; requests tab renders ArtworkRequestsList | Yes | DIFFERS. There are no Walls / Open requests tabs in production; /spaces?view=requests renders the identical walls grid. Artwork requests are parked and /artwork-requests 307s to /spaces. |
| Venue demand fetched from /api/venues/demand with the auth token so subscribers get the unredacted payload; anonymous callers get the redacted one the blurred cards expect; refetches when the session token resolves | Yes, thoughtful handling of the token-not-ready-at-mount case | WORKS for the anonymous half. GET /api/venues/demand unauthenticated returns 29 venues with name, location, description, image, images, wallSpace, footfall and coordinates all blanked, keeping slug and the three arrangement flags, which is exactly what the blurred cards render. Note /api/outreach/allowance 401s for guests and logs a console error, though the badge correctly renders nothing. |
| Stats strip (Venues, Open to Display, Revenue share, Looking to Buy) computed from the filtered list, using the shared ARRANGEMENT_LABEL | Yes, the K3/E13 label unification is applied | WORKS. Strip renders 29 Venues, 24 Open to Display, 22 Revenue share, 15 Looking to Buy, and the badges use Paid loan / Revenue share / Direct purchase. |
| Venue-type filter pills and arrangement filter pills (All, Display, Revenue share, Purchase) | Yes | WORKS. Type pills All, Café, Restaurant, Hotel, Office, Salon, Gallery, Coworking, Wine Bar; arrangement pills All Arrangements, Display, Revenue share, Purchase. |
| Venue users are blocked from the grid and shown "Spaces is for artists" with Preview my venue page (/venues/<own slug>) and Edit my profile (/venue-portal/profile) | Yes, sensible marketplace hygiene | BLOCKED here, covered in area E with the venue login. |
| Empty state "No venues match these filters" with Clear filters button | Yes | BLOCKED. With 29 venues live and no filter combination reaching zero in the guest view, the empty state was not produced. |
| Subscribe teaser banner for non-subscribed viewers: "Subscribe to see full venue details... Plans from £9.99/month" with View Plans (/pricing) | Yes | WORKS. "Subscribe to see full venue details / Get venue names, contact details, and connect directly. Plans from £9.99/month." with View Plans -> /pricing. |
| Venue card: blurred hero image and "Café in Hackney"-style anonymised title for non-subscribers; full name, gallery, photo count, thumbnails, description and display details (wall, lighting, install, rotation) for subscribers and customers | Yes | WORKS for the non-subscriber half: cards read "Café in Peckham", "Wine Bar in Hackney" etc with no venue name. Subscriber half covered in area E. |
| Whole-card stretched link to /venues/<slug> for everyone except venue users | Yes, kills the dead-click problem the comment describes | DIFFERS. The card link is present for guests but points at the real slug, e.g. /venues/the-copper-kettle-demo and /venues/cork-and-vine, so the venue slug is exposed to unentitled viewers. That is the accepted G-B decision, not a new defect. |
| Arrangement badges from ARRANGEMENT_LABEL (Paid loan for the legacy interested_in_free_loan flag, Revenue share, Direct purchase) | Yes, deliberately mapped per the free_loan-means-paid-loan legacy documented in arrangement-labels.ts | WORKS. Badges render as Paid loan, Revenue share and Direct purchase across the grid. |
| Artist-only "Request a placement" button expands the inline SpacesPlacementRequestForm (work picker plus arrangement) posting to /api/placements; not gated on subscription client-side, the API enforces tier rules | Yes, matches the recorded fix for the silently-hidden CTA | WORKS. As the artist each card shows "Request a placement" and the outreach badge above the grid reads "14 of 15 venue approaches left this week on Pro. Placement requests, first messages and artwork request responses all draw on the same allowance." The expanded form itself is exercised in area F. |
| Success state after sending: "Request sent to <venue>", link "View placement" to /placements/<id>, and "Send another" resets the card | Yes | BLOCKED here. Sending a real placement request is an area F action against a real venue; deferred rather than fired from this page. |
| "Message" button routes to `${userType === "artist" ? "/artist-portal" : "/venue-portal"}/messages?artist=<venue slug>` | FLAG: customers (who pass the canMessageVenues gate) are routed to /venue-portal/messages, a portal they cannot access; the ternary needs a customer branch to /customer-portal | FIXED, by removal. For the QA-TEST customer account /spaces renders full venue details but no "Message" button at all (only "View full profile"), so no customer can be routed at /venue-portal/messages. The artist branch works: it routes to /artist-portal/messages?artist=<venue slug>&artistName=<name>. |
| "Upgrade to Premium to message venues" row (canSeeDetails and not canMessageVenues) | FLAG: dead branch, canSeeDetails and canMessageVenues are the identical expression so this state is unreachable; either remove it or, if messaging is meant to be Premium-gated for Core artists, the gate is wrong | FLAG STANDS as unreachable. The "Upgrade to Premium to message venues" row appears for none of the accounts tested: not the Pro artist, not the customer, not a guest. Nothing observed contradicts the reading that the branch is dead. |
| Non-subscriber card footer "Subscribe to see venue name and connect" linking /pricing | Yes | WORKS. Every non-subscriber card footer reads "Subscribe to see venue name & connect" and links /pricing. |
| Bottom CTA "Apply to Join Wallplace" (/apply) for non-venue viewers | Yes | WORKS. Bottom CTA "Apply to Join Wallplace" -> /apply renders for a guest. |

## Partners (/partners) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Static pitch to multi-site operators: four profile cards, offer bullets, four-step engagement outline | Yes | WORKS. /partners renders the operator pitch, profile cards, offer bullets and the four-step outline. |
| Primary CTA is a mailto to partners@wallplace.co.uk with a prefilled subject | Yes for a pre-launch B2B funnel, the comment records the deliberate mailto-for-now decision; confirm the mailbox exists before launch | WORKS. Primary CTA is mailto:partners@wallplace.co.uk?subject=Wallplace%20Partnership%20Enquiry. Whether the mailbox is monitored is an owner check, not testable from here. |
| Secondary "Use the contact form" link to /contact | Yes | WORKS. Secondary link to /contact present. |
| "We'll come back with a tailored shortlist within five working days" | Yes, plausible commitment, keep it aligned with the contact form's reply promise | WORKS. Copy reads "Tell us about your portfolio of sites. We'll come back with a tailored shortlist within five working days." Note /contact and /faqs both now promise 2 working days, so this page is the outlier at five. |

## Pricing (/pricing) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Hero plus venue aside: browsing free, links to /venues and /curated "managed selection from £49" | Yes, matches the how-it-works venue tab claim | WORKS. Venue aside renders with the /venues link and "managed selection from £49" to /curated, which returns 200. |
| Free-trial banner with CTA "Apply to join, first month free if accepted" (/apply) and "Applications reviewed within 5 business days." | Yes | WORKS. Banner and CTA render as described. |
| ArtistPricingCards (shared component, monthly/annual toggle) | Yes | WORKS. Same shared component as /artists: Monthly/Annual toggle switches £9.99/£24.99/£49.99 to £8.33/£20.83/£41.66 with the annual totals and the SAVE 17% chip. |
| Feature comparison table (works caps, profile tier, visibility, messaging, matching, fees 15/8/5 percent, analytics, support, first month free) | Yes, consistent with the cards and the application form's plan options | WORKS. Table rows present with 15/8/5 percent fees, 8/20/50 work caps, tiered profile, analytics and support; the messaging row is now the outreach allowance (3/6/15 approaches a week). |
| Value anchoring list | Yes | WORKS. Value anchoring list renders against Wallplace Core £9.99. |
| "The Pro case" worked example: on a £500 sale Core costs £75, Premium £40, Pro £25 keeping £475 | Yes, arithmetic checks out | WORKS. Copy reads "On a £500 sale, Core would cost you £75 in platform fees, Premium £40. Pro costs just £25, keeping £475." 15/8/5 percent of £500 is exactly 75/40/25. |
| "Apply for Pro" button links plain /apply | FLAG: the application form defaults selectedPlan to core and nothing carries the Pro intent through, so a user who clicked "Apply for Pro" lands on a form with Core preselected; pass a plan query param and preselect it | FIXED on the link half. The button now points at /apply?plan=pro rather than plain /apply. Whether the form actually preselects Pro needs a signed-in artist and is carried to area D. |
| Pricing FAQ "What happens when I cancel?": membership active to end of paid period, "We will arrange the return of any artwork currently on display with venues", no cancellation fees | FLAG: contradicts the Artist Agreement and /faqs (30 days written notice, the artist collects their own work within 30 days) and /artists FAQ (artist responsible for collecting); three different cancellation stories across the site, and "we will arrange the return" promises an ops service nothing else supports | FIXED. The FAQ now reads "You can cancel with 30 days' written notice... You collect any artwork on display with venues within 30 days of cancelling... No cancellation fees." That matches /faqs and the Artist Agreement; the "we will arrange the return" promise is gone. |
| Final CTA "Apply to join, first month free if accepted" | Yes | WORKS. Final CTA renders and links /apply. |

## How it works (/how-it-works) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Tabbed hero (For venues, For artists, For customers) with proper tablist/tabpanel ARIA; selected tab drives both the 3-step summary and which deep guide renders below | Yes, nice pattern | WORKS. Three elements with role=tab, aria-selected and aria-controls to hiw-panel-venue / hiw-panel-artist / hiw-panel-customer; clicking each swaps both the 3-step summary and the CTA block. |
| Venue tab CTA "Register your venue" (/signup/venue) plus secondary "Or explore Curated, a managed selection from £49" (/curated) | Yes | WORKS. "REGISTER YOUR VENUE" plus "Or explore Curated, a managed selection from £49". |
| Artist tab lede "We accept around half." | FLAG: invented acceptance-rate statistic for a platform with no application history; same claim appears on /apply ("We accept roughly half"), soften or ground it | FIXED. The artist lede is now "Apply to join Wallplace's curated roster. Every application is reviewed personally. Accepted artists get their first month free, then choose any tier." No acceptance-rate claim remains. |
| Artist tab CTA "Apply to join, first month free if accepted" (/apply), secondary "See pricing" (/pricing) | Yes | WORKS. "APPLY TO JOIN, FIRST MONTH FREE IF ACCEPTED" and "See pricing". |
| Customer tab lede "browse hundreds of storefronts online" | FLAG: the seed catalogue is roughly 40 artists and the live DB smaller; "hundreds" is an order-of-magnitude overclaim repeated on /customer ("hundreds of independent artists") | FIXED. Customer lede now reads "browse a growing roster of artist storefronts online"; the word "hundreds" appears nowhere on the site. |
| Customer tab step "Every piece comes with a certificate of authenticity from the artist" | FLAG: no certificate-of-authenticity feature exists anywhere in the codebase (no generation, no order attachment, no artist obligation in the Artist Agreement); this is a concrete buyer promise the product cannot currently keep, also made in CustomerGuide ("Every sale ships with a signed certificate") | FIXED. The customer steps are Discover / Buy / Receive with no certificate claim; /customer now says "Want a signed certificate of authenticity? Ask the artist before you buy.", which is an accurate description of an artist-to-buyer arrangement. |
| Customer tab CTA "Browse artwork" (/browse), secondary "Learn more for customers" (/customer) | Yes | WORKS. "BROWSE ARTWORK" and "Learn more for customers". |
| Venue tab step 03 "Display work for free with an optional revenue share on sales, or purchase pieces outright" | FLAG: omits the paid loan arrangement that the homepage, /spaces and the application form treat as a first-class option; venues reading only this page get an incomplete picture | FLAG STANDS. Venue step 03 still reads "Display work for free with an optional revenue share on sales, or purchase pieces outright for your permanent collection." Paid loan is still missing from this page. |
| Scroll affordance anchor to #hiw-detail, then VenueGuide / ArtistGuide / CustomerGuide render per selected tab | Yes | WORKS. The scroll affordance is present and the guide below the fold changes with the selected tab. |

## FAQs (/faqs) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Audience filter tabs (All, For artists, For venues, For buyers) with ARIA roles; General section only on All | Yes | WORKS. Four role=tab controls (All, For artists, For venues, For buyers). All shows 28 questions including the General block; For artists 11, For venues 11, For buyers 3, and the General heading disappears on every non-All tab. |
| Accordion component: one panel open at a time, plus-to-cross icon, max-height raised so long answers with CTAs are not clipped | Yes | WORKS. 28 accordion buttons carry aria-expanded; after clicking one and then another, exactly one is expanded each time. |
| General FAQs (what is Wallplace, how it makes money with fee figures, is it a gallery) | Yes, figures match /pricing | WORKS. What is Wallplace / How does Wallplace make money (Core 15%, Premium 8%, Pro 5%) / Is Wallplace a gallery all present and matching /pricing. |
| Artist FAQ links into /pricing, /apply, /how-it-works, /artist-agreement, /artist-portal/billing, /venue-agreement, /complaints | Yes, all resolve | MOSTLY WORKS. Links resolve to /pricing, /apply, /artist-agreement, /artist-portal/billing, /venue-agreement, /complaints, /terms, /returns, /orders/track and /venue-portal/placements. /how-it-works is not linked from the artist FAQ block in production. |
| Artist FAQ "What happens after my application is accepted": onboarding email within 1 working day, 30-minute onboarding call within the next week, "most artists see their first venue interest in the first 2 to 3 weeks" | FLAG: the onboarding-call promise and the first-interest statistic are unverifiable pre-launch commitments; the call promise in particular creates an ops obligation nobody may own | FIXED. The answer is now "Within 1 working day of acceptance you'll get an onboarding email with a link to set your password, upload your portfolio, and configure pricing + delivery preferences. If you'd like a hand getting set up, reply to that email and we'll help." The 30-minute call promise and the first-interest statistic are both gone. |
| Artist FAQ payout mechanics (Stripe Connect, funds held until delivery confirmed or 14 days, fee plus venue share deducted, email receipt plus daily digest) | Yes, detailed and consistent with the checkout architecture, but keep in sync with the /artists FAQ wording (see that section's flag) | WORKS. The payout answer describes Stripe Connect, funds held until delivery is confirmed or 14 days pass without a dispute, fee plus venue share deducted; /artists now uses the same wording, so the two are in sync. |
| Artist FAQ cancellation: any time with 30 days notice, collect artwork within 30 days | Yes, matches the Artist Agreement; /pricing FAQ is the outlier | WORKS. 30 days notice, artist collects within 30 days, consistent with the Artist Agreement and now with /pricing too. |
| Venue FAQs (cost nothing, enquiry flow with "most artists reply within 48 hours", 2 to 3 week install timeline, install responsibilities, contract link, damage, choosing art, QR sales, rotation, buying) | Yes overall; "most artists reply within 48 hours" and the placement status ladder "Requested to Accepted to Scheduled to Installed to Live" are asserted as fact, verify the status names match the real placement pipeline before launch | WORKS as copy. The status ladder shown is "Requested → Accepted → Scheduled → Installed → Live"; pinned here and checked against the real pipeline in area F. |
| Buyer FAQs: buying overview linking /terms, /returns, /complaints; guest order tracking linking /orders/track; support mailto hello@wallplace.co.uk | Yes, /orders/track exists | WORKS. Buyer answers link /terms, /returns, /complaints and /orders/track (200), with support at hello@wallplace.co.uk. |
| Bottom CTA "Still have questions... we will get back to you within 24 hours" with Contact Us button | FLAG: same 24-hour promise as /contact while the automated acknowledgement email quotes 2 days (see Contact section) | FIXED. Bottom CTA now reads "We are happy to help. Get in touch and we will get back to you within 2 working days.", matching /contact. |

## Sustainability (/sustainability) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Static circular-economy pitch: three cards, narrative sections, what-we-don't-do list | Yes | WORKS. All three cards, the narrative sections and the what-we-don't-do list render. |
| "Where we're going" paragraph contains a stray line break and space before a comma: "the lifetime journey of a work , first studio, first wall" | FLAG: visible copy typo (space before comma) in the rendered page | FLAG STANDS. The rendered paragraph still reads "the lifetime journey of a work , first studio, first wall, first buyer, future loans" with a space before the comma. |
| CTAs "Apply as an artist" (/apply) and "Register your venue" (/signup/venue) | Yes | WORKS. Both CTAs present with the stated hrefs. |

## Complaints (/complaints) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Static policy: routes to complain (complaints@wallplace.co.uk mailto, dashboard Disputes / Request Refund, post) | Yes, confirm the complaints@ mailbox exists | WORKS. mailto:complaints@wallplace.co.uk present alongside the dashboard and postal routes. |
| Response commitments (acknowledge 2 business days, investigate 10, resolution, 6-year records) | Yes | WORKS. Acknowledge 2 business days, investigate 10, resolution and 6-year records all present. |
| Escalation list: senior review, Citizens Advice, CEDR with the honest "not currently a member" caveat, ICO, Trading Standards, courts | Yes, unusually well-drafted | WORKS. Senior review, Citizens Advice, CEDR with the explicit "Wallplace is not currently a member of CEDR" caveat citing the ADR Regulations 2015, ICO, Trading Standards and the courts. |
| Cross-links to /ip-policy and /privacy | Yes | WORKS. Both cross-links present. |
| IP complaints "acknowledge within 1 business day and act on verified claims within 24 hours" | Yes as policy, but it is an ops commitment with no tooling behind it; make sure someone owns the mailbox SLA | WORKS as published policy. Enforcement is an owner/ops commitment, not observable from the site. |

## Contact (/contact) [Visitor] plus /api/contact and /api/enquiry

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Contact form (Suspense-wrapped): Name, Email, "I am a..." select (artist, venue, buyer, commercial, other), Message, all required | Yes | WORKS. Form renders name (text, required), email (email, required), select name=type with options artist/venue/buyer/commercial/other (required), textarea message (required), submit "Send Message". |
| Inline validation message if the type select is empty ("Please pick an option from I am a...") instead of relying on the native tooltip | Yes | DIFFERS. There is no custom inline message. The form is not novalidate, so submitting with the select empty is blocked by the browser and select.validationMessage is the default "Please select an item in the list." No error node appears anywhere in the DOM. |
| Send button posts to /api/contact; API validates via contactSchema, rate limits 5/min/IP, inserts contact_submissions with a generated WP-XXXXXXXX reference | Yes | WORKS. POST /api/contact -> 200 {"success":true} and the row appears in contact_submissions within seconds with a generated reference (WP-62828CC9, WP-BEDB37AF, WP-FA5E9D2D across three submissions). |
| API sends an admin alert email with the submission fields and reference | Yes | BLOCKED for the mailbox side, but the send path is exercised: the API returned 200 and wrote the row. Whether the admin alert arrived cannot be checked without the hello@ inbox. |
| API sends the sender an acknowledgement email ("We've got your message") with the reference, capped per recipient via unverifiedRecipientAllowed to stop reflected-mail abuse, and quoting an expected reply time of 2 days | Yes on the mechanics | BLOCKED for delivery. The API completes and the flagged 24-hour/2-day mismatch is gone from the page side; the email body itself was not read. |
| Success screen copy "Thanks for reaching out. We respond within 24 hours." and the sidebar "Response Time: We respond within 24 hours." | FLAG: the page promises 24 hours while the acknowledgement email the same submission triggers promises 2 days (EXPECTED_REPLY_DAYS = 2); pick one number, they arrive seconds apart | FIXED. Sidebar, form and success screen all read "We respond within 2 working days", which matches EXPECTED_REPLY_DAYS = 2. |
| Reference number is generated and emailed but never returned to or shown in the page UI | FLAG: a sender who mistyped their email gets no reference at all; returning the reference in the API response and showing it on the success screen would cost nothing | FLAG STANDS. POST /api/contact returns exactly {"success":true} and the success screen shows no reference, while contact_submissions.reference is populated for every row. |
| ?artist=<slug> mode: banner "Messaging: <name>" (name looked up from the full /api/browse-artists list), type select hidden, submit labelled "Send Message to <name>" | Yes, though fetching the entire artist list to resolve one name is heavy | WORKS. /contact?artist=fin-coles renders "Messaging: Fin Coles", removes the type select from the DOM, labels the button "Send Message to Fin Coles" and sets the textarea placeholder to "Write your message to Fin Coles...". The only /api/ request on the page is GET /api/browse-artists, so the whole-list fetch is still how the name is resolved. |
| Artist mode double-posts: first to /api/enquiry (creates enquiry row, admin alert, message in the artist's inbox, artist notification email), then to /api/contact | FLAG: the /api/enquiry response is never checked; if the enquiry insert fails but the contact insert succeeds, the sender is told "Your message has been sent to <artist>. They'll be notified by email." when it was not; also the same message lands in both contact_submissions and enquiries by design, which support should know | FIXED. Instrumenting fetch shows POST /api/enquiry then POST /api/contact, both 200, and both rows land in production. Forcing /api/enquiry to 500 changes the success screen to "We have your message for Fin Coles, but we could not notify them automatically. Our team will pass it on...", so the response is checked now. |
| /api/enquiry itself: validates enquirySchema, 5/min rate limit, inserts enquiry, admin alert, writes an anonymous message row into the artist's conversation and sends the unified unread-message email keyed on message id | Yes, the K1/09-2.2 dedupe and truncation fixes are in place | WORKS, with one cosmetic difference. The enquiry row landed (enquiries id 12) and an inbox row was written to messages (sender_type=anonymous, recipient_slug=fin-coles, is_read=false). DIFFERS on naming: messages.sender_name stored as "fcoles2598", the email local part, not the sender's typed name. |
| Sidebar contact details: hello@wallplace.co.uk mailto twice, London UK, Instagram link | Yes | WORKS. Two mailto:hello@wallplace.co.uk links, "London, UK", and the Instagram link. |

## Cookies (/cookies) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Static policy, last updated April 2026, category cards claiming essential-only cookies, no analytics/marketing/functional cookies, server-side hashed analytics | Yes in intent | DIFFERS, in the site's favour. The page has been rewritten, "Last updated: August 2026", and now states "Wallplace currently sets no cookies of its own. Instead we use your browser's local storage". document.cookie is empty on every public page, so the essential-only, no-analytics, no-marketing claims all hold. |
| Cookie table lists sb-access-token (1 hour) and sb-refresh-token (30 days) cookies | FLAG: the app uses plain supabase-js createClient, which stores the session in localStorage; no sb-access-token or sb-refresh-token cookies are ever set by the auth flow (the only sb-* cookie writer is /api/demo/login, and nothing reads it). The policy documents cookies that do not exist while omitting the localStorage session storage that does | FIXED. The table no longer lists sb-access-token or sb-refresh-token cookies. It lists "sb-...-auth-token (local storage)" with the duration "Until you sign out or clear your browser data", which matches the supabase-js localStorage session. |
| Cookie table lists wallplace_cookie_consent as a 12-month cookie | FLAG: consent is actually a localStorage key named wallplace-cookie-consent (hyphens) with no expiry; wrong name, wrong storage mechanism, wrong duration in a legal document | FIXED. The table now lists "wallplace-cookie-consent (local storage)", duration "Until you clear your browser data", citing PECR regulation 6(4). Name, mechanism and duration all match what the banner actually writes. |
| How-to-control section: browser settings guidance and the honest "server-side analytics have nothing to opt out of" card with privacy@wallplace.co.uk contact | Yes | WORKS. The control section and the server-side-analytics explanation are present, with privacy@wallplace.co.uk. |
| Links to /privacy | Yes | WORKS. Link to /privacy present. |

## Privacy (/privacy) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Static policy, last updated March 2026: data collected, uses, sharing, rights, contact privacy@wallplace.co.uk, ICO link, /cookies link | Yes, standard and internally consistent | WORKS. Renders as described, "Last updated: March 2026", with the ICO link and /cookies cross-link. |
| Mailto links to privacy@wallplace.co.uk | Yes, confirm the mailbox exists alongside hello@, legal@, complaints@, partners@, applications@ (six distinct addresses are now promised across the site) | WORKS as links. Five distinct mailboxes are promised site-wide: hello@, legal@, complaints@, partners@, privacy@ (applications@ appears only on the authed /apply success screen). Whether each exists is an owner check. |

## Terms (/terms) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Static terms, last updated April 2026, cross-linking Privacy, Cookies, Artist Agreement, Venue Agreement, Pricing, Complaints | Yes | WORKS. "Last updated: April 2026", cross-links present. |
| Buyer protections: item-not-received dispute flow via dashboard, refund-and-recover-from-artist mechanics, ADR wording mirroring /complaints | Yes | WORKS as published text. The dispute flow, refund-and-recover mechanics and ADR wording are all present; the behaviour behind them is covered in areas C and G. |
| legal@wallplace.co.uk contact | Yes | WORKS. mailto:legal@wallplace.co.uk present. |
| Anchor #cancellation is linked from the application form's cooling-off checkbox ("as set out in the Platform Terms") | Yes, verify the anchor id exists in the rendered terms body so the deep link lands on the right section | BROKEN. /terms carries no id="cancellation"; the only ids on the page are main-content and a React-generated _R_. The cooling-off text is there (section on the Consumer Contracts Regulations 2013) but a /terms#cancellation link lands at the top of the page instead of on it. |

## IP policy (/ip-policy) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Static takedown policy with legal@wallplace.co.uk route and required-information list | Yes | WORKS. Takedown policy renders with the legal@wallplace.co.uk route and the required-information list. |

## Returns (/returns) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Static policy: 14-day cooling off (Consumer Contracts Regulations 2013), bespoke-commission exemption, Consumer Rights Act 2015 faulty-goods rights, dashboard Request Refund flow, refund timelines (reviewed within 5 business days, Stripe refund 5 to 10), CEDR ADR caveat, hello@wallplace.co.uk | Yes, coherent and consistent with /terms and /complaints | WORKS. 14-day cooling off under the Consumer Contracts Regulations 2013, the bespoke-commission exemption, the Consumer Rights Act 2015 section and the CEDR non-membership caveat are all present. |

## Artist agreement (/artist-agreement) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Static agreement supplementing /terms: moral rights, refund-on-behalf and payout set-off, 30-day cancellation by email or account settings, hello@wallplace.co.uk | Yes, this is the canonical cancellation wording the /pricing FAQ contradicts | WORKS. Artist Agreement renders, "Last updated: April 2026", with the moral-rights, set-off and 30-day cancellation clauses. |

## Venue agreement (/venue-agreement) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Static agreement supplementing /terms: care of artwork, liability pointer to terms section 12, legal@wallplace.co.uk | Yes | WORKS. Venue Agreement renders, "Last updated: April 2026", with the care-of-artwork clause and the legal@ route. |

## Blog (/blog) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Force-dynamic index merging curated static posts (data/blog-posts.ts, authored "Wallplace Team") with published DB blogs (status published, newest first, capped 50) plus author resolution from artist_profiles | Yes | WORKS. The index merges 5 static posts (8 April, 3 April, 28 March, 20 March, 14 March 2026) with 2 published DB posts ("QA test blog 2026-08-30 (delete me)" and "teest", both authored Fin Coles). |
| Static post cards: first post spans full width, category badge, date, read time, excerpt, link to /blog/<slug> | Yes | WORKS. First static card spans full width and each carries a category badge (For Venues / For Artists / Industry), date, read time, excerpt and a /blog/<slug> link. |
| DB post cards: optional cover image, date, author name, title, excerpt built from body_markdown.slice(0, 240) | FLAG: the excerpt is raw markdown, so a post starting with "# Heading" or an image reference shows literal markdown syntax on the index | FLAG STANDS. The two DB cards render date, author name, title and excerpt but no category badge and no read time, so they are visibly a different shape from the static cards in the same grid. |

## Blog post (/blog/[slug]) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Static posts render hero image, category, author, date, read time, paragraphs, CTA block (Browse Marketplace, Apply to Join), and two related posts | Yes | WORKS. /blog/why-art-in-commercial-spaces-matters and the other four static posts render hero image, category, author, date, read time and body, with the CTA block at the foot. |
| Unknown slugs fall through to the DB lookup (published only), then notFound() | Yes | WORKS. /blog/qa-test-blog-2026-08-30-delete-me-ngj7rw resolves from the DB and renders; only published rows appear (the index lists exactly the two published DB posts). |
| DB post body rendered by splitting body_markdown on blank lines into plain <p> tags with whitespace-pre-wrap | FLAG: markdown is never parsed, so artist-authored headings, bold, links and images render as literal syntax on the public page; either render markdown properly or rename the field and constrain the editor to plain text | BLOCKED. Neither published DB post contains any markdown syntax (checked body_markdown in the blogs table), so the rendering path cannot be exercised from existing data. The article HTML no longer uses whitespace-pre-wrap, which suggests the renderer changed; re-tested from the artist blog editor in area D. |
| DB post author name links to /browse/<author slug> when resolvable | Yes | WORKS. The DB post renders the author name "Fin Coles". |
| Featured works section: reads blog_featured_artworks in position order, drops deleted works, links each to /browse/<artist>/<work-slug>, shows an Unavailable badge on sold works | Yes, this closes the recorded selection-dropped gap | WORKS. The QA test post renders a "Featured works" block listing Mt. Fitz Roy and Streets of St. Tropez in order. Both currently render with an "Unavailable" state. |
| generateMetadata supplies title/description for both static and DB posts | Yes | WORKS. The DB post's <title> is "QA test blog 2026-08-30 (delete me) | Wallplace", so generateMetadata covers DB posts as well as static ones. |

## Profile design previews (/profile-designs, /dev/profile-designs/[slug]) [Developer]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Both routes render four artist-profile hero design variants from seed or merged data for design comparison | Yes as a dev tool | BLOCKED. /profile-designs returns 404 in production, so the variants cannot be viewed. |
| Both routes call notFound() when NODE_ENV is production | Yes, correctly unreachable in production; consider deleting before launch anyway since they ship in the bundle list | WORKS. /profile-designs returns 404 from production, confirming the notFound() gate. |

## Waitlist (/waitlist) [Visitor] plus /api/waitlist

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Standalone page (own layout, robots noindex/nofollow), unsurfaced from nav, kept for warm prospects with the link | Yes, matches the recorded decision | WORKS. /waitlist renders its own layout with no site header or footer, and carries <meta name="robots" content="noindex, nofollow">. It is not linked from any nav. |
| Artist/Venue toggle; venue choice reveals optional Venue Name and Town or City fields; Name and Email required; Phone optional; submit disabled until name, email and type present | Yes as a form | WORKS. Artist/Venue toggle present; choosing Venue reveals two optional inputs ("e.g. The Corner Café", "e.g. Shoreditch, London"). Name and Email required, Phone optional, and "Join the Waitlist" starts disabled. |
| Submit posts name, email, phone, userType, venueName, venueLocation to /api/waitlist | FLAG: waitlistSchema accepts only name, email and userType; phone, venueName and venueLocation are silently stripped and never stored anywhere, so three of the six fields the page collects are thrown away. Either persist them or remove the fields | FLAG STANDS, proven at schema level. waitlist_signups columns are exactly id, name, email, user_type, created_at. There is no column for phone, venueName or venueLocation, and my venue submission stored only name/email/user_type. |
| API: 5/min rate limit, insert waitlist_signups, duplicate emails return byte-identical success (no membership oracle), confirmation email "You're on the Wallplace waitlist" sent off the response path for fresh signups only | Yes, the E36d anti-enumeration work is done properly here | WORKS. Fresh and duplicate POSTs both return 200 {"success":true} byte-identically and only one row exists for the two calls; a payload missing name/userType returns 400 "Name, email, and user type are required". |
| Success state "You're on the list. We'll be in touch before launch." | Yes | WORKS (API path verified; the browser submit was not repeated to avoid a second row). The success copy renders from the same state the API drives. |
| "Already have access? Sign in" link to /login | Yes | WORKS. "Already have access? Sign in" links /login. |
| Scroll section: how-it-works copy ending "Wallplace is in private beta. Join the waitlist and we'll notify you when we open the doors." with a Join the Waitlist button that scrolls back to the form | FLAG: the private-beta framing contradicts the rest of the site, where /signup, /apply and /signup/venue are all open; a warm prospect who reads this page may wait for an invitation that will never come instead of just signing up. Add a line pointing at the open signup | FIXED. The closing block now reads "Be part of it from day one. Join the waitlist for launch updates. Or don't wait: artist applications and venue registration are already open." The private-beta framing and the wait-for-an-invitation risk are gone. |
| Waitlist artist steps say "Submit your portfolio for review... No AI art" and venue steps mirror the main site | Yes | WORKS. Artist steps read "Submit your portfolio for review. We respond within 5 business days. No AI art." and the venue steps mirror the main site. |

## Newsletter (footer form, /api/newsletter, /api/newsletter/confirm, /newsletter/confirmed) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| NewsletterForm: email input plus Subscribe button, loading state, inline success "Thanks, you're on the list." and inline error display | Yes, the single message for fresh and duplicate subscribes is the deliberate anti-oracle behaviour | WORKS. Footer form renders an email input and Subscribe button on every page; the API contract behind it is verified below. |
| /api/newsletter: validates email, 5/min limit, inserts newsletter_subscribers with a UUID confirm token, duplicate returns identical output, sends double-opt-in confirmation email (link /api/newsletter/confirm?t=..., 7-day expiry stated) capped per recipient | Yes, well built | WORKS. Fresh POST -> 200 {"ok":true}; identical duplicate -> 200 {"ok":true}; invalid address -> 400. DB row created with a UUID confirm_token and confirmed_at NULL. |
| /api/newsletter/confirm: GET with 20/min limit, UUID-validates token, unknown or used tokens land on invalid, enforces the 7-day expiry it advertises, on success sets confirmed_at, clears the token, clears unsubscribed_at, and upserts email_preferences.newsletter_enabled for matching accounts | Yes, expiry claims and enforcement match | WORKS. Confirming with the real token 303s to /newsletter/confirmed?status=ok and the row shows confirmed_at set, confirm_token NULL, unsubscribed_at NULL. Replaying the token, an unknown UUID and a non-UUID all 303 to status=invalid. Note the redirect targets the apex, adding a 307 hop to www. |
| /newsletter/confirmed landing: three states (ok, expired, invalid) driven by ?status=, unknown values treated as invalid, robots noindex, Browse the work CTA | Yes | WORKS. ok / expired / invalid each render distinct copy; ?status=bogus and a missing status both fall through to invalid. robots noindex, nofollow present, and the "Browse the work" CTA renders in all three states. |
| Footer copy "Monthly email with new artists, collections, and venues. No spam." | Yes, aligned with the confirm flow | WORKS. Footer copy matches the double-opt-in behaviour. |

## Feature requests (/feature-requests) [Visitor and logged in] plus APIs

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Board lists requests from GET /api/feature-requests?status= filtered by tab (Open, Planned, Shipped, Closed), sorted by upvotes then recency, capped 100 | Yes | BLOCKED for row behaviour. GET /api/feature-requests?status=open returns 200 {"requests":[]}, so the board is empty in production and there is nothing to sort, filter or cap. |
| Submit idea toggle reveals form: title (3 to 160), description (10 to 4000), optional category, optional email shown only when logged out; success flash then auto-close and reload | Yes | WORKS partially: the Submit-idea form is reachable and the logged-out variant shows the optional email field. Length validation and the success-flash-then-reload path were not driven, to avoid seeding the empty production board. |
| POST /api/feature-requests: 10/min limit, optional auth links user id and email, demo accounts soft-blocked, anonymous allowed | Yes | BLOCKED. Not exercised, for the same reason. |
| The API accepts an optional role field the form never sends | Yes, harmless but the role badge on rows will always be empty for board submissions | BLOCKED. No rows exist on the board to carry a role badge. |
| Upvote button: logged-out click redirects to /login?next=/feature-requests; logged-in click optimistically increments then reconciles from the API's returned count; failures reload the list | Yes | BLOCKED. No rows to upvote. |
| POST /api/feature-requests/[id]/upvote: auth required, demo soft-blocked with 200 {demo:true}, toggle insert/delete with recount written back to feature_requests.upvotes | Yes; note a demo user's optimistic +1 is not unwound because the demo response carries no upvotes field, accepted per the E23a comment | BLOCKED. No rows to upvote. |
| Upvote as a toggle: a second click removes the vote, but the UI button gives no pressed state or label change, so un-voting looks like the count mysteriously dropping | FLAG: expose upvoted state per row (the API returns it) so the toggle is legible | BLOCKED. No rows to upvote. |
| No page metadata (client component without a layout title) | FLAG: minor, the tab shows the root default title | FLAG STANDS. /feature-requests renders with the root default title "Wallplace | Curated Art for Commercial Spaces", not a page-specific one. |

## Demo (/demo) [Visitor] plus /api/demo/login

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Landing explains the two demo accounts; artist resolved from DB via DEMO_ARTIST_SLUG with loud dev failure and visible prod fallback, venue from the static pool | Yes, the K8 loud-failure semantics are preserved | WORKS. The landing resolves the demo artist from the DB (Maya Chen, London, UK) and the venue from the static pool (The Copper Kettle, Peckham); both cards render with their descriptions. |
| When DEMO_ARTIST_EMAIL and DEMO_VENUE_EMAIL are set, both tour cards link /api/demo/login?role=...; otherwise they fall back to the public profile pages /browse/<slug> and /venues/<slug> | Yes as routing logic | WORKS, on the fallback branch. In production both cards link the public profiles, /browse/maya-chen and /venues/the-copper-kettle (both 200), which means DEMO_ARTIST_EMAIL and DEMO_VENUE_EMAIL are unset. DIFFERS in effect: the page sells a portal tour ("SEE IT FROM THE INSIDE", "Tour the artist account") but delivers a public profile page. |
| /api/demo/login: role-validated, next validated through safeRedirect (the E36b protocol-relative fix), 503 JSON when creds unset, signs in with the demo password server-side, 303 redirects to the portal and sets an httpOnly sb-<ref>-auth-token cookie in @supabase/ssr format | FLAG: the app has no @supabase/ssr, no middleware and no server-readable session; the client is plain supabase-js reading localStorage, and nothing in the codebase ever reads the cookie this route sets. The visitor lands on /artist-portal or /venue-portal with no client session and the portal will treat them as logged out. The Phase 2 portal tour cannot work as coded; either adopt the ssr client or return the session to the browser in a form supabase-js can ingest | BLOCKED. The route is unreachable from production: nothing links to it, and GET /api/demo/login?role=artist returns 405 with an empty body. The session/cookie defect the flag describes cannot be observed while the demo tour never routes there. |
| Sign-in failure returns raw JSON 500 to the browser (the card is a plain link, no fetch wrapper) | FLAG: a misconfigured demo password shows the visitor a bare JSON error page instead of a friendly fallback; the 503 path has the same shape when creds are half-set | BLOCKED. Same reason: the failure path is only reachable if the cards linked to the route, which in production they do not. |
| "What you'll see" bullet lists for both tours | Yes | WORKS. "INSIDE THE ARTIST TOUR" and "INSIDE THE VENUE TOUR" bullet lists both render. |
| Final CTAs Apply as Artist (/apply), Register Your Venue (/signup/venue), Sign in (/login) | Yes | WORKS. APPLY AS ARTIST -> /apply, REGISTER YOUR VENUE -> /signup/venue, "Already a member? Sign in" -> /login. |

## Customer landing (/customer) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Immersive hero: BROWSE ARTWORK (/browse) and CREATE AN ACCOUNT (/signup/customer) CTAs | Yes | WORKS. Both CTAs render with the stated destinations. |
| "Or skip the wall and browse hundreds of independent artists online." | FLAG: same order-of-magnitude overclaim as /how-it-works; the catalogue is tens, not hundreds | FIXED. The line now reads "Or skip the wall and browse a growing community of independent artists online." No "hundreds" claim remains anywhere on the site. |
| Guest order tracking line linking /orders/track "no account needed" | Yes, route exists | WORKS. The guest-tracking line links /orders/track, which returns 200. |
| ScrollButton to CustomerGuide, which repeats the certificate-of-authenticity promise ("Every sale ships with a signed certificate from the artist") | FLAG: see the /how-it-works flag; there is no certificate feature in the product | FIXED. The certificate promise is gone. /customer now says "Want a signed certificate of authenticity? Ask the artist before you buy.", which describes an artist arrangement rather than a platform guarantee. |

## Check your inbox (/check-your-inbox) [New signup]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Static explanation that a confirmation link was sent, robots noindex, Go to sign in CTA | Yes | DIFFERS. The page renders correctly, but it is unreachable from a real signup: production creates accounts already confirmed and signs them in, so nobody is sent here. It is disallowed in robots.txt rather than carrying a robots meta tag. |
| "Wrong email? Sign up again... the unverified one expires on its own after 7 days." | Yes as UX copy, but it asserts a Supabase retention setting the codebase cannot enforce; confirm the project actually purges unconfirmed users at 7 days or soften the claim | NOT VERIFIABLE as written, and moot in production. No unverified account can exist: email_confirmed_at is stamped at creation, so there is nothing for a 7-day purge to collect. |
| No resend-verification action on this page | FLAG: the resend endpoint and UI exist only on /login behind a failed sign-in; surfacing a resend link here would save the most common recovery a step | FLAG STANDS but is moot. There is no resend action on the page, and with confirmation disabled no account can be in the unconfirmed state the resend endpoint serves. |

## Email preview (/email-preview, /email-preview/[id]) [Developer]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Server-side allowlist gate: 404 in production (VERCEL_ENV production, or any non-local unrecognised environment), open in preview/dev and localhost; fails closed | Yes, and the B4 rationale for not attempting a client-side admin gate is correct | WORKS. /email-preview returns 404 in production, so the allowlist gate holds. |
| Index: registry listing with stream/persona/category filters, search, counts, per-template links | Yes | BLOCKED. 404 in production by design. |
| Detail: renders the template with mock props to sandboxed iframe HTML plus plain-text fallback, subject, preview text, metadata rows | Yes | BLOCKED. 404 in production by design. |

## Signup hub (/signup) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| RedirectIfLoggedIn wrapper sends signed-in users to ?next= or their portal | Yes | BLOCKED for the logged-in case as a guest; re-tested with a session in area H. |
| Three role cards (Artist to /signup/artist, Venue to /signup/venue, Customer to /signup/customer), each forwarding a validated ?next= suffix | Yes | WORKS. The three cards link /signup/artist, /signup/venue and /signup/customer, and ?next=%2Fbrowse is forwarded to all three. Validation holds: next=https://evil.example.com and next=//evil.example.com are both dropped, while next=%2Fcheckout is forwarded. |
| Venue card copy "Free to display, optional revenue share. Browse and connect instantly." | Yes, though "instantly" glosses over the email-verification step every account must pass | WORKS, and the caveat no longer applies. "Browse and connect instantly" is accurate: production signs a new account in immediately with no verification step. |
| "Already have an account? Sign in" forwarding ?next= to /login | Yes | WORKS. "Sign in" links /login?next=%2Fbrowse. |

## Artist signup (/signup/artist) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Step 1 of the artist funnel: name, email, password (min 8 client-checked), platform ToS checkbox, Turnstile challenge; submit disabled until ToS and token present | Yes | DIFFERS on two counts. Name, email, password (minLength 8) and the ToS checkbox render, but there is no Turnstile challenge in production: zero iframes, zero [data-sitekey] nodes, no Cloudflare script. Ticking the ToS box alone enables Create Account, and the customer form's submit posted the literal sentinel {"token":"dev-bypass"} to /api/auth/verify-turnstile. |
| Turnstile token verified server-side via /api/auth/verify-turnstile before signUp | Yes | DIFFERS, and this is the launch-relevant part. The client sends {"token":"dev-bypass"} and /api/auth/verify-turnstile answers 200 {"ok":true,"bypass":true}; an arbitrary made-up token gets the same answer. TURNSTILE_SECRET_KEY is unset in production, so verification passes anything. |
| supabase.auth.signUp with user_type artist and emailRedirectTo /login?next=<validated next, default /apply> | Yes | DIFFERS. The same Supabase project setting applies to every signup form: confirmation is disabled, so the emailRedirectTo value is never exercised and no verification link is sent (confirmation_sent_at is NULL on the account created this pass). |
| Fire-and-forget POST /api/terms/accept recording platform_tos by email | Yes, though fire-and-forget means a failed record is silently lost; acceptable given the server also has the checkbox-gated submit, but note it | WORKS. The customer form's equivalent call, POST /api/terms/accept, returned 200 {"success":true} and was fired after signUp as designed. |
| On success router.push("/check-your-inbox") | Yes as behaviour | BROKEN. Production routes a completed signup to the portal, not /check-your-inbox. |
| Button and helper copy: heading "we'll take you straight to the application" and footer "You'll go straight to the application form after this." with the button labelled "Continue to Application" | FLAG: the flow actually lands on /check-your-inbox and the user must verify email and sign in before seeing /apply; the file's own comment block still describes an immediate signInWithPassword that the code no longer does. Both the copy and the doc comment promise a straight-through hop that does not happen | FIXED on the wording, but production now undershoots it in the other direction. The copy is honest about intent ("We'll email you a verification link. Verify, sign in, and you'll land on the application form"), yet no verification link is sent at all because confirmation is disabled, so the promised step does not exist. |
| OAuth Google/Apple buttons behind NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE, minting signed state with role artist; disabled state shows "Google and Apple sign-in coming soon." | Yes | WORKS. No OAuth buttons render and the page shows "Email + password only for now. Google and Apple sign-in coming soon." |
| Links: Sign in (/login?next=/apply), Other account types (/signup) | Yes | WORKS. "Sign in" and "Other account types" both present. |

## Customer signup (/signup/customer) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Name, email, password form with the same Turnstile-then-signUp pipeline, user_type customer, emailRedirectTo /login?next=<validated, default /browse> | Yes | DIFFERS, materially. Ran the real signup (QA-TEST Customer, fcoles2598+qatestcustomer@gmail.com). The pipeline fires as described, but production Supabase has email confirmation DISABLED: signUp returned an access_token straight away, auth.users shows email_confirmed_at set at creation and confirmation_sent_at NULL, and the browser landed on /customer-portal already signed in. The emailRedirectTo it sends (/login?next=%2Fbrowse) is never used. |
| Terms acceptance fire-and-forget (platform_tos) | Yes | WORKS. POST /api/terms/accept fired with {userEmail, userType:"customer", termsVersion:"v1.0-2026-04", termsType:"platform_tos"} and returned 200 {"success":true}. |
| On success routes to /check-your-inbox | Yes | BROKEN as described. The signup does NOT route to /check-your-inbox: it lands on /customer-portal, signed in, because Supabase email confirmation is off in production. /check-your-inbox is unreachable from a real signup. |
| OAuth pair behind the same flag with role customer | Yes | WORKS. Same "coming soon" line, no OAuth buttons. |
| Links to /login and /signup | Yes | WORKS. Both cross-links present. |

## Venue signup (/signup/venue) [Visitor] plus /api/register-venue and /register-venue

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| /register-venue is a server redirect to /signup/venue | Yes, keeps old links alive | WORKS. GET /register-venue -> 307 /signup/venue. |
| Long registration form: venue name and type (with free-text "Other" describe field), contact name, email, optional phone, password and confirm, address lines, city, postcode, wall-space dropdown, art-interest toggle pills, free-text message, hear-about dropdown | Yes | WORKS. Every field renders: venue name, venue type combobox (8 options, Other reveals "Please describe your venue type"), contact name, email, optional phone, password + confirm, address lines 1 and 2, city, postcode, wall-space combobox, eight art-interest pills, free-text message and a hear-about combobox. |
| Password rules: min 8 and match check client-side | Yes | WORKS. The password input carries minLength 8; the confirm field relies on the client-side match check. |
| Three required checkboxes: platform ToS, venue agreement, public-liability-insurance acknowledgement; plus Turnstile; submit disabled until all present | Yes | DIFFERS. All three required checkboxes render, but there is no Turnstile challenge in production (zero iframes), so the submit gate is the three checkboxes alone and the token step is the dev-bypass sentinel. |
| "Other" venue type free-text (customVenueType) | FLAG: registerVenueSchema has no customVenueType field, so the description the venue types is stripped by validation and never stored; the record just says "Other" | FLAG STANDS, both halves proven. Choosing "Other" reveals a text input placeholder "Please describe your venue type", and venue_registrations has no column for it (columns are id, venue_name, venue_type, contact_name, email, phone, address_line1, address_line2, city, postcode, wall_space, art_interests, message, hear_about, status, created_at). |
| Submit order: registration record POSTed to /api/register-venue first, then supabase.auth.signUp | Yes broadly; a failed signUp after a successful registration insert leaves an orphan registration row, but the profile is only hydrated on first verified login so the orphan is inert | BLOCKED. Not exercised; completing it would create a real auth account and a venue registration row. |
| /api/register-venue: validates, 5/min limit, inserts venue_registrations status pending, duplicates return byte-identical success (anti-oracle), admin alert plus confirmation email off the response path, and the E34 slug-squatting seed removed | Yes, well remediated | BLOCKED. Not exercised for the same reason. |
| Confirmation email subject "We've received your Wallplace application" | FLAG: venues are not reviewed; the page promises "start browsing immediately, no waiting" while the email frames it as an application under consideration. Reword the email to a welcome/confirm-your-email framing | BLOCKED for the email body, and the page-side contradiction has flipped. Step 01's "Register and start browsing immediately. No waiting." is now ACCURATE, because production creates accounts already confirmed and signs them in. It is the verification copy elsewhere that no longer matches. |
| Terms acceptance fire-and-forget for both platform_tos and venue_agreement | Yes | BLOCKED. Requires a completed signup. |
| On success routes to /check-your-inbox | Yes as behaviour, but the sidebar step 01 says "Register and start browsing immediately. No waiting." which skips the mandatory email verification hop | FIXED in effect, not by edit. The copy still says "Register and start browsing immediately. No waiting.", and that is now what production does: confirmation is disabled, so there is no email-verification hop to skip. |
| Unused submitted-state success screen ("You're In... Your venue is set up and ready to go" with Browse Art and Go to Your Portal CTAs) | FLAG: dead code, setSubmitted is never called; delete or rewire | BLOCKED. Dead state, not reachable from production without completing a registration. |
| Hero aside "Wallplace Curated , paid shortlists from £49." | FLAG: stray space before the comma in rendered copy (the link and comma are split across JSX lines) | FLAG STANDS. Rendered innerText reads "Want us to do the curation for you? Wallplace Curated , paid shortlists from £49." — the space before the comma is visible on the page, not just in the source. |
| RedirectIfLoggedIn wrapper | Yes | BLOCKED for the logged-in case as a guest; covered in area H. |

## Login (/login) [Visitor] plus /api/auth/precheck and /api/auth/resend-verification

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Email and password form; password minLength 6 here versus 8 everywhere else | FLAG: harmless for existing passwords but inconsistent; the signup forms enforce 8 | FLAG STANDS. /login's password input reports minLength 6 while /signup/artist and /signup/venue both report 8. |
| Pre-submit POST /api/auth/precheck {kind login}: in-app IP rate limit (8/min), 429 mapped to "Too many attempts" message; network failure falls through to Supabase | Yes, sensible layered defence | WORKS for the happy path: POST /api/auth/precheck {"kind":"login"} returns 200 {"ok":true} before the sign-in attempt. The 429 mapping was not driven, to avoid locking the IP out of the logins this pass depends on. |
| signIn errors: "Invalid login credentials" mapped to "Invalid email or password", others shown raw | Yes | WORKS. Signing in with a non-existent address and a wrong password renders the inline message "Invalid email or password". |
| Unconfirmed-email detection reveals a resend panel; "Send me a new link" POSTs /api/auth/resend-verification and always lands on the neutral sent state | Yes, matches the endpoint's enumeration-safe contract | BLOCKED, and unreachable in production. No account can be unconfirmed (email_confirmed_at is stamped at creation), so the unconfirmed-email branch and its resend panel cannot be triggered. |
| /api/auth/resend-verification: 3 per 5 min IP limit, single byte-identical acknowledgement regardless of account state, redirect built server-side through safeRedirect | Yes, textbook | WORKS. POST /api/auth/resend-verification for an address that does not exist returns 200 with the single neutral body "If that address needs confirming, we've sent a new link. Check your inbox and spam folder." |
| Already-signed-in visitors get a toast "You're already signed in. Redirecting..." and are sent to ?next= (or legacy ?redirect=) via safeRedirect, else their portal | Yes | WORKS. Visiting /login?next=%2Fbrowse while signed in as the artist redirected straight to /browse without leaving the form up. |
| ?email= prefill for the portal-switch flow | Yes, but see the Header flag: the accompanying ?hint= role is never used | FIXED. /login?email=test%40testingvenue.com&hint=venue prefills the email AND renders "Sign in to your venue account" plus "You have more than one Wallplace account on this email address... use the ones you set up for your venue account." ?hint= is read now. |
| Forgot password link (/forgot-password) | Yes | WORKS. "Forgot password?" links /forgot-password. |
| OAuth Google/Apple behind the flag, minting state with role customer and a "coming soon" line when off; oauth-finalize never demotes an existing role so returning artists keep theirs | Yes | WORKS for the dark state: no OAuth buttons render and the "coming soon" line is shown. The finalize/never-demote behaviour is unreachable while the flag is off. |
| Sign up cross-link forwards a validated ?next= | Yes | WORKS. The Sign up link forwards the validated ?next=. |

## Apply (/apply) [Artist applicant] plus ApplicationGate, ApplicationForm and /api/apply

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Hero copy "We review every application personally. We accept roughly half." | FLAG: invented acceptance rate, same family as the how-it-works claim | FIXED. The hero now reads "We review every application personally. Being accepted means your work has been judged ready for commercial spaces." No acceptance rate is claimed. |
| Founding Artist banner (first month free) and what-we-look-for sidebar with "respond within 5 business days" | Yes | WORKS. The Founding Artist Offer block and "We aim to respond within 5 business days of receiving your application." both render. |
| ApplicationGate: loading state, anonymous visitors replace-redirected to /signup/artist?next=/apply, signed-in artists (or roleless legacy accounts) get the form | Yes | WORKS for the anonymous branch: /apply replace-redirects to /signup/artist?next=%2Fapply. Signed-in branches covered in D and E. |
| Gate's wrong-role notice for venue/customer accounts: "Sign out and create an artist account" with a "Create artist account" button linking /signup/artist?next=/apply | FLAG: the button does not sign the user out, and /signup/artist is wrapped in RedirectIfLoggedIn, which bounces any signed-in user straight back to /apply, where the same notice renders again; the CTA is an infinite loop. It must sign out first (as the copy says) or deep-link a sign-out-and-redirect | FIXED. Signed in as the QA-TEST customer, /apply shows "You're signed in as a customer. The artist application is for individual artists. Sign out and create an artist account to continue." with a BUTTON (not a link) labelled "Sign out and create artist account". Clicking it clears the session and lands on /signup/artist?next=%2Fapply, which stays put. The loop is gone. |
| Form prefills name and email from the auth context once resolved, without clobbering typed drafts | Yes | WORKS. Signed in as Fin Coles the form opened with name "Fin Coles" and email "finbin1@hotmail.co.uk" prefilled; typing over them was not clobbered by a later hydration. |
| About You: name, email, location required; Instagram, portfolio link, three sample-work URL slots, trader status select (consumer or business) with conditional business name and VAT fields | Yes | WORKS as rendered, with one silent-drop finding. Name, email and location are required; Instagram, portfolio link and three sample-work slots render; trader status "business" reveals a business-name field ("e.g. Jane Doe Studio Ltd") and a VAT field ("GB123456789"). DIFFERS: sampleWorkUrls IS posted but artist_applications has no column for it, so the three sample links are discarded exactly like acknowledgedCoolingOff. |
| Email field remains freely editable and /api/apply never checks it against the authenticated user | FLAG: the whole point of auth-gating the application (per the signup/artist doc comment, "reject impersonation, instead of trusting whatever email the form sent") is not enforced; an authed user can file an application, and trigger the acknowledgement email, for any address | FIXED. Posting the form authenticated as finbin1@hotmail.co.uk with email fcoles2598+qaimpersonate@gmail.com returns 403 "Please apply with the email on your account (finbin1@hotmail.co.uk). To use a different address, sign out first." Impersonation is now refused. |
| Your Practice: discipline radio grid (required, prunes sub-styles on change), optional primary medium, sub-style toggle pills, optional artist statement with live word count | Yes | WORKS. The discipline radio grid renders six required options (photography, painting, drawing, sketching, sculpture, mixed); primary medium is an optional 19-option select; the artist statement is optional with a live word count. |
| What You Offer: supply checkboxes (originals, prints, framed, commissions, at least one required), arrangement checkboxes using ARRANGEMENT_LABEL (revenue share, paid loan, purchase, at least one required) with an explainer paragraph matching the canonical semantics, delivery radius select required | Yes | WORKS. Four supply checkboxes (Original works, Prints & reproductions, Framed works, Commissions) and three arrangement checkboxes labelled Revenue share, Paid loan and Direct purchase, plus the required delivery-radius select (8 options). |
| Venue preferences checkbox grid (optional) and hear-about select | Yes | WORKS. Ten venue-type checkboxes plus "Any venue type", and the hear-about select with 7 options. |
| Referral code input (uppercased, max 10) with "they get a free month when you upgrade" | Yes, and /api/apply now persists referred_by_code after the migration-109 fix | WORKS. A submission carrying referralCode "QATESTREF" stored referred_by_code = 'QATESTREF' on artist_applications id 29. |
| Plan picker (Core, Premium, Pro cards, defaults Core) | Yes, but see the /pricing flag: "Apply for Pro" arrives with Core preselected | FIXED for the flagged half. With no query param the Core card carries border-accent and the other two border-border; with /apply?plan=pro the Pro card carries border-accent bg-accent/5 and Core does not. The Pro intent is now carried through and preselected. |
| Consents: platform ToS, artist agreement, insurance acknowledgement all required; consumer trader status additionally reveals a required 14-day cooling-off acknowledgement box linking /terms#cancellation | Yes as UX | WORKS. Three consents render as required checkboxes, and selecting trader status "consumer" adds a fourth: "I acknowledge that I have been informed of my 14-day right to cancel..." linking /terms#cancellation (which, per the terms row, has no such anchor). |
| acknowledgedCoolingOff is posted to /api/apply but applySchema has no such field, so it is stripped and stored nowhere | FLAG: the consumer-rights acknowledgement, the one checkbox whose entire purpose is to be evidenced later, is never persisted; add it to the schema and the row | FLAG STANDS, proven both ways. The posted body contains acknowledgedCoolingOff: true, and artist_applications has no column for it; the stored row carries no trace of the acknowledgement. |
| Client pre-validation mirrors the server, highlights fields, scrolls to the first error | Yes, though the synthetic keys "offers" and "openTo" match no element id or name so the scroll silently no-ops for those two | DIFFERS. The form is not novalidate, so native browser validation fires first: submitting empty produced no POST, no custom error nodes and no scroll, with five :invalid controls reporting default browser messages. The bespoke pre-validation can therefore only ever run for the controls the browser cannot check, which is exactly the offers/openTo groups whose scroll keys the flag says no-op. |
| /api/apply: 5/min limit, optional auth, zod field-error map returned for inline display, single insert (strip-and-retry removed), duplicate emails return byte-identical success with a log line | Yes | BROKEN, and this is the worst finding in area A. Validation and the zod field-error map work (a partial body returns 400 with fieldErrors keyed by field, and a duplicate email returns an identical {"success":true} with no second row). But a VALID application fails: leaving the optional "primary medium" select blank returns 500 {"error":"Something went wrong. Please try again."} and writes nothing. Narrowed by elimination against production: primaryMedium empty -> 500; portfolioLink empty -> 200; artistStatement empty -> 200. Reproduced both signed-in (through the form) and anonymously (curl). The id sequence advanced on each failure, so the insert is attempted and rejected. |
| Profile bridge: for authed fresh applications, creates a pending artist_profiles row with a collision-suffixed slug so the applicant can upload work pre-review; best effort with admin-accept fallback | Yes | BLOCKED for the authed path. The only artist account available already has a profile and an approved application, so a submission from it would not be a fresh bridge case and could disturb real data. The anonymous submissions that succeeded correctly created no profile row (artist_profiles stayed at 14). |
| Admin alert plus applicant receipt email sent off the response path, idempotent per email | Yes on mechanics | BLOCKED for delivery. The successful submissions returned 200 so the send path ran, but the mailboxes were not read. |
| Receipt email passes reviewTimelineDays: 3 | FLAG: every page (apply, artists, pricing, waitlist, success screen) says 5 business days; the email the applicant receives minutes later says 3 days. Align on one number | BLOCKED. The email body was not read. Note the page side is consistent at 5 business days across /apply, /artists, /pricing and /waitlist. |
| Success screen: "Application received... respond within 5 business days", claim-profile CTA block, "I'll do this later" link home, applications@wallplace.co.uk mailto | Yes on layout; but see the claim-page flag below, the CTA points at a broken flow | BLOCKED. Not reached: every submission from the form either 500'd on the empty medium or 403'd on the email check, and a valid authed submission was not run for the reason given two rows above. |

## Apply claim (/apply/claim) [Artist applicant]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Form prefilled from ?email=, ?name=, ?medium=: name, email, new password (min 8), optional one-line bio and website; on submit it signUp()s a NEW auth account, signs in with the typed password, POSTs /api/artist-profile, then routes to /artist-portal/profile?welcome=1 | FLAG: this page predates the auth-gated application and is now wrong end to end. Everyone reaching it via the /apply success screen already HAS an artist account and is signed in (the gate requires it) and already has a pending profile row (the /api/apply bridge creates it). signUp with the same email either errors or returns an obfuscated success; signInWithPassword then fails against an unconfirmed or differently-passworded account and the user is told "Account created, please sign in from the login page", which is false. The page also never checks existing auth state. It should either be deleted or reduced to a signed-in "add bio and website to your existing profile" step | DIFFERS, and the auth-state half of the flag is confirmed. As an anonymous visitor /apply/claim?email=&name=&medium= renders the full create-account form with name and email prefilled from the query string, password minLength 8, optional bio and website. It never checks whether anyone is signed in. The signUp-collision half needs a signed-in applicant and is carried to area D. |
| "Use the same email as your application so we can link them" helper | Yes in intent, moot given the flow above | WORKS. The helper "Use the same email as your application so we can link them." renders under the email field. |
| "Skip for now" link home and "Creating a profile doesn't commit you to a plan" reassurance | Yes | WORKS. "Skip for now" and the no-commitment reassurance both render. |
| Local slugify duplicating src/lib/slugify | FLAG: minor duplication, keep one implementation | BLOCKED. Source-level duplication is not observable from production. |

## Forgot password (/forgot-password) [Visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Email form; precheck {kind forgot-password} rate-limited 3 per 5 min per IP with a friendly 429 message | Yes | WORKS. Submitting an address posts /api/auth/precheck first (200 {"ok":true}) then the Supabase recover call. The 429 path was not driven, to keep the reset flow usable for the rest of the pass. |
| supabase.auth.resetPasswordForEmail with redirectTo /reset-password | Yes | WORKS. The network shows POST https://uwkuhygwvasdzwsusiym.supabase.co/auth/v1/recover?redirect_to=https%3A%2F%2Fwww.wallplace.co.uk%2Freset-password returning 200. |
| Success state "We've sent a password reset link to <email>" shown regardless of whether the account exists | Yes, correct anti-enumeration behaviour even though the copy slightly overpromises for unknown addresses | WORKS. Submitting qa-test-nobody@example.invalid still renders "We've sent a password reset link to qa-test-nobody@example.invalid." |
| Back to login links | Yes | WORKS. "Back to login" links /login in both the form and success states. |
| Layout metadata with robots noindex | Yes | WORKS. <meta name="robots" content="noindex, nofollow"> present on /forgot-password and /reset-password. |

## Reset password (/reset-password) [Recovery-link visitor]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| One-shot getSession() on mount decides between the form and the "Invalid or Expired Link" screen | FLAG: the check runs once and never subscribes to onAuthStateChange, so if the SDK is still exchanging the recovery hash when getSession resolves, a valid link can be shown the invalid-link screen; the OAuth callback page solves this exact race with a retry loop, reuse it here | BLOCKED. Reproducing the race needs a genuine recovery link plus an artificially slow session exchange; producing one against production would mean resetting a real account password. Visiting /reset-password with no recovery hash correctly shows the invalid screen. |
| New password and confirm fields, min 8 with match check; updateUser({password}); errors mapped to "Failed to update password. The link may have expired." | Yes | BLOCKED. Reaching the form needs a live recovery session. |
| Success screen then auto-redirect to /login after 3 seconds | Yes | BLOCKED. Same reason. |
| Invalid state links to /forgot-password | Yes | WORKS. The invalid screen renders "Invalid or Expired Link... Please request a new one." with "Request new link" linking /forgot-password. |
| An already-signed-in user visiting directly can set a new password without the old one | Yes, this is standard Supabase recovery-session behaviour, acceptable | BLOCKED. Not exercised; would change a real account's password. |

## OAuth callback (/auth/callback) [OAuth signup/login] plus oauth-sign-state, oauth-finalize, verify-turnstile

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Waits for the SDK session with a bounded retry (6 x 250ms), then error state with Back to login if none | Yes | BLOCKED. OAuth is dark in production (NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE off), so /auth/callback is never reached. |
| Sends the signed state to /api/auth/oauth-finalize and redirects to the verified next (safeRedirect, default /browse); finalize failure just logs and uses the fallback | Yes | BLOCKED. Same reason. |
| /api/auth/oauth-sign-state: unauthenticated minting restricted to signup roles (admin rejected per E35d), next validated, 503 when the secret is unset | Yes | BLOCKED. Same reason. |
| /api/auth/oauth-finalize: bearer-token auth, HMAC state verify with a second isSignupRole check at the consumer, stamps user_type only when absent (never demotes), creates a pending artist_profiles stub for new artists with slug collision handling, idempotent welcome trigger | Yes, thorough | BLOCKED. Same reason. |
| /api/auth/verify-turnstile: no-secret bypass returns ok with bypass true, logs at ERROR in production so the silent-off failure mode is at least visible; rejects the dev-bypass sentinel when a secret exists; forwards only a trustworthy client IP | Yes, the fail-open trade-off is documented and flagged for owner decision 21; make sure the production env actually has TURNSTILE_SECRET_KEY set or all four signup forms run without bot protection | FLAG STANDS, and it is live and now proven end to end. The real customer signup posted {"token":"dev-bypass"} and received 200 {"ok":true,"bypass":true}; an arbitrary token gets the same. No Turnstile widget renders on any signup form, so all four run with no bot protection. |
| Entire OAuth surface is dark until NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE is flipped; all four auth pages show "Google and Apple sign-in coming soon." meanwhile | Yes, honest gating | WORKS. /login, /signup/artist and /signup/customer all render "Email + password only for now. Google and Apple sign-in coming soon." and no OAuth buttons. |

## QR scan redirect (/api/qr/[slug]) [Walk-in customer]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| GET redirects a printed QR to /browse/<artist>?ref=qr, carrying work title (new t= and legacy work=), preselected size, venue slug and display name | Yes, legacy label compatibility is preserved | WORKS. GET /api/qr/fin-coles?t=Mt.%20Fitz%20Roy&vs=the-copper-kettle&size=A3 -> 302 to /browse/fin-coles?ref=qr&venue=the-copper-kettle&va=...&work=mt-fitz-roy&size=A3. Legacy ?work=&v= -> 302 with ?ref=qr&venueName=Copper+Kettle&work=sand-dunes. Both key sets honoured. The redirect targets the apex, adding a 307 hop. |
| Fire-and-forget analytics: qr_scan event with work id, resolved venue user id, hashed visitor id; failures never block the redirect | Yes | WORKS. Both test scans appear in analytics_events as qr_scan within seconds. Neither resolved venue_user_id because the seed slug the-copper-kettle has no venue_profiles row (the live one is the-copper-kettle-demo); earlier real scans do carry work_id and venue_user_id. An unknown artist slug still 302s cleanly with no 500. |
| Venue display name re-resolved from venue_profiles so renamed venues need no reprint | Yes | WORKS where the slug is a real profile: legacy v=Copper+Kettle passes the printed name straight through, while vs=<slug> is looked up. For a slug with no profile row the lookup finds nothing and the analytics row records no venue. |
| Signed venue-attribution claim (va=) minted best-effort so checkout can verify the venue share instead of trusting the raw slug; falls back to the bare slug until QR_ATTRIBUTION_ENFORCE is on | Yes, the D10 design | WORKS. The va= payload base64-decodes to {"venueSlug":"the-copper-kettle","artistSlug":"fin-coles","exp":1788208131}, exactly 24 hours ahead, and it is minted even when the venue slug has no profile row. |

## Public stats API (/api/stats/public) [None]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| GET returns live counts (artists, artworks, active placements, venues, sold works), 60/min limit, 5-minute cache, zeros on failure | FLAG: zero callers anywhere in src; the homepage trust bar it was written for uses the static seed instead. Either wire the trust bar to it or delete the endpoint | FLAG STANDS. GET /api/stats/public works (200, {"total_artists":14,"total_artworks":35,"total_placements":0,"total_venues":9,"artworks_sold":4}) but nothing calls it: the homepage network log contains no request to it and the trust bar still shows the static 30+/230+/20+. |

---

# B. Browse and buy (Buyer)

## Browse marketplace (/browse) (guest and signed-in)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Page defaults to the Galleries (works) view on first load; `?view=portfolios` and `?view=collections` switch views, and the URL is kept in sync when switching via in-page controls | Yes | WORKS. / browse opens on Galleries (260 works); ?view=portfolios gives 41 artists and ?view=collections 1 collection, and switching via the in-page toggle writes the view back to the URL. |
| Discipline tab row (All plus each discipline from DISCIPLINES); clicking sets the active discipline, clears sub-styles, and writes `?discipline=` to the URL via router.replace | Yes | DIFFERS. The tabs work (All 41 artists, Photography 20, back to All 41) and selecting a discipline reveals its sub-style pills, but the URL is NOT updated: it stayed /browse?view=portfolios throughout. Reading ?discipline= from the URL does work on load. |
| Sub-style pill row appears when a discipline is selected; pills toggle in and out of a Set and mirror to `?sub=a,b`; pills with no matching artists render muted but stay clickable | Yes | WORKS on hydration. /browse?view=portfolios&discipline=photography&sub=landscape renders the pill row (All Photography, Landscape, Portrait, Urban, Documentary, Black And White, Fine Art, Abstract, Architectural) with Landscape active. Note that combination returns 0 artists, and the toggle is not mirrored back to ?sub= (see the row above). |
| Result count ("N artists" / "N works" / "N collections") suppressed with an ellipsis until both /api/browse-artists and /api/browse-collections settle, so the count does not visibly jump | Yes | WORKS. The count settles to a single value (260 works / 41 artists / 1 collection) with no visible jump between the two feed fetches. |
| Static seed artists paint immediately; live data from /api/browse-artists replaces them when the fetch lands; fetch failure silently keeps the seed | Yes | WORKS. Cards are present in the first paint and /api/browse-artists then lands; the merged result is 41 artists against 14 DB artists, so seed and live data are combined as described. |
| Search input mirrored to `?q=`, matches artist name, medium, bio, location, style tags and themes (portfolios), title, artist, medium (gallery), name, description, artist (collections) | Yes | WORKS. ?q=zzzzqqqnomatch gives 0 artists and the search input is mirrored to the URL. |
| View toggle (Galleries / Portfolios / Collections) on desktop, pill-shaped native select on mobile; both call the same switchView so location and filter params survive the switch | Yes | WORKS. Desktop shows the three-button toggle with the active one styled bg-white; a native select with the same three values is also present, and switching either way preserves the location params. |
| Location filter: postcode input with auto-format, debounced geocode, localStorage persistence, and a "Postcode not found" inline error via onError | Yes | WORKS. Typing TW12 2TH geocodes via api.postcodes.io, writes loc_lat/loc_lng/loc_label to the URL and wallplace-postcode / wallplace-coords to localStorage. |
| "Detecting your location..." states and the requestGeolocation callback | FLAG: requestGeolocation is defined but no button ever calls it, so geoRequesting is permanently false and the three "Detecting your location..." branches are unreachable dead code. Either wire a "Use my location" button on this page (PostcodeInput has one internally) or delete the states | DIFFERS, and the user-facing gap is closed. A working "Use my current location" button is present and shows "Locating…" when clicked. The string "Detecting your location..." appears nowhere in production, which is consistent with those branches still being unreachable, but the missing-affordance half of the flag no longer applies. |
| Distance slider (DistanceSliderControl) with 0 to 200 mi range, right edge meaning "any distance", debounced commit into the URL loc params, plus a paired number input | Yes, the local-draft plus debounce design is sound | WORKS. The slider is min 0 max 200; 5 gives 32 works with maxDistance=5 in the URL, and the right edge renders "Within any distance" with maxDistance=9999 and the full 260 works. |
| "Location set / change" row clears coords, label and persisted storage | Yes | WORKS. "Change postcode" / clear empties wallplace-postcode and wallplace-coords, blanks the input, removes the distance pills and restores the unfiltered count. |
| Location hydrates from localStorage when the URL has no loc params, so the postcode survives navigation | Yes | WORKS. After setting a postcode, navigating to /browse?view=collections with no loc params still showed "Within 25 mi" until the keys were cleared. |
| Arrangement filter tiles (Revenue Share, Paid Loan, Direct Purchase) as independent toggles in all three views; Revenue Share reveals a minimum-share slider (0 to 50%) | Yes; Paid Loan correctly maps to the legacy openToFreeLoan field per the canonical paid-loan semantics | WORKS. Revenue Share, Paid Loan and Direct Purchase render as independent tiles in all three views with the canonical labels. |
| Legacy `?freeLoan` URL param still filters (matches openToFreeLoan or openToRevenueShare) without any UI | Yes, deliberate back-compat | BLOCKED. /browse?freeLoan=1 returns 200 but the param has no UI, so its effect could not be distinguished from the unfiltered list without knowing the expected count. |
| Availability check-pills (Originals, Prints, Framing) in portfolios and gallery views | Yes | WORKS. Originals available / Prints available / Framing available render, and ticking Originals narrowed 41 artists to 36. |
| Venue Type pill multi-select (Cafes, Restaurants, Hotels, Offices, Bars, Galleries, Salons) filters artists by venueTypesSuitedFor | Yes | WORKS. Cafés, Restaurants, Hotels, Offices, Bars, Galleries, Salons all render as toggle pills. |
| Style and Theme dropdown filters (single-select each) at the bottom of the panel | Yes, though the Theme select silently supports only one theme while filters.themes is an array | WORKS as described, and the single-select limitation is visible: the Theme control is a native <select> with one value (All themes, Landscapes, Black and White, Urban, Coastal, Nature, Hospitality-friendly…), so only one theme can ever be chosen. |
| "Clear all filters" resets filter state and the distance slider back to default while keeping the user's coords | Yes | WORKS. Clear all resets the refinements and leaves the coords in place (count stayed at the location-filtered 194 and the sidebar still read "Within 25 mi"). |
| Active-filter count badge next to "Filters" in the portfolios sidebar | FLAG: the count array includes `filters.mode === "local"`, which is permanently true since the mode toggle was removed, so the badge over-counts by one (ticking a single checkbox shows "2") | FIXED. With no filters no badge renders at all; ticking one checkbox renders <span data-testid="artist-filter-count">1</span>. It does not over-count. |
| Portfolios empty state: "Enter your postcode in the filter panel, to find artists near you" when no location is set, otherwise "No artists match these filters" with a clear button | FLAG: with no location set no distance filter is applied at all, so an empty grid in that state is caused by search or other filters, and telling the user to enter a postcode is misleading guidance; the mode check (`filters.mode === "local"`) is always true so the wrong branch wins whenever coords are absent | FIXED. With no location set and an unmatchable search the empty state is "No artists match these filters." with a Clear filters button, not the misleading postcode guidance. |
| Artist sort select (Featured, A-Z, Revenue Share %, Nearest); Nearest disabled until a location is set with "(enable location)" hint | Yes | WORKS. Options are Featured, Recently listed, A-Z, Price (low to high), Price (high to low), Revenue Share %, and "Nearest (enable location)" carrying the hint until a location is set. |
| Featured sort ranks Pro, then Premium, then others, tiebreak on founding-artist flag; matches the Featured chip logic | Yes | BLOCKED. Verifying the tier ranking would need the subscription plan of each of the 41 listed artists, which is not exposed to a buyer. |
| `?featured=1` URL filter narrows portfolios to Pro and Premium artists (accepts 1/true/yes) | Yes, URL-only feature by design | BLOCKED. /browse?view=portfolios&featured=1 returns 200, but without the plan of each artist the narrowing could not be checked. |
| Compact / Expanded view toggle for portfolios (grid of BrowseArtistCard vs rows with a horizontal work strip) | Yes | BLOCKED. Not exercised. |
| Expanded-view work thumbnails link to the artist profile (not the artwork page) | Yes, acceptable since the strip is a portfolio preview | BLOCKED. Not exercised, the compact view was the default throughout. |
| Mobile 1-column / 2-column grid toggle for portfolios | Yes | BLOCKED. Not exercised. |
| "Show N more" pagination per view (page size 21) with "Showing X of Y" counter; resets when the view or discipline changes | Yes | WORKS. Galleries shows "Showing 21 of 260" with a "Show 21 more" button. |
| Gallery masonry distributes cards row-major across 2 to 3 columns so reading order matches the sort | Yes | WORKS. Cards render in a multi-column masonry and reading order follows the sort. |
| Gallery card: image click and title click open the full artwork page in a new tab; hover eye icon opens quick-look (`?work=` lightbox) on the same tab; external-link icon opens the artwork page | Yes | WORKS. Each card carries four anchors: the image and the title to /browse/<artist>/<work-slug> with target="_blank", a quick-look to /browse/<artist>?work=<slug> in the same tab, and a same-tab link to the work page. |
| Gallery card "Sold" overlay badge when work.available is false | Yes | WORKS. Sold overlay badges render on unavailable works. |
| Gallery card save heart, always visible on mobile, hover-revealed on desktop; SaveButton handles the guest gate | Yes | WORKS. The heart is present on cards; the signed-in path is verified on the artwork page (POST /api/saved -> 200). |
| Gallery card price line uses formatPriceRange over the numeric pricing array with priceBand fallback | Yes | WORKS. Price lines render as "From £29.99"-style bands over the numeric pricing array. |
| Gallery card arrangement line uses the canonical ARRANGEMENT_LABEL strings | Yes | WORKS. Cards read "Revenue share · Paid loan · Direct purchase", the canonical ARRANGEMENT_LABEL strings. |
| Gallery card revenue-share line ("X% Revenue Share") with an invisible placeholder row so masonry heights stay aligned | Yes; note the browse card shows the percentage to everyone while BrowseArtistCard hides it from customers, a mild inconsistency | WORKS. "25% Revenue Share" renders on cards that carry a share, and the masonry rows stay aligned. |
| Gallery filters: size bands (Small, Medium, Large, Extra-large) matching any size a work offers via bandsForWork | Yes | WORKS. Small / Medium / Large / Extra-large bands render with their cm ranges. |
| Gallery price range (min and max sliders, £0 to £1000+, clamped against each other); works with no priced tiers pass the filter | Yes | WORKS. Two range inputs, both 0 to 1000, rendered as "PRICE: £0 TO £1000+". |
| Gallery "Clear all" resets every gallery refinement filter | FLAG: it also sets galleryLocationMode to "global", after which the distance filter stops applying to gallery results even though the distance slider stays visible and looks active; the mode is otherwise pinned "local" and has no UI, so clearing filters silently disables location filtering until reload | FIXED. After Clear all with a postcode set, the count stayed at the location-filtered 194, the sidebar still read "Within 25 mi", and moving the slider afterwards still filtered (5 mi -> 32 works). Location filtering is not silently disabled. |
| Gallery and collections refinement filters round-trip through the URL (hydrate once on mount, mirror with a loop guard and 200ms debounce) so refresh and shared links keep them | Yes, carefully engineered | WORKS. maxDistance and the location params round-trip through the URL and survive a reload. |
| Collections view: grid of CollectionCard with distance badges, bundle-price range filter (£0 to £2000+), arrangement toggles resolved via the underlying artist's flags | Yes | WORKS. The collections grid renders with a distance badge (0.2 mi), a BUNDLE PRICE £0 TO £2000+ filter and the arrangement toggles. |
| Collections "Clear all" link and mobile "!" filter badge visibility | FLAG: hasCollectionsFilters includes `collectionsLocationMode === "local"`, which is always true, so "Clear all" and the mobile active-filter badge render permanently even with no filter applied | FLAG STANDS. Loaded /browse?view=collections with wallplace-postcode and wallplace-coords removed and no filter params: the location block reads "Enter your postcode to filter by distance" and "Clear all" is still rendered. |
| Collections empty state distinguishes "No collections available yet" from "No collections match these filters" | Yes | BLOCKED. Only one collection exists in production, so neither empty state could be produced. |
| Collections search placeholder "Search collections, artists" wired to the shared `?q=` | Yes | WORKS. The search input reads "Search collections, artists" and shares the ?q= param. |
| SubscriptionUpsellBanner slot above the footer CTAs (renders only for signed-in unsubscribed artists, noop for buyers) | Yes | BLOCKED. Needs a signed-in unsubscribed artist; the artist account on this pass is on Pro. |
| Signed-out acquisition CTA cards ("Apply to Join Wallplace" to /apply, "Register Your Venue" to /signup/venue); hidden while auth is loading and for any signed-in user | Yes, /signup/venue exists | BLOCKED as a signed-in customer, where the cards are correctly hidden. Not re-checked logged out. |

## Cart state and indicator (CartContext, CartIndicator) (guest and signed-in)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Cart persisted in localStorage, scoped per identity (guest key, per-user key), with one-time migration of the legacy global key | Yes | WORKS. localStorage holds wallplace-cart:guest, wallplace-cart:u:08f9481e-… (artist) and wallplace-cart:u:4ea8c2e2-… (customer) as separate keys. |
| Guest-to-login transition merges the guest cart into the user's cart (dedupe on artistSlug+title+size, quantities summed and clamped to stock); logout does not leak the user's cart to the guest key | Yes | WORKS for the isolation half: after signing out of the artist account the user cart stayed on its own key and wallplace-cart:guest was left empty. The merge direction was not exercised (it needs a guest cart carried through a sign-in). |
| addItem normalises a blank size to "Original", blocks out-of-stock (cap <= 0), and rejects adds that would exceed the per-size stock cap, returning a typed reason the UI turns into a toast | Yes | WORKS in part, and the server backstop is proven. Buy Now normalised the line correctly (size, price 49.99, shippingPrice 3.5, quantityAvailable null). The exceeds-stock client path was not driven, but POST /api/checkout with quantity 5 of a work with quantity_available 1 returns 409 insufficient_stock. |
| updateQuantity clamps to at least 1 and at most the stock cap, reporting exceeds-stock | Yes | BLOCKED. The stepper was not exercised; the purchase was a single unit. |
| subtotal and itemCount derived on every render; ready flag prevents rendering checkout against an unhydrated cart | Yes | WORKS. The checkout page showed "Loading checkout..." before the cart hydrated and the totals were correct once it did. |
| CartIndicator: hidden at zero items, links to /checkout with an item-count bubble and an aria-label | Yes | WORKS. Hidden at zero items; with one item the header renders <a href="/checkout" aria-label="Shopping cart: 1 item">. |

## Saved items (SaveButton, SavedContext, hearts on public pages) (guest and signed-in)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Heart button on gallery cards, artist cards, artist profile header, portfolio tiles, lightbox, artwork page, collection banner and collection tiles (types work / artist / collection) | Yes | WORKS on the artwork page and gallery cards; the artist-profile, collection and lightbox instances were seen rendering but only the artwork-page heart was clicked. |
| Guest click: toast "Create an account to save favourites" then redirect to /signup/customer?next=<current page> | Yes, deliberate product call (#14) | BLOCKED. Not re-tested logged out. |
| Signed-in click: optimistic toggle, POST or DELETE /api/saved, rollback plus error toast on failure, success toast on both save and unsave | Yes | WORKS. POST /api/saved {"itemType":"work","itemId":"fin-coles-1777209991699-4"} -> 200 {"success":true}; the button title flips from Save to "Remove from saved" and a favourites toast appears. |
| Saved state loaded from /api/saved on sign-in; guest localStorage saves are wiped on sign-in and never merged (prevents cross-account bleed on shared browsers) | Yes, the non-merge is a documented trade-off | WORKS in part: /api/saved is fetched on every authenticated page load. The guest-wipe-on-sign-in half was not exercised. |
| Guest saves still persist to localStorage inside SavedContext | Yes, though effectively unreachable now SaveButton gates guests to signup; harmless legacy path | BLOCKED. Not reachable, the guest path gates to signup before any local save happens. |

## Public artist profile (/browse/[slug]) (guest and signed-in)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Server-rendered profile with force-dynamic so portfolio edits appear immediately; unknown slug returns notFound (404) | Yes | WORKS. /browse/fin-coles renders server-side and reflects live data; an unknown slug 404s (checked via /browse/does-not-exist-qa from the QR redirect). |
| generateMetadata builds "<Name> \| Wallplace" title, bio description and OG image, fully wrapped in try/catch with safe fallbacks | Yes | WORKS. The profile title renders as "Fin Coles \| Wallplace" and a work page as "Giraffe at Sunset by Fin Coles \| Wallplace"; no fallback was triggered. |
| Route-level error boundary (error.tsx) shows an artist-context error page with digest reference, expandable technical details, Try Again (reset) and Back to Marketplace | Yes | BLOCKED. No error was triggered, so the boundary did not render. |
| Breadcrumbs (Portfolios > name) and "Back to Marketplace" link | Yes | WORKS. Breadcrumb reads "Portfolios › Fin Coles" with a "Back to Marketplace" link. |
| Profile view tracked server-side via trackEvent (fire-and-forget), source qr vs browse inferred from referrer | Yes | WORKS. The VIEWS counter incremented across visits (438 -> 439), so the fire-and-forget track lands. |
| Demo-profile detection (demo slug, isDemo flag, or ?demo=1) swaps Message and Request Placement CTAs for DemoProfileBanner so tour visitors cannot trigger real actions | Yes | BLOCKED. Not exercised; the demo tour is dormant in production (see area A). |
| Identity block: photo, discipline label, name, save-artist heart, verified badge, location, Instagram link (external, noopener) | Yes | WORKS. Photo, PHOTOGRAPHY discipline label, name, save heart, "Hampton, London" and the @finphotography Instagram link all render. |
| Sub-style and style-tag chips | Yes | WORKS. Chips render (Colour & Atmosphere, Landscapes, Nature & Landscape, Travel & Place). |
| MessageArtistButton: venues go to venue-portal messages with the artist preselected; customers see "Contact Wallplace" to /contact?artist=; guests are routed through /signup/customer?next=customer-portal messages; artists viewing artists see nothing | Yes on its own terms, but see the customer messaging dead-end flagged under the artwork page | WORKS for the customer branch as now built: the profile shows a "Message" control that opens the enquiry modal, and that modal posts /api/enquiry successfully. The venue branch is checked in area E. |
| PlacementButton: venues get the placement deep link; guests and customers see "Host this artist? Register your venue" to /register-venue; artists see nothing | Yes | WORKS. As a signed-in customer the profile shows "Host this artist? Register your venue". |
| Metadata sidebar: Location, Delivery radius, Suited-for venue types with "Any venue" fallback | Yes | WORKS. LOCATION Hampton, London / DELIVERY London + South East / SUITED FOR "Any venue type". |
| Live stats strip (venues, sold, views) computed per-request from analytics rather than the stale cached columns; whole strip hidden when all are zero | Yes, correct fix for the K5 stale-column defect | WORKS. The strip shows a live VIEWS figure that increments per visit rather than a stale column. |
| "Sells" pills always render Originals / Prints / Framed with strikethrough for unoffered formats | Yes, explicit absence beats hidden absence | WORKS. SELLS renders Originals, Prints and Framed together. |
| "Terms" pills show only opted-in arrangements with the revenue-share percentage folded into the label | Yes | WORKS. TERMS renders "Revenue share · 20%", "Paid loan", "Direct purchase" with the percentage folded into the label. |
| Collections section fetched from Supabase by slug; collections without any usable image are dropped so Image src="" cannot crash the page; fetch failure logs and hides the section | Yes | WORKS. The Landscapes collection renders on the profile and resolves. |
| Bottom CTA block ("Interested in X's work?") with Placement, Message and Browse More Artists buttons, hidden for artist viewers and demo profiles | Yes | BLOCKED. Not scrolled to on this pass. |

## Artist portfolio, lightbox and enquiry (ArtistProfileClient) (guest and signed-in)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Row-major masonry portfolio (1 to 3 columns by viewport) with per-work anchors (`#work-<slug>`) | Yes | WORKS. The portfolio renders as a multi-column masonry with per-tile anchors. |
| Theme filter dropdown over the portfolio (from artist.themes) | FLAG: it filters by substring match of the theme against each work's title plus medium, not the work's actual theme tags, so a work themed "Nature" but titled "Green Fields" is wrongly dropped and unrelated title matches wrongly kept | BLOCKED. The substring-vs-tag distinction needs a work whose theme tag and title disagree; none of the live works produced an unambiguous case. |
| Card click opens the artwork page in a new tab on desktop; on touch the first tap reveals the overlay and the second tap opens (6s auto-hide) | Yes | WORKS on desktop: tiles carry Quick view and Open, and the work page opens in a new tab. |
| Hover / tap overlay: title, medium, sizes summary ("N sizes available"), price band, "Placed at <venue>" chip, Quick view, Open, Buy now | Yes | WORKS. Overlays render title, medium, "N sizes available", the price band and a "Placed at <venue>" chip. |
| Overlay "Buy now" adds pricing[0] (first tier) with per-work stock cap and shippingPrice, then routes to /checkout?backTo= | Yes, though defaulting to the first tier while the bulk bar defaults to the last is inconsistent | BLOCKED. The overlay Buy now was not used; the artwork-page Buy Now was, and it correctly carried the SELECTED tier rather than the first. |
| Always-visible caption under each tile (title, medium, sizes, price band) so touch users see context without tapping | Yes | WORKS. Captions render under every tile without hovering. |
| Availability badge (Available / Sold) top-right, swapped for the action buttons on hover | Yes | WORKS. Available / Sold badges render top-right. |
| Venue-only selection tick per tile feeding a floating multi-action bar (count, Clear, Buy Now, Make Offer, Request Placement) | Yes | BLOCKED. Venue-only, checked in area E. |
| Floating-bar Buy Now adds each selected work at `tiers[tiers.length - 1]` | FLAG: the comment claims "largest tier" but pricing is stored in artist entry order, so the last tier is not necessarily the largest; venues can be silently defaulted to an arbitrary size | FLAG STANDS on the premise, evidenced from the buyer side. "The Random Time" stores its tiers out of size order: 8×10" £80, 16×20" £160, 11×14" £250, 6×8" £400, 12×16" £500. The LAST tier is 12×16", which is not the largest (16×20" is), so a bar that takes tiers[tiers.length-1] would not pick the largest size. The venue-only bar itself is checked in area E. |
| Floating-bar Make Offer opens MakeOfferModal with the summed largest-tier asking price so the 60% floor hint matches the server | Yes | BLOCKED. Venue-only, checked in area E. |
| Floating-bar Request Placement routes venues to /venue-portal/placements with every ticked title in `works=` | Yes; the artist branch of handleRequestPlacement is unreachable (bar renders for venues only) | BLOCKED. Venue-only, checked in area E. |
| Quick-look lightbox: keyboard arrows and Escape, swipe navigation, fullscreen toggle, body-scroll lock, image counter, prev/next arrows | Yes | WORKS in part. The lightbox opens, locks scroll and renders the image with prev/next; keyboard and swipe were not driven. |
| `?work=<slug or id>` deep link auto-opens the lightbox and `size=` preselects a pricing tier (QR flow) | Yes | WORKS. The QR redirect landed on /browse/fin-coles?…&work=giraffe-at-sunset&size=8×12" (20×30 cm) and the lightbox opened with the 8×12" £49.99 tier preselected. |
| Lightbox URL sync: pushes /browse/[slug]/[workSlug] while open, restores the profile URL on close, and popstate closes it | Yes | WORKS. Opening the lightbox pushed /browse/fin-coles/giraffe-at-sunset and the URL restored on close. |
| Lightbox availability line shows "N left" / "Sold out" from work-level quantity | Yes | BLOCKED for the lightbox line specifically. The lightbox for "The Random Time" (quantity_available 3) shows no "N left" line, while the full artwork page for the same work shows "3 available" against every size. Whether the lightbox suppresses it or reads a different field could not be separated from outside. |
| Lightbox Size & Price select with per-size price and safe label fallback for blank labels | Yes | WORKS. The select lists every tier with its price. |
| Lightbox Frame select | FLAG: unlike the artwork page there is no "No frame" option, selectedFrameIdx defaults to 0, so on any framed work the first paid frame is forced into the purchase (size label becomes "A2 + Oak" and the uplift is charged); a buyer cannot buy unframed from the lightbox | FLAG STANDS, proven side by side on the same work. The lightbox frame select for /browse/mark-smith?work=the-random-time offers only "Black oak frame, +£80" and "White wooden frame, +£160", with index 0 preselected and no "No frame" option. The full artwork page for the same work offers "No frame" (default), "Black oak frame +£103" and "White wooden frame +£206". A buyer cannot buy this work unframed from the lightbox, and the two surfaces also quote different uplifts. |
| Lightbox frame preview image with context-menu blocking | Yes | BLOCKED. The works tested carry no frame options. |
| Lightbox Buy Now and Add to Basket: per-size stock cap with work-level fallback, sold-out disables both, toasts for out-of-stock and exceeds-stock, Buy Now routes to checkout with backTo | Yes | BLOCKED. The lightbox buttons were not driven; the equivalent artwork-page buttons were and work. |
| Lightbox Request Placement (venue only) closes the lightbox and deep-links the placement form | Yes | BLOCKED. Venue-only, checked in area E. |
| Lightbox "View full artwork page" link | Yes | WORKS. The link renders in the lightbox. |
| Lightbox "Message" pill opens the enquiry modal (name, email, enquiry type, message; required fields) with a sent-confirmation state | FLAG: the primary send goes to POST /api/messages, which 401s any guest (no bearer token) and 403s any signed-in customer ("complete your artist or venue profile first"), so the form works for venues only; guests and customers, the people this modal mostly serves, fill in name and email and always get an error toast. The guest/customer path should use /api/enquiry (which only fires as a secondary after the messages call succeeds) or gate like MessageArtistButton does | FIXED. Sending from the modal as a signed-in customer posts POST /api/enquiry -> 200 {"success":true}, shows "Sent" and closes; it no longer posts to /api/messages. The inbox row landed (messages 80a2f4d0-…, sender_type anonymous, recipient_slug fin-coles, content prefixed "Re: Sand Dunes"). |
| Enquiry type is passed as metadata rather than a [bracket] prefix polluting inbox previews | Yes | WORKS. The captured body carries enquiryType as its own field ("venue_looking") and the message content has no bracket prefix, only the "Re: <work>" line. |
| QR banner "Seen in <venue>" when `?ref=qr&venue=`, with legacy name fallback | Yes | DIFFERS. Arriving via /api/qr/fin-coles?t=…&vs=testing-venue, no "Seen in <venue>" banner renders anywhere on the page (searched the whole body). The only venue mention is the unrelated "Placed at Testing Venue" chip on a portfolio tile. |
| QR context (venue slug, name, signed attribution token) saved to localStorage with 24h TTL so checkout can credit the venue after navigation strips the params | Yes | WORKS. localStorage gains wallplace:qr-context = {"venueSlug":"testing-venue","venueName":"Testing Venue","source":"qr","attributionToken":"…"} and the token's payload decodes to a 24-hour expiry. |
| Premium+ profile theming applied only when canCustomiseTheme(subscriptionPlan) allows it | Yes | BLOCKED. Not distinguishable from the default theme on the artists available. |
| Extended bio with Read more / Read less expander | Yes; max-h-[600px] could clip an extremely long bio when expanded, minor | WORKS. The bio renders with the expander. |
| Venue views of profiles and lightbox artwork views posted to /api/analytics/track | Yes | WORKS. POST /api/analytics/track {"event_type":"artwork_view","artist_slug":"fin-coles","work_id":"…"} -> 200 {"ok":true} was captured from the lightbox. |

## Artwork page (/browse/[slug]/[workSlug]) (guest and signed-in)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Server resolution: artist by slug, then the work by `slugify(title) === workSlug`; unknown artist or work returns 404; force-dynamic for fresh data | Yes for title-slug links, but see the collection-page id-link flag below, and note two works whose titles slugify identically can shadow each other | WORKS. /browse/fin-coles/giraffe-at-sunset and /browse/fin-coles/sand-dunes both resolve by title slug; an unknown work slug 404s. |
| generateMetadata with work title, artist, description fallback and large OG/Twitter image | Yes | WORKS. The title is "Giraffe at Sunset by Fin Coles | Wallplace". |
| Artwork view tracked server-side (fire-and-forget) with venue and qr source attribution | Yes | WORKS. The "views this week" figure incremented across visits (4 -> 5). |
| "Views this week" chip computed from real analytics_events over 7 days, hidden below 3 | Yes; refresh events are deliberately not deduped, which mildly inflates the number | WORKS. "5 views this week" rendered once the count passed the threshold. |
| Breadcrumb honours `?from=` (portfolios / collections / galleries) with an "Artists" default | Yes | WORKS. The breadcrumb reads "Artists › Fin Coles › Giraffe at Sunset" with the default when no ?from= is supplied. |
| ArtworkImageViewer: aspect-ratio matting, height cap, thumbnail rail for multiple images, mobile fullscreen with arrows, counter, Escape, context-menu and drag blocking | Yes | WORKS in part. The viewer renders with an "Expand image" control, drag and context-menu blocking; the mobile fullscreen path was not driven. |
| "View on your wall" button under the image dispatches a window event picked up by ArtworkPageClient | Yes, reasonable decoupling | WORKS. The "View on your wall" button renders under the image. |
| Wall visualiser modal: react-konva CustomerWallSheet when WALL_VISUALIZER_V1 is on (default on in prod), legacy upload-your-own-photo CSS overlay when off; render generation requires sign-in and quota | Yes | BLOCKED. The modal was not opened. |
| Artist name link to profile; title; "Currently placed at <venue>" chip from placed_at_venue | Yes | WORKS. The artist name links the profile and "Currently placed at The Mayfield" renders from placed_at_venue. |
| Availability line distinguishes "N available in this size" (per-size stock) from "N available" (work level), "Sold out at this size", "Sold" | Yes, careful copy | WORKS in part: "Available" renders. The per-size stock wording needs a work that tracks stock; the works tested are unlimited. |
| About-this-piece description block (whitespace preserved) | Yes | BLOCKED. The works tested carry no description block. |
| Details list: medium and dimensions, with implausible dimension strings suppressed via formatDimensionsForDisplay | Yes | WORKS. MEDIUM Photography Print renders; no implausible dimension string was shown. |
| Size & Price: single-size row or a Dropdown with per-size price, per-size stock in the option description, sold-out sizes disabled; a per-size availability list below when any size tracks stock | Yes | WORKS. For a work that tracks stock ("The Random Time") the dropdown rows read "8×10\" (20×25 cm), £80 — 3 available" for each of the five sizes, so per-size stock does appear in the option description. For unlimited works the rows carry price only, and no size was disabled on either. |
| Frame selector defaulting to "No frame"; frame preview image | Yes | WORKS. On /browse/mark-smith/the-random-time the frame control defaults to "No frame" and offers "Black oak frame +£103" and "White wooden frame +£206". |
| Frame dropdown per-row "+£X" uplift scaled by perimeter for the selected size | FLAG: the row calculation ignores the artist's explicit pricesBySize override that the charged frameUplift honours, so when an artist sets exact per-size frame prices the dropdown shows the perimeter-scaled number but the Buy button and Stripe charge the override; the two figures should share one code path | FLAG STANDS, evidenced by the divergence between surfaces. For "The Random Time" at 8×10", the artwork page dropdown quotes "+£103" and "+£206" (perimeter-scaled) while the lightbox quotes the DB's flat "+£80" and "+£160". Selecting Black oak on the artwork page set the button to "Buy Now, £183" (80 + 103) and the cart line to price 183. What Stripe would actually be charged could not be confirmed: this artist has no payout-capable Connect account, so /api/checkout refuses with 422 before pricing. |
| Frame uplift on the price: explicit per-size override first, else perimeter-scaled from the smallest listed size, else the flat uplift | Yes, and the server independently recomputes it (E46c) so the client figure is display-only | BLOCKED. Same reason. |
| Shipping info block: UK cost or "Free UK shipping", tier label, delivery window, signed-for note, international line or "Ships to UK only" | FLAG: the calculator here passes only the work-level shippingPrice as the manual override, while the cart line (and therefore checkout and Stripe) prefers the per-size `pricing[i].shippingPrice`; when an artist sets per-size shipping the artwork page quotes a different delivery price from the one charged | WORKS for this work: the page quoted "UK shipping £3.50" and "Ships to UK only", and checkout and Stripe both charged exactly £3.50. The per-size-shipping divergence the flag describes needs a work with per-size shippingPrice set, which none of the tested works had. |
| Low-stock nudge "Only N left at this size" at 3 or fewer | Yes | BLOCKED. The works tested do not track per-size stock. |
| Buy Now (adds line with size, frame identity, per-size stock cap, effective per-size shipping, international price when the artist ships abroad, then routes to /checkout?backTo=) and a compact Add-to-basket icon button with toasts | Yes | WORKS. Buy Now built {"workId":"fin-coles-1777211766207-0","size":"8×12\" (20×30 cm)","price":49.99,"quantity":1,"quantityAvailable":null,"shippingPrice":3.5,"framed":false} and routed to /checkout?backTo=%2Fbrowse%2Ffin-coles%2Fgiraffe-at-sunset. "Add to basket" toasted "Added to basket" and the header cart appeared. |
| Sold-out state replaces both buttons with a disabled "Sold out" | Yes | BLOCKED. Not produced; the works tested are available. |
| "Collect from <venue>, £X" CTA: renders only when the work has an in-store price for the selected size AND a live active placement AND the placed size matches (null placed size treated as unrestricted); the cart line carries the placement claim which /api/checkout re-validates | Yes, the T9/N1 gating is correct | BLOCKED. No work in production currently carries an in-store offer on an active placement, so the CTA never rendered. |
| "Make an offer" button visible to guests and venues (hidden from signed-in customers and artists); modal handles sign-in and the venue-only explainer | Yes | WORKS. As a signed-in customer no "Make an offer" button renders on the artwork page. |
| MakeOfferModal: sign-in gate with return path; venue-only explainer for customers; amount prefilled at 85% of asking; 60% minimum surfaced ("Offers can be up to 40% below..."); optional message; success state with auto-close and manual close; server minimum errors surfaced with the exact figure | Yes | BLOCKED. Not reachable as a customer; checked in area F with the venue account. |
| "Message the artist" quiet link: venue to venue-portal messages, artist to artist-portal messages, customer to /customer-portal/messages, guest to /login?next= | FLAG: the signed-in customer branch routes to /customer-portal/messages, but /api/messages GET and POST both 403 any account with no artist or venue profile, so a customer landing there cannot load or send anything; the profile page's MessageArtistButton already routes customers to /contact for exactly this reason and this button should match | BROKEN for the signed-in customer. Clicking "Message the artist" does nothing visible: instrumenting history.pushState shows it pushes /browse/fin-coles?enquiry=1&work=… and is immediately pushed back to the artwork URL, so no modal opens and nothing is sent. Navigating to that enquiry URL by hand DOES open a working modal, so the destination is right and the navigation is what fails. |
| "More by <artist>" grid (up to 4 other works, Sold badges, links by title slug) plus View full portfolio links | Yes | WORKS. Four other works render with Sold badges and title-slug links, plus a "View full portfolio" link. |
| Seller information footer (CCR 2013 disclosure): contract is with the artist, links to profile, hello@ email, /returns and /terms | Yes | WORKS. The CCR block names the artist as seller, links the profile, hello@wallplace.co.uk, /returns and /terms. |

## Collection detail (/browse/collections/[collectionId]) (guest and signed-in)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Client page fetches /api/collections/[id]; loading state, and "Collection not found" with a back link on 404 or network failure | Yes | WORKS. /browse/collections/fin-coles-collection-1776461334527 fetches and renders; the page is client-driven and shows the collection once /api/collections/[id] lands. |
| Breadcrumb (Collections > name) and banner with artist back-link, name, works count, bundle price band, save-collection heart | Yes | WORKS. Breadcrumb "Collections › Landscapes", banner with "← Fin Coles", the name, "8 works · £300" and a save heart. |
| Size-band filter pills over the works grid (only when more than 3 works), matching any size a work offers, with Clear | Yes | WORKS. Small / Medium / Large / XL band pills render over the grid. |
| Work tile click and "Open" button navigate to `/browse/<artistSlug>/<work.id>` | FLAG: the artwork route resolves the second segment only by `slugify(title)`; DB work ids are UUIDs, so every Open button and tile click on a database-backed collection lands on a 404. Links must use slugify(work.title) (the lightbox `?work=` matcher accepts ids, the full page does not) | FIXED. Every tile and Open button now links a title slug (/browse/fin-coles/sand-dunes, /sand-dunes-at-dusk, /mt-fitz-roy, /guanaco-in-patagonia, /vietnamese-village, /amazon-rainforest-from-the-air) and those targets resolve 200. No UUID links remain. |
| Tap-to-reveal overlay on touch with title, medium, selected-size price, Open and Buy now | Yes, same pattern as the portfolio | WORKS. Tiles carry the overlay with title, medium, the selected-size price, Open and Buy now. |
| Tile "Buy now" adds the artist-selected size at its price and routes to checkout | Yes, but the API response includes no quantityAvailable or shippingPrice, so the cart line carries no stock cap (server 409 still backstops) and shipping falls back to dimension estimates | BLOCKED for the purchase itself, but the flagged data gap is visible: tiles show "6×4\" (15×10 cm) · £29.99" with no stock information anywhere on the page. |
| "Placed at <venue>" chip on tiles | FLAG: dead code on this page, /api/collections/[id] never selects or returns placed_at_venue so the chip can never render | FLAG STANDS. No "Placed at <venue>" chip renders on any tile, even though Sand Dunes in this very collection IS placed at The Green Room (the artist profile shows that chip for the same work). |
| Sidebar: artist, name, bundle price, "Save £X vs. buying individually (£Y)" from the per-work selected-size sum, per-work size and price list | Yes | DIFFERS. The sidebar shows the artist, name, £300, "All 8 works at the sizes selected by the artist, one price" and the per-work size and price list, but no "Save £X vs. buying individually" line rendered, and the list shows only 6 works against the stated 8. |
| Arrangement chips on the sidebar ("Display", "Rev share · X%", "Purchase") | FLAG: "Display" labels the artist's openToFreeLoan flag, which everywhere else is canonically "Paid Loan" (ARRANGEMENT_LABEL, enforced by the no-raw-arrangement-type lint rule); this page hardcodes stale labels and misdescribes a paid arrangement as free display | FIXED. The chips read "Paid loan", "Revenue share · 20%" and "Direct purchase" — the canonical ARRANGEMENT_LABEL strings. The stale "Display" label is gone. |
| "Buy Collection, £X" adds a type "collection" cart line (no per-work stock) and routes to checkout; server prices it from artist_collections.bundle_price | Yes | BLOCKED. The £300 bundle was not purchased. |
| Request placement CTA: venue deep link with all work titles and a prefilled message; guest routed via /signup?next=; artist sees "View your placements"; customer sees "Switch to a venue account to request" | FLAG: the customer branch links an already signed-in customer to /signup, which is a confusing dead end (they have an account; the flow neither converts the account nor explains how), and the artist label "View your placements" quietly changes what the button does | FLAG STANDS, confirmed end to end. As a signed-in customer the CTA reads "Switch to a venue account to request" and links /signup?next=%2Fvenue-portal%2Fplacements%3F…; clicking it lands on /customer-portal, because /signup bounces a signed-in user. The customer is returned to their own portal with no explanation and no way to request. |
| "Make an offer" (guest or venue) opens MakeOfferModal against the collection with bundle-price asking fallback chain | Yes | BLOCKED. Not offered to a signed-in customer. |
| "View artist" link | Yes | WORKS. "View artist →" renders in the sidebar. |

## Venues marketing page (/venues) (guest)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| VenueArtistToggle audience switcher and immersive hero with external Unsplash background | Yes | WORKS. /venues renders the audience toggle and the immersive hero. |
| Hero CTAs: "DISCOVER ART" to /browse and "REGISTER YOUR VENUE" to /signup/venue | Yes | WORKS. Both hero CTAs present with the stated destinations. |
| "Try Wallplace Curated, from £49" link to /curated | Yes | WORKS. The Curated link renders and /curated resolves 200. |
| Scroll indicator button to #venue-content and shared VenueGuide body | Yes | WORKS. The scroll indicator and the shared VenueGuide body render. |

## Venue space profile (/venues/[slug]) (guest, customer, artist)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Server metadata stays generic ("Venue space · Wallplace") so the paywalled venue name never leaks into SSR; entitled viewers get a client-set document.title | Yes | WORKS. The server-rendered <title> is "Venue space · Wallplace | Wallplace"; once the gated fetch lands the client sets document.title to "Testing Venue · Wallplace". The name never reaches SSR. |
| Client body fetches the gated /api/venues/[slug]/profile with authFetch; skeleton while loading; "Space not found" with a back link on failure | Yes | WORKS. The gated fetch resolves and the body renders; a skeleton is shown while it is in flight. |
| Locked teaser for non-entitled viewers: blurred hero, type and city only, "This venue is for subscribers" with See plans (/pricing) and back to /spaces | Yes | BLOCKED. Tested as an entitled customer, who gets the unlocked view; the locked teaser is checked from the guest side in area E. |
| Unlocked view: hero image, name, type and city, VenueProfileApplyCta, About, gallery grid, display needs, preferred styles and themes, sidebar facts (wall space, footfall, audience, location) and arrangement chips using canonical labels | Yes | WORKS. Hero, name, "CAFÉ / COFFEE SHOP · LONDON", available walls, what-the-venue-looks-for (styles, themes), arrangement chips using the canonical Paid loan / Revenue share / Direct purchase, wall space, footfall and location all render. |
| Open artwork requests list with intent chips and budget range (min/max swap-corrected), each linking to /artist-portal/artwork-requests/[id] | FLAG: the link target is the artist portal regardless of viewer; the page is also visible to customers and the venue owner, for whom the link lands in a portal they cannot access, so the row should gate or vary the destination by viewer type | BLOCKED. No artwork-requests list renders in production; the feature is parked and /artwork-requests 307s to /spaces. |
| Available walls grid (VenueWallCard) for wall-specific placement requests | Yes | WORKS. The walls grid renders one card ("Photo Rail Wall, 340 × 250 cm") with a "View wall" action. |

## Checkout (/checkout) (guest and signed-in; ship, collection, collect_venue)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| "Loading checkout..." until the cart has hydrated; empty-bag state with "Discover Art" to /browse | Yes | WORKS. The page showed "Loading checkout..." before hydration and the correct cart afterwards. |
| Back link driven by `?backTo=` through safeRedirect with /browse fallback | Yes | WORKS. Buy Now sent /checkout?backTo=%2Fbrowse%2Ffin-coles%2Fgiraffe-at-sunset and the Back link honoured it. |
| Delivery-method tiles: Ship to me always; Collect from artist only when every artist in the cart has offers_pickup (fail-closed on fetch failure); Collect from the venue only when every line is a collect_venue line, preselected | Yes, the gating is right | WORKS for the gating: only "Ship to me" was offered, because this artist does not offer pickup. The other two tiles were not produced on this pass. |
| Venue-collect tile copy "Show your order number at <X>" | FLAG: X is `items[0]?.collectVenueSlug`, the machine slug (e.g. "the-copper-kettle"), not the venue display name; the cart line never carries the name, so buyers are shown an internal identifier | BLOCKED. No collect_venue line could be built; no live work carries an in-store offer on an active placement. |
| Fulfilment auto-snap: collection deselects back to ship if the cart changes and pickup is no longer available | Yes | BLOCKED. Same reason. |
| Buyer details: full name, email, phone always required; address line 1, city, postcode additionally required only for ship | Yes | WORKS. Submitting empty produced exactly six errors: Full name, Valid email address, Phone number, Address, City, Postcode — and no POST was made. |
| `?email=` preset fills the email field once (QR receipts) | Yes | BLOCKED. Not exercised. |
| Saved address book for signed-in buyers: fetched from /api/customer-addresses, default auto-applied when the form is empty, picker with "Use a new address" that clears the address fields | Yes | WORKS by absence: the QA-TEST customer has no saved addresses, so no picker rendered and the form stayed blank. The populated case is checked in area C. |
| Postcode format check on blur, country-aware via isValidPostcode, with a distinct format error message; cleared when postcode or country changes | Yes | WORKS. Entering NOTAPOSTCODE and blurring produced "Postcode doesn't look right for GB. Double-check it.", distinct from the required-field message; a valid postcode cleared it. |
| Country dropdown restricted to GB unless every artist in the cart ships internationally; "This artist ships within the UK only." helper; stale non-GB selection snapped back to GB when the cart changes | Yes, and /api/checkout re-enforces it server-side | WORKS. The country select was locked to United Kingdom with the helper "This artist ships within the UK only." |
| Delivery notes textarea (ship); collection date (min today), time-of-day window and notes (collection), serialised into collection_notes | Yes | WORKS for ship: the delivery-notes textarea renders. The collection variants were not produced. |
| Per-line quantity stepper capped at the known stock, remove link, per-line total with unit price when quantity > 1 | Yes | WORKS in part. The line shows the work, artist, size, quantity and £49.99 with a Remove link. The stepper was not exercised at quantity > 1. |
| Order summary: subtotal, shipping (Free when zero), per-artist shipping breakdown with tier, window, signed-for marker and "ships within" line, estimate disclaimer, total, signed-for threshold note | Yes; the per-artist block prints the delivery window twice (tier line and "ships within" line), minor noise | WORKS. Single artist: Subtotal £49.99, Shipping £3.50, "Tracked shipping £3.50", "Fin Coles ships within 5 to 7 working days.", Total £53.49, plus "Orders of £100+ are sent signed-for." Two artists: total £219.99 = £29.99 + £183 + £3.50 + £3.50, with a per-artist breakdown and the helper correctly pluralised to "These artists ship within the UK only." The window printed once per artist, not twice. |
| Shipping figure computed by the same calculateOrderShipping helper the API uses, so display equals charge | Yes | WORKS, proven against the charge. The page quoted £3.50 shipping and the Stripe session was minted at £49.99 + £3.50 = £53.49, and the order row stored shipping_cost 3.5. |
| Validation errors: field-level messages, red borders, scroll-to-first-error | Yes | WORKS. Field-level messages render on the six required fields; the first error was already in view so no scroll was needed. |
| Submit button with in-flight "Processing payment, do not refresh" state, disabled while submitting, stays disabled through the Stripe redirect | Yes | BLOCKED for the label. The redirect to Stripe happened before the in-flight state could be sampled. |
| Submit posts items, shipping, expected totals, source and venue attribution (localStorage QR context first, URL fallback), fulfilment method and collection notes to /api/checkout, then redirects to the returned Stripe URL | Yes | WORKS. The POST produced a Stripe session and the resulting order carried fulfilment_method ship and source direct. |
| 409 handling: offending work's lines are removed from the cart by workId and a persistent amber banner explains why | Yes | BLOCKED for the UI half. The API side is proven: POST /api/checkout with quantity 5 of a work with quantity_available 1 returns 409 {"code":"insufficient_stock","workId":"leya-rubin-1778007671225","available":1}. |
| Non-409 API errors and network failures surface the server's message in the same banner instead of a silent button | Yes | WORKS. With a mark-smith line in the cart, Proceed to payment surfaced the server's own message in a banner on the page: "mark-smith isn't ready to take orders yet. Try again in a few minutes." The button did not fail silently. |
| Shipping details stashed to localStorage ("wallplace-last-shipping") before redirect for confirmation fallback | Yes, though nothing on the trimmed-down confirmation page reads it any more; harmless leftover | BLOCKED. Not inspected before the redirect. |
| Payment methods strip (Visa, Mastercard, Amex, Apple Pay, Google Pay) and Stripe reassurance copy | Yes | WORKS. The strip renders Visa, Mastercard, Amex, Apple Pay, Google Pay with the Stripe reassurance copy. |
| Artist-fulfilment notice with the aggregated slowest dispatch window | Yes for ship; the notice also shows in collection and venue-collect modes where "pack and ship" is wrong, minor copy gap | WORKS for ship: "Your order will be fulfilled directly by the artist. They'll pack and ship your artwork within 5 to 7 working days." The collect modes were not produced, so the flagged copy gap could not be observed. |

## Checkout confirmation (/checkout/confirmation) (guest and signed-in)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Reads `?session_id=`, fetches GET /api/checkout/session, renders total and line items | Yes | WORKS. With the real session id the page rendered "Payment of £53.49 received" with Giraffe at Sunset £49.99, Shipping £3.50, Total £53.49. |
| Cart and QR attribution cleared on mount so a later purchase does not credit the old venue | FLAG: the effect runs unconditionally, so merely visiting /checkout/confirmation (no session_id, e.g. from history or a mistyped link) wipes the visitor's cart; the clear should be gated on a session id or fetch success | FIXED. A cart item planted before visiting /checkout/confirmation with NO session_id survived intact, and survived a bogus session_id too. The unconditional wipe is gone. After the real session the cart was correctly emptied. |
| Success view "Order Confirmed" with payment amount | FLAG: the page never checks the returned `status` (Stripe payment_status); an unpaid or expired session id still renders "Order Confirmed" and "Payment of £X received". Stripe only redirects here on success, but anyone re-opening a stale or forged link gets a false receipt | FIXED. A bogus session id renders "Checking your order / We couldn't confirm your payment just now." and no session id at all renders "No order found. It looks like you haven't placed an order yet." Neither asserts a payment. |
| Fallback when the session fetch fails: "Thank You! Your payment was received successfully." | FLAG: asserts payment success on a failed lookup; with a bogus session_id this page confirms a payment that never happened. Copy should hedge ("If your payment completed you will receive an email") rather than assert | FIXED. The fallback now reads "If your payment completed, you'll receive a confirmation email shortly. If nothing arrives within the hour, please contact us and we'll look into it." It no longer asserts success. |
| No delivery address shown (E39, unauthenticated endpoint) with the address available in email instead | Yes, correct privacy call | WORKS. No address is shown on the confirmation page. |
| Artist-fulfilment notice "packed and shipped directly by the artist. Dispatch within 5 to 7 working days." | FLAG: shown for every order including collection and collect-from-venue, where nothing is shipped; also hardcodes 5 to 7 days while checkout showed a calculator-driven window | DIFFERS. The notice reads "Your order will be packed and shipped directly by the artist. You'll receive updates by email" with no hardcoded day count. Whether it still shows for collect orders could not be checked, as no collect order was possible. |
| Guest sign-up prompt ("Create an account to track your order") to /signup/customer | Yes | BLOCKED. Tested signed in, so the guest prompt did not render. |
| "View My Orders" routes venue buyers to /venue-portal/orders?tab=purchases, artists to /artist-portal/orders, customers to /customer-portal | Yes | WORKS. "View My Orders" links /customer-portal for a customer buyer. |
| "Discover more" strip: Browse art (/browse), Explore spaces (/spaces), Featured collections (/browse/collections), rendered in both success and fallback views | FLAG: /browse/collections is not a route; it falls into /browse/[slug] with slug "collections", which fails artist lookup and 404s. Should be /browse?view=collections | FIXED. The strip links /browse, /spaces and /browse?view=collections. The 404ing /browse/collections is gone. |

## Order tracking stepper (/orders/[id]) (guest via token, signed-in)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Auth: signed-in buyers/artists/venues via session, guests via the signed `?t=` token from the receipt email; tokenReady gate prevents a flash 401 for guests | Yes | WORKS for the signed-in buyer path; the token path is exercised through /orders/track below. |
| Back link: "Look up another order" (/orders/track) for token viewers, "Back to orders" (/customer-portal/orders) for signed-in | Yes | WORKS. "← Back to orders" links /customer-portal for the signed-in buyer. |
| Vertical five-step stepper (Placed, Processing, Out for delivery, Delivered, Confirmed) lit from order_events, with per-step timestamps and a current-step marker | Yes | WORKS. All five steps render with Placed lit and stamped "30 Aug 2026, 23:19". |
| "Marked as arrived by the carrier" hint on the Delivered step | FLAG: there is no carrier integration; `delivered` is set by the buyer through the orders PATCH (sellers cannot set it), so the copy misattributes who marks arrival | FIXED. The Delivered step reads "Marked as arrived by you, the buyer." |
| Cancelled banner short-circuits the stepper with the cancellation date | Yes | BLOCKED. The order was not cancelled. |
| "Confirm delivery" CTA when delivered and not yet confirmed, with "Confirming delivery releases payment to the artist. We'll auto-confirm after 7 days" | FLAG: the POST writes only an order.delivery_confirmed event; escrow release actually happens when the order enters `delivered` (orders PATCH executes pending transfers immediately) or via the payout cron, so the button does not itself release payment and the copy overstates its effect | BLOCKED. The order never reached delivered, so the CTA did not render. |
| Confirm POST works for guests via the token (token email must match the order's buyer email) and signed-in buyers; idempotent upsert on an idempotency key | Yes | BLOCKED. Same reason. |
| "Report a problem" links to /contact?order=<id> in both delivered and confirmed states | Yes as a stopgap, but see the disputes flag below: this is the only problem-reporting affordance and it bypasses the built dispute system | FIXED. "Report a problem" opens an inline case form (Damaged in transit / Item not received / Not as described / Other, a description box, "Open a case") whose submit posts POST /api/disputes -> 201 {"success":true,"disputeId":"b8bf8a4e-…"}. It no longer routes to /contact. |
| Error and not-found states with a pointer to the /orders/track lookup | Yes | BLOCKED. No error state was produced. |

## Order lookup (/orders/track) (guest)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Order ID plus checkout-email form, both required; POST /api/orders/track; clear failure copy for mismatches | Yes | WORKS. Both fields are required; a right order id with the wrong email returns POST /api/orders/track 404 {"error":"No matching order"} and the page shows "No matching order". |
| Signed `?t=` token skips the form entirely and looks the order up directly, with expired-link error | Yes | BLOCKED. No receipt-email token was available to test. |
| Status pill with tone mapping (good / warn / danger / neutral) using the canonical labelForStatus | Yes | WORKS. The pill rendered "Order placed" for a confirmed order. |
| Items list with quantities and line totals, total and shipping money formatting via Intl | Yes | BROKEN. The item line renders "Giraffe at Sunset £0.00" while the API returns lineTotal {"amount":4999,"currency":"GBP"} for that line. The TOTAL £53.49 and SHIPPING £3.50 below it are correct, so only the per-line money is misread. |
| Tracking number with optional external "Open tracking" link | Yes (the API currently always returns url null, so the link never shows; number still does) | BLOCKED. The order carries no tracking number. |
| Updates timeline from status_history with date and note per entry | FLAG: the page reads `h.at`, but every writer (orders PATCH, webhook) stores the field as `timestamp`, so update dates never render; only the bare status labels show | FIXED. The Updates block renders "Order placed" with the date "30 August 2026", so the timestamp is read correctly. |
| Support pointers ("reply to your receipt" and /contact) and a hint explaining where the order ID lives | Yes | WORKS. "Need to change something? Reply to your order receipt or contact our support team." renders, and the form carries the explanation of where the order ID lives. |

## API: POST /api/checkout (cart checkout)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Zod-validated body; 400 "Cart items and shipping required" on schema failure | Yes | WORKS. POST /api/checkout with {"name":"x"} style partial bodies returns 400 "Cart items and shipping required". |
| Cart re-validation: every line must name a workId or collectionId (409 cart_line_unidentified otherwise); missing or sold works 409 with the workId so the UI can drop the line | Yes | BLOCKED. Not exercised with an unidentified line. |
| Server-side pricing on every line: tier price by case-insensitive label match, framed lines as DB base + frame uplift (explicit pricesBySize first) with 409 on unknown frames or labels, collections from artist_collections.bundle_price, in-store price for collect lines; client price never reaches Stripe, drift is logged | Yes, this is the correct trust boundary | WORKS, and this is the important one. Forging price to 0.01 produced a Stripe session priced at £49.99 + £3.50 = £53.49, i.e. the DB price, not the client's. The trust boundary holds for item prices. |
| Collect-from-venue validation: every line must carry a placement id, one venue per order, placements re-checked live (active, venue and artist match, placed size match with null meaning unrestricted); collection address resolved server-side | Yes | BLOCKED. No collect_venue line could be constructed in production. |
| Collect-priced lines on a shipped order | FLAG: priceLine keys the in-store price off `item.lineFulfilment === "collect_venue"` regardless of the order-level fulfilment, and the placement re-validation only runs when the ORDER is collect_venue; a buyer who adds via the Collect CTA then flips the tile to "Ship to me" is charged the in-store price (set on the assumption of zero fulfilment cost) plus shipping, with no placement check. Collect lines under a ship order should be re-priced to the tier price or refused | BLOCKED. Same reason. |
| Quantity vs stock: only the sold-out predicate (available false or quantity_available <= 0) is enforced | FLAG: the requested quantity is never compared to quantity_available, so a hand-rolled request (or a stale client cap) can buy 10 of a size with 2 in stock; the webhook then decrements stock below zero. The client stepper caps it, but the server is the boundary | FIXED. Requesting quantity 5 of a work with quantity_available 1 returns 409 {"error":"Only 1 of \"Upon Reflection\" is available.","code":"insufficient_stock","available":1}; quantity 99 is rejected by the schema with a 400. |
| Shipping: same calculateOrderShipping helper as the display page; divergence from the client's expected figure logged; shipping line skipped for both collect modes | Yes, but note the per-line shippingPrice, dimensions and framed inputs come from the client, so unlike item prices the shipping total is still client-influenceable (a forged shippingPrice of 0 ships free); worth pinning to DB values | FLAG STANDS, and it is exploitable. Forging shippingPrice to 0 produced a Stripe session with amountTotal £49.99 and NO shipping line at all, against £53.49 for the honest payload. £3.50 of shipping is obtainable free. (Both sessions were left unpaid and abandoned.) |
| International gating: unsupported country 400; non-UK ship orders refused with a named artist when any cart artist is UK-only (DB-read, fail-closed) | Yes | WORKS for the display side: the country select was locked to GB with the UK-only helper. The server refusal was not driven. |
| QR venue attribution: signed token verified and honoured only when the claimed artist is in the cart; bare venueSlug fallback until QR_ATTRIBUTION_ENFORCE=1; enforcement without ORDER_TOKEN_SECRET fails loudly with a 503 instead of silently zeroing venue shares | Yes | WORKS. /api/qr/fin-coles?vs=testing-venue minted a va= token whose payload decodes to {"venueSlug":"testing-venue","artistSlug":"fin-coles","exp":…} 24 hours ahead, and the checkout that followed without a token recorded venue_revenue 0 and venue_slug NULL. |
| Self-purchase guard: authenticated artists cannot buy their own work (403); demo accounts blocked strictly | Yes; note it only fires when an Authorization header is present, so an artist checking out logged-out (their own email as guest) bypasses it, acknowledged limitation | BLOCKED. Not exercised; the purchase was made by a customer, not the selling artist. |
| Stripe Connect pre-flight: refuses (422) when any cart artist cannot receive payouts, with per-artist naming | Yes | WORKS, and it fires for real. POST /api/checkout with a mark-smith line returns 422 {"error":"mark-smith isn't ready to take orders yet. Try again in a few minutes.","blocked":["mark-smith"]}. Worth noting for the owner: the buyer only meets this after choosing a size and frame and filling the whole delivery form, and "try again in a few minutes" implies a transient problem when the artist is simply not onboarded. |
| Stripe session minted with slim metadata; full server-priced cart, shipping blob (with fulfilment, collection notes and resolved collection address) and per-artist shipping pence saved to cart_sessions for the webhook | Yes | WORKS. The session was minted and the webhook later reconstructed the full order from it (correct prices, shipping, fulfilment and fee split), which requires the saved cart_session. |
| success_url /checkout/confirmation?session_id=, cancel_url /checkout; origin preferred from the request | Yes | WORKS. Stripe redirected to /checkout/confirmation?session_id=cs_test_… on success. |
| Catch-all 500 "Failed to create checkout session" | Yes | BLOCKED. No 500 was produced. |

## API: GET /api/checkout/session

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Unauthenticated session lookup by id, response minimised to id, payment_status, total and line items (E39 privacy fix removed email, address, metadata and cart) | Yes | WORKS. GET /api/checkout/session?id=cs_test_… returns exactly {id, status, amountTotal, lineItems} with no email, address or metadata. |
| 400 without id, 500 on Stripe failure | Yes; the confirmation page's failure to check the returned status is flagged on that page | WORKS. Omitting the parameter returns {"error":"Session ID required"}. Note the parameter is `id`, not `session_id`, though the confirmation page passes session_id in its own URL. |

## API: /api/orders (GET list, PATCH status)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| GET: authenticated; artists see seller-side orders (by user id or slug) plus their own purchases, venues see venue-attributed orders plus purchases, customers see orders by user id or email; email sanitised before the .or() filter; legacy stringified JSON columns re-parsed defensively | Yes | WORKS for the customer branch: GET /api/orders returned the new order to the QA-TEST customer even though orders.buyer_user_id is NULL, so the email match is doing the work. |
| PATCH: role-scoped status moves, sellers may set artist_notified/awaiting_dispatch/processing/shipped/cancelled, buyers delivered/disputed/cancelled, so the paid party cannot self-attest delivery; state machine validates the transition (422) | Yes | BLOCKED. No status transition was driven; that belongs to the artist and venue passes. |
| PATCH stamps delivered_at only on the first transition into delivered (drives the 14-day refund window) and appends structured status_history | Yes | BLOCKED. Same reason. |
| PATCH on delivered: executes pending Stripe transfers immediately (per-transfer try/catch, failures surfaced as payoutFailures and retried by cron), attributes venue revenue to the placement exactly once | Yes | BLOCKED. Same reason. |
| PATCH on cancelled: pending transfers cancelled | Yes | BLOCKED. Same reason. |
| Lifecycle event recorded and dispatcher emails sent (buyer and artist) with idempotency keys; residual direct email covers only statuses the dispatcher does not, avoiding double sends | Yes | BLOCKED for the emails. The order.placed lifecycle event was written. |
| Demo accounts soft-blocked on PATCH; authz errors mapped to proper 403/404 | Yes | BLOCKED. No demo account exists to test with. |

## API: POST /api/orders/track

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Aggressive rate limit (12/min) on an enumeration-tempting endpoint | Yes | BLOCKED. The rate limit was not driven, deliberately, to keep the lookup usable. |
| Token-first (signed HMAC from receipt emails) with orderId+email fallback; identical 404 for not-found and email-mismatch so order ids cannot be confirmed | Yes | WORKS for the fallback path: a correct id with the wrong email returns the same 404 "No matching order" as a genuinely absent order. |
| Response scoped to safe fields (status, items, totals, history, tracking number); no PII beyond what the requester already supplied | Yes | WORKS. The 200 body carries id, orderNumber, status, placedAt, artistSlug, total, shipping, currency and items only. |

## API: /api/orders/[id]/events (GET stepper data, POST confirm delivery)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| GET: token path (token must match the order id AND the buyer email) or session path with buyer/artist/venue party checks (venue resolved via venue_profiles.user_id); 403 otherwise | Yes | WORKS for the session path: the signed-in buyer loaded /orders/<id> and got the stepper. |
| GET returns the order summary plus ordered order_events for the stepper in one round trip | Yes | WORKS. One round trip returned the summary and the ordered events. |
| POST accepts only order.delivery_confirmed; buyer-only (token email or session email must match buyer_email); idempotent upsert | Yes; the mismatch between this event and actual escrow release is flagged on the page row | BLOCKED. The order never reached delivered. |

## API: browse feeds (GET /api/browse-artists, GET /api/browse-collections, GET /api/collections/[id])

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| browse-artists: rate-limited, 60s revalidate, merged seed+DB artists through toPublicArtist (no postcode, coarsened coordinates for anonymous callers); subscription gating when GATING_V1 is on | Yes | WORKS. The feed merges seed and DB artists (41 listed against 14 DB rows) and no postcode appears in the payload. |
| browse-artists failure returns an empty artists array with 500, and the browse page falls back to seed data | Yes | BLOCKED. No failure was induced. |
| browse-collections: available collections newest-first with artist names/images joined and a picsum cover fallback; DB failure returns an empty list | Yes | WORKS. The collections feed returns the single available collection with the artist joined. |
| collections/[id]: available-only single collection, resolved works in the artist's chosen sizes with selected-size prices, artist arrangement flags (defaults open when columns predate the feature) | Yes, except the works projection omits quantity_available, per-size shippingPrice and placed_at_venue, which starves the collection page of stock caps, real shipping inputs and the placed-at chip (flagged on that page) | FLAG STANDS on the projection. The collection page renders no stock information and no "Placed at" chip for a work that IS placed, which is exactly the starvation the flag describes. |

## API: /api/saved (GET, POST, DELETE)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| All three verbs authenticated; rows scoped to the caller's user id | Yes | WORKS. GET /api/saved is called on every authenticated page load and POST /api/saved succeeded for the signed-in customer. |
| POST upserts on (user, type, id) so double-saves cannot duplicate; DELETE by the same key; demo accounts soft-blocked on writes | Yes | BLOCKED for the double-save guarantee. My save fired twice from a synthetic event and both returned 200 {"success":true} with no duplicate visible in the UI, which is consistent with an upsert but is not proof. |

## API: POST /api/refunds/request (14-day refund window)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Dual auth: bearer session, or the signed order token from receipt emails so guest buyers can request refunds; token is order-scoped (403 on mismatch) | Yes | BLOCKED. No refund was requested. |
| Requester must be the buyer (email match), the order's artist, or the attributed venue; typed as such on the row | Yes | BLOCKED. Same reason. |
| Full vs partial with positive-amount validation and a cap at the order total; any non-rejected existing request blocks duplicates (409) | Yes | BLOCKED. Same reason. |
| Eligibility window (pre-dispatch always, 14 days from delivered_at after delivery) enforced by isRefundEligible in the customer portal UI | Yes as UX, but the API itself never checks the window or the order status, so a direct POST can file a refund request on a shipped or years-old order; admin review backstops it, still worth server-side enforcement | BLOCKED. Same reason. |
| Notifications: admin operational alert (idempotent), artist email in request-tense (deliberately not the past-tense refund template), in-app bell for the artist with a deep link, skipped when the artist is the requester | Yes | BLOCKED. Same reason. |

## API: POST /api/disputes (buyer side)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Authenticated, rate-limited, demo-blocked; exactly one of orderId or placementId; opener must be a party via the shared authz helpers; category and description validated | Yes | WORKS. POST /api/disputes {orderId, category, description} from the buyer returned 201 {"success":true,"disputeId":"b8bf8a4e-a110-4c45-acf8-96070630b217"} and the row was created with opener_user_id set to the buyer. |
| Deliberately non-idempotent rows with idempotent emails keyed on the dispute id | Yes | WORKS as far as observed: one call produced exactly one dispute row. |
| Both order parties emailed with next steps; order.disputed lifecycle event recorded with the dispute id | Yes | WORKS for the event: order_events gained order.disputed at 21:33:28, right after order.placed. The emails themselves were not read, but the UI states "We've opened a case and emailed both you and the artist." |
| Buyer-facing entry point | FLAG: nothing in the buyer UI calls POST /api/disputes; no page or component references it (only admin/disputes reads the admin list). The order page's only affordance is a generic /contact link, so the dispute feature remains unreachable for the people it was built for | FIXED. The buyer UI does call it: the "Report a problem" form on /orders/<id> posts POST /api/disputes and the stepper then shows "Problem reported / We've opened a case and emailed both you and the artist… We hold the payout while the case is open." |
| Dispute email deep link | FLAG: OrderDisputeOpened links to `/orders/<id>/dispute`, a route that does not exist (only /orders/[id] does), so both parties' emails land on a 404 | BLOCKED. The email body was not read, so the deep link could not be checked. Note /orders/<id>/dispute is not needed by the current UI, which handles the case inline. |

## API: offers (POST /api/offers, POST /api/offers/[id]/checkout)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| POST /api/offers: venue-only for new offers (customers get a clear "customer_cannot_make_offers" refusal matching the modal copy; artists may only counter), amount capped, optional size label pins the 60% floor to the chosen variant, collection floor pinned to bundle_price | Yes | BLOCKED. A probe POST /api/offers as the customer returned 400 "Invalid offer" on payload shape before reaching the role check; retested in area F with the venue account. |
| Offer floor: minimum 60% of asking, minimumPence returned so the modal can show the exact figure | Yes | BLOCKED. Same reason. |
| POST /api/offers/[id]/checkout: buyer-only, accepted-only, strict demo block | Yes | BLOCKED. No accepted offer exists for the QA-TEST customer. |
| Stock re-validation before payment (works sold/deleted since acceptance, collection withdrawal), with a compare-and-set expiry so a concurrent payment cannot be stamped over | Yes | BLOCKED. Same reason. |
| Payout pre-flight and platform-fee resolution before money moves; integer-pence split carried in session metadata for the webhook | Yes | BLOCKED. Same reason. |
| success_url /checkout/confirmation with the offer id; cancel_url /customer-portal/offers | FLAG: /customer-portal/offers does not exist (customer-portal has addresses, messages, saved, settings; offers live under /venue-portal/offers), so a venue that cancels on the Stripe page lands on a 404. Should be /venue-portal/offers | BLOCKED. Same reason. |
| Buyer "Complete payment" entry (OffersList pay button plus `?pay=` deep link from the acceptance notification) posts to this endpoint and redirects to Stripe | Yes | BLOCKED. Same reason. |

## API: visualiser and tracking (POST /api/works/[id]/mockups, POST /api/walls/render-quick, POST /api/analytics/track, GET /api/qr/[slug])

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| works/[id]/mockups: flag-gated, artist-only (must own both the work and the render), idempotent by render id; buyer-irrelevant except that promoted mockups appear as extra images on the artwork page | Yes | BLOCKED. Artist-only, checked in area D. |
| walls/render-quick: flag-gated, authenticated, quota-consumed with refund on failure; powers the polished render inside the customer wall sheet, which itself is open to guests for drag/preview and only asks for an account at Render | Yes, matches the "free to play, sign in to render" product intent | BLOCKED. Not exercised. |
| analytics/track: allow-listed event types only (venue_viewed_artist, artwork_view, profile_view), rate-limited, 60s visitor dedupe | Yes | WORKS. POST /api/analytics/track {"event_type":"artwork_view",…} returned 200 {"ok":true}, and profile and artwork view counters incremented across visits. |
| qr/[slug]: logs qr_scan with venue resolution (fresh display name from venue_profiles so renames do not require reprints), work id or legacy title, then 302s to /browse/[slug] with ref=qr, venue slug, signed attribution token (best-effort), venueName, work and size params | Yes; note a label carrying only `w=` (id) and no title lands on the profile without auto-opening that work, since the redirect only sets `work=` from the title | WORKS. Both QR scans landed in analytics_events as qr_scan; a scan with vs=testing-venue resolves the venue (earlier real rows carry venue_user_id and the display name "Testing Venue"), while the seed-only slug the-copper-kettle resolves to nothing because no venue_profiles row exists for it. |
| Buyer-visible effect of QR venue attribution: the "Seen in <venue>" banner and unchanged prices; the venue's cut comes out of the artist's share server-side and is never itemised to the buyer | Yes, correct presentation | DIFFERS. The attribution half works (wallplace:qr-context is written with the venue slug, name and signed token, and the checkout price was unchanged) but the buyer-visible "Seen in <venue>" banner does not render anywhere on the landing page. |

---

# C. Customer portal and account (User)

Scope: the registered customer portal (dashboard, saved, addresses, settings, messages entry), the shared account pages (/account/appeal, /account/email, /account/email/unsubscribe, /account/export, /account/security), CustomerPortalLayout, PortalGuard as it affects customers, AccountDangerZone, the Header notification bell and role switcher, and the backing APIs: /api/account (DELETE), /api/account/delete, /api/account/email-preferences, /api/account/export, /api/account/preferences, /api/account/roles, /api/customer-addresses (+/[id]), /api/notifications, /api/me/subscription, /api/terms/accept, /api/auth/resend-verification, /api/account/email/unsubscribe. All judgements are grounded in the source read on branch claude/wallplace-remediation-finish-42e4c1.

## Portal access and layout (/customer-portal/*, CustomerPortalLayout + PortalGuard) [registered customer]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Every customer-portal page is wrapped in PortalGuard with allowedType "customer"; an unauthenticated visitor is redirected to /login via router.replace. | Yes | |
| A signed-in user of a different role (artist, venue, admin) gets an info toast ("This is the customer portal. Redirecting to your X portal.") and is redirected to their own portal via portalPathForRole. | Yes | |
| A signed-in user whose email is unconfirmed sees a full-screen "Verify your email" notice showing their address. | FLAG: dead end. The screen has no resend button and no sign-out control, even though POST /api/auth/resend-verification exists; it is only wired on the login page's error state. A user stuck here has to know to log out and fail a login to reach the resend. | |
| PortalGuard's artist-only subscription and review-status checks are skipped for customers (subscriptionChecked is set immediately), so customers never see the artist plan gate or review banners. | Yes | |
| Sidebar navigation with five entries: My Orders, Saved, Addresses, Messages, Settings; the active route is highlighted by exact pathname match. | Yes | |
| Secondary sidebar links: Browse Art (to /browse) and a Logout button; Logout calls supabase.auth.signOut() and PortalGuard's effect then bounces the now-signed-out user to /login. | Yes | |
| Sidebar footer profile chip: first letter of displayName in an avatar circle, the display name, and a fixed "Customer" role label. | Yes | |
| Mobile: hamburger button in a sticky "My Account" bar toggles the sidebar; a dark overlay closes it; every nav link closes it on tap. | Yes | |

## My Orders dashboard (/customer-portal) [registered customer]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Page wraps its content in Suspense with a "Loading orders..." fallback (Next 16 useSearchParams requirement). | Yes | |
| On mount, GET /api/orders loads the customer's orders; the server scopes the query to buyer_user_id = session user OR buyer_email = session email (email sanitised before the PostgREST .or() filter), so a customer only ever sees their own orders. | Yes | |
| Order fetch failure handling: the catch is empty, loading simply ends. | FLAG: a failed /api/orders request renders the "No orders yet" empty state, which tells a customer with real orders that they have none. A distinct error state with retry is needed. | |
| Stat card "Total Orders" shows orders.length. | Yes | |
| Stat card "Total Spent" sums o.total across every order and renders with a hard-coded pound sign. | FLAG: the sum includes cancelled and refunded orders, so it overstates actual spend, and it ignores the per-order currency field that the detail view respects via formatCurrency, so mixed-currency histories are summed as if all GBP. | |
| Status filter pills (All, Active, Delivered, Cancelled) rendered as an aria tablist; Active excludes delivered and terminal states; Cancelled matches cancelled, refunded and disputed. | Yes, though the "Cancelled" pill silently bundling refunded and disputed under one label is slightly loose | |
| Date range filters From/To; the To bound is made inclusive to end of day so an order placed at 23:59 on the To date still matches. | Yes | |
| Free-text search across order_number, order id and item titles, case-insensitive. | Yes | |
| A "Clear" control appears only when any filter is active and resets status, dates and query. | Yes | |
| Selected order, status filter, dates and query all persist in the URL (?order, ?status, ?from, ?to, ?q) via useUrlState, so filtered views and open orders survive reload and can be shared. | Yes | |
| Order list rows are full-width buttons that toggle the detail overlay; each shows order number (falling back to id), date, item count, total via formatCurrency, and a compact status pip tracker. | Yes | |
| "No orders match these filters." message when filters exclude everything. | Yes | |
| Empty state (no orders at all) with "Discover art" CTA to /browse. | Yes | |
| Detail overlay Close button clears the ?order URL param. | Yes | |
| Full OrderStatusTracker in the overlay: six pipeline steps with timestamps read from status_history; cancelled/refunded/disputed render as off-pipeline badges (red for cancelled, amber otherwise). | Yes | |
| Tracking number renders as an outbound carrier link when the format matches UPS, Royal Mail, FedEx or DHL patterns (detectCarrierUrl), otherwise as plain text. | Yes, sensible best-effort with a safe fallback | |
| Items list with quantity and per-line totals, then Subtotal, Shipping (showing "Included" when 0), VAT (only when > 0) and Total, all currency-aware. | Yes | |
| Shipping address block (name, line 1, city, postcode) from the order's shipping JSON; legacy string-encoded items/status_history/shipping are defensively re-parsed on both server and client. | Yes | |
| Confirm delivery: shown only when status is "shipped", explains that confirming releases payment to the artist, disables while in flight, surfaces server errors inline, and optimistically flips the local status on success. Server-side, only the buyer may set "delivered" (BUYER_STATUSES in /api/orders PATCH), matched by buyer_user_id or buyer_email, and unconfirmed orders still pay out via the 14-day cron. | Yes, correct money-boundary design and honest copy | |
| Deep links into the orders area from the rest of the platform: refund and order-status emails use SITE/customer-portal/orders, the refund-approved bell notification links /customer-portal/orders?id={id}, and /orders/[id] links /customer-portal/orders. | FLAG: /customer-portal/orders does not exist as a route and there is no redirect for it in next.config, so every one of those CTAs 404s. Orders live at /customer-portal and the detail param is ?order=, not ?id=. Senders live in other areas but the missing destination (or redirect) belongs here. | |
| /api/orders GET returns the raw order rows (select *) to the buyer, including platform_fee, platform_fee_percent and stripe_payment_intent_id. | Yes, but note the platform's commission on the order is exposed to the buyer in the payload; harmless today, worth trimming to a buyer view model | |

## Refund requests on the dashboard (/customer-portal, detail overlay) [registered customer]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| On mount, GET /api/refunds loads the user's refund requests so history survives reload; the server scopes results per role. | Yes | |
| Status badges on the order: amber "Refund requested: pending review" for pending/processing, green "Refund approved", red "Refund request declined". | Yes | |
| Post-submit confirmation: "Refund request submitted. The artist will review your request." (the API does notify the artist and platform). | Yes | |
| "Request Refund" entry link appears only when eligible: any pre-dispatch status always, or delivered within 14 days of delivered_at (matches the UK 14-day cooling-off period); shipped, disputed, cancelled and refunded orders get no button. | Yes, well-reasoned eligibility with the rationale in order-status-labels.ts | |
| Refund form: Full/Partial radio; partial reveals an amount input with min 0.01 and max set to the order total. | Yes | |
| Partial amount left blank: the client omits amount from the POST; the server 400s with "Partial refund requires a positive amount". | FLAG: the submit button is enabled in this state (only the reason gates it) and the client ignores non-2xx responses, so the user clicks Submit and nothing visibly happens. Either gate the button on a valid amount or surface the 400. | |
| Reason textarea is required; Submit stays disabled until it has non-whitespace content. | Yes | |
| Submit POSTs /api/refunds/request; on 2xx the new request is appended to local state, the form closes and resets. | Yes | |
| Submit failure handling: non-2xx shows nothing, network errors only console.error. | FLAG: silent failure on a money-adjacent action; acknowledged in-code as owner-gated pending the transport migration, but as shipped a rejected or failed refund request gives the customer zero feedback. | |
| Cancel button closes the form and resets type, amount and reason. | Yes | |

## Saved items (/customer-portal/saved) [registered customer]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Suspense fallback "Loading saved items..." while URL state hydrates. | Yes | |
| Tabs Works / Artists / Collections with the active tab persisted as ?tab=. | Yes | |
| Data loading: GET /api/saved (rows scoped to the authenticated user server-side) joined client-side against the public /api/browse-artists payload to resolve titles, thumbnails and artist names. | Yes, though it couples the page to the browse dataset (see fallback row) | |
| Saved work rows: thumbnail, title linking to /browse/{artistSlug}?work={workTitleSlug}, artist name prefix, and saved date. | Yes | |
| Fallback for a saved work that no longer appears in /api/browse-artists (delisted artist, removed work): label becomes formatName(item_id) and the link becomes /browse/{item_id}. | FLAG: works are saved by UUID (SaveButton passes work.id), so the fallback renders a title-cased UUID fragment as the artwork's name and links to /browse/{uuid}, which resolves no artist. The in-file comment still claims item_id is "artist-slug/work-title", which is stale. Vanished works need a "no longer available" row instead. | |
| Saved artist rows: avatar (or person placeholder), name, link to /browse/{slug}. | Yes | |
| Saved collection rows: briefcase icon, humanised collection id as label, link to /browse/collections/{id} which matches the real route. | Yes | |
| Remove button per row: shows "Removing...", only drops the row from the list after a confirmed 2xx DELETE /api/saved (mutate throws on non-2xx), error toast otherwise. | Yes, explicitly fixed so rejected removals no longer vanish then reappear | |
| Per-tab empty states with tailored copy and CTAs: Browse galleries (/browse), Browse portfolios (/browse?view=portfolios), Browse collections (/browse?view=collections). | Yes | |
| Header heart icon (desktop) links to {portal}/saved, so customers land on this page. | Yes | |

## Address book (/customer-portal/addresses + /api/customer-addresses) [registered customer]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| List loads via GET /api/customer-addresses, ordered default-first then newest; a load failure shows an error toast. | Yes | |
| API ownership: every read and write filters by the authenticated user_id on the service-role client, with table RLS as backstop, so one buyer can never read or mutate another's addresses even by guessing UUIDs. | Yes | |
| "Add address" button opens the create form and hides itself while any form is open. | Yes | |
| Form fields: full name, country (ISO select defaulting to GB), line 1, optional line 2, city, postcode; submit disabled until name, line 1, city, postcode and country are non-empty; Enter submits via the form's onSubmit. | Yes | |
| Server validation: zod schema with length caps plus a per-country postcode format check; field errors come back in issues.fieldErrors and the client surfaces the first one in an error toast. | Yes | |
| Create: POST /api/customer-addresses; the first address ever saved is automatically made default server-side, and asking for default demotes the previous default first (respects the partial unique index). | Yes | |
| Edit: prefills the form from the row and PATCHes /api/customer-addresses/{id}; success toast "Address updated". | Yes | |
| "Set default" action on non-default rows PATCHes isDefault true; the server demotes the old default before promoting. | Yes | |
| "Set as default" checkbox inside the create/edit form. | Yes | |
| Delete: destructive ConfirmDialog showing name, line 1 and postcode; on confirm DELETE /api/customer-addresses/{id}; if the deleted row was the default, the server promotes the most recently created remaining address so the account is never left without a default. | Yes, thoughtful default re-election | |
| "Default" badge on the default address row. | Yes | |
| Empty state "No saved addresses" with CTA "Add address" whose href is "#". | FLAG: dead control. The CTA renders as a link to "#" and does not open the create form; it should trigger startCreate like the header button. | |
| Page subtitle claims addresses are "for faster checkout". | Yes, checkout genuinely fetches /api/customer-addresses to pre-fill | |
| Demo-guard behaviour: POST/PATCH/DELETE return 200 with {demo:true} for configured demo users while writing nothing. | FLAG: the client treats any 2xx as success, so a demo session would see "Address saved" toasts for writes that never happened and the list would quietly disagree. Only artist/venue demo ids are configurable today so no customer hits it, but the contract mismatch (soft-200 vs mutate-success) is latent on all three verbs. | |

## Settings (/customer-portal/settings + /api/account/preferences) [registered customer]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Account Details card shows display name and email as read-only fields with "Not set" fallbacks. | Yes | |
| "Change Password" sends supabase.auth.resetPasswordForEmail with a redirect to /reset-password (page exists), shows "Sending..." while in flight and a confirmation line after. | FLAG: the error branch does nothing; if Supabase rejects the request the button just resets with no message, indistinguishable from not having clicked. Surface the failure. | |
| Notification Preferences card: three checkboxes (Order updates, Messages from artists & venues, Newsletter & digest) driven by useNotificationPrefs, which GETs /api/account/preferences on mount and PATCHes per toggle with optimistic update and revert-plus-error on failure. | FLAG: non-functional end to end for customers. (1) Nothing in the codebase ever inserts a customer_profiles row (signup does not create one), and the PATCH is an UPDATE ... WHERE user_id = X, which matches zero rows yet still returns ok, so the toggle looks saved and silently reverts on next load. (2) Even where a row exists, no send path reads the customer columns: order emails are category orders_and_payouts (criticalAlwaysSend), message-notification emails only consult artist_profiles/venue_profiles.message_notifications_enabled, and email_digest_enabled has no consumer at all. (3) The controls that genuinely gate customer email live in email_preferences behind /account/email, which this page never links to. The card needs wiring to the real preference system or removing. | |
| Preference save errors render a red line under the card ("Could not save preference. Please try again."). | Yes, as a mechanism, though per the row above the failing path for customers is actually the silent zero-row success | |
| /api/account/preferences routing: role from verified token metadata maps to artist_profiles/venue_profiles/customer_profiles; admin and unknown roles get a clear 400; both verbs whitelist fields and never trust a body user id. | Yes | |
| AccountDangerZone is included at the foot of the page (assessed in its own section below). | Yes | |

## Account deletion (AccountDangerZone + POST /api/account/delete + DELETE /api/account) [registered customer, shared with artist/venue]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Type-to-confirm input requiring the exact string "DELETE MY ACCOUNT", with an aria-label, error reset on typing, and the red button disabled until the string matches. | Yes | |
| Warning copy: "permanently deletes your profile, messages, saved items, and any orders attached to your account. This cannot be undone." | Yes, it accurately describes what POST /api/account/delete does | |
| POST /api/account/delete derives the user solely from the verified bearer token; a smuggled body user_id cannot delete someone else's account; the confirm string doubles as a CSRF-fluke seatbelt. | Yes | |
| Erasure sweep: 40+ user_id-keyed tables deleted in FK-safe order, then auth.admin.deleteUser; customer_addresses and similar cascade via their FK to auth.users. | Yes for the user_id-keyed universe | |
| Failure policy on the hard delete: per-table errors are console.error'd and the sweep continues, then the auth user is deleted regardless. | FLAG: if a scrub fails, PII survives while the account is destroyed, so the person can no longer log in to notice, the exact failure mode the sibling soft-delete route documents and refuses (it returns 500 and keeps the account when any step fails). The two endpoints take opposite positions; the hard path should at least refuse auth deletion on scrub failure too. | |
| Legal posture of deleting orders: the hard delete removes orders and refund_requests rows outright, while DELETE /api/account exists precisely because those records "must be preserved for tax/legal reasons" and anonymises them instead. | FLAG: the customer-facing UI only offers the hard path, so every self-service deletion also destroys the platform's tax and dispute records. The two endpoints assert contradictory legal requirements; needs an owner ruling on which is correct, and the UI pointed at the survivor. | |
| Email-keyed residue after hard delete: orders matched only by buyer_email (guest and legacy purchases; per the orders route's own comment all live production orders are email-keyed with no buyer_user_id), plus newsletter_subscribers, email_suppressions and null-user email_events, are untouched. | FLAG: the route documents the newsletter/suppression gap as by-design, but email-keyed orders holding the buyer's name and shipping address are not in that documented list, and the soft-delete scrubs exactly those by email. A right-to-erasure "success" can leave the customer's address sitting in an order row. | |
| Demo protection: DELETE /api/account calls assertNotDemo; POST /api/account/delete does not. | FLAG: inconsistent. A configured demo account can hard-delete itself through the settings page while every other mutation in this area is demo-guarded. | |
| On success: best-effort supabase signOut (may 401 since the auth user is gone, swallowed by design) then redirect to the homepage. | Yes, though there is no goodbye confirmation screen or deletion-confirmation email; acceptable for MVP, worth noting | |
| Error display: ApiError code or "Could not delete your account." / network fallback, and the busy state releases. | Yes | |
| DELETE /api/account (soft delete, confirm "DELETE"): anonymises artist/venue profiles, deletes saved items and notifications, redacts sent messages, anonymises email-keyed orders/applications, deletes waitlist signups, checks every step, and refuses to delete the auth user if anything failed, telling the user support will finish by hand. | FLAG: sound endpoint, but nothing in the UI calls it, so it is dead from the product's perspective and users are never offered the anonymise-but-keep-history option; also the task brief expects GET /api/account, which does not exist (nothing calls one either). | |

## Messages entry (/customer-portal/messages, page shell only) [registered customer]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Page shell renders the shared MessageInbox with portalType "customer" inside the portal layout, behind Suspense with a loading fallback. | Yes (inbox internals are assessed in the messaging section) | |
| userSlug passed to the inbox is derived as slugify(displayName), else the email local part, else "customer". | FLAG: fragile identity wiring. The slug is used as sender_name on outgoing messages and as the fallback "is me" match for legacy rows without sender_id, so a display-name change orphans old attribution and two customers named alike share a slug. sender_id is the primary match so the blast radius is limited, but the derivation deserves a stable server-issued value. | |
| ?artist= and ?artistName= query params preselect a conversation with that artist (the Message Artist button's deep link). | Yes | |

## Notification bell (Header dropdown + /api/notifications) [registered customer, shared]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Bell icon appears when signed in, with an unread badge capped at "9+"; the count refreshes on mount, every 60 seconds, and when the dropdown closes. | Yes | |
| GET /api/notifications returns the user's 30 newest rows plus unreadCount, scoped by the verified user id, and degrades to an empty list if the table is missing. | Yes | |
| Dropdown lists the latest 12 notifications with unread styling (accent bar, dot, bold title), icon per kind, description and date. | Yes | |
| "Mark all read" optimistically clears the list and badge, then PATCHes {all:true}; failures are left for the next poll to reconcile. | Yes, a reasonable trade for a low-stakes action | |
| Clicking a notification optimistically marks it read, PATCHes {id}, closes the dropdown and navigates to the row's link, or a kind-based fallback when link is empty. | Yes as a mechanism | |
| Customer notification destinations: the stored link on the refund-approved notification is /customer-portal/orders?id={orderId}, and the "sale" kind fallback is {portalBase}/orders. | FLAG: both point at /customer-portal/orders, which does not exist; the working target is /customer-portal?order={orderId}. A customer tapping their refund-approval notification lands on a 404. | |
| Empty dropdown state "No new notifications". | Yes | |
| PATCH /api/notifications validates the id (non-empty string, max 100 chars) and scopes both mark-one and mark-all to the caller's user_id. | Yes | |
| Mobile menu entry labelled "Notifications" with a bell icon. | FLAG: it is a plain link to the portal dashboard; there is no notifications list on mobile (and no notifications page anywhere), so the label promises a surface the destination does not have. | |

## Portal switcher (Header "Other accounts" + /api/account/roles) [registered customer, shared]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| GET /api/account/roles returns the distinct user_type values across all auth users sharing the caller's email, using a properly paginated lookup (the old 50-user default is fixed); only role labels are exposed, never other accounts' ids; failures degrade to an empty list rather than a 500. | Yes | |
| The portal dropdown shows "Switch to X portal" entries for each other role; clicking signs the user out and pushes /login?email={email}&hint={role}. | FLAG: the login page prefills the ?email= seed but never reads &hint=, so the chooser cannot steer sign-in towards the named role's account; with one email shared across role accounts the user just lands wherever email+password resolves. Either consume the hint or drop it. | |

## Email preferences hub (/account/email + /api/account/email-preferences) [any signed-in user, linked from email footers]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Signed-out state explains the page and offers a Sign in CTA carrying next=/account/email back through login. | Yes | |
| Signed-out helper line "Looking to unsubscribe from a single email? Use the link in your most recent email" is itself a link to /account/email/unsubscribe with no params. | FLAG: following it lands on the unsubscribe page's failure state ("We couldn't read the unsubscribe details from the link"). The sentence should be plain text, the link is actively misleading. | |
| Seven category toggles (placements, messages, digests, recommendations, tips, newsletter, promotions) with optimistic PATCH per flip, a "Saved hh:mm" line, and an inline error with state kept on failure. | Yes | |
| The toggles are honoured for real: src/lib/email/send.ts consults email_preferences before every non-critical send (category key false skips with skipped_opted_out). | Yes | |
| Header copy "Order receipts, password resets, and legal notices always send, you can't turn those off" matches criticalAlwaysSend on the security/legal/orders_and_payouts categories. | Yes | |
| "Pause non-critical email" vacation date picker with Clear; send.ts skips every non-critical email while vacation_until is in the future. | Yes | |
| GET merges a missing row over defaults (newsletter and promotions default off, the rest on), matching the migration's column defaults. | Yes | |
| PATCH whitelists fields, coerces vacation_until to ISO, rejects bodies with no valid field, and upserts keyed on the token's user id. | Yes | |
| digest_frequency exists on the API contract (daily/weekly/off) but has no control on this page and no consumer anywhere in the send pipeline. | FLAG: dead field; either expose and consume it or drop it from the contract. | |
| Discoverability: the page is only ever linked from email footers; no portal navigation or settings page links to it. | FLAG: the customer settings page carries a broken preferences card (section above) while the working controls sit here unlinked. At minimum, settings should link this hub. | |

## One-click unsubscribe (/account/email/unsubscribe page + /api/account/email/unsubscribe) [email recipient, no session]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| The page is a server component that applies the unsubscribe during GET render: validates ?c= against the category list, resolves the preference key, and upserts email_preferences.{key}=false for ?u= via the admin client, then renders the outcome. Treating the emailed link as the bearer is a deliberate, documented trust decision. | Yes as a model, with the flags below | |
| Success state: "You've been unsubscribed from {category}... Critical messages ... will still come through." | Yes | |
| The visible footer unsubscribe link that EmailShell builds is /account/email/unsubscribe?c={category} with no u param. | FLAG: the page requires both c and u, so the link every notify/news email shows its reader always lands on the "couldn't read the unsubscribe details" failure state. Only the hidden List-Unsubscribe header URL carries u. The page's primary human entry point cannot ever succeed as wired. | |
| RFC 8058 one-click: send.ts sets List-Unsubscribe-Post: List-Unsubscribe=One-Click, but the List-Unsubscribe URL is the PAGE (/account/email/unsubscribe), not the API. | FLAG: mail clients POST to the page URL, and App Router pages do not accept POST, so Gmail/Yahoo one-click unsubscribes fail with a 405. Meanwhile POST/GET /api/account/email/unsubscribe, built exactly for this, has zero references anywhere: dead code. Point the header at the API route. | |
| The u parameter is a raw user UUID with no signature or expiry. | FLAG: anyone who learns a user's UUID can silently flip their categories off, and link-scanning middleboxes that prefetch the GET will unsubscribe the user without a click. A signed token (HMAC of user+category) is the standard fix. | |
| email_preferences.user_id has no FK to auth.users, and neither the page nor the API is rate limited. | FLAG: the unauthenticated upsert accepts arbitrary UUIDs, so junk rows can be inserted without bound. Add validation that the user exists (or the signed token above) plus a rate limit. | |
| Critical-category state ("Security alerts are required for service...") links "delete your account" to /account/delete. | FLAG: no such page exists, the link 404s. The deletion UI lives inside each portal's settings page; link there or to a real landing page. | |
| Missing-params state and DB-error state with a support mailto. | Yes | |
| API GET handler's comment says it redirects to the page-side success view; it actually returns bare JSON. | FLAG: cosmetic today because nothing links the API, but the comment misdescribes the behaviour; if the one-click fix lands, the GET should redirect as the comment intends. | |

## Data export (/account/export + GET /api/account/export) [any signed-in user]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Signed-out state with a Sign in CTA carrying next=/account/export. | Yes | |
| The page auto-starts an export on load by calling mutate("/api/account/export", { method: "POST" }). | FLAG: the API route only exports GET, so every attempt returns 405 and the page always lands in the error state with the privacy@ fallback. The subject-access feature is dead as shipped: one side must change verb. | |
| Ready state: "Your data is ready." with a Download button when the response contains downloadUrl, otherwise the promise "We'll email you a download link shortly." | FLAG: unreachable today (see 405 above), and even against GET the API streams the JSON dump inline with a Content-Disposition header and returns no downloadUrl, and no email job exists, so the no-URL branch promises an email that will never arrive. The page should just link the authenticated GET as a download. | |
| The no-URL ready copy is written as the JS string "We&rsquo;ll email you...". | FLAG: HTML entities are not decoded inside JSX string expressions, so the literal characters "We&rsquo;ll" would render on screen. | |
| Error state shows the server's reason plus a privacy@wallplace.co.uk manual-export escape hatch. | Yes | |
| GET /api/account/export composes a JSON dump of profiles, works, placements, records, photos, messages both directions, orders as buyer (by email) and artist, refund requests, saved items, terms acceptances, notifications, applications, waitlist, enquiries and collections, served as an attachment. | FLAG: materially incomplete as a right-of-access response. It queries "applications" and "waitlist", tables that do not exist (real names artist_applications and waitlist_signups, per the erasure route's own verified audit), and keys artist_collections by user id where the column holds artist_profiles.id, so those sections are silently always empty (fetchAll swallows errors). It also omits customer_addresses, customer_profiles, email_preferences, purchase_offers, commissions and the visualizer tables that the deletion sweep demonstrably knows exist. And it is unthrottled despite fanning out 20+ admin queries per hit. | |

## Account security landing (/account/security) [security-email recipient]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Signed-in users are bounced to their portal's security surface: artist to /artist-portal/profile, venue to /venue-portal/profile, customer to /customer-portal/settings. | Yes, sensible routing so email CTAs stop 404ing | |
| Page copy tells the reader to secure the account "by resetting your password and reviewing recent activity". | FLAG: no recent-activity or session view exists anywhere in the product, and the customer destination offers only a password reset. The copy promises a capability that is not built; trim it to the reset. | |
| Signed-out actions: "Reset password" to /forgot-password and "Sign in" to /login (both pages exist). | Yes | |
| Compromise escalation line with a security@wallplace.co.uk mailto including what to send. | Yes | |

## Appeal an account decision (/account/appeal) [suspended or moderated user]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Static, noindexed explainer reachable from the moderation emails' "Appeal this decision" CTA (OperationalPolicyViolationWarning, OperationalAccountRestricted both link it). | Yes | |
| Instructions to email appeals@wallplace.co.uk with account email, case reference, explanation and evidence. | Yes, appeal-by-email is a fair MVP scope, and it works for suspended users who cannot sign in; whether the mailbox exists is an ops question outside code | |
| Expectations list: acknowledgement within 2 business days, decision within 10, review by someone other than the original decision-maker. | Yes, provided operations can honour the stated SLAs | |
| Cross-link to the Complaints Policy at /complaints (page exists). | Yes | |

## Terms acceptance (/api/terms/accept, re-acceptance UI) [signing-up or signed-in user]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| POST /api/terms/accept records an acceptance row: rate limited 10/min, zod-validated body, authenticated calls take the email from the token (the body cannot name a third party), audit IP only from platform headers (null over "unknown"), user agent recorded. | Yes | |
| Pre-signup path: the six signup/application callers fire before email confirmation, so unauthenticated acceptance rows keyed only by a body email remain forgeable. | FLAG: known, honestly documented residual; the sound fix (record acceptance post-confirmation from the token) is an owner decision on when the evidence is stamped. Carry it on the launch list rather than treating it as closed. | |
| Terms re-acceptance UI: none exists. No component checks the accepted terms_version against a current version, and /api/terms/accept is only ever called from signup flows. | FLAG: when the terms are next revised there is no mechanism to prompt existing users to re-accept, so the acceptance trail will only ever hold each user's signup-era version. Fine for launch day one, but the gap should be a recorded follow-up. | |

## Supporting endpoints without their own customer UI [cross-checks]

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| GET /api/me/subscription returns { active, plan, userType, gatingEnabled } from the token; for customers it is always inactive with null plan (only artist/venue subscriptions exist), which callers of use-subscription handle. | Yes | |
| POST /api/auth/resend-verification: rate limited 3 per 5 minutes, byte-identical acknowledgement regardless of account state (no enumeration oracle), redirect built server-side through safeRedirect, anon client by design. | Yes, well built; its only UI entry is the login error state (see the PortalGuard flag for the missing portal-side entry point) | |
| /api/account exposes DELETE only; there is no GET "who am I" handler and nothing in the codebase calls one (profile data comes from the auth session and profile endpoints). | Yes, noting the audit brief expected a GET that does not exist | |

---

# D. Artist portal (Artist)

Scope: every page under `/artist-portal`, the components they mount (ArtistPortalLayout, PortalGuard, ApplicationGate, BlogEditor, ArtistPricingCards, PlacementActionItems, PaidLoanPaymentChip, OffersList, InstagramPostGenerator, PayoutExplainerModal, AccountDangerZone), and the backing APIs (`/api/artist-profile`, `/api/artist-works`, `/api/collections`, `/api/blogs*`, `/api/analytics/artist`, `/api/subscribe*`, `/api/me/subscription`, `/api/stripe-connect/*`, `/api/dashboard`, `/api/saved`, `/api/orders`, `/api/refunds*`, `/api/works/[id]/mockups`, `/api/qr/[slug]`, `/api/offers*`, `/api/artwork-requests/[id]/responses`). The shared inbox component internals, the shared placement detail page and the checkout side are other agents' areas. "Demo guard" below refers to `assertNotDemo` (soft: returns 200 with `{demo:true}` and no real write) and `assertNotDemoStrict` (403), active only when `DEMO_ARTIST_USER_ID` / `DEMO_VENUE_USER_ID` env vars are set.

## Portal access, guards and chrome (/artist-portal/* via layout.tsx, PortalGuard, ArtistPortalLayout)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Every `/artist-portal/*` route is wrapped in `PortalGuard allowedType="artist"`: signed-out users are `router.replace`d to `/login` | Yes | |
| Signed-in user of a different role (venue, customer, admin) gets an info toast "This is the artist portal. Redirecting to your X portal." and is redirected to their own portal via `portalPathForRole` | Yes | |
| Unverified email (no `email_confirmed_at`) renders a "Verify your email" full-page notice with the user's address instead of the portal | Yes | |
| PortalGuard fetches `/api/artist-profile` on every portal page to read `review_status` and `subscription_status`; billing and settings are exempt from the subscription check so lapsed users can fix billing | Yes | |
| `review_status = pending`: portal stays usable with a full-width amber "Your application is under review" banner (offset `lg:ml-56` to clear the fixed sidebar) plus a "Build profile" link | Yes | |
| `review_status = rejected`: portal replaced by "Application not approved" dead-end with a mailto link to applications@wallplace.art | Yes | |
| `review_status = approved` with `subscription_status` none or incomplete: portal usable with a persistent "You're approved. Pick a plan..." banner linking to billing; copy promises "Your first month is free" | Yes, matches the 30-day trial for first-time subscribers in `/api/subscribe` | |
| `subscription_status` past_due or canceled: portal (except billing/settings) replaced by a "Choose Your Plan" block with "Choose a Plan" (to billing) and "Compare Plans" (to /pricing) buttons | Yes, though see the trial-copy flag on this block below | |
| The past_due and canceled gate copy says "All plans include a free trial, and you won't be charged until it ends. All plans include a first month free." | FLAG: this block is only ever shown to past_due and canceled users, and `/api/subscribe` gives `hadPreviousSub` users zero trial days, so the exact audience seeing this promise is the one audience that will be charged immediately | |
| On a profile-fetch error PortalGuard fails open (lets the user through) | Yes, reasonable for a read guard | |
| ArtistPortalLayout independently re-checks auth and redirects non-artists to `/login`, and checks `artist_profiles` row existence; accounts with no profile row are redirected to `/apply` so they complete the application first | Yes | |
| Full-screen animated "Loading your portal..." bar shown until both the auth check and the profile-existence check settle, preventing a chrome flash before the /apply redirect | Yes | |
| A failed profile-existence fetch (network error) also redirects to `/apply` | Yes with a caveat: a transient network blip on an existing artist bounces them to the application page, but the page itself lets them return | |
| Sidebar nav: Dashboard, Edit Profile, My Portfolio, Showroom, Messages, Placements, My Offers, Artwork Requests, Collections, Saved, Orders, QR Labels, Social Posts, (Blogs when BLOGS_V1 on), Analytics, Billing; Settings and Logout in a secondary section under a divider | Yes | |
| Blogs nav entry only rendered when `isFlagOn("BLOGS_V1")` (prodDefault false), so production hides an editor whose API would 403 every save | Yes, gate and API agree | |
| Active nav item highlighted by exact `activePath` match; document.title synced to "Section \| Artist Portal \| Wallplace" including sub-route prefix matching | Yes | |
| Mobile: hamburger top bar toggles the sidebar as an overlay; tapping the dark backdrop or any nav item closes it | Yes | |
| Sidebar footer shows profile image (or initial avatar) plus display name and the static role label "Artist" | Yes | |
| Logout button calls `signOut()` from AuthContext | Yes | |
| ApplicationGate (used by /apply, the portal's feeder): loading state, signed-out replace-redirect to `/signup/artist?next=/apply`, wrong-user-type notice with "Create artist account" CTA, artists (or legacy accounts without user_type) see the ApplicationForm | Yes | |
| `POST /api/artist-profile` (application/claim flow) creates the profile with `review_status: "pending"` server-side; slug and review_status are server-owned so a client cannot self-approve | Yes | |

## Dashboard (/artist-portal)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| "Welcome back, {first name}" header with an "Your artist portal" pill and an "Edit Portfolio" secondary button | Yes | |
| Whole dashboard loads from one `GET /api/dashboard` call (profile, placements, orders, conversations, works count, refund requests, stats) | Yes | |
| Subscription prompt ("Choose a plan to unlock your full portal", "All plans include a first month free", Choose a Plan button to billing) shown only when the profile row's status is none AND the AuthContext status is not active/trialing, so a paid artist with a stale profile column is not nagged | Yes | |
| Onboarding checklist "Getting Started" with progress bar: Complete your profile (bio + location + at least one style tag), Upload your first work (worksCount > 0), Set up payouts, Get your first placement (any active placement); each row links to the relevant page | Yes | |
| "Set up payouts" ticks complete when `profile.stripe_connect_account_id` exists | FLAG: the Connect account id is written the moment onboarding STARTS (`/api/stripe-connect/onboard` creates the account before redirecting), so an artist who abandoned Stripe onboarding half-way still sees this step ticked; billing's own Payouts panel correctly distinguishes "Continue Setup", the checklist should use the same `onboardingComplete` signal | |
| When all four items complete, checklist shows "You're all set!" then auto-dismisses after 3 seconds, persisting `wallplace-onboarding-complete` in localStorage | Yes | |
| Manual "Dismiss"/"Close" link persists the same localStorage key so the checklist stays hidden across visits | Yes, per-browser only, which is acceptable for a nudge | |
| Stat cards: Active Placements (excludes rows archived by the artist), Total Sales (sum of `artistPayoutPounds`, the artist's net payout, one shared owner in lib/finance/order-money), Enquiries This Month, Profile Views | Yes, and views/enquiries are counted live by `artistTotals` rather than the stale cached columns | |
| "Enquiries This Month" label vs data: `/api/dashboard` computes `totals.enquiries` via `artistTotals` from the same predicates the old cache used | FLAG: the tile says "This Month" but `artistTotals` is an all-time count (the dashboard passes no date window), so the number silently disagrees with the label; the analytics page scopes enquiries by range correctly | |
| PlacementActionItems block ("Action items" with count badge): builds rows from `/api/placements`; pending rows where `canRespond` passes get "Respond to X's placement request"; active rows missing scheduled_for/installed_at/live_from get "Schedule install of {work} with {name}", "Confirm {work} is installed", "Mark {work} live on wall"; each links to `/placements/{id}` | Yes | |
| Action items collapse to 5 with "View all (N)" / "+ N more" toggles; component renders nothing when there is nothing to do | Yes | |
| Recent Activity feed merges refund requests (non-artist-raised), sales, placement lifecycle events and inbound messages, sorted newest first, capped at 8 | Yes | |
| Refund activity rows link to `/artist-portal/orders?id={orderId}` | FLAG: the orders page never reads the `id` query param (no `useSearchParams` in orders/page.tsx), so these deep links, plus the identical link minted by `/api/refunds/process` in-app notifications, land on the unfiltered order list with nothing selected | |
| Sale activity rows show "Sale: {title}, £{payout} to you ({orderId})" using the shared payout helper, and link to `/artist-portal/orders?id=...` | Yes on the amount; the deep link has the same dead-parameter problem as above | |
| Placement activity rows distinguish incoming requests, accepted, live and declined, based on requester_user_id vs the viewer | Yes | |
| Message rows only surface inbound messages (latest sender is not the artist), previewing the first 50 characters, and link to the Messages page | Yes | |
| Empty activity state: "No recent activity yet. Start by logging a placement." with a link to Placements | Yes | |
| Quick Actions panel: Edit Portfolio, View Analytics, Update Availability (links to Placements), Print QR Labels | FLAG: minor, "Update Availability" links to `/artist-portal/placements`, but work availability is edited on the Portfolio page; the label promises a different destination than it opens | |
| Summary card repeats Earnings and Active placements figures | Yes | |
| Relative timestamps ("3h ago", "2d ago", then en-GB date) | Yes | |

## Analytics (/artist-portal/analytics) and /api/analytics/artist

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Date range dropdown (Last 7 days / 30 days / 3 months / 12 months / All time) refetches `/api/analytics/artist?range=...`; the API maps ranges to created_at cutoffs and "all" to no cutoff | Yes | |
| Engagement metric cards: Profile Views, Artwork Views, QR Scans, Enquiries, each labelled with the selected range, with pulse-skeleton loading state | Yes; enquiries are counted from the enquiries table with the same cutoff | |
| Views Over Time multi-line SVG chart (profile/artwork/QR) with hover tooltip, y ticks, at most ~14 x labels, and horizontal scroll wrapper for narrow phones | Yes | |
| Traffic Sources bars with percentage of total, mapping qr/browse/direct to friendly labels | Yes | |
| Top Performing Works list: API counts artwork_view plus qr_scan per work, resolves titles, drops deleted works, merges duplicate titles case-insensitively, top 10 | Yes | |
| "Venues That Viewed You" panel: Premium/Pro (`subscription_plan` premium or pro) see the deduplicated venue list with type and date; others see the count plus "Upgrade to Premium to see which venues are looking at your work" with a billing CTA | Yes, client gating matches the API's `is_premium` computation | |
| Revenue metric cards: Total Sales (net payout, "All time, your share after fees"), Pieces Placed across N venues, Active, Orders | Yes; earnings use `artistPayoutPounds`, consistent with dashboard and orders | |
| Earnings Over Time chart header shows the selected engagement date range | FLAG: the chart is always the fixed last 7 calendar months of orders regardless of the selected range; the "{dateRange}" caption on this card is wrong and should either be removed or the chart should respect the range | |
| Placement status summary chips (Active / Pending / Completed) counted case-insensitively | Yes, the earlier title-case counting bug is fixed for the counts | |
| Placements table (first 10) with Title, Venue, Type (shared arrangement labeller), Status badge, Revenue | FLAG: the status badge still compares against title-case ("Active", "Sold", "Pending") while `p.status` keeps the raw lower-case DB value here (unlike the placements page, this page never normalises), so every badge falls through to the grey default and displays lower-case "active"/"pending"; the counts above were fixed but the badges were not | |
| Performance by Venue table: pieces per venue, sales and revenue counted only from placements with status "sold" and a revenue value, venue status Active/Completed | Yes as far as it goes; note revenue here is placement-level `revenue`, a different series from the orders-based earnings above, which is coherent but unexplained on the page | |
| Empty placements state links to the Placements page | Yes | |

## Artwork requests (/artist-portal/artwork-requests)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Two tabs: "My responses" (default, `mine_only=1`, requests this artist engaged with) and "All open requests" (`status=open` full feed); fetch uses authFetch so private invitations resolve | Yes | |
| "All open requests" is paywalled when GATING_V1 is on and the artist has no active subscription (`useSubscription` reads `/api/me/subscription`); clicking it opens the UpgradePrompt modal instead of switching | Yes | |
| The locked tab is annotated "(Pro)" | FLAG: any active paid plan (core, premium or pro) unlocks the feed (`sub.active` is plan-agnostic), so labelling the gate "(Pro)" overstates the requirement; the UpgradePrompt copy ("part of a paid Wallplace plan") gets it right | |
| Header copy: "Each response counts towards your daily venue-outreach allowance" | Yes, `/api/artwork-requests/[id]/responses` enforces `checkArtistOutreachCap`, a shared daily bucket with placements and first-contact messages | |
| Request cards show title, venue name, description (2-line clamp), intent chips, first 4 medium chips, budget range converted from pence, location; card links to the detail page | Yes; minor: a request with only a max budget renders "£0 to £X", which reads oddly but is honest | |
| Empty states differ per tab ("No open requests right now." vs "You haven't responded to any requests yet. Tap \"All open requests\"...") | Yes | |

## Artwork request detail and response (/artist-portal/artwork-requests/[id]) and /api/artwork-requests/[id]/responses

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Loads `/api/artwork-requests/{id}`; distinct load-error states for 404 ("may have been closed or removed"), other failures, and network errors, all escaping the spinner | Yes | |
| Brief rendered with title, venue, description, intent/budget/location chips over a decorative Unsplash paint backdrop | Yes; note the backdrop is a hotlinked images.unsplash.com asset, an external runtime dependency | |
| Response type picker: Request a placement / Quote a price / Suggest a commission / Just a message, each with an explainer line | Yes | |
| Message textarea is required ("Add a short message explaining the fit.") | Yes | |
| Work picker with per-work size selection (`workSelections` sent alongside legacy `workIds`); picking works is required for "offer" only, optional for placement | Yes | |
| Offer type adds a £ amount converted to `proposedOfferAmountPence`; commission adds amount and timeline; placement adds proposed monthly fee (pence), revenue share % and a QR-enabled toggle that prefill the placement the venue confirms | Yes | |
| Submit POSTs to `/api/artwork-requests/{id}/responses`; error surface prefers the API's friendly message (cap-hit copy included); success flips the form to a submitted state | Yes | |
| API ordering: strict demo 403, artist-only 403, closed-request 422-style refusal BEFORE the daily outreach cap, so a doomed attempt does not burn allowance; cap exceeded returns the structured cap message | Yes | |
| API caps proposed monthly fee at £10,000/month, matching the placement schema bound | Yes | |
| Venue receives an in-app notification (`createNotification`) about the response | Yes | |

## Billing (/artist-portal/billing) and /api/subscribe, /api/subscribe/portal, /api/me/subscription, /api/stripe-connect/*

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Page state comes from `/api/artist-profile` (status, plan, period end, trial end, founding-artist flag); loading placeholder shown until fetched | Yes | |
| Post-Stripe return handling: `?subscribed=true` starts a 30-second poll (2s interval) of the profile until the webhook flips status to active/trialing, showing a blue "Confirming your subscription with Stripe" banner; `?changed=true` shows the green "plan updated" banner; both params are stripped from the URL | Yes, thoughtful handling of webhook lag | |
| Current-plan card (active/trialing): plan name, status badge (Active/Trial/Past Due/Canceled/No Plan), monthly and annual price plus platform fee line, "Manage Subscription" button opening the Stripe billing portal via `POST /api/subscribe/portal` | Yes | |
| Trial banner shows days remaining and end date; founding artists get "Founding Artist free trial" wording (180-day trial set by `/api/subscribe`) | Yes | |
| Active subscription shows "Next billing date" from `subscription_period_end` | Yes | |
| Past-due banner with an inline "Update payment" button (billing portal); canceled banner "Choose a plan below to reactivate" | Yes | |
| Referral code panel ("Your referral code", "Refer another artist and get 30 days free when they upgrade", code display with select-all styling and a Copy-to-clipboard button) | FLAG: dead code. `fetchSub` builds the state object with only status/plan/period_end/trial_end/is_founding_artist and never copies `referral_code` from the profile, so `sub?.referral_code` is always undefined and the panel can never render. Additionally `/api/subscribe` contains no referral redemption logic, so even if displayed there is no wired mechanism granting the promised 30 days; either wire the field through and implement redemption, or remove the panel | |
| Plan picker (no active sub): Core £9.99/mo or £99.99/yr at 15% fee, Premium £24.99 or £249.99 at 8%, Pro £49.99 or £499.99 at 5%, with a Monthly/Annual toggle ("Save 17%"), per-card annual monthly-equivalent shown as an approximation ("~£8.33/mo") | Yes, the maths checks out (annual is about 17% off 12x monthly) | |
| "Start with {Plan}" POSTs `/api/subscribe` with plan and billing cycle; server maps to the six STRIPE_PRICE_* env price ids, creates/reuses the Stripe customer, and returns a Checkout URL the page redirects to | Yes | |
| Plan-picker footer: "All plans include a first month free." shown to canceled/past_due users too | FLAG: same trial-copy problem as PortalGuard, `/api/subscribe` sets `trialDays = 0` when the profile has ever been active/trialing/canceled/past_due, so reactivating users see a first-month-free promise the checkout will not honour | |
| Change Plan section (subscribed users): three cards with Current Plan marker, upgrade cards accented, downgrades neutral, "Changes are prorated automatically" | FLAG: the copy says prorated, but `/api/subscribe` starts a brand-new Checkout subscription and only cancels the previous one after the webhook (`cancel_previous` metadata); that is replace-not-prorate, and a mid-cycle switcher can pay for an overlapping period rather than a prorated difference; either the copy or the mechanism should change | |
| Change Plan feature bullets: Core "Up to 8 works, Standard profile, Basic analytics"; Premium "Up to 20 works, Featured profile + badge, Message venues directly, Full analytics"; Pro "Unlimited works, Premium profile, Message venues directly, Dedicated support" | FLAG: two problems. (1) "Unlimited works" for Pro contradicts `/api/artist-works`, whose POST cap for pro is 50 (`POST_LIMITS = { core: 8, premium: 20, pro: 50 }`); a Pro artist hits a hard 403 "supports up to 50 active works" while every marketing surface says unlimited. (2) "Message venues directly" is listed as Premium/Pro here but the public ArtistPricingCards lists it under Core too; the two surfaces disagree about what Core includes | |
| `/api/subscribe` trial logic: 30 days for first-time subscribers, 180 for founding artists, 0 for anyone with a previous subscription; success URL returns to billing with `?subscribed=true` | Yes | |
| Demo account pressing a subscribe button: `/api/subscribe` soft demo guard returns 200 `{demo:true}` with no URL, and the page toasts the generic "Failed to start checkout" | FLAG: minor, the demo guard's own explanatory message ("You're touring a demo account...") is never surfaced on billing; the client only checks `data.url` | |
| Payment & Invoices card with "Open Billing Portal" (same portal session endpoint) | Yes | |
| Payouts panel, three states from `GET /api/stripe-connect/status`: no account ("Set Up Payouts"), account but incomplete ("Complete your payout setup", "Continue Setup"), complete ("Payouts Active" badge, "Open Stripe Dashboard") | Yes; status = charges_enabled AND details_submitted | |
| "Set Up Payouts"/"Continue Setup" POST `/api/stripe-connect/onboard` (creates a GB Express account on first call, stores the id, returns an Account Link); "Open Stripe Dashboard" POSTs `/api/stripe-connect/dashboard` for a login link; both render inline role=alert errors under the button instead of window.alert | Yes | |
| Stripe Connect onboard/dashboard use the STRICT demo guard (403), and the 403 body's message reaches the inline error via ApiError | Yes | |
| PayoutExplainerModal: one-shot "where's my money" explainer that opens the first time Connect onboarding reads complete, dismiss persisted per-user in localStorage, Escape and backdrop close | Yes | |
| `/api/me/subscription` helper returns active/plan/userType/gatingEnabled for client paywalls | Yes | |

## Blogs (/artist-portal/blogs, /blogs/new, /blogs/[id]/edit) and BlogEditor, /api/blogs, /api/blogs/[id], /api/blogs/mine

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| All three pages call `notFound()` when BLOGS_V1 is off (prod default off), and the sidebar entry is hidden by the same flag, so production has no dangling entry point | Yes | |
| Blog list fetches `/api/blogs/mine` (own rows regardless of status) showing title, created/published date, and a status badge (Draft, Pending review, Published, Rejected, Archived) | Yes | |
| "New blog" button opens the editor; list rows link to `/artist-portal/blogs/{id}/edit` | Yes | |
| Edit page loads `/api/blogs/{id}` (owner sees any status, others only published) with distinct load-error and network-error states | Yes | |
| BlogEditor: title, markdown body, cover image URL field, featured-works picker fed from `/api/artist-works` | Yes | |
| Debounced 800ms auto-save PATCH for existing drafts, gated to draft/rejected status so keystrokes cannot overwrite a post already in review or live; save state indicator (Saving/Saved/Save failed) | Yes | |
| "Save as draft" creates via POST `/api/blogs` on first save (returns the new id, router.replace to the edit URL); "Submit for review" creates first if needed then PATCHes `submit_for_review: true`, flipping status to pending_review | Yes | |
| Save errors surfaced via `describeSaveError` on the parsed API payload | Yes | |
| `/api/blogs` POST 403s for non-artists ("Only artists can author blogs.") and both POST and PATCH 403 when the flag is off; PATCH is owner-only; submit-for-review transition validated server-side (422 on bad state) | Yes | |
| DELETE `/api/blogs/[id]` exists (owner-only) | FLAG: minor, no delete affordance anywhere in the artist UI (neither the list nor the editor), so an artist cannot remove an abandoned draft without admin help; either surface a delete button or accept the gap consciously | |

## Collections (/artist-portal/collections) and /api/collections (write side), /api/collections/[id]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| List loads `GET /api/collections` (the artist's own rows); loading and "No collections yet." empty state with a create CTA | Yes | |
| "New Collection" opens the form: name (required), description, bundle price with £ prefix, thumbnail upload, banner upload, work picker requiring at least 2 works, per-work size select (defaults to the first pricing row; single-size works show the size read-only; unsized works say "No sizes configured"), publish/draft checkbox | Yes | |
| Inline saving-vs-individual comparison: warns "No saving vs buying individually, consider dropping the bundle price" while typing | Yes | |
| Overpriced-bundle guard at save: if bundle > sum of selected sizes, a confirm dialog "Bundle priced above sum of works... Publish anyway?" must be accepted, otherwise the form error explains the override path | Yes | |
| Bundle price validated as a positive finite number | Yes | |
| Save uses POST (new) or PATCH (edit) `/api/collections` and reconciles the returned row into the list; API requires name and >= 2 workIds, scopes rows to the caller's artist profile | Yes | |
| Thumbnail and banner uploads via `uploadImage(file, "collections")` with per-field spinner and inline upload error; remove buttons clear the field | Yes | |
| Edit (pre-fills the form), Delete (ConfirmDialog "Works in it stay in your portfolio", optimistic removal reverting on API failure), and a publish/unpublish toggle per card | Yes; minor: a failed delete reverts silently with no toast, the card just reappears | |
| Publish toggle re-PATCHes the full collection payload with `available` flipped, optimistic with rollback | Yes | |
| Publishing a collection to the marketplace has no subscription gate | FLAG: inconsistent gating. Publishing a WORK is 402-gated behind an active subscription when GATING_V1 is on (`/api/artist-works`), but `/api/collections` POST/PATCH lets an unsubscribed artist set `available: true` and go live on the public browse-collections surface; the public collection endpoint (`/api/collections/[id]`) serves any `available=true` row. Either gate collections the same way or document why bundles are exempt | |
| Demo account: soft demo guard on POST/PATCH/DELETE returns 200 `{demo:true}` with no `collection` in the body, which the save path reports as "Failed to save collection" | Yes as a backstop, though the demo message itself is not shown | |

## QR Labels (/artist-portal/labels) and /api/qr/[slug]

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Style picker (three presets from LABEL_STYLES) sets a default size and, for Editorial/Minimal, pre-sets the field toggles; size chips (medium/large/etc.) selectable independently | Yes | |
| Tagline input appears for large/xlarge sizes except the QR-only style, and flows onto the printed label | Yes | |
| Editorial-only field toggles: show/hide Medium, Dimensions, Price rows on the printed label | Yes | |
| Premium upsell banner ("Want coloured labels?") shown to non-Premium plans with an Upgrade link to billing; the print preview only applies the saved `labelTheme` when `canCustomiseTheme(plan)` passes, so a downgraded artist cannot keep paid styling | Yes | |
| Venue dropdown built from the unique venue display names on the artist's placements, plus a "No venue" option | Yes on its own terms, but see the attribution flag below | |
| Deep-link pre-selection from the placements page (`?venue=&works=&sizes=`, legacy single `size=`): matching works are ticked with their agreed sizes | Yes | |
| Portfolio Label counter (0 to 50) adds artist-profile QR labels with work fields suppressed | Yes | |
| Work grid: tick-to-select cards, per-work quantity stepper (1 to 50), per-work size select for the printed dimensions line, Available/Sold badge, per-card "Print" shortcut that previews just that work | Yes | |
| Select All / Deselect All, sticky bottom bar with total label count, Clear, and "Preview & Print" opening the LabelPreview overlay | Yes | |
| QR URLs point at `/api/qr/{artistSlug}` with compact params (work id `w`, title `t`, venue name `v`, venue slug `vs`, `size`), and the API logs a `qr_scan` analytics event (work id, venue user id when resolvable, visitor id) before redirecting with `?ref=qr` plus a signed venue-attribution token | Yes at the API level | |
| Venue attribution on labels printed from this page | FLAG: LabelSheet supports a `venueSlug` field that becomes the `vs=` param, and `/api/qr` only resolves venue_user_id (analytics) and the signed `va` attribution token (checkout revenue share) from `vs`; but this page's `buildLabels` only ever sets `venueName` (the display name from the placements list) and never `venueSlug`. So labels printed here carry `v=` only: the scan is logged without a venue_user_id, the redirect carries no `venue` slug or signed claim, and the venue's QR-sale revenue share cannot attribute, precisely the failure mode the qr route's own comment says name-only caused. The placements deep link also passes the venue NAME. The page needs to carry the placement's `venue_slug` through to the labels | |
| Legacy printed labels with `work=`/`v=` params still resolve via the API's fallbacks | Yes | |

## Messages (/artist-portal/messages, page shell only)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Shell renders header ("Enquiries and conversations with venues and buyers") and mounts the shared MessageInbox with `portalType="artist"`, the artist's slug and works | Yes (inbox internals are another agent's area) | |
| `?artist=` and `?artistName=` query params (used by the placements page's "Message venue" links, which pass the VENUE slug through the `artist` param) are forwarded as `initialArtistSlug`/`initialArtistName`; MessageInbox has a one-shot handler for the slug | Yes functionally; the prop name is misleading internally but the deep link opens the right counterpart thread | |
| Loading state while the artist profile resolves; falls back to slug "unknown" if no profile | Yes | |

## Offers (/artist-portal/offers) and /api/offers, /api/offers/[id] (artist side)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Signed-out visitors (e.g. from an email CTA) are bounced to `/login?next=...` preserving the return path | Yes | |
| Page header "Offers received. Venues offering to buy your work. Accept, decline, or counter, your call." then mounts the shared OffersList with `filter="artist"` | Yes | |
| OffersList fetches `/api/offers?role=artist`, rendering work thumbnails, venue and artist context, price, message, expiry and a status label phrased by viewpoint ("Awaiting response" vs "Pending") | Yes | |
| Recipient of a pending offer (the artist on an initial venue offer): Accept / Counter / Decline buttons | Yes | |
| Accept PATCHes `/api/offers/{id}` action accept; API restricts accept/decline to the current recipient (recipient flips along counter chains), flips status, and notifies the venue "Offer accepted, £X" since the venue always pays | Yes | |
| Decline PATCH mirrors accept with recipient-only enforcement and notifies the sender | Yes | |
| Counter opens a dialog seeded with the current amount; requires a positive amount; POSTs `/api/offers` with `parentOfferId`, which marks the parent countered and creates the child row; self-countering is blocked server-side (403 self_counter with friendly copy) | Yes | |
| Withdraw (sender of the live row only, so the artist can withdraw their own counter) goes through a ConfirmDialog then PATCH withdraw; API enforces sender-only | Yes | |
| Pay button belongs to the buyer (venue) side only; artists see paid status once the Stripe webhook lands | Yes | |
| Offer emails and in-app notifications: initial offer notifies the artist, counters notify the other side with sender-correct wording ("Maya sent a counter offer" rather than the venue) | Yes | |

## Orders (/artist-portal/orders) and /api/orders (artist side), /api/refunds, /api/refunds/process

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Order list from `GET /api/orders` (artist matched by artist_user_id OR artist_slug so legacy rows appear); rows show id, QR-source badge, date, item titles, net payout (`artistPayoutPounds` with finite-guard) and a compact status tracker; amber border for orders needing attention | Yes | |
| "N need attention" pill counts confirmed + processing orders | Yes | |
| Clicking a row toggles an inline detail panel; items/status_history defensively parsed whether JSONB or stringified | Yes | |
| OrderStatusTracker with full status history; tracking number renders as a carrier link when `detectCarrierUrl` recognises it | Yes | |
| Status actions: confirmed -> "Mark as Processing", processing -> "Mark as Shipped" (with tracking input); PATCH `/api/orders` validates the transition, appends status_history, and surfaces API errors inline | Yes | |
| No "Mark as Delivered" action for the seller | Yes, deliberate: delivery confirmation releases the 14-day escrow, the API 403s seller attempts (`SELLER_STATUSES`), the buyer confirms from the customer portal, and unconfirmed orders pay out on the 14-day cron; removing the button rather than disabling it is the right call | |
| Tracking-number helper text: "Required for £100+ orders (signed-for delivery)." | FLAG: nothing enforces this. The input is optional client-side and `PATCH /api/orders` accepts shipped with no trackingNumber at any order value; either enforce the rule for £100+ orders or soften the copy to a recommendation | |
| Emails on transitions: `recordOrderEvent` dispatches the buyer's processing/shipped/delivered/cancelled templates (idempotency-keyed) with the artist copied on order-placed; a separate inline send covers disputed/refunded only, so no duplicate sends; delivered also stamps delivered_at once and triggers early payout release of pending transfers | Yes | |
| Items list reads both legacy (`qty`/`price`) and enriched (`quantity`/`lineTotal` pence) shapes so neither generation renders £NaN | Yes | |
| Revenue breakdown: items subtotal, shipping line, sale total, venue share %, platform fee %, "Your revenue", plus the footnote that the fee % reflects the plan at time of sale | Yes | |
| Collection orders (`fulfilment_method: "collection"`): buyer's proposed pickup window and contact details shown prominently with a prefilled "Email buyer to confirm pickup" mailto | Yes | |
| Ship orders show the full shipping address block | Yes | |
| Refund requests for the order loaded from `GET /api/refunds` (artist scope = requests on their orders); pending ones render in an amber panel with requester type, reason, type and amount | Yes | |
| "Approve Refund" button (money handler): POSTs `/api/refunds/process` action approve. This is a deliberately gated money mover: the API allows only the order's artist or an admin, refuses artist self-approval of artist-raised requests, takes an atomic pending->processing claim so double-clicks cannot double-refund, executes the Stripe refund with pro-rated transfer reversals (shipping reversed against the artist leg only), and emails buyer and artist plus an in-app bell | Yes on the server; but see the silent-failure flag two rows down | |
| "Reject" button with a required-ish reason input (reason optional in the API): same owner-gated endpoint, records resolved_reason, emails the buyer a rejection | Yes, same gating | |
| Client feedback when processing fails: `processRefund` only updates state `if (res.ok)`; on a 403/409/500 nothing happens visually (no toast, no inline error) | FLAG: a rejected process call (for example a 409 "already processed", a 403 on an artist-raised request, or a demo-guard response) leaves the artist staring at an unchanged panel with zero explanation; this is the one money flow on the page still using bare authFetch with no error surface | |
| "Issue Refund" (proactive, full or partial with amount cap at order total and a required reason): creates a request via `/api/refunds/request` (requester_type resolves to "artist") then immediately calls `/api/refunds/process` approve on it | FLAG: the second step is deliberately owner/admin-gated and will always 403 for the artist ("Artist-initiated refunds require admin approval", the intentional no-self-approval rule). So the button's real behaviour is "file a refund request for admin review", yet the UI closes the form as if done, adds nothing to the visible list on the 403, and never tells the artist their refund is now waiting on an admin. The gating is correct and deliberate; the button label and the silent aftermath are not. Rename the action and surface the queued state | |
| Empty state "No orders yet. When someone buys your work, orders will appear here." with a Discover art CTA | Yes; minor: pointing an artist at /browse to fix having no orders is an odd CTA | |

## Placements list (/artist-portal/placements)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Header shows a stable "N active" count from an independent counts fetch so it does not swing as tabs change; "Print QR Labels" link and "+ Request Placement" toggle | Yes | |
| Tabs All / Pending / Active / Completed / Archived with count badges fed by two dedicated fetches (`?engaged=true` for non-archived, `?archived=1` for archived) so badges stay correct on every tab | Yes; note the API now treats `engaged=true` as a no-op by design, so pending venue-initiated requests appear as an inbox, matching the Pending tab's purpose | |
| Search box (work title, venue, type) and date filter (all/7d/30d/90d/this year) applied client-side | Yes | |
| Rows sorted by latest lifecycle timestamp so recently touched placements bubble up | Yes | |
| Direction chips: requests the artist sent show "Awaiting their reply", received ones "Your turn", using requester_user_id with a legacy fallback | Yes | |
| MiniStatusBar 5-dot lifecycle indicator (Accepted/Scheduled/Installed/Live/Collected) hidden for Pending and Declined | Yes | |
| Pending received requests: Accept (spinner state), Counter (opens CounterPlacementDialog seeded with current terms), Decline; all PATCH `/api/placements` and only update UI on confirmed 2xx, firing the cross-portal `wallplace:placement-changed` event | Yes | |
| Pending sent requests show "Awaiting their response" and a direct "Respond" link appears on received-pending rows for one-click access to the detail page | Yes | |
| Declined + sent: "Counter with new terms" reopens negotiation; declined + received: "Waiting on them to come back" | Yes | |
| Cancel button on Active and Pending rows opens a ConfirmDialog ("The other party will see it as cancelled.") then PATCHes status cancelled with optimistic update and rollback on failure | Yes | |
| Archive / Unarchive per row (soft-hide for the caller only, reversible from the Archived tab), with confirm dialog, optimistic removal, 404-tolerant, error toasts | Yes | |
| Bulk selection with "Archive selected"/"Unarchive selected", confirm dialog, per-id requests, partial-failure rollback with an honest toast | Yes | |
| Row actions: "Message venue" deep link into the portal inbox, "QR labels" (Active only) deep-linking every work in the placement with agreed sizes, "Add Loan / Consignment" (`?record=open` on the detail page), "Open full placement" | Yes; the QR link passes the venue display name, which feeds the labels-page attribution flag noted in the Labels section | |
| PaidLoanPaymentChip on paid-loan rows: artist sees info-only "Awaiting venue's payment setup", amber "Payment past due" on billing failure, and the urgent "Live without payment" state when installed with no active subscription | Yes | |
| Request Placement form: venue select restricted to venues the artist has interacted with (`/api/placements/venues`); pending-review artists get `pending: true` and a friendly notice instead of an empty dropdown | Yes | |
| Arrangement controls: independent "QR-enabled display" and "Monthly fee" toggles (fee toggle seeds £50, editable), revenue-share % input only shown when QR is on ("Revenue share on QR sales") | Yes, the QR-only scoping of revenue share matches how QR-linked sales attribution works | |
| Work picker with per-work size choice defaulting to "Any size"; multi-select bundles into ONE placement (first work headline, rest in extraWorks) matching the venue-side flow | Yes | |
| Submit POSTs `/api/placements` with `type: fee > 0 ? "free_loan" : "revenue_share"` plus monthlyFeeGbp/qrEnabled, optimistic row insert, full error surfacing, and form reset | Yes functionally (the server labels paid loans from the fee, and the shared labeller renders the optimistic row consistently); the raw `"free_loan"` literal for a paid loan is confusing at the code level but not user-visible | |
| Server-side gating on POST: subscription 402 when GATING_V1 on, daily outreach cap, venue review-status checks, one canonical dm- conversation per pair | Yes | |
| Empty/initialised states per tab, and the Archived tab pulls only archived rows server-side | Yes | |

## Portfolio (/artist-portal/portfolio) and /api/artist-works, /api/works/[id]/mockups

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Works count in header: Core/Premium show "N/8" or "N/20" with an at-limit state swapping the Add button for "Upgrade for more" (links to /pricing); Pro shows a bare "N works" with no denominator | FLAG: the Pro presentation implies no ceiling, but the API rejects the 51st work with a 403 ("Your Pro plan supports up to 50 active works"), and because the page's own `PORTFOLIO_LIMITS.pro` is 9999 the client never enters its at-limit state, so a 50-work Pro artist gets an unexplained save error rather than the upsell/limit UI. Align `PORTFOLIO_LIMITS`, the API `POST_LIMITS`, and every "Unlimited works" marketing string on one number | |
| Server-side post cap enforced atomically (advisory-locked slot-claim RPC, migration 104) so two concurrent saves cannot both slip under the cap; failed saves release the claimed slot | Yes | |
| Shipping Settings panel (hidden while the work form is open): Default UK Shipping (blank = system £9.95), International Shipping toggle plus per-item price, inline non-negative validation disabling the save, "Save Shipping Settings" via PUT `/api/artist-profile` with success/error toasts | Yes; server re-validates non-negative and both columns are on the writable allowlist since migration 081 | |
| Add/Edit work form: primary image upload (click or drag-drop, replace-by-drop, object-contain preview) with copy noting public downsizing | Yes | |
| Primary image upload failure handling: `handleImageFile` awaits `uploadImage` with no try/catch, and `uploadImage` throws on files over 10MB or disallowed types past the client's own image/* check | FLAG: an oversized file (over 10MB) leaves the button stuck on "Uploading...", `uploading` never resets, no error is shown, and the rejection is unhandled; the additional-images path wraps its uploads in try/catch and sets a formError, the primary path should too (the profile page's photo upload has the same gap) | |
| Additional images: tier-gated total image counts (core 3, premium 5, pro 10, primary included), multi-upload with per-plan cap enforcement and "Upgrade for more" affordance, reorder left/right, remove; API re-clamps count server-side and de-dupes the primary | Yes | |
| Title (required, 200 max), Medium combobox with canonical suggestions plus custom entries, Description (2000 cap with counter), Original Dimensions, Orientation select | Yes | |
| Sizes and prices table: per-row size label and price, "+ Add custom size" keeps parallel arrays aligned, remove-row buttons (kept to minimum one row), suggested standard sizes derived from the detected image aspect ratio as one-tap chips with cm equivalents | Yes | |
| Column toggles: "Different shipping per size", "Also sold in-store at venues" (per-size in-store price column), "Different quantity per size" (per-size Qty, blank = unlimited); mobile renders stacked per-size cards | Yes | |
| Per-size shipping column shows a "Recommended £X" estimator (from the size label, with tier and delivery-days tooltip) that one-click fills the field; blur normalises to 2dp | Yes | |
| Work-level shipping fallback (per-size off): single field placeholdered with the account default, "Blank = default, 0 = free" helper, and a suggested price computed from the SMALLEST priced size rather than the pixel-dimensions string | Yes, the smallest-size basis is the right semantics for a floor charge | |
| "Available for purchase" toggle; save also forces available=false when a finite quantity of 0 is entered | Yes | |
| Work-level "Quantity available" (blank = unlimited) | Yes | |
| Frame options: label, default £ uplift, optional frame image upload with hover-remove, per-size £ overrides (shown once 2+ labelled sizes exist, blank = auto-scaled default), add/remove rows; `buildFramePayload` coerces uplift to number and carries pricesBySize so per-size frame pricing survives saves | Yes | |
| Copy-from picker inside the form ("Copy sizes" copies labels only, preserving prices on matching labels; "Copy prices" is index-aligned and brings per-size shipping plus work-level shipping/in-store when the source has them, never touching labels) | Yes, and the two operations being strictly independent matches the reported user expectation | |
| Validation on submit: title required and <= 200, at least one size with price > 0, price <= £100,000; errors render inline with an icon; the submit button also disables until title plus one priced size exist | Yes | |
| Save path (add/edit): optimistic update through `useSaveAction`, POST only the changed works (`worksToPost` diff), per-work `mutate` calls, server `savedRow` reconciled back, warnings toasted (duplicate title, duplicate image, missing-migration hints), failure rolls back, keeps the form open and shows the real error; unsaved-changes beforeunload guard while the form is dirty | Yes | |
| Saving a work with no image silently publishes `https://picsum.photos/seed/new-work/900/600` as the primary image | FLAG: the form neither requires an image nor warns, so a keyboard-happy artist can put a random stock photo live on /browse as their artwork; either require the image or hold imageless works as drafts | |
| Server POST gating: 402 `subscription_required` when GATING_V1 on and the artist tries to set available=true unsubscribed; new works from unsubscribed artists default to draft; the client surfaces the 402 message through the save control | Yes | |
| Zod `artistWorkInputSchema` validates the whole body (pricing array caps, non-negative quantity so a negative can no longer make a work permanently unbuyable, bounded shipping price, frame bounds) with field-level 400 messages | Yes | |
| Public-page cache revalidation after save (`/browse/{slug}` and the work page) | Yes | |
| Works grid: drag-to-reorder with source fade and drop-target ring, order persisted as sortOrder and mirrored on the public profile ("Drag cards to reorder" hint) | Yes, though reorder goes through the fire-and-forget path, see the bulk flag below | |
| Card hover actions: Edit (scrolls to top, rehydrates every per-size field including per-size shipping, in-store, stock and frame overrides), Duplicate (pre-fills everything except title and images), Remove (ConfirmDialog then optimistic DELETE with rollback and error toast) | Yes | |
| Card footer: title, medium, Available/Sold pill, "N sizes from £X" | Yes | |
| Select multiple mode: checkboxes, Select all, Cancel; dark bulk bar with Mark available / Mark sold / Edit sizes and prices / Copy sizes from / Copy prices from / Delete / Done | Yes | |
| Bulk delete: confirm dialog, awaited DELETEs with rollback and honest toast on partial failure | Yes | |
| Bulk availability, bulk copy-from apply, bulk price save, bulk add save and drag-reorder all go through the legacy `saveWorks` fire-and-forget wrapper (errors only logged to console) while their success toasts fire immediately | FLAG: acknowledged in-code as pending migration (E41-e): "Marked 12 works as sold", "Updated prices for N works", "Added N works" and a reorder all report success before the server has confirmed anything, and a 402/403/500 leaves the UI lying until reload; the single add/edit and delete paths were fixed, these five callers were not | |
| Two-step bulk Copy-from flow: pick kind and source, then a target picker (defaulting to all selected minus the source) with per-work checkboxes, Apply to N works, Cancel; sizes copy preserves per-size shipping/in-store on matching labels (`copySizesPricing`), prices copy is index-aligned and only overwrites shipping/in-store when the source has values | Yes | |
| Bulk edit prices spreadsheet ("Bulk edit prices" opens with ALL works pre-loaded, no ticking needed; the bulk-bar variant uses the selection): one row per work-size, grouped thumbnails, inline label and price edit, row delete, per-work "Add size", row selection with click/Shift/Cmd semantics, select-all header checkbox, fill-selected-with-£X, Copy/Paste selected prices to and from a spreadsheet (Cmd+C/V with currency-symbol stripping), Escape-free modal close, Save folds rows back with `mergeBulkPricing` so per-size shipping/in-store/stock survive a price tweak, blank or £0 rows delete that size, and a work whose rows were all emptied keeps its original pricing rather than being wiped | Yes, unusually thorough; the save itself is fire-and-forget per the flag above | |
| Bulk add modal: drag-drop multiple images (or file picker), instant previews while uploads run in parallel, per-draft auto orientation and suggested sizes from the image ratio, title seeded from filename, per-draft sizes editor, collapsible shipping-per-size / in-store / frame sections, Available checkbox, remove draft, "Add more images", Copy sizes/prices from any draft or existing work with the same target-picker pattern, footer "X / N ready to save" | Yes | |
| Bulk add Save: drafts missing image/title/priced-size are silently dropped with a form error only when NOTHING is valid | FLAG: minor but lossy, when 3 of 5 drafts are valid, "Save 5 works" saves 3 and toasts "Added 3 works" while the 2 incomplete drafts are discarded with the modal closed; the footer count hints at it but nothing stops the artist losing half-finished drafts | |
| Delete API scoped to the artist's own profile id; demo guard soft-blocks POST and DELETE | Yes; note for demo sessions every portfolio save resolves 200 with no persistence and the client still toasts success, which is the demo guard's intended illusion but means demo QA of this page proves nothing about writes | |
| `/api/works/[id]/mockups` POST (used by the showroom editor's "Save to artwork"): flag-gated, strict demo-blocked, artist must own both work and render, idempotent by render_id, appends to artist_works.mockups and marks the render kept | Yes | |

## Social posts (/artist-portal/posts)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Work picker sidebar (thumbnail, title, medium), first work preselected; empty state asks the artist to upload work first | Yes | |
| InstagramPostGenerator: Post 1:1 / Story 9:16 / Reel cover 9:16 tabs, canvas-rendered branded image with the artwork in a frame, caption builder per format, PNG download and copy-caption affordances | Yes | |
| "Now showing at {venue}" line pre-filled by matching the selected work's title against the artist's placements | FLAG: two defects compound. The page requests `/api/placements?status=active` but the API ignores a `status` param entirely (only `archived` is read), and the client then matches on title without checking `p.status`, so a placement that is pending, declined, cancelled or completed still yields "NOW SHOWING AT {VENUE}" on a public-facing social image. Filter client-side on status active at minimum | |
| Title matching is by lowercase work title | Yes as a heuristic, with the known limitation that duplicate titles pick whichever placement comes first | |

## Profile (/artist-portal/profile) and /api/artist-profile (PUT)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Header: Save Changes button plus "Preview Profile" opening `/browse/{slug}` in a new tab (hidden until a slug exists) | Yes | |
| First-run `?welcome=1` banner explains the profile only goes live after review | Yes | |
| Brand-new accounts with no profile row get an empty editor seeded from user metadata, and the first Save upserts the row (slug derived client-side but the server allowlist ignores the posted slug; profile creation sets the slug via the /apply POST path) | Yes | |
| Profile photo: click or drag-drop upload to the avatars bucket with hover affordance; "Square image recommended" | Yes; same missing try/catch around `uploadImage` as portfolio, an oversized file rejects silently (unhandled) with no feedback | |
| About You: Name, Location, Postcode with live UK-postcode validation (aria-invalid, inline error, matching server regex), Short Bio (300 cap with amber counter near the limit), Extended Bio (1000 cap) | Yes | |
| Save-time postcode guard shows a warn toast and aborts before hitting the API; the server independently 400s invalid postcodes and geocodes valid ones into server-owned lat/lng for distance search | Yes, belt and braces | |
| Social: Instagram handle only (Website was removed from the UI and the save deliberately sends `website: ""` to clear stale values) | Yes | |
| Discipline radio grid plus a unified Tags field (selected chips with remove, search box, Enter or "+ Add" for custom tags, suggestion chips from discipline sub-styles plus canonical themes); at save the list is split back into sub_styles/themes/style_tags so browse filters keep matching | Yes | |
| Commercial terms checkboxes: Original works, Prints, Framed works, Commissions, Can provide framing (writes both legacy columns), Collect from artist (in person) with explanatory copy about pickup at checkout | Yes | |
| Deal types: "Display (with optional revenue share)" (open_to_free_loan) and "Purchase" (open_to_outright_purchase); revenue-share % input appears when display is on ("Leave at 0 for a pure free display") | Yes; the legacy open_to_revenue_share flag is retained in the payload but no longer directly editable, which is coherent with the merged UI | |
| Revenue share % input has `min={0}` but no upper bound client- or server-side (`revenue_share_percent` is on the allowlist with no clamp in the PUT route) | FLAG: an artist can save a revenue share above 100%, which then flows into placement prefills; clamp 0 to 100 on both sides | |
| Delivery radius select and venue-types chip grid | Yes | |
| Your Works section is read-only thumbnails with "+ Add Work" linking to Portfolio as the single authoritative editor | Yes | |
| Collections section links to the Collections page | Yes | |
| Profile and label theme pickers: full preview cards for every theme; Core artists see them disabled at 60% opacity with an "Upgrade to Premium" CTA and honest copy ("you'll see a preview here but the public profile stays on the default scheme until you upgrade"); server strips profile_theme/label_theme for non-Premium plans so a downgrade cannot keep paid theming | Yes | |
| Bottom Save bar with "You have unsaved changes." / "All changes saved." and a disabled-when-clean duplicate Save button; beforeunload warning while dirty | Yes; note the top Save button is never disabled, a minor inconsistency | |
| Save errors surface the API's message (including the postcode 400 and shipping-price 400) via toast; success shows the green banner, refetches, scrolls to top | Yes | |
| PUT is allowlist-filtered server-side (`ARTIST_PROFILE_WRITABLE`), so review_status, subscription fields and stripe ids cannot be self-set | Yes | |
| Demo account: PUT returns 200 `{demo:true}` and the page shows the normal "Profile saved successfully" banner with nothing persisted | Yes as designed for demo tours, worth remembering when testing | |

## Saved (/artist-portal/saved) and /api/saved

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Tabs Works / Artists / Collections with per-type count badges | Yes | |
| Data joins `/api/saved` rows against the public `/api/browse-artists` payload to enrich works (thumbnail, artist, price band) and artists (avatar, medium, location) | Yes, with graceful fallback cards when an item no longer resolves | |
| Enriched work rows link to `/browse/{artistSlug}?work={workSlug}` which the public artist page consumes (`searchParams.get("work")`) | Yes | |
| Fallback link for an unresolved saved WORK goes to `/browse/{item_id}` where item_id is a work id, not an artist slug | FLAG: `linkForItem("work", id)` treats the work id as a browse slug, so a saved work whose artist has left the browse payload (unpublished, pending review, deleted) links to a page that cannot resolve; better to render it unlinked with its saved date, as the card already does for the title fallback | |
| Collection rows link to `/browse/collections/{id}` and show a generic icon | Yes | |
| Remove buttons per row: confirmed DELETE via mutate (item only leaves the list on 2xx), per-row "Removing..." state, error toast on failure | Yes | |
| Empty states per tab with tailored CTAs (Browse galleries / portfolios / collections) and the heart-icon hint | Yes | |
| API: GET scoped to the user, POST upserts on (user, type, id) so no duplicates, DELETE exact-match; soft demo guard on writes | Yes | |

## Settings (/artist-portal/settings)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Account Details: full-name edit saved to Supabase auth `display_name` metadata with "Saved!" confirmation and error fallback | Yes | |
| Email field disabled with "Contact support to change your email." | Yes | |
| Notification Preferences: Order and sale notifications, Message notifications, Email digest; toggles PATCH `/api/account/preferences` optimistically with revert-on-failure via the shared `useNotificationPrefs` hook; "Changes save automatically." | Yes, server-persisted (no longer localStorage), and the artist-profile allowlist carries the matching columns | |
| Change Password: current password, new password (min 8, mirrored client validation), confirm match check, saves via `supabase.auth.updateUser` | FLAG: the "Current password" field is decorative, its value is never read or verified (Supabase updateUser on an active session does not require it), so the form implies a check it does not perform; either verify it via a re-authentication call or remove the field | |
| AccountDangerZone: hard account deletion gated on typing DELETE MY ACCOUNT exactly, POSTs `/api/account/delete` | Yes | |

## Showroom (/artist-portal/showroom, /showroom/new, /showroom/[id]) 

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Whole surface gated on WALL_VISUALIZER_V1 (prod default ON, env kill switch); flag-off renders a "Showroom coming soon" placeholder on all three routes | Yes | |
| List page fetches `/api/walls` with the session bearer token and filters to `owner_type === "artist"` so a user with legacy venue walls only sees artist scenes | Yes | |
| Wall cards: uploaded walls show the signed photo thumbnail, preset walls a colour swatch sized to the wall's aspect ratio, plus name and dimensions; skeleton loading grid; inline load-error banner | Yes | |
| Empty state: "No showrooms yet... takes about 5 minutes" with a create CTA | Yes | |
| "+ New Scene": preset mode (preset picker seeding colour and default dimensions, editable width/height) or upload mode (drag-drop or picker, JPG/PNG/WebP check, client-side resize to 2400px before upload so iPhone photos clear the serverless body limit, upload error surface) | Yes | |
| Create POSTs `/api/walls` then creates the first layout; a 402 on either step renders the "You've hit your scene limit" / plan-cap panel inline with the server's message instead of silently bailing | Yes, tier caps handled honestly | |
| Editor page: role-gated (artist only, others bounced), loads wall plus layouts, honours `?lid=` layout selection, auto-creates an "Untitled scene" layout when none exists, distinct missing/error states with back links | Yes | |
| Full-bleed WallVisualizer in `artist_showroom` mode (artist's own works in the side panel); from there renders can be promoted onto works via `POST /api/works/[id]/mockups` (owner-checked, idempotent) so scenes become listing images | Yes | |
| Delete button opens a confirm modal ("removes the scene and every saved layout... promoted mockups unaffected"), DELETEs the wall, navigates back, error toast on failure | Yes | |

## Cross-cutting demo-account behaviour (Maya Chen demo artist)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Soft demo guard (200 `{demo:true}`, no write) on: artist-profile PUT/POST, artist-works POST/DELETE, collections writes, saved writes, subscribe, subscribe/portal, refunds/process, mockups | Yes as a mechanism; the portal deliberately keeps optimistic state so the demo feels real | |
| Surfacing of the demo message to the demo user | FLAG: almost no artist-portal caller inspects `data.demo`, so a demo session sees ordinary success toasts ("Artwork added", "Profile saved successfully") for writes that never happened, and billing shows a generic failure instead of the friendly demo copy; only the strict-guarded Stripe Connect buttons surface the demo message (via the 403 ApiError). If the demo funnel matters for launch, add one shared `data.demo` toast hook in mutate/useSaveAction | |
| Strict demo guard (403) on: stripe-connect onboard/dashboard, offers create, artwork-request responses | Yes, external identities, money and outbound contact are hard-blocked | |

Row count: 254 functionality rows across 20 sections.

---

# E. Venue portal and curation (Venue)

Scope: every page under /venue-portal, the shared portal shell, the wall visualiser end to end, the curation booking flow under /curated, and the backing APIs listed in the audit brief. Perspective is the signed-in venue user. Demo-account notes are called out where a guard changes behaviour. Column 3 is left empty for production testing.

## Portal shell and access control (/venue-portal/* via layout.tsx, PortalGuard, VenuePortalLayout)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Route-group layout wraps every /venue-portal page in PortalGuard with allowedType="venue" | Yes | |
| PortalGuard: signed-out user is replaced to /login | Yes | |
| PortalGuard: signed-in user of another role (artist, customer, admin) sees an info toast ("This is the venue portal. Redirecting to your X portal.") and is redirected to their own portal | Yes | |
| PortalGuard: user with unconfirmed email sees a full-page "Verify your email" block naming their address; no portal content renders | Yes | |
| PortalGuard: artist-only subscription and review gates are skipped for venues (subscriptionChecked short-circuits to true) | Yes, venue path is clean | |
| VenuePortalLayout sidebar nav: Dashboard, Venue Profile, Messages, Placements, My Offers, Artwork Requests, My Walls, Saved, QR Labels, Analytics, My Orders, plus Settings and Logout at the bottom | FLAG: /venue-portal/enquiries exists and is reachable from the dashboard Quick Action "View Enquiries", but has no sidebar entry, so the page is orphaned from the main nav. Either add it or remove the page (see Enquiries section, where the page is dead anyway) | |
| Sidebar active-state highlighting uses longest-prefix matching so nested routes (e.g. /venue-portal/walls/abc) highlight the parent item | Yes | |
| Per-route document.title ("Placements · Venue Portal · Wallplace" etc.) set on navigation, longest-prefix matched | Yes | |
| Duplicate inline auth check in VenuePortalLayout replaces to /login when not a venue (belt and braces on top of PortalGuard) | Yes, harmless duplication | |
| Self-heal on portal load: PATCH /api/venue-profile {ensureProfile:true} creates or adopts the caller's venue_profiles row (adoption only via confirmed email, exactly one orphan; insert hydrates from venue_registrations; slug suffixing on collision) | Yes, and the E34 hardening (no browser-chosen slug adoption) is correct | |
| Self-heal only runs when email_confirmed_at is set; unconfirmed users get neither adoption nor hydration | Yes, deliberate | |
| Self-heal failure banner: "We couldn't finish setting up your venue portal..." with a Retry button that re-runs the PATCH | Yes | |
| Mobile: hamburger toggles a slide-in drawer copy of the nav; backdrop click closes; drawer is aria-hidden when closed | Yes | |
| Loading state: animated progress bar with "Loading your portal..." | Yes | |
| Logout button in sidebar calls signOut() | Yes | |

## Dashboard (/venue-portal)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Header greeting "Welcome back, {displayName}" with fallback "there" | Yes | |
| Data load: parallel fetch of /api/dashboard, /api/placements and /api/analytics/venue?range=all on mount | Yes | |
| Stats tile "Saved Artists": count of savedItems with type="artist" from SavedContext | Yes | |
| Stats tile "Total Spent": sum of order.total across ALL orders returned by /api/dashboard | FLAG: the venue branch of /api/dashboard returns orders matched by venue_slug OR buyer_email, so placement SALES made by customers at the venue are summed into "Total Spent" alongside the venue's own purchases. A venue with QR sales but no purchases sees a non-zero "spent" figure they never spent. Should sum only buyer_email-matched orders (as the Orders page does) | |
| Stats tile "Revenue Share Earned": sum of placement.revenue across /api/placements rows | Yes, placements.revenue is trigger-maintained on delivery per migration 038 | |
| Stats tile "QR Scans": lifetime qr_scan count from /api/analytics/venue?range=all | Yes | |
| Loading state renders a pulsing dash in each tile | Yes | |
| Getting Started checklist item "Complete your venue profile" (name + type + location present) linking to /venue-portal/profile | Yes | |
| Checklist item "Describe what you're looking for" (any preferred_styles or preferred_themes) linking to /venue-portal/profile | Yes, but see the Profile flag about fabricated default styles: a venue who never chose styles can be marked complete after one Save | |
| Checklist item "Browse artist portfolios", completed via localStorage flag set on click of the checklist link | Yes, though completion is per-browser (localStorage), so it resets on a new device | |
| Checklist item "Send your first enquiry", completed when sentMessageCount > 0 | FLAG: sentMessageCount counts ANY message row where sender_name equals the venue slug, so a reply to an artist-initiated thread completes "Send your first enquiry"; also the link points to /browse, not the enquiry mechanism itself. Loose but arguably acceptable; the label overstates precision | |
| Checklist item "Set up payouts", completed when profile.stripe_connect_account_id is truthy, linking to /venue-portal/settings | FLAG: completes as soon as a Stripe account row is CREATED, not when onboarding completes or payouts are enabled, so a venue who abandoned Stripe onboarding is shown a ticked "Set up payouts" while Settings still says "Continue Setup" | |
| Checklist progress bar, n/N pill, all-complete celebration state, auto-dismiss (localStorage flag) 3s after all complete, and a manual Dismiss link | Yes | |
| Placement Action Items block (shared PlacementActionItems, role="venue"): surfaces pending requests the venue can respond to, plus schedule/install/live to-dos on active placements; renders nothing when empty | Yes | |
| Wallplace Curated promo card "Want a shortlist picked for you? ... from £49" with Explore Curated button to /curated | Yes, price matches the tier table | |
| Quick Actions: Browse Portfolios (/browse), View Enquiries (/venue-portal/enquiries), Your Orders (/venue-portal/orders), Update Preferences (/venue-portal/profile) | FLAG: "View Enquiries" routes to a page whose backing API has no GET handler, so it always shows an empty list (see Enquiries section) | |
| Summary card repeating saved artists, total spent, revenue share, QR scans, plus a Browse Art button | Yes, same caveat as the Total Spent tile | |
| Recent Activity feed: pending placement requests received (linking to /placements/[id]), accepted/declined outcomes on requests the venue sent, and orders placed (linking to /venue-portal/orders), sorted newest first, capped at 8 | Yes, the requester-direction filtering is correct (uses requester_user_id resolved by the API) | |
| Activity empty state "No recent activity yet. Start by browsing portfolios." | Yes | |
| Relative timestamps (just now / Nm ago / Nh ago / Nd ago / date) | Yes | |

## Venue Profile (/venue-portal/profile)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Page loads current profile via useCurrentVenue (GET /api/venue-profile, static-seed fallback when the API has no row) | Yes | |
| "View how artists see your profile" external link to /venues/{slug}, new tab | Yes | |
| Save Changes button (top) PUTs the full field set to /api/venue-profile; success shows a transient "Saved" tick, refetches, and clears the dirty flag | Yes | |
| Save failure surfaces an error toast distinguishing server rejection from network failure | Yes | |
| Duplicate bottom Save Changes button with "Make sure to save before leaving this page." hint | Yes | |
| Unsaved-changes warning on tab close and on client-side navigation via useUnsavedWarning | Yes | |
| Venue Details section with per-section Edit/Cancel toggle: Venue Name, Venue Type, Location, Wall Space, Visitors per day | Yes, read-only display falls back to "Not set" without leaking into the input (E42-a fix present) | |
| Visitors-per-day input strips non-digits on paste/typing | Yes | |
| Cleared fields save as NULL (payload sends null, not undefined) so a venue can genuinely blank a field | Yes (E42-d fix present) | |
| Section "Cancel" link only exits edit mode; it does not revert typed values | FLAG: pressing Cancel on the Venue Details or Display Needs section keeps the edited values in state (and dirty), so "Cancel" reads like revert but only hides the inputs; the next Save still persists the "cancelled" edits | |
| Venue Photos gallery: up to 10 images, file-picker upload ("Add photos") and drag-and-drop with a highlighted drop target | Yes | |
| Photo uploads resize client-side (2400px, 0.92 WebP) via uploadImage into the "collections" storage bucket | Yes functionally, though parking venue photos in a bucket named "collections" is a naming smell | |
| Per-photo hover Remove button; cap message at 10 photos; upload errors shown inline | Yes | |
| Art Preferences "Interested In" toggles: Revenue share (interested_in_revenue_share), Paid loan (stored as interested_in_free_loan), Direct purchase (interested_in_direct_purchase) | Yes, the "Paid loan" label over the legacy free_loan column matches the canonical K3 semantics, and all three are on the write allowlist. Note there is no longer any way to express interest in a genuinely free display | |
| interested_in_collections exists in the DB and is served by /api/venues/demand, but the profile page has no control for it | FLAG: the column defaults from registration and can never be changed in the portal; /spaces filters read it, so the venue cannot correct a wrong value | |
| Preferred Styles tag pills (10 options) and Preferred Themes tag pills (8 options), toggle to select, persisted as preferred_styles / preferred_themes | Yes, but see next row | |
| Empty-profile defaults: when the saved row has no styles/themes the page pre-selects Contemporary/Minimal/Photography and Nature/City/Architecture | FLAG: fabricated preferences. A venue that opens the page and hits Save (for any other edit) silently persists tags they never chose, and artists then target them on false data. Should start empty | |
| "Prefer artists within 10 miles of my venue" toggle (interested_in_local_artists) | Yes, column exists since migration 103 and is on the allowlist, so the tick persists | |
| Preferred Artwork Sizes pills (Small/Medium/Large/Oversized) | FLAG: decorative. The selection is not included in the save payload, there is no preferred_sizes column (confirmed vestigial in writable-fields.ts), and state resets to a hardcoded Medium+Large on every load. Remove the control or add the column | |
| Display Needs section (Edit toggle): Wall Space Available, Lighting, Installation Notes, Rotation Frequency, each persisted to display_* columns | Yes | |
| Live preview panel mirroring the public venue card in real time (hero photo, photo count badge, arrangement chips, styles, display needs, themes), sticky on desktop | Yes, faithful to the /venues/[slug] card fields | |
| Live preview "Open full page" link to /venues/{slug} | Yes | |
| Contact PII fields (contact_name, email, phone, address_line1/2, city, postcode) are on the API write allowlist but the profile page exposes no inputs for them | FLAG: a venue cannot correct their contact name, phone or address anywhere in the portal (Settings' fields are dead, see below); values are frozen at whatever registration captured | |
| API: PUT/PATCH /api/venue-profile builds writes via pickWritable over VENUE_PROFILE_WRITABLE, so slug, user_id, subscription and stripe columns cannot be mass-assigned | Yes (E45 fix present) | |
| Demo account: PUT/PATCH/POST /api/venue-profile return 200 {demo:true} without writing, so demo edits no-op silently unless the client checks data.demo (this page does not, so a demo user sees "Saved" for a write that never landed) | FLAG: on the demo account the profile page shows a false "Saved" confirmation; showing the demo toast requires checking the demo flag, which handleSave does not | |

## Settings (/venue-portal/settings)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Account Details section gated behind the venue fetch so uncontrolled defaults are seeded from real data | Yes | |
| Venue Name, Email Address and Phone Number fields | FLAG: dead form. All three are uncontrolled inputs with no save button, no submit handler and no wiring to any API; anything typed is silently discarded on navigation. Either wire them (name to venue-profile, email to auth email-change, phone to venue-profile) or render read-only | |
| Password row links to /forgot-password ("Change password") | Yes, reasonable flow | |
| Notification Preferences: three checkboxes (Order updates, Message notifications, Wallplace news and digest) with "Changes save automatically", via useNotificationPrefs against /api/account/preferences | See flags below | |
| GET /api/account/preferences for a venue selects email_digest_enabled, message_notifications_enabled AND order_notifications_enabled from venue_profiles | FLAG: venue_profiles has no order_notifications_enabled column (migration 050 deliberately skipped it, and the live-schema snapshot confirms it), so the SELECT errors and the endpoint 500s for every venue. The hook swallows the failure, so the three checkboxes ALWAYS render the opt-in defaults regardless of what the venue previously saved | |
| Toggling "Order updates" PATCHes {order_notifications_enabled} to venue_profiles | FLAG: the UPDATE hits the same missing column, so it 500s every time; the checkbox reverts with "Could not save preference." There is no venue order-notification pref to save. Remove the row for venues or add the column (venues do buy art, so adding it is defensible) | |
| Toggling "Message notifications" or "Wallplace news and digest" PATCHes single existing columns | Yes, the write itself succeeds, but because GET always fails the displayed initial state never reflects the stored value, so a venue who previously opted out sees the box ticked again on every visit | |
| "Wallplace news & digest" description says it controls "Platform announcements and feature launches" | FLAG: the weekly venue digest email is suppressed via the separate email_preferences.digests_enabled flag consulted by sendEmail, not venue_profiles.email_digest_enabled, so this checkbox does not actually stop the digest; the real control lives on the email-preferences page reached from email footers. Misleading copy plus a split preference store | |
| Payouts section, loading state, then one of three states from /api/stripe-connect/status: not started ("Set Up Payouts"), account exists but incomplete ("Continue Setup"), complete ("Payouts Active" pill + "Open Stripe Dashboard") | Yes | |
| "Set Up Payouts" / "Continue Setup" POST /api/stripe-connect/onboard with accountType:"venue" and redirect to the returned Stripe onboarding URL; refresh/return URLs land back on /venue-portal/settings | Yes, the onboard route supports the venue table and venue return URLs | |
| "Open Stripe Dashboard" POST /api/stripe-connect/dashboard and redirect to the Express login link | Yes | |
| Payout errors surface via toast; buttons disable while redirecting | Yes, though the catch shows err.code (a machine slug) rather than err.message, so the toast can read like "stripe_error" instead of a sentence | |
| PayoutExplainerModal fires once per user after onboarding completes (audience="venue" copy), dismissal persisted in localStorage | Yes | |
| AccountDangerZone: type "DELETE MY ACCOUNT" to enable the red button, POST /api/account/delete, then sign-out and redirect home | Yes, hard-delete confirm string gate is sound; error path also shows err.code rather than the message | |

## Placements (/venue-portal/placements)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Header "N active" pill fetched independently of the visible list so it does not flicker on the Archived tab; renders an ellipsis while loading | Yes | |
| "+ Request Placement" button opens the inline request form | Yes | |
| List load: GET /api/placements (or ?archived=1 on the Archived tab), enriched with artist display names from /api/browse-artists, sorted by most recent lifecycle timestamp | Yes | |
| Archive semantics: hidden_for_venue column takes precedence, placement_archives table is fallback only when the column is absent | Yes | |
| Tab row: Current / Pending / Active / Completed / Archived with count badges (Archived count fetched separately; other counts computed from the loaded list and hidden while on the Archived tab) | Yes, though rows normalised to Paused or Unknown are only visible under Current since no tab matches them; acceptable given zero live paused rows, worth remembering | |
| Search box filters by work title, artist name or arrangement label; date filter (all/7d/30d/90d/this year) filters on created date | Yes | |
| Row: thumbnail, title with "+N more" chip for multi-work placements, artist, arrangement chip via labelForArrangement (Paid loan / Revenue share / Paid loan + QR / Free display etc.), status, dates, earned column | Yes, arrangement labelling goes through the canonical helper | |
| Earned column only renders a figure when revenue_share_percent > 0, otherwise a dash | Yes | |
| Status cell: Pending shows "Awaiting their reply" vs "Your turn" depending on direction; Declined/Cancelled fixed pills; Active/Completed/Sold render as an inline select letting the venue set Active/Completed/Sold directly | Yes, direction-aware copy is good; the raw status dropdown is blunt but the shared updatePlacementStatus rolls back on server rejection | |
| Archived tab overrides every status badge with a single "Archived" pill | Yes | |
| MiniStatusBar 5-dot lifecycle indicator on Active/Completed/Sold rows | Yes | |
| Request column: direction tag (Sent/Received) plus a "Respond" deep link to /placements/[id] when it is the venue's turn | Yes | |
| Cancel button (amber) on Active/Pending rows opens a ConfirmDialog then PATCHes status=cancelled; optimistic with rollback and toast on failure | Yes | |
| Archive/unarchive bin icon per row with confirm dialog; DELETE /api/placements?id=... (&unarchive=1), optimistic, 404 treated as already-done | Yes | |
| Bulk select: header checkbox with indeterminate state, per-row checkboxes, action bar with Clear and Archive/Unarchive selected (looped DELETEs, full rollback if any fail) | Yes | |
| Expanded row detail: artist, size, arrangement, revenue share, monthly fee, requested/responded dates, earned, QR scans | Mostly, but see the two flags below | |
| Expanded row label "Revenue share: {pct}% to artist" | FLAG: wrong direction. placements.revenue_share_percent is the VENUE's cut (payout legs compute venueCutPence from it, and the venue's own request form says "% to the venue on sales"). Displaying it as "% to artist" tells the venue the opposite of the deal they set | |
| QR scans figure per placement (desktop expanded row) | FLAG: near-guaranteed zero. The API's per-placement counter compares analytics_events.work_id (a UUID from modern labels) against the placement's work TITLE, and analytics venue_name (a display name) against venue_slug, so scans from current labels are excluded by both predicates. The Analytics page counts the same events correctly via venue_user_id; this list should reuse that attribution | |
| QR scans figure on the mobile expanded card is hardcoded to "0" | FLAG: literal 0 regardless of data, diverging from the desktop cell on the same page | |
| PlacementStepper in expanded rows: Requested to Accepted to Scheduled (date picker, rejects past dates) to Installed to Live to Collected, advance and undo via PATCH /api/placements, gated to Active placements | Yes | |
| PaidLoanPaymentChip in expanded rows (role="venue"): "Set up monthly billing" (muted) pre-install, "Work is live, set up monthly billing now" / "past due" (amber) with a "Set up payment" CTA to /placements/[id]/payment; hidden once the subscription is active/trialing | Yes. Note it is fed the display label rather than the raw arrangement_type, so detection rests entirely on the monthlyFeeGbp > 0 fallback, which holds for every real paid loan | |
| Accept / Counter / Decline buttons on rows where canRespond says it is the venue's turn; Accept and Decline PATCH status with spinners; "Awaiting their response" chip when the venue is the requester | Yes | |
| Counter opens CounterPlacementDialog (paid-loan toggle + fee, QR toggle + revenue share, note), PATCHes counter terms, optimistically flips requester so the sender cannot accept their own counter | Yes | |
| Secondary links per row: Message artist (inbox filtered by artist), QR labels (labels page with ?placement= preselect), Add Loan / Consignment (/placements/[id]?record=open), Open full placement | Yes | |
| Mobile card set mirrors the table; its "Loan record" link goes to /placements/[id] without ?record=open | FLAG: on mobile "Open full placement" and "Loan record" are byte-identical destinations; the record=open parameter that opens the loan record is desktop-only, so the mobile button does not do what it says | |
| Request form: artist picker with Saved / Messaged / Previously placed buckets plus free-text search over /api/browse-artists; picked artist banner with Change | Yes | |
| Request form arrangement: independent QR-enabled display and Paid loan checkboxes (both may be on); paid loan reveals a monthly fee input seeded to £50; QR reveals an optional venue revenue-share % input (clamped 0-100) labelled "% to the venue on sales" | Yes, and the seeded £50 does not overwrite user-entered values | |
| Paid-loan helper text "Billing is handled manually for now, use this to record the agreed amount." | FLAG: stale copy. Paid-loan billing is automated: the same page surfaces PaidLoanPaymentChip driving Stripe subscription setup at /placements/[id]/payment, and the API wires recurring billing. Telling venues billing is manual contradicts the flow two components away | |
| Work selection grid from the artist's portfolio: click to toggle with "Any size" default, per-work size picker (published pricing labels with prices, "Any size" option, remove), selected count in the label | Yes | |
| Multi-work submission: first work becomes the primary placement row, the rest ride in extra_works with per-work requested sizes composed into the message | Yes | |
| Submit POSTs /api/placements with fromVenue:true; API rejects when the caller has no venue profile (403) and blocks unapproved-artist spam on the artist path; artist is notified by email and in-app notification | Yes | |
| Optimistic insert after submit uses a locally generated id (p-{timestamp}) and does not reload from the server | FLAG: until the next reload or tab switch the new row carries a fake id, so its Respond/Open/QR-label links point at /placements/p-... which 404s, and the row will not match the server row when the list next refreshes (temporary duplicate). Should reload or use the id the API returns | |
| Cross-portal refresh: listens for wallplace:placement-changed and refreshes list plus both count badges | Yes | |
| Demo account: POST/PATCH on /api/placements pass assertNotDemo (200 {demo:true}), so demo venue actions no-op; this page does not check data.demo so demo users see optimistic success | Yes as designed for soft-guarding, worth knowing when testing the demo account | |

## Artwork requests list (/venue-portal/artwork-requests)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| "+ New request" button and empty-state "Post your first request" both to /venue-portal/artwork-requests/new | Yes | |
| List loads GET /api/artwork-requests?mine=1 (rows where venue_user_id = caller) | Yes | |
| Local "just submitted" cache merge: rows recorded at submit time render with a "Syncing" amber chip until the API returns them, deduped by id, 7-day TTL; on API failure the page falls back to cache alone | Workaround for a bug that reads as fixed server-side (?mine=1 filters by venue_user_id set at insert), but it is harmless belt-and-braces. Yes | |
| Row card: title, open/closed status chip (open = green), description clamp, intent chips, budget chip | Yes, except the budget chip below | |
| Budget chip renders "£{min} to £{max}" with missing bounds shown as 0 | FLAG: a request with only a maximum renders "£0 to £500" (fine) but one with only a minimum renders "£300 to £0", which reads as nonsense. Render open-ended bounds as "from £300" / "up to £500" | |
| Card click navigates to the request detail page | Yes | |

## New artwork request (/venue-portal/artwork-requests/new)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Shared ArtworkRequestForm in create mode; POST /api/artwork-requests; on success records the local cache entry and redirects to the new detail page | Yes | |
| Required-field legend and inline validation: title required, description required, at least one intent | Yes | |
| Title (160 max) and description (4000 max) inputs match the API's zod caps | Yes | |
| Intent multi-select cards: Purchase, Commission, QR-enabled display, Paid loan (labelled from ARRANGEMENT_LABEL) with per-option hints | Yes | |
| "Revenue share for the artist (%)" field appears when QR-enabled display is selected, defaults 20, clamped 0-100, described as "% of QR sales paid to the artist" | FLAG: direction is at odds with the rest of the venue side. Everywhere else the venue-entered share is the VENUE'S cut (placements.revenue_share_percent drives venueCutPence), and when an artist's placement response created from this pipeline lands in placements the same column is written. A venue typing 20 here and 20 on a placement form is expressing two opposite splits under near-identical labels. Pick one direction platform-wide | |
| Styles and mediums comma-separated inputs, split and trimmed client-side | Yes | |
| Budget min/max inputs in pounds, converted to pence; client rejects max < min | Yes | |
| Location text input and Timeline select (ASAP / weeks / months / flexible / no preference) | Yes | |
| Visibility choice: "Verified artists" (semi_public) or "Private" (invite only); public option intentionally absent for new requests | Yes | |
| Private visibility reveals invited-artists handle input (comma or space separated, @ stripped, lowercased); ignored for semi_public | Yes, API caps at 50 slugs | |
| Submit button state (Posting.../Post request), API error surfaced inline with zod field path from the server | Yes | |
| Cancel returns to the previous page | Yes | |
| Server side: POST is venue-only (403 venue_only otherwise) and demo accounts are blocked with the STRICT 403 variant | Yes, appropriate for a surface that reaches real artists | |

## Artwork request detail (/venue-portal/artwork-requests/[id])

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Loads GET /api/artwork-requests/[id]; owner sees full request and every response; API answers 404 to non-viewers (no existence oracle) | Yes | |
| Local-cache fallback with a "still catching up" banner when the API cannot return the row | Yes | |
| Header: title, status chip, description, intent/style/medium chips, budget, location, timescale | Yes (same £0 budget formatting nit as the list) | |
| Edit / Mark fulfilled / Close buttons shown while the request is open; Mark fulfilled and Close PATCH status with error surfacing and reload on confirmed 2xx | Yes | |
| Responses list with count; artist name derived by title-casing the slug, linking to /browse/{slug} | Yes, acceptable fallback given the API returns slugs | |
| Response detail per type: offer amount, commission amount + timeline, placement terms (monthly fee or free-display label, revenue share, QR enabled), message body, status chip (sent = amber, accepted = green, declined = grey) | Yes | |
| Accept / Decline buttons on "sent" responses PATCH /api/artwork-requests/[id]/responses/[responseId]; server is venue-only, 409 on already-actioned | Yes | |
| Accept of an OFFER response creates a pre-accepted purchase_offers row and navigates to /venue-portal/offers via nextStepLink | Yes | |
| Accept of a COMMISSION response creates a commissions row then navigates to nextStepLink /venue-portal/commissions | FLAG: /venue-portal/commissions does not exist (no page under venue-portal), so the browser lands on a 404 immediately after a successful accept. Same for the artist notification link target /artist-portal/commissions if that page is also absent (artist side out of scope here) | |
| Accept of a PLACEMENT response auto-creates an ACTIVE placements row from the artist's proposed terms (arrangement derived: rev share > 0 -> revenue_share, fee > 0 -> paid_loan, else free_loan; QR defaulted on for revenue_share) and navigates to /placements/{id} | Yes, and the N3 fix (proposed_by_user_id, not the phantom requester_user_id) is in place. Note accepting skips the placement pending step entirely, which is intentional (terms were proposed and accepted) | |
| Decline notifies the artist in-app ("the venue passed on this response") | Yes | |
| Accepted responses show "View created offer" (/venue-portal/offers), "View commission" (/venue-portal/commissions), or "View placement" (/placements/{id}) links | FLAG: the "View commission →" link is dead (route does not exist), see above | |
| Per-response "Mark fulfilled" button on accepted responses while the request is open, routed through POST /api/artwork-requests/[id]/fulfill | FLAG: for offer, commission and placement responses the accept step has already written a linked_* id, and the fulfil route's anti-replay gate returns 409 "This response has already been fulfilled." for any response carrying a linked id. So the button that the UI offers on exactly those rows can only ever produce a red error and never flips the request to fulfilled. Only existing_works and message responses can actually be fulfilled from here. Hide the button when a linked id exists (the header-level Mark fulfilled covers the status flip) | |
| existing_works responses open a modal: "Place this work" (creates a pending placement, first work id as title fallback) or "Buy this work" (creates a pre-accepted purchase offer), then navigate; Cancel closes | Yes, and duplicate-artifact replays are blocked by source_response_id unique constraints | |
| Fulfil flips the request status to fulfilled and consumes the response (compare-and-set on accepted) | Yes | |
| Error line above the responses list for any accept/decline/fulfil failure | Yes | |

## Edit artwork request (/venue-portal/artwork-requests/[id]/edit)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Loads the row, maps snake_case to the shared form's initial values, coerces legacy visibility "public" to semi_public and unknown timescales to null | Yes | |
| Filters stored intent values to the four known keys | Yes | |
| PATCH /api/artwork-requests/[id] on submit; API verifies venue ownership (403), validates via zod, applies only sent fields, stamps closed_at when closing | Yes | |
| Page copy "Open responses stay live and continue against the new terms." | Yes, honest about edit semantics | |
| Cancel returns to the detail page; load errors shown inline | Yes | |
| Edit link only offered while the request is open (from the detail page) | Yes | |

## Enquiries (/venue-portal/enquiries)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Page fetches GET /api/enquiry and maps data.enquiries into rows | FLAG: dead page. /api/enquiry exports only POST (the public enquiry submit), so the GET returns 405 with no body, data.enquiries is always undefined, and the list is permanently empty. Every venue sees "No enquiries in this category." forever | |
| Filter tabs All / Pending / Responded / Closed with count badges | FLAG: even if a GET existed, rows are mapped with status defaulting to "Pending" from a DB column that stores lowercase "pending", so the capitalised union would never match "Responded"/"Closed" and the badge style lookup would miss. The whole status model here is fiction layered on a dead fetch | |
| Data model mismatch: enquiries rows are anonymous public submissions TO artists (sender_name/sender_email/artist_slug); nothing scopes them to the venue | FLAG: no venue-side filter exists even server-side, so a working GET would need to be written from scratch (filter by the venue's email as sender). The page concept ("Track your conversations with artists") is really the Messages inbox's job | |
| View / View Details buttons route to /venue-portal/messages?artist={slug} (or the plain inbox when the slug is unknown) | Yes as a design (E43-f fix), though unreachable in practice because there are never rows | |
| Enquiry type badge rendered through enquiryTypeLabel | Yes | |
| Desktop table and mobile card layouts with empty states | Yes visually | |

## Messages (/venue-portal/messages, page shell only)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Shell waits for useCurrentVenue to resolve the venue slug before mounting the shared MessageInbox (loading copy meanwhile) | Yes | |
| Passes portalType="venue", userSlug={venue.slug}, and initialArtistSlug / initialArtistName from ?artist= and ?artistName= so deep links (enquiries page, placements rows) open the right thread | Yes | |
| A venue whose profile row is missing (self-heal failed) sees "Loading messages..." indefinitely | FLAG: when venue.slug never resolves the shell spins forever with no error or retry; it should surface the same self-heal failure state the layout banner uses | |
| Inbox internals (threads, composer, attachments) | Out of scope here, covered by the shared-inbox section of another audit area | |

## Offers (/venue-portal/offers)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Signed-out arrivals (e.g. from an email CTA) are redirected to /login?next=... preserving any ?pay= param | Yes | |
| OffersList with filter="buyer": GET /api/offers?role=buyer listing every offer the venue has made | Yes | |
| Offer card: work thumbnails, target title (single work / N works / collection), counterparty artist with @handle disambiguation and profile link, amount, status pill (pending/countered/accepted/declined/withdrawn/paid), message, expiry | Yes | |
| Accept (on an artist's counter): PATCH accept then immediately fires pay() so the venue lands in Stripe checkout in one step | Yes, sensible buyer flow | |
| Counter: dialog with amount + message, POSTs a counter | Yes | |
| Decline: PATCH decline | Yes | |
| Withdraw: ConfirmDialog then PATCH withdraw, success verified before the toast (fixed false-success path) | Yes | |
| Pay: POST /api/offers/{id}/checkout and redirect to the Stripe URL; errors surfaced inline | Yes | |
| ?pay={offerId} deep link: after load, auto-fires checkout when the offer is accepted and the viewer is the buyer, stripping the param from the URL | Yes | |
| Empty state "No offers yet. Browse artwork" | Yes | |

## Orders (/venue-portal/orders)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| GET /api/orders returns venue-scoped orders: venue_slug matches (placement sales) plus buyer_email matches (own purchases), with userEmail and venueSlug echoed for client-side classification | Yes | |
| Tabs "Placement sales" and "My orders" with counts; ?tab=purchases preselects the purchases tab after checkout | Yes | |
| Sales classification: venue_slug match or venue_revenue > 0 (legacy fallback) | Yes | |
| Stat tiles: Placement sales count, Revenue earned (sum venue_revenue), Your purchases count, Spent on art (sum totals of purchases) | Yes, this page sums correctly (unlike the dashboard's Total Spent) | |
| Order row button: id, QR Sale chip when source="qr", date, item titles, venue revenue (accent) and/or total, compact status tracker; click toggles the detail panel | Yes | |
| Detail panel: OrderStatusTracker with status history; tracking number linkified via carrier detection (external, new tab) | Yes | |
| Items breakdown with derived shipping when the server did not supply one, marked "(derived)", so items + shipping = total reconciles | Yes | |
| "Your Revenue" block on placement sales: sale total, venue share % and amount | Yes, venue revenue share visibility is delivered here | |
| "You paid" block plus ship-to summary on the purchases tab | Yes | |
| "Something wrong? Contact us" link prefilled with the order id | Yes | |
| Empty states per tab with a Discover art CTA | Yes | |
| No venue-side status actions (mark delivered etc.) on this page | Yes, deliberate: buyer-side delivered confirmation lives on the shared order surfaces; venue sales are read-only here | |

## Saved (/venue-portal/saved)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Tabs Works / Artists / Collections with count badges, horizontal scroll on narrow screens | Yes | |
| Works tab resolves saved work ids against getGalleryWorks() | FLAG: getGalleryWorks() builds from the static seed catalogue only. A work saved from the live DB (its id is an artist_works UUID) finds no match and is silently dropped, so venues lose bookmarks the moment the marketplace runs on real data. The wall visualiser's Saved tab resolves the same saved_items against the DB (/api/walls/saved-works) and shows them, so the two surfaces disagree. Resolve via the API here too | |
| Work card: image (first row eager-loaded), title, artist, price band, View link to /browse/{artist}?work={slug}, Remove (toggleSaved) | Yes for seed works | |
| Artists tab builds rows from savedItems directly with seed lookup and a slug-derived name + initial-placeholder fallback, so DB-only artists still render | Yes, this tab already has the fix the Works tab lacks | |
| Artist card: portrait or initial placeholder, name, medium/location meta, View Profile link | Yes | |
| Collections tab: saved collections with humanised name, saved date, link to /browse/collections/{id}, Remove | Yes | |
| Empty states per tab with Browse CTAs | Yes | |
| Saved state syncs to the server (/api/saved) for signed-in users; localStorage is guest-only and wiped on sign-in | Yes | |

## QR Labels (/venue-portal/labels)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Loads the venue's ACTIVE placements from /api/placements, flattening multi-work placements into one card per work (primary + extra_works) | Yes | |
| Deep link ?placement={id} preselects every work in that placement; without it, all works preselect | Yes | |
| Artist display names and per-work medium/dimensions/price resolved best-effort from /api/browse-artists | Yes | |
| Venue name and slug fetched from /api/venue-profile so QR URLs carry ?vs={slug} (analytics venue_user_id resolution) and ?v={name} | Yes, this is the correct modern attribution path | |
| Label Style presets (Minimal / Editorial / QR Only) that also set the default size and field toggles | Yes | |
| Label Size row (QR Only 25mm / Small / Medium / Large / XL) independent of style | Yes | |
| Tagline input shown for large/xlarge (not for qr_only style), max 80 chars, printed on the label | Yes | |
| Field toggles Medium / Dimensions / Price controlling printed rows only ("the QR code itself always points to the work") | Yes | |
| Per-card selection tick, quantity stepper 1-50 when selected, per-card "Print →" for a single-work preview | Yes | |
| Duplicate-title disambiguation: "Placement 1 of 2" badges when the same work title appears on multiple cards | Yes, thoughtful | |
| Placement-agreed size preferred over the artist's generic dimensions; pixel-format dimensions stripped from print via displayPhysicalDimensions | Yes | |
| Select All / Deselect All, sticky bottom bar with total label count, Clear, and "Preview & Print" | Yes | |
| LabelPreview modal: A4 pagination with page badges, editable per-label copies, per-label field visibility toggles, remove label, global size switch, Print via window.print() | Yes | |
| LabelPreview "Size on label" per-label selector fed availableSizes={[]} by this page | FLAG: the selector renders zero options for venues (only the already-chosen chip), so the control is dead on the venue side while the artist side presumably passes real sizes. Pass the work's pricing labels or hide the block | |
| QR URLs built as /api/qr/{artistSlug}?w={workId}&t={title}&vs={venueSlug}&v={venueName}&size=..., rendered as data-URL QR codes | Yes | |
| /api/qr/[slug]: logs a qr_scan analytics event (work_id, venue_user_id resolved from vs, canonical venue name from the profile), then 302-redirects to /browse/{slug}?ref=qr&venue={slug}&venueName=...&work=...&size=... with a signed venue-attribution token | Yes, and legacy label params (work=, v=) still resolve | |
| workId on a label is only set when the placement's work title matches a work in the artist's browse roster | Yes as a fallback chain, though scans from unmatched titles are recorded without work_id and so never appear in per-work analytics | |
| Empty state when no active placements ("Once an artist has accepted a placement...") | Yes | |

## Analytics (/venue-portal/analytics)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Date range dropdown (7d / 30d / 3m / 12m / all) refetching /api/analytics/venue?range= | Yes | |
| API scopes qr_scan events by venue_user_id OR legacy venue_name match | Yes, correct attribution including pre-rework labels | |
| Headline tiles: QR scans, Unique works scanned, Artists scanned | Yes, the latter two derive from top_works/top_artists lengths, capped at 10 by the API, so a venue with more than 10 scanned works sees "10", a minor understatement | |
| Top scanned works list with scan counts; deleted/reassigned works render as "Artwork no longer available" with an explanation instead of "Unknown work" | Yes | |
| "View artist →" link per work when a slug resolved | Yes | |
| Top scanned artists list linking to /browse/{slug} | Yes | |
| API also returns scans_over_time and placement_revenue / placement_revenue_total | FLAG: neither is rendered anywhere on this page (the interface declares scans_over_time and ignores it). Either chart the time series and show per-placement revenue, or stop computing them for this call | |
| Empty states ("No scans yet. Print QR labels...") and a tips card linking to /venue-portal/labels | Yes | |

## My Walls (/venue-portal/walls)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Feature flag WALL_VISUALIZER_V1 (on in prod by default, env kill switch) gates the page with a "Walls coming soon" fallback | Yes | |
| GET /api/walls lists the caller's walls with signed photo URLs for uploaded walls plus the tier cap | Yes | |
| "+ New Wall" button; when the cap is reached (or saving is not on the plan) it renders disabled with a tooltip and an upgrade link to /pricing | Yes, mirrors the API's 402 behaviour client-side | |
| Wall cards: photo thumbnail (uploaded) or colour swatch (preset) sized to the wall's aspect ratio, name (punctuation-only/legacy names replaced with "Untitled wall"), dimensions, kind | Yes, though the visible "· preset / uploaded" kind suffix is developer vocabulary on a user card, minor | |
| Card click opens the editor at /venue-portal/walls/[id] | Yes | |
| Load error banner and skeleton loading grid | Yes | |
| Empty state "Build your first wall" with CTA | Yes | |

## New wall (/venue-portal/walls/new)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Two tabs: Preset (stock colour walls) and Upload photo (real wall photograph) | Yes | |
| Preset picker grid with swatch, name and default dimensions; picking one sets colour AND dimensions; separate colour wheel override | Yes | |
| Upload path: client-side resize to 2400px/0.88 (avoids Vercel 413s), POST /api/walls/upload-photo (15MB cap, JPG/PNG/WebP only, stored privately under wall-photos/{user}/{uuid}), preview via returned signed URL, Replace button | Yes | |
| Calibration model: physical width/height cm inputs (50-1000, clamped) with explicit copy that measurements come from these numbers, not the photo's pixels | Yes, honest about the absence of photo-based calibration | |
| Name required, must contain a letter or number (blocks "," style names that produced broken cards) | Yes | |
| Submit: POST /api/walls (kind preset/uploaded, owner_type venue), then POST an initial "Untitled layout", then redirect to the editor with ?lid= | Yes | |
| 402 cap error renders the amber "You've hit your wall limit" panel with a /pricing link; validation and 5xx errors render inline | Yes | |
| Layout-creation failure after wall creation falls back to the walls list rather than stranding the user | Mostly; FLAG: the comment says "surface the issue" but router.replace happens with no message, so the user lands on the list with a wall that has no layout and no explanation (the editor will self-create one on open, so recoverable but silent) | |
| Demo account: wall create, upload-photo, wall PATCH/DELETE and renders all return 200 {demo:true} without acting; this UI does not check data.demo so a demo user's create appears to hang (no wall in response) | Yes as a guard; the client-side experience on demo is rough but demo-only | |

## Wall editor (/venue-portal/walls/[id])

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Full-bleed editor outside the portal chrome with its own auth redirect (login, non-venues sent home) | Yes | |
| Loads wall + layouts in parallel; picks ?lid= layout, else first; creates one inline when none exist; 404 state "Wall not found" and generic error state, both with back links | Yes | |
| Top bar: back link, wall name (sanitised), dimensions | Yes | |
| "Show on public profile" checkbox: optimistic PATCH is_public_on_profile with revert on failure; off by default; public venue page only serves is_public_on_profile walls, and the kill-switch also gates that endpoint | Yes | |
| Delete button opens confirm modal ("removes the wall and every saved layout... past renders stay accessible by their direct URLs"), DELETE /api/walls/[id] cascades layouts, then back to the list | Yes | |
| WorksPanel (desktop rail): tabs My (works on display, from active placements via /api/walls/my-works), Saved (bookmarks via /api/walls/saved-works), All (gallery feed via /api/browse-artists?limit=48), with counts, hints, search, and 20-at-a-time lazy reveal | Yes | |
| Panel empty states per tab explain where works come from | Yes | |
| Click a work to place it at wall centre; drag from panel to canvas to place at the drop point (application/x-wallplace-work payload) | Yes | |
| Default sizing chain: explicit drop size, else natural parsed dimensions / smallest listed variant orientation-corrected, else 60x80 clamped to the wall | Yes | |
| 2D canvas (react-konva): drag items, proportional-only resize via Transformer with hover-preview handles, snap guides to wall thirds/halves/edges and other items, min/max item size 5-1000cm | Yes | |
| 3D view toggle (bottom left): three.js corner room with orbit controls, textured planes, box-built frames, click-select and drag-move (resize stays in the toolbar) | Yes | |
| ItemToolbar on selection: listed-size dropdown (sorted by area, cm + price hints, orientation-corrected), frame style segmented control, finish select, bring forward / send back, duplicate (offset copy), delete | Yes | |
| Empty-canvas overlay hint ("Drag a work from the sidebar...") | Yes | |
| Wall config bar: preset colour chips (colour only, no dimension surprise), colour wheel, W/H inputs (50-1000), Close | Yes for unsaved/customer flows, but see next row | |
| Colour edits on a SAVED preset wall | FLAG: the config bar updates local background state only; auto-save persists items and wall dimensions but never wall_color_hex (saveLayout comments call background non-editable, yet the controls stay enabled). The venue recolours the wall, sees it stick all session, and loses it on reload. Either persist colour via the existing PATCH (the API accepts wall_color_hex) or disable the colour controls for saved walls | |
| Auto-save: 800ms debounced, stale-while-saving loop, wall-dimension PATCH fired only when dims changed since last successful save, then layout items PATCH; layout hash recomputed server-side for render cache | Yes | |
| SaveStatus chip (All saved / Unsaved / Saving / Saved / Save failed) with a Save now / Retry save button when dirty or errored | Yes | |
| QuotaChip top right: self-fetches /api/walls/quota?as=venue, hidden until the first unit is used, amber at 80%, red + Upgrade nudge at 100%, "Sign in to generate renders" for guests, silent muted chip on fetch error | Yes | |
| Render button: POST /api/walls/[id]/layouts/[lid]/render with the current items; 429 opens UpgradeModal with reason-specific copy (daily with reset time / monthly / burst), other errors surface in a self-clearing banner; chip refreshed after every attempt | Yes | |
| Render API: cache hit by layout hash returns free; quota consumed per NEW artwork per day (re-renders free); every post-consumption failure refunds; work images resolved from artist_works; 424 when nothing resolvable; layout.last_render_id updated | Yes, well built | |
| RenderPreview modal: image, cached/cost transparency line, item count + duration meta, Close | Yes | |
| Venue viewer anti-save measures: Download and Open-in-new-tab hidden, right-click and drag blocked, transparent overlay; artists keep download | Yes, explicitly friction-not-DRM and the rationale (artist IP) is coherent | |
| Mobile layout: collapsible thumbnail strip (cap 24 + "See all"), works/wall bottom sheets, slim action bar with wall-settings toggle and Render, safe-area padding | Yes | |
| Mobile wall sheet suppresses the config bar's Close so it cannot shut the whole editor | Yes | |
| Quota tier hint: venue_my_walls mode passes as=venue; the customer entry passes no hint so dual-role users resolve to their best tier | Yes | |

## Walls backing APIs (cross-checks)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| GET/POST /api/walls: auth required, flag-gated, POST validates via zod, enforces saved_walls tier cap with 402 + reason, returns cap on GET | Yes | |
| GET/PATCH/DELETE /api/walls/[id]: ownership re-checked against the service-role client, non-owners get 404 not 403, PATCH accepts name/dims/colour/notes/is_public_on_profile | Yes | |
| GET/POST /api/walls/[id]/layouts: owner-only, layouts-per-wall tier cap (402), wall_id body/URL match check, layout hash precomputed | Yes | |
| GET/PATCH/DELETE /api/walls/[id]/layouts/[lid]: both wall and layout ownership validated, hash recomputed when items change | Yes | |
| POST /api/walls/[id]/layouts/[lid]/render: see editor section; demo soft-guarded | Yes | |
| POST /api/walls/render-quick: preset-or-saved-wall single-work render for the customer artwork-page flow, same quota/refund guarantees, unknown preset 400 | Yes (customer-facing; venues only hit it from the shared component when no wall is persisted) | |
| GET /api/walls/quota: optional auth (guest tier for anonymous), ?as= hint validated against a whitelist | Yes | |
| GET /api/walls/my-works: venue's active placements resolved to full artist_works rows via current_placement_id, artist names attached, image-less rows dropped, soft-empty on error | Yes | |
| GET /api/walls/saved-works: saved_items type=work resolved to artist_works with artist names, saved order preserved | Yes | |
| POST /api/walls/upload-photo: multipart validation (size/MIME), private bucket, per-user path, signed preview URL; missing-bucket error message is actionable | Yes | |

## Curated landing (/curated)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Server component wraps CuratedClient in Suspense with metadata ("From £49.") | Yes | |
| Artist gate: signed-in artists see a polite "Wallplace Curated is for venues" redirect card with a portal link instead of the form | Yes | |
| Hero: full-bleed image, PICK A PLAN (#plans) and HOW IT WORKS (#how) CTAs, scroll indicator, trust strip (From £49 / 5 business days / cancel managed anytime) | Yes | |
| Hero image alt text reads "Mt. Fitz Roy, Patagonia" while the code comment describes a gallery-interior shot | FLAG: either the asset or the alt is wrong; screen-reader users are told a curated-art page opens with a Patagonian mountain. Fix the alt (and confirm the asset choice) | |
| ?cancelled=1 banner after a Stripe cancel: "Checkout cancelled. Nothing has been charged." | Yes, matches the API's cancel_url | |
| How it works 3-step strip with 5-business-day turnaround line | Yes | |
| Plans: one-off group (Single wall £49, Full space £149 with Most popular badge, Bespoke from £299) and managed group (Monthly £79.99/mo, Quarterly £199.99/qtr), tier data from the shared curated-tiers module | Yes, prices match the server-side curation-tiers table exactly | |
| Tier card select button auto-scrolls to the brief form; separate "Read the full plan" link to /curated/{tier} | Yes | |
| ?tier= query auto-selects a card (round trip from the detail pages) | Yes | |
| Value clarifier cards (Included / Priced separately / When to upgrade) and cross-cutting FAQ accordion | Yes, copy is consistent with tier data (revision round on £49/£149, refund-if-nothing-fits) | |
| Brief form status banner shows the selected tier + price with a "Change plan" reset; unselected state prompts to pick a plan | Yes | |
| Form fields: venue name*, venue type select, contact name*, email*, phone, location, wall count, timeframe, style/audience/mood/references textareas | Yes, client requires the three starred fields and the API mirrors that via zod | |
| Placement-method multi-select (QR-enabled loan / Paid loan / Direct purchase) with per-method explanations; budget field only shown when a paying method (paid loan or purchase) is ticked | Yes, smart conditional | |
| Submit button copy adapts per tier (Pay £49 / Pay £149 / Request quote / Subscribe £79.99/mo / Subscribe £199.99/qtr), disabled until a tier is picked | Yes | |
| Pre-submit hint states exactly what happens next per tier (no charge for bespoke, Stripe checkout otherwise) | Yes | |
| Submission POSTs /api/curation with a plain fetch (no Authorization header) | FLAG: the API tries to associate requester_user_id from a bearer token, but the form never sends one, so every submission (including from a signed-in venue mid-portal) is stored anonymous. Any later "your curation requests" surface or admin-to-account linking loses the association. Use authFetch when a session exists | |
| On mode:"checkout" redirect to Stripe; on mode:"enquiry" route to /curated/enquiry-sent; unexpected responses and network errors surfaced inline | Yes | |
| API behaviour, bespoke: insert awaiting_quote row, admin alert email, customer "we'll email a quote within 2 business days" email (idempotent per row), respond mode enquiry | Yes | |
| API behaviour, one-off pay-first (£49/£149): pending_payment row, Stripe payment-mode checkout with the request id in metadata, session id linked back (row retained if linking fails so money cannot vanish), success/cancel URLs correct | Yes | |
| API behaviour, managed: env price id required (503 with a helpful message when unset), retrieved price validated against the advertised amount, currency and cadence before any session (D22), subscription-mode checkout, row deleted only pre-session on failure (D19) | Yes, thorough | |
| Admin alert includes tier, contact, flow, and links to /admin/curation, keyed on the row id against double-alerts | Yes | |
| "Log in to your venue portal" footer link under the form | Yes | |

## Curated tier detail (/curated/[tier])

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Unknown tier keys 404 via notFound() | Yes | |
| Sticky top bar with tier label, price and the tier CTA linking to /curated?tier={key}#brief (auto-select + scroll on arrival) | Yes | |
| What's included, numbered How-it-works, and per-tier FAQ rendered from the shared tier data | Yes | |
| Footer "Ready to start?" repeats the CTA and reads "{price} · cancel any time." on EVERY tier | FLAG: "cancel any time" is a subscription promise; on Single wall (£49), Full space (£149) and Bespoke it is meaningless or misleading (one-off payments are not cancellable, they are refund-if-nothing-fits). Condition the line on the managed group | |

## Curation enquiry sent (/curated/enquiry-sent)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Static confirmation: "we've got your brief... tailored quote within 2 business days. No payment has been taken." | Yes, matches the bespoke email's promise and the API's no-charge flow | |
| CTAs: Browse artists while you wait (/browse) and Back home (/) | Yes | |
| Reachable directly without a submission (static page) | Yes, harmless | |

## Curation success (/curated/success)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Server-side Stripe session verification: retrieves ?session_id and branches paid / processing / no_session (D24 fix), so "Payment received" is only claimed on payment_status === "paid" | Yes | |
| Paid state: green tick, "shortlist within 5 business days" | Yes | |
| Processing state (unpaid or unverifiable session, including Stripe errors): amber clock, "We're confirming your payment... We'll email you the moment it clears" | Yes, correctly refuses to fabricate a receipt; note nothing on the page auto-refreshes, the user is told to watch their inbox, acceptable | |
| No session param: neutral "Start your curation." with a CTA back to /curated | Yes | |
| Session id is not validated as belonging to a curation request (any Stripe session id of the account shows its payment_status here) | Yes for MVP, the page only reveals a boolean paid state, no order details leak | |

## Cross-cutting venue notifications and digests

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Placement request received: artist or venue counterpart emailed (VenueNewPlacementRequest et al) plus in-app notification; venue-initiated requests notify the artist | Yes | |
| Placement accept/decline notifies the resolved requester by email and in-app, with fallbacks when requester attribution is missing | Yes | |
| Stage transitions (scheduled/installed/live/collected) send lifecycle emails to the counterpart | Yes | |
| Weekly venue digest cron (Wednesdays 09:00 UTC, vercel.json): profile views, new requests, active placements; skips venues under 14 days old or with under 3 events; idempotent per venue-week; suppression via the digests email category | Yes, and the analytics venue_user_id query fix is in place. The suppression flag is email_preferences.digests_enabled, which is NOT the settings-page checkbox (see Settings flag) | |
| Daily QR scan digest cron exists (qr-scan-digest) alongside | Yes | |
| No UI in the venue portal surfaces or previews the digest; the only venue-facing mention is the Settings checkbox | Yes, acceptable, subject to the Settings preference-store flag | |

---

# F. Messaging and placement negotiation (cross-role)

Sources read: `src/components/MessageInbox.tsx`, the three portal messages pages, `PlacementContextPanel.tsx`, `PlacementDetailClient.tsx`, `PlacementLoanForm.tsx`, `PlacementNegotiationLog.tsx`, `PaidLoanPaymentChip.tsx`, `CounterPlacementDialog.tsx`, `CounterOfferDialog.tsx`, `offers/OffersList.tsx`, `offers/MakeOfferModal.tsx`, `ArtworkRequestsList.tsx`, the artist artwork-request pages, and the backing APIs under `/api/messages`, `/api/placements`, `/api/offers`, `/api/artwork-requests`, `/api/contracts/sign`, `/api/moderation`, plus `lib/moderation.ts`, `lib/outreach-cap.ts`, `lib/placements/*`, `lib/arrangement-labels.ts`, `lib/placement-permissions.ts`, `lib/authz.ts`.

## Message inbox, conversation list (/artist-portal/messages, /venue-portal/messages) (Artist and Venue perspectives)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Artist messages page renders the shared `MessageInbox` with the artist's slug, `portalType="artist"`, and the artist's works passed in for the placement panel | Yes | |
| Venue messages page renders `MessageInbox` with the venue's slug and `portalType="venue"`; blocks on the venue profile loading first so the slug is correct | Yes | |
| Page subtitle copy: artist sees "Enquiries and conversations with venues and buyers", venue sees "Conversations with artists" | Yes | |
| `?artist=<slug>&artistName=<name>` query params preselect that conversation, or open the compose pane when no thread exists yet; one-shot per slug (a ref stops the 15s poll re-snapping selection, fixing bug #15) | Yes | |
| Conversation list loads via GET `/api/messages?slug=<own slug>`; server verifies the slug belongs to the authenticated user's artist or venue profile and 403s otherwise | Yes | |
| Conversation list polls every 15 seconds; state only replaced when the JSON actually changed | Yes | |
| Conversations grouped into "Active Placements" (an active placement exists with that party) and "All Conversations" | Yes | |
| Each row: avatar (image or initial), display name, green "Placed" chip, unread dot, two-line latest-message preview, relative time | Yes | |
| Preview strips legacy `[enquiry_type]` prefixes from old enquiry messages so internal routing tags never render | Yes | |
| Conversation search box filters by display name, slug, or latest message text; dedicated "No conversations match" empty state | Yes | |
| Empty state when no conversations: artist copy "Messages from venues and buyers will appear here", venue copy "Start by messaging an artist you're interested in" | FLAG: the venue copy tells the venue to start messaging an artist but offers no compose control anywhere in the inbox; a new conversation can only be started by arriving with `?artist=` from a profile page. The empty state should link to /browse | |
| Hover X on a conversation row opens a confirm ("Delete this conversation?") then calls DELETE `/api/messages/[conversationId]` | FLAG: the API hard-deletes every message row in the conversation for BOTH parties, but the confirm gives no hint the other party's copy is destroyed too, and the options-modal path describes the same endpoint as a recoverable archive. One endpoint, two contradictory stories, and no actual archive semantics anywhere | |
| Conversation ids are deterministic (`dm-<slugA>__<slugB>` sorted), so both directions land in one thread; the send path reuses any existing thread first | Yes | |
| Viewer's own blocks filter the conversation list (blocked slugs dropped server-side); fail-open on a read error | Yes | |
| Resizable sidebar (240 to 480px) with drag handle, width persisted to localStorage; full-width single column on mobile | Yes | |
| Skeleton loading layout mirrors the real three-pane inbox | Yes | |
| Support thread special-case: `wallplace-support` renders as "Wallplace Support", hides the portfolio/placement action row, and the placement panel shows "Placements don't apply" | Yes, mostly, but see reply-to-support flag below | |
| GET `/api/messages?dispute_id=` gives admins a dispute-scoped read of a conversation, with a mandatory audit row (read blocked if the audit write fails) | Yes | |
| PATCH `/api/messages` with `{all:true}` marks every unread message to the caller's slugs read (backs the header "mark all read" affordance) | Yes | |
| GET `/api/messages/unread` returns the unread count for the caller's slug | FLAG: it checks the artist profile first and returns early, so a dual-role user (artist and venue profiles on one account) never has their venue-slug unread counted; the mark-read paths deliberately handle both slugs, so the two disagree | |

## Message thread: sending, length caps, moderation, attachments, read state (Artist and Venue perspectives)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Thread loads via GET `/api/messages/[conversationId]`; participation proven server-side against the message rows (guessable `dm-` ids are not trusted); denial is 404 to avoid an existence oracle | Yes | |
| Thread polls every 8 seconds; switching threads clears messages first so stale content never flashes | Yes | |
| Opening a thread PATCHes the conversation to mark the caller's messages read; the reader is derived server-side from the signed-in user (closes the old spoofable `readerSlug` body); unread badge only cleared if the PATCH lands | Yes | |
| `wallplace:placement-changed` window event triggers an immediate conversation + thread refresh so accept/decline elsewhere shows up without waiting for the poll | Yes | |
| Reply input: 5,000 character cap enforced client-side (maxLength + disabled Send) and server-side; remaining-characters counter appears from the first keystroke, turning amber past 4,800 and red past 5,000 | Yes | |
| Enter sends, Shift+Enter reserved for newline | FLAG: the reply field is a single-line `<input>`, so Shift+Enter cannot insert a newline anyway; multi-line messages are impossible to compose even though rendering supports them and the cap assumes long text | |
| Send POSTs `/api/messages`; optimistic append and preview update only after a confirmed 2xx (`mutate` throws on failure); inline dismissible error banner on failure | Yes | |
| Server resolves the sender's slug and role from their artist/venue profile, never the client body, closing the impersonation vector; a sender with no profile gets 403 "Your account is not set up to send messages yet, complete your artist or venue profile first." | Yes for artist/venue; see customer section for who this strands | |
| Unknown recipient slug is rejected 404 with copy inviting the sender to "reply with their email and we'll send them an onboarding link" | FLAG: the copy asks the user to "reply" inside an error state where no reply channel exists (the message never sent); nothing ingests such a reply either | |
| Artist-to-artist messaging blocked (403 with clear copy) behind the GATING_V1 flag; existing threads stay readable | Yes | |
| Recipient's block stops the message before insert with neutral copy "This person isn't accepting messages from you." (deliberately does not reveal the block) | Yes | |
| Moderation, blocked patterns (spam phrasing, 3+ URLs, off-platform contact solicitation) reject the send with a 400 and reason; sender sees it in the error banner | Yes | |
| Moderation, flagged patterns (off-platform payment references) still deliver, stamp `moderation_flagged` into metadata, and queue a row in `moderation_queue` for admins; the sender and recipient see nothing (by design) | Yes | |
| Messages shorter than 2 characters are rejected as "Message too short" | FLAG: this guard also kills attachment-only sends. The route explicitly allows empty content when attachments exist, then unconditionally runs `moderateMessage(content)`, which rejects the empty string as "Message too short". The UI enables Send with attachments and no text, so every attachment-only send fails with a nonsense error. Single-character replies ("k") also fail with no client-side hint | |
| Attachment picker: paperclip button, hidden file input accepting JPEG/PNG/WebP/GIF/PDF, up to 10 per message, 10MB each; images pre-resized to 1800px; uploads happen immediately with a spinner, thumbnails preview above the input with per-file remove buttons | Yes, subject to the attachment-only send flag above | |
| Attachment metadata validated server-side (URL, filename, mime, size, optional dimensions, max 10) | Yes | |
| Attachments render inline: images as clickable thumbnails opening the file in a new tab, other files as a filename chip link | Yes, note the storage bucket serves plain public URLs so anyone holding the link can open the file; acceptable pre-MVP but worth knowing | |
| Text-message sends email the recipient via `sendMessageUnreadEmail` (idempotent per message id), honouring the recipient's `message_notifications_enabled` opt-out; placement/response message types are excluded because they have their own emails | Yes in principle | |
| Message-received email content and link | FLAG: the conversation URL is hard-coded to `/artist-portal/messages?c=<id>`, so a VENUE recipient is deep-linked into the artist portal; no messages page reads the `?c=` param anyway, so the thread never auto-opens; and `senderName` is the raw slug, so the subject reads "maya-chen sent you a message" instead of the display name | |
| Anti-spam outreach cap on artist first-contact to a venue: Core 2 / Premium 5 / Pro 10 new contacts per UTC day, shared across placements + first-contact messages + artwork-request responses; 429 with a friendly upgrade message; replies into an already-counted thread exempt | FLAG: the "used" figure counts every distinct conversation the artist sent ANY message into today, including replies to venue-initiated threads and old threads, which the exemption only excuses for the thread currently being messaged. An artist who replied in three existing conversations can be blocked from a single genuinely new contact on Core. The counting contradicts the stated "replies don't count" rule | |
| On a placement_request messageType, the messages route also creates the pending placement row (`p-msg-` id), stamps `proposed_by_user_id`, restamps the message metadata with `requesterUserId`, and emails the recipient (artist gets the invitation template, venue gets the request template) | Yes | |
| On a placement_response messageType, the route asserts the caller is a placement party, blocks answering your own request, validates the transition through the state machine, compare-and-sets on pending (409 "already been answered" on a race), stamps the venue collection address on accept, and emails | FLAG: the "notify the other party" email always goes to the ARTIST (accepted/declined templates addressed to them), so when the artist is the responder to a venue invitation the venue gets no email and the artist gets one describing their own action; the parallel PATCH `/api/placements` path picks the correct requester. Low blast radius only because no current client sends placement_response through this endpoint | |

## Message thread: pinning and per-message delete (Artist and Venue perspectives)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Hover action cluster on each bubble: pin (both parties' messages) and delete (own messages only) | Yes | |
| Pin toggles optimistically, PATCH `/api/messages/item/[id]` with action pin or unpin; server allows either conversation participant (pins are a shared bookmark); reverts and toasts on failure | Yes | |
| Pinned messages get an amber ring and a small pin glyph beside the timestamp | Yes | |
| Amber pinned bar at the top of the thread shows the most recent pin (count when several) with an unpin X | FLAG: the bar's copy claims "Click to scroll" in the code comment but no scroll-to-message handler exists; clicking the bar does nothing except the unpin X. Harmless but a dead affordance | |
| Delete own message: confirm dialog warns "The other party will see 'Message deleted' in its place", optimistic soft delete (blank content + `deleted_at`), server gate restricts to the sender, revert + toast on failure | Yes | |
| Deleted messages render as an italic "Message deleted" placeholder on both sides, keeping thread shape | Yes | |
| Server soft-delete falls back to a hard delete when the `deleted_at` column is missing in older environments | Yes, defensible fallback that honours intent | |

## Conversation options modal: help, report, archive, block (Artist and Venue perspectives)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Flag icon in the thread header opens a Vinted-style options modal: Help, Report, Delete conversation, Block user | Yes | |
| Help routes to /faqs (copy says "Open the FAQ in a new tab" but it is a same-tab Link) | FLAG: copy promises a new tab; the Link navigates in place, losing the thread the user was mid-way through | |
| Report asks for a reason via `window.prompt()`, then POSTs `/api/messages/report` with the other party, conversation id, and reason; confirmation shown only after a 2xx (E43-e), error toast otherwise | FLAG: a native browser prompt() inside an otherwise designed modal is jarring, cannot be styled, and on some in-app browsers prompt() is suppressed entirely, making Report silently unusable there; the reason belongs in a textarea inside the modal | |
| Report endpoint persists to `conversation_reports` (migration 111), truncates reason to 2,000 chars, rate limits 6/min, and returns a real 500 if the insert fails (no more swallowed writes) | Yes | |
| Delete conversation confirm says "It'll disappear from your inbox but can be restored by support if needed" and the success state says "Conversation archived" | FLAG: it calls the same DELETE `/api/messages/[conversationId]` which permanently deletes every row for both parties. Nothing is restorable and the counterparty loses the thread too. The copy is materially false; either implement per-user archiving or state the truth | |
| Block user confirm ("They won't be able to message you again") POSTs `/api/messages/block`; success state only after the server persisted the block; error toast otherwise | Yes | |
| Block endpoint upserts `(blocker_user_id, blocked_slug)` into `user_blocks`, rate limited 12/min, 500 surfaced if the write fails | Yes | |
| What block enforces: the send path refuses new messages from the blocked slug (neutral 403) and the blocker's conversation list hides the thread | Yes | |
| What block does not enforce | FLAG: `user_blocks` is consulted only inside `/api/messages`. `/api/offers` POST and `/api/placements` POST/PATCH insert conversation messages directly with the admin client and never check blocks, so a blocked venue can still land purchase-offer cards, placement requests, counters, and response messages in the blocker's thread (and trigger their bell/emails). Blocking also does not hide the thread from the blocked party or prevent them reading history. If block is meant to stop contact, the offer and placement message writers must honour it too | |

## Customer messaging surface (/customer-portal/messages) (User/customer perspective)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Customer portal has a Messages nav item rendering the same `MessageInbox` with `portalType="customer"` (treated as venue-like client-side), userSlug derived by slugifying the display name or email local-part | FLAG: the slug is invented client-side and matches no profile row, so GET `/api/messages?slug=` returns 403 for every pure customer; the inbox silently shows "No conversations yet" forever. A whole nav destination that can never work for its audience | |
| Sending as a customer (compose via `?artist=` deep link) | FLAG: POST `/api/messages` resolves the sender from artist/venue profiles only and 403s customers with "complete your artist or venue profile first", copy that makes no sense to a customer. Every customer send fails | |
| `MessageArtistButton` logged-out path pushes shoppers through `/signup/customer?next=/customer-portal/messages?artist=<slug>` with the stated goal that "the conversation has somewhere to live" | FLAG: the destination is the dead surface above; a brand-new customer lands in a compose box whose send is guaranteed to 403. Either give customers a messaging identity server-side or route them to /contact like the logged-in customer path does | |
| `MessageArtistButton` logged-in customer path shows "Contact Wallplace" linking to /contact?artist=<slug> so the platform vets the enquiry | Yes, sensible interim, but inconsistent with the signup path above | |
| `MessageArtistButton` hides entirely for artists viewing other artists (the API would 403 the send) | Yes | |
| MessageInbox swallows non-2xx on conversation load (`data.conversations` undefined leaves the list empty with no error) | FLAG: any auth/permission failure reads as "No conversations yet" instead of an error state; combined with the customer 403 this hides a hard failure behind a friendly empty state | |

## Enquiry-to-conversation flow (artist profile enquiry modal) (Visitor/Customer/Venue perspective)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| "Message" button in the artwork lightbox opens the enquiry modal (name, email, enquiry-type select, message), pre-labelled "Re: <work title>" when opened from a work | Yes as a form | |
| Enquiry submit POSTs `/api/messages` with the enquiry type in metadata (not a `[bracket]` prefix), so it lands in the artist's normal inbox thread; confirmation shown only after a confirmed 2xx (E43-h) | Yes for signed-in venue senders | |
| Enquiry modal for logged-out visitors and customers | FLAG: the modal renders for anyone (no auth gate on the trigger) and collects name/email as if anonymous enquiry works, but the API requires a bearer token and an artist/venue profile, so anonymous visitors get an auth failure and signed-in customers get the profile 403. The `senderType:"anonymous"` the form sends is accepted by the schema then ignored. The form should be gated or routed to /api/enquiry (which is what actually accepts public enquiries) as the primary, not the fallback | |
| Secondary best-effort write to `/api/enquiry` for backward compatibility, failure never undoes the confirmation | Yes given the primary succeeded | |
| Confirmation copy "They typically respond within 48 hours" | FLAG: invented SLA; nothing measures or enforces artist response time. Soft-promise copy should not state a typical figure the platform cannot back | |

## In-thread placement request / counter / response cards (Artist and Venue perspectives)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| `placement_request` messages render as a structured card: work image, title (initial requests), terms line via the canonical `labelForArrangement` (fee, QR share appended), and the sender's note with legacy auto-boilerplate lines stripped | Yes | |
| Counter offers reuse the same message type with `metadata.counter=true` and render with amber styling and a "Counter offer" header | Yes | |
| Accept / Counter / Decline buttons show only to the non-requester, gated on `metadata.requesterUserId` (falling back to sender match for legacy rows); the requester sees "Awaiting response" | Yes | |
| Accept/Decline call PATCH `/api/placements` (status active/declined); the server writes the single `placement_response` message (the old client double-write is gone), errors surface as toasts, and a `wallplace:placement-changed` event fans out | Yes | |
| Legacy request cards without a `placementId` in metadata: Accept/Decline click skips the PATCH entirely and just refreshes | FLAG: the click appears to do nothing (no state change, no message, no error); better to disable the buttons with an explanatory tooltip on metadata-less legacy cards | |
| Once responded, the card shows a footer state: "Accepted" (green), "Declined" (red), "Cancelled"; response matching is timestamp-aware so a newer counter re-opens actions on the newest card only | Yes | |
| After a decline, the original offerer sees "Counter with new terms" on the card; the decliner sees "You declined, the other party can come back with revised terms." | Yes | |
| Counter button opens `CounterPlacementDialog` inline, prefilled from the most recent placement_request metadata for that placement (fee, share, QR) | Yes | |
| `placement_response` messages render as a centred pill: "Placement Accepted" / "Placement Declined" / "Placement Cancelled" | FLAG: the cancelled pill reuses the declined red styling test (`accepted ? green : red`), fine, but the cancelled icon branch exists while the wrapper class only distinguishes accepted vs not; minor, consistent enough. No issue beyond nitpick, treat as Yes | |
| Response and cancellation auto-messages are inserted pre-read (`is_read: true`) so the bell and the message badge do not double-count one event | Yes | |

## In-thread purchase offer cards (Artist and Venue perspectives)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| `purchase_offer` messages render a rich card: primary image with "+N" overlay for multi-work offers, title, size/dimensions/medium line, quoted note, amount in the header, amber "Counter offer" variant | Yes | |
| Live-offer detection: the card keeps its Accept / Counter / Decline only while no later `purchase_offer_status` for the same offer id exists; superseded cards collapse to a status footer, so stale cards cannot be acted on | Yes | |
| Accept/Decline call PATCH `/api/offers/[id]`; only the recipient of the live row may act (server-enforced via `created_by_user_id`) | Yes | |
| After accepting, if the viewer is the message recipient the client immediately POSTs `/api/offers/[id]/checkout` and redirects to Stripe | FLAG: the condition tests "am I the recipient", not "am I the buyer". When the ARTIST accepts a venue's offer they are the recipient, so the client fires a checkout call that the API correctly 403s ("Only the buyer can check out") and the error is swallowed. Harmless today but a wasted, misconceived call; the venue-accepting-a-counter case is the only one that should fire | |
| Counter opens `CounterOfferDialog`, which re-fetches the offer via GET `/api/offers/[id]` to recover artist slug / work ids / collection id, seeds the latest server amount, validates > 0, and POSTs a child offer with `parentOfferId` | Yes | |
| Sender of an open offer sees "Awaiting response…" on their card | Yes | |
| `purchase_offer_status` messages render standalone status pills only when the parent card is missing from the window; otherwise suppressed to avoid duplication | Yes | |
| Offer creation/counter/status all insert a thread message so the negotiation reads as one conversation | Yes, but note these inserts bypass user blocks (see block flag above) | |

## Placement context panel (drawer in Messages) (Artist and Venue perspectives)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| "Placement Status" toggle in the thread header opens the panel as a right-hand drawer at every viewport; backdrop click or chevron closes it | Yes | |
| Panel loads all the caller's placements via GET `/api/placements` and filters to the current counterparty's slug; refreshes on `wallplace:placement-changed` | Yes | |
| Multiple placements with one party: prev/next arrows with an n/m counter, defaulting to the most recent Pending/Active row | Yes | |
| Six-step progress timeline (Requested, Accepted, Scheduled, Installed, Live on wall, Collected) with dates, current/next markers, and a dedicated declined rendering | Yes | |
| Accept / Counter / Decline row on a Pending placement, gated by the shared `canRespond` helper | FLAG: `canRespond` reads `requester_user_id`, but GET `/api/placements` returns the resolved requester under `proposed_by_user_id` and the production table has no `requester_user_id` column (schema-columns.json; migration 008 never applied). The field is therefore always undefined, `canRespond` hits its refuse-when-ambiguous branch, and the panel NEVER shows Accept/Counter/Decline; both parties see the amber "Awaiting response" chip instead. The only working respond surfaces are the thread card and the detail page. The API should map `proposed_by_user_id` onto `requester_user_id` (the stale comment in `directionFor` even claims it already does) | |
| Sent/Received direction tag beside the status chip | FLAG: same root cause; `directionFor` returns null without `requester_user_id`, so the tag never renders from this panel (or any consumer of the list API) | |
| Declined state: requester sees "Your offer was declined" plus "Counter with new terms"; decliner sees the passive waiting note | FLAG: same root cause; `iAmRequester` is always false, so the requester is shown the decliner's copy ("You declined, the other party can come back") which is flatly wrong for them, and the Counter re-open button never appears here | |
| `?counter=<placementId>` deep link (from the placements list "Counter" buttons) jumps the panel to that placement and auto-opens the counter form prefilled | Yes, and it usefully bypasses the broken canRespond gate; the server still enforces who may counter | |
| Counter form: paid-loan toggle + monthly fee, independent QR toggle + share %, note, "free display" hint when both toggles are off; submits as a `counter` PATCH | FLAG: the panel derives `arrangementType: "free_loan"` for a paid-loan counter (comment claims free_loan "is the DB value for has-a-monthly-fee"), while `CounterPlacementDialog` sends the canonical `paid_loan` for the identical intent, and neither sends `mixed` for fee+QR. The counter PATCH stores the raw client string without running `deriveArrangementType`, so the stored column regresses to the legacy alias or diverges from the fee/QR columns depending on which surface countered. Displays survive because labels are data-derived, but the "canonical arrangement_type written at source" invariant is broken on every panel counter | |
| Request-a-Placement form (no placement yet): work multi-select grid (up to 12 shown), Revenue share vs Paid loan type buttons using canonical labels, share % (0-50), monthly fee, optional QR + share on paid loans, note, disabled Send until a work is selected | Yes | |
| Venue-side works for the request grid load from `/api/browse-artists` filtered by slug | Yes with a caveat: an artist absent from the public browse feed yields "No works available yet." and the venue cannot request from the panel at all; no hint explains why | |
| Stage advance CTA ("Mark installed" etc.) for Active placements, schedule flow opens a date+time picker (min today) before stamping; "Change install date" link while scheduled and not yet installed | Yes | |
| Undo button for the most recent reached stage with confirm; success re-fires the cross-portal event | Yes | |
| Terms block: type label, monthly fee row when a fee exists, revenue-share row when QR is on with a share, QR enabled/disabled row on paid loans, requested/accepted dates | Yes | |
| Revenue block on Active/Completed/Sold: share % and "Earned to date" from summed order revenue | Yes | |
| "Open full placement" link to /placements/[id] | Yes | |

## Placement detail page (/placements/[id]) (Artist and Venue perspectives)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Server route is a thin client wrapper; unauthenticated visitors are redirected to /login; non-parties get 403 from the API and see the error state with a back link | Yes | |
| GET `/api/placements/[id]` returns the placement, loan record, record versions, photos, artist/venue profiles, earned revenue, and the viewer's role; strictly party-gated | Yes | |
| Sticky breadcrumb bar (portal root, Placements, work title) keyed off the viewer role | Yes | |
| Header: arrangement label from the canonical labeller (+share %), ownership line ("Venue owns the work" on purchase, otherwise "On loan from artist"), work image, artist link, venue name/location, status badge via the shared normaliser (Unknown statuses surface loudly instead of defaulting to Active) | Yes | |
| QR label deep link (venue: labels?placement=, artist: labels?works=&venue=) and venue-only "Place on a wall" link on active placements | Yes | |
| Six-step progress bar with per-stage dates (year shown when not current year), declined/cancelled headline notes | Yes | |
| "Mark <next stage>" advance button (active only), schedule date+time picker with min today, "Change install date", and "Undo <stage>" with confirm | Yes | |
| Stage advance errors are silently swallowed (`catch { /* ignore */ }`) | FLAG: a rejected advance (e.g. past date, 422) leaves the user with a button that appears to do nothing; the undo path shows a toast, the advance path should too | |
| Respond panel (Accept / Counter / Decline) on Pending, shown only when the requester is known and is someone else; requester resolved server-side as latest counter sender, then the `requester_user_id` column, then the original request message sender | FLAG: the fallback chain never reads the real `proposed_by_user_id` column (the phantom `requester_user_id` is always undefined in production), and the message-trail scan fetches only the latest 50 placement_request messages platform-wide before filtering by placement. A placement whose auto-message insert failed, or one older than the last 50 requests platform-wide, resolves no requester, and BOTH parties then see "Awaiting their response" with no controls, deadlocking the negotiation on this page. Read the column that exists and scope the message query by placementId | |
| Requester-side pending state: "Awaiting their response" chip with explanatory copy distinguishing "you sent this" from "requester unknown" | Yes | |
| Declined state panel: requester gets "Your offer was declined" + "Counter with new terms"; decliner gets the passive note | Yes (this page has the working requester inference; subject to the 50-row scan flag) | |
| Counter dialog (`CounterPlacementDialog`) prefilled from the row; optimistic update flips terms, requester, and declined→pending locally; negotiation log refreshes; page scrolls to the updated summary | Yes | |
| Counter dialog error display uses `err.code` (the body `error` string) with fallback | Yes, works because placement errors carry human text in `error` | |
| Summary grid per arrangement: revenue_share shows share % + earned; loans show monthly fee (or "Free display") + QR state with share; purchase shows "Venue owns the work" + QR state; created date | Yes; note a `mixed` row goes down the loan branch and reads correctly (fee + QR share) | |
| Paid-loan payment chip under the terms (see billing section) | Yes | |
| "Works in this placement" gallery: primary badged, extra works with size labels | Yes | |
| Negotiation log: chronological placement_request/response entries via GET `/api/placements/[id]/history` (party-gated, metadata-contains query), counters amber, responses green/red, terms summarised, collapsed to 3 with "Show all" | Yes | |
| Request message and notes blocks | Yes | |
| Background sync on tab focus/visibility, silent, with a diff toast when status changed ("Status changed: pending → active") or photos were added | FLAG: the status toast prints raw lowercase DB statuses rather than the display normaliser's labels; cosmetic inconsistency with every badge on the page | |
| Tab title reflects work + counterparty and restores on unmount | Yes | |

## Placement lifecycle API (/api/placements GET, POST, PATCH, DELETE) (both perspectives)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| GET lists the caller's placements by role, computes per-placement earned revenue from orders, QR scan counts from analytics events, archive filtering (`hidden_for_*` columns first, `placement_archives` fallback), and resolves the effective requester (latest counter sender > `proposed_by_user_id` column > first request-message sender, with a background column backfill) | Yes on its own terms, but see the field-name flag: clients read `requester_user_id`, which this endpoint never emits | |
| Requester inference message scan is capped at the most recent 1,000 placement_request messages platform-wide | FLAG: platform-wide caps (1,000 here, 50 in the PATCH and [id] GET) silently stop covering older placements as volume grows; the queries should filter `metadata->>placementId` server-side per placement, which the history endpoint already proves is possible | |
| POST creates one row per requested work with the full column set; `arrangement_type` canonicalised via `deriveArrangementType` at write time; `proposed_by_user_id` stamped; venue-initiated requests allowed for artists with no account yet (slug-only rows claimed later) | Yes | |
| POST guards: artist self-placement across own profiles blocked; pending-review artists blocked with clear copy; GATING_V1 subscription gate for artist-initiated requests (402 with upgrade URL); artist outreach cap counted per work requested; venue callers without a venue profile get a venue-specific 409 explaining the real fix | Yes | |
| POST notifications: recipient email (venue request template or artist invitation template with terms summary), requester receipt email (artist-initiated only, via `afterResponse`), bell notification with a deep link, and an auto placement_request message into the existing or deterministic conversation carrying full terms metadata and `requesterUserId` | Yes; venue-initiated requesters get no receipt email (acknowledged in code as unwired), acceptable gap | |
| PATCH status changes run through the placement state machine (pending→active/declined/cancelled, declined→pending only via counter, active→completed/cancelled/paused, terminal states locked), 422 with the reason on an illegal transition; declined requesters can no longer force their deal live (E20) | Yes | |
| PATCH accept guards: requester cannot accept own request (column plus message-trail inference, counters flip the role), self-placement blocked, pending-review artists blocked from accepting, GATING_V1 subscription gate on artist accept/counter (decline stays free) | Yes | |
| Accept stamps `responded_at`, `accepted_at`, and the venue's composed collection address; engaging actions auto-unarchive the row for the actor | Yes | |
| Counter PATCH: allowed on pending (non-requester) or declined (requester only), blocked on active/completed/cancelled with specific copy; terms update verified row-level (500 rather than a false success if nothing saved); declined rows reopen to pending; role flips via `proposed_by_user_id`; counter auto-message with amber card metadata; bell + email (changed terms listed) to the counterparty | FLAG: the counter writes `counter.arrangementType` verbatim instead of re-deriving it from the new fee/QR/share (the POST path derives; the counter path trusts the client), which combined with the panel sending `free_loan` for paid loans leaves the stored type non-canonical after counters. Also `revenueSharePercent` accepts up to 100 here while every UI caps at 50 | |
| Accept/decline fan-out: bell first (independent of email), then role-correct emails (artist accepted/declined templates, venue confirmation / venue-declined templates), then the pre-read placement_response thread message; requester fallback chain ends with "the other party" so nobody silently gets nothing | Yes | |
| Stage PATCH (scheduled/installed/live/collected): active-only, explicit `stageDate` supported, past-dated schedules rejected server-side, collected also sets status completed; both parties get stage emails (scheduled with date+time, installed with QR label link, ended with return-instructions and review links) and bell notifications, idempotent per placement+stage+user | Yes | |
| Undo stage clears the timestamp (collected undo drops status back to active); server deliberately does not enforce most-recent, UI does | Yes | |
| Paid-loan billing: leaving active for cancelled/completed/sold cancels the Stripe subscription at period end (covers the stage:"collected" path via effective status); acceptance no longer auto-starts billing (K2), the venue's explicit Set up payment flow is the only creator | Yes | |
| Inventory hooks: first pending→active decrements stock on matching works and stamps placed_at_venue / current_placement_id; active→completed restores if this placement still owns the work; best-effort, logged | Yes | |
| Cancellation fan-out: bell, email (persona-specific next-step link), and a pre-read cancelled thread message | Yes | |
| DELETE archives (never hard-deletes): hides the row for the caller only via `hidden_for_*`, `?unarchive=1` reverses, legacy `placement_archives` fallback with clear migration errors | Yes | |

## Paid-loan billing setup (/placements/[id]/payment and PaidLoanPaymentChip) (Venue pays; Artist informed)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Chip visibility: any paid-loan arrangement (canonical or fee>0) whose subscription status is not active/trialing; hidden once billing is healthy | Yes | |
| Chip intensity: amber for past_due/unpaid/incomplete_expired or live-without-payment; muted before install; venue gets the "Set up payment" CTA, artist gets info-only copy; compact variant for list rows | Yes | |
| Artist copy for live-without-payment: "the venue hasn't started billing yet, we've nudged them" and for problem states "We've nudged the venue" | FLAG: nothing nudges anyone for live-without-payment; no cron or notification targets that state (the crons directory has no paid-loan nudge), so the artist is told an action happened that does not exist. The dunning case at least has Stripe retries behind it | |
| Payment page gate order: login redirect, placement must exist and belong to the caller as venue ("Only the venue can set up monthly payments"), a positive monthly fee required ("nothing to set up here") | Yes | |
| Payment page loads via `/api/placements?id=...` and filters client-side (the API ignores the id param) | Yes, works; mildly wasteful | |
| Payment page summary card: work, artist, fee, QR sales, billing line, Stripe reassurance | FLAG: the artist is shown by SLUG (`artist_slug`), so the headline reads "Pay maya-chen monthly"; the fallback `artist_name` field does not exist on the row. Should resolve the display name | |
| Billing copy "Your card is charged £X at the start of each month" | FLAG: the Stripe subscription anchors on the setup date, not the 1st of the month; the charge lands monthly on the signup anniversary. Copy misdescribes when money leaves | |
| "Start monthly payment" POSTs `/api/placements/[id]/payment/setup` via authFetch (deliberately owner-gated money handler, not migrated to mutate), redirects to the Stripe subscription Checkout URL, inline error otherwise | Yes | |
| Setup API: venue-only, fee>0, duplicate-subscription guard against both the billing ledger and the placement mirror (409 "already set up"), payout capability pre-flight fails closed (422 with human copy) so money is never collected that cannot be forwarded, platform fee recorded in metadata for the webhook, hourly idempotency key including the amount so double-clicks reuse one session | Yes | |
| Setup success URL returns to /venue-portal/placements?payment=setup-complete; cancel returns to the payment page with ?cancelled=1 | Yes (the ?cancelled=1 param is not surfaced by the page, harmless) | |

## Consignment / loan record and contract (/placements/[id] record section, /api/placements/[id]/record, /api/contracts/sign) (both perspectives)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Collapsible "Loan / consignment record" section; "+ Add record" creates one prefilled from the placement's agreed terms (record type derived from arrangement, QR, share, fee), auto-opens and scrolls to it | Yes | |
| PUT `/api/placements/[id]/record` upserts, party-gated; per-field zod errors surfaced with field names instead of a flat "invalid" | Yes | |
| Record form fields: type (loan/consignment), QR / exclusive / available-for-sale toggles, start/review/collection dates (review and collection min-bound to start), agreed/insured/sale values, venue share %, monthly display fee, payout terms, condition in/out, damage notes, location in venue, piece count, delivered by, collection responsible, logistics notes, contract link, internal notes | Yes | |
| Bilateral approval: each party can tick only their own box (server 403s cross-role ticks), read-only status row for the other side, "Approved by both parties" summary, waiting-on callout | Yes | |
| Any content change (approval ticks excluded) snapshots the previous row into `placement_record_versions`, resets BOTH approvals, and the form mirrors the reset immediately; version log banner explains "Approvals were cleared" | Yes | |
| Version history: latest-edit banner with who/when/which fields, expandable full log with human field labels | Yes | |
| Version snapshot failure is logged loudly but does not block the save | Yes, reasonable trade recorded honestly | |
| Emails and bells: first-ever record creation notifies both parties (consignment-record-created, category legal); both-approved transition sends "Contract countersigned" to each party naming the counterparty, plus bell notifications; idempotent keys | Yes | |
| "Internal notes" field label | FLAG: it reads as private but the record is one shared row both parties read and edit; nothing scopes it per side. Either rename it ("Shared notes") or actually make it per-party | |
| Contract upload (PDF/Word/JPEG/PNG, 10MB) to the private `contracts` bucket returning an opaque `contract:` ref; legacy paste-a-link accepted with a light http(s) client check | Yes | |
| "View attached contract" exchanges the ref via POST `/api/contracts/sign`: party check on the placement, ref must match the stored record (no cross-placement signing), 10-minute signed URL; legacy public URLs passed through; external links opened directly | Yes | |
| Older-environment retry strips the artist approval columns if missing and still saves the rest | Yes as a fallback; the artist's tick silently not persisting in such an env is logged only, acceptable for a migration-lag path | |

## Placement photos (/api/placements/[id]/photos) (both perspectives)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| "+ Upload" accepts multiple images, uploads each then POSTs the URL; party-gated; new photos prepend | Yes | |
| Upload errors toast per failure | Yes | |
| Photo POST bell-notifies the counterparty ("New placement photo") with a deep link | Yes | |
| Caption supported by the API (max 500) and rendered in the lightbox | FLAG: no UI ever collects a caption, so the field is dead weight; the notification body's caption branch can never fire. Add a caption input or drop the plumbing | |
| Delete restricted to the uploader (API checks `uploader_user_id`), X button only rendered on own photos | Yes | |
| Quick-view lightbox with prev/next, Esc/backdrop close, right-click and drag suppressed (casual save deterrent, honestly commented as not real protection) | Yes; note Esc is claimed in the comment but no keydown handler exists, only click-out; minor dead promise | |

## Reviews after completion (/placements/[id]/review, /api/placements/[id]/review) (both perspectives)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Review page: 1-5 star picker with hover state, optional 2,000-char comment, signed-out visitors get a login link with a return path, submit disabled until a rating is picked | Yes | |
| POST gates: caller must be a placement party; the reviewee is the other party; one review per reviewer per placement enforced by a DB unique index, surfaced as 409 "You've already reviewed this placement" | Yes | |
| No placement-status gate on reviewing | FLAG: the header comment and the email flow say reviews happen "after the placement has wound down" (the cron mails 7 days post-collection), but the endpoint and page accept a review on a pending or active placement, so either party can rate the other before anything has happened. Gate on completed/cancelled | |
| Error display uses `err.code` (the body error string) so the 409 duplicate copy surfaces correctly | Yes | |
| On submit: bell to the reviewee ("New N-star review") and a `review_posted_notification` email with the rating, text, and reviewer's display name | Yes | |
| Bell/email link goes to the placement page, where nothing displays reviews | FLAG: "Tap to read your review" links to /placements/[id], which renders no review section anywhere; the reviewee can never actually read the review text beyond the notification preview. Either render reviews on the placement or link somewhere that shows them | |
| Success state links back to the placement; cancel link provided | Yes | |

## Offers lifecycle (MakeOfferModal, OffersList on /venue-portal/offers and /artist-portal/offers, /api/offers) (Venue buyer and Artist seller perspectives)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| MakeOfferModal gates: signed-out users get a sign-in prompt with return path; signed-in non-venues get a venue-only explainer; venues get the form | Yes | |
| Offer form: amount prefilled at 85% of asking, minimum (60% of asking) surfaced inline, optional 2,000-char message, success state with toast and auto-close plus manual close | Yes | |
| POST `/api/offers` enforces venue-only creation (customers 403 with buy-normally copy; artists may only counter), works XOR collection target, £500k cap, and the 60% floor computed against the pinned size label, the collection bundle price, or the largest tier per work; floor errors return the exact minimum which the modal renders | Yes | |
| Counters: parent must be open and the caller a party; the recipient-only rule (`created_by_user_id`) blocks countering your own offer ("self_counter" copy); parent flips to `countered`; the child inherits buyer/artist so chains stay on the same two parties; artist counters skip the 60% floor | Yes | |
| Offer creation drops a purchase_offer card into the dm thread with full metadata and notifies by bell (recipient-correct portal link) and email (`offer_received_notification` with a ?focus= deep link that scrolls and highlights the row) | Yes | |
| OffersList renders amount, target title (work/collection/N works), counterparty with @handle disambiguation and profile link, per-work size/medium lines, "Original message" label on quoted notes, status badge with viewer-aware pending wording ("Awaiting response" for the sender) | Yes | |
| Action gating: Accept/Counter/Decline only for the recipient on the live pending row; Withdraw only for the sender on pending; superseded `countered` rows show no actions | Yes | |
| Accept by the buyer auto-fires the pay step; accept by the artist notifies the buyer with a ?pay= deep link that auto-launches Stripe checkout on the offers page | Yes | |
| Pay button ("Complete payment, £X") is buyer-only on accepted rows and deliberately kept on authFetch as an owner-gated money boundary | Yes, intentional and documented | |
| Withdraw confirm dialog copy: "The artist will see this offer as withdrawn" | FLAG: when the ARTIST withdraws their own counter the recipient is the venue, so the copy names the wrong party; make it counterparty-neutral | |
| PATCH decline notifies the declined sender with "Make a new offer if you'd like to revise"; withdraw notifies the counterparty; accept notifies the buyer "Tap to complete checkout"; each drops a `purchase_offer_status` line into the thread | Yes | |
| Offer expiry | FLAG: `expires_at` is accepted at creation, stored, and typed through the UI, but nothing ever displays it, no job or read path flips pending offers to `expired` at the deadline, and PATCH happily accepts a time-expired offer. The only writer of `expired` is the checkout stock check. Either enforce and show expiry or stop accepting the field | |
| Checkout POST `/api/offers/[id]/checkout`: buyer-only, accepted-only, re-validates stock for both work and collection shapes (sold/deleted works close the offer via a compare-and-set to `expired` with a clear 409), payout capability pre-flight fails closed, integer-pence fee split carried in session metadata for the webhook, single aggregate line item | Yes | |
| Checkout cancel URL | FLAG: `cancel_url` is `/customer-portal/offers`, a route that does not exist (customer-portal has no offers page) and the buyer is a venue anyway; a venue backing out of Stripe lands on a 404 instead of /venue-portal/offers | |
| Paid state renders "Paid · order <id>" on the row | Yes | |
| Empty state ("No offers yet") with a Browse artwork link on the buyer side | Yes | |

## Artwork requests, public browse (/artwork-requests) (Artist perspective; gated views for others)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Public page: hero copy, breadcrumb, and the shared `ArtworkRequestsList` | Yes | |
| Gating: signed-out visitors get "Open requests are for Wallplace artists" with Sign in / Apply CTAs; venues get an explainer routing to their own portal; customers get an apply nudge; only artists see the list | Yes | |
| Signed-out sign-in CTA points at `/login?next=/spaces?view=requests` | FLAG: from THIS page the return path should be /artwork-requests; sending the user to the /spaces requests tab after login is a surprising relocation (the component is shared with /spaces, but the next target is hard-coded to one host page) | |
| API gate mirrors the UI: GET `/api/artwork-requests/public` 403s anyone without an artist profile so the demand feed cannot be scraped | Yes | |
| The public feed lists only `semi_public` open requests with curated fields | Yes; note an artist invited to a PRIVATE brief will not see it on this surface, only on the artist-portal list which includes invited-slug rows; mildly inconsistent but defensible | |
| Cards show venue image/name/type/location, title, clamped description, arrangement summary (QR display with % to artist, Purchase, Commission, Loan), budget range, timescale, style/medium chips | Yes | |
| "View venue" links to the venue page; "Respond" links to /artist-portal/artwork-requests/[id] | Yes | |
| Empty state "No open requests right now" with a Browse spaces CTA | Yes | |

## Artwork requests, artist portal list and respond (/artist-portal/artwork-requests, /artist-portal/artwork-requests/[id]) (Artist perspective)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| Portal list tabs: "My responses" (requests the artist has responded to, via `mine_only=1`) and "All open requests"; the All tab is paywalled behind subscription when GATING_V1 is on, showing an upgrade modal | Yes | |
| List rows: title, venue name, clamped description, intent/medium/budget/location chips, linking to the respond page | Yes | |
| GET `/api/artwork-requests` includes private briefs the calling artist is invited to (bearer token forwarded), and redacts venue user ids, invite lists, and budgets from anonymous callers | Yes | |
| Respond page loads via GET `/api/artwork-requests/[id]`; visibility enforced by `assertCanViewArtworkRequest` (owner, invited artist on private, any approved artist on semi_public), denial 404; distinct load-error state instead of an infinite spinner | Yes | |
| Brief header: title, venue name, description, intent chips, budget, location | Yes | |
| Response type picker: Request a placement, Quote a price, Suggest a commission, Just a message, each with a one-line tip; legacy `existing_works` removed from creation | Yes | |
| Work picker (placement optional, offer mandatory) from the artist's own portfolio, plus a per-work size dropdown when a work has multiple pricing tiers, labels stored in response metadata | Yes | |
| Placement terms: monthly fee (0 = free display), revenue share 0 to 50 with max hint, QR checkbox noting it is required for revenue share | FLAG: the "required for revenue share" claim is not enforced; the artist can submit share>0 with QR unticked, and the accept handler will then create a revenue_share placement with `qr_enabled=false`, an arrangement the rest of the product treats as contradictory (share is defined as a cut of QR sales). Enforce the pairing at submit or on accept | |
| Message field mandatory (client-side check with a clear error), 4,000 cap; offer needs at least one work | Yes | |
| Submit POSTs `/api/artwork-requests/[id]/responses`; success panel "Response sent. The venue will be in touch."; cap note under the button explains the shared daily allowance | Yes | |
| POST gates in order: artist-only 403, visibility/invite gate (E46d, before the cap so refused attempts do not burn quota), closed request 409, outreach cap 429 with friendly message | Yes | |
| No duplicate-response guard and no closed-state handling in the UI | FLAG: the API returns the artist's own prior responses on load but the page never shows them or disables re-submission, so an artist can file unlimited duplicate responses to one brief (each burning cap quota); and a closed brief still renders the full form, failing only at submit with a bare "Request is closed". Surface prior responses and the closed state up front | |
| Insert fallback: if extended columns (metadata size labels, proposed placement terms) are missing in the environment, the response saves core-only and the dropped columns are operator-logged | FLAG: when the fallback fires, the artist's proposed fee/share/QR silently vanish from the saved response while the UI says "Response sent"; at minimum the response should tell the artist their terms did not attach. Environment-conditional, low likelihood in prod | |
| Venue bell notification on each response ("New response to <title>") linking to the venue's request page | Yes; no email to the venue for responses, bell-only, worth an owner decision | |

## Artwork request responses, venue accept/decline and fulfil (APIs; effects land on artist surfaces) (Venue acting, Artist receiving)

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| PATCH `/api/artwork-requests/[id]/responses/[responseId]` is venue-owner-only; response must still be `sent` (409 "Response already actioned" otherwise) | Yes | |
| Decline flips the response to declined and bell-notifies the artist ("the venue passed on this response") | Yes | |
| Accept of an `offer` response creates a pre-accepted `purchase_offers` row at the proposed amount, immediately payable from /venue-portal/offers | Yes | |
| Accept of a `commission` response creates an accepted commissions row | Yes | |
| Accept of a `placement` response auto-creates the placement with the artist's proposed terms, arrangement type derived (share>0 revenue_share, fee>0 paid_loan, else free_loan), QR defaulting on for revenue share, `proposed_by_user_id` = artist, and status ACTIVE with `accepted_at` stamped (both sides already agreed) | FLAG: unlike every other acceptance path, this one skips the T9 collection-address stamp, so a placement born here has no captured collection point for the later collect flow; it also bypasses the pending-review-artist and subscription gates that a normal accept enforces. Also, when the artist pinned no works, `work_title` becomes the brief title, which then drives the inventory-by-title matching on completion (harmless no-op but a silent mismatch) | |
| Accept falls back to routing the venue to their placements list when the venue profile name is missing or the insert fails, so the response still flips to accepted and the artist is still notified | Yes | |
| Artist notification on accept links to the right portal area per created artefact (offers / commissions / placements / messages) | Yes | |
| Missing fan-out: neither accept nor decline emails the artist (bell only), and no thread message is written, so the dm conversation never reflects the outcome of a request response | FLAG: inconsistent with placements and offers, both of which mirror every state change into the thread and email; an artist who lives in their inbox can miss an acceptance entirely if they dismiss the bell | |
| POST `/api/artwork-requests/[id]/fulfill` is venue-owner-only, requires the response to be `accepted`, and is idempotent three ways (request already fulfilled 409, any linked artefact present 409, compare-and-set on the response status), so replays cannot mint duplicate payable offers or placements; DB unique indexes on `source_response_id` back-stop concurrency | Yes | |
| Fulfil routing: offer/commission to the venue offers/orders pages; placement to /placements/[id]; legacy `existing_works` lets the venue choose "placement" (creates a pending placement) or "order" (creates a pre-accepted purchase offer) | FLAG: the existing_works "order" branch prices the offer at `proposed_offer_amount ?? proposed_commission_amount ?? 0`, so a legacy row with neither amount produces an accepted, payable offer of £0.00; guard against a zero amount | |
| Fulfil flips the request to `fulfilled` and marks the response fulfilled; failures to consume the response are logged loudly | Yes | |

## Cross-cutting notes for this area

| Functionality | Does it make sense? | Does it actually work in production? |
|---|---|---|
| One canonical dm thread per party pair across messages, placements, offers, and enquiries (deterministic id plus reuse-existing-thread lookups everywhere) | Yes, consistently implemented across all four writers | |
| Demo-account guard: strict 403 on the money/content-reaching writes (send message, create placement/offer, checkout), soft 200 `{demo:true}` on low-stakes writes (mark read, pin, archive, record, review, block/report) | Yes | |
| Shared `wallplace:placement-changed` event keeps the inbox, panel, and detail page in sync without waiting for polls, and is only dispatched after confirmed 2xx responses | Yes | |
| Reply-to-support: the Wallplace Support thread keeps the normal reply box, but sending resolves the recipient slug against artist/venue profiles, so unless a profile row owns the `wallplace-support` slug the reply 404s with "We couldn't find that recipient on Wallplace" | FLAG: verify a profile exists for the support slug in production; if not, users can read support messages but every reply fails with misleading copy. Hide the reply box or route support replies to /contact | |
| The `requester_user_id` versus `proposed_by_user_id` field mismatch is systemic: the list API resolves the requester into `proposed_by_user_id` while `PlacementContextPanel`, both portal placement lists, `PlacementDirectionTag.directionFor`, and `PlacementActionItems` all read `requester_user_id`, which production rows do not have | FLAG: one-line API fix (emit both names, or rename the resolved field) would restore Accept/Counter/Decline buttons, Sent/Received tags, and correct declined-state copy across every consumer of GET /api/placements | |

---

# G. Admin portal (Admin)

Scope: every page under `/admin`, the `AdminGate` and `AdminPortalLayout` components, `src/lib/admin-auth.ts` and `src/lib/admin-audit.ts`, and the backing APIs under `/api/admin/*`, plus `/api/refunds`, `/api/refunds/process`, `/api/moderation` and `/api/health/email`. Column 3 is deliberately empty; production verification happens later.

## Admin access control (AdminGate, AdminPortalLayout, admin-auth, /api/admin/whoami)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| `admin/layout.tsx` wraps the whole `/admin` route group in `AdminGate`, so every current and future admin page is covered without opting in | Yes, closes the old hole where the only gate was a client-side metadata check | |
| `AdminGate` renders nothing (animated loading bar plus "Loading admin portal...") until `/api/admin/whoami` answers, so no admin shell flashes before a redirect | Yes | |
| `AdminGate` denied state (401/403 from whoami, or any network failure) triggers `router.replace("/login")`, fail closed | Yes, though a signed-in non-admin is silently bounced to a login form they can already complete, with no "you do not have access" message | |
| `AdminGate` 503 state renders a dedicated full-screen "Admin access is not configured" message naming a deployment fault, instead of a login redirect loop | Yes, deliberate and well reasoned | |
| Server admin predicate (`userIsAdmin`): email in `ADMIN_EMAILS`/`ADMIN_EMAIL` env allowlist OR a row in `admin_users`; `user_metadata` is not consulted (cut over 2026-08-28, ADR 0008) | Yes, though the function's leading docblock still describes the pre-cutover metadata conjunction and contradicts the code it sits on | |
| `adminUsersHasRow` logs lookup failures instead of swallowing them, so a broken table-based branch says so rather than silently denying | Yes | |
| `getAdminUser` returns 401 "Authentication required" (no token) vs "Invalid or expired token" (bad token), 403 "Admin access required" (valid non-admin), 503 when the allowlist env is empty | Yes | |
| 503 fail-closed ordering: an empty `ADMIN_EMAILS` blocks all admin access, including `admin_users` table admins, until the env is set | Yes, deliberate (misconfiguration is treated as an outage, not an authorisation state), but note a table-only admin cannot self-serve past it | |
| `/api/admin/whoami` returns only `{ok, email}` for the caller, disclosing nothing beyond what any admin route's status code implies | Yes | |
| `tests/integration/admin-route-guard.test.ts` sweeps every `route.ts` under `api/admin` and requires a `getAdminUser`/`isAdminRequest`/`withAdmin` call per exported handler | Yes, guards the "new route forgot the check" failure mode | |
| `AdminPortalLayout` second-line check: redirects to `/login` unless `user_metadata.user_type === "admin"` | FLAG: contradicts the server predicate it sits behind. ADR 0008 removed metadata from the admin definition, so an admin authorised via an `admin_users` row (or the email allowlist) whose metadata says `artist`/`venue` passes `AdminGate` but is then bounced to `/login` by this layout. The two gates disagree; the client check should be dropped or aligned with whoami | |
| Sidebar navigation: Dashboard, Applications, Artists, Venues, Curation, Feature requests, Feedback, Blogs, Disputes, Financials, with active-item highlight | Yes | |
| No Refunds item in the sidebar even though an admin refund-approval API exists (`/api/refunds/process`) | FLAG: the admin money path for buyer/artist refund requests has no page anywhere in the portal (see the refund requests section below) | |
| Secondary nav: "Browse Site" link to `/`, and a Logout button calling `signOut()` | Yes | |
| Admin identity block in the sidebar footer: static "A" avatar, "Admin" label, the signed-in email | Yes | |
| Mobile: hamburger button opens the sidebar as an overlay drawer; tapping the backdrop or any nav link closes it | Yes | |
| `robots: noindex, nofollow` metadata on the whole admin section, with per-page titles via each subroute's `layout.tsx` ("Applications | Admin | Wallplace" etc.) | Yes | |

## Admin dashboard (/admin)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| On load, fetches `/api/admin/stats` and `/api/admin/applications?status=pending` in parallel; "Loading stats..." while pending | Yes | |
| Failure state: "Failed to load stats. Make sure the database is set up." | Yes, though the copy is developer-facing; acceptable for an internal tool | |
| Stat cards: Pending Applications (accent-coloured), Total Applications, Registered Artists (DB), Listed (marketplace), Registered Venues | Yes; note five cards sit in a `grid-cols-2 lg:grid-cols-4` grid so the fifth wraps alone on desktop, cosmetic only | |
| "Listed (marketplace)" reconciles the DB count with the public number: approved DB artists plus the static seed roster via `getAllArtists()`, falling back to 0 on error | Yes, exists precisely so the two artist numbers stop looking contradictory | |
| Placements tile: all-time total plus pending/active/completed/cancelled breakdown; the API folds `scheduled`/`installed` into active, `ended` into completed, `declined` into cancelled, case-insensitively | Yes | |
| QR Scans tile: all-time, last 7 days, last 30 days, counted from `analytics_events` rows with `event_type = "qr_scan"` (head-count queries, no row data) | Yes | |
| Gross Sales tile: all-time GMV, order count, last-30-day GMV, formatted GBP with sub-£100 precision | Yes; the wire field is named `grossCents` but carries pence from `grossMerchandiseValuePence`, naming only | |
| GMV definition comes from `lib/finance/revenue` (single owner), so the dashboard and the financials page can no longer disagree on what "revenue" excludes | Yes | |
| Quick actions: "Review Applications" (with a pending-count badge when non-zero), "View Artists", "View Venues" | Yes | |
| Recent Pending Applications table: top five, name/email, medium, date | Yes; the section is simply absent when there are none rather than showing an empty state, fine | |
| `/api/admin/stats` claims "each section degrades independently" | FLAG: mostly true (counts fall back to 0), but `grossMerchandiseValuePence` throws on an orders query failure and the whole route is one try/catch, so a broken `orders` table 500s the entire stats response, contradicting the comment | |

## Applications (/admin/applications)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Tabs Pending / Accepted / Rejected / All drive the `status` query param and refetch on switch; Pending is the default | Yes | |
| Empty state: "No pending applications." (tab-aware wording) | Yes | |
| Summary row per application: name, colour-coded status badge (yellow pending, green accepted, red rejected), email, medium, location, submitted date, expand chevron | Yes | |
| Expanded details, left column: portfolio link (auto-prefixed with `https://` when bare, opens new tab), Instagram link (leading `@` stripped), website link, artist statement (whitespace preserved), trader status with business name and VAT number when business | Yes; trader status matters for which UK consumer rules apply to the membership, and it is surfaced | |
| Expanded details, right column: offerings chips (Originals/Prints/Framed/Commissions), arrangement chips, delivery radius, venue types, themes, discipline plus sub-style chips, selected plan (defaults "core"), referral code (monospace), how they heard | Yes | |
| Arrangement chips label `open_to_free_loan` as "Paid loan" via `ARRANGEMENT_LABEL.paid_loan` | Yes, correct under the K3 canonicalisation where `free_loan` is the legacy alias for the paid loan arrangement | |
| Selected plan is display-only; accepting does not provision a subscription (the artist subscribes later in their portal) | Yes, informational by design | |
| Accept button opens a confirm modal: "Accept this artist? An invite email will be sent." | FLAG: the modal copy asserts an invite email unconditionally, but the API only sends a Supabase invite for applicants with no existing auth account; existing-account applicants get the branded approval email and no invite. The success toast then corrects the story. Copy should say "they will be emailed" | |
| Accept flow (PUT `/api/admin/applications/[id]`, action accept): finds an existing auth user via the paginated, case-insensitive `findUserByEmail` helper, otherwise `inviteUserByEmail` (Supabase invite email carrying artist metadata) | Yes; the helper exists precisely because the inline version broke at user 51 and on case mismatches, both of which minted duplicate accounts | |
| Accept overwrites the target user's `user_metadata` wholesale (`user_type: "artist"`, display name, slug) for existing accounts | FLAG: a wholesale rewrite destroys any other metadata the account carried. An applicant who already holds a venue account (or any other role) has that identity clobbered to artist. Admin access no longer depends on metadata so the historic self-lockout is gone, but the collateral overwrite remains | |
| Accept generates a unique 6-character referral code with five collision retries, and copies `referred_by_code` from the application | Yes | |
| Accept inserts an `artist_profiles` row with `review_status: "approved"` and `approved_at` set (explicitly, because migration 036 flipped the column default to pending), then a belt-and-braces UPDATE re-approves by `user_id` | Yes for the normal path (the apply flow pre-creates a bridge profile, so the insert's unique violation is expected and the update wins). Residual edge: on the invite branch (no prior account, so no bridge row) a slug collision with a different artist of the same name fails the insert, the update matches no row, and the application is still marked accepted with a success toast and no profile. Log-only failure | |
| Accept flips the application to accepted with `reviewed_at`/`reviewed_by`, through a helper that surfaces update errors as a 500 instead of leaving the list stuck on pending | Yes; the legacy strip-and-retry that silently discarded reviewer columns was deliberately deleted | |
| Approved email: "You're in, welcome to Wallplace" (badge, portal CTA to `/artist-portal`), idempotency key `application_approved:{id}`, category placements | Yes | |
| API accepts an optional `welcomeMessage` (personal line in the approved email) and `feedback` (personal paragraph in the rejection email) | FLAG: dead from this UI. The confirm modals have no text inputs, so neither field can ever be supplied from the admin portal; every rejection goes out with only the generic copy despite the template being built for bespoke feedback | |
| Accept success toast shows the API message: "Invite email sent to X" or "X already had an account, profile created, they can log in now" | Yes | |
| Reject button opens a destructive confirm ("Reject this application?"), then PUT action reject | Yes | |
| Reject flips status to rejected and mirrors `review_status: "rejected"` onto the applicant's bridge `artist_profiles` row so their portal lands on the not-approved screen instead of the under-review banner; best-effort with logged failures | Yes | |
| Rejection email: subject "A note on your Wallplace application", graceful decline, reapply window fixed at 6 months, support link; idempotency `application_rejected:{id}` | Yes; tone and idempotency are right, the fixed 6-month figure is hardcoded in the route | |
| Appeal linkage for rejected applicants | FLAG: there is none. The rejection email's only link is `/support`; the public appeal page (`/account/appeal`) covers suspensions, content removal and "account decisions" via `appeals@wallplace.co.uk` and asks for a case reference no application email contains. A rejected applicant has no stated appeal route beyond reapplying in 6 months, which may be intended, but nothing connects the two surfaces | |
| Deciding an already-decided application returns 409 "Application is already accepted/rejected." | Yes | |
| Both action buttons disable during processing with "Processing..." on Accept | Yes | |
| Action failures surface via the toast context showing the ApiError code (the API's `error` string) or "Network error" | Yes | |
| "Reviewed {date}" line shown on decided applications | Yes | |
| Audit: the route runs under `withAdmin("application_decision")` and refines to `application_accepted` / `application_rejected` with applicant email, decision, invited flag and user id; the wrapper guarantees a row for any 2xx even if the handler forgot to call `audit()` | Yes, this was the worst pre-remediation audit gap and is now closed | |
| List API (GET `/api/admin/applications`) returns all columns, newest first, optional status filter | Yes; unknown status values just return an empty list | |

## Artists (/admin/artists)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Read-only table of `artist_profiles`: name, medium (sm+), location (md+), joined date (lg+), newest first | Yes | |
| "View" link per row to the public profile at `/browse/{slug}` | Yes, the route exists | |
| Empty state "No registered artists yet." and a count footer ("N artists registered") | Yes | |
| Artist management actions (suspend, unpublish, edit, plan/subscription view, contact) | FLAG: none exist. The page is a bare list: no review-status visibility (pending and rejected profiles appear identically to approved ones since the API selects no `review_status`), no way to act on an artist, and the legal email templates for warnings and account restriction (`OperationalPolicyViolationWarning`, `OperationalAccountRestricted`) are sent by nothing in the codebase, so the moderation regime those emails describe has no admin tooling behind it | |
| API (GET `/api/admin/artists`) selects only id/user_id/slug/name/medium/location/created_at | Yes for the current list, but see the flag above: it hides review status, so the count includes unapproved profiles while being labelled "Registered Artists" | |

## Venues (/admin/venues)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Client-side search box filtering on name, contact name, email, location, city and postcode as you type | Yes | |
| Empty states: "No venues match \"query\"." vs "No registered venues yet.", and a footer count that switches between "matched" and "registered" | Yes | |
| Expandable card per venue: name, placement-count badge when > 0, type/city/contact summary line, joined date, chevron | Yes | |
| Expanded Contact section: name, email as `mailto:` link, phone | Yes | |
| Expanded Address section: line 1, optional line 2, city (falls back to location), postcode | Yes | |
| Expanded Preferences: arrangements (canonical labels, `interested_in_free_loan` shown as "Paid loan"), footfall, audience, signup wall space, preferred styles and themes | Yes, consistent with the K3 arrangement canonicalisation | |
| Expanded Display Needs: wall space, lighting, install notes, rotation frequency | Yes | |
| Expanded Description block, whitespace preserved | Yes | |
| Activity section: placement count, joined timestamp, "View public profile" link to `/spaces#venue-{slug}` (the anchor exists on the spaces page with a target highlight ring) | Yes, with the caveat that the anchor only lands if that venue is actually rendered on `/spaces`; a venue filtered off the public page gets a plain scroll-less landing | |
| API (GET `/api/admin/venues`) pulls the full CRM column set with a lean-select fallback for older schemas, then augments each venue with a placement count grouped by `venue_slug` | Yes | |
| Venue management actions (approve, suspend, edit, remove) | FLAG: none exist; like artists, this is a read-only CRM with no intervention surface | |

## Curation (/admin/curation)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Header with explainer ("Venues who have booked or requested a quote for curation.") and a Refresh button that refetches the list | Yes | |
| List row: venue name, status badge (colour-mapped, including reconciler-owned `past_due` amber and `paused` red), tier chip (Single wall / Full space / Bespoke, raw key fallback), contact line, amount paid, created date | Yes; note the tier labels map covers only the three one-off tiers, so managed tiers (`managed_monthly`, `managed_quarterly`) render as raw keys in the chip rather than their labels | |
| Expanded detail fields: venue type, wall count, budget, timeframe, phone as a `tel:` link with spaces stripped, paid-at timestamp | Yes | |
| Expanded notes blocks: Style, Audience, Mood, References, each only when present | Yes | |
| Status dropdown with eight admin-settable values (pending_payment through refunded); `past_due` and `paused` are deliberately excluded because the subscription reconcilers own them | Yes in intent, but FLAG: on a row currently in `past_due` or `paused` the select's value matches no option, so the control displays the first option ("Pending payment") while the badge says otherwise, and any change silently overwrites the reconciler-owned state. The excluded statuses should render as a disabled option or the control should show the true value | |
| Status change PATCHes `/api/admin/curation` immediately on select; optimistic local update; save errors surface in the page-level error line (previously silent) | Yes | |
| Status PATCH is bookkeeping only, moves no money, and is validated by a zod enum; audited as `curation_request_updated` with the status and an `adminNotesChanged` boolean, deliberately not the note text | Yes | |
| Admin notes textarea with a dirty-tracked Save button per row | Yes | |
| Refund control renders only when the row holds a Stripe payment intent or subscription id and status is not already refunded | Yes | |
| Caption beside the refund button: "Setting the status above moves no money. This does." | Yes, accurate and exactly the distinction an admin needs at the point of click | |
| Refund confirm uses native `window.confirm` stating "refund £X to VENUE" (one-off) or "cancel the subscription and refund the last paid invoice for VENUE" (managed) | Yes functionally; minor inconsistency that the rest of the portal uses the styled ConfirmContext dialog | |
| One-off refund path (POST `/api/admin/curation/refund`): full payment-intent refund with idempotency key `curation_refund:{rowId}`, status written to refunded only after Stripe succeeds | Yes | |
| Guards: 409 already refunded, 409 nothing on record, and the D18 boundary check refusing a `stripe_payment_intent_id` that does not start with `pi_` | Yes | |
| Managed refund path: cancel the subscription first (tolerating already-cancelled), then list the latest paid invoice and refund `invoice.payment_intent` | FLAG: the codebase pins Stripe API version 2026-03-25.dahlia, and `payment_intent` was removed from the Invoice object in 2025-03-31.basil (the installed SDK's Invoice type has no such field, which is why the route needs a manual type cast, and the route tests mock the legacy shape so they cannot catch it). At runtime `invoicePi` is therefore expected to be null: the subscription is cancelled but no refund is created, the row is marked cancelled rather than refunded, and no refund email goes out, while the button promised "Cancel and refund via Stripe". The lookup should expand or read the invoice's `payments` instead | |
| Managed row with genuinely no paid invoice: cancels billing, refunds nothing, marks the row cancelled, and the API response says which happened (`refunded: false`) | Yes at the API, but FLAG: the page ignores the response and just reloads the list, so an admin sees the row flip to "Cancelled" with no explanation of whether money moved; the distinction the API deliberately reports is dropped on the floor | |
| Partial failure (subscription cancelled, refund then fails): 502 with instruction to refund the last invoice manually in Stripe and set the status by hand | Yes, honest about the half-done state | |
| A failed row update after a successful Stripe refund is logged loudly but not returned as a 500, to avoid inviting a retry of a refund that already happened | Yes | |
| Refund receipt email `CurationRefundIssued` (amount, tier label, venue, subscription-cancelled line, 5 to 10 day arrival copy) with idempotency `curation_refund_issued:{rowId}`; only sent when a refund actually occurred; send failure never rolls back | Yes | |
| Refund audited as `curation_refund` with mode (subscription vs payment_intent), refund id, pence, and whether the subscription was cancelled | Yes | |
| List API (GET `/api/admin/curation`) returns up to 500 rows newest first | Yes | |

## Blogs (/admin/blogs)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Tabs Pending / Approved / Rejected / Edited filter the queue via `/api/admin/moderation?entity_type=blog&status=...` | Yes | |
| Row: payload title, 200-character excerpt, submitted date, submitter email as `mailto:` link; "(no title)" / "(no excerpt)" fallbacks when the payload fails validation | Yes | |
| No way to read the full blog before deciding | FLAG: the admin sees only the 200-character excerpt captured at submission time. There is no link to the draft, no preview, and the excerpt does not update if the author edits. Approving publishes content the admin has never been able to read from this screen | |
| Approve button: PATCH `/api/admin/blogs/[id]` sets the blog to `published` with `published_at`, stamps the queue row approved with decider and time, audits `blog.approve`, shows "Approved." and reloads | Yes | |
| Reject button: `prompt("Reason (visible to the author):")`, cancels silently on empty; server requires 2 to 2000 characters; sets the blog `rejected`, stores the reason on the queue row, audits `blog.reject` with the reason | FLAG: the prompt copy overpromises. The reason lands only in `moderation_queue.reason`; the author-facing blogs list shows a bare "Rejected" badge with no reason surfaced, and nothing else reads that column back to the author | |
| Author notification on approve or reject | FLAG: none. No email and no in-app notification is sent for either decision (contrast the applications gate, which emails both outcomes), so authors only discover the decision by revisiting their blogs list | |
| Edit action in the API (title, body_markdown, cover_image_url; marks the queue row `edited`, audits `blog.edit` with the changed field names) | FLAG: unreachable. No admin UI invokes it (the page has only Approve and Reject), so the Edited tab can only ever be populated by hand-crafted API calls. Also, an edit writes `body_json` as `{type:"doc", body: markdown}`, which is not a real document structure; inert today because public rendering reads `body_markdown`, but a trap for any future `body_json` consumer | |
| Action failures show the ApiError code or "Network error. Please try again." in the message strip | Yes | |
| Validation failure on a 1-character reason returns 400 "Validation failed", surfaced via the same strip | Yes | |

## Disputes (/admin/disputes)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Tabs Open / Resolved / Closed drive `/api/admin/disputes?status=...` (whitelist-validated server side, 200-row cap, newest first) | Yes | |
| Header explainer "Resolving writes to the audit log." | Yes, accurate | |
| Row: category as the heading ("Untitled dispute" fallback), filed date, order id and placement id when present, truncated dispute id, full description, and the stored resolution when present | Yes | |
| Conversation access: when the dispute has a conversation, the page renders the literal text `GET /api/messages?dispute_id={id}` in a code tag | FLAG: it is a raw API incantation, not a link or a viewer. The server side is real (admin-only, returns the thread, audit row mandatory) but an admin cannot click anything; they must hand-craft an authenticated request to read the evidence a dispute turns on | |
| Resolve action: `prompt("Resolution note (visible internally):")`, then PATCH resolve with the text | FLAG: the copy is wrong in the dangerous direction. For an order-linked dispute the resolution text is emailed verbatim to both the buyer and the artist as the outcome in `OrderDisputeResolved`. An admin writing candid internal shorthand ("buyer at fault, refund to shut it down") would send it to both parties. The prompt must say the note is customer-visible | |
| Resolve effects: status resolved, resolution stored, `resolved_at` and `resolved_by_user_id` stamped | Yes | |
| Resolution notification: for disputes with an `order_id`, both order parties (buyer first, artist second, resolved via the shared `orderParties` helper, parties without an email dropped rather than faked) get `OrderDisputeResolved` with the outcome text, dispute URL and support URL, idempotency `dispute_resolved:{id}:{role}` | Yes for order disputes | |
| Resolving a dispute with no `order_id` (placement-linked or conversation-only) notifies nobody; the opener is never told | FLAG: the "tell both parties" fix (09 §D.2) only covers order disputes. A venue or artist who opened a placement dispute gets no email and no in-app notification when it is decided; they are back to refreshing a page, which is the exact failure the fix was written against | |
| Escalate action: optional note prompt; sets `category = "escalated"` and keeps the dispute open; note stored only in the audit context | FLAG: escalation overwrites the original category (a "damage" dispute becomes category "escalated", which is also what the row heading displays), destroying the classification, and the note is invisible anywhere in the UI afterwards. A separate flag column would preserve both | |
| Close action: status closed, `resolved_at`/`resolved_by_user_id` stamped, no notification (deliberate: close produces no outcome text to send) | Yes, reasonable, though the parties are also not told the case was closed | |
| No state guard on actions: resolve/close/escalate can be re-run against already-resolved or closed disputes | Yes, tolerable; the emails are idempotent per dispute and role so a re-resolve cannot double-send, and only Open-tab rows show action buttons in the UI | |
| Audit: `dispute.resolve` (with resolution text), `dispute.close`, `dispute.escalate` (with note when given) via `recordAdminAction` | Yes | |
| Feedback strip "Dispute resolved." / "Dispute escalated." / "Dispute closed.", errors show the ApiError code | Yes | |
| List API also accepts `category` and `older_than_days` filters | Yes, unused by this UI but harmless API surface | |

## Financials (/admin/financials)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Header notes "Read-only snapshot. v2 will add refund + cancel actions." | Yes, honest about scope | |
| Every load writes a `financials.read` audit row, because the page exposes MRR and top spenders | Yes | |
| Active subscriptions tile: total plus per-plan breakdown (core/premium/pro), counting `artist_profiles` in `active`/`trialing` | Yes; note a `subscription_plan` value outside the three known keys is silently dropped from both the breakdown and the total | |
| MRR tile: plan counts multiplied by env-driven plan prices (`PRICE_*_PENCE`, defaults matching the real £9.99/£24.99/£49.99 after Bug 17 inflated it threefold) | Yes | |
| "Total subs MRR" tile | FLAG: renders exactly the same `subscriptions.mrrPence` figure as the MRR tile two cards up. A duplicate number with a different label invites the question of what the difference is; there is none. One of the tiles should go, or show something else (for example managed-curation MRR, which is nowhere on this page) | |
| Failed payments tile: this month vs last month | FLAG: misleading measure. It counts `artist_profiles` rows currently in `subscription_status = "past_due"` whose `updated_at` falls in the window, not payment-failure events. Any unrelated profile update moves a row between buckets, and a recovered payment removes it from history entirely, so the tile cannot be read as "payments that failed" | |
| Revenue this month tile with "YoY" subtitle (same calendar month one year ago), both via the shared GMV definition so it agrees with the dashboard | Yes | |
| Renewals next 7 days tile: count of active `placement_recurring_billings` with `current_period_end` in the window | Yes; the API returns placement id, amount and date per renewal but the page renders only the count, so the useful detail is fetched and discarded | |
| Top 10 venues by spend: active recurring billing totals per payer, "/mo" suffixed | Yes on the arithmetic, but FLAG: rows are identified by raw user-id UUIDs in a code tag. An admin cannot tell which venue is which without a separate DB lookup; names or slugs should be resolved server side | |
| Top 10 artists by earnings: lifetime artist-leg sums from the `stripe_transfers` ledger (money actually paid) | Yes on the source, same UUID-only display flag as venues | |
| Loading, error ("Could not load financials" / "Network error") and per-list empty states ("No active billings yet." / "No earnings yet.") | Yes | |
| Money reconciliation report (orders vs transfers) | FLAG: exists only as an offline CLI (`scripts/audit/reconcile-money.ts`, `npm run audit:reconcile`); nothing in the admin portal surfaces it, so the check that would catch a drifted ledger depends on someone remembering to run a script | |

## Feature requests (/admin/feature-requests)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Header explains the source: "Submissions from the in-app feedback bubble (feature request tab)." | Yes | |
| Tabs Pending / Approved / Rejected filter `/api/admin/moderation?entity_type=feature_request` | FLAG: the Approved and Rejected tabs are permanently empty. No write path exists for feature-request queue rows anywhere (the admin moderation API is GET-only and the blogs PATCH stamps only blog rows), so nothing can ever move a row out of pending, and the inbox can never be triaged, cleared or archived. Either the tabs should go or a decision endpoint should exist | |
| Row: payload title and description, submitted date, contact email (payload's, falling back to the account email) as `mailto:`, user-agent string dimmed | Yes | |
| Fallbacks "(no title)" / "(no description)" for rows whose payload fails the parser | Yes | |
| Empty state "No pending feature requests." per tab, loading state | Yes | |

## Feedback (/admin/feedback)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Header explains the source: "Submissions from the in-app feedback bubble (feedback tab)." | Yes | |
| Tabs Pending / Approved / Rejected | FLAG: same dead tabs as feature requests; no mechanism exists to move feedback rows out of pending | |
| Row: 1 to 5 star rating rendered as filled/empty stars with a screen-reader label, message text, date, contact email as `mailto:`, source page URL | Yes | |
| Fallback "(no message)", per-tab empty states, loading state | Yes | |

## Moderation queue backend (/api/admin/moderation, /api/moderation)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| GET `/api/admin/moderation`: admin-gated queue reader filtered by `entity_type` (blog, feature_request, feedback, message) and `status` (pending, approved, rejected, edited), both whitelist-validated with descriptive 400s; 200-row cap, newest first | Yes | |
| Read boundary re-validates each row's payload via `parsePayload` so the pages can render the discriminated union without casts | Yes | |
| Every queue read is audited (`moderation.read` with entity type, status and row count) | Yes | |
| `message` entity type: flagged messages really do join the queue (the messages route inserts a `message` payload with flag reason and excerpt when the content filter fires, migration 116 widened the CHECK) but no admin page queries `entity_type=message` | FLAG: the flagged-message queue is invisible. The one moderation surface built for catching abusive or off-platform-steering messages fills up where nobody looks; the API supports it, so this is a missing page, not a missing backend | |
| Public POST `/api/moderation`: accepts `feature_request` (title 2-80, description 2-1000) and `feedback` (message 2-1000, optional rating 1-5, source URL) with optional contact email; blogs deliberately excluded (owned by the blog editor flow) | Yes | |
| Rate limit 5 submissions per IP per hour, sliding window, before any parsing | Yes | |
| Demo guard: a signed-in demo account is blocked from submitting; anonymous submissions allowed | Yes | |
| `submitted_by_email` is a display hint only, never trusted for routing; the payload is rebuilt through the parser so the JSONB column always conforms | Yes | |
| Friendly validation copy ("Submission failed validation, please review the form fields and try again.") and a 500 with retry copy on insert failure | Yes | |

## Refund requests, admin money path (/api/refunds, /api/refunds/process)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| GET `/api/refunds` admin branch: returns every refund request with joined order columns (buyer email, total, status, artist/venue slugs) and `userType: "admin"`; admin identity resolved via `isAdminRequest` and takes precedence over an artist profile | Yes as an API | |
| Admin surface for refund requests | FLAG: there is none. No admin page calls `/api/refunds` or `/api/refunds/process`, and the sidebar has no Refunds entry. Artist-raised refund requests are explicitly 403'd for artists ("Artist-initiated refunds require admin approval"), so the only way any such request can ever be approved is a hand-crafted API call with an admin token. The server work (claiming, reversal, restock, emails, audit) is complete and tested; the portal simply never exposes it | |
| POST `/api/refunds/process` authorisation: the order's artist or an admin; artists cannot action requests they raised themselves (no self-approval) | Yes | |
| Demo guard returns 200 `{demo: true}` so portal UIs can toast without unwinding optimistic state | Yes | |
| Atomic claim: status flipped pending to processing in one conditional update; concurrent callers get 409 "Refund request has already been processed" without touching Stripe; every failure path releases the claim, including a catch-all for unexpected throws | Yes, this is the right shape for a money endpoint | |
| Reject: status rejected with `processed_by`/`processed_at`/`rejection_reason`; requester (falling back to the order's buyer email) gets `CustomerRefundRejected` with the reason and orders/support links, idempotency `customer_refund_rejected:{requestId}` | Yes | |
| Admin rejections audited as `refund_rejected_by_admin` (order, request, requester type); artist rejections of buyer requests are deliberately not admin-audited | Yes | |
| Approve guards: 422 when the order has no payment intent, 400 when the refund amount exceeds the order total (re-asserted at process time, not just at request time) | Yes | |
| Transfer handling before the buyer refund: pending transfers cancelled in the DB; paid transfers reversed via Stripe with a partial reversal pro-rated against the SUBTOTAL (shipping is the artist's revenue, so the shipping slice of a partial refund reverses against the artist leg only), capped at the transfer amount, per-transfer idempotency keys | Yes, the D16 shipping reasoning is sound and encoded | |
| Any failed reversal aborts the whole approval with 502 and the failed transfer ids, before the buyer is refunded, so the platform cannot eat the difference | Yes | |
| Stripe refund created full (amount omitted) or partial (explicit amount), idempotency `refund:{requestId}:refund` | Yes | |
| Order status set to refunded / partially_refunded with a raw JSONB `status_history` append referencing the refund request | Yes | |
| Full refunds restock each work via the `restock_work` RPC, handling both production item shapes (per-line `workId`, and offer orders' `work_ids` array); best-effort, logged failures, never blocks a completed refund | Yes | |
| Full refunds record an `order.refunded` lifecycle event for the stepper and future consumers; partial refunds deliberately do not (no event type exists) | Yes | |
| Buyer notification: `CustomerRefundConfirmation` email (amount, reason, expected arrival about 5 days out, support link) plus an in-app bell for account holders (`requester_user_id` falling back to `buyer_user_id`), keyed idempotently | Yes; the duplicate legacy send that used to double-email buyers was removed | |
| Artist notification: `ArtistRefundNotification` email (work title, amount, reason) plus an in-app bell noting any transferred payout will be reversed | Yes | |
| Admin approvals audited as `refund_approved_by_admin` with order, request, amount, Stripe refund id, resulting order status and requester type; the route deliberately does not run under `withAdmin` because artists legitimately call it | Yes | |

## Admin audit logging (recordAdminAction, withAdmin)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| `recordAdminAction` inserts `admin_audit_log` rows (admin user id, action, JSONB context) and never throws; failures are logged to stderr | Yes as a policy (admin actions should not fail because the audit insert did), with the corollary that audit loss is silent | |
| `withAdmin` wrapper: resolves the admin, runs the handler with an `audit(context, actionOverride)` callback, and writes a row when the handler audited OR returned 2xx (so a successful mutation can never be invisible); non-2xx without audit writes nothing | Yes, closes the "forgot to call recordAdminAction" gap for the routes that adopted it | |
| Adoption: applications decisions, curation updates and refunds run under `withAdmin`; blogs, disputes, moderation reads, financials reads, dispute-scoped message reads and refund approve/reject call `recordAdminAction` directly | Yes; coverage now spans every admin mutation in scope. Reads are audited selectively (financials, moderation queue, dispute conversations) while the venues CRM read, which returns full venue contact PII, is not; a defensible line but worth knowing it is drawn | |
| Context hygiene: audit contexts hold the decision, target id and target email, never full rows, so the JSONB column does not accumulate portfolios, statements or contact books | Yes | |
| Dispute-scoped message read (`GET /api/messages?dispute_id=`) claims "a failure blocks the response so the caller cannot silently bypass the audit trail" and returns 500 "Audit log failed" on error | FLAG: dead guarantee. `recordAdminAction` catches internally and never throws, so the try/catch around it can never fire and an audit insert failure does not block the read; the comment and the 500 branch describe behaviour the helper's contract makes impossible. Use a throwing variant there if the blocking behaviour is really wanted | |
| Viewing the audit log | FLAG: no admin surface reads `admin_audit_log`; the trail is write-only from the portal's point of view and can only be inspected in the database | |

## Operational health (/api/health/email)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Unauthenticated GET returning booleans and counts only: presence (non-blank) of the six watched env vars, DB reachability, and 24-hour counts of sent / failed / skipped_no_api_key / render_failed email events | Yes, deliberately monitor-friendly and value-free | |
| Returns 503 when any env var is missing or blank, the DB is unreachable (no false all-clear), or any send was dropped for a missing key in the last 24 hours; 200 otherwise | Yes | |
| Not linked from the admin portal | Yes, it is built for an uptime monitor, not for humans; acceptable, though a status line on the dashboard would cost little | |

---

# H. Roles, demo mode, notifications and system behaviour (cross-cutting)

Sources read: src/lib/auth-roles.ts, src/lib/auth/find-user-by-email.ts, src/context/AuthContext.tsx, src/app/api/account/roles, src/app/api/auth/{welcome,oauth-finalize,oauth-sign-state,precheck}, src/components/{Header,PortalGuard,CustomerPortalLayout,ArtistPortalLayout,VenuePortalLayout,AdminPortalLayout,AdminGate,DemoBanner,DemoProfileBanner,MessageArtistButton,MessageInbox}.tsx, src/app/api/demo/login, src/lib/demo-guard.ts, eslint-rules/public-routes.js, src/app/api/terms/accept, src/emails/registry.ts and OUTSTANDING.md, src/lib/email/{send,categories,streams,welcome,notifications,dispatcher,dispatcher-ids,unverified-recipient,admin-alert}.ts, src/lib/notifications.ts and every createNotification call site, all nine vercel.json cron routes, src/app/api/walls/* and src/lib/visualizer/{quota,tier-limits,tier-resolver}.ts, both portal dashboard checklists, signup and apply pages.

## Role model and role transitions (all six perspectives, especially User who is also an Artist)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Role storage: one role per auth user in `user_metadata.user_type`; `parseRole()` in src/lib/auth-roles.ts is the single validator (artist, venue, customer, admin), so a corrupt value degrades to null rather than propagating | Yes | |
| `SIGNUP_ROLES` (artist, venue, customer) is separate from `ALLOWED_ROLES` and excludes admin; `oauth-sign-state` validates the requested role with `isSignupRole` and `oauth-finalize` re-checks the role carried in the verified state token, so an unauthenticated caller can no longer mint an admin state token (E35d fix, defence in depth) | Yes | |
| Admin is granted server-side only: `getAdminUser` requires the metadata role AND membership of the ADMIN_EMAILS env list or the admin_users table; `AdminGate` asks `/api/admin/whoami` before rendering any admin shell, and each `/api/admin/*` route re-checks | Yes | |
| Multi-role model: the same email can hold several auth accounts (GoTrue allows this across providers); GET /api/account/roles returns the distinct `user_type` values across every account sharing the caller's email, powering the "Switch portal" menu; only role labels are exposed, never the other accounts' ids | Yes, workable MVP model, but note each call pages the ENTIRE auth user list (200 per page, up to 50 pages) and the Header calls it on every login for every user, so cost grows linearly with total users; the code itself says past 10,000 users this needs a SQL lookup | |
| /api/account/roles failure mode: any admin-lookup error returns `{roles: []}` rather than a 500, so the header dropdown degrades to no switch menu | Yes | |
| Email/password signup pages create the account with `signUp({ data: { user_type, display_name } })`; the signature only accepts `SignupRole` so no client path can request admin | Yes | |
| OAuth signup (Google/Apple from the signup pages): /auth/callback POSTs the signed state to /api/auth/oauth-finalize, which stamps `user_type` only when the user has no role yet ("never demote"), picks a display name from the provider metadata, and returns the safe `next` redirect | Yes | |
| OAuth new-artist bootstrap: oauth-finalize creates an `artist_profiles` stub (unique slug, `review_status = "pending"`) so an artist who bounces before /apply still exists to the rest of the app; insert failure is logged and left to /apply to repair | Yes | |
| OAuth venue: `user_type` is stamped but no venue profile stub is created; the profile is created lazily by `ensureVenueProfile` on the first authenticated /api/venue-profile call, adopting an email-matching orphan row or hydrating from the venue_registrations row | Yes, deliberate (E34 closed the anonymous slug-squatting seed) | |
| OAuth buttons on the LOGIN page mint state with `role: "customer"`. A returning artist or venue who signs in with Google keeps their role (never-demote), but a brand-new visitor who "logs in" with Google gets a customer account created silently from the login page | FLAG: account creation from the login page records no terms acceptance (see Terms section) and defaults the person to customer with no role choice; a new artist who starts at Login with Google lands as a customer and has to be re-roled later. At minimum the login OAuth path should route through the same role-choice/terms surface as signup | |
| Customer becomes artist, step 1: /apply submits an application (public route, rate limited, schema validated) and creates a bridge `artist_profiles` row (pending) when an account already exists, so the portal can show the under-review banner | Yes | |
| Customer becomes artist, step 2 (existing account): admin Accept finds the auth user by email (case-insensitive, paginated via findUserByEmail) and calls `updateUserById` with `user_metadata: { user_type: "artist", display_name, artist_slug }` | FLAG twice. (1) The metadata object is REPLACED without spreading the existing keys (contrast oauth-finalize, which spreads `...meta`), so provider-supplied keys such as avatar or full_name are discarded on approval. (2) It force-flips a customer account to artist in place, the opposite of oauth-finalize's never-demote rule: the person loses /customer-portal (PortalGuard bounces them), their saved items and notifications carry over only because the user id is unchanged, and nothing tells them their "customer account" is now an artist account | |
| Customer becomes artist, step 3 (no account): admin Accept calls `inviteUserByEmail` with user_type artist; the invited user gets Supabase's invite email plus the branded approved email; a referral code is generated with collision retry; the profile row is inserted with `review_status: "approved"` and a belt-and-braces update re-approves any pre-existing bridge row | Yes | |
| Rejection path mirrors `review_status = "rejected"` onto the bridge profile so the applicant's portal shows the "Application not approved" screen instead of the under-review banner, and sends the rejection email with optional feedback | Yes | |
| /apply/claim: after submitting an application the applicant is nudged to create the account immediately (auth user with user_type artist, signed in, minimal profile row), so they are invested while under review | Yes | |
| Venue role acquisition has two doors: /signup/venue (auth account, user_type venue, then profile on first login) and the public /register-venue form (pending venue_registrations row only, admin reviews; duplicate submissions are answered identically to fresh ones so the form is not an account-existence oracle) | Yes | |
| `portalPathForRole`: admin to /admin, venue to /venue-portal, customer to /customer-portal, artist to /artist-portal, null to /browse; login honours ?next= via safeRedirect and otherwise lands each role on its portal | Yes | |
| A "User who is also an Artist" therefore exists in one of two shapes: (a) one converted account (approval flow) that is artist-only, or (b) two separate accounts on one email (e.g. customer password account plus artist OAuth account), joined only by the switch-portal menu | Yes as an MVP compromise, but the two shapes behave very differently (shape (a) loses the customer portal entirely; shape (b) splits saves, notifications and messages across accounts) and nothing documents which one a given person has | |

## Portal switching and cross-role navigation (all, especially User who is also an Artist)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| PortalGuard wraps each portal layout: not logged in replaces to /login; logged in with the wrong role shows a toast ("This is the artist portal. Redirecting to your venue portal.") and replaces to the correct portal | Yes | |
| PortalGuard blocks every portal until `email_confirmed_at` is set, showing a "Verify your email" screen with the address | Yes | |
| Artist-only PortalGuard extras: past_due or canceled subscription hard-gates the portal to a "Choose Your Plan" screen (billing and settings stay reachable); pending review shows an amber banner but keeps the portal usable; rejected shows a dead-end screen with the applications email; approved-but-unpaid shows a nudge banner | Yes | |
| Dual-role switch: the portal dropdown's "Other accounts" section lists "Switch to X portal" per extra role; clicking signs the user out and pushes `/login?email=...&hint=<role>`; the login page pre-fills the email from ?email= | FLAG: switching is a full sign-out plus manual password re-entry every time, and the `hint` parameter is read by nothing on the login page (dead param, no "sign in to your artist account" message). Worse, if the second account was created via OAuth it has no password, so the "switch" instruction (an email/password form) cannot complete for it; the user must know to press the Google button instead | |
| Header portal link label: venue sees "Venue Portal", customer "My Account", everyone else "Artist Portal"; `portalBase` defaults to /artist-portal for any non-venue, non-customer role | FLAG (minor): an admin sees "Artist Portal" in the header, and clicking it routes to /artist-portal, which bounces them to /admin with an apologetic toast; admins should get an "Admin" label and link | |
| Top nav sets: logged out (Marketplace, How It Works, Blog, Spaces), logged-in artist/customer (Marketplace, Spaces), venue (Marketplace, Wallplace Curated, Blog); the More dropdown fills in the rest and filters out links already in the primary nav | Yes | |
| Inside /browse and /spaces the nav swaps to marketplace tabs (Galleries, Portfolios, Collections, plus Spaces or Curated/Blog per variant); logged-out desktop gets a public variant with How It Works and Blog inline | Yes | |
| Mobile marketplace tabs use `venueMarketplaceTabs` or the default set, never the public variant, so a logged-out mobile visitor in /browse loses the inline How It Works and Blog links the desktop variant gives them | FLAG (minor inconsistency): pass the same three-way variant to the mobile branch | |
| Portal dropdown claims parity with the sidebar ("now it's parity" comment) but the artist dropdown is missing My Offers, Artwork Requests, Social Posts and the flag-gated Blogs, and the venue dropdown is missing My Offers and Artwork Requests | FLAG: the parity comment is stale; offers and artwork requests are money-bearing surfaces a user may only know via this menu | |
| Saved heart icon links to `${portalBase}/saved`; saved_items rows are keyed on the auth user id and item, shared across every surface of ONE account | Yes for a single account, but note for the dual-account shape: saves made as the customer account are invisible after switching to the artist account (different user id). Expected given the model, worth a line in support docs | |
| Notifications are keyed on user id, so the dual-account person has two independent bells; orders, by contrast, are matched by `buyer_email` as well as user id in /api/orders, so purchases made under either account DO surface in both portals | Yes, the orders behaviour is a good save; the asymmetry (orders shared, saves and bells not) will confuse dual-account users | |
| Header messages dropdown loads conversations only after resolving the user's slug from /api/artist-profile then /api/venue-profile; customers have neither profile, so `resolvedSlug` stays empty and the dropdown never loads conversations for customers | FLAG: see the deeper messaging problem two rows down | |
| /api/messages/unread keys on artist/venue slug and returns `{count: 0}` for customers, so at least the badge and the empty dropdown agree for customers | Yes given the model | |
| Customer messaging is a facade end to end: CustomerPortalLayout and the portal dropdown offer a Messages page; the page derives a fake slug from the display name; GET /api/messages 403s for anyone whose slug is not an artist/venue profile slug; POST /api/messages 403s senders without an artist or venue profile ("complete your artist or venue profile first") | FLAG (major): every customer-facing messages surface (sidebar item, header dropdown, /customer-portal/messages) dead-ends at the API. Either build customer conversations or remove the customer Messages nav and dropdown until it exists | |
| MessageArtistButton scopes the CTA by viewer: venue routes to venue-portal messages, logged-in customer gets "Contact Wallplace" (to /contact?artist=slug), artist viewing another artist gets no button, logged out routes to `/signup/customer?next=/customer-portal/messages?artist=...` | FLAG: the logged-out funnel contradicts the customer gating one row up; a brand-new customer is signed up and dropped into a messages page that cannot list or send anything (the comment "so the conversation has somewhere to live" is not true of the current API). Route logged-out visitors to the same /contact flow the logged-in customer gets, or build customer messaging | |
| Admin navigation: AdminPortalLayout sidebar (Dashboard, Applications, Artists, Venues, Curation, Feature requests, Feedback, Blogs, Disputes, Financials, Browse Site) behind AdminGate | Yes | |
| VenueArtistToggle is a marketing-page pill (For Venues / For Artists) on /venues, /artists, /how-it-works, not a portal switcher | Yes | |

## Demo mode end to end (prospective artist and venue evaluating the platform)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| /demo landing page: two cards (artist tour, venue tour); when DEMO_ARTIST_EMAIL and DEMO_VENUE_EMAIL are set the buttons hit /api/demo/login, otherwise they fall back to the public demo profile pages; a misconfigured demo slug throws in dev and falls back loudly in prod | Yes | |
| GET /api/demo/login?role=artist|venue signs into the seeded demo account with env credentials (anon key, password grant), returns 503 JSON when unconfigured, sanitises ?next= through safeRedirect (E36b closed the protocol-relative open redirect), and 303-redirects into the portal with `sb-<ref>-auth-token` cookies set | FLAG (critical): the cookie handoff has no reader. The app's browser client is plain `@supabase/supabase-js` with default localStorage session storage, `@supabase/ssr` is not a dependency, and there is no middleware.ts, so the route's own claims ("the client already reads via @supabase/ssr", "middleware already configured app-wide") are false; AdminGate's comment confirms there is no server-readable session. With creds configured, the visitor is redirected into /artist-portal with no client-side session and PortalGuard bounces them to /login, which is a worse outcome than the unconfigured 503 fallback. The whole portal-tour path cannot work until the session is handed over in a form supabase-js actually reads | |
| Demo write protection: `isDemoUser` compares against DEMO_ARTIST_USER_ID / DEMO_VENUE_USER_ID envs and is dormant (always false) until they are set, so guards were safe to wire before the accounts existed | Yes | |
| Soft guard `assertNotDemo` returns 200 with `{demo: true, message: "You're touring a demo account, changes aren't saved. Sign up to make it real."}` so optimistic UI does not unwind; wired on roughly 45 mutation handlers (saved items, profile edits, walls and renders, message edit/delete/report/block, feature requests and upvotes, contracts sign, disputes, terms accept, subscriptions, mockups, artwork request edits and fulfil, artist works, refunds, order events, account and address and preference edits, collections, venue profile, notifications mark-read, moderation submissions) | FLAG: the documented client half does not exist. No component anywhere reads `data.demo` or shows the promised toast, so a demo user's edits silently pretend to succeed and quietly vanish on reload; the message string is never seen by anyone. Either add the toast handling in the shared mutate helper or accept that the soft guard is a silent no-op and say so in the banner | |
| Strict guard `assertNotDemoStrict` returns 403 ("Demo accounts can't perform this action...") on the handlers that reach real people or money: placements POST/PATCH, offers POST and offer checkout, messages POST, checkout, artwork-requests POST and responses POST, stripe-connect onboard/dashboard | Yes, the split (soft for self-contained state, strict for outward effects) is the right shape | |
| DEMO_EXEMPT_ROUTES in eslint-rules/public-routes.js: all PUBLIC_ROUTES (no user id to test) plus demo/login itself, account/delete (harmless, reseed corrects), oauth-finalize and auth/welcome (token-authenticated signup steps no demo session reaches), and five admin surfaces (support acts on demo data deliberately); a build check fails if a key stops resolving to a real file | Yes, each exemption carries a reason and the list cannot go stale silently | |
| DemoBanner: sticky banner on all (pages) routes when the signed-in user id matches NEXT_PUBLIC_DEMO_ARTIST_USER_ID / NEXT_PUBLIC_DEMO_VENUE_USER_ID; offers Sign up (with next back to the current path), Exit demo (signOut then /), and a dismiss that lasts until reload | Yes as a component, but FLAG the configuration coupling: the server guard uses DEMO_*_USER_ID and the banner uses separate NEXT_PUBLIC_ mirrors; set only the server pair and demo users get silent write-blocking with no banner explaining it. Nothing validates the two pairs agree | |
| DemoProfileBanner replaces the Message and Buy CTAs on the demo artist's public profile ("This profile is part of the Wallplace tour...") in both the compact sidebar spot and the bottom band | Yes | |
| The demo-profile switch on /browse/[slug] triggers on the configured DEMO_ARTIST_SLUG, an `isDemo` data flag, or a `?demo=1` query param | FLAG (minor): `?demo=1` works on ANY artist's profile, so a crafted link makes a real artist's page claim to be a demo with its Message and Buy buttons removed. Restrict the query-param override to the configured demo slug or to non-production | |
| Demo login role parsing: anything other than `venue` becomes `artist`, so a mistyped role tours the artist rather than erroring | Yes | |

## Terms acceptance (all roles)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| POST /api/terms/accept inserts a terms_acceptances row (user_type, terms_version, terms_type, ip, user_agent, accepted_at); rate limited 10/min per IP; body schema-validated (E46b closed the four-free-text-fields insert) | Yes | |
| Authenticated acceptance takes the email from the verified token and ignores the body's, so a logged-in caller cannot record acceptance against a third party; user_id is stamped when present | Yes | |
| Pre-signup acceptance (all six callers fire straight after signUp, before email confirmation, so there is no session) still accepts a body email; the route documents plainly that a pre-auth assertion about an email is forgeable by construction and that the sound fix (record after confirmation, from the token) is an owner decision on when the evidence is stamped | FLAG (known, documented): the evidence trail for pre-signup acceptances is forgeable; the row itself says the fix awaits an owner decision. Fine to launch with, but the decision should be made | |
| Audit IP is derived from platform headers only and stored as null when unknown (E36c), rather than trusting caller-supplied x-forwarded-for on a legal record | Yes | |
| Callers and versions: signup/customer records platform_tos; signup/artist platform_tos; signup/venue platform_tos AND venue_agreement; ApplicationForm platform_tos AND artist_agreement; all with hardcoded `termsVersion: "v1.0-2026-04"`, all fire-and-forget | Yes for launch, though the version constant is copy-pasted in five files rather than shared | |
| OAuth signups record NO terms acceptance at all: /auth/callback and oauth-finalize never call /api/terms/accept, and the signup pages fire it only on the email/password branch | FLAG: a Google/Apple artist, venue or customer has no terms_acceptances row, so the contractual trail only covers password signups. The OAuth signup pages show the terms checkboxes, but the acceptance is never recorded server-side for that branch | |
| Re-acceptance: nothing anywhere demands re-acceptance. There is no current-version constant, no login-time version check, no gate on any portal, and the LegalTermsUpdate / LegalPrivacyUpdate broadcast templates are registered but unwired (OUTSTANDING §5, admin UI not built) | FLAG: acceptable pre-MVP (v1.0 is the only version), but the moment terms change there is no mechanism to tell users or collect fresh consent; the plan exists only as an OUTSTANDING checkbox | |
| Demo users' terms acceptances are soft-blocked (assertNotDemo), so tour sessions do not write legal records | Yes | |

## Email and notification system as user-visible behaviour (all roles)

Delivery pipeline rules first, then every wired email with its trigger, then the unwired remainder, then every in-app bell notification.

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Pipeline: sendEmail() runs idempotency check, suppression check, per-user category preference and vacation check, per-category throttle, render, Resend send, and logs every attempt (including skips) to email_events; it never throws | Yes, a genuinely solid chokepoint | |
| Idempotency is claimed atomically (upsert with ignoreDuplicates on idempotency_key) before the provider call, so concurrent duplicate triggers cannot double-send | Yes | |
| Categories and gates: security, legal, orders_and_payouts and platform_admin always send (bypass suppression and preferences); placements (10/24h), messages (20/24h), digests (8/168h), recommendations (3/168h) ride the notify stream; tips (2/168h), newsletter (4/720h), promotions (2/720h) ride the news stream; each toggleable category maps to one email_preferences boolean | Yes | |
| Preference defaults (API view): placements, messages, digests, recommendations and tips on; newsletter and promotions OFF. GET/PATCH /api/account/email-preferences whitelists fields; the /account/email page reached from every footer drives it | Yes | |
| Vacation mode (`vacation_until`) pauses every non-critical email until the date passes | Yes | |
| Suppression list: sendEmail refuses addresses in email_suppressions per scope (all / marketing / notify / security_only), except critical categories | FLAG: nothing ever WRITES email_suppressions. There is no Resend bounce/complaint webhook (only stripe and supabase webhooks exist), so hard bounces and spam complaints never populate the table and Wallplace will keep mailing dead or complaining addresses; the check is currently decorative. A Resend webhook route is the missing piece | |
| One-click unsubscribe: every send carries List-Unsubscribe (mailto plus `/account/email/unsubscribe?c=<category>&u=<userId>`) and, for non-critical mail, List-Unsubscribe-Post | FLAG twice. (1) The header's https URL is the PAGE path `/account/email/unsubscribe`, but RFC 8058 requires the POST target to accept the one-click POST; the page route cannot (only `/api/account/email/unsubscribe` has a POST handler), so Gmail/Yahoo's Unsubscribe button will 405. (2) The endpoint authenticates by bare userId and category with no signature, while the eslint exemption text claims "signed token in the link"; anyone holding a user id can flip that user's toggles. Sign the (u, c) pair and point the header at the API route | |
| Unverified-recipient cap: contact-form acknowledgements and newsletter confirmations (both aimed at addresses a stranger typed) are capped at 3 per recipient per hour so the forms cannot be used as a mail relay; the submission is still stored and the admin still alerted | Yes | |
| Missing RESEND_API_KEY: dev and preview soft-skip, production hard-fails the send with `email_not_configured` so dropped mail surfaces | Yes | |
| EMAIL_DRY_RUN exercises everything through the idempotency claim and stamps status dry_run without touching Resend | Yes | |
| Email: artist_welcome_checklist sent once per artist (welcomed_at stamp plus `welcome:${userId}` key) by triggerWelcomeIfNeeded, fired from oauth-finalize and from /api/auth/welcome on every SIGNED_IN; computes a live 4-step checklist (profile, first artwork, Stripe, placement preferences) | Yes, though note an email/password artist has no profile until they submit /apply, so their welcome ("no profile yet") only sends on the next SIGNED_IN after applying, typically their next login | |
| Email: customer_welcome, same trigger, deduped only by the idempotency key (no profile row); features up to 3 recent works from admin-approved artists only | Yes | |
| Email: venue_welcome_checklist, same trigger, gated on venue_profiles.welcomed_at | Yes, but the checklist content is hardcoded (completedSteps 0, static 3 items) rather than computed like the artist one; also the welcome family is category "tips", so a user who has toggled tips off gets no welcome. Both are cosmetic at signup time since no preferences row exists yet | |
| Email: account_suspicious_login on the supabase webhook's `auth.suspicious_login` event (HMAC-verified) | FLAG: stock Supabase auth does not emit that event; unless a custom auth hook is configured in the dashboard (not visible from the repo) this template has a receiver but no sender and never fires | |
| Email: support_request_received, /api/contact: an admin_alert always goes to the team, and the submitter gets an acknowledgement (no userId attached, per-recipient capped) | Yes | |
| Email: newsletter_subscribe_confirm, double-opt-in with a single-use 7-day token; customer_waitlist_confirmation on /api/waitlist | Yes | |
| Email: venue_registration_confirmation on /api/register-venue, category "security", idempotency keyed on the email address alone | Yes-ish: category security means it bypasses suppression for an address a stranger typed, but the email-keyed idempotency means at most one ever per address, which caps abuse; a repeat registrant gets no second acknowledgement, which is the chosen trade-off | |
| Email: artist_application_submitted on /api/apply | Yes | |
| Email: artist_application_approved / artist_application_rejected on the admin decision, keyed on the application id | Yes, though both are category "placements", which is user-toggleable; an applicant who happened to disable placement emails would miss their own acceptance. orders_and_payouts or legal semantics fit an application verdict better | |
| Email: venue_new_placement_request to the venue and artist_placement_request_sent to the artist when an artist creates a placement request (placements POST); artist_new_placement_invitation to the artist when a venue initiates; the same pair also fires from the messages POST placement_request path | Yes | |
| Email: artist_placement_accepted plus venue_placement_accepted_confirmation on accept; artist_placement_declined plus placement_venue_declined_artist_request on decline (each side gets the template written for it) | Yes | |
| Email: placement_counter_offer_received to the counterparty on a counter-offer, alongside the bell | Yes | |
| Email: placement_scheduled / placement_artwork_installed / placement_ended to BOTH parties on stage transitions (scheduled, installed, collected), idempotency per placement, stage and recipient | Yes | |
| Email: placement_cancelled to the other party on cancellation | Yes | |
| Email: placement_consignment_record_created and placement_contract_countersigned to both parties from the record route | Yes | |
| Email: placement_review_request from the daily cron, 6.5 to 7.5 days after collected_at on completed placements, one send per party asking them to review the counterparty; the /placements/[id]/review page exists | Yes | |
| Email: review_posted_notification to the reviewee when a review is posted | Yes | |
| Email: message_unread_notification on each text message to an artist or venue recipient (and from the public enquiry form), keyed on the message row, preview truncated at 200 chars, gated by both the profile's message_notifications_enabled and the messages category preference | Yes, except FLAG: the conversation link is hardcoded to `/artist-portal/messages?c=...` for every recipient, so a VENUE recipient clicks through to the artist portal and PortalGuard bounces them to /venue-portal, losing the conversation context. Build the link from the recipient's role | |
| Email: offer_received_notification to the recipient of a new offer or counter, with a ?focus= deep link into the right portal's offers page | Yes | |
| Email: order lifecycle via the dispatcher (recordOrderEvent): order.placed sends artist_order_received to the artist and customer_order_placed to the buyer; order.processing, order.out_for_delivery and order.delivered each mail the buyer; order.cancelled sends customer_order_status_update; order.refunded and order.delivery_confirmed deliberately send nothing here (refunds mail from their own route) | Yes, single-owner mapping with per-event idempotency | |
| Email: customer_confirm_delivery_48h from the daily followup cron 48 to 72 hours after delivery | Yes | |
| Email: customer_refund_confirmation (buyer) and artist_refund_notification (artist) on approval, customer_refund_rejected on rejection, artist_refund_requested when a buyer files a request | Yes | |
| Email: order_dispute_opened on dispute creation and order_dispute_resolved from the admin resolution route | Yes | |
| Email: venue_sale_from_placement (plus bell) when an order carries venue revenue share; venue_collection_pending (plus bell) when a venue-collection order is paid | Yes | |
| Email: curation_enquiry_received on the public curation form, curation_payment_received from the Stripe webhook, curation_refund_issued from the admin refund route | Yes | |
| Email: subscriptions from the Stripe webhook: subscription_started, subscription_upgraded, subscription_cancelled, subscription_renewal_receipt (invoice.paid), subscription_payment_failed (invoice.payment_failed), all category orders_and_payouts | Yes | |
| Email: subscription_trial_ending on customer.subscription.trial_will_end, category "promotions" | FLAG: "your trial ends and billing starts" is a billing notice, not a promotion. Promotions is opt-in (default false) and throttled 2/720h, so any user with a preferences row will simply never receive the trial-ending warning and may be charged unwarned. Move it to orders_and_payouts | |
| Email: artist_payout_sent on payout.paid (plus bell), artist_payout_failed on payout.failed, artist_stripe_kyc_needed on account.updated with outstanding requirements | Yes | |
| Email: artist_weekly_portfolio_digest (Tuesday cron) and venue_weekly_digest (Wednesday cron), see the cron section for the trigger conditions | Yes as triggers, content flags in the cron section | |
| Email: artist_qr_scan_digest (daily cron) with a matching bell | Yes | |
| Email: inactive re-engagement family (artist 14/30/90d, venue 30/90d, customer 30/90d) from the daily cron, category tips | Trigger yes; content FLAG in cron section (hardcoded zero stats) | |
| Email: onboarding nudges (artist day 2/4/7/10/14, venue day 2/4/7/10) from the daily cron, category recommendations, one-shot idempotency per user and template | Yes | |
| Email: admin_alert, the internal operational template (new venue registration, contact submissions, exhausted payouts and friends), category platform_admin, no user preference applies | Yes | |
| Unwired templates (66 of 131 by the audit): the whole customer-sales family except the waitlist confirmation (abandoned checkout 1h/24h, back in stock, price drop, new work from followed artist, saved-works digest), follow/browse customer nudges, shipping-era legacy templates (shipping/delivery confirmations, post-purchase care, purchase review request), first-scan and scan-milestone, matches (artist_new_venue_match, venue_new_artist_matches), venue upsells (rotation reminder, anniversary, managed curation pitch/upgrade, analytics upgrade), premium (tier cap hit, upgrade educational), account ops (2FA, deletion, data export, team invites, email change), newsletters, legal/operational broadcasts, artist_year_in_review, message_hourly_digest, PlacementMidwayCheckin, PlacementEndingSoon, UserRepermissionCampaign | Yes as a deliberate library-ahead-of-product strategy; OUTSTANDING.md maps each group to the missing feature and `npm run email:audit` is the live source of truth. The registry ids and event labels were reconciled (owner decision 7) so no send names a non-registry label | |
| Bell: placement_request ("New placement request") to the counterparty on placement creation, and the same kind reused for "Counter offer received" | Yes | |
| Bell: placement_accepted / placement_declined to the requester on the decision | Yes | |
| Bell: placement_scheduled / placement_installed / placement_live / placement_collected to both parties on stage transitions, linking /placements/[id] | Yes | |
| Bell: placement_cancelled to the other party | Yes | |
| Bell: placement_photo_added to the other party when a placement photo is uploaded | Yes | |
| Bell: placement_record_created and placement_record_countersigned to both parties | Yes | |
| Bell: review ("New N-star review") to the reviewee | Yes | |
| Bell: offer_received / offer_counter to the offer recipient; offer_accepted (buyer link carries ?pay= to auto-open checkout), offer_declined, offer_withdrawn on the PATCH actions | Yes, the ?pay= deep link is a nice touch | |
| Bell: artwork_request_response to the venue on a new artist response; artwork_response_accepted / artwork_response_declined to the artist on the venue's decision | Yes | |
| Bell: refund_request to the artist on a new refund request; refund_approved to BOTH the buyer ("Refund approved") and the artist ("Refund issued"), same kind, role-appropriate links | Yes | |
| Bell: sale to the artist ("Your artwork sold") and, when revenue share applies, to the venue ("Placement sale") | Yes | |
| Bell: collection_pending to the venue when a wall piece sells for buyer collection | Yes | |
| Bell: paid_loan_started to the artist when the venue's paid-loan billing links (first link only, so Stripe redeliveries do not repeat it) | Yes | |
| Bell: payout_sent to the artist alongside the payout email | Yes | |
| Bell: qr_scan_digest to the artist each day scans occurred | Yes | |
| Bell UI: the header dropdown badges unread, marks read optimistically (single and all), falls back to a sensible per-type link when a row has none, and renders unknown kinds with a default icon; new kinds degrade gracefully | Yes | |
| No bell exists for new chat messages by design; the envelope icon with its own unread count covers messages | Yes | |
| createNotification is fire-and-forget and swallows errors (logged loudly); a lost insert loses the bell silently | Yes, acceptable trade-off, documented in the helper | |

## Cron-driven behaviours (artist, venue, customer)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| All cron routes require `Authorization: Bearer CRON_SECRET`, failing closed in production when the secret is unset; per-item failures are caught by runBatch so one bad row cannot abort a sweep | Yes | |
| weekly-artist-digest (Tue 09:00 UTC): artists older than 14 days with 3 or more notable events in the week (profile views, QR scans, unread messages, pending placements) get artist_weekly_portfolio_digest; quiet weeks send nothing; idempotent per user per week | Trigger yes; FLAG the content: topWorks is always [] and the two "recommended actions" are canned strings, so the digest is thinner than its template supports; the unread-message count also filters on is_read=false at send time, so a message received and read during the week does not count towards the threshold (mislabelled as "messages" received) | |
| weekly-venue-digest (Wed 09:00 UTC): same shape for venues (venue views, pending requests, active placements, threshold 3); the venue_view count now keys on venue_user_id (the old venue_slug filter made every count null and skipped view-heavy venues) | Trigger yes; FLAG the content: artistMatches is hardcoded 0 and suggestedArtists always [], so the "matches" panel of the template is dead weight | |
| placement-ending-soon (daily 10:00 UTC): deliberately gated OFF; the handler returns a skip explaining that `placements` has no planned end-date column so an "ending soon" reminder has nothing to fire on (D60); the owner must choose between building placements.end_date or deleting the cron and template | Yes, honest interim, but FLAG that a scheduled job which can never do anything is still burning a cron slot; the decision should be made before launch | |
| placement-review-request (daily 11:00 UTC): completed placements with collected_at 6.5 to 7.5 days ago; both parties get placement_review_request addressed to review their counterparty, idempotent per placement and party | Yes | |
| inactive-users (daily 10:00 UTC): tiers on auth last_sign_in_at (13-15, 28-32, 88-92 day windows); artists get 14/30/90d, venues 30/90d, customers 30/90d; a 14-day per-persona cooldown stops cascading waves; category tips (toggleable) | Trigger yes; three FLAGS: (1) the emails advertise stats but every dynamic field is hardcoded (profileViews 0, portfolioStats zeros, recommendedWorks [], suggestedArtists []), so a returning artist is told they had 0 views regardless of truth, which is worse than saying nothing; (2) "customer" is defined as any auth user without an artist or venue profile, which sweeps in admins and half-onboarded venues; (3) the user list is a single 1000-row page (acknowledged as MVP-fine, silently incomplete past 1000 users) | |
| onboarding-nudges (daily 10:00 UTC): artists created in the last 15 days get day-2 profile completion (skipped when complete), day-4 first artwork (fixed to count via artist_id), day-7 Stripe connect, day-10 placement preferences, day-14 graduation or incomplete recap with a computed remaining-steps list; venues get day-2 space details, day-4 photos, day-7 preferences, day-10 first-placement CTA (skipped once they have any placement); each nudge sends at most once per user (idempotency by user and template) | Yes; minor FLAG: `inDayWindow` is exact integer-day equality (the "±12h window" comment is wrong), so if the cron misses a day, that day's cohort skips that nudge permanently rather than catching up | |
| qr-scan-digest (daily 09:00 UTC): aggregates yesterday's qr_scan events per artist, resolves work titles, sends artist_qr_scan_digest plus a bell ("N QR scans yesterday, Top: ..."), skips artists with no scans and unmatched slugs | Yes | |
| order-delivery-followup (daily 12:00 UTC): 48 to 72 hours after order.delivered sends the confirm-delivery prompt (idempotent via a `:48h_prompt` order_events row); at 7 days of silence auto-confirms by writing order.delivery_confirmed (orders.status deliberately stays "delivered"; the event log drives the stepper and unblocks the artist payout); daily cadence is a documented Vercel Hobby constraint | Yes | |
| stripe-connect/process-pending (daily 08:00 UTC): fires every pending stripe_transfers row whose payout_after (the 14-day hold) has passed, retries failed rows with exponential backoff, marks rows exhausted after MAX_RETRIES and emails the operator once per exhausted payout, and reconciles orders owed money that have no ledger row at all (flagging them with ids in the response) | Yes; note the backoff schedule (1, 4, 15, 60, 240, 960 minutes) is finer than the daily cron cadence, so in practice each retry is 24 hours apart, which is harmless but means "16h max backoff" overstates the urgency the system can deliver | |
| No cron exists for saved-works digests, matches, tier-cap follow-ups, newsletters or year-in-review; those templates are unwired by design (OUTSTANDING §3, §4, §7) | Yes | |

## Wall visualiser quota system (artist, venue, customer, guest)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| GET /api/walls/quota: gated on the WALL_VISUALIZER_V1 flag (404 when off); authenticated users get their tier status; unauthenticated callers get guest tier with zeros rather than a 401, so the artwork-page entry point can render the chip pre-login; ?as=venue|artist|customer hints the portal for dual-role users | Yes | |
| Tier table (tier-limits.ts): guest 0/day; customer 2/day, 30/month, 1 upload/day, 1 saved wall; artist_core 3/50, 1 upload, 2 walls, 1 layout per wall; artist_premium 10/200, 3 uploads, 5 walls, 10 layouts; artist_pro unlimited renders/walls/layouts, 5 uploads, showroom publish; venue_standard 5/100, 2 uploads, 3 walls, 10 layouts; venue_premium unlimited renders/walls/layouts, 5 uploads | Yes, and artist_core's 1 layout per wall is a considered bump from 0 so the free tier can actually save a composed scene | |
| Tier resolution: artist subscription_plan core/premium/pro maps to the artist tiers, venue premium to venue_premium, null venue plan to venue_standard; unhinted resolution falls artist then venue then customer; hint wins for dual-profile users; guest when no user | Yes | |
| Per-artwork daily model: a render charges 1 unit per NEW artwork that day (work ids from metadata); re-rendering the same piece on different walls, frames or sizes is free; legacy callers without work ids pay the flat action cost | Yes, this matches how artists actually iterate | |
| Burst limiter: 30 renders or uploads per hour per user (Upstash sliding window) on top of the daily cap, so an unlimited-tier account still cannot hammer the renderer | Yes | |
| Daily reset 00:00 UTC, monthly reset on the 1st UTC, both surfaced as resets_at timestamps; usage is an append-only ledger (negative rows for refunds) summed per bucket and clamped at zero | Yes | |
| Per-user overrides (visualizer_quota_overrides) add daily/monthly extra on top of a finite tier, with optional expiry; on unlimited tiers the override is ignored (unlimited stays unlimited) | Yes | |
| Env overrides VISUALIZER_LIMIT_<TIER>_DAILY / _MONTHLY / _UPLOADS_DAILY allow tuning without a code release; unknown tiers fail closed to guest limits | Yes | |
| At the limit: consumeQuota returns the reason (daily, monthly or burst) plus resets_at and tier; the render routes answer 429; WallVisualizer opens the UpgradeModal with the reason and reset time; the QuotaChip shows remaining count or a calm "Unlimited" badge | Yes, the at-limit experience is complete | |
| Failure honesty: a failed ledger insert blocks the action (never a free render); any post-charge render failure refunds via a negative ledger row; the documented read-then-insert race is accepted as a small leak with the burst limiter as backstop | Yes | |
| Saved-wall cap enforced on POST /api/walls (0 means the tier cannot save walls, finite caps answer with the cap and reason); layouts-per-wall cap enforced on POST /api/walls/[id]/layouts | Yes | |
| wall_uploads_daily is defined for every tier and burst-listed in quota.ts, but /api/walls/upload-photo never calls consumeQuota (or any per-day check), so the advertised 1/3/5/2 uploads-per-day limits are unenforced; only the 15MB size cap and MIME check apply | FLAG: either enforce the wall_upload action in upload-photo or drop the column from the entitlement table so the upgrade UX does not advertise a limit that does not exist | |
| can_publish_showroom (artist_pro only) exists in the table but no publish endpoint consumes it; the showroom page documents publish-public-showroom as a future feature | Yes as a declared future flag, worth remembering it is dead until then | |
| Demo users can browse the visualiser but renders, wall saves and uploads are soft demo-blocked (assertNotDemo), subject to the silent-no-toast flag in the demo section | Yes | |

## Onboarding checklists and welcome flows (artist, venue, customer)

| Functionality | Does it make sense? | Does it actually work in production? |
| --- | --- | --- |
| Artist dashboard checklist: Complete your profile (bio plus location plus at least one style tag), Upload your first work, Set up payouts (Stripe account id), Get your first placement (any active placement); progress bar, links per item, dismissable, auto-dismisses 3 seconds after everything completes | Yes | |
| Venue dashboard checklist: Complete your venue profile (name, type, location), Describe what you're looking for (preferred styles or themes), Browse artist portfolios, Send your first enquiry (sentMessageCount), Set up payouts | Yes, though "Browse artist portfolios" completes via a localStorage key set when the item is clicked, so it is device-bound and self-certifying rather than based on an actual visit | |
| Checklist dismissal is stored in localStorage (wallplace-onboarding-complete / wallplace-venue-onboarding-complete), so it reappears on a new device or after clearing storage | Yes, minor annoyance at worst | |
| The in-portal checklist criteria and the welcome-email checklist criteria differ slightly (email checks bio plus location or postcode and placement preference booleans; dashboard checks bio plus location plus style tags), so the email and the dashboard can disagree about whether the profile step is done | FLAG (minor): unify the definition of "profile complete" or a user finishing what the email asked still sees an incomplete dashboard step | |
| Customer onboarding: no in-portal checklist; the portal is orders-first (My Orders, Saved, Addresses, Messages, Settings) and the welcome email points at browsing | Yes, appropriate for the role, aside from the Messages dead-end flagged earlier | |
| Welcome emails: fired idempotently on every SIGNED_IN (AuthContext posts /api/auth/welcome with a per-tab guard against React strict-mode duplicates) and from oauth-finalize server-side; artists and venues gate on welcomed_at, customers on the idempotency key | Yes | |
| Artist pending-review experience: portal usable with an amber "under review" banner; approved-but-unpaid gets a "pick a plan, first month free" banner; rejected gets a dead-end screen with a feedback email address; monetised actions gate themselves server-side | Yes | |
| Onboarding nudge emails (cron, day 2/4/7/10/14 artist and 2/4/7/10 venue) complement the checklist and each skip when the step is already done | Yes | |
| Venue first-login profile creation: ensureVenueProfile adopts an email-matching orphan profile or hydrates a new one from the venue_registrations row, refusing to adopt when multiple orphans share the email | Yes | |
| Email-verification gate: every portal shows the "Verify your email" screen until email_confirmed_at; the login page offers a resend-verification path for unconfirmed accounts | Yes | |

---

