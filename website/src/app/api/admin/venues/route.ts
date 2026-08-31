// G9. The venues panel had one button on it, the expand chevron, and no write
// path anywhere: approve, suspend, edit and remove were all absent.
//
// `venue_profiles` carries no review or suspension column, unlike
// artist_profiles.review_status, so publish state cannot be fixed from here
// without a migration. What can: correcting the record, which is the case that
// actually arises when a venue writes in to say their contact or address is
// wrong. Delete stays off this route deliberately, a venue row is referenced by
// placements, orders and messages, so removal is a data question, not a button.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { recordAdminAction } from "@/lib/admin-audit";
import { assertNotDemoStrict } from "@/lib/demo-guard";

export async function GET(request: Request) {
  const { error } = await getAdminUser(request);
  if (error) return error;

  try {
    const db = getSupabaseAdmin();
    // Pull every field that's potentially useful in the admin CRM. The
    // optional gallery / display columns might be missing on older
    // schemas, fall back to the lean select if so.
    let data: Array<Record<string, unknown>> | null = null;
    let dbError: { message?: string } | null = null;
    {
      const res = await db
        .from("venue_profiles")
        .select("id, user_id, slug, name, type, location, city, postcode, address_line1, address_line2, contact_name, email, phone, wall_space, description, image, images, approximate_footfall, audience_type, interested_in_free_loan, interested_in_revenue_share, interested_in_direct_purchase, preferred_styles, preferred_themes, display_wall_space, display_lighting, display_install_notes, display_rotation_frequency, created_at")
        .order("created_at", { ascending: false });
      data = (res.data as Array<Record<string, unknown>> | null) || null;
      dbError = res.error;
    }
    if (dbError) {
      const fallback = await db
        .from("venue_profiles")
        .select("id, user_id, slug, name, type, location, contact_name, email, phone, address_line1, city, postcode, wall_space, description, image, approximate_footfall, audience_type, interested_in_free_loan, interested_in_revenue_share, interested_in_direct_purchase, preferred_styles, preferred_themes, created_at")
        .order("created_at", { ascending: false });
      data = (fallback.data as Array<Record<string, unknown>> | null) || null;
      dbError = fallback.error;
    }

    if (dbError) throw dbError;

    // Augment each venue with a quick placement count so admins can see
    // who's actively using the platform without leaving the list.
    const slugs = (data || []).map((v) => v.slug as string).filter(Boolean);
    const placementCounts: Record<string, number> = {};
    if (slugs.length > 0) {
      const { data: pData } = await db
        .from("placements")
        .select("venue_slug")
        .in("venue_slug", slugs);
      for (const p of pData || []) {
        const s = p.venue_slug as string;
        if (s) placementCounts[s] = (placementCounts[s] || 0) + 1;
      }
    }

    const venues = (data || []).map((v) => ({
      ...v,
      placement_count: placementCounts[v.slug as string] || 0,
    }));

    return NextResponse.json({ venues });
  } catch (err) {
    console.error("Admin venues error:", err);
    return NextResponse.json({ error: "Failed to fetch venues" }, { status: 500 });
  }
}

// The allowlist IS the security boundary, so it is a schema with
// `.strict()` rather than a filter over an incoming object: an unknown key
// fails the parse outright instead of being quietly dropped. What is absent
// matters more than what is present. `slug` is the venue's public identity and
// every placement's foreign key; `user_id` is who owns the row; the stripe_*
// and subscription_* columns are written by Stripe webhooks and reconcilers,
// and an admin editing them by hand would put the local mirror out of step with
// the account it mirrors.
const editableFields = z
  .object({
    name: z.string().min(1).max(200),
    type: z.string().max(80),
    location: z.string().max(200),
    city: z.string().max(120),
    postcode: z.string().max(20),
    address_line1: z.string().max(200),
    address_line2: z.string().max(200),
    contact_name: z.string().max(150),
    email: z.string().email().max(200),
    phone: z.string().max(40),
    wall_space: z.string().max(500),
    description: z.string().max(5000),
    approximate_footfall: z.string().max(120),
    audience_type: z.string().max(200),
    interested_in_free_loan: z.boolean(),
    interested_in_revenue_share: z.boolean(),
    interested_in_direct_purchase: z.boolean(),
    display_wall_space: z.string().max(500),
    display_lighting: z.string().max(500),
    display_install_notes: z.string().max(1000),
    display_rotation_frequency: z.string().max(200),
  })
  .partial()
  .strict();

const patchSchema = z.object({
  id: z.string().min(1).max(100),
  fields: editableFields,
});

export async function PATCH(request: Request) {
  const auth = await getAdminUser(request);
  if (auth.error) return auth.error;
  // The mutation ratchet (01 Phase E item 15) wants every service-role write
  // behind the demo guard. Strict rather than soft: an edit that silently did
  // nothing while returning 200 would leave an admin believing the record was
  // corrected. Dormant unless a demo user id is also an admin.
  const demo = assertNotDemoStrict(auth.user?.id);
  if (demo) return demo;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const fields = Object.entries(parsed.data.fields).filter(([, v]) => v !== undefined);
  if (fields.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: venue } = await db
    .from("venue_profiles")
    .select("id, slug, name")
    .eq("id", parsed.data.id)
    .maybeSingle<{ id: string; slug: string | null; name: string | null }>();

  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = Object.fromEntries(fields);
  updates.updated_at = new Date().toISOString();

  const { error: updateError } = await db
    .from("venue_profiles")
    .update(updates)
    .eq("id", venue.id);

  if (updateError) {
    console.error("[admin/venues PATCH]", updateError);
    return NextResponse.json({ error: "Could not update that venue" }, { status: 500 });
  }

  // Which fields an admin touched, never the values. The row itself is
  // queryable and the values are a named venue's contact details; the audit log
  // records that a change happened and who made it.
  await recordAdminAction({
    adminUserId: auth.user!.id,
    action: "venue.edit",
    context: {
      venue_id: venue.id,
      slug: venue.slug,
      fields: fields.map(([k]) => k),
    },
  });

  return NextResponse.json({ success: true, fields: fields.map(([k]) => k) });
}
