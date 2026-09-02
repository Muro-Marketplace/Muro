//
// Final review, Finding 2: the same terms-version literal was hardcoded in
// five places (three signup pages, ApplicationForm.tsx, and the OAuth
// finalize route), so a future legal change had to be typed correctly five
// times or the terms_acceptances audit trail would silently record the wrong
// string for whichever caller got missed. One constant, imported everywhere.
//
// terms_acceptances is append-only (see api/terms/accept and
// api/auth/oauth-finalize): every row is evidence of what a user accepted at
// the moment they accepted it, and nothing in the codebase reads a user's
// past terms_version back to gate access or force re-acceptance on a bump.
// So changing this value only changes what new rows record, not what any
// existing user can do.
//
// The September 2026 agreements added section 9A (programme rent) to the
// artist agreement and changed section 2 of the venue agreement, so this
// bumps from the April 2026 baseline.
export const TERMS_VERSION = "v1.1-2026-09";
