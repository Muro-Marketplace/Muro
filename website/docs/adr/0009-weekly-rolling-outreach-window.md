# ADR 0009 - Rolling weekly outreach allowance, counted on an immutable column

**Status:** Accepted
**Date:** 2026-08-28
**Amends:** [ADR 0003](0003-outreach-cap-aggregates.md), which stands on cross-surface aggregation and is superseded only on the window, the limits, and the counting column.

---

## Context

ADR 0003 unified the cap across the three outreach surfaces and left three things unresolved, all of which turned out to matter.

**The window was wrong for how artists work.** The cap was 2 / 5 / 10 per calendar day, UTC midnight to UTC midnight. Artists do outreach in one sitting, an evening or a Sunday afternoon, and a daily cap penalises exactly that: a Core artist who set aside an hour got two approaches out and hit a wall, then had to come back six more times to spend a week's worth. It rewarded nobody, since a spammer is just as happy to return daily.

**The counting column moved on its own.** The cap counted `placements.proposed_by_user_id`, which migration 024 created for bilateral milestone confirmation. Four paths write it: the insert stamps the requester, a counter-offer flips it to whoever countered, a stage advance nulls it, and loading the placements list backfills it from the first request message. So an artist who countered a venue's same-day request silently spent an approach, though the helper's own header says counter-offers are free, and an artist whose request reached a milestone the same day got one back for nothing. The count was right only when nothing else happened that day.

**Nothing told the artist the cap existed.** The pricing comparison said "Message venues: Yes / Yes / Yes". No portal surface showed a number. Worse, the API returned `{ error: "outreach_limit_reached", message: "<the sentence>" }` while the main request form read `data.error` alone, so a capped artist saw the string `outreach_limit_reached` in a red box. The artwork-request response route returned the bare result with no `error` key at all, which read as "Request failed (429)". A paying Core artist could only discover their limit by hitting it, and then only as a code.

---

## Decision

**A rolling 7-day window, not a calendar day or a calendar week.** `getArtistOutreachUsage` counts everything spent in the last 7 days from now. An approach made last Tuesday comes back this Tuesday. A calendar week would have fixed the sitting problem but introduced a Monday-midnight reset to game, and would short-change anyone who joined on a Saturday.

**Limits: Core 3, Premium 6, Pro 15 per rolling week.** Roughly 5x the old daily numbers rather than 7x. Total volume is flat to slightly down; usable capacity rises sharply, because nobody was ever spending the daily allowance seven days running.

**A dedicated immutable column.** Migration 122 adds `placements.created_by_user_id`, stamped once at insert by every path that creates a placement and frozen by a trigger that silently restores the original value on any UPDATE that tries to change it. `proposed_by_user_id` keeps its own job, tracking the current negotiation proposer. The two venue-side inserts (artwork-request fulfil and response accept) stamp the acting venue, not the artist, because the artist's unit was already spent on the response that produced the placement.

**One 429 shape, from one place.** `outreachCapPayload()` builds the body for all three routes: `error` carries the machine code, `message` the sentence. The request form reads `message` first and falls back to `error`, so both the cap and the pending-application gate read correctly.

**The number is visible before it bites, on every surface an artist uses.** `GET /api/outreach/allowance` returns the artist's plan, limit, used, remaining, and when the next approach frees up. One hook and one badge (`src/components/OutreachAllowance.tsx`) read it, so the wording and the number cannot drift apart:

- the request form on each venue card, which also disables send at zero,
- the Spaces filter bar, so the number is there while the artist is choosing who to approach rather than only once they have opened a form,
- the artist portal dashboard, as a card beside the stat tiles,
- the billing page, next to the plan price and the upgrade button, where the plan's headline figure now sits alongside the fee.

The badge renders nothing while the lookup is in flight, for a viewer with no artist profile, on an unlimited plan, or when the read fails, so a broken lookup can never block or mislead. Publicly, the pricing comparison carries a "New venue approaches" row, the plan cards state the number instead of "Message venues directly", and an FAQ entry explains the shared pool and the rolling window.

**The lint rule was widened to match.** `no-ad-hoc-cap` used to require a Supabase count indicator alongside `gte("created_at")`. The helper no longer asks for a count (it needs the timestamps to work out when an approach frees up), so a copied counter of the new shape would have slipped through. The rule now also fires on a `created_at` window combined with an `.eq()` on an actor column. A date-ranged read with neither is still fine.

---

## Consequences

### Positive

- The limit matches how artists actually use the platform, and the plan ladder now differentiates on something they feel weekly rather than only on portfolio slots and fee percentage.
- Counter-offers and milestone confirmations no longer move the count, so the stated rule and the enforced rule agree.
- An artist sees the number before writing a request, and reads a sentence rather than a code if they hit it.

### Negative / limitations

- A venue can receive several approaches from one artist in quick succession, where the daily cap spread them across days. The rolling window makes this self-correcting, since that artist has nothing left for seven days, but the burst is real and accepted.
- An artist who spends the week's allowance on Monday has nothing left if a venue they want appears on Wednesday. The visible counter is what makes that a decision rather than a surprise, which is why it shipped alongside.
- The window is computed per request with no caching, three DB reads per outreach attempt plus one per allowance lookup. Acceptable at current scale; a Redis counter is the escape hatch.
- Migration 122 must be applied before the code deploys. The placements insert has no strip-and-retry fallback by design (row 22), so a missing column is a hard failure rather than a silent partial write.

### No change

- Cross-surface aggregation, the reason ADR 0003 exists, is untouched: placements, first-contact messages and artwork-request responses still share one pool.
- Replies into a thread the artist already opened inside the window are still exempt, via `exemptConversationId`.
- Venues are not capped.
