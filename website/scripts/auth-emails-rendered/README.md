# Supabase auth email templates

These three HTML files are pre-rendered from our React Email templates with
Supabase's template tokens (`{{ .ConfirmationURL }}`, `{{ .Email }}`,
`{{ .Data.first_name | default: "there" }}`) baked in. Copy each into the
matching slot in **Supabase Dashboard → Authentication → Email Templates**.

| File                  | Supabase slot                | Subject suggestion                           |
| --------------------- | ---------------------------- | -------------------------------------------- |
| `verification.html`   | "Confirm signup"             | Confirm your Wallplace email                 |
| `password-reset.html` | "Reset Password" / "Recovery"| Reset your Wallplace password                |
| `email-change.html`   | "Change Email Address"       | Confirm your new Wallplace email address     |

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

## Path B alternative — Resend SMTP

If you'd rather have these go out from a verified Wallplace domain, point
Supabase at Resend over SMTP:

- Host: `smtp.resend.com`
- Port: `465` (TLS)
- Username: `resend`
- Password: your `RESEND_API_KEY`

Configured at **Project Settings → Auth → SMTP Settings**. Templates are
still edited in Supabase — Resend is just the transport.
