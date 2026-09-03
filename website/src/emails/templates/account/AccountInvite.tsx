// The Supabase INVITE email, rendered for the dashboard rather than sent by us.
//
// Production pass 2's launch blocker. Accepting an artist application calls
// `auth.admin.inviteUserByEmail`, which creates an account with NO PASSWORD and
// sends GoTrue's own invite mail. In production that arrives from
// noreply@mail.app.supabase.io with stock Supabase branding, two seconds before
// our branded welcome, and its only link carries redirect_to=http://localhost:3000.
//
// The redirect is a dashboard setting (Auth → URL Configuration → Site URL).
// The branding is this file: scripts/render-auth-email.ts turns it into HTML for
// Auth → Email Templates → Invite user, alongside the three that already
// existed. Without it the accepted artist's FIRST contact from Wallplace is an
// unbranded Supabase email, and it is the one carrying their only way in.
//
// Registered in the app's registry for RENDER coverage only: nothing in src/
// sends it (Supabase does, from a template pasted into the dashboard), so
// `npm run email:audit` lists it among the templates with no send path, which
// is correct. Registering it means `npm run email:render` and the preview
// library exercise it, so a broken edit here is caught before it is pasted
// into the dashboard rather than after.

import { EmailShell, H1, P, Button, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AccountInviteProps {
  firstName: string;
  /** Supabase's {{ .ConfirmationURL }}: the set-a-password link. */
  inviteUrl: string;
  supportUrl?: string;
}

export function AccountInvite({ firstName, inviteUrl, supportUrl }: AccountInviteProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview="Set your password and get started on Wallplace">
      <H1>Welcome to Wallplace, {firstName}</H1>
      <P>
        Your application was accepted and your account is ready. Set a password and you can start
        adding work straight away.
      </P>
      <Button href={inviteUrl} persona="artist">Set your password</Button>
      <P>
        <Small>
          This link is single-use and expires in 24 hours. If it has run out, use &ldquo;Forgot
          password&rdquo; on the sign-in page and we&rsquo;ll send a fresh one.
        </Small>
      </P>
      {supportUrl && (
        <P>
          <Small>
            Didn&rsquo;t apply to Wallplace? You can ignore this email, no account is active until
            someone sets a password. Tell us at {supportUrl} if you&rsquo;d like it removed.
          </Small>
        </P>
      )}
    </EmailShell>
  );
}

export const mock: AccountInviteProps = {
  firstName: "Maya",
  inviteUrl: "https://www.wallplace.co.uk/reset-password?token=example",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<AccountInviteProps> = {
  id: "account_invite",
  name: "Account invite (Supabase)",
  description:
    "The set-a-password invite an accepted artist receives. Sent by Supabase from the dashboard template, never by the app; registered so it renders in CI.",
  stream: "tx",
  persona: "artist",
  category: "security",
  subject: "Welcome to Wallplace, set your password",
  previewText: "Set your password and get started on Wallplace.",
  component: AccountInvite,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;
