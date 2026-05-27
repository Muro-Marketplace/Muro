// Server-side helper that resolves the viewer access context for any
// spaces / venue-detail request. Wraps three concerns:
//   1. authentication (Authorization: Bearer or cookie session)
//   2. user_type discovery (artist / venue / customer / admin / null)
//   3. subscription resolution (artist-only)
//
// Callers pass an optional `venueUserId` when the check is scoped to a
// specific venue page; when supplied, the helper computes `isOwnVenue`
// so a venue user can see their own profile via the venue-portal
// "preview my public profile" link.
//
// Never throws. On any unrecoverable error returns the safe-default
// anonymous context (gated).

import { createClient } from "@supabase/supabase-js";
import { resolveSubscription } from "@/lib/subscriptions";
import type { SpaceViewerContext, ViewerType } from "./gating";

function anonContext(): SpaceViewerContext {
  return { viewerType: null, isSubscribed: false };
}

function bearerTokenFrom(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1] : null;
}

function adminEmails(): string[] {
  const list = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "";
  return list
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function userTypeFromMetadata(metadata: unknown): ViewerType {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as { user_type?: unknown }).user_type;
  if (raw !== "artist" && raw !== "venue" && raw !== "customer" && raw !== "admin") {
    return null;
  }
  return raw;
}

export async function resolveSpaceViewerAccess(
  request: Request,
  opts?: { venueUserId?: string | null },
): Promise<SpaceViewerContext> {
  const token = bearerTokenFrom(request);
  if (!token) return anonContext();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return anonContext();

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData?.user) return anonContext();

  const user = userData.user;
  const email = (user.email || "").toLowerCase();
  const fromMeta = userTypeFromMetadata(user.user_metadata);

  // Admin override: an admin email always reads as admin even if the
  // user_metadata says something else (lets support staff inspect
  // venues without flipping their own profile type).
  const isAdmin = email && adminEmails().includes(email);
  const viewerType: ViewerType = isAdmin ? "admin" : fromMeta;

  let isSubscribed = false;
  if (viewerType === "artist") {
    const sub = await resolveSubscription(user.id);
    isSubscribed = sub.active;
  }

  const isOwnVenue =
    viewerType === "venue" &&
    !!opts?.venueUserId &&
    user.id === opts.venueUserId;

  return { viewerType, isSubscribed, isOwnVenue };
}
