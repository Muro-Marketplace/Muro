# Production pass: what was fixed, and what is left

Branch `claude/mvp-inventory-production-verify-9f22cd`. Companion to
`2026-08-31-production-pass-remediation.md`, which is the full plan; this
records what has actually landed.

## Fixed on this branch

| # | Defect | Where |
|---|--------|-------|
| A1.1 | `/api/apply` answered 500 with the optional fields blank. Two NOT NULL columns received nothing: `primary_medium` as an explicit null, `artist_statement` as undefined, which JSON drops so the column never reached the INSERT. | `lib/artist-application-row.ts` |
| A1.2 | A cart posted with `shippingPrice: 0` minted a live Stripe session £3.50 short. Shipping price, dimensions and the price feeding the signature threshold all came from the request body. | `lib/checkout-shipping-source.ts`, `api/checkout` |
| A1.3 | Unsubscribe links carried the recipient's raw user id and nothing else, so the bearer was the id rather than the link. An unauthenticated GET with a real id turned that account's newsletter off. | `lib/unsubscribe-token.ts` |
| A1.4 | `DELETE /api/customer-addresses/[id]` answered 200 for an id the caller does not own. Nothing of anyone else's was ever deleted, but a caller could not tell a real deletion from a no-op. | `api/customer-addresses/[id]` |
| A2.1 | The cooling-off acknowledgement the application form requires of consumer applicants was stripped by zod and stored nowhere. | migration 126, `lib/artist-application-row.ts` |
| A2.3 | `/api/contact` minted a reference, emailed it, and returned only `{ success }`, so the page could not show it. | `api/contact`, `ContactForm` |
| A4.1 | The customer portal and the public tracking page computed line totals as `price × qty`. The enriched shape the Stripe webhook writes has neither field, so 11 of 17 orders rendered £0.00 to the buyer. | `lib/order-items.ts` |
| A4.2 | Both portals read "N% to artist" against the venue's share, showing an artist their own giveaway as their earnings. | `lib/revenue-share-labels.ts` |
| A4.6 | Every page advertised `og:image` at `/og-image.png`, which was never added. An explicit metadata entry was overriding the generated card. | `app/layout.tsx`, `app/twitter-image.tsx` |
| A4.7 | Five money displays used `toLocaleString()`, so £1,127.20 rendered as "£1,127.2". | ratchet in `tests/integration` |
| A L447/458 | All three sign-up pages pushed `/check-your-inbox` regardless of whether a session came back. | `lib/signup-destination.ts` |
| B L730 | The lightbox URL sync overwrote the enquiry URL 1.9s after arrival, discarding `?enquiry=1`. | `ArtistProfileClient` |
| C L1124 | An enquiry reached the artist's inbox under the email's local part rather than the name the form collected. | `api/enquiry` |
| — | `orders.buyer_user_id` was written by nothing at all: 18 orders, 0 with an id. | `api/checkout`, Stripe webhook |

About 100 new tests, taking the suite to 3,490. Every fix above was checked against the original
defect: the tests fail without it.

## Needs the owner, not code

1. **Set `ORDER_TOKEN_SECRET`.** Unsubscribe-link signing stands down entirely
   without it, because enforcing a signature we could not produce would turn
   the unsubscribe link in every email into a dead end. Setting it is what
   activates A1.3.
2. **Set `SUPABASE_WEBHOOK_SECRET` and `RESEND_WEBHOOK_SECRET`.**
   `/api/health/email` reports `healthy: false` until then.
3. **Turnstile keys.** Turnstile is off entirely in production.
4. **Stripe**: the checkout page still says "Wallspace sandbox", and adaptive
   pricing defaults overseas buyers to PLN with a 4% fee.
5. **Backfill `orders.buyer_user_id`** for the 15 existing orders whose email
   matches an account. SQL is in the commit message; inert until something
   reads the column.
6. **Decide the membership cancellation position.** The application form's
   tick box asserts a 14-day right to cancel. The terms have no membership
   cancellation clause at all, and the Artist Agreement says the opposite:
   30 days' written notice. The only cooling-off text on the site covers
   buyers cancelling artwork purchases, which is a different right held by a
   different person. This is a legal question, not a code one, so nothing was
   invented to paper over it.
7. **Decide email confirmation on or off.** The routing is now correct either
   way, so this is no longer blocking.
8. **Deploy.** Production is still running the pre-audit build, so none of the
   above reaches users until it ships.

## Known and deliberately not done

- The enquiry modal takes about 1.7 seconds to appear. Long enough that the
  control reads as unresponsive. Worth its own look.
- The one-click unsubscribe POST still honours unsigned links, because
  pre-signing mail is still in inboxes and RFC 8058 one-click is the
  recipient's own instruction. It can require a signature once that mail has
  aged out.
- Collection bundles still take shipping from the cart, having no
  `artist_works` row to read. Pinned by a test so changing it is deliberate.
