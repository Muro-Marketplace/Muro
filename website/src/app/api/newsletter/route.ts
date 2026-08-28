import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { unverifiedRecipientAllowed } from "@/lib/email/unverified-recipient";
import { NewsletterSubscribeConfirm } from "@/emails/templates/newsletter/NewsletterSubscribeConfirm";
import { z } from "zod";

// Simple email-only mailing list endpoint. Distinct from /api/waitlist
// (pre-launch signup with name + role), this is "be first to see new works".

const schema = z.object({
  email: z.string().email("Please enter a valid email address").max(320),
  source: z.string().max(50).optional(),
});

/** How long the confirm link is described as lasting. See the note on expiry below. */
const EXPIRES_IN = "7 days";

function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
}

export async function POST(request: Request) {
  // 5 signups per minute per IP.
  const limited = await checkRateLimit(request, 5, 60_000);
  if (limited) return limited;

  let body: unknown = {};
  try { body = await request.json(); } catch { /* fall through, schema will reject */ }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid email" },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase();
  const db = getSupabaseAdmin();

  // 09 §D.3. Double opt-in, finally. `email_preferences.newsletter_enabled` has
  // defaulted to false with the comment "double opt-in" since migration 016 and
  // nothing ever set it true, because there was no confirmation step to set it.
  // So subscribing did nothing anyone could observe, and anyone could subscribe
  // anyone else's address.
  const confirmToken = randomUUID();

  const { error } = await db.from("newsletter_subscribers").insert({
    email,
    source: parsed.data.source || "website",
    confirm_token: confirmToken,
  });

  // Unique-constraint violation = already subscribed. Return exactly what a
  // fresh subscribe returns, so this is not a membership oracle.
  //
  // E36d: the comment used to claim that and the code did not deliver it — the
  // 200 carried `alreadySubscribed: true`, which is the same leak one level
  // down. Reading a boolean off the body is no harder than reading a status.
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      console.warn("[newsletter] duplicate subscribe for an existing email");
      return NextResponse.json({ ok: true });
    }
    console.error("Newsletter subscribe error:", error);
    return NextResponse.json({ error: "Could not subscribe, please try again." }, { status: 500 });
  }

  // A REFLECTED send: an anonymous caller named the recipient and has not
  // proved they own it. The per-recipient cap is what stops the signup form
  // being used to post mail at someone. See src/lib/email/unverified-recipient.
  //
  // The row is already written either way. An unconfirmed row sends nothing and
  // reads as "asked, never answered", which is the correct record of what
  // happened.
  if (await unverifiedRecipientAllowed({ to: email, template: "newsletter_subscribe_confirm", db })) {
    await sendEmail({
      // Keyed on the token, so a Vercel retry of the same request cannot send
      // twice. A genuinely new subscribe gets a new token and a new key.
      idempotencyKey: `newsletter_confirm:${confirmToken}`,
      template: "newsletter_subscribe_confirm",
      category: "newsletter",
      to: email,
      subject: "Confirm your Wallplace newsletter subscription",
      react: NewsletterSubscribeConfirm({
        confirmUrl: `${siteOrigin()}/api/newsletter/confirm?t=${confirmToken}`,
        expiresIn: EXPIRES_IN,
      }),
      // No `userId`. The subscriber is anonymous, and attaching one would test
      // `newsletter_enabled` — which defaults to FALSE — and suppress the very
      // email whose whole job is to turn it true.
      metadata: { source: parsed.data.source || "website" },
    });
  }

  return NextResponse.json({ ok: true });
}
