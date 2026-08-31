import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { contactSchema } from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { sendEmail } from "@/lib/email/send";
import { unverifiedRecipientAllowed } from "@/lib/email/unverified-recipient";
import { SupportRequestReceived } from "@/emails/templates/account/SupportRequestReceived";

/** How long we tell people to wait. One number, quoted in one place. */
const EXPECTED_REPLY_DAYS = 2;

/**
 * The sender's reference, generated here rather than read back from the row.
 *
 * 09 §D.4 says to quote `submission.id`. Two facts about the live table say
 * otherwise, and migration 106 records both. `id` is a bigint sequence, so
 * quoting it hands every sender a running total of how many contact
 * submissions Wallplace has ever had. And reading it back needs a `.select()`
 * after the insert on the ANON client, which has INSERT policies and no SELECT
 * policy: PostgREST would filter the RETURNING to zero rows and the route would
 * answer 500 on a submission it had just stored.
 */
function newReference(): string {
  return `WP-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
}

export async function POST(request: Request) {
  const limited = await checkRateLimit(request, 5, 60000);
  if (limited) return limited;
  try {
    const body = await request.json();
    const parsed = contactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const { name, email, type, message } = parsed.data;

    const reference = newReference();

    const { error } = await supabase.from("contact_submissions").insert({
      name,
      email,
      type,
      message,
      reference,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }

    // K1: was notifyAdminNewContact in the legacy module.
    await sendAdminAlert({
      idempotencyKey: `admin_new_contact:${email.toLowerCase()}:${type}:${message.slice(0, 64)}`,
      subject: `New contact form submission from ${name}`,
      summary: `${name} sent a message through the contact form.`,
      fields: [
        { label: "Reference", value: reference },
        { label: "Email", value: email },
        { label: "Type", value: type },
        { label: "Message", value: message },
      ],
    });

    // 09 §D.4. Until now the form told us and told the sender nothing, so from
    // their side a support request and a form that silently failed looked
    // identical.
    //
    // This is a REFLECTED send: an anonymous caller names the recipient. The
    // route's 5/min IP limit does not cover the attack that matters, which is
    // many IPs aimed at one inbox, so the per-recipient cap is what stops
    // Wallplace being used as a relay. Refusing only the email and not the
    // request is deliberate: someone being flooded must not also lose the
    // ability to reach support, and the admin alert above already went.
    const allowed = await unverifiedRecipientAllowed({
      to: email,
      template: "support_request_received",
    });
    if (allowed) {
      await sendEmail({
        idempotencyKey: `support_ack:${reference}`,
        template: "support_request_received",
        category: "orders_and_payouts",
        to: email,
        subject: "We've got your message",
        react: SupportRequestReceived({
          firstName: (name || "there").trim().split(" ")[0] || "there",
          referenceId: reference,
          submittedType: type,
          messageExcerpt: message.slice(0, 200),
          expectedReplyDays: EXPECTED_REPLY_DAYS,
          supportUrl: `${siteOrigin()}/contact`,
        }),
        // No `userId`. The sender is anonymous, and attaching one would apply
        // somebody else's preferences to an address we have not verified.
        metadata: { reference, type },
      });
    }

    // A2.3. The reference was minted here, written to the row and printed in
    // the acknowledgement email, but the response carried only { success },
    // so the page could not show it. Someone who never received the email, or
    // closed it, was asked to quote a reference they had never seen.
    return NextResponse.json({ success: true, reference });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
