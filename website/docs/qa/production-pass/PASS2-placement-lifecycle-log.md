# Pass 2, chain 1: placement lifecycle (and chain 6, collect from venue)

Tested against https://www.wallplace.co.uk on 2026-08-31, driving two placements
I created in-session between VENUE `test@testingvenue.com` (Testing Venue) and
ARTIST `finbin1@hotmail.co.uk` (Fin Coles), plus one collect purchase as CUSTOMER
`fcoles2598+qatestcustomer@gmail.com`.

Two browsers held two sessions at once (artist and venue), so every state change
was read back from the counterparty within seconds. Every write is confirmed in
Postgres, not from a toast.

## Records created

| Record | Id | End state |
|---|---|---|
| Placement A | `p-1788184190657-6iwn` Gyeongbokgung Palace | `sold` |
| Placement B | `p-1788185323045-jmqm` Huaraz, Peru | `completed` |
| Order | `WS-UAKK1KDSC32PDT5R` / `WP-5AD5C3`, £120.00 | `delivered` |
| Stripe | `pi_3UAVqCFP3rMcNTgS0d7P8t98`, test mode | paid |
| Transfer | £114.00 to `acct_1TX8D3FSpfTYHV9I` | `paid` |
| `placement_photos` | `efb6bc94-…` | 1 photo on A |
| `placement_records` | `605d6792-…` on B | approved both sides |
| `placement_reviews` | `fa64089e-…` 4 stars, artist → venue | posted |
| `messages` | 5 rows into `dm-fin-coles__testing-venue` | |

## What the chain proved works

Full negotiation, both directions: venue requests at 25% → artist counters 15% →
venue counters 20% → artist accepts. `revenue_share_percent` and
`proposed_by_user_id` flip correctly at every step and the negotiation log grows
1 → 2 → 3 → 4 entries. The decline branch works too: artist declines, status goes
`declined`, the venue alone gets "Counter with new terms", countering flips it
back to `pending` (10%).

Stage machine: accept → `active` with `accepted_at`, `responded_at` and
`collection_address` all stamped; schedule, install, live and collect each stamp
their column; undo clears it. `Undo collected` drops `completed` back to
`active`.

Inventory hooks: accepting stamped `placed_at_venue` and `current_placement_id`
on the work; completing cleared both and set `available` back to true.

Emails, 11 distinct templates fired live with correct fan-out (see below).

Consignment record: 30-field form saves, snapshots a version, resets approvals,
each party ticks only their own box, "Approved by both parties" lands with both
timestamps in `placement_records`.

Reviews: `/placements/[id]/review` gates on wind-down, takes 1–5 stars plus a
2,000-char comment, writes `placement_reviews`, bells and emails the reviewee,
shows them "THEIR REVIEW OF YOU", and refuses a second review from the same
reviewer.

Collect from venue: setting an in-store price on a live placement puts
"Buy off the wall at Testing Venue, £120.00 (framed)" on the public artwork page
for a guest, and the purchase completes through Stripe test checkout.

## Emails observed (21 events, 11 templates)

`artist_new_placement_invitation`, `placement_counter_offer_received` (both
directions), `venue_placement_accepted_confirmation`,
`placement_venue_declined_artist_request`, `placement_scheduled` (both parties),
`placement_artwork_installed` (both parties), `placement_ended` (both parties),
`placement_consignment_record_created` (both), `placement_contract_countersigned`
(both, each naming the other party), `review_posted_notification`, plus the order
trio `artist_order_received`, `customer_order_placed`, `venue_collection_pending`.

## Defects found

1. **A sold-off-the-wall placement is stranded and pays the venue nothing.**
   After the £120 collect sale, placement A went to `status = 'sold'` and **every
   stage control disappeared** — no "Mark collected", no undo. The progress bar
   sits at 5 of 6 with "Collected" unreachable for both parties, permanently.
   "EARNED SO FAR" still reads £0.00. On the order itself `venue_slug` is NULL,
   `placement_id` is NULL and `venue_revenue` is 0, so the venue hosting the work
   is credited nothing, while `venue_collection_pending` emails it to say the
   piece "has sold and will be collected from you". Whether the 20% share is
   meant to cover an off-the-wall sale or only QR-attributed sales is a product
   question, but the placement link is simply not recorded either way.

2. **A collect order is marked `delivered` the instant it is paid**, and the
   £114.00 artist transfer was created and settled to `paid` 7 seconds after
   checkout, `payout_after` equal to the creation time. No 14-day hold, no
   confirmation that the buyer ever collected the piece.

3. **The size shown to the buyer is a pixel dimension.** The line reads
   "Gyeongbokgung Palace (Off the wall, 2795 × 4192 px)" on the checkout page, on
   the Stripe hosted page, in `orders.items[].size`, and in the subject lines of
   two customer-facing emails (`artist_order_received`,
   `venue_collection_pending`).

4. **A rejected install date fails silently.** Posting a past date returns
   `400 {"error":"Install date can't be in the past."}` — the server is right —
   but the UI renders no error, no toast, no field message. The form just sits
   there with the bad date in it.

5. **The revenue-share label contradicts itself on one screen.** With the counter
   dialog open, the summary tile reads "Artist's share of QR-code sales" while
   the dialog beside it reads "Max 50% to the venue", for the same number. The
   request form ("% to the venue on sales") and the thread message ("15% to the
   venue") agree with the dialog; only the placement summary attributes the
   venue's cut to the artist.

6. **The work picker never asks for a size.** The Request Placement form says
   "Click a work to pick the size you'd like" but clicking only toggles
   selection: no picker, no modal, no select. Both placements stored
   `work_size = NULL`, where placements created before this pass carry
   `Requested sizes:\n• …` in `message` and a populated `work_size`. A regression.

7. **A revenue share above the cap is silently clamped and the submit swallowed.**
   Entering 60 and pressing "Send counter" rewrites the field to 50 and sends no
   request at all — no error, no confirmation. The 50% cap is enforced, but the
   user is not told why nothing happened.

8. **Undoing a collection leaves the work unlinked.** `Undo collected` returns
   the placement to `active` but does not restore `placed_at_venue` or
   `current_placement_id` on the work, so an active placement points at a work
   that no longer knows it is placed.

9. **Installed can precede the scheduled date with no complaint.** B was
   scheduled for 2 September and marked installed on 31 August; the progress bar
   renders "Scheduled 2 Sept / Installed 31 Aug" in that order.

10. **`placement_ended` to the artist was `skipped_throttled`** while the venue's
    copy sent. The artist is never told the placement ended.

11. **The in-store offer panel stays on a collected placement.** "Can buyers
    purchase this piece off the wall?" with a live Save offer button is still
    rendered after the work has been collected and released.

12. **Decline has no confirmation step**, unlike undo (which does).

13. **Editing the consignment record clears the approval you tick in the same
    save.** Ticking "I approve" alongside any field edit results in
    `artist_approved = false`; you must save the edit, then tick and save again.
    The banner then reads "Approvals were cleared, both parties need to tick the
    record again" at the same time as "Artist has approved this record."

14. **The checkout page tells a collecting buyer their order will be shipped**:
    "Your order will be fulfilled directly by the artist. They'll pack and ship
    your artwork within 5 to 7 working days", under a selected "Collect from the
    venue" option. The confirmation page gets it right.

15. **Stripe defaults a UK collect order to Canadian dollars.** The hosted page
    opened at CA$234.54 with "includes 4% conversion fee"; selecting GB as the
    billing country did not change it. The buyer must find the currency switcher.
    Confirms pass 1's finding and extends it: this is a piece being collected in
    person in London.

16. **A signed-in buyer's email is not prefilled** at checkout, though their name
    is. `orders.buyer_user_id` is NULL again, as pass 1 found.

17. **No email on "live on wall".** Every other stage emails both parties.

18. **The template name for a decline is inverted**:
    `placement_venue_declined_artist_request` fired when the *artist* declined the
    *venue's* request. The subject line is correct.

## Notes on method

The site's controls need a dispatched `pointerdown → mousedown → mouseup → click`
sequence; Playwright's own click was unreliable on the counter dialog. React also
re-renders these panels 1–3 seconds after the request settles, so any assertion
taken sooner reads the stale DOM. Both cost time before they were pinned down.
