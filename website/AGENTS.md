<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes, APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## General task execution rule

Before starting work on any item in a task list, check whether it is already
implemented in the codebase. If the desired behaviour, copy, layout, or
artefact already exists and matches the request, skip the task and mark it as
already complete rather than re-running, duplicating, or adding a parallel
implementation. Run the verification briefly (read the file, grep for the
relevant identifier, run the relevant page) and only proceed if the change is
genuinely missing or partial.

If a task is partially done, complete only the missing portion. Do not redo
work that is already correct.

## Public-copy writing rules

Public/user-facing copy (anywhere a non-logged-in visitor or a normal user can
read, including titles, descriptions, page bodies, marketing pages, CTAs,
emails to the public) must follow these rules:

- No em dashes (`—`).
- No en dashes (`–`).
- No `&mdash;` / `&ndash;` HTML entities.
- Do not substitute em dashes with double hyphens (`--`) or single hyphens
  intended as dashes. Rewrite the sentence into clean, natural English using
  commas, full stops, "to", "and", etc. instead.
- These rules do NOT apply to code, comments, internal logic, JSON, or
  developer-facing tooling output.

## Data invariants

Derived aggregates are computed in one exported function.

A database column that mirrors a computed value must be either (i) written by a
DB trigger, or (ii) written by a scheduled job listed in `vercel.json`. **A
column written only by a manual admin endpoint is banned.** It is stale by
construction: it holds whatever the last human-triggered refresh computed, which
for a new row is the column default, forever.

That is not hypothetical. `artist_profiles.total_views` and its three siblings
were written only by `POST /api/admin/refresh-stats`, which no cron ever hit, so
an artist's dashboard reported 0 profile views while their own analytics page
reported 9, against 2,295 real view events across 54 artists, with 1 of 14
profile rows carrying a non-zero cached value. See 07 K5.

If performance ever demands a cache, add a materialised view with a defined
refresh, not hand-updated columns.
