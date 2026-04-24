# Wallplace email templates

A React Email template library with 113 templates, a central registry, a
live preview route, and a unified send pipeline (`@/lib/email/send`).

## Quick start

```bash
# Dev: browse all templates
open http://localhost:3000/email-preview

# Filter by stream / persona / category + search by id
# Click any template to see rendered HTML, subject, preview text,
# plain-text fallback, and the exact mock props used.
```

## Folder layout

```
src/emails/
├── _components/         Shared design system — EmailShell, Button, WorkCard, …
├── data/                Reusable entity mocks (mockArtist, mockVenue, …)
├── types/               Shared TS types (Work, Artist, Venue, Placement, Money, …)
├── templates/           113 templates, grouped by concern
│   ├── account/
│   ├── onboarding/{artist,venue,customer}/
│   ├── placements/
│   ├── messages/
│   ├── performance/
│   ├── venue-lifecycle/
│   ├── orders/
│   ├── payments/
│   ├── artist-additions/
│   ├── premium/
│   ├── customer-sales/
│   ├── re-engagement/
│   ├── newsletter/
│   └── legal/
├── registry.ts          Single source of truth — every template listed here
├── registry-types.ts    The TemplateEntry shape
└── README.md            ← you are here
```

## The template contract

Every template file exports three things and **default-exports a registry entry**:

```tsx
// src/emails/templates/account/AccountEmailVerification.tsx
export interface AccountEmailVerificationProps { … }

export function AccountEmailVerification(props: Props) {
  return <EmailShell stream="tx" persona="multi" preview="…">…</EmailShell>;
}

export const mock: AccountEmailVerificationProps = { … };

const entry: TemplateEntry<AccountEmailVerificationProps> = {
  id: "account_email_verification",
  stream: "tx", persona: "multi", category: "security",
  subject: "Confirm your Wallplace account",
  previewText: "Tap the button to finish signing up.",
  component: AccountEmailVerification,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1, // 1 = MVP, 2 = near-term, 3 = later
};
export default entry;
```

Adding a new template = create the file, push its default into
`EMAIL_REGISTRY` in `registry.ts`. That's it.

## Streams

Three sending streams, each ideally mapped to its own subdomain so
reputation stays isolated. All three can point at the same verified
domain during MVP — move to separate domains as volume grows.

| Stream | Purpose | Examples | Footer |
|---|---|---|---|
| `tx` | Transactional critical | Email verify, password reset, order receipt, payouts, contracts, legal | Support + legal links only. No unsubscribe. |
| `notify` | Relational / operational | Placement requests, accept/decline, messages, digests | Preference centre + category unsubscribe |
| `news` | Marketing / editorial | Newsletter, trial ending, re-engagement, promotions | Full unsubscribe + one-click + preference centre |

The footer switches behaviour automatically based on the `stream` prop
on `<EmailShell>`.

## Personas

Same shell, subtle accent + voice differences:

- `artist` — warm orange accent (`#C17C5A`), progress-oriented
- `venue` — muted charcoal accent (`#2F3A4A`), professional
- `customer` — editorial near-black, gallery-catalogue feel
- `multi` — brand orange, both parties
- `system` — grey (rarely used; internal)

## Categories

Drive preference toggles and throttling. Defined in
`src/lib/email/categories.ts`:

```
security, legal, orders_and_payouts    → tx (never throttled, never suppressible)
placements, messages                   → notify (throttled per category)
digests, recommendations               → notify (weekly-ish cap)
tips                                   → news (twice per week cap)
newsletter, promotions                 → news (opt-in only)
```

## Sending a template

Import the component, call `sendEmail()`. The pipeline handles
idempotency, suppression check, preference check, vacation mode,
throttle, render, send, log.

```ts
import { sendEmail } from "@/lib/email/send";
import { AccountEmailVerification } from "@/emails/templates/account/AccountEmailVerification";

await sendEmail({
  idempotencyKey: `verify:${user.id}:${tokenHash}`,
  template: "account_email_verification",
  category: "security",
  to: user.email,
  subject: "Confirm your Wallplace account",
  userId: user.id,
  react: AccountEmailVerification({
    firstName: profile.firstName,
    verificationUrl: `${SITE}/verify?t=${token}`,
    expiresIn: "24 hours",
    supportUrl: `${SITE}/support`,
  }),
});
```

**Always set an `idempotencyKey`.** Webhook retries, double-clicks, and
scheduler retries are all expected — the idempotency key prevents
double-sends.

## MVP wiring (already live)

These are hooked up and will send the moment `RESEND_API_KEY` is set in
production env:

| Template | Triggered at |
|---|---|
| `venue_new_placement_request` | `POST /api/placements` (artist-initiated path) |
| `artist_placement_accepted` | `PATCH /api/placements` on pending → active |
| `artist_placement_declined` | `PATCH /api/placements` on pending → declined (artist was requester) |
| `placement_venue_declined_artist_request` | `PATCH /api/placements` on pending → declined (venue was requester) |
| `artist_application_submitted` | `POST /api/apply` |
| `customer_order_receipt` | Stripe `checkout.session.completed` |
| `artist_work_sold` | Stripe `checkout.session.completed` |
| `artist_payout_sent` | Stripe `payout.paid` |
| `message_unread_notification` | `POST /api/messages` (sends immediately — see TODO below) |

## MVP wiring (still required)

### 1. Email verification + password reset

These come from Supabase Auth, not your API routes. Two options:

**Option A — use Supabase's hosted emails (simplest)**
In Supabase Dashboard → Auth → Email Templates, paste the rendered HTML
from `AccountEmailVerification` and `AccountPasswordReset`. Use
`@react-email/render` in a local script to generate the HTML:

```ts
// scripts/render-auth-emails.ts
import { render } from "@react-email/components";
import { AccountEmailVerification } from "@/emails/templates/account/AccountEmailVerification";
const html = await render(AccountEmailVerification({
  firstName: "{{ .Data.first_name | default: \"there\" }}",
  verificationUrl: "{{ .ConfirmationURL }}",
  expiresIn: "24 hours",
  supportUrl: "https://wallplace.co.uk/support",
}));
console.log(html);
```

Paste the output into Supabase's "Confirm signup" email template.

**Option B — custom SMTP via Resend (full control)**
In Supabase Dashboard → Project Settings → Auth → SMTP Settings,
configure Resend as the SMTP provider. Still uses Supabase's template
editor but sends via your Resend IP reputation.

**Option C — intercept auth webhooks (most flexibility, most work)**
Supabase emits `user.created` / `password.reset.requested` webhooks. Hook
those up to a route that calls `sendEmail()`. More control, more moving
parts.

### 2. Welcome checklists (per persona)

Fire after email verification. Hook into:

- Supabase auth `user.email_verified` webhook, OR
- The first API call the newly-verified user makes (flag-based: send
  once, set `welcomed_at` on the profile row)

```ts
// pseudo-code — wherever you handle the "user just verified" event
if (!profile.welcomed_at) {
  if (profile.type === "artist") {
    await sendEmail({
      idempotencyKey: `welcome:${user.id}`,
      template: "artist_welcome_checklist",
      category: "recommendations",
      to: user.email,
      subject: `Welcome to Wallplace, ${profile.first_name}`,
      userId: user.id,
      react: ArtistWelcomeChecklist({ … }),
    });
  }
  // + venue / customer variants
  await db.from("profiles").update({ welcomed_at: new Date() }).eq("id", profile.id);
}
```

### 3. Shipping confirmation

Needs an artist "mark shipped" action. When built, call:

```ts
await sendEmail({
  idempotencyKey: `shipped:${orderId}`,
  template: "customer_shipping_confirmation",
  category: "orders_and_payouts",
  to: order.buyerEmail,
  subject: `Your order ${orderId} is on its way`,
  react: CustomerShippingConfirmation({ … }),
});
```

## Delayed / scheduled sends

The pipeline sends immediately by default. Three classes of trigger need
a scheduler:

### Delayed events (10 min "maybe-send" pattern)

Used for: `message_unread_notification` (only send if still unread at
10min), `customer_abandoned_checkout_1h/24h`.

Pick **Inngest** (recommended) or **QStash**. Example with Inngest:

```ts
// 1. On the triggering event:
await inngest.send({
  name: "email/message.maybe-send",
  data: { messageId, recipientUserId },
  delay: "10m",
});

// 2. The Inngest function:
export const maybeSendMessageEmail = inngest.createFunction(
  { id: "message-email-maybe" },
  { event: "email/message.maybe-send" },
  async ({ event, step }) => {
    const stillUnread = await step.run("check-unread", () =>
      isMessageStillUnread(event.data.messageId)
    );
    if (!stillUnread) return;
    await sendEmail({ /* as above */ });
  }
);
```

Today's wiring sends immediately on every message. Swap to the delayed
pattern once Inngest is set up.

### Cron-based (scheduled)

Used for: weekly digests (Tue/Wed 9am), trial ending reminders (3d/1d
out), card expiring (30d out), placement ending soon (14d out).

Use **Vercel Cron** — one file per schedule:

```ts
// src/app/api/cron/weekly-artist-digest/route.ts
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  // Require the cron secret so random callers can't trigger sends.
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = getSupabaseAdmin();
  const { data: artists } = await db.from("artist_profiles").select("…");
  for (const artist of artists || []) {
    const weekStats = await computeStats(artist.user_id);
    if (weekStats.notableEvents < 3) continue; // skip empty weeks
    await sendEmail({
      idempotencyKey: `weekly-digest:${artist.user_id}:${isoWeek(new Date())}`,
      template: "artist_weekly_portfolio_digest",
      category: "digests",
      to: artist.email,
      subject: `Your week on Wallplace`,
      userId: artist.user_id,
      react: ArtistWeeklyPortfolioDigest({ … }),
    });
  }
  return NextResponse.json({ sent: artists?.length ?? 0 });
}
```

In `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/weekly-artist-digest", "schedule": "0 9 * * 2" },
    { "path": "/api/cron/weekly-venue-digest",  "schedule": "0 9 * * 3" },
    { "path": "/api/cron/placement-ending-soon", "schedule": "0 10 * * *" },
    { "path": "/api/cron/card-expiring",        "schedule": "0 10 * * *" },
    { "path": "/api/cron/trial-ending",         "schedule": "0 10 * * *" },
    { "path": "/api/cron/re-engagement",        "schedule": "0 10 * * *" }
  ]
}
```

### State-based (cron + DB query)

Used for: `artist_inactive_14d/30d/90d`, `venue_inactive_*`,
`customer_inactive_*`, `artist_qr_scan_milestone`.

Same pattern as cron — daily job that queries users in the right state
and sends. Remember to include a skip on `last_email_opened_at` to avoid
re-engaging users who are already engaged by email.

## Domain setup in Resend

1. Resend → Domains → Add → `tx.wallplace.co.uk` (region: Dublin)
2. Copy the 3 DNS records Resend shows
3. Paste into your DNS provider (wherever `wallplace.co.uk` lives)
4. Resend → Verify. Usually 5–15 min.
5. Add on the root domain: `_dmarc` TXT with
   `v=DMARC1; p=none; rua=mailto:dmarc@wallplace.co.uk; pct=100`
6. Repeat for `notify.wallplace.co.uk` and `news.wallplace.co.uk` as
   volume grows.

Env vars expected by `streams.ts`:

```
RESEND_API_KEY=re_xxx
EMAIL_FROM_TX=Wallplace <noreply@tx.wallplace.co.uk>
EMAIL_FROM_NOTIFY=Wallplace <notifications@notify.wallplace.co.uk>
EMAIL_FROM_NEWS=Wallplace <hello@news.wallplace.co.uk>
EMAIL_REPLY_TO=hello@wallplace.co.uk
```

Until `notify.` and `news.` are verified, all three can point at `tx.`.

## Compliance checklist

- [x] RFC 8058 one-click unsubscribe headers set for non-tx streams
- [x] Physical postal address in every footer
- [x] Preference centre link in every notify/news footer
- [x] Category-scoped unsubscribe URL
- [x] Unsubscribe writes to `email_suppressions`
- [x] Hard bounces auto-added to `email_suppressions`
- [x] `security` / `legal` / `orders_and_payouts` never respect suppressions
- [ ] DMARC `p=reject` (start on `p=none` for 2 weeks → `p=quarantine` → `p=reject`)
- [ ] BIMI (month 3+, needs verified mark certificate)
- [ ] Dedicated IPs on `news.` and `notify.` when volume > 50k/month

## Not yet built

The following are deliberately out of scope — flagging for future
product decisions:

- **In-app calling** (item 16 from original roadmap)
- **Payment authorization hold** (item 22)
- **Internal Slack/PagerDuty alerts** — email is the wrong channel;
  use Slack webhooks instead

Templates deliberately omitted (see the earlier product discussion):

- Editorial variants needing ongoing copy (`_educational`, `_case_study`)
- Internal alerts (belong in Slack/PagerDuty)

## Running the preview

The preview lives at `/email-preview`. It's not gated by auth by
default — add a middleware check or block via `robots.txt` if you want
it hidden in production.

```ts
// Example middleware gate
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/email-preview")) {
    if (process.env.NODE_ENV === "production" && !req.cookies.get("admin-token")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }
}
```
