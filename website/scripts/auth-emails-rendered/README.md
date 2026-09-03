# Supabase auth email templates

These four HTML files are pre-rendered from our React Email templates with
Supabase's template tokens (`{{ .ConfirmationURL }}`, `{{ .Email }}`,
`{{ .Data.first_name | default: "there" }}`) baked in. Copy each into the
matching slot in **Supabase Dashboard → Authentication → Email Templates**.

> **Heads-up:** until you complete the SMTP setup below, Supabase sends
> auth emails from `noreply@mail.app.supabase.io` — that's why password
> resets are arriving from a Supabase address rather than Wallplace. The
> branded HTML is already in the dashboard, but the *sender* needs the
> SMTP swap to flip to `noreply@tx.wallplace.co.uk`. Do the SMTP step
> first, then paste these templates so the next reset lands fully
> on-brand.

| File                  | Supabase slot                | Subject suggestion                           |
| --------------------- | ---------------------------- | -------------------------------------------- |
| `verification.html`   | "Confirm signup"             | Confirm your Wallplace email                 |
| `password-reset.html` | "Reset Password" / "Recovery"| Reset your Wallplace password                |
| `email-change.html`   | "Change Email Address"       | Confirm your new Wallplace email address     |
| `invite.html`         | "Invite user"                | Welcome to Wallplace, set your password      |

## Re-rendering

If you tweak a template under `src/emails/templates/account/`, regenerate
these files with:

```sh
npx tsx scripts/render-auth-email.ts all
```

Then paste the new HTML back into the dashboard. The render script lives
at `scripts/render-auth-email.ts`.

## Why we don't store the source HTML in Supabase

Supabase's email editor is plain HTML — no React, no shared components.
Treating the React Email source as the source of truth and shipping
rendered HTML to the dashboard means template changes flow through the
same review process as the rest of the codebase, instead of being a
silent change in a dashboard.

## Sending from a Wallplace address (one-time setup, ~10 min)

Auth emails (signup, password reset, email change, invites, magic links) come
straight out of Supabase. Without custom SMTP they ship from
`noreply@mail.app.supabase.io` — exactly what users have been seeing on
the password-reset flow. Point Supabase at Resend so they leave from
your verified `tx.wallplace.co.uk` instead.

### 1. Make sure the Resend API key has SMTP scope

In Resend → API Keys → your key → Edit. Permission must be
**Full access** or at minimum **Sending access** with SMTP allowed.
You can copy the existing prod key — the one already in
`RESEND_API_KEY` on Vercel — there's no separate "SMTP key".

### 2. Configure SMTP in Supabase

**Supabase Dashboard → Project Settings → Auth → SMTP Settings**, flip
the "Enable Custom SMTP" toggle, fill in:

| Field | Value |
| --- | --- |
| Sender email | `noreply@tx.wallplace.co.uk` |
| Sender name | `Wallplace` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | (paste your `RESEND_API_KEY`) |
| Minimum interval | leave default |

Hit **Save**. Supabase tests the connection on save and will refuse
bad credentials, so a green save = it works.

### 3. Paste the rendered templates

For each of the four HTML files in this folder, open the matching
slot in **Supabase Dashboard → Authentication → Email Templates** and
paste the file contents into the **Message body (HTML)** box. Set the
suggested subject from the table below. Save.

| File                  | Supabase slot                | Subject                                      |
| --------------------- | ---------------------------- | -------------------------------------------- |
| `verification.html`   | Confirm signup               | Confirm your Wallplace email                 |
| `password-reset.html` | Reset Password               | Reset your Wallplace password                |
| `email-change.html`   | Change Email Address         | Confirm your new Wallplace email address     |
| `invite.html`         | Invite user                  | Welcome to Wallplace, set your password      |

### 4. Test

In an incognito window: go to `/login` → "Forgot password" → enter your
email. The reset email should land within ~30 seconds, From:
`Wallplace <noreply@tx.wallplace.co.uk>`, with the on-brand template.
If the From line still says `mail.app.supabase.io`, the SMTP toggle
didn't save — go back to step 2.

### Why not Path C (webhook → custom send)

Supabase emits `auth.signedup` / `auth.password_reset_requested` events
that we *could* hook into a route that calls `sendEmail()` directly,
but custom SMTP gets us 95% of the same outcome (branded sender,
branded HTML, our delivery logs visible in Resend) with one config
swap instead of a new route + webhook signature verification + replay
protection. Webhook path stays an option if we ever need to layer on
custom logic Supabase doesn't expose.
