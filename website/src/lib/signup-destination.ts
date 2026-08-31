/**
 * Where a completed sign-up should land.
 *
 * `supabase.auth.signUp` returns a session only when email confirmation is
 * turned OFF for the project: the account is created and signed in on the
 * spot. With confirmation ON, `session` is null and the account cannot be
 * used until the link in the email is clicked.
 *
 * All three sign-up pages discarded the returned data and pushed
 * /check-your-inbox unconditionally. Confirmation is off in production, so a
 * new customer was already signed in when they were told to go and check
 * their email, and the portal guard bounced them onward to their dashboard.
 * They arrived somewhere sensible, but only by accident, and the page they
 * were sent to first was a lie.
 *
 * Reading the session makes the routing correct under either setting, so
 * turning confirmation on later is a project setting rather than a code
 * change. See A L447 and A L458.
 */

/** The shape we care about from a signUp response. */
export type SignUpResult = { session?: unknown | null } | null | undefined;

export const CHECK_INBOX_PATH = "/check-your-inbox";

/**
 * `next` is the caller's post-signup destination and is expected to have
 * already been through `safeRedirect`, which is what stops an open redirect.
 */
export function signupDestination(result: SignUpResult, next: string): string {
  // A session means confirmation is off and they are already signed in.
  // Anything else, including a failure to read the response, sends them to
  // the inbox page, which is the safe direction: being told to check your
  // email when you did not need to is recoverable, being dropped on a portal
  // you cannot load is not.
  return result?.session ? next : CHECK_INBOX_PATH;
}
