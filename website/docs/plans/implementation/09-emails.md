# 09. Emails: provision, consolidate, de-duplicate, wire

**Covers:** CC5 (E1, E4, E5 + missing sends), K1 (two sending modules), K7 (order-email duplication).
**Status when written:** 2026-07-29, branch `claude/wallplace-stress-test-035bd9`.
**Read first:** `docs/plans/2026-07-11-MASTER-RUNBOOK.md` §1 (conventions), `docs/plans/2026-07-11-stress-test-remediation-spec.md` §CC5, §11.5.

Everything below is `website/`-relative unless stated. Every file:line reference was verified against the working tree at the time of writing.

---

## 0. Ground truth, and three corrections to the brief

### 0.1 Confirmed

| ID | Finding | Evidence |
|---|---|---|
| E1 | Unset `RESEND_API_KEY` makes `sendEmail()` a silent success | `src/lib/email/send.ts:26-30` (`resend()` returns `null`), `:154-158` (logs `skipped_no_api_key`, returns `{ok:true, skipped:true}`) |
| E4 | One purchase sends 2 customer emails and 3 artist emails | customer: `src/lib/orders/lifecycle.ts:60` + `src/app/api/webhooks/stripe/route.ts:524`; artist: `lifecycle.ts:59` + `stripe/route.ts:571` + `stripe/route.ts:593`. Comment at `stripe/route.ts:414-417` admits both paths fire "for backwards compatibility" |
| E5 | A second, unlogged sending module exists | `src/lib/email.ts` (573 lines): guard `:4-9`, hardcoded `from` `:11`, `ADMIN_EMAIL` `:12`. No `email_events` write, no suppression check, no preference check, no `List-Unsubscribe` header, hardcoded `notifications@wallplace.co.uk` sender |
| Gap | Newsletter signup sends nothing | `src/app/api/newsletter/route.ts:30-33` inserts and returns |
| Gap | Contact form emails only the admin | `src/app/api/contact/route.ts:36` |
| Gap | `customer.subscription.created` sends nothing | `src/app/api/webhooks/stripe/route.ts:704-740` writes the DB row only; the only send in that block is gated at `:745` on `event.type === "customer.subscription.updated"` **and** `:752` on a real plan change. First invoice is then skipped by `:1054` `invoice.billing_reason === "subscription_cycle"` |
| Gap | Password reset and verification are unbranded | `src/app/(pages)/forgot-password/page.tsx:34` calls `supabase.auth.resetPasswordForEmail` client-side. `AccountPasswordReset` / `AccountEmailVerification` / `AccountEmailChangeVerify` are imported by **zero** routes (only `src/emails/registry.ts` and the docs) |

### 0.2 Corrections (the brief is wrong on these three)

1. **Dispute templates already exist and are already registered.** `src/emails/templates/orders/OrderDisputeOpened.tsx` (id `order_dispute_opened`) and `OrderDisputeResolved.tsx` (id `order_dispute_resolved`), imported at `src/emails/registry.ts:90-91`, in the array at `:245-246`. Nothing needs building. **The real gap is upstream: nothing anywhere creates a dispute row.** `grep 'from("disputes")'` returns four hits, all reads (`src/app/api/admin/disputes/route.ts:30`, `src/app/api/admin/disputes/[id]/route.ts:40,63`, `src/app/api/messages/route.ts:79`). `src/lib/orders/event-vocabulary.ts:34-38` says `disputed` is "opened via its own /api/disputes flow", and that route does not exist. Wiring `order_dispute_opened` requires first building the dispute-creation endpoint.

2. **`scripts/render-auth-email.ts` already exists** (123 lines) and its output is committed at `scripts/auth-emails-rendered/{verification,password-reset,email-change}.html`. `OUTSTANDING.md` §2.1 lists it as a to-do. The remaining work is the paste into the Supabase dashboard, not the script.

3. **`OUTSTANDING.md:3` ("113 templates built · 50 wired · 63 outstanding") is stale.** Actual: **123 template files**, **122 registry entries** (orphan: `src/emails/templates/performance/ArtistQrScanDigest.tsx`, id `artist_qr_scan_digest`, never imported into the registry), **66 reachable from a live trigger**, **57 unreachable**.

### 0.3 Other defects found while mapping, in scope for this document

| ID | Defect | Location |
|---|---|---|
| **E5b** | Refund approval sends the buyer **two** emails: legacy `notifyRefundDecision` and `customer_refund_confirmation` | `src/app/api/refunds/process/route.ts:305` and `:330` |
| **E5c** | Two legacy exports are dead: `confirmApplicationToArtist` is never imported anywhere; `notifyArtistNewOrder` is imported then discarded with `void notifyArtistNewOrder;` | `src/lib/email.ts:49`; `src/app/api/webhooks/stripe/route.ts:615` |
| **E5d** | `notifyPlacementResponse` is imported by `src/app/api/placements/route.ts:10` and never called (comment at `:1665` says it is "retained below as a safety net", but there is no call) | `src/app/api/placements/route.ts` |
| **E1b** | `no-unawaited-critical-sideeffect` denylists only `executeTransfer` and `notify*`. Deleting the legacy module removes every `notify*` name, so the rule stops catching anything in this area. There is already one un-awaited `sendEmail(...).catch(...)` it cannot see | rule at `eslint-rules/no-unawaited-critical-sideeffect.js:51`; live violation at `src/app/api/placements/route.ts:623` |
| **E1c** | `no-inline-admin-check` exempts `src/lib/email.ts` by filename (`eslint-rules/no-inline-admin-check.js:26`). Deleting that file leaves the exemption dead and the new admin-alert helper unlinted | as stated |
| **E1d** | No `email_events` row is written when `sendEmail` returns `duplicate` from the pre-check at `send.ts:80-82`, so a deduped attempt is invisible in the audit trail unless the earlier row happens to exist. (It does in the normal case; noted because §E asserts "a row per attempt".) | `src/lib/email/send.ts:74-83` |

### 0.4 The pipeline as it stands

`sendEmail()` (`src/lib/email/send.ts:64`) is the correct single entry point. It does, in order: idempotency short-circuit (`:74-83`), suppressions (`:86-103`), preferences and vacation (`:106-123`), throttle (`:126-139`), render (`:142-151`), API-key check (`:154-158`), atomic idempotency claim (`:166-185`), Resend send with `List-Unsubscribe` headers and tags (`:189-207`), status update (`:209-224`).

`sendTransactional()` (`src/lib/email/dispatcher.ts:92`) wraps it for the six order-lifecycle spec names via `TEMPLATE_BINDINGS` (`:42-49`).

`recordOrderEvent()` (`src/lib/orders/lifecycle.ts:82`) writes the `order_events` row and fans out to `sendTransactional` per `emailsForEvent()` (`:52-75`).

Categories and streams: `src/lib/email/categories.ts:27-41`, `src/lib/email/streams.ts:20-42`. Schema: `supabase/migrations/016_email_infrastructure.sql` (`email_events`, `email_preferences`, `email_suppressions`).

---

## A. Provisioning runbook (E1)

### A.1 DNS and Resend

Owner task, not a code change. Sequenced so nothing sends from an unverified domain.

1. Move `wallplace.co.uk` DNS off `dns-parking.com` to Cloudflare (free, fast propagation). Everything below assumes you can add TXT and CNAME records at the apex and on subdomains.
2. In Resend, add domain **`tx.wallplace.co.uk`**, region **Dublin** (EU, matches where UK customer data should sit).
3. Paste the records Resend issues. Resend gives three:
   - `send.tx` **MX** → `feedback-smtp.eu-west-1.amazonses.com`, priority 10 (bounce/complaint feedback path).
   - `send.tx` **TXT** → `v=spf1 include:amazonses.com ~all`.
   - `resend._domainkey.tx` **TXT** → the DKIM public key Resend shows (a long `p=MIGf...` value). Copy it verbatim; a single truncated character fails verification silently.
   > UNCONFIRMED: the exact hostnames and the SES region depend on the Resend account's region selection at creation time. Use whatever the Resend dashboard prints, do not copy the values above blind.
4. Click **Verify**. Green in 5 to 15 minutes on Cloudflare. Do not proceed until green.
5. Add DMARC on the **root** domain (it covers subdomains through the org-domain policy):
   - `_dmarc.wallplace.co.uk` TXT = `v=DMARC1; p=none; rua=mailto:dmarc@wallplace.co.uk; ruf=mailto:dmarc@wallplace.co.uk; fo=1; pct=100; adkim=r; aspf=r`
6. Create the mailboxes the emails reference so replies do not bounce: `hello@`, `support@`, `dmarc@`, `privacy@`, `abuse@`, `notifications@`, `unsubscribe@`. `unsubscribe@` is load-bearing: `send.ts:199` puts `mailto:unsubscribe@wallplace.co.uk` in every `List-Unsubscribe` header. If that address bounces, Gmail and Yahoo treat it as a bulk-sender rule failure.

### A.2 DMARC ratchet

Do not skip stages. Each stage needs a clean week of aggregate reports before advancing.

| Stage | Record | Advance when |
|---|---|---|
| 1. Monitor (day 0) | `p=none` | 7 consecutive days of `rua` reports where SPF **and** DKIM both align on 100% of Wallplace-sourced volume, and every third-party sender (Supabase Auth if not on Resend SMTP, Stripe receipts, any CRM) is either aligned or knowingly excluded |
| 2. Quarantine, partial (day 7) | `p=quarantine; pct=25` | 7 days, no aligned-mail loss reported by users, quarantine rate on legitimate mail is 0 |
| 3. Quarantine, full (day 14) | `p=quarantine; pct=100` | 7 days clean |
| 4. Reject (day 21) | `p=reject; pct=100; sp=reject` | terminal |

Roll back one stage immediately on any report of legitimate mail being quarantined. Keep `rua` on permanently.

**Ordering constraint:** finish §A.5 (Supabase auth templates) before stage 2. If Supabase Auth still sends from its own default domain when DMARC hits `quarantine`, every signup verification and password reset silently disappears.

### A.3 Vercel environment variables (Production, and Preview where noted)

Set in Vercel → Project → Settings → Environment Variables.

| Var | Production value | Preview | Notes |
|---|---|---|---|
| `RESEND_API_KEY` | `re_...` from Resend, **sending-only** scope | separate key, or unset | Never reuse the prod key in preview |
| `EMAIL_FROM_TX` | `Wallplace <noreply@tx.wallplace.co.uk>` | same | Read at `src/lib/email/streams.ts:23` |
| `EMAIL_FROM_NOTIFY` | `Wallplace <notifications@tx.wallplace.co.uk>` | same | Point at `tx.` until `notify.wallplace.co.uk` is verified (`streams.ts:30`) |
| `EMAIL_FROM_NEWS` | `Wallplace <hello@tx.wallplace.co.uk>` | same | Point at `tx.` until `news.wallplace.co.uk` is verified (`streams.ts:37`) |
| `EMAIL_REPLY_TO` | `hello@wallplace.co.uk` | same | `streams.ts:25,32,39` |
| `CRON_SECRET` | 32+ random chars (`openssl rand -hex 24`) | same | Vercel attaches it as `Authorization: Bearer` on cron invocations. `src/app/api/cron/_auth.ts` already returns 500 in production when unset |
| `ADMIN_EMAIL` | the ops inbox | same | Currently defaults to a personal Gmail at `src/lib/email.ts:12`. That default dies with the file (see §B.3) |
| `SUPABASE_WEBHOOK_SECRET` | HMAC secret shared with the Supabase dashboard | same | Already consumed by `src/app/api/webhooks/supabase/route.ts:48`. Without it that route rejects everything |
| `EMAIL_DRY_RUN` | unset | `1` | New. See §E.2 |

After setting, redeploy. Vercel does not apply env changes to an existing deployment.

**Never** set `RESEND_API_KEY` in `.env.local` on a machine that also has production Supabase credentials. `sendEmail()` writes to whatever Supabase project `getSupabaseAdmin()` resolves to, and a dev run against prod Supabase will burn real idempotency keys.

### A.4 Verify provisioning end to end

```bash
# 1. Domain is verified and the key works
curl -s -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from":"Wallplace <noreply@tx.wallplace.co.uk>","to":"you@example.com","subject":"provisioning check","text":"ok"}'
# 2. Headers on the received mail must show: spf=pass, dkim=pass, dmarc=pass, and the
#    d= value in DKIM-Signature must be tx.wallplace.co.uk (not resend.dev).
# 3. Health route (built in A.6)
curl -s https://wallplace.co.uk/api/health/email | jq
```

### A.5 Supabase auth templates

`scripts/render-auth-email.ts` already exists. Its `fixSupabaseTokens()` (`:46-51`) un-escapes HTML entities inside `{{ }}` because React Email escapes attribute values, which would otherwise break the GoTemplate tokens. Do not hand-edit the rendered HTML.

```bash
npx tsx scripts/render-auth-email.ts all   # writes scripts/auth-emails-rendered/*.html
```

Then, Supabase Dashboard → Authentication → Email Templates, paste:

| Rendered file | Supabase template | Source component |
|---|---|---|
| `verification.html` | Confirm signup | `AccountEmailVerification` |
| `password-reset.html` | Reset password (Recovery) | `AccountPasswordReset` |
| `email-change.html` | Change Email Address | `AccountEmailChangeVerify` |

Also do **Path B** from `OUTSTANDING.md` §2.2 in the same sitting, because it is what makes DMARC stage 2 safe: Project Settings → Auth → SMTP Settings → host `smtp.resend.com`, port `465`, user `resend`, password = `RESEND_API_KEY`, sender `noreply@tx.wallplace.co.uk`. Without this, Supabase sends auth mail from its own infrastructure and DMARC alignment fails.

Add `scripts/auth-emails-rendered/README.md` note: these files are build artefacts, regenerate rather than edit. (The directory and README already exist.)

Two follow-ups, both real and both currently broken:
- `src/context/AuthContext.tsx:123` and `src/app/(pages)/apply/claim/page.tsx:61` call `signUp()` **without** `emailRedirectTo`, so those two signup paths land the user on the Supabase default redirect. The three `src/app/(pages)/signup/*` pages do pass it. Fix the two outliers to match.
- There is **no** resend-verification flow anywhere (`.resend(` has zero hits in `src/`). A user who loses the verification mail has no recovery path. Add `POST /api/auth/resend-verification` calling `supabase.auth.resend({type:'signup', email})` behind the existing `checkRateLimit`.

### A.6 Fail loud instead of silent (the actual E1 fix)

Three layers. All three are required; each catches what the others miss.

**Layer 1, boot assertion.** Create `src/instrumentation.ts` (does not currently exist; Next.js 16 calls `register()` once per server start):

```ts
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const required = ["RESEND_API_KEY", "EMAIL_FROM_TX", "EMAIL_FROM_NOTIFY", "EMAIL_FROM_NEWS", "CRON_SECRET"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length === 0) return;
  const msg = `[email] missing required env: ${missing.join(", ")}`;
  if (process.env.VERCEL_ENV === "production") throw new Error(msg); // hard-fail the deploy
  console.warn(`${msg}, emails will be skipped in this environment`);
}
```

Production throws, so a misconfigured deploy fails at boot rather than dropping mail for a week. Preview and local warn once.

**Layer 2, `sendEmail()` must not report success for a no-op.** Change `src/lib/email/send.ts:154-158`:

```ts
  const client = resend();
  if (!client) {
    await logEvent(db, input, to, rules.stream, "skipped_no_api_key");
    if (process.env.VERCEL_ENV === "production") {
      console.error(`[email] RESEND_API_KEY unset in production, dropped ${input.template} to ${to}`);
      return { ok: false, error: "email_not_configured" };
    }
    return { ok: true, skipped: true, reason: "no_api_key" };
  }
```

Rationale for the split: in production an unconfigured key is a hard failure that must surface in error monitoring and in any caller that inspects the result. In dev and preview it stays a soft skip so `npm run dev` does not error on every signup.

**Do not** widen the `SendEmailResult` union. It already distinguishes the three outcomes correctly (`send.ts:50-53`), and `SkipReason` (`:55-62`) already names `no_api_key`. The bug is not the type, it is that `no_api_key` was classified as `ok: true` in the one environment where it is fatal.

**Layer 3, health route.** New file `src/app/api/health/email/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const env = {
    RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
    EMAIL_FROM_TX: Boolean(process.env.EMAIL_FROM_TX),
    EMAIL_FROM_NOTIFY: Boolean(process.env.EMAIL_FROM_NOTIFY),
    EMAIL_FROM_NEWS: Boolean(process.env.EMAIL_FROM_NEWS),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    SUPABASE_WEBHOOK_SECRET: Boolean(process.env.SUPABASE_WEBHOOK_SECRET),
  };
  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const counts: Record<string, number> = {};
  for (const status of ["sent", "failed", "skipped_no_api_key", "render_failed"]) {
    const { count } = await db.from("email_events")
      .select("id", { count: "exact", head: true })
      .eq("status", status).gte("created_at", since);
    counts[status] = count ?? 0;
  }
  const healthy = Object.values(env).every(Boolean) && counts.skipped_no_api_key === 0;
  return NextResponse.json({ healthy, env, last24h: counts }, { status: healthy ? 200 : 503 });
}
```

Returns **503** when anything is missing or when any send was dropped for a missing key in the last 24 hours, so an uptime monitor pointed at it pages. Booleans only, never the values. Note this is the `/api/health` the spec §11.7 asks for; extend the same directory for the general health check rather than adding a second one.

**Alerting.** Point the uptime monitor (Better Stack / Checkly / Vercel monitor) at `/api/health/email` on a 5-minute interval. Separately, add a daily row to the ops brief from:

```sql
select status, count(*) from email_events
where created_at > now() - interval '24 hours' group by 1 order by 2 desc;
```

Any non-zero `skipped_no_api_key`, `failed`, or `render_failed` is an incident.

### A.7 Call-site audit: does anyone inspect the result?

Exhaustive. `sendEmail` / `sendTransactional` / `recordOrderEvent` are called from **61 statement sites**. Exactly **five** bind the result to a variable:

| Site | Inspects | Behaviour |
|---|---|---|
| `src/lib/email/dispatcher.ts:108` | yes (`:119-127`) | Maps `ok:false` → `{sent:false}`, `duplicate` → `{sent:true,deduped:true}`, every other skip → `{sent:false}` |
| `src/lib/email/welcome.ts:104` | yes | Passed to `persistAndReturn(...)`, which stamps `welcomed_at` only on success |
| `src/lib/email/welcome.ts:180` | yes | as above |
| `src/lib/email/welcome.ts:223` | yes | as above |
| `src/lib/orders/lifecycle.ts:112` | yes (`:119-120`) | Counts `sent` / `deduped` for the return value |

**All 56 remaining call sites discard the result entirely.** They are `await sendEmail({...});` with no assignment: 12 in `src/app/api/webhooks/stripe/route.ts`, 10 in `src/app/api/cron/onboarding-nudges/route.ts`, 7 in `src/app/api/cron/inactive-users/route.ts`, 8 in `src/app/api/placements/route.ts`, and the rest scattered across `admin/applications/[id]`, `apply`, `messages`, `offers`, `placements/[id]/record`, `placements/[id]/review`, `refunds/process`, `register-venue`, `waitlist`, `webhooks/supabase`, and five cron routes.

**Consequence:** the Layer-2 change alone fixes nothing at those 56 sites, because nobody reads the return value. That is acceptable and deliberate. Email is best-effort by design (`send.ts:16`), and the observability comes from Layers 1 and 3 plus `email_events`, not from 56 hand-written error branches.

**Exception, three sites that must react:**

1. `src/lib/email/welcome.ts:104,180,223` already do (they must not stamp `welcomed_at` on a drop). No change.
2. `src/app/api/webhooks/stripe/route.ts:524` (order receipt) and the artist send after §C: a dropped order confirmation is a customer-service incident. Add, after the call:
   ```ts
   if (!res.ok) console.error("[webhook] order email failed", { orderId, template, error: res.error });
   ```
   Do **not** return non-200 to Stripe: a retry would re-run the whole handler, and the idempotency claim would then suppress the second attempt anyway.
3. `src/app/api/refunds/process/route.ts:330` (refund confirmation): same log-and-continue.

Record this decision in the file header of `send.ts` so the next reader does not "fix" the discarded results.

---

## B. Consolidation: delete `src/lib/email.ts` (E5, K1)

### B.1 What the legacy module is

573 lines, 16 exported functions, all calling `resend.emails.send()` directly with inline HTML string templates and `from: "Wallplace <notifications@wallplace.co.uk>"` hardcoded at `:11`. No idempotency key, no `email_events` row, no suppression lookup, no preference or vacation check, no throttle, no `List-Unsubscribe` header, no Resend tags, and a sender domain that will not be DKIM-signed once §A points everything at `tx.wallplace.co.uk`. Every one of these emails will land in spam or be rejected outright once DMARC reaches `p=reject`.

### B.2 Every caller (exhaustive)

**17 live call sites across 11 route files.** Six test files also mock the module.

| # | Call site | Function | Replacement |
|---|---|---|---|
| 1 | `src/app/api/apply/route.ts:211` | `notifyAdminNewApplication` | `sendAdminAlert` (§B.3) |
| 2 | `src/app/api/contact/route.ts:36` | `notifyAdminNewContact` | `sendAdminAlert` |
| 3 | `src/app/api/curation/route.ts:127` | `notifyAdminCurationRequest` | `sendAdminAlert` |
| 4 | `src/app/api/curation/route.ts:140` | `notifyCurationCustomerEnquiry` | `sendEmail` + **new** `venue_curation_enquiry_received` |
| 5 | `src/app/api/enquiry/route.ts:37` | `notifyAdminNewEnquiry` | `sendAdminAlert` |
| 6 | `src/app/api/enquiry/route.ts:65` | `notifyNewMessage` | `sendEmail` + existing `message_unread_notification` |
| 7 | `src/app/api/messages/route.ts:489` | `notifyPlacementRequest` | `sendEmail` + `venue_new_placement_request` (recipient venue) or **new** `artist_new_placement_request` (recipient artist) |
| 8 | `src/app/api/messages/route.ts:521` | `notifyPlacementResponse` | `sendEmail` + existing `artist_placement_accepted` / `artist_placement_declined` |
| 9 | `src/app/api/orders/route.ts:246` | `notifyBuyerStatusUpdate` | delete; extend `emailsForEvent` (§C.4) |
| 10 | `src/app/api/placements/route.ts:582` | `notifyPlacementRequest` | `sendEmail` + **new** `artist_new_placement_request` |
| 11 | `src/app/api/refunds/process/route.ts:134` | `notifyRefundDecision` (reject path) | `sendEmail` + **new** `customer_refund_rejected` |
| 12 | `src/app/api/refunds/process/route.ts:305` | `notifyRefundDecision` (approve path) | **delete outright** (E5b duplicate; `:330` already sends `customer_refund_confirmation`) |
| 13 | `src/app/api/refunds/request/route.ts:155` | `notifyRefundRequested` (artist present) | `sendAdminAlert` + `sendEmail` with **new** `artist_refund_requested` |
| 14 | `src/app/api/refunds/request/route.ts:183` | `notifyRefundRequested` (no artist) | `sendAdminAlert` only |
| 15 | `src/app/api/register-venue/route.ts:59` | `notifyAdminNewVenue` | `sendAdminAlert` |
| 16 | `src/app/api/webhooks/stripe/route.ts:102` | `notifyCurationCustomerPaid` | `sendEmail` + **new** `venue_curation_payment_received` |
| 17 | `src/app/api/webhooks/stripe/route.ts:634` | `notifyVenueOrderFromPlacement` | `sendEmail` + **new** `venue_placement_sale` |

**Dead references to delete with no replacement:**
- `src/app/api/webhooks/stripe/route.ts:615`, `void notifyArtistNewOrder;` (E5c)
- `src/app/api/placements/route.ts:10`, `notifyPlacementResponse` imported, never called (E5d). Remove from the import list.
- `src/lib/email.ts:49`, `confirmApplicationToArtist`, never imported anywhere. It is superseded by `artist_application_submitted`, already sent at `src/app/api/apply/route.ts:216`.

**Test files that mock `@/lib/email`** (all must be updated to mock `@/lib/email/send` and `@/lib/email/admin` instead):
`src/app/api/apply/route.test.ts:78`, `src/app/api/messages/route.test.ts:34`, `src/app/api/orders/route.test.ts:15`, `src/app/api/refunds/process/route.test.ts:27`, `src/app/api/refunds/request/route.test.ts:28`, `src/app/api/webhooks/stripe/route.test.ts:43`, `tests/integration/stripe-webhook.test.ts:30`.

### B.3 New: `sendAdminAlert()` and one generic admin template

Seven of the seventeen call sites are internal ops notifications to `ADMIN_EMAIL`. They do not need seven polished templates. Build one.

**New category.** `src/lib/email/categories.ts`, add to `EmailCategory` and `CATEGORY_RULES`:

```ts
  internal_ops: { stream: "tx", criticalAlwaysSend: true, throttleCount: 0, throttleHours: 0 },
```

`preferenceKeyFor()` (`:44-63`) falls through to `default: return null`, so no change there. `criticalAlwaysSend: true` is correct: an ops alert must never be suppressed by a preference row on the admin's own account.

**New template** `src/emails/templates/legal/OperationalAdminAlert.tsx`, registry id `operational_admin_alert`, `stream: "tx"`, `persona: "multi"`, `category: "internal_ops"`, `canUnsubscribe: false`, `priority: 1`. Props:

```ts
export interface OperationalAdminAlertProps {
  title: string;
  rows: Array<{ label: string; value: string }>;
  body?: string;            // free text, e.g. the contact message
  actionUrl?: string;
  actionLabel?: string;
}
```

**New helper** `src/lib/email/admin.ts`:

```ts
import { sendEmail, type SendEmailResult } from "./send";
import { OperationalAdminAlert, type OperationalAdminAlertProps } from "@/emails/templates/legal/OperationalAdminAlert";

/** The ops inbox. ADMIN_EMAILS may be a comma list; we take the first. */
function adminAddress(): string | null {
  const raw = process.env.ADMIN_EMAIL || process.env.ADMIN_EMAILS || "";
  return raw.split(",")[0]?.trim() || null;
}

export async function sendAdminAlert(
  input: { idempotencyKey: string; template: string; subject: string } & OperationalAdminAlertProps,
): Promise<SendEmailResult> {
  const to = adminAddress();
  if (!to) return { ok: false, error: "ADMIN_EMAIL unset" };
  const { idempotencyKey, template, subject, ...props } = input;
  return sendEmail({
    idempotencyKey, template, category: "internal_ops", to, subject,
    react: OperationalAdminAlert(props),
    metadata: { admin_alert: true },
  });
}
```

**ESLint follow-up (E1c):** `eslint-rules/no-inline-admin-check.js:26` currently exempts `src/lib/email.ts`. Replace that line with `if (fn.endsWith("src/lib/email/admin.ts")) return {};` and update the comment. Add a case to `tests/integration/eslint-no-inline-admin-check.test.ts` asserting the new exempt path and asserting the old path is **no longer** exempt.

**Idempotency-key shapes for the seven admin alerts:**

| Call site | `template` | `idempotencyKey` |
|---|---|---|
| `apply/route.ts:211` | `admin_new_artist_application` | `admin:application:${email.toLowerCase()}` |
| `contact/route.ts:36` | `admin_new_contact` | `admin:contact:${submissionId}` (capture the insert's `id`; the route currently discards it, add `.select("id").single()`) |
| `curation/route.ts:127` | `admin_curation_request` | `admin:curation:${row.id}` |
| `enquiry/route.ts:37` | `admin_new_enquiry` | `admin:enquiry:${enquiryId}` (same `.select("id")` change) |
| `refunds/request/route.ts:155,183` | `admin_refund_requested` | `admin:refund_request:${refundRequest.id}` |
| `register-venue/route.ts:59` | `admin_new_venue` | `admin:venue:${venueSlug}` |

Every key is derived from a database row id or a natural key, never from `Date.now()`. That is the whole point: a double-submitted form or a Stripe retry must collide.

### B.4 The nine customer-facing replacements

| Legacy call | Template | Exists? | Category | Idempotency key |
|---|---|---|---|---|
| `curation/route.ts:140` | `venue_curation_enquiry_received` | **create** | `orders_and_payouts` | `curation_enquiry:${row.id}` |
| `webhooks/stripe:102` | `venue_curation_payment_received` | **create** | `orders_and_payouts` | `curation_paid:${requestId}` |
| `enquiry/route.ts:65` | `message_unread_notification` | exists | `messages` | `message_unread:enquiry:${cid}` |
| `messages/route.ts:489` (to venue) | `venue_new_placement_request` | exists | `placements` | `placement_request:${placementId}:to_venue` |
| `messages/route.ts:489` (to artist) | `artist_new_placement_request` | **create** | `placements` | `placement_request:${placementId}:to_artist_recipient` |
| `placements/route.ts:582` | `artist_new_placement_request` | **create** | `placements` | `placement_request:${placementId}:to_artist_recipient` |
| `messages/route.ts:521` | `artist_placement_accepted` / `artist_placement_declined` | exists | `placements` | `placement_response:${placementId}:accepted` / `:declined` |
| `refunds/process:134` | `customer_refund_rejected` | **create** | `orders_and_payouts` | `customer_refund_rejected:${refundRequestId}` |
| `refunds/request:155` | `artist_refund_requested` | **create** | `orders_and_payouts` | `artist_refund_requested:${refundRequestId}` |
| `webhooks/stripe:634` | `venue_placement_sale` | **create** | `orders_and_payouts` | `venue_placement_sale:${paymentIntentId \|\| orderId}` |

Note the `placement_response` keys deliberately match the ones already used at `src/app/api/placements/route.ts:1680,1704,1726,1741`. Both the `/api/messages` path and the `/api/placements` path can fire on the same accept, and matching keys means the second one dedupes instead of double-sending. This is a **behaviour change** and a bug fix.

Six new templates in total (`artist_new_placement_request`, `customer_refund_rejected`, `artist_refund_requested`, `venue_curation_enquiry_received`, `venue_curation_payment_received`, `venue_placement_sale`), plus `operational_admin_alert`. Each follows the existing file shape: named export component, exported `Props` interface, exported `mock`, `const entry: TemplateEntry<Props>`, `export default entry`, then an import + array push in `src/emails/registry.ts`.

**Extract the message-unread helper.** `sendMessageUnreadEmail()` currently lives inline at `src/app/api/messages/route.ts:21-46`. Move it to `src/lib/email/notifications.ts` unchanged and import it from both `messages/route.ts` and `enquiry/route.ts`. That is what makes replacement #6 a one-liner instead of a copy-paste.

### B.5 Delete the file

`git rm src/lib/email.ts` in the same PR as the last caller migration. §1 of the master runbook: "New implementation ⇒ old one deleted in the same PR."

### B.6 The ESLint guard

Follow the repo convention exactly (custom CommonJS rule + `Linter`-based integration test), which is how the other six rules are enforced.

**New rule** `eslint-rules/no-legacy-email-import.js`:

```js
"use strict";

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid importing the deleted legacy email module (@/lib/email or a relative path to " +
        "src/lib/email). All mail must go through sendEmail() / sendTransactional() / sendAdminAlert() " +
        "so it is logged to email_events and respects suppressions, preferences and throttles.",
    },
    schema: [],
    messages: {
      legacyEmail:
        "Import from @/lib/email/send, @/lib/email/dispatcher or @/lib/email/admin. " +
        "The legacy @/lib/email module bypassed email_events, suppressions and the verified sending domain, " +
        "and has been deleted.",
    },
  },

  create(context) {
    // Matches "@/lib/email" and "./email" / "../lib/email" style relatives, but NOT
    // "@/lib/email/send", "@/lib/email/dispatcher", "@/lib/email/admin", "@/lib/email/welcome".
    function isLegacy(source) {
      if (typeof source !== "string") return false;
      if (source === "@/lib/email") return true;
      return /(^|\/)lib\/email$/.test(source) || /(^|\/)\.\.?\/email$/.test(source);
    }
    function check(node, source) {
      if (isLegacy(source)) context.report({ node, messageId: "legacyEmail" });
    }
    return {
      ImportDeclaration(node) { check(node, node.source && node.source.value); },
      // await import("@/lib/email") and require("@/lib/email")
      ImportExpression(node) {
        if (node.source && node.source.type === "Literal") check(node, node.source.value);
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "require") return;
        const a = node.arguments[0];
        if (a && a.type === "Literal") check(node, a.value);
      },
      // vi.mock("@/lib/email", ...) in tests
      "CallExpression[callee.property.name='mock']"(node) {
        const a = node.arguments[0];
        if (a && a.type === "Literal") check(node, a.value);
      },
    };
  },
};
```

The `vi.mock` visitor matters: without it a test file can keep mocking a module that no longer exists, and the mock silently does nothing.

**Register** in `eslint.config.mjs`: `require("./no-legacy-email-import")` in the `eslint-rules/index.js` rules map, then `"wallplace/no-legacy-email-import": "error"` in the rules block at lines 17-29.

**Integration test** `tests/integration/eslint-no-legacy-email-import.test.ts`, modelled on `tests/integration/eslint-no-inline-admin-check.test.ts` (`createRequire` + `new Linter()` + a flat-config array, `expect(messages).toHaveLength(n)` and `expect(messages[0].ruleId).toBe(...)`). Cases:

| # | Input | Expect |
|---|---|---|
| 1 | `import { notifyAdminNewContact } from "@/lib/email";` | 1 error |
| 2 | `import { sendEmail } from "@/lib/email/send";` | 0 |
| 3 | `import { sendTransactional } from "@/lib/email/dispatcher";` | 0 |
| 4 | `import { sendAdminAlert } from "@/lib/email/admin";` | 0 |
| 5 | `const m = await import("@/lib/email");` | 1 |
| 6 | `const m = require("@/lib/email");` | 1 |
| 7 | `vi.mock("@/lib/email", () => ({}));` | 1 |
| 8 | `vi.mock("@/lib/email/send", () => ({}));` | 0 |
| 9 | `import x from "../email";` (relative) | 1 |
| 10 | `import { STREAMS } from "@/lib/email/streams";` | 0 |

**Also extend `no-unawaited-critical-sideeffect` (E1b).** With every `notify*` name gone, `eslint-rules/no-unawaited-critical-sideeffect.js:51` protects nothing here. Change:

```js
    function isDenylisted(name) {
      return (
        name === "executeTransfer" ||
        name === "sendEmail" ||
        name === "sendTransactional" ||
        name === "sendAdminAlert" ||
        name === "recordOrderEvent" ||
        /^notify/.test(name)
      );
    }
```

This immediately flags the live violation at `src/app/api/placements/route.ts:623` (a fire-and-forget `sendEmail(...).catch(...)` inside an API route, which Vercel can drop when the function returns). Fix that site by awaiting it inside the existing `try`. Add the corresponding cases to `tests/integration/eslint-no-unawaited-critical-sideeffect.test.ts`.

**Gap worth closing while you are here:** `no-raw-arrangement-type` is registered as an error but has no integration test. It is the only one of the seven rules without one.

---

## C. De-duplication (E4, K7)

### C.1 The rule

**One event, one template, one send per recipient.** The dispatcher (`recordOrderEvent` → `sendTransactional`) is the only path allowed to send order-lifecycle mail. Every inline `sendEmail` in the Stripe webhook's order branch and in `orders/route.ts` goes.

### C.2 Which template survives, and why

**Customer, `order.placed`: keep `customer_order_placed`, retire `customer_order_receipt`.**
`CustomerOrderPlaced` (`src/emails/templates/orders/CustomerOrderPlaced.tsx`) already carries the itemised `OrderSummary`, shipping address, tracking-token deep link, and `CONSUMER_RIGHTS_FOOTER` (`:43`), which is the UK Consumer Contracts Regulations 2013 text the spec §11.4 requires in the confirmation email. `CustomerOrderReceipt` does **not** include that footer; it only adds a billing-address block (`:18,43`). So port one optional prop across (`billingAddress?: Address`, rendered above the shipping block) and retire the receipt. Nothing legal is lost, and the surviving template is the one the lifecycle stepper is built around.

**Artist, `order.placed`: keep `artist_order_received`, retire `artist_work_sold` and `artist_order_confirmation`.**
`ArtistOrderReceived` is the purpose-built lifecycle template and already carries work title, buyer first name, work image and next steps. It is missing the money, which is the single most important line for the artist. Add `saleAmount?: Money` and render it in the H1 paragraph, borrowing the sentence from `ArtistWorkSold:20`. Three emails collapse to one that says everything.

The comment blocks that justify the duplication (`stripe/route.ts:414-417` "legacy templates below continue to fire for backwards compatibility", `:567-570` "Two emails to the artist: the celebration and the operational receipt") are the artefact of a staged migration that never finished. Delete them with the code.

### C.3 Exact edits

**`src/emails/templates/orders/CustomerOrderPlaced.tsx`**
- add `billingAddress?: Address` to `CustomerOrderPlacedProps`
- render `<AddressBlock label="Billing" address={p.billingAddress} />` when present

**`src/emails/templates/orders/ArtistOrderReceived.tsx`**
- add `saleAmount?: Money` to `ArtistOrderReceivedProps`
- render the amount in the opening paragraph when present

**`src/app/api/webhooks/stripe/route.ts`**
- **delete** `:524-559` (the whole `sendEmail` for `customer_order_receipt`). Keep the surrounding work: the `orderItems` mapping (`:485-502`), the `db.from("orders").update({items: orderItems})` persistence (`:509-513`) and `signOrderToken` (`:518-523`) are all still needed, they now feed `recordOrderEvent`.
- **delete** `:571-592` (`artist_work_sold`) and `:593-613` (`artist_order_confirmation`) and `:615` (`void notifyArtistNewOrder;`). Keep the `createNotification` bell at `:619-625`.
- **move** the `recordOrderEvent` call from `:426-437` to after the enrichment block, and pass the full data payload:
  ```ts
  await recordOrderEvent({
    orderId,
    newStatus: "confirmed",
    buyerEmail: buyerEmail ?? null,
    artistEmail,
    data: {
      firstName: buyerFirstName, orderNumber: orderId,
      orderUrl: `${SITE}/orders/${orderId}`,
      orderDate: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      trackingToken, items: orderItems,
      subtotal: { amount: Math.round(subtotal * 100), currency: "GBP" },
      shipping: { amount: Math.round(shippingCost * 100), currency: "GBP" },
      total: { amount: Math.round(total * 100), currency: "GBP" },
      billingAddress, shippingAddress,
      // artist-side
      workTitle: firstItemTitle,
      buyerFirstName,
      saleAmount: { amount: Math.round(artistRevenue * 100), currency: "GBP" },
    },
    metadata: { stripe_session_id: session.id, payment_intent: paymentIntentId },
  });
  ```
  One `data` object feeds both templates; each component reads only the props it declares. That is already how the dispatcher works (`dispatcher.ts:114` spreads `data` into `createElement`).
- **delete** the `notifyVenueOrderFromPlacement` call at `:634` and replace with `sendEmail` + the new `venue_placement_sale` template (§B.4). The venue is not part of `emailsForEvent`, because the venue's stake is revenue share, not order fulfilment. Keep it as its own `sendEmail`.

**`src/lib/orders/lifecycle.ts`**: no change to `order.placed`; it already returns exactly `[artist_order_received, order_placed]` (`:57-61`).

**`src/lib/email/dispatcher.ts`**: no change. `TEMPLATE_BINDINGS` (`:42-49`) already maps `order_placed → customer_order_placed` and `artist_order_received → artist_order_received`.

**Retire the templates properly:** `customer_order_receipt`, `artist_work_sold`, `artist_order_confirmation`. Do not delete the `.tsx` files in this PR (they are stable and the preview library references them); instead set `priority: 3` and add `description: "RETIRED, superseded by <id>. Not wired to any trigger."` on each `TemplateEntry`. Delete them in the §08 cull pass once the new path has run clean in production for a fortnight. Same for `customer_shipping_confirmation` and `customer_delivery_confirmation`, which the dispatcher header comment (`:38-41`) already describes as no longer reachable.

**Also un-orphan or delete `artist_qr_scan_digest`**: `src/emails/templates/performance/ArtistQrScanDigest.tsx` exists but is not in the registry, while `src/app/api/cron/qr-scan-digest/route.ts:145` sends with `template: "artist_qr_scan_digest"`. The send works because `sendEmail`'s `template` field is a free-text label, but the template is invisible to the preview library and to any registry-driven tooling. Add the import + array entry.

### C.4 Cancelled, refunded, disputed

`emailsForEvent` (`lifecycle.ts:56-75`) returns `[]` for `order.cancelled`, `order.refunded` and `order.delivery_confirmed`, and `orders/route.ts:243` compensates with the legacy `notifyBuyerStatusUpdate` for "statuses the dispatcher doesn't cover". Close that hole:

- **`order.cancelled`** → new template `customer_order_cancelled` (create; props `firstName, orderNumber, orderUrl, refundExpected?: boolean, supportUrl?`), added to `TransactionalTemplate` and `TEMPLATE_BINDINGS`, and to `emailsForEvent` as `[{ to: buyerEmail, template: "order_cancelled" }]`.
- **`order.refunded`** → leave `[]`. `customer_refund_confirmation` already fires from `refunds/process/route.ts:330` with the refund amount and expected arrival date, which the lifecycle path has no access to. Document the exception in the switch, do not duplicate it.
- **`order.delivery_confirmed`** → leave `[]`. Payout release is the user-visible outcome and `artist_payout_sent` already covers it.
- Then **delete** the `notifyBuyerStatusUpdate` call at `orders/route.ts:243-254` and the comment block at `:236-242`.

### C.5 Resulting matrix

After §C, one purchase sends exactly **1 customer email + 1 artist email** (+1 venue email only when a revenue share exists).

| Event | Trigger | Recipient | Template (registry id) | Idempotency key |
|---|---|---|---|---|
| `order.placed` | `stripe/route.ts` checkout branch → `recordOrderEvent` | customer | `customer_order_placed` | `${orderId}:order.placed:order_placed` |
| `order.placed` | same call | artist | `artist_order_received` | `${orderId}:order.placed:artist_order_received` |
| `order.placed` (revenue share only) | `stripe/route.ts` venue branch → `sendEmail` | venue | `venue_placement_sale` **(new)** | `venue_placement_sale:${paymentIntentId}` |
| `order.processing` | `orders/route.ts` PATCH → `recordOrderEvent` | customer | `customer_order_processing` | `${orderId}:order.processing:order_processing` |
| `order.out_for_delivery` | `orders/route.ts` PATCH | customer | `customer_order_out_for_delivery` | `${orderId}:order.out_for_delivery:order_out_for_delivery` |
| `order.delivered` | `orders/route.ts` PATCH | customer | `customer_order_delivered` | `${orderId}:order.delivered:order_delivered` |
| 48h after delivery | `cron/order-delivery-followup` → `sendTransactional` | customer | `customer_confirm_delivery_48h` | `${orderId}:48h_prompt:customer_confirm_delivery` |
| `order.cancelled` | `orders/route.ts` PATCH | customer | `customer_order_cancelled` **(new)** | `${orderId}:order.cancelled:order_cancelled` |
| refund requested | `refunds/request` | admin | `operational_admin_alert` **(new)** | `admin:refund_request:${id}` |
| refund requested | `refunds/request` | artist | `artist_refund_requested` **(new)** | `artist_refund_requested:${id}` |
| refund approved | `refunds/process` | customer | `customer_refund_confirmation` | `customer_refund:${refundRequestId}` |
| refund approved | `refunds/process` | artist | `artist_refund_notification` | `artist_refund:${refundRequestId}` |
| refund rejected | `refunds/process` | customer | `customer_refund_rejected` **(new)** | `customer_refund_rejected:${refundRequestId}` |
| payout sent | `stripe/route.ts` `payout.paid` | artist | `artist_payout_sent` | `payout_sent:${payout.id}` |
| payout failed | `stripe/route.ts` `payout.failed` | artist | `artist_payout_failed` | `payout_failed:${payout.id}` |

Retired, no longer reachable: `customer_order_receipt`, `artist_work_sold`, `artist_order_confirmation`, `customer_shipping_confirmation`, `customer_delivery_confirmation`.

Note the trailing `:order_placed` on the dispatcher keys: `dispatcher.ts:109` appends the spec template name to the caller's key, and `lifecycle.ts:90` builds that key as `${orderId}:${event}`. This is correct and must not change; it is what gives each (event, recipient) pair its own `email_events` row while keeping the whole event idempotent under Stripe retries.

---

## D. Wire the missing sends

### D.1 Dispute opened

**Template:** `order_dispute_opened` (exists, `src/emails/templates/orders/OrderDisputeOpened.tsx`, registered at `registry.ts:245`). Props: `firstName, orderNumber, disputeUrl, nextSteps: string[], supportUrl?`.

**Blocker:** there is no dispute-creation path. `disputes` (`supabase/migrations/060_disputes_and_reports.sql:13-27`) is written by nothing. So this task is a feature build, not a wiring task.

**Trigger to build:** `POST /api/disputes` (new).
- Auth: `getAuthenticatedUser`. The opener must be a party to the order or placement, verified through the existing authz helpers, not an inline check.
- Body: `{ orderId?: string, placementId?: string, conversationId?: string, category: string, description: string }` (zod, `description` min 10 max 2000). Exactly one of `orderId` / `placementId` required.
- Insert `{ opener_user_id, order_id, placement_id, conversation_id, category, description }`, status defaults to `open`.
- Then send to **both parties** (buyer and artist), one email each.

```ts
const parties = [
  { email: buyerEmail,  userId: order.buyer_user_id,  firstName: buyerFirstName,  role: "buyer" },
  { email: artistEmail, userId: order.artist_user_id, firstName: artistFirstName, role: "artist" },
];
for (const p of parties) {
  if (!p.email) continue;
  await sendEmail({
    idempotencyKey: `dispute_opened:${dispute.id}:${p.role}`,
    template: "order_dispute_opened",
    category: "orders_and_payouts",
    to: p.email,
    subject: `Dispute opened on order ${order.id}`,
    userId: p.userId ?? undefined,
    react: OrderDisputeOpened({
      firstName: p.firstName,
      orderNumber: order.id,
      disputeUrl: `${SITE}/orders/${order.id}/dispute`,
      nextSteps: [
        "Reply within 3 business days with your side and any photos",
        "We hold the payout while the case is open",
        "If it stays unresolved we make a final call and refund or release accordingly",
      ],
      supportUrl: `${SITE}/support`,
    }),
    metadata: { disputeId: dispute.id, orderId: order.id },
  });
}
await sendAdminAlert({ idempotencyKey: `admin:dispute:${dispute.id}`, template: "admin_dispute_opened", subject: `Dispute opened on ${order.id}`, ... });
```

Also stamp the order: `recordOrderEvent({ orderId, newStatus: "disputed", ... })`. `src/lib/orders/event-vocabulary.ts:36` currently maps `disputed: null`; give it a real event type so the stepper and `order_events` see it, and leave `emailsForEvent` returning `[]` for it (the emails above are the surface).

**Test:** `src/app/api/disputes/route.test.ts`. POST as the buyer creates the row, asserts `sendEmail` called exactly twice with distinct `idempotencyKey` values and the two party addresses; POST as a non-party returns 403; a second POST with the same body creates a second dispute (disputes are not idempotent by design, but the emails on the first are keyed on the row id, so a Stripe-style replay cannot double-mail).

### D.2 Dispute resolved

**Template:** `order_dispute_resolved` (exists). Props: `firstName, orderNumber, outcome, disputeUrl, supportUrl?`.

**Trigger:** `src/app/api/admin/disputes/[id]/route.ts`, the `resolve` branch. Two edits:
1. **Widen the pre-fetch at `:40-43`.** It currently selects `"id, status"` only. Change to `"id, status, order_id, placement_id, opener_user_id"`, because without `order_id` there is no way to reach either party.
2. After the successful update (`:63-67`) and the `recordAdminAction` (`:69-80`), resolve both party emails from the order and send:

```ts
for (const p of parties) {
  await sendEmail({
    idempotencyKey: `dispute_resolved:${id}:${p.role}`,
    template: "order_dispute_resolved",
    category: "orders_and_payouts",
    to: p.email,
    subject: `Dispute on ${orderNumber} resolved`,
    userId: p.userId,
    react: OrderDisputeResolved({
      firstName: p.firstName, orderNumber,
      outcome: parsed.data.resolution,
      disputeUrl: `${SITE}/orders/${orderNumber}/dispute`,
      supportUrl: `${SITE}/support`,
    }),
    metadata: { disputeId: id },
  });
}
```

The `close` action gets no email (it is an admin housekeeping state). The `escalate` action gets no user email either, but note the schema quirk at `:59-61`: escalate writes `category: "escalated"` and leaves `status` as `open`, because `escalated` is not in the `status` CHECK constraint (`060_...sql:19-20`). Do not "fix" that here.

**Test:** `src/app/api/admin/disputes/[id]/route.test.ts`. `action:"resolve"` sends exactly 2 emails with the resolution text in the props; `action:"close"` sends 0; a repeat `resolve` PATCH sends 0 new (idempotency key collides).

### D.3 Newsletter signup confirmation

**Template:** none exists. The five `newsletter_*` templates are editorial sends. **Create `NewsletterSubscribeConfirm`**, id `newsletter_subscribe_confirm`, `stream: "news"`, `category: "newsletter"`, `canUnsubscribe: true`, `priority: 2`. Props: `confirmUrl: string, expiresIn: string`.

**Schema change required.** `newsletter_subscribers` (`supabase/migrations/018_newsletter.sql:5-12`) has `id, email, source, subscribed_at, unsubscribed_at` and **no confirmation token**. `email_preferences.newsletter_enabled` defaults to `false` with the comment "double opt-in" (`016_email_infrastructure.sql:43`), so the intent was always double opt-in. New migration:

```sql
ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS confirm_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS newsletter_confirm_token_idx
  ON newsletter_subscribers(confirm_token) WHERE confirm_token IS NOT NULL;
```

**Trigger:** `src/app/api/newsletter/route.ts`, after the insert at `:30-33`. Generate `confirm_token = crypto.randomUUID()`, store it, then:

```ts
await sendEmail({
  idempotencyKey: `newsletter_confirm:${row.id}`,
  template: "newsletter_subscribe_confirm",
  category: "newsletter",
  to: email,
  subject: "Confirm your Wallplace newsletter subscription",
  react: NewsletterSubscribeConfirm({
    confirmUrl: `${SITE}/api/newsletter/confirm?t=${token}`,
    expiresIn: "7 days",
  }),
  metadata: { source: parsed.data.source },
});
```

Note the duplicate branch at `:38-41` returns `{ok:true, alreadySubscribed:true}` on PG `23505` and must **not** resend. That is already correct behaviour and the idempotency key would catch it anyway.

**Also build `GET /api/newsletter/confirm`**: look up by token, set `confirmed_at`, clear `confirm_token`, and if the address matches an `auth.users` row set `email_preferences.newsletter_enabled = true`. Redirect to a confirmation page. Without this route the confirm link 404s and double opt-in is worse than none.

**Test:** `src/app/api/newsletter/route.test.ts`. POST inserts a row with a token and sends exactly 1 email; a second POST with the same address returns `alreadySubscribed` and sends 0; `GET /api/newsletter/confirm?t=<token>` sets `confirmed_at`; a bad token 404s.

### D.4 Contact-form acknowledgement to the sender

**Template:** none exists (grep across all 123 files for `contact|acknowledg|support|enquir|receiv` finds nothing usable). **Create `SupportRequestReceived`**, id `support_request_received`, `stream: "tx"`, `persona: "multi"`, `category: "orders_and_payouts"`, `canUnsubscribe: false`, `priority: 1`. Props: `firstName, referenceId, submittedType, messageExcerpt, expectedReplyDays: number, supportUrl?`.

Category note: `orders_and_payouts` is the closest existing critical-always-send bucket. A transactional acknowledgement to someone who just typed their email into a form must not be suppressible by a preference row. If §B.3's `internal_ops` category lands first, this is a candidate to move there, but the semantics ("we received your message") are customer-facing, so keep it on `orders_and_payouts`.

**Trigger:** `src/app/api/contact/route.ts`, immediately after the `sendAdminAlert` that replaces `:36`. Two prerequisite edits to that file:
- The insert at `:20-26` discards the row id. Change to `.insert({...}).select("id").single()` so the acknowledgement can quote a reference.
- It uses the **anon** client (`import { supabase } from "@/lib/supabase"`, `:2`), which is fine for the insert but means no admin context. No change needed for email.

```ts
await sendEmail({
  idempotencyKey: `support_ack:${submission.id}`,
  template: "support_request_received",
  category: "orders_and_payouts",
  to: email,
  subject: "We've got your message",
  react: SupportRequestReceived({
    firstName: (name || "there").split(" ")[0],
    referenceId: submission.id,
    submittedType: type,
    messageExcerpt: message.slice(0, 200),
    expectedReplyDays: 2,
    supportUrl: `${SITE}/contact`,
  }),
  metadata: { submissionId: submission.id, type },
});
```

**Abuse note:** the route is rate-limited to 5/min/IP (`:8`), and the acknowledgement goes only to the address the submitter typed. That is a reflected send, so the rate limit is the only thing between you and using the contact form as a spam relay. Keep it, and add the sender address to the throttle by passing no `userId` (which means `sendEmail`'s throttle does not apply). **UNCONFIRMED whether the existing 5/min IP limit is sufficient under a distributed attempt.** Consider a second `email_events`-based check: refuse if more than 3 `support_request_received` rows exist for that address in the last hour.

**Test:** `src/app/api/contact/route.test.ts` (new file). POST sends exactly 2 emails, one to `ADMIN_EMAIL` with template `operational_admin_alert` and one to the submitter with `support_request_received`; a repeat POST with a new row id sends 2 more; the same row id sends 0.

### D.5 Subscription started

**Template:** none exists. Six `subscription_*` templates are registered and five are wired; there is no "started". **Create `SubscriptionStarted`**, id `subscription_started`, `stream: "tx"`, `persona: "artist"`, `category: "orders_and_payouts"`, `canUnsubscribe: false`, `priority: 1`. Props: `firstName, planName, amount: Money, billingInterval: "month" | "year", firstBillingDate: string, nextBillingDate: string, trialEndsAt?: string, manageUrl, invoiceUrl?`.

**Trigger:** `src/app/api/webhooks/stripe/route.ts`, inside the `created || updated` block at `:704`, in a new `if (event.type === "customer.subscription.created")` branch after the DB update at `:716-725` and beside the existing cancel-previous branch at `:728-737`.

```ts
if (event.type === "customer.subscription.created") {
  const { data: profile } = await db.from("artist_profiles")
    .select("user_id, name").eq("stripe_customer_id", customerId).maybeSingle();
  if (profile?.user_id) {
    const { data: { user } } = await db.auth.admin.getUserById(profile.user_id);
    const item = subscription.items.data[0];
    if (user?.email) {
      await sendEmail({
        idempotencyKey: `subscription_started:${subscription.id}`,
        template: "subscription_started",
        category: "orders_and_payouts",
        to: user.email,
        userId: profile.user_id,
        subject: `You're on Wallplace ${plan.charAt(0).toUpperCase() + plan.slice(1)}`,
        react: SubscriptionStarted({ /* plan, amount from item.price.unit_amount, dates from item.current_period_end / subscription.trial_end */ }),
        metadata: { subscriptionId: subscription.id, plan },
      });
    }
  }
}
```

Keyed on `subscription.id`, so Stripe redelivering `customer.subscription.created` cannot double-send.

The comment at `:1050-1052` ("covered by subscription_created or the checkout receipt") only becomes accurate once this branch exists, so it needs no rewrite, just this code. Leave the `isRenewal` guard at `:1054` alone; `billing_reason === "subscription_cycle"` correctly excludes `subscription_create`, and that is now the right behaviour because the new email owns the first one.

**Also wire `subscription_card_expiring`**, the sixth subscription template and the only other unwired one. Trigger: a new `customer.source.expiring` / `payment_method.automatically_updated` handler, or a monthly cron reading Stripe. Lower priority than the rest of this section, see §F.

**Test:** extend `tests/integration/stripe-webhook.test.ts`. a `customer.subscription.created` event sends exactly 1 email with template `subscription_started`; redelivering the same event sends 0; a subsequent `invoice.paid` with `billing_reason: "subscription_create"` sends 0; `billing_reason: "subscription_cycle"` sends 1 `subscription_renewal_receipt`.

### D.6 Branded password reset and email verification

**Templates:** `AccountPasswordReset`, `AccountEmailVerification`, `AccountEmailChangeVerify` all exist and are registered (`registry.ts:11,12,18` / `:166,167,173`) and are imported by **zero** routes.

**This is not a code-wiring task.** The mail is sent by Supabase GoTrue, triggered by `supabase.auth.resetPasswordForEmail` (`src/app/(pages)/forgot-password/page.tsx:34`, `src/app/(pages)/customer-portal/settings/page.tsx:25`) and `supabase.auth.signUp` (five call sites). The fix is §A.5: render with `scripts/render-auth-email.ts` and paste into the Supabase dashboard, plus Resend SMTP so the mail is DKIM-signed on your domain.

**Do not** build the webhook-interception path (`OUTSTANDING.md` §2.3). `src/app/api/webhooks/supabase/route.ts` already exists for `auth.suspicious_login` and is the right home if you later want full control, but for MVP the dashboard paste is one hour of work and a webhook re-implementation of GoTrue's token flow is a week plus a new class of security bug.

**Test:** an E2E in `tests/e2e/` that requests a reset for a seeded account and asserts the mail arrives from `tx.wallplace.co.uk` with the Wallplace shell. Practically this needs a real inbox, so gate it behind an env var and run it manually as part of the §A.4 provisioning check rather than in CI. Also add a unit test that `npx tsx scripts/render-auth-email.ts all` produces HTML containing the literal `{{ .ConfirmationURL }}` (this catches the entity-escaping regression `fixSupabaseTokens` exists to prevent).

### D.7 Summary: what needs building

| Template | Status | Trigger to build |
|---|---|---|
| `order_dispute_opened` | **exists** | `POST /api/disputes` (whole endpoint) |
| `order_dispute_resolved` | **exists** | widen select + send in `admin/disputes/[id]` resolve branch |
| `newsletter_subscribe_confirm` | create | `newsletter/route.ts` + new `GET /api/newsletter/confirm` + migration |
| `support_request_received` | create | `contact/route.ts` |
| `subscription_started` | create | `stripe/route.ts` `customer.subscription.created` branch |
| `account_password_reset` / `account_email_verification` / `account_email_change_verify` | **exist** | Supabase dashboard paste + Resend SMTP (§A.5) |

Plus the seven from §B (`operational_admin_alert`, `artist_new_placement_request`, `customer_refund_rejected`, `artist_refund_requested`, `venue_curation_enquiry_received`, `venue_curation_payment_received`, `venue_placement_sale`) and one from §C (`customer_order_cancelled`).

**Total new templates: 11.** Total newly wired existing templates: 5.

---

## E. Verification

### E.1 Dev harness

There is already a preview surface: `src/app/email-preview/page.tsx` (registry browser) and `src/app/email-preview/[id]/page.tsx` (renders `entry.mock` into a sandboxed iframe). It proves a template renders. It does not prove it is wired, and it is **not auth-gated** (its own header comment says so) though `src/app/robots.ts:21` disallows it.

Build `scripts/email-harness.ts` for the rest:

```
npx tsx scripts/email-harness.ts render          # render every registry entry with its mock, fail on any throw
npx tsx scripts/email-harness.ts render --wired  # same, but only ids reachable from a trigger
npx tsx scripts/email-harness.ts send --to me@example.com --only order_dispute_opened
npx tsx scripts/email-harness.ts audit           # print registry ids with no trigger, and triggers with no registry id
```

- `render` iterates `EMAIL_REGISTRY`, calls `render(createElement(entry.component, entry.mock))` and the `{plainText:true}` variant, and fails on a throw, on empty output, or on an unsubstituted `{{token}}` surviving in the subject after `substituteTokens(entry.subject, entry.mock)`. **This is the check that would have caught a `dispatcher.ts:56` token going out literally.**
- `send` goes through the real `sendEmail()` so suppressions, preferences and `email_events` all exercise, but overrides the recipient. Refuses to run when `VERCEL_ENV === "production"`.
- `audit` is the honest replacement for `OUTSTANDING.md:3`. It greps `template: "<id>"` across `src/app` and `src/lib`, resolves the dispatcher's `TEMPLATE_BINDINGS`, and prints the two set differences. Wire it into `npm run check` as a non-failing report first, then make the "trigger references an id that is not in the registry" half an error (that is a real bug class, and `artist_qr_scan_digest` is a live instance).

Add to `package.json`: `"email:render": "tsx scripts/email-harness.ts render"`, `"email:audit": "tsx scripts/email-harness.ts audit"`, and put `email:render` inside `check`.

### E.2 Testing without sending real mail

Three levels, in increasing fidelity.

**Level 1, unit and integration (the default, runs in CI).** No network, no Supabase. Vitest module mock, matching the existing pattern in `tests/integration/stripe-webhook.test.ts:30`:

```ts
const sent: Array<{ template: string; to: string; idempotencyKey: string }> = [];
vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async (i) => { sent.push({ template: i.template, to: i.to, idempotencyKey: i.idempotencyKey }); return { ok: true, skipped: false, messageId: "test" }; }),
}));
```

Assert on `sent`, not on Resend.

**Level 2, dry-run against a real database.** New env var `EMAIL_DRY_RUN=1`. In `src/lib/email/send.ts`, immediately before the provider call at `:189`:

```ts
if (process.env.EMAIL_DRY_RUN === "1") {
  await db.from("email_events").update({ status: "dry_run", sent_at: new Date().toISOString() }).eq("id", queuedRow?.id);
  return { ok: true, skipped: false, messageId: `dryrun-${queuedRow?.id}` };
}
```

Placed **after** the atomic claim at `:166-185`, so the whole pipeline (idempotency, suppression, preference, throttle, render, claim) runs for real and only the network call is stubbed. `status: "dry_run"` is a new value; `email_events.status` is a plain `text` column with no CHECK (`016_...sql:13`), so no migration is needed. Set `EMAIL_DRY_RUN=1` on every Preview deployment.

**Level 3, real sends to a sink.** Use a Resend test API key against a catch-all address, or `resend.dev`'s test addresses (`delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev`) to exercise the suppression path end to end. Manual, part of the §A.4 provisioning check.

### E.3 The E4 regression test

The one test that must exist, because it is the finding that started this. New file `tests/integration/email-one-per-event.test.ts`:

```ts
// Drives a full checkout.session.completed through the Stripe webhook with
// sendEmail mocked, and asserts the exact recipient/template fan-out.
it("one purchase sends exactly one customer email and one artist email", async () => {
  await POST(makeStripeEvent("checkout.session.completed", cartSessionFixture));

  const byRecipient = groupBy(sent, (s) => s.to);
  expect(byRecipient[BUYER_EMAIL]).toHaveLength(1);
  expect(byRecipient[BUYER_EMAIL][0].template).toBe("customer_order_placed");
  expect(byRecipient[ARTIST_EMAIL]).toHaveLength(1);
  expect(byRecipient[ARTIST_EMAIL][0].template).toBe("artist_order_received");
  expect(sent.map((s) => s.template)).not.toContain("customer_order_receipt");
  expect(sent.map((s) => s.template)).not.toContain("artist_work_sold");
  expect(sent.map((s) => s.template)).not.toContain("artist_order_confirmation");
  // every key distinct
  expect(new Set(sent.map((s) => s.idempotencyKey)).size).toBe(sent.length);
});

it("redelivering the same webhook sends nothing new", async () => { /* second POST, sent.length unchanged */ });
it("a revenue-share purchase adds exactly one venue email", async () => { /* venueSlug fixture, 3 total */ });
```

Generalise it into a table-driven test over the §C.5 matrix, so every future lifecycle event gets the same assertion for free:

```ts
it.each(EVENT_MATRIX)("$event sends %s", async ({ event, expected }) => {
  await drive(event);
  expect(sent.map((s) => `${s.to}:${s.template}`).sort()).toEqual(expected.sort());
});
```

This test fails today (customer 2, artist 3) and passes after §C. Write it first.

### E.4 An `email_events` row per attempt

`sendEmail` already writes a row on every terminal outcome: `skipped_suppressed` (`:99`), `skipped_vacation` (`:114`), `skipped_opted_out` (`:119`), `skipped_throttled` (`:136`), `render_failed` (`:149`), `skipped_no_api_key` (`:156`), `queued` on claim (`:166-185`), then `sent` or `failed`.

The one hole (E1d) is the early-return at `:80-82`: a `duplicate` short-circuit writes nothing. That is correct in the common case (the original row exists), but it means "attempts" and "rows" are not one-to-one, and a test asserting "one row per attempt" will fail on the second attempt. Resolve it by asserting the right invariant instead: **one row per distinct idempotency key, and its final status is terminal.**

Add `tests/integration/email-events-audit.test.ts` with a fake Supabase client that records upserts:
- every skip reason writes a row with the matching status
- a render failure writes `render_failed` **and** returns `ok:false`
- a provider error writes `failed` with the message
- the same key twice yields one row
- `logEvent`'s `metadata` never contains a raw email body or a token (grep the serialised metadata for `@` beyond the `to_email` column and for `eyJ`-prefixed strings)

### E.5 CI wiring

Add to `.github/workflows/ci.yml`:
- `npm run email:render` (fails the build on any template that cannot render or leaves an unsubstituted subject token)
- `npm run email:audit` (report-only at first, error once clean)
- the new eslint integration tests run automatically under `npm run test`

Per the master runbook §1.1, lint currently runs with `continue-on-error: true`, so `no-legacy-email-import` blocks nothing until that flag is cleared. **Clear it, or this whole guard is decoration.** The rule is worth writing anyway because it will start blocking the moment CI is fixed, but do not claim the legacy module "cannot come back" until the flag is gone.

---

## F. MVP scope call

123 templates is a library built ahead of the product. The honest MVP number is far smaller. The test is: **if this email does not send, does someone lose money, lose access, or think the site is broken?**

### F.1 Must work at launch (32 templates)

**Order lifecycle (9):** `customer_order_placed`, `artist_order_received`, `customer_order_processing`, `customer_order_out_for_delivery`, `customer_order_delivered`, `customer_confirm_delivery_48h`, `customer_order_cancelled` *(new)*, `customer_refund_confirmation`, `artist_refund_notification`.

**Refunds and disputes (5):** `customer_refund_rejected` *(new)*, `artist_refund_requested` *(new)*, `order_dispute_opened`, `order_dispute_resolved`, `operational_admin_alert` *(new)*.

**Money to artists and venues (4):** `artist_payout_sent`, `artist_payout_failed`, `artist_stripe_kyc_needed`, `venue_placement_sale` *(new)*.

**Subscriptions (5):** `subscription_started` *(new)*, `subscription_payment_failed`, `subscription_cancelled`, `subscription_renewal_receipt`, `subscription_trial_ending`. All five are money or access. `subscription_upgraded` is already wired and can stay, it costs nothing.

**Placement lifecycle (5):** `venue_new_placement_request`, `artist_new_placement_request` *(new)*, `artist_placement_request_sent`, `artist_placement_accepted`, `artist_placement_declined`. These are the transaction on the non-purchase side of the marketplace.

**Auth and account (3):** `account_email_verification`, `account_password_reset`, `account_password_changed`. Via Supabase (§A.5). `account_suspicious_login` is already wired through `webhooks/supabase` and stays.

**Support and applications (5):** `support_request_received` *(new)*, `artist_application_submitted`, `artist_application_approved`, `artist_application_rejected`, `venue_registration_confirmation`. A person who applies and hears nothing assumes the site is broken.

**Messages (1):** `message_unread_notification`. Marginal, but a marketplace where a message sits unread forever does not transact.

### F.2 Stays wired because it already works (about 20)

The onboarding nudges and welcome checklists (`cron/onboarding-nudges`, `lib/email/welcome.ts`), the re-engagement sweep (`cron/inactive-users`), the two weekly digests, the placement crons, `customer_waitlist_confirmation`, `offer_received_notification`, `review_posted_notification`, `placement_*` operational templates. All already have triggers and are throttled. Deleting them is more work than leaving them. Do not spend a minute polishing them.

### F.3 Stays unwired for MVP (about 57, unchanged)

**Newsletters (5):** `newsletter_monthly_gallery`, `newsletter_artist_spotlight`, `newsletter_venue_spotlight`, `newsletter_curators_picks`, `newsletter_local_art_near_you`. Need an editorial pipeline and an admin send UI (`OUTSTANDING.md` §4). The only newsletter work in MVP is `newsletter_subscribe_confirm` *(new)*, and that is for GDPR consent, not for sending anything.

**Upsells and premium (6):** `artist_tier_cap_hit`, `artist_premium_upgrade_educational`, `venue_analytics_upgrade`, `venue_managed_curation_upgrade`, `venue_managed_curation_pitch`, `venue_rotation_reminder`. Optimise revenue on a base you do not have yet.

**Re-engagement beyond what's wired, discovery, saved works, follows (10ish):** `customer_saved_work_back_in_stock`, `customer_saved_work_price_drop`, `customer_saved_works_digest`, `customer_new_work_from_followed_artist`, `customer_follow_artist_nudge`, `customer_abandoned_checkout_1h`, `customer_abandoned_checkout_24h`, `artist_new_venue_match`, `venue_new_artist_matches`, `artist_low_engagement_tips`. Every one needs a feature that does not exist (a `follows` table, a `checkout_sessions` table, a matching cron). See `OUTSTANDING.md` §3.

**Account ops (7):** `account_two_factor_enabled`/`_disabled`, `account_data_export_ready`, `account_deletion_requested`, `account_deletion_confirmed`, `account_team_invite`, `account_team_invite_accepted`. All need flows that do not exist. `account_deletion_*` and `account_data_export_ready` become mandatory the moment you get a real GDPR request; that is a fast-follow, not a launch blocker.

**Admin actions (4):** `operational_policy_violation_warning`, `operational_account_restricted`, `operational_account_restored`, `operational_platform_incident`. Need admin UI.

**Legal broadcasts (3):** `legal_terms_update`, `legal_privacy_update`, `artist_tax_document_ready`. Manual sends when they happen; a broadcast tool is not launch-blocking.

**Performance and vanity (6):** `artist_first_qr_scan`, `artist_qr_scan_milestone`, `artist_year_in_review`, `venue_placement_anniversary`, `message_hourly_digest`, `user_repermission_campaign`.

**Retired by §C (5):** `customer_order_receipt`, `artist_work_sold`, `artist_order_confirmation`, `customer_shipping_confirmation`, `customer_delivery_confirmation`.

### F.4 The honest summary

- 11 new templates to build.
- 5 existing templates to newly wire (2 dispute, 3 auth via Supabase paste).
- 3 templates to retire from the order path, 2 more already unreachable.
- 32 templates in the must-work set.
- 57 stay unwired, deliberately, and `OUTSTANDING.md` should be rewritten to say so instead of implying they are pending work.

---

## G. Ordered task checklist

Each numbered item is one PR: single concern, green `npm run check`, ships with its own test. Items within a group can go in parallel; groups are ordered by dependency.

### Group 0, make it observable (do first, half a day)

- [x] **0.1** Add `src/instrumentation.ts` boot assertion (§A.6 layer 1). Test: unit test on the extracted `missingEmailEnv()` helper.
- [x] **0.2** Change `send.ts:154-158` so production returns `{ok:false, error:"email_not_configured"}` and logs (§A.6 layer 2). Test: `send.test.ts` asserting both branches with `VERCEL_ENV` stubbed.
- [x] **0.3** Add `GET /api/health/email` returning 503 when unconfigured or when `skipped_no_api_key > 0` in 24h (§A.6 layer 3). Test: route test with a fake Supabase client.
- [x] **0.4** Add `EMAIL_DRY_RUN` short-circuit after the idempotency claim (§E.2 level 2). Test: dry-run writes `status:"dry_run"` and never calls the provider.
- [ ] **0.5** OPEN, owner. Nothing in the repository can observe DNS, Resend or Vercel env state. **Owner:** Resend domain `tx.wallplace.co.uk` verified, DNS records live, DMARC at `p=none`, mailboxes created, Vercel env vars set (§A.1–A.3). Verify with §A.4.

### Group 1, stop the duplicates (the user-visible bug)

- [x] **1.1** Write `tests/integration/email-one-per-event.test.ts` (§E.3). It must **fail** on `main`. Commit it failing behind `it.fails` or in the same PR as 1.2.
- [x] **1.2** Add `billingAddress?` to `CustomerOrderPlaced`, `saleAmount?` to `ArtistOrderReceived` (§C.3).
- [x] **1.3** Delete `stripe/route.ts:524-559`, `:571-613`, `:615`; move and enrich the `recordOrderEvent` call (§C.3). Test 1.1 goes green.
- [x] **1.4** Retire `customer_order_receipt`, `artist_work_sold`, `artist_order_confirmation`, `customer_shipping_confirmation`, `customer_delivery_confirmation`. **Enforced by a test rather than a registry field**: `email-one-per-event.test.ts` holds all five unreferenced by any send, which a `retired: true` flag nobody reads would not.
- [x] **1.5** Add `customer_order_cancelled`, extend `TransactionalTemplate` / `TEMPLATE_BINDINGS` / `emailsForEvent`, delete `notifyBuyerStatusUpdate` from `orders/route.ts:236-254` (§C.4).
- [x] **1.6** Register the orphan `artist_qr_scan_digest` (§C.3).

### Group 2, one pipeline

- [x] **2.1** Add the `internal_ops` category, `OperationalAdminAlert` template, `src/lib/email/admin.ts` (§B.3). **Shipped as `platform_admin` + `AdminAlert` + `src/lib/email/admin-alert.ts`.** `platform_admin` already existed with the exact three values §B.3 specifies (`stream: "tx"`, `criticalAlwaysSend: true`, `throttleCount: 0`), so a second identical category would have been the duplication this document exists to remove.
- [x] **2.2** Extract `sendMessageUnreadEmail` to `src/lib/email/notifications.ts` (§B.4).
- [x] **2.3** Build the six new customer-facing templates from §B.4 and register them. **Three shipped under different ids:** `artist_new_placement_request` → `venue_new_placement_request` + `artist_new_placement_invitation` (the shipped pair splits by recipient, which one name cannot), `venue_curation_enquiry_received` → `curation_enquiry_received`, `venue_curation_payment_received` → `curation_payment_received`, `venue_placement_sale` → `venue_sale_from_placement`.
- [x] **2.4** Migrate the 7 admin call sites (apply, contact, curation, enquiry, refunds/request ×2, register-venue) to `sendAdminAlert`, adding `.select("id")` where an id is needed for the key (§B.3).
- [x] **2.5** Migrate the 10 customer-facing call sites (§B.4), including deleting the duplicate `notifyRefundDecision` at `refunds/process:305` (E5b) and the dead `notifyPlacementResponse` import (E5d).
- [x] **2.6** `git rm src/lib/email.ts`. Update all 7 test files to mock `@/lib/email/send` and `@/lib/email/admin`.
- [x] **2.7** **Shipped as the `one-email-entrypoint` dependency-cruiser rule plus `tests/integration/no-legacy-email.test.ts`.** The cruiser catches relative paths to the deleted module that an import-name lint rule would miss, and it runs in `depcheck`, which `check` includes.
- [x] **2.8** Extend `no-unawaited-critical-sideeffect` to `sendEmail`/`sendTransactional`/`sendAdminAlert`/`recordOrderEvent`; fix the resulting violation at `placements/route.ts:623`; extend its test (§B.6).
- [x] **2.9** Point `no-inline-admin-check`'s exemption at `src/lib/email/admin.ts` instead of the deleted `src/lib/email.ts`; add both test cases (§B.3).

### Group 3, wire the gaps

- [ ] **3.1** OPEN, owner (Supabase dashboard). **Owner:** render and paste the three Supabase auth templates; switch Supabase Auth to Resend SMTP (§A.5). Then advance DMARC to stage 2.
- [x] **3.2** Add `emailRedirectTo` to the two `signUp()` calls that lack it (`AuthContext.tsx:123`, `apply/claim/page.tsx:61`); add `POST /api/auth/resend-verification` (§A.5).
- [x] **3.3** Build `SubscriptionStarted` + the `customer.subscription.created` branch; fix the comment at `stripe/route.ts:1050-1052` (§D.5).
- [x] **3.4** Build `SupportRequestReceived` + the contact-form acknowledgement, with the reflected-send rate limit (§D.4).
- [x] **3.5** Newsletter double opt-in: migration, `NewsletterSubscribeConfirm`, `newsletter/route.ts` send, `GET /api/newsletter/confirm` (§D.3).
- [x] **3.6** Dispute resolved: widen the select in `admin/disputes/[id]/route.ts:40`, send to both parties (§D.2).
- [x] **3.7** Dispute opened: build `POST /api/disputes` end to end, give `disputed` a real event type in `event-vocabulary.ts`, send to both parties + admin (§D.1). **Largest item in this document; it is a feature, not a wiring task.**

### Group 4, verification and cleanup

- [x] **4.1** Build `scripts/email-harness.ts` (`render` / `send` / `audit`); add `email:render` and `email:audit` npm scripts; put `email:render` in `check` (§E.1).
- [x] **4.2** Add `tests/integration/email-events-audit.test.ts` (§E.4).
- [x] **4.3** Generalise 1.1 into the table-driven matrix test over §C.5 (§E.3).
- [x] **4.4** Add `email:render` and `email:audit` to CI; **clear `continue-on-error: true` on the lint job** so every rule in this document actually blocks (§E.5, master runbook §1.1).
- [x] **4.5** Rewrite `src/emails/OUTSTANDING.md` from `email:audit` output. Delete §1.1/§1.2 (done in 0.5), §2.1 (done in 3.1), and the stale "113 · 50 · 63" line.
- [x] **4.6** Add `no-raw-arrangement-type` integration test (the one registered rule with no test).
- [ ] **4.7** OPEN, owner (DNS, staged over weeks). **Owner:** advance DMARC through stages 3 and 4 on the schedule in §A.2, watching `rua` reports at each step.
- [ ] **4.8** OPEN, time-based and gated on the `08` rewrite. After a fortnight of clean production sends, delete the five retired template files in the §08 cull pass.

### Explicitly out of scope

Inngest or QStash for delayed/batched sends (`OUTSTANDING.md` §6), the newsletter studio admin UI (§4), abandoned-checkout tracking, the follows and saved-works tables, team invites, 2FA and data-export flows, and every §7 upsell. All of these are features first and emails second.
