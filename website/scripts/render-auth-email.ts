// scripts/render-auth-email.ts
//
// Renders one of our React Email templates to HTML with Supabase's
// template variables baked in (e.g. `{{ .ConfirmationURL }}`), so you
// can paste the output straight into the Supabase dashboard:
//
//   Auth → Email Templates → Confirm signup / Reset Password / Change Email
//
// Usage:
//
//   npx tsx scripts/render-auth-email.ts verification > out/confirm-signup.html
//   npx tsx scripts/render-auth-email.ts password-reset > out/reset-password.html
//   npx tsx scripts/render-auth-email.ts email-change > out/email-change.html
//   npx tsx scripts/render-auth-email.ts all
//     # writes all three into website/scripts/auth-emails-rendered/
//
// The Supabase variables we substitute:
//   - {{ .ConfirmationURL }}  → email verification + magic link target
//   - {{ .Email }}             → the new email address (change-email only)
//   - {{ .Data.first_name }}   → user's first name if set in user_metadata
//
// We pass `{{ .Data.first_name | default: "there" }}` straight through
// — Supabase's GoVar template engine evaluates it server-side at send time.

import { render } from "@react-email/components";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AccountEmailVerification } from "../src/emails/templates/account/AccountEmailVerification";
import { AccountPasswordReset } from "../src/emails/templates/account/AccountPasswordReset";
import { AccountEmailChangeVerify } from "../src/emails/templates/account/AccountEmailChangeVerify";

const SUPPORT_URL = "https://wallplace.co.uk/support";
// Supabase template tokens. Keep these as raw strings — the dashboard
// renders them at email-send time.
const SUPA_FIRST_NAME = '{{ .Data.first_name | default: "there" }}';
const SUPA_CONFIRM_URL = "{{ .ConfirmationURL }}";
const SUPA_NEW_EMAIL = "{{ .Email }}";

type Variant = "verification" | "password-reset" | "email-change";

// React Email's HTML renderer escapes attribute values, so `{{ .Data.first_name | default: "there" }}`
// comes out as `{{ .Data.first_name | default: &quot;there&quot; }}`. Supabase's template
// engine wants the raw token, so unescape it after render.
function fixSupabaseTokens(html: string): string {
  return html
    .replace(/\{\{[^}]*?&quot;[^}]*?\}\}/g, (m) => m.replace(/&quot;/g, '"'))
    .replace(/\{\{[^}]*?&#x27;[^}]*?\}\}/g, (m) => m.replace(/&#x27;/g, "'"))
    .replace(/\{\{[^}]*?&amp;[^}]*?\}\}/g, (m) => m.replace(/&amp;/g, "&"));
}

async function renderVariant(name: Variant): Promise<string> {
  let html: string;
  switch (name) {
    case "verification":
      html = await render(
        AccountEmailVerification({
          firstName: SUPA_FIRST_NAME,
          verificationUrl: SUPA_CONFIRM_URL,
          expiresIn: "24 hours",
          supportUrl: SUPPORT_URL,
        })
      );
      return fixSupabaseTokens(html);
    case "password-reset":
      html = await render(
        AccountPasswordReset({
          firstName: SUPA_FIRST_NAME,
          resetUrl: SUPA_CONFIRM_URL,
          expiresIn: "1 hour",
          supportUrl: SUPPORT_URL,
        })
      );
      return fixSupabaseTokens(html);
    case "email-change":
      html = await render(
        AccountEmailChangeVerify({
          firstName: SUPA_FIRST_NAME,
          newEmail: SUPA_NEW_EMAIL,
          verifyUrl: SUPA_CONFIRM_URL,
          expiresIn: "1 hour",
          supportUrl: SUPPORT_URL,
        })
      );
      return fixSupabaseTokens(html);
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown variant: ${_exhaustive as string}`);
    }
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    process.stderr.write(
      "Usage: tsx scripts/render-auth-email.ts <verification|password-reset|email-change|all>\n"
    );
    process.exit(1);
  }

  if (arg === "all") {
    const here = dirname(fileURLToPath(import.meta.url));
    const outDir = resolve(here, "auth-emails-rendered");
    mkdirSync(outDir, { recursive: true });
    for (const v of ["verification", "password-reset", "email-change"] as Variant[]) {
      const html = await renderVariant(v);
      const file = resolve(outDir, `${v}.html`);
      writeFileSync(file, html, "utf8");
      process.stderr.write(`wrote ${file}\n`);
    }
    return;
  }

  const html = await renderVariant(arg as Variant);
  process.stdout.write(html);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
