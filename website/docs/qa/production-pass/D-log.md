# Area D production run log — artist portal

Site: https://www.wallplace.co.uk. Date: 2026-08-30/31.
Role: the ARTIST login `finbin1@hotmail.co.uk` (Fin Coles, **Pro plan, active**,
approved, Stripe Connect complete, 18 works, 25 placements, 15 orders).

That account state is why 121 rows are BLOCKED: an approved, subscribed, fully
onboarded Pro artist cannot produce the pending/rejected/unsubscribed/past-due
/trialing/Core-tier/at-limit/demo branches the audit describes. Six more rows
are NOT SAFE TO TEST because they move money or state on records belonging to
other parties (approving refunds, accepting live venue offers, cancelling real
placements).

---

## Sidebar — three differences from the audit

Production renders: Dashboard, Edit Profile, My Portfolio, Messages,
**Enquiries**, Placements, My Offers, Collections, Saved, Orders, QR Labels,
Social Posts, **Blogs**, Analytics, Billing, then Settings and Logout.

- **Showroom is absent** — parked.
- **Artwork Requests is absent** — parked (`/artwork-requests` 307s to `/spaces`).
- **Enquiries is new** and is not in the inventory at all. It lists every
  enquiry from the public profile form with All/New/Handled tabs, the sender,
  their email, type, the "Re: <work>" line, the message, and "Reply by email" /
  "Mark handled" actions. All nine of my area A/B QA enquiries appear there.
- **Blogs IS enabled**, so the flag's premise that BLOGS_V1 is off in production
  is wrong.

## Dashboard

Stats: Active Placements 15, Total Sales £1,127.2, **Total Enquiries** 9,
Profile Views 440. Plus the outreach badge "Venue approaches this week / 14 of
15 left" with the rolling-7-day explanation.

- The flagged "Enquiries This Month" label is **fixed by relabelling** to
  "Total Enquiries", so label and data agree.
- **New cosmetic defect:** money renders with one decimal place. "£1,127.2" on
  the Total Sales card, the Summary panel and the analytics revenue card. It
  should be £1,127.20.
- Action items (14) and the activity feed both populate correctly, including the
  area B sale: "Sale: Giraffe at Sunset, £50.99 to you (WS-J6CRQS4XTX2DJRO7)".
- **The flagged dead deep link is fixed.** `/artist-portal/orders?id=WS-J6CRQS4XTX2DJRO7`
  opens that order's detail overlay.
- "Update Availability" still links `/artist-portal/placements` while
  availability is edited on Portfolio. **Flag stands.**

## Orders — the artist view is correct where the customer view is not

The area B order renders here as:

```
ITEMS              Giraffe at Sunset × 1      £49.99
REVENUE BREAKDOWN  Items subtotal             £49.99
                   Shipping                   +£3.50
                   Sale total                 £53.49
                   Platform fee (5%)          -£2.50
                   Your revenue               £50.99
```

Every figure reconciles with the `orders` row. **Note the contrast:** the same
item renders as **£0.00** on `/customer-portal` and `/orders/track`, so the
money-object shape is read correctly on the seller side and not on the buyer's.

No "Mark as Delivered" affordance exists on the seller side, which is the
correct escrow design.

## Analytics

Range switching works (30 days: 43/321/6/5; 7 days: 28/119/6/5, x-axis
25–30 Aug). Traffic Sources Browse 366 (98%) / QR 6 (2%). Top ten works listed.
"Venues That Viewed You" is unlocked for this Pro artist and shows
"Testing Venue, Café / Coffee Shop, 28 Aug".

- **Earnings Over Time caption is fixed**: it reads "Last 7 months" at every
  selected range, instead of echoing the engagement range.
- **The placements-table status badges still fall through.** The Status column
  renders raw lower-case `active` / `pending` / `completed` / `cancelled` while
  the chips above are correctly "Active 15 / Pending 6 / Completed 1".

## Billing — four flags fixed

| Flag | Live state |
|---|---|
| Referral panel is dead code | **Renders**: "YOUR REFERRAL CODE … Refer another artist and get 30 days free when they upgrade to a paid plan. They enter your code on the application form." with code **7184AA** and a Copy button. The intake side is also wired — an application carrying `referralCode` stored `referred_by_code` (area A). |
| "Unlimited works" contradicts the 50 cap | **Pro now reads "Up to 50 works"** |
| Core/Premium disagree about "Message venues directly" | Listed under Premium and Pro only, on this page **and** on /pricing. They agree. |
| "Changes are prorated automatically" | **Replaced** with "You check out for the new plan, it starts straight away, and your old plan is cancelled as soon as the new one is running" — an honest description of the mechanism. |

Payouts panel shows the complete state ("Payouts Active", Open Stripe
Dashboard) and the PayoutExplainerModal opened with the 14-day / same-day QR
explanation.

## QR Labels — the attribution gap is closed

Selecting "Testing Venue" and opening the print preview, then reading the label
component's live React props:

```
venueName = "Testing Venue"
venueSlug = "testing-venue"
```

**Both** are carried now. The flagged failure — labels carrying only the display
name, so the scan resolves no `venue_user_id` and mints no signed attribution
claim — is fixed at the source.

(The QR itself is an inline SVG that does not expose its value in the DOM, which
is why the props were read instead of the URL.)

## Portfolio — the imageless-work flag is fixed

Filling title + one priced size and leaving the image empty:

- the field is labelled **"Image \*"**
- pressing Save Work renders the inline error **"Upload an image of the artwork
  before saving"**
- **no request is made** — nothing was created, and no picsum placeholder
  reached the marketplace.

Also changed: the per-size column toggles are now only "Different shipping per
size" and "Different quantity per size". **"Also sold in-store at venues" is
gone**, consistent with the in-store offer having moved onto the placement in
migration 121.

The unsaved-changes guard is real: navigating away from a dirty work form fired
a `beforeunload` dialog.

Pro still shows a bare "18 works" with no denominator, so the at-limit UI
remains unreachable — but the marketing contradiction behind it is resolved.

## Blogs — created, saved, submitted

`Save as draft` -> `POST /api/blogs` 200
`{"blog":{"id":"25cb2c0e-57d3-4040-bc86-7216b2166727","slug":"qa-test-markdown-rendering-check-delete-me-i4465r"}}`,
URL replaced with the edit route, debounced auto-save PATCH 200 `{"status":"ok"}`,
"Saved" indicator, "Status: draft". `Submit for review` PATCHed 200 and the
status flipped to **pending_review**.

**No delete affordance exists** on the list or in the editor. Flag stands.

The post carries markdown (`## heading`, `**bold**`, `*italic*`, a link, bullets)
specifically so the public markdown rendering — the one row area A had to leave
BLOCKED — can be checked once it is approved in the admin pass.

## Settings — the decorative password field is fixed

Submitting a deliberately wrong current password:

- fires `POST <supabase>/auth/v1/token?grant_type=password` -> **400
  `invalid_credentials`**
- renders the inline error **"Current password is incorrect"**
- does not change the password

So the field genuinely re-authenticates now.

One inconsistency worth noting: the artist settings page has **no link to
`/account/email`**, while the customer settings page does.

---

## Created during area D (cleanup list)

| Thing | Identifier |
|---|---|
| `blogs` | 25cb2c0e-57d3-4040-bc86-7216b2166727, slug `qa-test-markdown-rendering-check-delete-me-i4465r`, status **pending_review** |

Nothing else was created, and no real order, placement, offer or refund was
acted on.
