// LA-C004 (launch audit 2026-09-05). One place to build the login bounce for a
// signed-out visitor so every portal guard keeps the deep link they arrived on.
// The login page reads ?next= and validates it with safeRedirect before using it,
// so the same validator decides here whether a target is worth carrying at all.

import { safeRedirect } from "./safe-redirect";

export function loginPathWithNext(
  pathname: string | null | undefined,
  search: string | null | undefined,
): string {
  const path = (pathname ?? "").trim();
  // The site root carries no deep link worth returning to.
  if (!path || path === "/") return "/login";
  const target = safeRedirect(path + (search ?? ""), "");
  if (!target || target === "/login" || target.startsWith("/login?")) return "/login";
  return `/login?next=${encodeURIComponent(target)}`;
}
