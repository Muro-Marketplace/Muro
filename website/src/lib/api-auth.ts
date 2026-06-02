import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Create an authenticated Supabase client from the request's Authorization header.
 * Returns the user and a scoped client, or a 401 response.
 */
export async function getAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return {
      user: null,
      error: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Invalid or expired token" }, { status: 401 }),
    };
  }

  return { user, supabaseClient: supabase, error: null };
}

/**
 * Like getAuthenticatedUser, but never returns a 401 — for public routes
 * that vary their response by viewer (e.g. paywalled venue fields). Anon
 * callers and bad tokens both resolve to { user: null }.
 */
export async function getOptionalUser(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { user: null };

  // Must never throw: callers (e.g. /api/venues/demand) wrap their whole
  // body in one try/catch, so a thrown auth-network error here would empty
  // the entire response. Treat any failure as "anon" (redacted) instead.
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);
    return { user: error ? null : user };
  } catch {
    return { user: null };
  }
}
