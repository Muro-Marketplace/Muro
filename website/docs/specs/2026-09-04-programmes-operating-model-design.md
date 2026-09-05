# Wallplace Programmes: how we actually run one

**Date:** 2026-09-04
**Status:** Proposed. No implementation plan yet.
**Scope:** The operating model for the `programme` tier. Nothing here changes the one-off curation tiers, the billing engine or the rent maths.

---

## 1. The problem

A Programme sells a venue twelve months of curated, rotated, installed original art from about £79.99 a month. Three things have to be true for that to be deliverable, and today the system assumes all three rather than establishing any of them:

1. There is art that suits this site.
2. The client likes it.
3. An artist is willing to lend it at the rent we quoted.

The money moves before any of the three is known. A client can be on a twelve-month subscription before seeing a single piece, and before anyone has asked an artist. If artists decline, we have a paying client and bare walls, and nothing in the system notices.

This is a sequencing problem, not a billing problem. The billing is good.

---

## 2. What is already right

Recording this so none of it gets re-solved.

- **Quote-first, never pay-first.** `CURATION_TIERS.programme.payFirst` is `false`, and `api/curation/[id]/checkout` 409s on a row with no quote. There is no self-serve programme checkout and the code comments say there never will be.
- **The economics are locked and coherent.** About £25 per piece per month in, about £10 per piece to the artist, a 40% target rent share (`PROGRAMME_RENT_SHARE_TARGET`) with a 70% mis-quote guard (`PROGRAMME_RENT_SHARE_MAX`) enforced at quote time, and a £5 floor.
- **Rotation is priced, not assumed.** Biannual is standard and included, so a piece hangs about six months; quarterly is an uplift of about £40 a month, set at quote time.
- **Rent accrual and settlement work.** One immutable accrual row per linked active placement per paid invoice, idempotent on `(stripe_invoice_id, placement_id)`, settled quarterly through Stripe Connect, voided if the invoice is refunded, with artist statements and blocked-payout handling.
- **The artist agreement already covers it.** §9A states that rent is funded from the venue fee, accrues per paid invoice, settles quarterly, stops when a piece is rotated off or sells or the programme lapses, and that programme placements are allocated by Wallplace's curators at Wallplace's discretion and are not guaranteed.

The last point matters for what follows: artists have already agreed that Wallplace chooses. What they have not done is agree to be in the pool at all.

---

## 3. The gaps

| # | Gap | Where |
|---|---|---|
| 1 | The shortlist is sent after payment | `STATUS_ORDER` in `admin/curation/page.tsx` |
| 2 | No way to know who will take programme work | `artist_profiles` has no programme flag |
| 3 | No admin route to create a placement | only `api/admin/placements/[id]/*` exists |
| 4 | `link-programme` has no UI caller | it is a curl command today |
| 5 | A sale leaves a gap nobody must fill | artist agreement §9A, and no replacement rule |

**Gap 1 in detail.** The status order is `pending_payment → awaiting_quote → paid → in_progress → shortlist_sent → completed`. That order is correct for a one-off tier: `single_wall` is £49 and `payFirst: true`, so paying before seeing a shortlist is a small, reasonable risk. Programmes inherited the same enum, and there the same order means a twelve-month commitment of roughly £960 a year is signed before the client sees anything.

**Gap 2 in detail.** `artist_profiles` carries `open_to_free_loan`, `open_to_revenue_share` and `open_to_outright_purchase`, so the schema already has exactly the right shape for this and is simply missing the fourth option. Without it there is no query that answers "can this site be filled", which is why quoting currently happens on hope.

**Gap 3 in detail.** `link-programme` links a placement that already exists. Placements are created by the self-serve flow, where a venue requests an artist or an artist proposes to a venue and the other side accepts. A Programme is not that: Wallplace picks both sides. So delivering one today means driving a marketplace flow by hand, as though the venue had browsed and chosen, for every piece.

**Gap 5 in detail.** §9A correctly stops the artist's rent when a piece sells. The venue's fee does not change, so the exposure lands on us, and nothing in the system raises a hand. This is not a defect in §9A, it is a missing operational rule on our side.

Also noted, cosmetic: `TIER_LABELS` in the admin curation list has no `programme` entry, so those rows render the raw string `programme`. One line.

---

## 4. The operating sequence

The change is that two steps move ahead of payment, for the `programme` tier only.

| Step | Who | Gate |
|---|---|---|
| 1. Brief received | Client | `awaiting_quote`, unchanged |
| 2. Feasibility check | Curator | Enough opted-in artists in range and style, or we do not proceed |
| 3. Shortlist built and sent | Curator | About twice as many candidates as slots |
| 4. Client accepts the shortlist | Client | **New gate.** Nothing is quoted until this happens |
| 5. Quote issued | Admin | Against the accepted shortlist, existing quote route and guards |
| 6. Client pays | Client | Subscription starts, existing checkout |
| 7. Placements created, artists accept, install | Curator, artists | Consent captured per piece |
| 8. Rent accrues | System | Unchanged, from the first paid invoice |

Step 4 is the whole point. It converts all three assumptions into established facts before money moves, and it costs only the shortlist rather than the whole programme to find out.

One-off tiers keep the order they have.

---

## 5. The supply pool

Add one boolean to `artist_profiles`, `open_to_programme`, surfaced in the profile editor beside the three flags already there.

Deliberately **not** a per-artist rent field. §9A already establishes that Wallplace allocates and sets rent, the £10 target keeps the share near 40% at every rung of the ladder, and letting artists name their own number turns every quote into a negotiation. Artists opt in or out. If artists push back on the rate, a minimum-rent field is the second version of this, not the first.

Deliberately **not** per-work flags in v1 either. Profile-level opt-in makes the pool queryable, which is what unblocks the feasibility check. Per-work control is a refinement to add when an artist actually asks for it.

What this buys: a query for candidate artists by opt-in, distance to the site, and style or medium. That is the feasibility check in step 2, and the candidate list in step 3.

---

## 6. The admin console

This is the bulk of the work and the thing that makes a Programme repeatable rather than founder-shaped.

On a programme row in `/admin/curation`:

- **Candidates.** Artists filtered by `open_to_programme`, distance to the site, and style or medium.
- **Shortlist.** Assemble from candidates, send, and record the client's acceptance.
- **Placements.** After payment, create them, watch artists accept, and link each to the programme with its rent. `link-programme` already exists and does the linking; it needs a caller.

Plus one new route: **create a placement on the artist's behalf**, landing in `pending` and notifying the artist to accept. This removes the pretence that the venue found the artist while keeping the artist's consent a real, recorded step. §9A gives Wallplace the right to allocate, but that is about which piece, not about conscripting an artist who never opted in, which is what the `open_to_programme` flag now covers.

`link-programme` should also refuse a placement that is not `active` or `pending`, so a site cannot be made to look filled by linking something cancelled.

---

## 7. Under-fill, and what happens when a piece sells

**Under-fill is the health metric.** A programme is under-filled when its active linked placements number fewer than the pieces quoted. That one number catches a sale, a stalled rotation, an artist who declined, and a piece damaged in transit. It belongs on the admin dashboard, and it is the number to look at before selling another site.

**The replacement rule.** When a linked placement flips to `sold`, alert an admin and start a replacement clock, suggested at 14 days. The artist's rent stops, per §9A, which is correct. The venue's fee does not change, so the obligation to refill sits with us and should be visible rather than remembered.

The tension underneath this is real and worth stating plainly: revenue share wants the work to sell, a Programme wants it to stay on the wall. We are choosing to keep both, and the replacement rule is the price of that choice. Making programme pieces display-only would be simpler and would cost the artist their upside, which contradicts the rest of the pitch.

---

## 8. What we are not building

**A matcher.** Distance and style over an opted-in pool, chosen by a person, will beat an algorithm at the current artist count, and the pool has to exist either way. Revisit when the candidate list is too long to read.

**A client-facing shortlist UI.** Step 4 can be an email with images and a reply for now. Build the in-app version once the process has run enough times to know what the client actually needs to see.

**Any change to rent maths, accrual, settlement or the quote guards.** They work.

---

## 9. Phasing

**Phase 1, before another site is sold.** The `open_to_programme` flag, so the pool is visible, and a process rule that no quote goes out before a shortlist is accepted. The process rule needs no code at all and removes most of the risk on its own. Add the missing `programme` tier label while in there.

**Phase 2.** The admin console and the on-behalf placement route. This is what makes the model repeatable.

**Phase 3.** Codify the sequence in the status machine for the `programme` tier, and add the under-fill metric and the replacement clock. Deliberately last, because by then the process rule will have shown what the sequence should actually be, and codifying it earlier risks freezing a guess.

---

## 10. Open questions for the owner

1. **Rotation collection.** A rotation is a collect and a reinstall. Is the collected piece returned to the artist, or does it move to another programme site? The second is materially better economics and needs no new rule, only a decision.
2. **What counts as a site.** The ladder is priced per site. If one address has three walls in two rooms, is that one site or three? It changes every quote.
3. **Founding sites.** Five slots lock a rate for 24 months. Worth confirming that is still the intent now that the sequence is changing, since a locked rate plus an under-filled site is the worst combination available.
4. **Artist rate.** £10 a piece a month is £120 a year for a piece that cannot sell elsewhere while it hangs. Whether that clears the bar for good artists is an empirical question, and the `open_to_programme` opt-in rate is exactly the instrument that answers it.
