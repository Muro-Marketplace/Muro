# Area F production run log — messaging and placement negotiation

Site: https://www.wallplace.co.uk. Date: 2026-08-30/31.
Role: mainly the VENUE (`test@testingvenue.com`), in the shared thread with the
artist (`dm-fin-coles__testing-venue`), plus artist-side and customer-side
observations carried over from areas B, C and D.

BLOCKED dominates this area (161 rows) for one honest reason: nearly every row
describes **acting on a record shared with another party** — accepting or
declining a live placement, countering terms, opening a paid-loan subscription,
creating a bilateral consignment record, blocking or reporting a counterparty,
paying an accepted offer. All of those are real state changes on records I did
not create, so they were left alone under safety rule 3. A further 33 rows are
the parked artwork-requests surface.

---

## The revenue-share label disagrees with itself across four surfaces

This is the sharpest finding in the area. For the *same* placement family, a
`revenue_share_percent` of 24 (which the payout legs treat as the **venue's**
cut) is described four different ways:

| Surface | Wording |
|---|---|
| Venue placements list, expanded row | **"Revenue share: 24% to artist"** |
| In-thread counter card | **"Paid loan + QR: 24% to the venue"** |
| Placement context panel (drawer) | "Revenue share 24% on QR sales" (unattributed) |
| Placement detail page | **"Artist's share of QR-code sales"** |

Two of the four attribute the venue's cut to the artist. The flag is confirmed
and is worse than described, because the in-thread card gets it right, so the
venue can read both statements in one session.

## Messaging

Sending, as the venue into the shared thread:

```
POST /api/messages  -> 200 {"success":true,"conversationId":"dm-fin-coles__testing-venue"}
body: {"conversationId":"dm-fin-coles__testing-venue","senderName":"testing-venue",
       "senderType":"venue","recipientSlug":"fin-coles","content":"QA-TEST- …"}
```

The message appended to the thread with a "now" timestamp.

- **The composer is a TEXTAREA with `maxLength=5000`**, not a single-line
  `<input>`. The flagged "Shift+Enter cannot insert a newline anyway" is fixed —
  multi-line messages are possible.
- The character counter renders "50 characters remaining" at 4,950.
- Sending a single character returns **400 `{"error":"Message too short"}`** and
  the UI surfaces "Message too short". The Send button is not disabled at one
  character, so the guard is server-side only.
- Conversation list groups "ACTIVE PLACEMENTS" (Fin Coles, green Placed chip)
  above "ALL CONVERSATIONS", with a search box and relative times.
- No `[bracket]` enquiry prefix appears in any preview.

### Conversation options modal

The flag icon opens Help / Report / Delete conversation / Block user.
**Help is `<a href="/faqs" target="_blank">`**, so it genuinely opens a new tab
as its copy promises — the flagged same-tab navigation is fixed.

## In-thread placement cards

The thread renders a full negotiation history as structured cards:

```
PLACEMENT REQUEST  Vietnamese Village
                   Paid loan + QR · £51/mo · 51% on QR sales   [Accept][Counter][Decline]
COUNTER OFFER      Paid loan + QR · £41/mo · 51% on QR sales   Awaiting response
COUNTER OFFER      Paid loan + QR · £45/mo · 51% on QR sales   [Accept][Counter][Decline]
PLACEMENT REQUEST  … Requested sizes: • Vietnamese Village: 8×10" (A4) …   ✗ Declined
                   → "Counter with new terms"
COUNTER OFFER      … ✗ Declined  "You declined, the other party can come back
                   with revised terms."
                   → centred pill "Placement Declined"
```

Accept/Counter/Decline appear only on cards where this venue is the responder;
its own counters show "Awaiting response". Canonical arrangement labels
throughout.

## Placement context panel

Opening "Placement Status" from the thread header gives a right-hand drawer:

```
PLACEMENT 1/11 · Received · ACTIVE
Amazon Rainforest From The Air · Paid loan + QR
PROGRESS  Requested 28 Aug · Accepted 28 Aug · Scheduled 28 Aug · Installed 28 Aug
          Live on wall CURRENT 28 Aug · Collected NEXT
TERMS     Type Paid loan + QR · Monthly fee £5 · Revenue share 24% on QR sales
          QR code Enabled
REVENUE   Share 24% · Earned to date £0
          [Mark collected] [Undo live]  Open full placement → /placements/p-1787927775352-gbjb
```

**The flagged missing direction tag renders**: "Received" appears beside the
status chip, so `directionFor` is resolving rather than returning null.
The 1/11 counter confirms the multi-placement navigation.

## Placement detail page

`/placements/p-1779058819433-6zux` renders the breadcrumb, the arrangement badge
("REVENUE SHARE / On loan from artist"), the six-step Progress block with dates
and a "Schedule install" action, EARNED SO FAR, CREATED, a **Negotiation log**
("2 entries": Initial request 18 May · 01:00 from testing-venue, QR enabled;
Accepted 26 May · 22:35 from fin-coles), the collapsed "Loan / consignment
record (not yet created)" with "+ Add record", and "Photos in venue" with
"+ Upload" and "No photos yet."

## Customer messaging

Resolved by removal, as recorded in area C: `/customer-portal/messages` no
longer mounts an inbox. It explains that artists reply by email. So the flagged
"customer sends and gets a 403" cannot occur — the customer path is the enquiry
modal, which posts `/api/enquiry` and succeeds.

The enquiry-modal flags invert accordingly: `/api/enquiry` is now the **primary**
call, not a best-effort secondary, and the send works for guests and customers
rather than erroring. What stands is that the modal has no auth gate on its
trigger and collects a name and email from anyone.

## Paid-loan billing

The venue's live paid-loan placement shows the **green** chip state:
"Monthly payment active, £5.00/mo. Payments are running. Manage them any time
from this page." So a placement with billing running correctly suppresses the
setup prompt. The amber and pre-install variants had no matching placement, and
the payment page was not opened because billing is already active.

---

## Created during area F

| Thing | Identifier |
|---|---|
| `messages` | one QA-TEST message from testing-venue to fin-coles in `dm-fin-coles__testing-venue` |

Nothing else. No placement accepted, declined, countered, cancelled or advanced;
no offer accepted or paid; no consignment record created; no counterparty
reported or blocked.
