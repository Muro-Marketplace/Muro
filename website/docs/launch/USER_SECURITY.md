# Wallplace — user verification & security

What keeps bad actors out, and what protects real users from each other.

Grouped by concern. Status: ⬜ = not done · ✅ = done · ⚠️ = partial

---

## TL;DR

For a marketplace with payments, you need **three layers**:

1. **Identity verification** — prove the person is who they say they are
2. **Bot + abuse protection** — keep automated attacks off the front door
3. **Account security** — stop existing accounts getting hijacked

Stripe Connect already forces (1) for anyone who receives money (artists
getting payouts, venues with revenue share) — they **literally cannot
get paid** without completing Stripe's KYC. That's free and mandatory.

(2) and (3) are on you. The single biggest upgrade is adding Cloudflare
in front of Vercel — free tier covers DDoS + Turnstile CAPTCHA + basic
WAF, which handles 90% of real-world marketplace attacks.

---

## 1. Identity verification

### 1.1 Artists (getting paid out) — ✅ already handled by Stripe Connect

Every artist who wants to receive sales payouts must complete Stripe
Connect onboarding. Stripe handles:

- Government ID check (passport, driving licence)
- Bank account verification
- Tax info (UTR / self-assessment or company number)
- Risk scoring
- Address verification
- For higher-volume artists: business verification

**This is already wired** in the code — artists hit
`/artist-portal/billing` which redirects to Stripe's hosted onboarding.
Our webhook (`account.updated`) then stores whether they're
`stripe_connect_onboarding_complete`.

Zero platform-side code needed. Stripe is legally required to do this
under EU/UK AML rules.

**Your action:**
- ⬜ Complete Stripe platform activation (see `EXTERNAL_SETUP.md` §Stripe)
- ⬜ Choose onboarding type: **Express** (Stripe-hosted, fastest) vs
  **Standard** (artist gets full Stripe account). Wallplace uses Express
  currently — good default.

### 1.2 Venues (handling revenue share) — ✅ same story

If a venue earns revenue share on QR sales, Stripe Connect onboarding
applies to them too. Same infra. Same code path.

### 1.3 Customers (buying art) — ✅ Stripe handles at checkout

Customer identity is verified implicitly by their payment method:
- Stripe verifies the card number (Luhn check)
- 3D Secure (SCA) challenge for EU cards — bank-level identity
- AVS (Address Verification Service) on checkout
- CVC check

Beyond that, Wallplace doesn't need real-name verification for buyers.
GDPR makes "require government ID from buyers" illegal anyway — data
minimisation principle.

### 1.4 Artist application review — ✅ already built

Every artist goes through `/apply` → `artist_applications` table →
admin approves at `/admin/applications`. The admin can reject, set
feedback, or approve.

**What this catches:** stolen portfolios, AI art fronts, obvious scams.

**Your action:**
- ⬜ Define + document the review criteria (brand voice / quality bar).
- ⬜ Decide who reviews (just you, or delegate).
- ⬜ Reverse-image-search at least one piece per applicant to catch
  obvious theft — TinEye or Google Lens.
- ⬜ Check if their listed Instagram handle actually matches the work.

### 1.5 Venue verification — ⚠️ currently implicit

Venues self-report. No proof they actually operate the space. Attack:
someone lists "The Curzon" pretending to be the cinema, accepts a
placement, never installs it, the artwork is lost.

**Mitigations (pick one or more):**
- ⬜ **Phone verification** — require a real UK phone number, send SMS
  (Supabase + Twilio). Costs ~1p per SMS.
- ⬜ **Companies House lookup** — if they say they're a business,
  verify the name against the registered address. Free API.
- ⬜ **Address postcard verification** — send a postcard with a code to
  the venue address, they enter the code to activate. Old-school but
  cheap (£0.60/letter).
- ⬜ **Review queue** — no placements accepted until a human admin
  approves the venue (same flow as artist applications). **Easiest.**
- ⬜ **Escrow / hold** — don't release payout until buyer confirms
  delivery (already built in, 14-day hold).

Recommendation: **admin review for first 3 months** (low volume, high
confidence), then add phone verification once you scale.

### 1.6 Deeper identity checks (optional, for high-value flows)

If you ever want photo-ID proof (e.g. for artists selling > £5k pieces):

- ⬜ **Stripe Identity** — Stripe's own ID verification product. £1.50
  per check. Integrates with Connect accounts. Overkill at launch.
- ⬜ **Onfido / Persona** — competitors. More features (liveness,
  document forensics). ~£2–5/check.

You don't need these until you see fraud. Stripe Connect's built-in KYC
is already government-grade.

---

## 2. Bot + abuse protection

### 2.1 Cloudflare — ⬜ the single biggest upgrade

**What it does:**
- DDoS protection (unmetered on free tier)
- Web Application Firewall (WAF) — blocks SQL injection, XSS, common
  attack signatures before they hit Vercel
- Bot management — scores every request, challenges suspicious ones
- **Turnstile** — invisible CAPTCHA (replaces reCAPTCHA — GDPR-friendly,
  no Google cookies). Works in <1ms when user is legit.
- Rate limiting at the edge (cheaper than yours + runs before Vercel counts invocations)
- Analytics — see who's hitting you and what they're after

**Your action:**

- ⬜ Create Cloudflare account (free)
- ⬜ Add `wallplace.co.uk` as a site
- ⬜ Change your nameservers at the domain registrar to Cloudflare's
  (Cloudflare walks you through this)
- ⬜ Enable "Proxy" on the DNS records pointing to Vercel (orange cloud)
- ⬜ Turn on **Under Attack Mode** only when under active attack (JS challenge
  everyone). Normally **Bot Fight Mode** is enough.
- ⬜ Add Turnstile to:
  - Signup form (`/apply`, `/register-venue`, `/signup/customer`)
  - Forgot-password form (`/forgot-password`)
  - Contact form (`/contact`)
  - Enquiry form
- ⬜ Enable "Page Rules" to cache `/browse`, `/venues`, marketing pages
  for 5 minutes (free performance win).

**Flag me when you've created the Cloudflare account** and I'll wire
Turnstile into the relevant forms — it's a component + a secret env
key. 30 minutes of code work.

**Why Cloudflare > other options:**
- Free tier covers everything most startups need
- Sits in front of Vercel — no perf cost (arguably faster)
- WAF rules are managed (you don't maintain signatures)
- Combines bot + DDoS + WAF + CAPTCHA in one pane

### 2.2 hCaptcha / Google reCAPTCHA (alternatives)

Only use these if you're not on Cloudflare. hCaptcha is the Turnstile
equivalent if you don't want Cloudflare's other features.

### 2.3 Platform-level rate limiting — ✅ Phase 1 done

Your rate limiter (Upstash-backed once the env is set — see
`EXTERNAL_SETUP.md`) covers:
- Login attempts (5 per 15 min per IP+email)
- Signup (3 per 10 min per IP)
- Password reset (3 per 60 min)
- Message sending (30 per 5 min)
- Placement requests (10 per 60 min)
- Checkout creation (10 per 10 min)

This is already in code. Cloudflare rate-limiting is a second layer
that stops traffic **before** it hits your Vercel functions — cheaper
at scale.

### 2.4 Honeypot fields — ⬜ nice to have

Add hidden `<input name="website_do_not_fill" />` to every public form.
Bots fill everything; humans don't see it. Reject server-side if filled.
Near-zero false positives, catches a surprising amount of spam.

**Flag me and I'll add this.** 30 minutes.

---

## 3. Account security (stop hijacking)

### 3.1 Password strength — ⬜ not currently enforced

Supabase Auth doesn't enforce complexity by default. Passwords can be
`12345`.

**Your action:**
- ⬜ Supabase Dashboard → Auth → Providers → Email → set password
  requirements (length ≥ 8, mixed case, number). Easy toggle.
- ⬜ Or: add client-side strength meter. Flag me — 1 hour of work.

### 3.2 Two-factor authentication — ⬜ available, not enabled

Supabase supports TOTP (Google Authenticator etc.) out of the box.

**Your action:**
- ⬜ **For admins**: enable MFA on every admin Supabase user. Dashboard →
  Auth → MFA.
- ⬜ **For artists + venues**: add an optional 2FA setup page at
  `/account/security`. Flag me — 2 hours. Not required at launch, but
  give users who handle money the option.

Templates already exist: `AccountTwoFactorEnabled` and
`AccountTwoFactorDisabled` — they'll send automatically once wired.

### 3.3 Suspicious login detection — ⬜ template exists, not wired

The `account_suspicious_login` email template is ready. What's missing:
- A Supabase Auth webhook or database trigger on `auth.sessions` INSERT
- Logic comparing new session's IP + device to previous sessions
- Sending the email if unusual

**Flag me when the Supabase webhook is set up** (see
`EXTERNAL_SETUP.md` §Supabase) and I'll wire the detection.

### 3.4 Password changed notification — ✅ in email library, needs trigger

`account_password_changed` template exists. Needs a Supabase Auth
webhook on password change events. Same deferred ticket as above.

### 3.5 Session expiry — ⬜ review Supabase defaults

Supabase JWT defaults to 1 hour access token + 14-day refresh token.

**Your action:**
- ⬜ Supabase Dashboard → Auth → Settings → review "JWT expiry" and
  "Refresh token reuse" settings. For a marketplace with money flowing,
  **shorter sessions are better** — consider 7-day refresh, 30-min
  access.

### 3.6 Login from a new device — ⬜ optional

Best-in-class services require an email confirmation when signing in
from a new device. Overkill for launch. Revisit when you have fraud.

---

## 4. Fraud detection (Stripe-side)

### 4.1 Stripe Radar — ⬜ must configure before going live

Radar is Stripe's ML-based fraud detection. Free on all Stripe accounts
for basic rules; Radar for Fraud Teams ($0.05/txn) for advanced.

**Your action:**
- ⬜ Stripe Dashboard → Radar → Rules → add:
  - Block if `risk_level = "highest"` and amount > £500
  - Block if `cvc_check != "pass"` and amount > £200
  - Review if `card_country != customer_billing_country`
  - Block if `velocity > 5 payments per IP per 10 min`
  - Block known disposable-email providers (Stripe has a template)
- ⬜ Enable 3D Secure (SCA) on all EU cards (Stripe does this by default)

### 4.2 Velocity limits on signup — ⬜ partly via rate limiter

Rate limiter already caps 3 signups per 10 min per IP. Good.

Extra layer (cheap): reject signups from known disposable-email
domains. Free list at
[`disposable-email-domains`](https://github.com/disposable-email-domains/disposable-email-domains).
Flag me — 1 hour.

### 4.3 Payout hold — ✅ already built

14-day hold on all artist payouts in `stripe-connect.ts` + the
`process-pending` cron job. Means if fraud is detected in the first
two weeks, you can claw back without having paid the artist.

### 4.4 Chargeback / dispute handling — ⚠️ webhook handler exists, no UI yet

`transfer.reversed` webhook fires when Stripe reverses a transfer.
Currently logs to `stripe_transfers` table. Need:
- ⬜ Admin dashboard to see pending disputes
- ⬜ Auto-pause the artist's account when disputes exceed threshold
- ⬜ Template `order_dispute_opened` is ready, just needs the trigger

---

## 5. Data privacy (GDPR basics)

### 5.1 What you must let users do — ⬜ partially built

Under UK GDPR, users have rights you must honour:

| Right | Status | What's left |
|---|---|---|
| Access (see their data) | ⬜ | Need `/account/data-export` page + backend job |
| Erasure (delete account) | ⬜ | Need `/account/delete` page + 30-day purge job |
| Rectification (edit profile) | ✅ | Already exists |
| Portability (export in machine-readable format) | ⬜ | JSON export is enough |
| Object to processing (opt-out of marketing) | ⬜ | Preference centre not built |
| Restrict processing | ⚠️ | "Pause all non-critical" vacation mode exists in `email_preferences`, not surfaced |

Email templates for all the ⬜s are ready in the library
(`account_data_export_ready`, `account_deletion_requested`,
`account_deletion_confirmed`). They just need DB flow + UI.

### 5.2 Consent storage — ⬜ must track

Every new user must explicitly agree to Terms + Privacy at signup.
Store the version they agreed to and when.

Table `terms_acceptances` already exists (migration 004). Check:
- ⬜ Is the signup form actually writing to it?
- ⬜ Show the acceptance checkbox on every signup route (artist, venue,
  customer)

---

## 6. Recommended launch security stack

For day one, focus on these (priority order):

| # | Layer | Blocker? | Effort |
|---|---|---|---|
| 1 | Stripe Connect KYC | **YES** — can't pay out without | Already done in code; activate in Stripe dashboard |
| 2 | Stripe Radar rules | **YES** — fraud prevention | 30 min in Stripe dashboard |
| 3 | Supabase password complexity | Should | 2 min in Supabase dashboard |
| 4 | MFA on admin accounts | Should | 5 min per admin |
| 5 | Cloudflare (DDoS + WAF + Turnstile) | Strongly recommended | 1 hour to set up + 30 min for me to wire Turnstile |
| 6 | Artist application review process | **YES** | Already exists, just needs you reviewing |
| 7 | Venue review queue (admin-approve first 3 months) | Recommended | 30 min of admin process, no code |
| 8 | Honeypot on public forms | Nice-to-have | 30 min for me to wire |
| 9 | Disposable-email blocker at signup | Nice-to-have | 1 hour for me to wire |
| 10 | 2FA for artists/venues (optional) | Nice-to-have | 2 hours for me to wire |

Numbers 1–6 before real users. 7 before first placement. 8–10 as
Phase 2 polish.

---

## 7. What I can wire when you're ready

Code tasks I can do once the relevant external service is set up:

- ⬜ **Cloudflare Turnstile** on signup + forgot-password + contact forms
  — requires Cloudflare Turnstile site key + secret
- ⬜ **Honeypot fields** on every public form — no external dep
- ⬜ **Disposable-email domain blocker** at signup — no external dep
- ⬜ **2FA enrolment UI** at `/account/security` — uses Supabase's
  built-in TOTP
- ⬜ **Suspicious-login detection** — needs Supabase Auth webhook
- ⬜ **Password-changed email** — same webhook
- ⬜ **Account deletion + data export flows** — no external dep, but
  needs the GDPR page copy
- ⬜ **Companies House lookup** for business verification — needs UK
  Companies House API key (free)
- ⬜ **Stripe Identity** — needs Stripe Identity enabled in dashboard

Flag any of these when unblocked and I'll pick them up in a follow-up
phase.

---

## 8. What users see vs what they don't

To give you a mental model of what a real user actually experiences:

**Signup (artist):**
1. Application form (with honeypot + Turnstile once wired)
2. Email verification (Supabase hosted, our polished template)
3. Admin review → approval email
4. First login → prompted to Stripe Connect → full KYC on Stripe's side
5. Only AFTER Connect is complete can they receive payouts

**Signup (customer):**
1. Email + password (with Turnstile)
2. Email verification
3. Browse + buy immediately
4. Buy triggers Stripe payment → 3DS challenge if bank requires it

**What they DON'T see:**
- Rate limiter silently absorbing bot traffic
- Cloudflare challenging suspicious IPs
- Radar scoring every payment behind the scenes
- Webhook idempotency preventing duplicate orders
- RLS policies blocking anon-key reads
- Audit log capturing every admin action
