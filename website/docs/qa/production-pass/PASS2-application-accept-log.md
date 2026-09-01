# Pass 2, chain 7: accepting an artist application

Accepted QA-TEST application id 29 (`QA-TEST Referral`,
`fcoles2598+qaref@gmail.com`) as ADMIN on 2026-08-31, then followed the invite
into the applicant's inbox. Leya Rubin's real application (id 12) and the three
other QA-TEST applications were left pending.

## The headline finding

**Every Supabase auth email in production redirects to `http://localhost:3000`.**

The invite that accepting an artist sends reads:

> You have been invited to create a user on http://localhost:3000. Follow this
> link to accept the invite:
> `https://uwkuhygwvasdzwsusiym.supabase.co/auth/v1/verify?token=…&type=invite&redirect_to=http://localhost:3000`

The invited account is created with **no password**, `confirmed_at` null,
`last_sign_in_at` null. The invite link is its only way in, and that link sends
the artist to their own machine's port 3000.

The escape hatch is broken the same way. Requesting a password reset for the same
address produced:

> `https://uwkuhygwvasdzwsusiym.supabase.co/auth/v1/verify?token=…&type=recovery&redirect_to=http://localhost:3000`

So this is not only the artist funnel. **Any user in production who forgets their
password cannot recover their account.** `/reset-password` exists and renders on
the live site; nothing ever routes anyone to it.

Both emails also come from `noreply@mail.app.supabase.io` with stock Supabase
branding and a "powered by Supabase" footer, two seconds before the branded
`notifications@tx.wallplace.co.uk` welcome email. The repo already carries
branded templates at `website/scripts/auth-emails-rendered/` (verification,
password-reset, email-change); the production Auth project is not using them.

This is a dashboard fix, not a code fix: Auth → URL Configuration → Site URL and
the redirect allow-list, plus the three email templates. It belongs with the
other owner actions in the remediation plan, at the top of them.

The welcome email compounds it. It says "Open artist portal
https://wallplace.co.uk/artist-portal" to an artist who has no password and
therefore cannot sign in.

## What the accept flow itself does correctly

All verified in Postgres:

| Check | Result |
|---|---|
| `artist_applications.status` | `accepted` |
| New `auth.users` row | `8e6d9c4e-…`, `invited_at` set, genuinely an invite |
| `raw_user_meta_data` | `{user_type: "artist", artist_slug: "qa-test-referral", display_name: "QA-TEST Referral"}` |
| `artist_profiles` row | slug `qa-test-referral`, `review_status: "approved"` |
| Referral code minted | `MB9X61`, six characters |
| `referred_by_code` | `QATESTREF`, copied from the application |
| `discipline` | `photography`, derived from "Landscape Photography" |
| Email | `artist_application_approved`, "You're in, welcome to Wallplace" |
| Admin audit | `application_accepted` with `userId`, `invited: true`, `applicationId`, `applicantEmail` |
| Toast | "Accepted. Invite email sent to fcoles2598+qaref@gmail.com" |

The confirm modal reads exactly "Accept this artist? An invite email will be
sent." The list moved the row out of Pending immediately.

## Other findings

1. **The selected plan is dropped.** The application detail shows "SELECTED PLAN
   Pro"; the created profile has `subscription_plan: "none"` and
   `subscription_status: "none"`. Row 2362 says this is deliberate, and the data
   agrees, but nothing in the accepted artist's welcome tells them they still
   have to subscribe.

2. **An unknown referral code is accepted and stored as if valid.** `QATESTREF`
   belongs to no artist (`select count(*) from artist_profiles where
   referral_code='QATESTREF'` is 0) and it was still written to
   `referred_by_code`. `artist_referrals` has **0 rows in the entire production
   database**, so no referral has ever been credited.

3. **Sample work links render as one run-on line.** The detail panel shows
   `https://x.test Sample 1: https://a.test` on a single line. This confirms the
   remediation plan's correction that `sampleWorkUrls` is persisted, merged into
   `portfolio_link`, but the newline separator is lost in the admin view.
