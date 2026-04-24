# Wallplace — external setup checklist

Everything the code can't do on its own. Grouped by blocker (what does this
gate?) and within each by service (so you can batch dashboard visits).

Status legend: ⬜ = not done · ✅ = done · ⚠️ = partial / verify

---

## 🔴 Must-do before ANY real users

Hard blockers — security, legal, or the app simply doesn't work.

### DNS provider (currently parked at `dns-parking.com`)

- ⬜ Move `wallplace.co.uk` DNS off `dns-parking.com` to a real provider:
  Cloudflare (recommended — free, fast, includes DDoS), Namecheap,
  or Google Domains. Wherever the domain is registered, update the
  nameservers to point at the DNS host.
- ⬜ Once moved, re-point the apex `A`/`AAAA` records at Vercel
  (Vercel tells you the values when you add the domain).
- ⬜ Add a DMARC record on the root:
  - Type: `TXT`
  - Name: `_dmarc`
  - Value: `v=DMARC1; p=none; rua=mailto:dmarc@wallplace.co.uk; pct=100`
- Record whichever DNS provider you pick so future Resend verifications
  know where to add records.

### Supabase dashboard


- ⬜ **Verify the RLS lockdown worked.** In SQL editor:
  ```sql
  SET LOCAL ROLE anon;
  SELECT count(*) FROM placements;                   -- must be 0
  SELECT count(*) FROM orders;                       -- must be 0
  SELECT count(*) FROM artist_applications;          -- must be 0
  SELECT count(*) FROM artist_profiles WHERE review_status <> 'approved';  -- 0
  RESET ROLE;
  ```
  If any return >0, Supabase's default `anon` SELECT grant is still in
  effect. Tell me — I'll write `REVOKE SELECT ON <table> FROM anon;`
  statements for a follow-up migration.
- ⬜ Flip the `contracts` bucket to **private**. Dashboard → Storage →
  Buckets → `contracts` → Settings → toggle "Public" OFF.
- ⬜ Enable MFA on your Supabase admin login (Account → Security).
- ⬜ Confirm automatic backups are on (Database → Backups). On the free
  tier, PITR is not available. Upgrade to Pro ($25/mo) for 7-day PITR
  before taking payments.
- ⬜ Review the **remaining** 32 pending migrations (001–033) — confirm
  they've all been applied. Run `supabase migration list` to check.

### Stripe dashboard

- ⬜ Create the webhook endpoint at `https://wallplace.co.uk/api/webhooks/stripe`
  (Developers → Webhooks → Add endpoint).
- ⬜ Enable these events on the endpoint:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `customer.subscription.trial_will_end`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `payout.paid`
  - `payout.failed`
  - `account.updated`
  - `transfer.reversed`
- ⬜ Copy the webhook's **Signing secret** → `STRIPE_WEBHOOK_SECRET`.
- ⬜ Create Products + Prices in the Stripe dashboard:
  - Core monthly + annual
  - Premium monthly + annual
  - Pro monthly + annual
  - Copy each `price_…` id → the six `STRIPE_PRICE_*` env vars
- ⬜ Stripe Connect (for artist payouts) — activate the platform:
  Connect → Settings → Branding + business info. Until this is
  activated, artists can't connect their accounts.
- ⬜ Enable MFA on your Stripe admin login.

### Resend

- ⬜ Sign up / log in at resend.com.
- ⬜ Add domain `tx.wallplace.co.uk` (Domains → Add Domain, region EU).
- ⬜ Copy the 3 DNS records Resend shows → paste into your DNS provider
  (from §DNS above).
- ⬜ Click Verify — typically 5–15 min after DNS propagates.
- ⬜ Create an API key → copy to `RESEND_API_KEY` env.
- ⬜ Later (no rush, only when volume > a few hundred/day):
  add `notify.wallplace.co.uk` and `news.wallplace.co.uk` as
  separate domains so reputation stays isolated.

### Upstash Redis

- ⬜ Sign up at upstash.com (free tier = 10k commands/day, fine for launch).
- ⬜ Create a Redis database → region Frankfurt/Ireland (match Vercel EU).
- ⬜ Copy **REST URL** → `UPSTASH_REDIS_REST_URL`.
- ⬜ Copy **REST Token** → `UPSTASH_REDIS_REST_TOKEN`.
- ⬜ (Without these, rate limiting falls back to in-memory per-instance —
  useless in production. The app logs a single warning in prod when
  unset so you can spot it in Vercel logs.)

### Vercel

- ⬜ Import the repo, if not already.
- ⬜ Set the project root to `website/` (monorepo layout).
- ⬜ Set all production env vars from `website/.env.example`:
  ```
  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL,
  ADMIN_EMAILS, CRON_SECRET,
  STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_CORE, STRIPE_PRICE_CORE_ANNUAL,
  STRIPE_PRICE_PREMIUM, STRIPE_PRICE_PREMIUM_ANNUAL,
  STRIPE_PRICE_PRO, STRIPE_PRICE_PRO_ANNUAL,
  RESEND_API_KEY, EMAIL_FROM_TX, EMAIL_FROM_NOTIFY,
  EMAIL_FROM_NEWS, EMAIL_REPLY_TO,
  UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
  ```
- ⬜ Generate `CRON_SECRET` — any random 32-char string
  (`openssl rand -hex 32`). Set in Vercel → Environment Variables.
- ⬜ Add custom domain `wallplace.co.uk` (Project → Settings → Domains).
- ⬜ Verify Vercel Cron sees `vercel.json` — check Settings → Cron Jobs
  after first deploy. Six jobs should appear (weekly digests × 2,
  ending-soon, review-request, inactive, onboarding).
- ⬜ Enable MFA on your Vercel account.

### GitHub

- ⬜ Enable branch protection on `main`:
  - Require pull request reviews
  - Require status checks to pass: `check`, `e2e`
  - Require branches to be up to date before merging
- ⬜ Enable MFA for every repo collaborator (Organization settings).
- ⬜ Enable Dependabot alerts + security updates (Settings → Code security).

---

## 🟡 Must-do before taking real payments

Legal + regulatory + fraud risk.

### Legal / compliance

- ⬜ Publish **Terms of Service** at `/terms` (page exists but content
  may be placeholder — verify).
- ⬜ Publish **Privacy Policy** at `/privacy`. Must list every
  sub-processor: Supabase (EU), Stripe (US — flag the SCC/DPF
  transfer), Resend (US or EU — check), Upstash (EU), Vercel (US + EU),
  and any analytics provider you add.
- ⬜ Publish **Cookie Policy** + add a cookie consent banner if you add
  any non-essential cookies (analytics, marketing). Essential-only
  (session, CSRF) is exempt under ICO.
- ⬜ Register with the **ICO** as a data controller (£40–£2,900/year
  depending on turnover — almost certainly the £40 tier).
- ⬜ Sign **Data Processing Agreements** (DPAs) with each sub-processor:
  Supabase, Stripe, Resend, Upstash, Vercel. They all have standard
  DPAs in their Trust/Compliance pages — just countersign.
- ⬜ Consumer Rights (CCR 2013): order receipt is mandatory ✅
  (the `customer_order_receipt` template handles this).
- ⬜ Consumer Contracts Regulations: 14-day right to cancel needs to be
  surfaced in the customer checkout flow + confirmation email. Check
  the current wording.
- ⬜ HMRC: register for VAT once UK turnover > £90k (12-month rolling).
  Not urgent at launch unless you expect volume.
- ⬜ Decide: do you also need to register as a trader in the EU
  (post-Brexit)? Probably yes if you plan to ship there.

### Stripe — go live

- ⬜ Complete Stripe **account activation**: business details, tax IDs,
  bank account (for platform fees), ownership declaration.
- ⬜ Activate Stripe Connect + complete platform review (Stripe requires
  info about how you onboard and verify artists).
- ⬜ Create the live webhook endpoint (the one above was test-mode).
- ⬜ Configure **Radar rules** for fraud (Settings → Radar → Rules):
  - Block payments > £10,000 with high risk
  - Block failed CVC checks on amount > £500
  - Allow review > £500 unless velocity check
- ⬜ Enable payment methods: cards, Apple Pay, Google Pay, (optionally) Klarna.
- ⬜ Tax collection: enable **Stripe Tax** for automatic VAT.
- ⬜ Configure payout schedule (default: rolling 7-day, can change).

### Support infrastructure

- ⬜ Create an actual inbox for `hello@wallplace.co.uk` (code hardcodes
  this address). Options: Google Workspace, Fastmail, Proton.
- ⬜ Set up auto-responder acknowledging receipt.
- ⬜ Document a support SLA (e.g., reply within 2 business days).
- ⬜ Create `dmarc@wallplace.co.uk` inbox to catch DMARC reports.
- ⬜ Create `dpo@wallplace.co.uk` or `privacy@wallplace.co.uk` for DSR
  requests (GDPR data subject requests).

### Supabase Auth — email templates

- ⬜ Go to Authentication → Email Templates in Supabase dashboard.
- ⬜ Render the React Email templates to HTML:
  ```bash
  # Local one-liner — or write scripts/render-auth-emails.ts
  cd website
  node -e "require('@react-email/render').render(require('./src/emails/templates/account/AccountEmailVerification').AccountEmailVerification({firstName:'{{ .Data.first_name | default: \"there\" }}', verificationUrl:'{{ .ConfirmationURL }}', expiresIn:'24 hours', supportUrl:'https://wallplace.co.uk/support'})).then(h=>console.log(h))"
  ```
- ⬜ Paste HTML into the "Confirm signup" template.
- ⬜ Repeat for "Magic Link / Recovery" (AccountPasswordReset).
- ⬜ Repeat for "Change Email" (AccountEmailChangeVerify).
- ⬜ **Alternative** (recommended once Resend is verified): Settings →
  Auth → SMTP Settings → use Resend as SMTP. Then Supabase's templates
  send via your verified domain.

---

## 🟡 Must-do before public launch

Polish, monitoring, and risk mitigation once humans are actually using it.

### Monitoring

- ⬜ **Sentry** or similar error tracker — create project, add
  `@sentry/nextjs` SDK, configure `SENTRY_DSN` env. Not wired in code
  yet; flag this to me when you want it and I'll wire it.
- ⬜ **Uptime monitoring** — UptimeRobot (free), Better Stack, or
  Vercel's built-in. Ping `/` and `/api/health` (need to add a health
  route). Alert on 2+ consecutive failures.
- ⬜ **Log aggregation** — Vercel's built-in log viewer is enough for
  MVP; Axiom / Datadog / BetterStack Logs for anything bigger.
- ⬜ **Stripe webhook failure alerts** — Stripe dashboard → Webhooks →
  your endpoint → Alerts tab → email on 3 consecutive failures.
- ⬜ **Status page** — optional but nice. statuspage.io, Instatus, or
  a simple hand-rolled `/status` page. Not urgent until you have real
  users complaining.

### Analytics

- ⬜ Pick one: **Vercel Analytics** (already in the CSP allowlist, works
  out of the box), **Plausible** (privacy-first, paid), **PostHog**
  (product analytics + events). Vercel Analytics is the least friction.
- ⬜ Submit sitemap to Google Search Console
  (`wallplace.co.uk/sitemap.xml` already generated). Add your
  admin Google account as owner.
- ⬜ Submit to Bing Webmaster Tools (same sitemap).
- ⬜ Decide on **Google Postmaster Tools** registration once sending
  volume > 100/day. Confirms inbox placement + spam rate.

### Content review (you or a moderator)

- ⬜ Review the 113 email template subject lines + copy against your
  brand voice. Some still have my placeholder phrasing (e.g.
  "We're keeping a spot for you"). Flag any that don't fit and I'll
  rewrite.
- ⬜ Review the `moderation.ts` blocked/flagged regex list — decide if
  you want to add anything (slurs, scams seen in beta).
- ⬜ Write an **AI art policy** — the landing page claims "NO AI ART"
  but there's no enforcement beyond the application review.
- ⬜ Write an **IP / copyright complaint process** — DMCA-equivalent
  UK form at `/ip-policy`. Required under the EU Digital Services Act
  (DSA) once you grow.

### Team + process

- ⬜ Document who has admin access (env `ADMIN_EMAILS`).
- ⬜ Rotate the `CRON_SECRET` + `RESEND_API_KEY` quarterly (set a
  calendar reminder).
- ⬜ Write a **deploy runbook**: what to do when Vercel fails to
  deploy, how to roll back, who to ping.
- ⬜ Write an **incident runbook**: DB outage, Stripe outage, email
  outage, data breach. Include escalation contacts.
- ⬜ Decide on an **on-call rotation** (just you for now — set
  phone alerts from Sentry / uptime provider).

### Domain + email polish

- ⬜ After 1 week of clean CSP reports: flip
  `Content-Security-Policy-Report-Only` → `Content-Security-Policy`
  in `next.config.ts` (one line).
- ⬜ After 2 weeks of clean DMARC: strengthen to `p=quarantine`.
- ⬜ After 2 more weeks: strengthen to `p=reject`.
- ⬜ Set up an **abuse@wallplace.co.uk** inbox (standard for hosting).

---

## 🟢 Nice-to-have / after launch

Quality-of-life, security hardening, scale-only concerns.

### Security hardening

- ⬜ **BIMI** + Verified Mark Certificate — brand logo shown in Gmail.
  ~$1,500/year from DigiCert or Entrust. Only worth it after you have
  a registered trademark.
- ⬜ **Cloudflare** in front of Vercel — WAF, bot protection, DDoS.
  Free tier fine; costs when volume scales.
- ⬜ **Cloudflare Turnstile** or hCaptcha on signup + forgot-password
  once you see abuse.
- ⬜ **Malware scanning** on uploaded files — ClamAV or a hosted
  service. Only worth it if you accept binary files beyond what's
  allowed today.
- ⬜ **Pentest** — 3 months after launch, or before a major feature
  that handles money (e.g. gift cards). Budget £3–10k for a real one.
- ⬜ **Admin 2FA** — enable TOTP in Supabase for every admin user.
- ⬜ **Supabase Pro** — point-in-time recovery (PITR), daily backups
  retained 7 days, larger compute. $25/mo.

### Accounts to create (not code-blocked but still "setup")

- ⬜ **Instagram** @thewallplace — already linked in the footer +
  emails. Verify you own it.
- ⬜ **Twitter/X**, **LinkedIn**, **Threads** — whichever your artists
  + venues actually use.
- ⬜ **Google Workspace** for `hello@`, `support@`, `dmarc@`,
  `privacy@`, `abuse@`. Or equivalent.

### Scale (>1k users / >50k emails/month)

- ⬜ Separate `notify.wallplace.co.uk` + `news.wallplace.co.uk`
  subdomains in Resend (currently all three point at `tx.`).
- ⬜ Dedicated sending IPs on `news.` once marketing volume exceeds
  ~50k/month.
- ⬜ Upgrade Upstash to a paid plan when you hit the free-tier 10k
  commands/day.
- ⬜ Consider a staging Vercel environment for pre-prod testing.
- ⬜ Consider a separate test Supabase project for integration tests
  (unblocks Phase 2 tests).

### Editorial / marketing

- ⬜ Write the first **monthly newsletter** draft — the template exists
  but it needs an editor picking artists + writing copy.
- ⬜ Build an **admin "newsletter studio"** page so you can compose
  and send from the product instead of by hand. Flag when you want
  this — probably month 2.
- ⬜ Decide on a **launch announcement** strategy — press list, beta
  tester email, Instagram, Product Hunt.

---

## Quick-scan "done / remaining" summary

Immediate blockers (red):

- **DNS**: 0/3
- **Supabase**: 0/6
- **Stripe**: 0/7
- **Resend**: 0/5
- **Upstash**: 0/4
- **Vercel**: 0/5
- **GitHub**: 0/3

**Total immediate dashboard work: ~4–6 hours.** Most individual tasks
are 2-min clicks; the longest are "Move DNS" (30 min) and "Stripe
activation" (can take days for Stripe to review your business).

Legal (yellow):
- **Terms / Privacy / Cookies**: 3 pages to publish, DPAs to sign
- **ICO registration**: 30 min + £40
- **VAT**: only once turnover hits £90k

Monitoring (yellow):
- **Sentry / Uptime / Analytics**: ~1 hour each to wire

---

## How to use this checklist

1. Print it, or check boxes as you go in the rendered Markdown.
2. Work top-down — the red sections gate everything else.
3. Anything labelled "Flag when you want this" is code I can write
   once the external service is set up (e.g. Sentry SDK wiring).
4. Re-visit before launch: §🟡 Before payments ≠ §🟡 Before public
   launch. Some users can use a free product without you having done
   the payment blockers yet.
