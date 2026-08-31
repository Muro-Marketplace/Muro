# Area A production run log — public visitor and auth entry

Site: https://www.wallplace.co.uk (apex 307s to www, verified).
Date: 2026-08-30. Role: GUEST (no login) unless stated.
Tools: Playwright MCP (accessibility tree, network, console, evaluate), curl for
status codes and API probes, Supabase MCP (project `uwkuhygwvasdzwsusiym`,
SELECT only) to prove writes actually persisted.

Supabase MCP confirmed to be the same database the live site writes to: every
form submission below was found in the production tables seconds after posting.

---

## Environment / infrastructure

| Check | Result |
|---|---|
| `https://wallplace.co.uk/` | 307 -> `https://www.wallplace.co.uk/` |
| `/robots.txt` | 200, disallows /api/ /admin/ portals /checkout/ /email-preview/ /dev/ /demo/ /auth/; `Sitemap: https://wallplace.co.uk/sitemap.xml` (apex, not www) |
| `/sitemap.xml` | 200, all `<loc>` entries are apex URLs which then 307 to www |
| `/og-image.png` | **404** |
| `/opengraph-image?3f89e734705f6ef6` | 200, image/png, 55,011 bytes |
| `/profile-designs` | 404 (route gone) |
| `/email-preview` | 404 (production gate holds) |
| `/api/stats/public` | 200 `{"total_artists":14,"total_artworks":35,"total_placements":0,"total_venues":9,"artworks_sold":4}` |
| Console on every public page | one benign warning only: "CSP directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy" |

### OG image, the important half

- Homepage: `og:image` = `https://wallplace.co.uk/opengraph-image?...` -> **200 PNG**.
- Homepage: `twitter:image` = `https://wallplace.co.uk/og-image.png` -> **404**.
- `/browse`, `/pricing`, `/about`: `og:image` = `https://wallplace.co.uk/og-image.png` -> **404**.

So only the homepage's Open Graph card resolves. Every other page, and every
Twitter card including the homepage's, still requests the missing file.

---

## Header

- Immersive header measured with `getComputedStyle` on `/`: at scroll 0
  `background-color: rgba(0,0,0,0)` and logo `rgb(255,255,255)`; after
  `scrollTo(0,300)` `rgb(255,255,255)` and logo `rgb(26,26,26)`. Class list
  confirms `bg-transparent border-b border-transparent` at rest.
- Logged-out desktop nav on `/`: Marketplace `/browse`, How It Works, Blog,
  Spaces. Login link + Sign Up button. Matches column 1.
- **Mobile marketplace tabs, the flagged row.** Viewport 390x844, `/browse`,
  logged out. Enumerated every header anchor with a visibility test:
  - hidden desktop nav: Galleries, Portfolios, Collections, Spaces, How It
    Works, Blog, Login, Sign Up
  - visible mobile overlay: Galleries, Portfolios, Collections, Spaces, Login,
    Sign Up
  How It Works and Blog are absent from the mobile overlay. The flag is live.

## Footer

- For Artists column in production: Apply to Join, Pricing, Browse Venues,
  FAQs. **No "Artwork Requests" link** — `/artwork-requests` now 307s to
  `/spaces` (the parked-redirect state PROGRESS describes).
- Instagram anchor: `target="_blank" rel="noopener noreferrer"`.
- All other footer links present and resolving as listed.

## FeedbackBubble placement

Counted the "Feedback and feature requests" button in each page's HTML:

- present: `/`, `/about`, `/pricing`, **`/returns`**, **`/complaints`**
- absent: `/terms`, `/privacy`, `/cookies`, `/ip-policy`,
  `/artist-agreement`, `/venue-agreement`

So the legal-route exclusion is real but does not cover Returns & Refunds or
Complaints, both of which are linked from the footer's legal block.

---

## Homepage

- Shell: skip-to-content link, Header, Footer, FeedbackBubble and CookieBanner
  all render on `/`. The "homepage bypasses the shared shell" flag is fixed.
- Trust bar reads **30+ Curated Artists / 230+ Original Artworks / 20+ Active
  Venues**. `/api/stats/public` says 14 / 35 / 9. No request to
  `/api/stats/public` appears in the network log for `/` (checked
  `performance.getEntriesByType('resource')` and the MCP network list). The
  numbers are static and overstate live reality by roughly 2x, 6.5x and 2x.
- Testimonials section (Eloise Bramley / Tomi Okafor / David Chen) is **gone**
  from the rendered page: greps for every name and for "Copper Kettle",
  "Roots and Vine" return nothing.

---

## Marketing copy checks (fetched and text-extracted each page)

| Claim the audit flagged | Live state |
|---|---|
| "We accept around half" (/how-it-works artist tab) | gone; lede is now "Apply to join Wallplace's curated roster. Every application is reviewed personally." |
| "We accept roughly half" (/apply hero) | gone; now "We review every application personally. Being accepted means your work has been judged ready for commercial spaces." |
| "browse hundreds of storefronts" (/how-it-works customer tab) | gone; now "browse a growing roster of artist storefronts online" |
| "hundreds of independent artists" (/customer) | gone; no occurrence of "hundreds" anywhere on the site |
| certificate of authenticity as a platform promise | gone; /customer now says "Want a signed certificate of authenticity? Ask the artist before you buy." |
| "many successful artists are accepted on their second application" (/artists FAQ) | gone; now "We give feedback where we can, and you're welcome to reapply after three months." |
| "most of our artists use Parcelforce, DHL" (/artists FAQ) | gone |
| /artists payout wording vs /faqs | now identical mechanics: "held until the artwork is confirmed delivered (or 14 days pass without a buyer dispute, whichever comes first)" |
| /pricing cancellation FAQ "We will arrange the return" | gone; now "You collect any artwork on display with venues within 30 days of cancelling", matching the Artist Agreement and /faqs |
| /faqs bottom CTA "within 24 hours" | now "within 2 working days", matching /contact |
| /contact "We respond within 24 hours" | now "We respond within 2 working days" in sidebar, success screen and (per the code) the acknowledgement email |
| /about "We handle everything from there" | gone; onboarding step now ends "From there you and the venue arrange the details together" |
| /faqs onboarding-call and first-interest statistics | gone |
| **/sustainability "the lifetime journey of a work , first studio"** | **still present, space before the comma** |
| **/signup/venue "Wallplace Curated , paid shortlists from £49."** | **still present, space before the comma (confirmed in rendered innerText, not just source)** |
| **/how-it-works venue step 03** | **still "Display work for free with an optional revenue share on sales, or purchase pieces outright" — paid loan still omitted** |
| **/artists venue-demand CTAs** | **"SEE VENUE DEMAND" and "SEARCH BY POSTCODE" both href `/spaces`** |
| **/signup/venue "Register and start browsing immediately. No waiting."** | **still present, still skips the mandatory email verification** |
| /pricing "Apply for Pro" | now `/apply?plan=pro` (preselect itself needs a signed-in artist, deferred to area D) |

`/how-it-works` tablist verified: three `role="tab"` with `aria-selected` and
`aria-controls` to `hiw-panel-venue|artist|customer`; clicking each swaps the
panel content.

---

## Contact form and /api/enquiry

1. **Empty "I am a..." select.** Submitted with name/email/message filled.
   Form did not submit. `form.noValidate === false`, and
   `select.validationMessage` is the browser default
   **"Please select an item in the list."** No custom inline message node
   exists anywhere in the DOM. Column 1's "instead of relying on the native
   tooltip" does not describe production.
2. **Normal submit.** `POST /api/contact` -> 200 `{"success":true}`. Success
   screen: "Message Sent / Thanks for reaching out. We respond within 2 working
   days."
3. **Reference number.** API body is `{"success":true}` only. Nothing on the
   success screen. But the row IS created with a reference — production DB:
   ```
   id 6 QA-TEST-Production-Pass  WP-62828CC9
   id 7 QA-TEST-ref-check        WP-BEDB37AF
   id 8 QA-TEST-Enquiry          WP-FA5E9D2D
   ```
   Generated and stored, never surfaced. Flag confirmed with hard evidence.
4. **Artist mode** `/contact?artist=fin-coles`: banner "Messaging: Fin Coles",
   type select removed from the DOM, submit reads "Send Message to Fin Coles",
   textarea placeholder "Write your message to Fin Coles...". Name resolved by
   fetching the whole `/api/browse-artists` list (only `/api/` request on the
   page).
5. **The double-post.** Instrumented `window.fetch`. Real submit produced, in
   order:
   - `POST /api/enquiry` 200 `{"success":true}` with
     `{senderName, senderEmail, artistSlug:"fin-coles", enquiryType:"general", message}`
   - `POST /api/contact` 200 `{"success":true}` with `type:"artist-message"`
   Both rows exist in production (`enquiries` id 12, `contact_submissions` id 8),
   plus an inbox row in `messages`: `sender_type=anonymous`,
   `recipient_slug=fin-coles`, `is_read=false`, `message_type=text`.
   Note: `messages.sender_name` stored as **`fcoles2598`** (email local part),
   not the "QA-TEST-Enquiry" name the sender typed.
6. **Fault injection for the unchecked-response flag.** Re-loaded the page,
   stubbed `/api/enquiry` to return 500 and stubbed `/api/contact` to a fake 200
   (so no second real row was written). The success screen changed to:
   > "We have your message for Fin Coles, but we could not notify them
   > automatically. Our team will pass it on, and we respond within 2 working days."
   The enquiry response IS checked now. That flag is fixed.

## Newsletter

- `POST /api/newsletter` fresh -> 200 `{"ok":true}`; same email again -> 200
  `{"ok":true}` byte-identical; `not-an-email` -> 400
  `{"error":"Please enter a valid email address"}`.
- DB after: exactly one row, `confirmed_at NULL`, `confirm_token` present.
- `GET /api/newsletter/confirm?t=<real uuid>` -> 303 to
  `/newsletter/confirmed?status=ok`. DB after: `confirmed_at` set,
  `confirm_token` NULL, `unsubscribed_at` NULL.
- Replaying the same token -> 303 `status=invalid`. Unknown UUID -> `invalid`.
  Non-UUID `t=garbage` -> `invalid`.
- `/newsletter/confirmed` renders three distinct copies for ok / expired /
  invalid; `?status=bogus` and no status both fall through to invalid.
  `<meta name="robots" content="noindex, nofollow">` present.
- All confirm redirects target the **apex**, adding a 307 hop to www.

## Waitlist

- `POST /api/waitlist` with all six fields -> 200 `{"success":true}`; duplicate
  -> identical; `{"email":"x@y.com"}` -> 400 "Name, email, and user type are
  required".
- **Schema proof of the field-stripping flag.** `waitlist_signups` columns are
  exactly: `id, name, email, user_type, created_at`. There is nowhere for
  `phone`, `venueName` or `venueLocation` to go. My submission stored only
  name / email / user_type. One row for two identical POSTs.
- `/waitlist` carries `<meta name="robots" content="noindex, nofollow">`.

## Turnstile — production has no bot protection

- `/signup/artist`: zero iframes, zero elements matching
  `[class*=turnstile],[id*=turnstile],[data-sitekey]`, zero Cloudflare scripts.
  Ticking the ToS checkbox alone flips "Create Account" from
  `disabled: true` to `disabled: false`.
- `/signup/venue`: same, zero iframes.
- `POST /api/auth/verify-turnstile {"token":"QA-TEST-not-a-real-token"}` ->
  200 **`{"ok":true,"bypass":true}`**. Empty body -> 400 "Missing token".

`TURNSTILE_SECRET_KEY` is not set in production, so the bypass path is live and
all four signup forms run with no bot protection at all.

## Login

- Password input `minLength = 6`; `/signup/artist` and `/signup/venue` use 8.
- Wrong credentials -> inline "Invalid email or password".
- `/login?email=test%40testingvenue.com&hint=venue` renders
  "Sign in to your **venue** account" plus "You have more than one Wallplace
  account on this email address... use the ones you set up for your venue
  account", and prefills the email. `?hint=` IS read now.
- "Email + password only for now. Google and Apple sign-in coming soon." on
  /login, /signup/artist, /signup/customer — OAuth still dark.
- `POST /api/auth/precheck {"kind":"login"}` -> 200 `{"ok":true}`.
- `POST /api/auth/resend-verification` for an address that does not exist ->
  200 "If that address needs confirming, we've sent a new link. Check your
  inbox and spam folder." Enumeration-safe.

## Signup

- `/signup/artist` copy is now honest: heading "Create your account, verify your
  email, and the application form is your next stop", button **"CREATE
  ACCOUNT"**, footer "We'll email you a verification link. Verify, sign in, and
  you'll land on the application form." The old "Continue to Application" /
  straight-through promise is gone.
- `/signup/venue`: three required checkboxes (ToS, Venue Partnership Agreement,
  public liability insurance) all present; password min 8.
- **"Other" venue type.** Selecting Other reveals a text input placeholder
  "Please describe your venue type". `venue_registrations` columns are
  `id, venue_name, venue_type, contact_name, email, phone, address_line1,
  address_line2, city, postcode, wall_space, art_interests, message,
  hear_about, status, created_at` — there is no column for it. Both halves of
  the flag confirmed.
- `/register-venue` -> 307 `/signup/venue`.

## Apply gate

- Anonymous `/apply` replace-redirects to `/signup/artist?next=%2Fapply`.
  Wrong-role loop and `?plan=pro` preselect need a signed-in account; carried
  into the artist/venue passes.

## Demo

- `/demo` cards link to **`/browse/maya-chen`** and
  **`/venues/the-copper-kettle`**, i.e. the public-profile fallback. Both 200.
  `DEMO_ARTIST_EMAIL` / `DEMO_VENUE_EMAIL` are therefore unset in production and
  the portal tour is never routed to.
- `GET /api/demo/login?role=artist` -> **405** (content-length 0). The route
  only accepts POST, and nothing in the UI posts to it.
- Consequence: the flagged `@supabase/ssr` cookie problem cannot be exercised
  from production, because the tour never reaches the route. Separately, the
  page's own framing ("SEE IT FROM THE INSIDE", "Tour the artist account") sells
  a portal tour that in production is a public profile page.

## Feature requests

- `/feature-requests` 200. `GET /api/feature-requests?status=open` -> 200
  `{"requests":[]}` — the board is empty, so row-level behaviour (upvote
  toggle, pressed state, role badge) has nothing to act on as a guest.

## QR scan redirect

- `GET /api/qr/fin-coles?t=Mt.%20Fitz%20Roy&vs=the-copper-kettle&size=A3`
  -> 302 to
  `https://wallplace.co.uk/browse/fin-coles?ref=qr&venue=the-copper-kettle&va=<jwt-ish>&work=mt-fitz-roy&size=A3`.
  The `va=` payload base64-decodes to
  `{"venueSlug":"the-copper-kettle","artistSlug":"fin-coles","exp":1788208131}`
  — exactly 24 hours out, matching the owner's ruling.
- Legacy `?work=Sand%20Dunes&v=Copper%20Kettle` -> 302 with
  `?ref=qr&venueName=Copper+Kettle&work=sand-dunes`. Legacy keys still honoured.
- Analytics: both scans appear in `analytics_events` as `qr_scan` within
  seconds (20:28:28 and 20:28:52). Neither resolved `venue_user_id`, because
  the live `venue_profiles` slug is `the-copper-kettle-demo`; the seeded pool
  slug `the-copper-kettle` has no profile row. Earlier real scans (2026-08-28,
  venue "Testing Venue") do carry `work_id` and `venue_user_id`, so the
  resolution path works when the slug is a real profile.
- Unknown slug -> 302 to `/browse/<slug>?ref=qr` with no extra params, no 500.
- All QR redirects target the apex, adding a 307 hop.

## Redirects

- `/galleries` -> 307 `/browse?view=gallery`.

---

## Things created in production during this pass (cleanup list)

| Table | Row | Identifier |
|---|---|---|
| `contact_submissions` | id 6 | QA-TEST-Production-Pass, ref WP-62828CC9 |
| `contact_submissions` | id 7 | QA-TEST-ref-check, ref WP-BEDB37AF |
| `contact_submissions` | id 8 | QA-TEST-Enquiry, ref WP-FA5E9D2D |
| `enquiries` | id 12 | QA-TEST-Enquiry -> fin-coles |
| `messages` | 19465ea0-4271-4df1-8b11-bd91539756a1 | anonymous -> fin-coles inbox |
| `waitlist_signups` | id 3 | QA-TEST-Waitlist, fcoles2598+qatest-waitlist@gmail.com |
| `newsletter_subscribers` | c447fb67-2df1-4e30-84af-6f18a2902c49 | fcoles2598+qatest-newsletter@gmail.com, confirmed |
| `analytics_events` | 868b5e5f..., 0d45767d... | two qr_scan rows, 2026-08-30 20:28 |

Emails triggered, all to the owner's own addresses: contact admin alert +
acknowledgement (x3), enquiry admin alert + artist notification, waitlist
confirmation, newsletter double-opt-in confirmation.

---

# Late findings (after the artist and customer logins)

## 1. `/api/apply` 500s on a valid application — the artist funnel is dead

Filling the form as a signed-in artist and pressing Submit Application produced
`POST /api/apply` -> **500** `{"error":"Something went wrong. Please try again."}`
No row was written (`artist_applications` stayed at 13).

Reproduced anonymously with curl, so it is not an auth problem. Narrowed by
elimination against production:

| Payload | Result |
|---|---|
| partial body (`{"name":"x"}`) | 400 with a proper `fieldErrors` map |
| empty body | 400 with `fieldErrors` |
| valid body, `primaryMedium: ""` | **500** |
| valid body, `portfolioLink: ""` | 200 `{"success":true}` |
| valid body, `artistStatement: ""` | 200 `{"success":true}` |
| valid body, all three filled | 200 `{"success":true}` |

**Root cause: an empty `primaryMedium`.** The form labels that select
"Select your primary medium (optional)" and does not mark it `required` — I
confirmed zero `:invalid` controls remained after filling everything the browser
does police. `artist_applications.primary_medium` is `NOT NULL` with no default,
so the insert is rejected. The `id` sequence advanced on every failure (24 and 26
are missing from the table), which is the insert being attempted and refused.

Impact: any applicant who does not volunteer an optional field gets a generic
"Something went wrong. Please try again." and loses the whole form. This is the
primary artist acquisition funnel.

## 2. Supabase email confirmation is disabled in production

Running the real customer signup:

- `signUp` returned an `access_token` immediately and the browser landed on
  `/customer-portal`, already signed in.
- `auth.users` for the new account: `email_confirmed_at` stamped at creation
  (2026-08-30 20:48:59), `confirmation_sent_at` **NULL**.

Consequences across the site:

- `/check-your-inbox` is unreachable from a real signup.
- The "We'll email you a verification link. Verify, sign in..." copy on
  `/signup/artist` describes a step that does not happen.
- `/api/auth/resend-verification` and the `/login` unconfirmed-email resend panel
  are dead code in production — no account can be unconfirmed.
- `/signup/venue`'s "Register and start browsing immediately. No waiting." turns
  out to be the accurate sentence.

## 3. Turnstile: no bot protection on any signup form

The real customer signup posted `{"token":"dev-bypass"}` to
`/api/auth/verify-turnstile` and got `200 {"ok":true,"bypass":true}`. An
arbitrary invented token gets the same answer. No widget, no iframe, no
Cloudflare script on `/signup/artist`, `/signup/customer` or `/signup/venue`, and
ticking the ToS box alone enables the submit button.

## 4. Two more silently discarded form fields

`artist_applications` columns are `id, name, email, location, instagram, website,
primary_medium, portfolio_link, artist_statement, offers_*, open_to_*,
delivery_radius, venue_types, themes, hear_about, selected_plan, status,
created_at, discipline, sub_styles, trader_status, business_name, vat_number,
reviewed_at, reviewed_by, referred_by_code`.

- `acknowledgedCoolingOff` is posted (`true` in my captured body) and has no
  column — the flagged case, confirmed.
- **`sampleWorkUrls` is also posted and has no column.** The three "Link to
  sample N" slots on the form are discarded the same way. This was not in the
  audit.

`referralCode` on the other hand does persist: `referred_by_code = 'QATESTREF'`
on application id 29.

## 5. Things that turned out FIXED

- `/apply` wrong-role loop: the CTA is now a button that genuinely signs out and
  lands on `/signup/artist?next=%2Fapply` without bouncing back.
- `/api/apply` email impersonation: posting a different email while authenticated
  returns 403 "Please apply with the email on your account (finbin1@hotmail.co.uk).
  To use a different address, sign out first."
- `/pricing` "Apply for Pro": `/apply?plan=pro` preselects the Pro card
  (`border-accent bg-accent/5`); with no param Core is selected.
- `?hint=` on `/login` is read: renders "Sign in to your venue account" plus an
  explanation of why there are two accounts.
- `/cookies` rewritten (August 2026) and now accurate: `document.cookie` is empty
  even while signed in, and the session lives in
  `localStorage['sb-uwkuhygwvasdzwsusiym-auth-token']`, exactly as the new table says.
- The contact form's enquiry double-post now checks the enquiry response.

## 6. Header, signed in

- Artist: nav Marketplace/Spaces, More (Curated, How It Works, Blog, About,
  Contact, FAQs, Pricing), Saved -> `/artist-portal/saved`, Messages badge 1,
  Notifications badge 9+, portal chevron mirroring the full sidebar, Logout.
- Messages dropdown DOES populate (16 conversations from
  `/api/messages?slug=fin-coles`, 6 shown). Caveat: the panel shows
  "No messages yet" for about a second while the fetch is in flight, so a slow
  connection shows a false empty state. Same for notifications.
- Notification row links are type-correct (analytics / placements /
  `/placements/<id>` / offers / orders).
- Mark all read on notifications: `PATCH /api/notifications {"all":true}` -> 200,
  badge cleared, and still cleared after a full reload.
- **Customer header has no Messages envelope at all**, only Notifications.
- **No cart control renders in the header** for guest, artist or customer with an
  empty cart.
- `/api/account/roles` returns a single role for every account available, so the
  "Switch to X portal" entries never render.

## 7. `/spaces` by role

- Guest: anonymised cards, subscribe teaser, `/api/venues/demand` returns blanked
  name/location/description/images but keeps `slug` and the arrangement flags.
- Artist (Pro): full details, "Request a placement" and "Message" per card, and
  the allowance badge "14 of 15 venue approaches left this week on Pro."
  Message routes to `/artist-portal/messages?artist=<slug>&artistName=<name>`.
- Customer: full details but **no Message and no Request a placement button** —
  only "View full profile". The flagged customer-routed-to-`/venue-portal` bug is
  therefore fixed by removal.
- `/api/outreach/allowance` 401s for guests and logs a console error, though the
  badge correctly renders nothing.

---

## Cleanup list, updated

| Table | Rows | Identifier |
|---|---|---|
| `contact_submissions` | 6, 7, 8 | QA-TEST-*, refs WP-62828CC9 / WP-BEDB37AF / WP-FA5E9D2D |
| `enquiries` | 12 | QA-TEST-Enquiry -> fin-coles |
| `messages` | 19465ea0-4271-4df1-8b11-bd91539756a1 | anonymous -> fin-coles inbox, unread |
| `waitlist_signups` | 3 | QA-TEST-Waitlist |
| `newsletter_subscribers` | 2 rows | fcoles2598+qatest-newsletter@ (confirmed), fcoles2598+qatestfooter@ |
| `analytics_events` | 2 | qr_scan, 2026-08-30 20:28 |
| `moderation_queue` | e9609e8b-8ab9-49c2-b3f4-9ce8c3bc8980 | QA-TEST feature request, pending |
| `artist_applications` | 25, 27, 28, 29 | QA-TEST Applicant Full / Narrow x2 / Referral, all pending |
| `auth.users` | 4ea8c2e2-f5bc-4c1c-839e-96bf20c04da9 | **QA-TEST Customer**, fcoles2598+qatestcustomer@gmail.com, password Chelsea22! |

The customer account was created deliberately: none of the three supplied logins
is a customer, so area C would otherwise have been entirely untestable. It is
being reused for areas B and C.

State changed on a real account: the artist's notifications were all marked read
while verifying the header's Mark all read. Nothing else on a real record was
mutated.
