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

  // EVERY STEP IS CHECKED, and four of them were silently failing.
  //
  // This route ran nine unchecked writes and then reported success. Four of them
  // could not have worked, and each was a phantom-column or phantom-table
  // rejection that PostgREST returns as an error nobody read:
  //
  //   artist_profiles.image        does not exist (the column is `profile_image`),
  //                                and PostgREST rejects the WHOLE update, so the
  //                                artist scrub did NOTHING: name, both bios,
  //                                location, Instagram and website all survived.
  //   from("waitlist")             does not exist (`waitlist_signups` does), so
  //                                the signup was never deleted.
  //   from("applications")         does not exist (`artist_applications` does).
  //   artist_applications.phone    does not exist either, so even against the
  //                                right table that update would have failed.
  //
  // The consequence is not a cosmetic one: someone exercises their right to
  // erasure, this returns `{ success: true }`, their auth user is deleted so they
  // cannot log in to check, and their name, biography, location, social handles,
  // waitlist entry and full application (name, email, artist statement) all stay
  // in the database. Verified against production on 2026-08-28.
  //
  // `failures` collects rather than short-circuits: a scrub that stops at the
  // first error leaves MORE data behind than one that carries on and reports.
  const failures: string[] = [];
  const step = async (label: string, run: () => PromiseLike<{ error: unknown } | void>) => {
    try {
      const result = await run();
      const err = result && typeof result === "object" && "error" in result ? result.error : null;
      if (err) {
        failures.push(`${label}: ${(err as { message?: string }).message ?? String(err)}`);
      }
    } catch (err) {
      failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 1. Scrub profile rows. A user has at most one of these, so "0 rows updated"
  //    is the normal case for the other and is not an error.
  await step("artist_profiles", () =>
    db.from("artist_profiles").update({
      name: anonTag,
      short_bio: "",
      extended_bio: "",
      location: "",
      instagram: "",
      website: "",
      profile_image: "",
      banner_image: "",
      postcode: null,
      // Delist. Migration 117 lets the profile survive deletion as an
      // anonymised shell (user_id goes NULL when the auth user is removed),
      // and getAllDatabaseArtists treats approved as listed — without this the
      // shell would sit in /browse named "[deleted-…]".
      review_status: "rejected",
    }).eq("user_id", userId),
  );
  await step("venue_profiles", () =>
    db.from("venue_profiles").update({
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
    }).eq("user_id", userId),
  );

  // 2. Delete items that only exist for the user's own view
  await step("saved_items", () => db.from("saved_items").delete().eq("user_id", userId));
  await step("notifications", () => db.from("notifications").delete().eq("user_id", userId));

  // 3. Anonymise message content sent by the user (preserve structure so the
  //    other party still sees their conversation thread)
  await step("messages", () =>
    db.from("messages").update({ content: "[message deleted]" }).eq("sender_id", userId),
  );

  // 4. Anonymise orders that reference the email as buyer (retain the rest
  //    for tax/compliance).
  if (email) {
    await step("orders", () =>
      db.from("orders").update({ buyer_email: anonTag, shipping: {} }).eq("buyer_email", email),
    );
  }

  // 5. Waitlist + applications: delete personal entries. Both table names were
  //    wrong; these are the ones that exist.
  if (email) {
    await step("waitlist_signups", () =>
      db.from("waitlist_signups").delete().eq("email", email),
    );
    await step("artist_applications", () =>
      db
        .from("artist_applications")
        .update({ email: anonTag, name: anonTag, instagram: "", website: "", artist_statement: "" })
        .eq("email", email),
    );
  }

  // Refuse to delete the auth user while personal data is still standing. Doing
  // it anyway is what made this invisible: the account is gone, so nobody can
  // log in and notice their bio is still on the site.
  if (failures.length > 0) {
    console.error("[account DELETE] erasure incomplete, auth user RETAINED", { userId, failures });
    return NextResponse.json(
      {
        error:
          "We could not fully delete your data, so we have not closed the account. " +
          "Nothing has been half-removed. Please contact support and we will finish it by hand.",
      },
      { status: 500 },
    );
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
