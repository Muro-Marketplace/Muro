# Pass 2, chains 3 and 2: the offer lifecycle and paid-loan billing

Both run on 2026-08-31 between VENUE `test@testingvenue.com` and ARTIST
`finbin1@hotmail.co.uk`, on records created in-session, paid with the Stripe test
card.

## Chain 3, offers

Venue offered £22.00 on *Trees at Sunrise* (asking £29.99) → artist countered
£26.00 → venue accepted → venue paid.

| Record | Value |
|---|---|
| Offer | `off_1788191955308_3aky7j` £22.00, went to `countered` |
| Counter | `off_1788192000823_qyzr33` £26.00, `parent_offer_id` set, now `paid` |
| Order | `OFR-5A2LJH2CJ7KPVNMO`, `source: purchase_offer`, £26.00 |
| Split | artist £24.70, platform fee £1.30 (5%) |
| Transfer | £24.70 `pending`, `payout_after` 2026-09-14 (14-day hold) |
| Stripe | `cs_test_a1ysCpFDL6043U27kR5oGX6vxPch…` |

**The 60% floor is real.** On a £29.99 asking price the modal prefilled £25 (85%),
set `min="18"` on the input, and said "Offers can be up to 40% below the listed
price (minimum £18.00)". £18.00 is 60% of £29.99.

**The self-counter block is real.** After countering, the artist's own row showed
"Awaiting response" with only a **Withdraw** button; Accept, Counter and Decline
were all gone. The venue's matching row carried all three.

Fan-out, all correct: `offer_received` bell and email to the artist,
`offer_counter` bell and email to the venue, `offer_accepted` bell carrying a
`?pay=off_…` deep link, then `artist_order_received`, `customer_order_placed` and
a `sale` bell reading "Trees at Sunrise, £24.70 to you".

### Defects

1. **An accepted offer produces an unfulfillable order.** No delivery address is
   collected anywhere in the flow. `orders.shipping` came back
   `{"fullName":"","addressLine1":"","city":"","postcode":"", "notes":"Accepted
   offer off_… . No delivery address collected at checkout."}` with
   `fulfilment_method: "ship"`. The artist portal shows **"SHIP TO: ,"** and still
   offers Mark as Processing then Mark as Shipped. The system knows and says so in
   a note the artist never sees.

2. **The offer order has no line detail.** `orders.items` for an offer is
   `{offer_id, work_ids, collection_id}` with no title, price or image, so the
   artist portal renders **"Artwork × 1, £0.00"** and the list row shows
   "31 Aug · " with no work title at all. The email gets it right ("Trees at
   Sunrise"), so the data is resolvable; the portal just doesn't.

3. **Stripe shows the buyer nothing about what they are buying.** The hosted page
   read "Wallplace offer · off_1788192000823_qyzr33 / Accepted offer for 1 work".

4. **A below-floor offer fails silently.** Forcing £5 and pressing Send offer
   produced no network request, no error, no message. The floor holds; the user is
   not told why nothing happened. Same pattern as the placement counter dialog and
   the past-dated install date.

5. **No success confirmation after sending an offer.** The modal closes and the
   page returns to normal with nothing said.

6. **The artist's counter has no floor at all** (`min="0.01"`), against the
   venue's 60%. Defensible, but asymmetric and undocumented.

7. **`expires_at` is NULL** on both offers. The column exists; nothing sets it, so
   offers never expire.

8. **PLN again.** The offer checkout opened at PLN 136.69 with a 4% conversion
   fee for a UK venue buying from a UK artist. The collect checkout earlier opened
   at CA$. Stripe adaptive pricing is following the browser locale on every
   payment surface.

## Chain 2, paid-loan billing

Venue requested a £12/month paid loan on *Sand Dunes at Dusk* with QR off →
artist accepted → venue set up billing with the test card → venue cancelled.

Setup works, cleanly:

- `paid_loan_setup_payment` email to the venue, "Set up the monthly payment for
  your placement".
- `/placements/[id]/payment` → Stripe subscription checkout "Subscribe to Monthly
  loan, Sand Dunes at Dusk, billed monthly".
- `placements.stripe_subscription_id = sub_1UAXhSFP3rMcNTgSp3qrmrQt`,
  `subscription_status = active`, period 31 Aug → 30 Sep.
- `placement_recurring_billings` row with payer, payee, `stripe_customer_id`,
  `monthly_amount_pence: 1200`.
- `paid_loan_started` bell to the artist: "Monthly loan payments started,
  £12.00/mo. The venue's card is set up. Your first payout follows the first paid
  invoice."

**Both chip states are correct and role-specific.** Before setup the artist saw
"Awaiting venue's monthly payment setup, the venue hasn't set up the monthly card
yet"; the venue saw "Set up monthly billing for this placement (£12/mo)". After
setup the artist saw "The venue's payment is set up. Next payment on 30
September" and the venue "Next payment on 30 September. Manage it any time from
this page."

### Defects

1. **After cancelling, the venue is still told it will be charged.** The placement
   reads **Cancelled** and, on the same page, the billing chip still reads
   "Monthly payment active, £12.00/mo. Next payment on 30 September. Manage it any
   time from this page." `placement_recurring_billings.status` is still `active`
   and `placements.subscription_status` is still `active`. Whether Stripe was told
   to cancel at period end cannot be read from the database; what is certain is
   that nothing local records it and the venue is shown the opposite.

2. **No email or bell confirms billing has ended.** The artist got
   `placement_cancelled`; neither party got anything about the £12/month.

3. **"Manage it any time from this page" is a dead promise.** There is no manage,
   change-card or cancel-billing control on the placement page, in either state.
   Cancelling the whole placement is the only lever.

4. **The cancel confirmation never mentions money.** It reads "Cancel this
   placement? The other party will see it as cancelled." on a placement carrying a
   live £12/month subscription.

5. **`cancelled_at` and `cancelled_by_user_id` are both NULL** on the cancelled
   placement, so there is no record of who cancelled it or when.

6. **`?payment=setup-complete` renders no confirmation.** The redirect lands on
   the placements list and nothing acknowledges the card was set up.

## A third throttled email

`artist_new_placement_invitation` for this placement was `skipped_throttled` at
16:03:18, so the artist was never emailed that a new placement had been
requested. That is the third suppressed artist email today, after
`placement_ended` and `artist_blog_rejected`. Across all 388 email events in
production only these three were ever throttled, and all three were consequential
transactional messages to the same artist.
