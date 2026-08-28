// Stream: news. The one email that makes newsletter consent real.
//
// 09 §D.3. `email_preferences.newsletter_enabled` has defaulted to false with
// the comment "double opt-in" since migration 016, and nothing ever set it true
// because there was no confirmation step to set it. Subscribing did nothing a
// person could observe, and anyone could subscribe anyone else's address.

import { EmailShell, H1, P, Small, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface NewsletterSubscribeConfirmProps {
  confirmUrl: string;
  expiresIn: string;
}

export function NewsletterSubscribeConfirm({ confirmUrl, expiresIn }: NewsletterSubscribeConfirmProps) {
  return (
    <EmailShell stream="news" persona="multi" preview="One click and you're on the list">
      <H1>Confirm your subscription</H1>
      <P>
        Someone asked us to send Wallplace updates to this address. If that was you, press the
        button and you&rsquo;re on the list: new work from artists near you, and the venues showing it.
      </P>
      <Button href={confirmUrl}>Yes, sign me up</Button>
      <P>
        <Small>
          This link works for {expiresIn}. If it wasn&rsquo;t you, ignore this email and nothing
          happens. We won&rsquo;t send anything else until someone confirms.
        </Small>
      </P>
    </EmailShell>
  );
}

export const mock: NewsletterSubscribeConfirmProps = {
  confirmUrl: "https://wallplace.co.uk/api/newsletter/confirm?t=6f1a9c2e-4b7d-4a10-9f33-2c8e5b1d7a04",
  expiresIn: "7 days",
};

const entry: TemplateEntry<NewsletterSubscribeConfirmProps> = {
  id: "newsletter_subscribe_confirm",
  name: "Newsletter subscribe confirmation",
  description: "Double opt-in. Sent once when someone submits the newsletter form.",
  stream: "news",
  persona: "multi",
  category: "newsletter",
  subject: "Confirm your Wallplace newsletter subscription",
  previewText: "One click and you're on the list.",
  component: NewsletterSubscribeConfirm,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
