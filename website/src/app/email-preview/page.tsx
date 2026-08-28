// B4. Server-side gate in front of the template browser. The listing itself is a
// client component (EmailPreviewIndex), which cannot read the environment, so the
// check has to live here where it runs before anything renders or ships.
//
// WHY THIS IS NON-PROD ONLY, AND NOT D6'S "admin + non-prod" (owner decision,
// resolved 2026-08-28): the admin half cannot be built safely today. There is
// no server-readable session (ADR 0008 stage 2), so a server component cannot
// run the admin predicate at request time; and wrapping the content in the
// client-side AdminGate does not protect it, because a client component's
// children are SERIALISED INTO THE RSC FLIGHT PAYLOAD whether or not the gate
// ever mounts them — anyone in production could read every template out of
// devtools, which is exactly the exposure B4 closed. So the shipped rule is
// the strictest achievable subset of D6: nobody in production, everybody in
// preview and dev, where the browser earns its keep. An admin who needs it has
// preview deploys. Revisit when stage 2 lands a cookie session and the check
// can run server-side.
import { notFound } from "next/navigation";
import { isEmailPreviewAllowed } from "./access";
import EmailPreviewIndex from "./EmailPreviewIndex";

export default function EmailPreviewIndexPage() {
  if (!isEmailPreviewAllowed()) notFound();
  return <EmailPreviewIndex />;
}
