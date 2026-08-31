# Area B production run log — browse and buy

Site: https://www.wallplace.co.uk. Date: 2026-08-30.
Roles used: the QA-TEST customer account created in area A
(`fcoles2598+qatestcustomer@gmail.com`), plus the artist account where a
seller view was needed. Supabase MCP (project `uwkuhygwvasdzwsusiym`, SELECT
only) used throughout to prove writes landed.

A note on method: the site's custom dropdowns and buttons respond to
**`mousedown`**, not `click`. A synthetic `.click()` alone does nothing, which
briefly looked like a broken size selector. Every interaction below fires
pointerdown/mousedown/mouseup/click, and the one genuine keyboard finding is
recorded as such.

---

## /browse

| Check | Result |
|---|---|
| Default view | Galleries, 260 works, sort "Featured", style and theme selects present |
| View switching | `?view=portfolios` (41 artists) and `?view=collections` (1 collection) both sync to the URL |
| Search | `?q=zzzzqqqnomatch` -> "0 artists" |
| Postcode | typing `TW12 2TH` geocodes via api.postcodes.io, header becomes "Within 25 mi", 260 -> 194 works, URL gains `loc_lat/loc_lng/loc_label`, localStorage gains `wallplace-postcode` and `wallplace-coords` |
| Distance slider | 5 mi -> 32 works (`maxDistance=5`); right edge -> "Within any distance", 260 works (`maxDistance=9999`) |
| "Use my current location" | present and wired: clicking it shows "Locating…" |

### Flags re-tested

- **Portfolios filter-count badge over-counts.** FIXED. With no filters no badge
  renders; ticking "Originals available" renders
  `<span data-testid="artist-filter-count">1</span>` and the grid drops
  41 -> 36 artists. Not "2".
- **Portfolios empty state misleads.** FIXED. With no location and an
  unmatchable search the state is "No artists match these filters. / Clear
  filters", not the "Enter your postcode in the filter panel" branch.
- **Gallery "Clear all" silently disables distance filtering.** FIXED. After
  clicking Clear all with a postcode set, the count stayed at 194, the sidebar
  still read "Within 25 mi", and moving the slider afterwards still filtered
  (5 mi -> 32 works). Location filtering survives the clear.
- **Collections "Clear all" renders permanently.** FLAG STANDS. Loaded
  `/browse?view=collections` with `wallplace-postcode` and `wallplace-coords`
  removed and no filter params: the location block reads "Enter your postcode
  to filter by distance" and "Clear all" is still rendered.

## Cart and saved

- CartIndicator is **hidden at zero items** and appears once the cart is
  non-empty, as `<a href="/checkout" aria-label="Shopping cart: 1 item">`.
  (My area A note that "no cart control renders" was with an empty cart; that
  is the designed behaviour, and the area A row is corrected accordingly.)
- Cart is keyed per identity: `wallplace-cart:guest`,
  `wallplace-cart:u:08f9481e-…` (artist) and `wallplace-cart:u:4ea8c2e2-…`
  (customer) coexist in localStorage, and signing out did not move the user
  cart into the guest key.
- Save heart: `POST /api/saved {"itemType":"work","itemId":"fin-coles-1777209991699-4"}`
  -> 200 `{"success":true}`, button title flips Save -> "Remove from saved",
  toast mentions favourites.

## Artwork page

`/browse/fin-coles/giraffe-at-sunset`:

- Size dropdown lists all five tiers with per-size prices
  (£29.99 / £49.99 / £69.99 / £94.99 / £149.99), none disabled.
- Selecting 8×12" updates the header line AND the button to "BUY NOW, £49.99".
- "Currently placed at The Mayfield" chip renders; "N views this week" renders.
- Seller-information block (CCR 2013) present with the artist link,
  hello@wallplace.co.uk, /returns and /terms.
- **Keyboard defect (not an inventory row).** The size control is
  `role="combobox"` over a `role="listbox"`, but ArrowDown + Enter does not
  change the selection — the component only listens on `mousedown`. It is
  unusable by keyboard.
- Image protection on `/browse/fin-coles/mt-fitz-roy`: served through the Next
  optimiser at `w=750&q=75` (natural 700×466), `draggable="false"`,
  `user-select: none`, `pointer-events: none`, and a dispatched `contextmenu`
  is preventDefault'd.

### "Message the artist" for a signed-in customer

The flagged `/customer-portal/messages` dead end is gone, but the replacement
does not work. Instrumenting `history.pushState` shows the click pushes
`/browse/fin-coles?enquiry=1&work=fin-coles-1777209991699-4` and then something
immediately pushes back to `/browse/fin-coles/sand-dunes`. Net effect: the page
is unchanged, no modal opens, nothing is sent.

Navigating to that URL directly DOES open the enquiry modal, and it works.

### Enquiry modal (the flagged 401/403)

FIXED. Sending from the modal as a signed-in customer:
`POST /api/enquiry` -> 200 `{"success":true}`, toast "Sent", modal closes. It no
longer posts to `/api/messages`. The inbox row landed
(`messages` 80a2f4d0-…, `sender_type=anonymous`, `recipient_slug=fin-coles`,
content prefixed "Re: Sand Dunes").

### `/api/enquiry` discards the sender's name

`enquiries.sender_name` is stored as the **email's local part**, not the name
the sender typed. Reproduced four ways:

| Submitted name | Email | Stored `sender_name` |
|---|---|---|
| QA-TEST Customer (lightbox modal) | fcoles2598+qatestcustomer@ | `fcoles2598+qatestcustomer` |
| QA-TEST Anon Enquiry (curl) | fcoles2598+qaenqanon@ | `fcoles2598+qaenqanon` |
| QA-TEST NoWorkTitle (curl, no workTitle) | fcoles2598+qaenqnowork@ | `fcoles2598+qaenqnowork` |
| both `name` AND `senderName` sent (curl) | fcoles2598+qaenqboth@ | `fcoles2598+qaenqboth` |

The one exception is enquiry id 12, filed from `/contact?artist=fin-coles`
during area A, which kept "QA-TEST-Enquiry". I could not reproduce that
behaviour from any other call shape.

## Collection detail

`/browse/collections/fin-coles-collection-1776461334527`:

- **Work links use title slugs** (`/browse/fin-coles/sand-dunes`), not ids.
  The flagged "every Open button 404s" is FIXED, and the targets resolve 200.
- **Arrangement chips read "Paid loan / Revenue share · 20% / Direct purchase"**
  — the canonical labels. The flagged stale "Display" label is FIXED.
- **"Placed at <venue>" chip never renders**, even though Sand Dunes in this
  collection IS placed at The Green Room. FLAG STANDS.
- **Customer placement CTA is a dead end.** FLAG STANDS. The signed-in customer
  sees "Switch to a venue account to request" linking
  `/signup?next=%2Fvenue-portal%2Fplacements%3F…`. Clicking it lands on
  `/customer-portal` (RedirectIfLoggedIn bounces the signed-in user), so nothing
  is explained and nothing is requested.
- Sidebar says "All 8 works" while the grid and the per-work list show 6.

## The purchase — real Stripe test payment

Line built by Buy Now:
`{"type":"work","workId":"fin-coles-1777211766207-0","size":"8×12\" (20×30 cm)","price":49.99,"quantity":1,"quantityAvailable":null,"shippingPrice":3.5,"framed":false}`

Checkout page: "Ship to me" only (this artist has no pickup — correct
fail-closed), country locked to GB with "This artist ships within the UK only.",
subtotal £49.99 + shipping £3.50 = **£53.49**, matching the artwork page's quote.

- Submitting empty produced six field-level errors and **no POST**.
- Postcode `NOTAPOSTCODE` on blur produced "Postcode doesn't look right for GB.
  Double-check it."
- Submit redirected to `checkout.stripe.com/c/pay/cs_test_…` — test mode.

**On the Stripe page, two things a buyer would see:**

1. The business is called **"Wallspace sandbox"** — heading, "Pay Wallspace
   sandbox", "Back to Wallspace sandbox" and the Link copy all use the old name.
2. The currency defaulted to **PLN 282.25** with "1 GBP = 5.2767 PLN (includes
   4% conversion fee)" and the country dropdown preset to Poland — Stripe
   adaptive pricing, on an artist the site has just told the buyer ships to the
   UK only. Switching to "GB £53.49" restored £49.99 + £3.50.

Paid with 4242 4242 4242 4242, 12/34, CVC 123. Stripe's "I am an AI agent
acting on behalf of someone else" checkbox was ticked.

**Result, verified in production:**

```
orders.id                    WS-J6CRQS4XTX2DJRO7
orders.order_number          WP-B73075
buyer_email                  fcoles2598+qatestcustomer@gmail.com
buyer_user_id                NULL          <-- buyer was signed in
status                       confirmed
subtotal 49.99  shipping_cost 3.5  total 53.49
artist_slug fin-coles  platform_fee_percent 5  platform_fee 2.50
artist_revenue 50.99   venue_slug NULL  venue_revenue 0
fulfilment_method ship  source direct
stripe_payment_intent_id     pi_3UAG8jFP3rMcNTgS0rM56UVd
```

Arithmetic checks out: 5% of 49.99 = 2.50; 49.99 − 2.50 + 3.50 = 50.99. Venue
share correctly zero (no QR attribution).

Downstream, all present:
- `order_events`: one `order.placed` at 21:19:48.
- `notifications`: kind `sale`, "Your artwork sold",
  "Giraffe at Sunset, £50.99 to you (WS-J6CRQS4XTX2DJRO7)", link
  `/artist-portal/orders`, to the artist's user id.
- Customer portal shows TOTAL ORDERS 1, TOTAL SPENT £53.49, order WP-B73075.

**`buyer_user_id` is NULL despite the buyer being signed in.** The portal still
finds the order because it matches on email, but the order is not linked to the
account.

## Checkout confirmation — all three flags fixed

| Case | Behaviour |
|---|---|
| real `session_id` | "Order Confirmed / Payment of £53.49 received", correct line items, cart cleared |
| **no `session_id`** | "No order found. It looks like you haven't placed an order yet." — and a cart item planted beforehand **survived**, so the unconditional wipe is gone |
| **bogus `session_id`** | "Checking your order / We couldn't confirm your payment just now. If your payment completed, you'll receive a confirmation email shortly…" — properly hedged, no false receipt, cart again preserved |
| "Featured collections" link | now `/browse?view=collections`, not the 404ing `/browse/collections` |

## Order tracking

`/orders/WS-J6CRQS4XTX2DJRO7`:

- Five-step stepper with Placed lit and timestamped.
- **"Marked as arrived by you, the buyer."** — the flagged carrier
  misattribution is FIXED.
- **"Report a problem"** now opens an inline dispute form (Damaged in transit /
  Item not received / Not as described / Other, a description box, "Open a
  case") with the copy "We hold the payout while the case is open." The flagged
  `/contact?order=` bypass is FIXED. I cancelled rather than open a real case.

`/orders/track`:

- Wrong email + right order id -> `POST /api/orders/track` 404
  `{"error":"No matching order"}`, identical to a not-found. Anti-enumeration holds.
- Correct pair -> 200 with the order. Updates timeline renders
  "Order placed / 30 August 2026", so the flagged `h.at` vs `timestamp`
  mismatch is FIXED.
- **The item line total renders as £0.00.** The API returns
  `lineTotal: {"amount":4999,"currency":"GBP"}` and the page prints
  "Giraffe at Sunset £0.00" while the order total below it is correct at £53.49.

## `/api/checkout` trust boundary — probed with forged payloads

Three sessions minted and read back through `GET /api/checkout/session?id=…`.
All were left `unpaid` and abandoned; no money moved and no order was created.

| Forged input | Session total | Verdict |
|---|---|---|
| `price: 0.01` | **£53.49**, item priced £49.99 + shipping £3.50 | server re-prices from the DB, client price ignored — holds |
| `shippingPrice: 0` | **£49.99**, **no shipping line at all** | **exploitable: £3.50 of shipping obtained free** |
| `quantity: 5` of a work with `quantity_available: 1` | 409 `{"error":"Only 1 of \"Upon Reflection\" is available.","code":"insufficient_stock","available":1}` | FIXED, server enforces stock |
| `quantity: 99` | 400 "Cart items and shipping required" | schema caps quantity |

So of the two flagged trust-boundary gaps, the stock one is closed and the
shipping one is live and reproducible.

---

## Created during area B (cleanup list)

| Thing | Identifier |
|---|---|
| **Real paid order** | `orders` WS-J6CRQS4XTX2DJRO7 / WP-B73075, £53.49, Stripe test `pi_3UAG8jFP3rMcNTgS0rM56UVd` |
| `order_events` | one `order.placed` row for that order |
| `notifications` | one `sale` row to the artist |
| `enquiries` | ids 13, 14, 15, 16 (QA-TEST enquiries to fin-coles) |
| `messages` | 80a2f4d0-6954-4954-a581-b9052515d83b (inbox row for the id-13 enquiry) |
| `saved` | one saved work for the QA-TEST customer (kept deliberately, area C needs a non-empty saved list) |
| Stripe | two abandoned unpaid test sessions (`cs_test_a1oco1…`, `cs_test_b1wMyH…`) |

`analytics_events` also gained artwork/profile view rows as a side effect of
browsing.

---

# Late findings

## The lightbox frame defect, proven side by side

Both surfaces for the SAME work, `mark-smith / The Random Time`, at 8×10":

| Surface | Frame options | Default |
|---|---|---|
| Lightbox (`/browse/mark-smith?work=the-random-time`) | "Black oak frame, +£80", "White wooden frame, +£160" | **index 0, Black oak** |
| Artwork page (`/browse/mark-smith/the-random-time`) | **"No frame"**, "Black oak frame +£103", "White wooden frame +£206" | No frame |

So the flag holds twice over: the lightbox has no unframed option and forces a
paid frame, **and** the two surfaces quote different uplifts for the same frame
on the same size (the DB stores flat 80/160; the artwork page scales by
perimeter to 103/206).

Selecting Black oak on the artwork page set the button to "Buy Now, £183"
(80 + 103) and the cart line to `price: 183`, `framed: true`,
`frameLabel: "Black oak frame"`, `size: "8×10\" (20×25 cm) + Black oak frame"`.
What Stripe would actually be charged could not be established, because this
artist is blocked at the Connect pre-flight (below).

## Tier order is not size order — evidence for the "largest tier" flag

`The Random Time` stores its five tiers as:

```
8×10"  (20×25 cm)  £80
16×20" (41×51 cm)  £160
11×14" (28×36 cm)  £250
6×8"   (15×20 cm)  £400
12×16" (30×41 cm)  £500
```

The LAST tier is 12×16", which is not the largest — 16×20" is. Anything taking
`tiers[tiers.length - 1]` as "the largest" picks the wrong size on this work.

## Stripe Connect pre-flight fires, but late and with misleading copy

`POST /api/checkout` with a mark-smith line returns
`422 {"error":"mark-smith isn't ready to take orders yet. Try again in a few minutes.","blocked":["mark-smith"]}`,
and the checkout page surfaces that exact sentence in a banner rather than
failing silently — so the guard and the error surfacing both work.

Two things worth the owner's attention: the buyer only meets this after
choosing a size and frame and filling in the entire delivery form, and "try
again in a few minutes" implies a transient fault when the artist simply has no
payout-capable Connect account. `mark-smith` is listed and buyable-looking
throughout the marketplace.

## Multi-artist checkout arithmetic

Cart of Sand Dunes (£29.99, Fin Coles) + The Random Time framed (£183, Mark
Smith): total **£219.99** = 29.99 + 183 + 3.50 + 3.50, with a per-artist
shipping breakdown and the helper correctly pluralised to "These artists ship
within the UK only."

## Dispute opened on the QA order

`POST /api/disputes` from the buyer UI returned
`201 {"success":true,"disputeId":"b8bf8a4e-a110-4c45-acf8-96070630b217"}`.
Production now holds:

```
disputes  b8bf8a4e-a110-4c45-acf8-96070630b217
          order_id WS-J6CRQS4XTX2DJRO7, status open,
          category "Damaged in transit", opener_user_id 4ea8c2e2-… (the QA customer)
order_events  order.placed 21:19:48, order.disputed 21:33:28
```

The stepper then reads "Problem reported. We've opened a case and emailed both
you and the artist. Reply to that email within 3 business days… We hold the
payout while the case is open."

Opened deliberately: the order, the buyer and the selling artist are all
accounts belonging to this pass, so it is a self-created record. It is listed
for cleanup and gives area G a live dispute to inspect.

Note: the category recorded is "Damaged in transit" (the default) rather than
"Not as described", because the synthetic click on the reason button did not
register. That is a test artefact, not a product finding.

## QR landing

`/api/qr/fin-coles?t=Giraffe at Sunset&vs=testing-venue&size=8×12" (20×30 cm)`
redirects with `ref=qr`, `venue=testing-venue`, a signed `va=` token,
`venueName=Testing+Venue`, `work=giraffe-at-sunset` and the size. The lightbox
opens on the right work with the right tier preselected, and
`localStorage['wallplace:qr-context']` is written with the slug, name, source
and token.

**No "Seen in <venue>" banner renders.** Searched the whole page body; the only
venue mention is an unrelated "Placed at Testing Venue" chip on a portfolio tile.

## Venue space profile as a customer

`/venues/testing-venue`: SSR `<title>` stays "Venue space · Wallplace |
Wallplace" and the client sets "Testing Venue · Wallplace" once the gated fetch
lands, so the paywalled name never reaches SSR. The unlocked body renders the
hero, name, "CAFÉ / COFFEE SHOP · LONDON", an available-walls card ("Photo Rail
Wall, 340 × 250 cm"), styles, themes, canonical arrangement chips, wall space,
footfall and location. No artwork-requests list renders — that feature is parked.

## Additions to the cleanup list

| Thing | Identifier |
|---|---|
| `disputes` | b8bf8a4e-a110-4c45-acf8-96070630b217 (open, on WS-J6CRQS4XTX2DJRO7) |
| `order_events` | `order.disputed` on that order |
| Stripe | a third abandoned unpaid test session from the framed-line probe |
