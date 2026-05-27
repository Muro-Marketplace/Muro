// Convert a /api/blogs response payload into a single-line message
// the BlogEditor can surface. Used by both POST (create) and PATCH
// (auto-save + submit) error paths.
//
// Response shapes the helper recognises:
//   - { error: string, issues: string[] }     - submit-for-review quality bar
//   - { error: string, details: ZodFormat }   - Zod safeParse failure
//   - { error: string }                       - everything else
//
// `details` is the shape returned by `parsed.error.format()` from Zod
// v4: a nested object with `_errors` arrays at each key. We surface
// field-level messages as "field: message" tokens so the author can
// see which input is wrong without opening devtools.

export function describeSaveError(data: unknown): string {
  if (!data || typeof data !== "object") return "Failed to save";
  const obj = data as { error?: unknown; details?: unknown; issues?: unknown };

  if (Array.isArray(obj.issues) && obj.issues.length > 0) {
    return obj.issues.filter((i) => typeof i === "string").join(" ");
  }

  if (obj.details && typeof obj.details === "object") {
    const fieldErrors: string[] = [];
    for (const [field, value] of Object.entries(obj.details as Record<string, unknown>)) {
      if (field === "_errors") continue;
      if (value && typeof value === "object" && "_errors" in (value as object)) {
        const errs = (value as { _errors?: unknown })._errors;
        if (Array.isArray(errs) && errs.length > 0 && typeof errs[0] === "string") {
          fieldErrors.push(`${field}: ${errs[0]}`);
        }
      }
    }
    if (fieldErrors.length > 0) return fieldErrors.join("; ");
  }

  return typeof obj.error === "string" ? obj.error : "Failed to save";
}
