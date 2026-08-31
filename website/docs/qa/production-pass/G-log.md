# Area G production run log — admin portal

Site: https://www.wallplace.co.uk. Date: 2026-08-31.
Role: the ADMIN login `fcoles2598@gmail.com`.

**129 of the 169 rows are BLOCKED, and the reason is safety rule 3.** The admin
portal is almost entirely destructive actions on records belonging to other
people: accepting or rejecting a real artist's application (which creates an
account and sends an invite or a rejection), approving a real refund (which
moves money through Stripe), suspending an artist, cancelling a curation
subscription, escalating or closing someone else's dispute. Those were left
alone.

Two exceptions were acted on, both records **I created earlier in this pass**,
which rule 3 explicitly permits:

- my QA blog draft, approved
- my QA dispute on my own QA order, resolved

---

## Sidebar — the Refunds flag is fixed

Dashboard, Applications, Artists, Venues, Curation, Feature requests, Feedback,
Blogs, Moderation, **Disputes**, **Refunds**, Financials, Browse Site, Logout.

`/admin` serves `<meta name="robots" content="noindex, nofollow">` and per-page
titles ("Applications | Admin | Wallplace" and so on).

## Dashboard

```
PENDING APPLICATIONS 5   TOTAL APPLICATIONS 17
REGISTERED ARTISTS (DB) 14   LISTED (MARKETPLACE) 41   REGISTERED VENUES 9
PLACEMENTS 87  (Pending 33, Active 38, Completed 4, Cancelled 12)
QR SCANS 25    (7 last 7 days, 7 last 30 days)
GROSS SALES £1,555  (17 orders, £380 last 30 days)
```

Worth noting for the homepage flag in area A: **the admin dashboard
distinguishes REGISTERED ARTISTS (DB) 14 from LISTED (MARKETPLACE) 41** — the
exact distinction the public trust bar elides when it claims "30+ Curated
Artists".

The Recent Pending Applications table lists the four QA-TEST applications filed
in area A.

## Refunds — the flagged missing surface exists

`/admin/refunds`: "Refund requests. 2 awaiting a decision. Approving refunds the
buyer via Stripe." Two pending rows render, one tagged "Raised by artist"
(£149.99 on WS-H7RgZntN, £169.90 on WS-q0g0tqwD). Both flags — "No Refunds item
in the sidebar" and "Admin surface for refund requests: there is none" — are
**fixed**. Neither was approved: they are real refunds on real orders.

## Moderation — the flagged missing message queue exists

`/admin/moderation`: "Everything waiting for a decision: flagged messages,
blogs, feature requests and feedback", with entity filters **All / Messages /
Blogs / Feature requests / Feedback** and status filters Pending / Approved /
Rejected / Edited. My QA-TEST feature request from the public feedback bubble
appears in it, which also closes the loop on the area A finding that the bubble
writes to `moderation_queue` rather than `feature_requests`.

## Blogs — read the full post, then approve

- **"Read the full post"** expands the complete body in place and flips to
  "Hide the full post". The flagged "no way to read the full blog before
  deciding" is fixed — it revealed the closing paragraph the excerpt had cut off.
- Approve fired `PATCH /api/admin/blogs/25cb2c0e-… {"action":"approve"}` -> 200
  `{"status":"approved"}`, the queue emptied, and the post went live.
- **That closed the one row area A had to leave blocked.** The published page's
  body contains one `<h2>`, one `<strong>`, one `<em>`, two `<li>` and a real
  `<a>`, with no literal `## `, `**bold` or `[link](` anywhere in it. Markdown
  renders correctly.
- No author notification appeared in the artist's in-app list for the approval.

## Disputes — the dangerous copy is fixed

- **The Resolve prompt now reads "Outcome (emailed to everyone involved):"**,
  not the flagged "Resolution note (visible internally):". An admin can no
  longer write a private-sounding note that is mailed verbatim to both parties.
- **No literal `GET /api/messages?dispute_id={id}` code block renders** — the
  page has no `<code>` elements at all.
- Resolving my own dispute:
  `PATCH /api/admin/disputes/b8bf8a4e-… {"action":"resolve","resolution":"…"}`
  -> 200 `{"status":"ok"}`, "Dispute resolved.", "No open disputes."

## Financials — two fixed, one stands

| Flag | Live state |
|---|---|
| Top venues identified by raw UUID | **Fixed.** "TOP 10 VENUES BY SPEND / Testing Venue £5/mo". No UUID appears in the page text at all. |
| Failed-payments tile is a misleading measure | **Fixed by disclosure.** The tile now carries "Profiles currently past due, bucketed by when they last changed. Not a count of payment-failure events." |
| "Total subs MRR" duplicates the MRR tile | **Stands.** Both render £100. |
| No reconciliation report | **Stands.** Nothing in the UI surfaces one. |

Header is honest: "Read-only snapshot. v2 will add refund + cancel actions."

## Applications

Tabs Pending / Accepted / Rejected / All. Expanding a row shows PORTFOLIO,
ARTIST STATEMENT, TRADER STATUS, OFFERINGS, ARRANGEMENTS, DELIVERY, VENUE TYPES,
DISCIPLINE and SELECTED PLAN.

- **No sample-work URLs appear**, which corroborates the area A finding that
  `sampleWorkUrls` is discarded at insert because the table has no column for it.
- **The Accept modal still reads "Accept this artist? An invite email will be
  sent."** — the unconditional assertion the flag names. Cancelled without
  accepting.

---

## Created or changed during area G

| Thing | Change |
|---|---|
| `blogs` 25cb2c0e-… | pending_review -> **approved / published** (my own QA post) |
| `disputes` b8bf8a4e-… | open -> **resolved** (my own QA dispute) |

Both are records this pass created. No other admin action was taken: no
application accepted or rejected, no refund approved, no artist or venue
suspended, no curation cancelled, no other dispute touched.
