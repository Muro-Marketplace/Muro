// Subject-line token substitution. Deliberately dependency-free.
//
// 09 item 4.1. This lived inside `dispatcher.ts`, which imports `sendEmail`,
// which imports `supabase-admin`, which imports `server-only` and throws the
// moment anything outside a Server Component touches it. So the render harness
// could not reuse it, and a harness with its own copy of the substitution would
// pass while the real one left a literal `{{token}}` in somebody's inbox.
//
// One line of logic, one owner, importable from a script.

/**
 * Replace `{{tokenName}}` in a registry subject with values from `data`.
 *
 * An unmatched token is left in place ON PURPOSE, so the gap surfaces during
 * testing (and in `npm run email:render`) rather than being silently dropped
 * into an empty string that reads like a missing word.
 */
export function substituteTokens(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
    const val = data[key];
    if (val === undefined || val === null) return match;
    return typeof val === "string" ? val : String(val);
  });
}

/** Tokens still unsubstituted in a subject, e.g. `["{{orderNumber}}"]`. */
export function unsubstitutedTokens(subject: string): string[] {
  return subject.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? [];
}
