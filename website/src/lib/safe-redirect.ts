// src/lib/safe-redirect.ts
//
// Validate user-supplied "?next=" / "?redirect=" values before passing
// them to router.replace() or window.location. The rule is intentionally
// strict: must start with a single forward slash, must not start with
// "//" (protocol-relative), must not contain a colon (blocks
// javascript:, data:, etc.), must not contain a backslash (blocks
// "/\evil.com" tricks that some browsers treat as a hostname), and must
// not contain any ASCII control character.

const REJECTED_SUBSTRINGS = [":", "\\"] as const;

// Control characters (C0 range 0x00-0x1f and DEL 0x7f) have no place in an
// in-app redirect path. trim() only strips leading/trailing whitespace, so a
// control char embedded mid-string would otherwise survive; reject it before
// it can reach router.replace() or an emailRedirectTo header.
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function safeRedirect(input: unknown, fallback: string): string {
  if (typeof input !== "string") return fallback;
  const value = input.trim();
  if (value.length === 0) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (hasControlChar(value)) return fallback;
  for (const bad of REJECTED_SUBSTRINGS) {
    if (value.includes(bad)) return fallback;
  }
  return value;
}
