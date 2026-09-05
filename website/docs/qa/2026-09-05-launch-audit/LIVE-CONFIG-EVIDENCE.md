# Live configuration evidence, read-only, 2026-09-05

Everything here was read from production through the Supabase, Stripe and Vercel MCPs, the authenticated Vercel CLI (names only), or plain GET requests to the deployed site as a logged-out visitor. Nothing was written. Values of secrets were not read.

## Supabase project `uwkuhygwvasdzwsusiym`

| Check | Result |
|---|---|
| Highest applied migration | `20260904094008 135_artist_open_to_programme`; local highest is 135; next free number is 136 |
| `tests/integration/schema-columns.json` vs `information_schema.columns` | 58 tables, 817 columns, identical set per table (no live-only, no snapshot-only columns) |
| `tests/integration/schema-not-null.json` vs live NOT NULL with no default | 55 tables, identical |
| `auth.users` aggregate | 46 users, 44 confirmed, 2 invited and never confirmed, 0 self-signups awaiting confirmation, 2 users ever sent a recovery email (1 in the last 30 days), 5 users created since 2026-08-31 of which 1 unconfirmed, 9 signed in during the last 30 days, newest user 2026-09-05 01:49 |
| `auth.audit_log_entries` | 0 rows (auth audit logging is not retained or not enabled on this plan), so the Site URL cannot be inferred from recovery events |
| Auth Site URL and redirect allow-list | **Could not be read.** The MCP has no auth-config tool, `SUPABASE_ACCESS_TOKEN` is absent locally, and the public `/auth/v1/settings` endpoint rejects the only anon key on this machine as invalid. The 2026-08-31 checklist recorded `http://localhost:3000`. Treated as still wrong until the owner confirms otherwise. See LA-001. |

## Stripe live account `acct_1TKnAGFKpqBQjvlK` ("Wallspace")

| Check | Result |
|---|---|
| `GET /v1/webhook_endpoints` (live) | empty list. No live webhook endpoint exists. The webhook route handles the events listed in FINDINGS.md section E; none will arrive in live mode until the owner creates the endpoint at `https://www.wallplace.co.uk/api/webhooks/stripe`. |

## Vercel project `wallspace` (`prj_KfjFrmP9uv8HKtBlhfLFZDBd1HYC`, team `team_iZwLJ6I6FDozdGsDv40uiRbr`, hobby plan)

| Check | Result |
|---|---|
| Latest production deployment | `dpl_EK4znxjdkGT2uXG2KotHa3tSwK3D`, READY, `main` at `b1aef1b4` (PR #87 merge), built 2026-09-04, aliases `www.wallplace.co.uk`, `wallplace.co.uk`, three vercel.app hosts. Region `iad1`. Node 24.x. |
| Production env var names (25) | `vercel-env-names.txt`. Read by code but absent: `ADMIN_EMAILS` (only `ADMIN_EMAIL` is set), `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `RESEND_WEBHOOK_SECRET`, `SUPABASE_WEBHOOK_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `QR_ATTRIBUTION_ENFORCE`, `STRIPE_PAID_LOAN_PRODUCT_ID`, `NEXT_PUBLIC_FLAG_GATING_V1`, `NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE`, `NEXT_PUBLIC_FLAG_SEED_CATALOG`, `NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1`, `PRICE_CORE_PENCE`, `PRICE_PREMIUM_PENCE`, `PRICE_PRO_PENCE`, `VISUALIZER_LIMIT_*` (4), `EMAIL_DRY_RUN`, `EMAIL_DRY_RUN_FORCE`. Set but unread by code: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_CURATION_MONTHLY`, `STRIPE_PRICE_CURATION_QUARTERLY`. No `DEMO_*` variables remain. |
| Runtime error clusters, 7 days | `vercel-runtime-errors-7d.txt`: Turnstile secret unset (7, ongoing), `artist_applications.primary_medium` NOT NULL violation on `/api/apply` (4, last 2026-08-30), `wall_renders_cost_units_check` (3, fixed by `2eac9c29`), `/api/messages/unread` 300 s timeout (2, 2026-08-31 only), a QA probe against `/api/checkout/session`, `PATCH /api/customer-addresses/[id]` "Cannot coerce the result to a single JSON object" (1), duplicate `artist_profiles.user_id` on `/api/admin/applications/[id]` (1, 2026-09-03). |

## Deployed site, logged out

| URL | Result |
|---|---|
| `https://wallplace.co.uk/` | 307 to `https://www.wallplace.co.uk/` |
| `/`, `/robots.txt`, `/sitemap.xml`, `/browse`, `/pricing`, `/programmes`, `/login`, `/reset-password`, `/api/stats/public` | 200 |
| `/api/health/email` | 503, `healthy:false`; env present: `RESEND_API_KEY`, `EMAIL_FROM_TX/NOTIFY/NEWS`, `CRON_SECRET`; absent: `SUPABASE_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET`; `dbReachable:true`; last 24 h: 2 sent, 0 failed |

## Local gate on `b1aef1b4` before any change

`npm run check` exit 0: eslint 0 errors, 216 warnings (the recorded baseline); tsc clean; vitest 439 files, 4,664 tests passed in 33 s; `audit:allowlist`, `depcheck`, `email:render`, `email:audit` all passed. `email:audit`: 174 templates, 120 referenced by a send, 54 with no send path (listed in `dormant-ids.txt`).
