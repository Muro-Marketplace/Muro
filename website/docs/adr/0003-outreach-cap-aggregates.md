# ADR 0003 - Unified artist daily outreach cap

**Status:** Accepted, amended by [ADR 0009](0009-weekly-rolling-outreach-window.md) (2026-08-28)  
**Date:** 2026-06-15

> **Amendment note.** The cross-surface aggregation described here still stands and is the reason this ADR exists. Three specifics below are out of date: the window is now a rolling 7 days rather than a calendar day, the limits are Core 3 / Premium 6 / Pro 15 per week rather than 2 / 5 / 10 per day, and the placements leg counts `created_by_user_id` (migration 122) rather than `proposed_by_user_id`, which four unrelated code paths rewrite. See ADR 0009.

---

## Context

Wallplace artists are limited to a certain number of new venue contacts per calendar day, tiered by subscription plan (Core: 2, Premium: 5, Pro: 10). The intention is that this limit spans all three surfaces through which an artist can initiate contact with a venue:

1. Placement requests (the `placements` table, `requester_user_id`).
2. First-contact messages (the `messages` table, `sender_id`, de-duplicated by `conversation_id`).
3. Artwork-request responses (the `artwork_request_responses` table, `artist_user_id`).

Before the remediation (findings 1.6 and 1.7), each surface maintained its own independent counter:

- The placements POST route queried `placements` for today's `requester_user_id` count.
- The messages POST route queried `messages` for today's `sender_id` count.
- Artwork-request responses had no counter at all.

Because the counters were siloed, an artist could exhaust the "2 placements today" counter, then send 2 first-contact messages, then respond to 2 artwork requests and effectively contact 6 new venues on a Core plan. The daily limit was unenforced in practice.

---

## Decision

A single async helper, `checkArtistOutreachCap(db, artistUserId, units, opts?)`, located at `src/lib/outreach-cap.ts`, now handles all daily cap checks. It aggregates across all three surfaces in one call using `Promise.all`, applies the plan-based limit once, and returns `{ ok: true }` or `{ ok: false, result: OutreachCapResult }`.

All three POST routes call this helper before writing any row. No route implements its own counter.

The `no-ad-hoc-cap` ESLint rule enforces this at the code level: any call to `.from("placements")` or `.from("messages")` that chains both a `.gte("created_at", ...)` filter and a count indicator (a `.select(...)` with a `count` or `head` property in the options object) is an error outside `src/lib/outreach-cap.ts` and cron analytics routes. This stops a developer inadvertently re-introducing a siloed counter.

Two categories are explicitly exempt from the rule:

- `src/lib/outreach-cap.ts` itself: the canonical home for these queries.
- Routes under `src/app/api/cron/`: these use the same query shape for legitimate digest-email analytics (counting pending placement requests to a venue over the past week, counting unread messages received by an artist, etc.). These are aggregate reporting queries that make no authorisation or enforcement decision.

---

## Consequences

### Positive

- An artist can no longer exceed their plan limit by spreading outreach across surfaces. The effective limit is now the stated one.
- Adding a new outreach surface in future requires only adding one more sub-query inside `checkArtistOutreachCap`; every enforcement point updates automatically.
- The ESLint rule catches regressions at lint time rather than in production.

### Negative / limitations

- The rule detects structural pattern (table + gte(created_at) + count), not semantic intent. A future query that genuinely resembles an outreach counter but is not one must be added to the cron-exempt path or given a `// eslint-disable-next-line wallplace/no-ad-hoc-cap` comment with a clear explanation.
- Outreach count is currently tallied by `Promise.all` inside the helper on each request. There is no caching layer; high-traffic artists will generate three DB reads per outreach attempt. This is acceptable for current scale and can be replaced with a Redis counter if needed.

### No change

- Reply messages (into a conversation the artist already started today) are still exempt via the `exemptConversationId` option, preserving the original `cidLocal` guard behaviour.
- The daily window is UTC midnight to UTC midnight, consistent with the prior implementation.
- Plan keys and limits (`DAILY_LIMITS`) remain in the helper and are the single source of truth.
