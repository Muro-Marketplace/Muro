// Stream: news. 90-day soft "we miss you". Last send before sunset.

import { EmailShell, H1, P, Button, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistInactive90dProps {
  firstName: string;
  returnUrl: string;
  preferenceUrl: string;
}

export function ArtistInactive90d({ firstName, returnUrl, preferenceUrl }: ArtistInactive90dProps) {
  return (
    <EmailShell stream="news" persona="artist" category="tips" preview="We're keeping a spot for you">
      <H1>We&rsquo;re keeping a spot for you</H1>
      <P>Hi {firstName} — it&rsquo;s been a while. If Wallplace still fits into your practice, we&rsquo;d love you back.</P>
      <P>If it doesn&rsquo;t, no worries. We&rsquo;ll stop sending these after the next one.</P>
      <Button href={returnUrl} persona="artist">Pick up where I left off</Button>
      <Small>
        Not for you right now?{" "}
        <a href={preferenceUrl} style={{ color: "#6B6760", textDecoration: "underline" }}>Update preferences</a>.
      </Small>
    </EmailShell>
  );
}

export const mock: ArtistInactive90dProps = {
  firstName: "Maya",
  returnUrl: "https://wallplace.co.uk/artist-portal",
  preferenceUrl: "https://wallplace.co.uk/account/email",
};

const entry: TemplateEntry<ArtistInactive90dProps> = {
  id: "artist_inactive_90d",
  name: "Artist inactive 90d",
  description: "Final soft return before sunset.",
  stream: "news",
  persona: "artist",
  category: "tips",
  subject: "We're keeping a spot for you",
  previewText: "If you'd still like one.",
  component: ArtistInactive90d,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
