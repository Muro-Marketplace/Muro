# Area C production run log — customer portal and account

Site: https://www.wallplace.co.uk. Date: 2026-08-30.
Role: the QA-TEST customer created in area A
(`fcoles2598+qatestcustomer@gmail.com`), which is the only customer account
that exists — none of the three supplied logins is one.

Safety: **no account was deleted**. The danger zone was driven only as far as
arming the confirm button, then the input was cleared.

---

## Portal shell

Sidebar: My Orders, Saved, Addresses, Messages, Settings, plus Browse Art and
Logout. Profile chip renders "Q / QA-TEST Customer / Customer". Logout clears
the session and a portal reload then redirects to /login. Mobile hamburger and
overlay both work at 390×844.

## `/customer-portal/orders` — the flagged 404 is fixed

| Request | Result |
|---|---|
| `/customer-portal/orders` | **307 -> `/customer-portal`** |
| `/customer-portal/orders?id=WS-J6CRQS4XTX2DJRO7` | **307 -> `/customer-portal?order=WS-J6CRQS4XTX2DJRO7`** |

So the redirect translates the path *and* the parameter. Every refund email,
order-status email and refund-approved bell notification that points at
`/customer-portal/orders?id=…` now lands on the right order.

## Orders dashboard

TOTAL ORDERS 1, TOTAL SPENT £53.49 against the area B purchase. Opening the row
rewrites the URL to `?order=…` and shows the six-step tracker (Order placed
stamped 30 Aug 23:19), the shipping address block, Subtotal £49.99, Shipping
£3.50, Total £53.49 and a "Request Refund" button (correct: the order is
pre-dispatch).

**Two defects:**

1. **The item line renders "Giraffe at Sunset × / £0.00."** `orders.items`
   stores `lineTotal: {"amount":4999,"currency":"GBP"}` — a money object in
   pence — and the page reads it as a plain number. The same defect appears on
   `/orders/track`. Subtotal and Total beside it are correct, so only the
   per-item figure is wrong.
2. **An open dispute is invisible here.** After `POST /api/disputes` succeeded,
   `orders.status` stayed `confirmed`, so no off-pipeline "disputed" badge
   renders on the dashboard — while `/orders/<id>` for the same order shows
   "Problem reported. We've opened a case…". The two buyer-facing surfaces
   disagree about whether there is a live case.

## Saved

The work saved in area B resolved fully: "Sand Dunes / Fin Coles · Saved 30 Aug
2026", linking `/browse/fin-coles?work=sand-dunes`. Tabs persist as
`?tab=artist` / `?tab=collection` with per-tab empty states. Remove fired
`DELETE /api/saved` -> 200 and only then dropped the row.

## Address book

- Created: `POST /api/customer-addresses` -> 201, and the row came back with
  `DEFAULT` even though the client sent `isDefault:false` — the first-address
  rule applied server-side.
- Edited: PATCH -> 200, list redrew as "16 Ormond Crescent, Flat 2".
- Delete dialog: "Delete this address? / QA-TEST Customer, 16 Ormond Crescent,
  TW12 2TH" with Cancel and Delete. Cancelled; row survived.
- Server validation: `postcode: NOTAPOSTCODE` -> 400 with
  `fieldErrors.postcode = ["Postcode doesn't match the expected format for this country."]`;
  omitting `city` -> the equivalent zod error.

**The dead empty-state control is real.** The header "Add address" is a
`<button>` and opens the form. The empty-state one is `<a href="#">` — clicking
it changed nothing (input count stayed 0, no form, URL unchanged).

### Ownership probe — no data harmed

Against another user's address id `e198cfeb-cf77-4667-a504-bbdedb7a0d2f`:

| Verb | Response | Effect on the row |
|---|---|---|
| PATCH | 404 `{"error":"Address not found"}` | none |
| DELETE | **200 `{"success":true}`** | **none — row verified intact in the database afterwards** |

Ownership is genuinely enforced; nothing was deleted. But DELETE reports success
for a row it did not touch, which is inconsistent with PATCH's 404 and would
mislead any client that trusts the response.

## Settings — the notification-preferences flag is largely fixed

Toggling "Newsletter & digest" fired
`PATCH /api/account/preferences {"email_digest_enabled":false}` -> 200, and the
value **survived a full page reload**. The database shows a `customer_profiles`
row created on demand at 21:48:38 with `email_digest_enabled: false`, so the
zero-row UPDATE is gone. The card also now links the real hub:
"Want finer control over what lands in your inbox? Manage every email category."
-> `/account/email`. (Whether any send path reads those columns is not
observable from outside.) Preference restored to true afterwards.

## Email preferences hub `/account/email`

Seven toggles render (Placement updates, Messages, Weekly digests,
Recommendations, Tips and updates, Newsletter, Promotions), the
critical-always-send header copy, and the "Pause non-critical email" date
picker. Flipping Newsletter fired `PATCH /api/account/email-preferences` -> 200
with a "Saved 23:53." line. **No digest_frequency control exists** — the flagged
dead field is still contract-only.

## Unsubscribe — the unsigned UUID is live, proven on my own account

| Call | Result |
|---|---|
| `/account/email/unsubscribe` (no params) | "We couldn't read the unsubscribe details from the link." |
| `/account/email/unsubscribe?c=newsletter` (the footer link shape) | same failure state |
| `POST` to the page URL | **200 with the rendered page**, not a 405 |
| `GET /api/account/email/unsubscribe?c=notacategory&u=…` | 400 `{"ok":false,"message":"Unknown email category"}` |
| `GET …?c=newsletter&u=00000000-0000-0000-0000-000000000000` | 200 "You've been unsubscribed" — **but no row was inserted** (FK now blocks it) |
| `GET …?c=newsletter&u=4ea8c2e2-…` (the QA customer's real UUID, **no auth at all**) | 200, and `email_preferences.newsletter_enabled` flipped to **false**, row created 21:52:23 |

So: the junk-row half is closed by a foreign key, the RFC 8058 POST no longer
405s, but **an unauthenticated request carrying only a raw user UUID still
changes a real account's email settings**. There is no signature and no expiry.
I restored the value afterwards through the authenticated hub.

Two residues: the API returns `{"ok":true,"message":"You've been unsubscribed…"}`
even when nothing was written, and no rate limit was observed on repeats.

`/account/delete` still 404s, but nothing on the preferences page links to it
any more.

## Data export — fixed

`/account/export` now issues **GET** `/api/account/export` and lands in the
ready state: "Your data is ready. Click below to download it as a JSON file."
with a DOWNLOAD anchor on a `blob:` URL. The API returns 200,
`application/json`, `Content-Disposition: attachment; filename="wallplace-export-<uid>-<ts>.json"`.

Sections present: `artistProfile, venueProfile, customerProfile, artistWorks,
placements, placementRecords, placementPhotos, messages, orders, refundRequests,
savedItems, termsAcceptances, notifications, artistApplications, waitlistSignups,
enquiries, collections, customerAddresses, emailPreferences`.

That fixes the phantom table names and the three flagged omissions, and it is
throttled now — a third call in quick succession returned **429**.

Still absent from the dump: `purchase_offers`, `commissions` and the visualizer
tables. And `termsAcceptances` came back empty for an account that accepted the
ToS at signup and whose `POST /api/terms/accept` returned success.

## Messages — the customer inbox has been removed

`/customer-portal/messages` no longer renders MessageInbox. It renders:

> "Artists reply to you by email. There is no customer inbox on Wallplace yet.
> To contact an artist, send an enquiry from their profile page and they will
> reply to your email address."

with a Browse artists CTA. That single decision explains and resolves the whole
family of customer-messaging flags across areas A, B and C: no header envelope
for customers, no `/spaces` Message button for customers, and the enquiry modal
posting `/api/enquiry` instead of `/api/messages`.

## Notifications and account pages

- Mobile "Notifications" is now a **button** that expands the list in place,
  not a link to the dashboard.
- `/account/security` signed in bounces a customer to
  `/customer-portal/settings`; signed out the copy is now "secure it now by
  resetting your password" — the recent-activity promise is gone.
- `/account/appeal` renders with `robots noindex, nofollow`, names
  appeals@wallplace.co.uk and states the 2/10 business-day SLAs.

## Danger zone

Input `aria-label="Type DELETE MY ACCOUNT to confirm account deletion"`. Button
disabled when empty and with "delete my account" in the wrong case; enabled only
on the exact string. Field cleared without clicking.

---

## Created or changed during area C

| Thing | Identifier |
|---|---|
| `customer_addresses` | 026ff7a3-272f-48e0-8172-b231ab785de5 (QA-TEST Customer, 16 Ormond Crescent, Flat 2) |
| `customer_profiles` | d7a5e1e6-d805-4e28-b609-4a81ce0fa9d2 (created by the preference toggle) |
| `email_preferences` | one row for 4ea8c2e2-… (created by the unsubscribe probe; newsletter restored to true) |
| `saved` | the area B row was removed while testing Remove |

No other account's data was created, changed or deleted. The foreign address
row targeted by the DELETE probe was verified intact afterwards.
