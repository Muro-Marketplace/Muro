# Area E production run log — venue portal and curation

Site: https://www.wallplace.co.uk. Date: 2026-08-30/31.
Role: the VENUE login `test@testingvenue.com` (Testing Venue, Café / Coffee
Shop, London, 11 current placements, 7 active, 35 archived, 3 walls, Stripe
Connect **started but incomplete**).

The BLOCKED count is high (176) and almost all of it is structural rather than
untested effort:

- **44 rows** are the artwork-requests surface, which is parked. It is absent
  from the venue sidebar, and `/venue-portal/artwork-requests` returns 200 from
  the server but the client immediately redirects to `/venue-portal`, so the
  page never renders. The same is true on the artist side.
- **34 rows** are the wall editor and creation flow, which would add real
  records and consume render quota.
- **20 rows** are the curation booking flow, which starts a real Stripe
  checkout for a paid service.
- The rest are branches this venue's state cannot produce (completed onboarding,
  missing profile row, empty tabs, demo accounts).

---

## Sidebar

Dashboard, Venue Profile, Messages, Placements, My Offers, **My Walls**, Saved,
QR Labels, Analytics, My Orders, Settings, Logout. **Artwork Requests is absent.**

The venue header nav is Marketplace, **Wallplace Curated**, **Blog** — the venue
variant that swaps Spaces for Curated and Blog, exactly as area A described.

**A useful control finding:** the venue header **does** render a Messages
envelope with an unread count of 0. The customer header renders none at any
count. So the missing customer envelope is role-gated by design, not a symptom
of a zero count — which corroborates the removal of the customer inbox.

## Dashboard — two flags resolved

- **"Set up payouts" checklist item.** This venue is the exact case the flag
  described: it HAS a Stripe account id, and Settings shows the incomplete state
  ("Complete your payout setup to start receiving transfers", **Continue
  Setup**). The checklist item renders as an **unticked circle**
  (`border-2 border-border`, no green tick) while the four completed items carry
  `bg-green-500` ticks. The two surfaces agree now.
- **Quick Actions.** "Your Messages" links `/venue-portal/messages`. The link to
  the non-existent `/venue-portal/enquiries` is gone.
- **Total Spent.** The tile reads £609.75, and the Orders page separately
  reports YOUR PURCHASES 4 / SPENT ON ART £609.75 against PLACEMENT SALES 2 /
  REVENUE EARNED £10.00. The two are distinct figures, so the flagged
  conflation of venue-attributed sales with the venue's own purchases does not
  appear to be happening.

## Venue Profile — three flags fixed, one stands

| Flag | Live state |
|---|---|
| Section "Cancel" keeps typed values | **Fixed.** Typing QA-TEST-CANCEL-PROBE into Venue Name then pressing Cancel restored "Testing Venue". |
| Preferred Artwork Sizes pills are decorative | **Fixed by removal.** No such heading and no Small/Medium/Large/Oversized pills exist on the page. |
| Contact PII writable but no inputs | **Fixed by relocation.** Contact Name, Phone, Address 1/2, City and Postcode now have inputs — on the Settings page, with a Save Details button. |
| No control for `interested_in_collections` | **Stands.** The word "collection" does not appear on the profile page at all. |

`interested_in_local_artists` has a real control: "ARTIST LOCATION / Prefer
artists within 10 miles of my venue".

## Settings — the dead form and the 500ing column are both gone

- Venue Name and Email are now **read-only display values** with explanations
  ("Change your venue name on the Venue Profile page", "This is the address you
  sign in with"). The editable set is Contact Name, Phone Number, Address Line
  1, Address Line 2, City, Postcode, with **Save Details**.
- Notification Preferences now has **two** toggles, Message notifications and
  Wallplace news & digest. **Order updates is gone.**
- The API agrees:

```
GET  /api/account/preferences   -> 200 {"preferences":{"email_digest_enabled":true,
                                        "message_notifications_enabled":true}}
PATCH {"order_notifications_enabled":false}
                                -> 400 {"error":"No valid preference fields supplied."}
```

So the phantom column is no longer selected (the read cannot 500) and no longer
accepted (the write fails cleanly instead of 500ing). The description mismatch
on "Wallplace news & digest / Platform announcements and feature launches"
**still stands** — the digest is controlled from `/account/email`.

## Placements — one money-label flag stands, one QR flag fixed

Expanding the Amazon Rainforest placement:

```
Artist          Fin Coles
Size            30×20" (76×51 cm)
Arrangement     Paid loan + QR
Revenue share   24% to artist        <-- 24% is the VENUE's cut
Monthly fee     £5.00
Earned so far   £0.00
QR Scans        1                    <-- not zero
Requested/Accepted/Scheduled/Installed/Live on wall — all 28 Aug
Monthly payment active, £5.00/mo. Payments are running.
```

- **"24% to artist" is the wrong direction and it stands.** The venue's own
  screen tells it the artist takes the share that the payout legs give the venue.
- **The per-placement QR count is fixed.** It reads 1, not the near-guaranteed
  zero the flag predicted.
- The green paid-loan banner renders, which PROGRESS records as previously
  rendering nothing.
- "Message artist" links `/venue-portal/messages?artist=fin-coles&artistName=Fin%20Coles`.

## QR Labels — venue attribution is complete

The page states it plainly: "YOUR VENUE / Testing Venue / QR scans from these
labels will be tagged to your venue automatically."

Reading the label component's live React props confirms it:

```
workId    = fin-coles-1777209991699-3
venueSlug = testing-venue
venueName = Testing Venue
```

Duplicate titles are disambiguated in place with "Placement 1 of 2",
"Placement 1 of 3", "Placement 2 of 3", "Placement 3 of 3" badges, and cards
show the placement-agreed size rather than a generic dimension string.

## Enquiries — the dead page is gone

`/venue-portal/enquiries` returns **404**. The flagged page that fetched a
non-existent GET and mapped the wrong data model has been removed rather than
left to fail. `/venue-portal/commissions` also 404s, which matters for one
artwork-request accept path — though that whole surface is parked anyway.

## Other pages

- **Orders**: two tabs (Placement sales 2, My orders 4) with four stat tiles and
  QR Sale badges on the venue's cut (£2.50, £7.50).
- **Offers**: "My offers", rows to Fin Coles with statuses, and
  **"Complete payment, £27.50"** on accepted offers — the buyer-side pay entry
  the artist view correctly lacks.
- **Analytics**: QR SCANS 3, UNIQUE WORKS SCANNED 2, ARTISTS SCANNED 1, top
  works (Mt. Fitz Roy 1, Guanaco in Patagonia 1), top artist (Fin Coles 3), and
  a closing nudge to the labels page.
- **My Walls**: three walls render with dimensions and source — "Photo Rail
  Wall, 340 × 250 cm · uploaded", "Untitled wall, 300 × 240 cm · preset", "Main
  cafe back wall, 200 × 100 cm · preset" — plus the cap notice "Upgrade to add
  more than 3 walls", and the venue is at exactly three.
- **Saved**: Works 3 / Artists 5 / Collections 0, cards resolving to real seed
  artists with price bands and View links.
- **/curated**: full tier set renders — Single wall £49, Full space £149 (MOST
  POPULAR), Bespoke from £299, Monthly rotation £79.99/mo, Quarterly refresh
  £199.99/quarter — with Brief/Curate/Place and "5 business days". The dashboard
  promo's "from £49" matches. Note `/curated/single-wall` 404s, so the tier-slug
  form used by "Read the full plan" was not established.

---

## Created or changed during area E

Nothing. No profile was saved, no placement cancelled or advanced, no offer
accepted, no wall created, no curation booked. The one edit made (Venue Name)
was reverted by the Cancel control being tested.
