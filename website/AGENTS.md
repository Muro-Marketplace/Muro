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
