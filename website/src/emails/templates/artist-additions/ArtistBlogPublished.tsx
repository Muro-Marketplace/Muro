// G15. Blog moderation had no author notification at all: an author who
// submitted a post found out it had been published only by revisiting their
// own list. Sent from PATCH /api/admin/blogs/[id] on approve. Stream: notify.

import { EmailShell, H1, P, Button, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistBlogPublishedProps {
  firstName: string;
  title: string;
  blogUrl: string;
  supportUrl?: string;
}

export function ArtistBlogPublished({ firstName, title, blogUrl, supportUrl }: ArtistBlogPublishedProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="placements" preview="Your Wallplace post is live">
      <H1>Your post is live</H1>
      <P>Hi {firstName}, thank you for writing for Wallplace. We have reviewed {title} and it is now published.</P>
      <P>Anyone browsing the journal can read it, and it sits on your profile alongside your work.</P>
      <Button href={blogUrl}>Read your post</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistBlogPublishedProps = {
  firstName: "Maya",
  title: "Painting for small rooms",
  blogUrl: "https://wallplace.co.uk/journal/painting-for-small-rooms",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistBlogPublishedProps> = {
  id: "artist_blog_published",
  name: "Blog published",
  description: "Author told their submitted post passed review and is live.",
  stream: "notify",
  persona: "artist",
  category: "placements",
  subject: "Your Wallplace post is live",
  previewText: "Your post passed review and is published.",
  component: ArtistBlogPublished,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
