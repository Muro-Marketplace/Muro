import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";

// DELETE /api/account
// Soft-delete: anonymise profile rows, scrub optional PII, then delete the
// auth user. Records that must be preserved for tax/legal reasons (orders,
// refund_requests) are left in place but the personal identifiers are
// replaced with "[deleted]"/null.
//
// Safer body: expects { confirm: "DELETE" } to avoid accidental deletion.
export async function DELETE(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a: soft demo guard. 200 + {demo:true} so the portal can toast without
  // unwinding optimistic state. The helper had zero call sites while two doc
  // comments claimed it was enforced.
  const demoResp = assertNotDemo(auth.user!.id);
  if (demoResp) return demoResp;

  let body: { confirm?: string } = {};
  try { body = await request.json(); } catch { /* empty body is fine */ }
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: 'Send { "confirm": "DELETE" } to confirm account deletion.' },
      { status: 400 },
    );
  }

  const userId = auth.user!.id;
  const email = auth.user!.email || "";
  const db = getSupabaseAdmin();
  const anonTag = `[deleted-${userId.slice(0, 8)}]`;

  // 1. Scrub profile rows
  await db.from("artist_profiles").update({
    name: anonTag,
    short_bio: "",
    extended_bio: "",
    location: "",
    instagram: "",
    website: "",
    image: "",
  }).eq("user_id", userId);
  await db.from("venue_profiles").update({
    name: anonTag,
    location: "",
    address_line1: "",
    address_line2: "",
    city: "",
    postcode: "",
    contact_name: "",
    email: "",
    phone: "",
    description: "",
    image: "",
  }).eq("user_id", userId);

  // 2. Delete items that only exist for the user's own view
  await db.from("saved_items").delete().eq("user_id", userId);
  await db.from("notifications").delete().eq("user_id", userId);

  // 3. Anonymise message content sent by the user (preserve structure so the
  //    other party still sees their conversation thread)
  await db.from("messages").update({ content: "[message deleted]" }).eq("sender_id", userId);

  // 4. Anonymise orders that reference the email as buyer (retain the rest
  //    for tax/compliance).
  if (email) {
    await db.from("orders").update({ buyer_email: anonTag, shipping: {} }).eq("buyer_email", email);
  }

  // 5. Waitlist + applications: delete personal entries
  if (email) {
    await db.from("waitlist").delete().eq("email", email);
    await db.from("applications").update({ email: anonTag, name: anonTag, phone: "" }).eq("email", email);
  }

  // 6. Finally, delete the auth user (this cascades to RLS-scoped tables)
  try {
    await db.auth.admin.deleteUser(userId);
  } catch (err) {
    console.error("auth.admin.deleteUser failed:", err);
    return NextResponse.json({ error: "Could not delete auth user" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
