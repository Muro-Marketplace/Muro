# Pass 2, chains 4 and 5: the order lifecycle and the refund

Run on 2026-08-31 against the QA order `WS-J6CRQS4XTX2DJRO7` / `WP-B73075`
(£53.49, Giraffe at Sunset, shipped fulfilment) that pass 1 created. Three
sessions held at once: artist, customer, and admin.

This is the path pass 1 called "the single highest-value untested path". It
works, end to end, including the part that actually moves money.

## Chain 5, order lifecycle

Artist marked Processing → Shipped with tracking `QA-TEST-TRACK-123456789`;
customer confirmed delivery. Verified in Postgres:

- `status_history` holds all four transitions with timestamps: `confirmed`
  2026-08-30T21:19, `processing` 14:28:40, `shipped` 14:28:56, `delivered`
  14:30:16.
- `delivered_at` stamped once, on the first entry into delivered.
- `order_events`: `order.processing`, `order.out_for_delivery`,
  `order.delivered`.
- Marking Processing auto-filled the two intermediate stages, "Artist notified"
  and "Awaiting dispatch", which have no separate control.

**Payout release works.** The artist's £50.99 transfer was sitting `pending`
with `payout_after = 2026-09-13T21:19` (the 14-day hold). Confirming delivery
executed it immediately: `stripe_transfer_id = tr_1UAWE1FP3rMcNTgSEFVWttRF`,
status `paid`. The customer is told this in advance, "Confirming releases payment
to the artist."

Emails: `customer_order_processing`, `customer_order_out_for_delivery`,
`customer_order_delivered`, all to the buyer.

## Chain 4, refund

Customer requested a full refund from the order overlay; admin approved it at
`/admin/refunds` behind a browser confirm ("This will refund £53.49 to the buyer
for order WS-J6CRQS4XTX2DJRO7 via Stripe. Continue?").

Everything landed:

| Check | Result |
|---|---|
| `refund_requests` | `13c5d3e3-…` full, £53.49, `approved` |
| Stripe refund | `re_3UAG8jFP3rMcNTgS0s84yXhS` |
| `processed_by` | the admin user id |
| Transfer reversal | `tr_1UAWE1FP3rMcNTgSEFVWttRF` flipped `paid` → **`reversed`** |
| `orders.status` | `refunded` |
| Lifecycle event | `order.refunded` carrying `refund_request_id` |
| Admin audit | `refund_approved_by_admin` with order, request, amount, Stripe refund id, resulting status and requester type |

The reversal is the part that matters: the transfer had already settled, and the
approval reversed it in Stripe rather than leaving the platform out of pocket.

Fan-out, all six notifications correct:

- On request: `admin_alert` to the admin, `artist_refund_requested` to the
  artist, `refund_request` bell to the artist ("Refund request, £53.49").
- On approval: `refund_approved` bell to the buyer, `customer_refund_confirmation`
  email, `artist_refund_notification` email, `refund_approved` bell to the artist
  ("Refund issued, £53.49").

The buyer's dashboard then shows the order as "Refunded" with a green "Refund
approved" badge.

The two pre-existing requests (£149.99 on `WS-H7RgZntN`, £169.90 on
`WS-q0g0tqwD`) were left untouched, as instructed. They sit above and below mine
in the same admin list and were visibly not actioned.

## Defects found

1. **The £0.00 line total reproduces, and is worse than pass 1 recorded.** The
   customer overlay renders "Giraffe at Sunset ×" with no quantity at all,
   followed by "£0.00", above a correct £49.99 subtotal. Pass 1 flagged the price;
   the quantity is missing too. The artist portal renders the same order
   correctly as "Giraffe at Sunset × 1, £49.99".

2. **The artist is told nothing on any order transition.** Row 874 says the
   dispatcher emails both buyer and artist. Only the buyer's three templates
   fired, and no bell went to anyone. In particular the artist is never told
   their £50.99 payout was released.

3. **The refund success copy names the wrong actor.** "Refund request submitted.
   The artist will review your request." The request went to the admin queue at
   `/admin/refunds` and an admin approved it. The artist is copied, but the
   decision is not theirs to make in this flow.

4. **"Refunded" fits none of the customer's filter tabs.** The tabs are All,
   Active, Delivered, Cancelled; a refunded order shows under All only.

5. **The stage tracker disappears entirely on a refunded order.** The overlay
   drops from a six-step tracker to "Close / Refunded / Tracking: …", so the
   buyer loses the delivery history for the order they are disputing.

## Left untested, honestly

- **Partial refunds**, and therefore the *pro-rated* reversal in row 2529. Mine
  was a full refund and the whole transfer was reversed. The partial-reversal
  arithmetic is unverified.
- **Row 2530** (a failed reversal aborting the approval with 502 before the buyer
  is refunded) needs a Stripe failure I cannot induce.
- **Row 2525**'s concurrent-claim 409 needs two simultaneous callers.
- **Row 873** (cancelled orders cancel pending transfers) needs an order I am
  willing to cancel; every cancellable order in production belongs to someone
  else.
- **The £100+ signed-for tracking requirement** (row 1381): this order was
  £53.49, so the rule never engaged. The helper text renders.
