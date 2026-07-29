// B4. Server-side gate in front of the template browser. The listing itself is a
// client component (EmailPreviewIndex), which cannot read the environment, so the
// check has to live here where it runs before anything renders or ships.
import { notFound } from "next/navigation";
import { isEmailPreviewAllowed } from "./access";
import EmailPreviewIndex from "./EmailPreviewIndex";

export default function EmailPreviewIndexPage() {
  if (!isEmailPreviewAllowed()) notFound();
  return <EmailPreviewIndex />;
}
