# Plan G — Targeted Fixes & Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a fresh batch of bugs, UX gaps, and small features surfaced after Plans A–F were drafted. None of the items below were addressed in earlier plans (the assessment table at the top of each task confirms).

**Architecture:** Mostly mechanical edits and small new flows. Three areas have meaningful new surface: (1) artwork-requests display + counter (Tasks 3–6), (2) the Three.js wall visualizer mobile UX (Task 14), (3) artist→venue "send to wall" submission flow (Task 15). Everything else is bug-fix surgery.

**Tech Stack:** Next.js 16.2, React 19.2, Tailwind 4, Vitest 2.1. Tasks touching the visualizer use `@react-three/fiber` + `@react-three/drei` + `three` (already in package.json). No new deps.

**Independence:**
- Sits **on top of Plans A + B (already merged)**.
- Plan G Task 7 (portal dropdown sync) overlaps Plan D Task 16 (portal switcher) — both touch Header.tsx's portal dropdown. They're additive, not conflicting; sequential merge is clean.
- Plan G Task 11 (hover-to-save) extends Plan F Task 7's `<SaveButton>` toasts. If Plan F isn't merged, Task 11 still works (toasts are an enhancement, not a dependency).
- Plan G Task 6 (venue QR label fixes) overlaps territory with the existing per-label visibility work (commit `104e266`); the QA report's §7.6 "helper text" piece is in Plan F Task 19, but the actual control bugs (toggle won't deselect, sizes hidden) are net new and live here.

**Out of scope:**
- Anything Plans A–F already covered. Self-review at the bottom maps every input to its destination plan or to a Plan G task.

**Branch strategy:**
- Worktree: `git worktree add .claude/worktrees/qa-g-targeted claude/qa-g-targeted` off `main`.
- One commit per task. Push after Phase 2 (artwork-request fixes ship as a coherent unit).

**Phases:**
1. Navigation bugs (Tasks 1–2)
2. Artwork requests overhaul (Tasks 3–6)
3. QR labels (Tasks 7–8)
4. Demo data + scroll polish (Tasks 9–10)
5. Save UX on web (Task 11)
6. Curated + content (Tasks 12–13)
7. Mobile wall visualizer (Task 14)
8. Cross-side artist↔venue submission (Task 15)
9. Spawned chips for structural redesigns (Task 16)
10. Final verification + PR (Task 17)

---

## Phase 1 — Navigation bugs

### Task 1: Checkout "back" after offer accepted no longer 404s

**Assessment:** Net new. Plan A's login `?next=` (Task 5) covers the auth round-trip, but says nothing about the post-offer-accept checkout flow.

**Symptom (per user):** Accept a counter offer → land on `/checkout` to pay → press browser Back → 404. The intermediate state is gone because the placement-detail page already moved on, or the checkout pushed onto the history stack as a replacement of an intermediate non-existent route.

**Files:**
- Modify: the route or component that redirects to checkout after `accept`. Likely `src/app/api/placements/route.ts` returns a redirect URL OR `PlacementDetailClient.tsx` performs the navigation. Verify first.
- Modify: `src/app/(pages)/checkout/page.tsx` — make the back link explicit.

- [ ] **Step 1: Reproduce + locate**

```bash
grep -rn "router.push.*checkout\|location.href.*checkout\|redirect.*checkout" src/ | head
```

Trace the call site that pushes the user to checkout after `accept`. Likely shape: `router.push("/checkout?ref=offer-${placementId}")`.

- [ ] **Step 2: Pass the placement id explicitly**

When pushing to checkout, append a `?backTo=/placements/{id}` param:

```tsx
router.push(`/checkout?backTo=${encodeURIComponent(`/placements/${placementId}`)}`);
```

- [ ] **Step 3: Honour `backTo` on the checkout page**

In `checkout/page.tsx`, replace the existing "Back" link / button with one that prefers `?backTo=`:

```tsx
import { safeRedirect } from "@/lib/safe-redirect"; // Plan A's helper

const sp = useSearchParams();
const backHref = safeRedirect(sp.get("backTo"), "/browse");

// Render as a Link, not router.back()
<Link href={backHref} className="text-sm text-muted hover:text-foreground">
  ← Back
</Link>
```

`router.back()` was the broken path — it relies on a history entry that may have been replaced. An explicit Link to the placement detail always works.

- [ ] **Step 4: Smoke**

Open a placement, accept a counter offer with payment due, land on checkout, click Back → lands on the placement detail page. Browser back also works (the placement detail is now in the history stack).

- [ ] **Step 5: Commit**

```bash
git add # the file that pushes to checkout, src/app/(pages)/checkout/page.tsx
git commit -m "fix(checkout): explicit backTo param prevents 404 on back from offer-accept"
```

---

### Task 2: Header portal dropdown reflects current portal pages

**Assessment:** Net new. Plan A didn't touch the Header's hardcoded portal dropdown items (lines 731–765 of Header.tsx per Plan A's snapshot). Plan D Task 16 added a portal switcher (for users with multiple accounts) but didn't audit the per-role link list.

**Files:**
- Modify: `src/components/Header.tsx`

- [ ] **Step 1: Audit each portal sidebar vs Header dropdown**

```bash
grep -n "label:\\|href:" src/components/ArtistPortalLayout.tsx | grep -v "//"
grep -n "label:\\|href:" src/components/VenuePortalLayout.tsx | grep -v "//"
grep -n "label:\\|href:" src/components/CustomerPortalLayout.tsx | grep -v "//"
```

Compare each list to the corresponding `links` array inside `Header.tsx`'s portal dropdown JSX (the IIFE that returns the per-role link set).

- [ ] **Step 2: Reconcile**

For each role, the Header dropdown should be a strict subset of the sidebar (so the dropdown doesn't surface pages the sidebar doesn't). For each new portal page added since the dropdown was last updated, add it to the dropdown's array — preserving the existing visual order (Dashboard / Profile / core pages → secondary / Settings at the end).

- [ ] **Step 3: Add a maintenance comment**

At the top of the IIFE in Header.tsx:

```tsx
// IMPORTANT: keep this list in sync with the {ArtistPortalLayout,
// VenuePortalLayout, CustomerPortalLayout}.tsx sidebar `nav` arrays.
// If you add a portal page, update both. There's no automated check.
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.tsx
git commit -m "fix(nav): Header portal dropdown synced with current sidebar pages"
```

---

## Phase 2 — Artwork requests overhaul

The artwork-request flow has multiple distinct bugs. Tasks 3–6 ship them as separate commits so review can rebase if any single piece has issues.

### Task 3: Resolve venue name (not id) in artwork-request rows

**Assessment:** Net new. Plan C Task 4 fixed the saved-collection link's id-only routing, but artwork-request rows are a separate display.

**Files:**
- Modify: the artist-portal page that renders incoming artwork requests (likely `src/app/(pages)/artist-portal/placements/page.tsx` since these flow through the placements table — confirm by reading)
- Modify: the API route that returns the request data, if it doesn't already join venue_profiles

- [ ] **Step 1: Locate the rendering**

```bash
grep -rn "artwork.request\|artwork_request\|requester_name\|requester_user_id" src/app/\(pages\) src/components | head
```

Identify the component that displays the request rows. Look at what field it currently shows where the venue name should be.

- [ ] **Step 2: Server-side: ensure the API joins venue name**

If the route returning artwork-request rows currently selects `requester_user_id` but doesn't join `venue_profiles.name`, add the join. Sample (`src/app/api/placements/route.ts` GET branch):

```typescript
// Replace the bare select with a left join on venue_profiles
const { data } = await db
  .from("placements")
  .select(`
    *,
    venue_profile:venue_profiles!venue_user_id ( name, slug ),
    artist_profile:artist_profiles!artist_user_id ( name, slug )
  `)
  .eq("artist_user_id", auth.user!.id);
```

Adapt to the actual table / column names.

- [ ] **Step 3: Client-side: render the resolved name**

```tsx
// Was:
<p className="text-xs text-muted">From: {request.requester_user_id}</p>

// Now:
<p className="text-xs text-muted">
  From: {request.venue_profile?.name ?? request.venue_slug ?? "Venue"}
</p>
```

Fall through chain: full name → slug → generic "Venue" so legacy NULL rows still render something sensible.

- [ ] **Step 4: Smoke**

Send an artwork request from a venue to an artist. Sign in as the artist. The request row reads "From: Copper Kettle" (or whatever venue name), not a UUID.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/placements/route.ts \
        "src/app/(pages)/artist-portal/placements/page.tsx"
git commit -m "fix(placements): show venue name (not user id) on incoming artwork requests"
```

---

### Task 4: Resolve artist name + selected images on outgoing offer rows

**Assessment:** Net new. Same family as Task 3 but on the venue side (when an artist offers their work for the venue's wall).

**Symptom (per user):** offer row shows "artist id" and no images.

**Files:**
- Modify: the venue-portal page that renders outgoing artist offers
- Modify: the API route returning them, if needed

- [ ] **Step 1: Confirm the data shape**

```bash
grep -rn "selected_images\|extra_works\|images_for_offer" src/ | head
```

Find what column the artist's offer attaches images on. Likely `placements.extra_works` (a JSONB array of `{ work_id, image_url }`) or `placements.images_json`.

- [ ] **Step 2: Resolve artist name (mirror Task 3's pattern)**

Add a join on `artist_profiles` (`name`, `slug`). Render `artist_profile?.name ?? artist_slug ?? "Artist"`.

- [ ] **Step 3: Render the images**

For each image attached to the offer, show a thumbnail with `<ImageWithFallback>` (Plan F Task 2 — if Plan F isn't merged, plain `<img>` with onError works):

```tsx
<div className="flex gap-2 mt-2">
  {(offer.extra_works || []).slice(0, 4).map((w, i) => (
    <ImageWithFallback
      key={i}
      src={w.image_url}
      alt={w.title || "Work"}
      className="w-14 h-14 rounded-sm object-cover"
    />
  ))}
  {(offer.extra_works || []).length > 4 && (
    <span className="text-xs text-muted self-center">+{offer.extra_works.length - 4}</span>
  )}
</div>
```

- [ ] **Step 4: Smoke**

Sign in as Maya Chen. Offer a work (or a few works) to a venue's wall. Switch to the venue account. Offer row shows artist name + thumbnails of the offered works.

- [ ] **Step 5: Commit**

```bash
git add # the venue-portal page + API route if touched
git commit -m "fix(placements): outgoing offers show artist name + work thumbnails"
```

---

### Task 5: Counter button on artwork-request offer rows

**Assessment:** Net new. Plan A's Task 9 (state machine) and the existing `CounterPlacementDialog` cover the counter mechanics, but the artwork-request UI may not surface a Counter button — only Accept / Decline.

**Files:**
- Modify: the offer-row rendering (same component as Task 4)
- Modify: the equivalent on the artist side for incoming venue requests (same as Task 3's rendering)

- [ ] **Step 1: Add Counter alongside Accept / Decline**

```tsx
import CounterPlacementDialog from "@/components/CounterPlacementDialog";
import { canRespond } from "@/lib/placement-permissions";

const [counteringId, setCounteringId] = useState<string | null>(null);

// In the row:
{canRespond(request, currentUserId) && (
  <button
    type="button"
    onClick={() => setCounteringId(request.id)}
    className="text-xs px-3 py-1.5 border border-border rounded-sm hover:bg-background"
  >
    Counter
  </button>
)}

// Outside the list, render the dialog when active:
{counteringId && (
  <CounterPlacementDialog
    placementId={counteringId}
    initial={{
      monthly_fee_gbp: requestById[counteringId].monthly_fee_gbp,
      revenue_share_percent: requestById[counteringId].revenue_share_percent,
      qr_enabled: requestById[counteringId].qr_enabled,
    }}
    currentUserId={currentUserId}
    onClose={() => setCounteringId(null)}
    onSuccess={() => { setCounteringId(null); refresh(); }}
  />
)}
```

- [ ] **Step 2: Apply on both sides**

Both the artist-side incoming-request rows and the venue-side incoming-offer rows need the Counter button. The `canRespond` helper already enforces "not the original requester can respond" (Plan A's Task 9 verified this).

- [ ] **Step 3: Smoke**

End-to-end: venue sends artwork request → artist counters → venue counters back → artist accepts. Each step renders the right buttons (no Counter button for the side that just countered, per `canRespond`).

- [ ] **Step 4: Commit**

```bash
git add # the two pages + dialog if any prop tweaks
git commit -m "feat(placements): Counter button on artwork-request rows"
```

---

### Task 6: Loan-type artwork requests create placement rows

**Assessment:** Net new. Plan C Task 14 introduced `paid_loan` as a distinct arrangement type, but didn't audit whether loan acceptance creates a placement row in the `placements` table.

**Files:**
- Verify (read): `src/app/api/placements/route.ts` (PATCH branch on accept)
- Verify (read): the artwork-request acceptance handler (may live in a different route)
- Modify if the row isn't created

- [ ] **Step 1: Audit**

```bash
grep -rn "arrangement_type.*loan\|paid_loan\|free_loan" src/app/api | head
```

Read the accept-flow code. Confirm:
- When `arrangement_type IN ('free_loan', 'paid_loan')` and the placement transitions to `active`, a row exists in the `placements` table with the correct `start_date`, `end_date`, `arrangement_type`, and that the artist's `placements` page shows it.

- [ ] **Step 2: Trace via SQL**

```sql
SELECT id, status, arrangement_type, start_date, end_date, monthly_fee_gbp
FROM placements
WHERE artist_user_id = '<test artist id>'
ORDER BY created_at DESC LIMIT 10;
```

After accepting a loan offer, this should show a fresh `active` row.

- [ ] **Step 3: Fix if missing**

Most likely the issue is one of:
- The PATCH `accept` branch updates the existing pending row to `active` correctly (most likely, no fix needed) — confirm.
- A separate flow (a "send loan to wall" form distinct from the placement-request PATCH) doesn't insert into `placements` — fix by mirroring the standard flow.

If the data flow is OK and the artist's `/artist-portal/placements` doesn't display loan rows, the bug is in the page query: it's filtering them out (e.g. `arrangement_type = 'revenue_share' OR arrangement_type = 'purchase'`). Widen the filter.

- [ ] **Step 4: Smoke**

Loan-type acceptance now appears in `/artist-portal/placements` and `/venue-portal/placements` as an Active row.

- [ ] **Step 5: Commit**

```bash
git add # whichever files needed editing (could be empty commit if already correct)
git commit -m "fix(placements): loan acceptances surface in placements lists"
```

If the audit confirmed everything works, document and commit empty:

```bash
git commit --allow-empty -m "chore(placements): verified loan acceptances create placement rows; no code change"
```

---

### Task 6a: Public artwork-requests surface

**Assessment:** Net new. Folds in part of the structural redesign that was originally chipped in Task 16. Three changes ship together:
1. New page `/artwork-requests` listing all open venue-posted requests
2. New "Open requests" tab on `/spaces-looking-for-art` (alongside the existing "Walls" tab)
3. Header / footer link so the page is reachable

**Files:**
- Create: `src/app/(pages)/artwork-requests/page.tsx`
- Modify: `src/app/(pages)/spaces-looking-for-art/page.tsx`
- Modify: `src/app/api/placements/route.ts` (or create `src/app/api/placements/public/route.ts`)
- Modify: `src/components/Header.tsx`
- Modify: `src/components/Footer.tsx`

- [ ] **Step 1: Public-listing API endpoint**

The existing `GET /api/placements` is auth-gated and scoped to the caller. We need a separate, unauth-friendly endpoint that returns only:
- Rows where `requester_user_id` belongs to a `venue_profile`
- `status === "pending"` (i.e. open / not yet engaged)
- A subset of safe fields: id, venue_slug, venue_name (joined), brief, monthly_fee_gbp, revenue_share_percent, qr_enabled, arrangement_type, created_at

```typescript
// src/app/api/placements/public/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("placements")
    .select(`
      id,
      brief,
      arrangement_type,
      monthly_fee_gbp,
      revenue_share_percent,
      qr_enabled,
      created_at,
      venue_profile:venue_profiles!venue_user_id ( name, slug )
    `)
    .eq("status", "pending")
    .not("venue_user_id", "is", null) // venue-initiated only
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({
    requests: (data || []).map((r) => ({
      id: r.id,
      brief: r.brief,
      arrangement_type: r.arrangement_type,
      monthly_fee_gbp: r.monthly_fee_gbp,
      revenue_share_percent: r.revenue_share_percent,
      qr_enabled: r.qr_enabled,
      created_at: r.created_at,
      venue_name: r.venue_profile?.name ?? "Venue",
      venue_slug: r.venue_profile?.slug ?? null,
    })),
  });
}
```

- [ ] **Step 2: New `/artwork-requests` page**

```tsx
// src/app/(pages)/artwork-requests/page.tsx
import type { Metadata } from "next";
import ArtworkRequestsClient from "./ArtworkRequestsClient";

export const metadata: Metadata = {
  title: "Artwork requests — Wallplace",
  description: "Venues posting open calls for art. Submit your work to be considered.",
};

export default function ArtworkRequestsPage() {
  return <ArtworkRequestsClient />;
}
```

`ArtworkRequestsClient.tsx` is a `"use client"` component that fetches `/api/placements/public`, renders each request as a card showing venue name, brief, arrangement summary, and a "View" CTA. Use `<EmptyState>` (Plan D Task 2) when zero results. Apply `<Breadcrumbs>` (Plan D Task 1) at the top: `Home › Artwork requests`.

- [ ] **Step 3: Spaces page — "Open requests" tab**

`/spaces-looking-for-art/page.tsx` currently lists venue walls. Add a tab toggle at the top:

```tsx
const view = searchParams.get("view") || "walls";

<div className="flex gap-2 border-b border-border mb-6">
  <Link
    href="/spaces-looking-for-art"
    className={view === "walls" ? "font-medium border-b-2 border-accent pb-2" : "text-muted pb-2"}
  >
    Walls
  </Link>
  <Link
    href="/spaces-looking-for-art?view=requests"
    className={view === "requests" ? "font-medium border-b-2 border-accent pb-2" : "text-muted pb-2"}
  >
    Open requests
  </Link>
</div>

{view === "requests" ? <ArtworkRequestsList /> : <ExistingWallsList />}
```

Reuse the same `ArtworkRequestsClient` component (or factor a shared `<ArtworkRequestsList>` for both surfaces).

- [ ] **Step 4: Nav link**

In `Header.tsx`, add to the marketplace tabs (the inline tabs shown when inside `/browse` or `/spaces-looking-for-art`):

```tsx
const marketplaceTabs = [
  { label: "Galleries", href: "/browse" },
  { label: "Portfolios", href: "/browse?view=portfolios" },
  { label: "Collections", href: "/browse?view=collections" },
  { label: "Spaces", href: "/spaces-looking-for-art" },
  { label: "Open requests", href: "/spaces-looking-for-art?view=requests" }, // NEW
];
```

In `Footer.tsx`'s "For Artists" column add: `{ label: "Artwork Requests", href: "/artwork-requests" }`.

- [ ] **Step 5: Smoke**

Sign out. Visit `/artwork-requests` — list of open requests with venue names. Visit `/spaces-looking-for-art?view=requests` — same list inline. Header has the new tab while inside marketplace pages.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/placements/public/route.ts \
        "src/app/(pages)/artwork-requests/page.tsx" \
        "src/app/(pages)/artwork-requests/ArtworkRequestsClient.tsx" \
        "src/app/(pages)/spaces-looking-for-art/page.tsx" \
        src/components/Header.tsx src/components/Footer.tsx
git commit -m "feat(requests): public /artwork-requests surface + spaces tab"
```

---

### Task 6b: Venue profile surfaces their open artwork requests

**Files:**
- Modify: `src/app/(pages)/venues/[slug]/page.tsx`

- [ ] **Step 1: Section below the walls list**

After the existing walls section, add an "Open requests from this venue" block:

```tsx
const { data: requests } = await db
  .from("placements")
  .select("id, brief, arrangement_type, monthly_fee_gbp, revenue_share_percent, created_at")
  .eq("venue_user_id", venue.user_id)
  .eq("status", "pending")
  .is("artist_user_id", null) // open / not yet directed at a specific artist
  .order("created_at", { ascending: false });

// In render, only when requests.length > 0:
<section className="mt-10">
  <h2 className="text-xl font-medium mb-4">Open artwork requests</h2>
  <ul className="space-y-3">
    {requests.map((r) => (
      <li key={r.id} className="border border-border rounded-sm p-4">
        <p className="text-sm">{r.brief}</p>
        <p className="text-xs text-muted mt-1">
          {summariseArrangement(r)} · Posted {new Date(r.created_at).toLocaleDateString("en-GB")}
        </p>
        {/* "Submit your work" button if viewer is an artist — see Task 15 */}
      </li>
    ))}
  </ul>
</section>
```

(`summariseArrangement` is a one-liner helper — `"Paid loan £${monthly_fee_gbp}/mo"` / `"Rev share ${revenue_share_percent}%"` / etc.)

- [ ] **Step 2: Smoke**

Post an open request from a venue. Visit that venue's public profile. The request appears in the new section. If no open requests, the section is hidden entirely.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/venues/[slug]/page.tsx"
git commit -m "feat(venues): public profile surfaces venue's open artwork requests"
```

---

### Task 6c: Artist portal — only show engaged-with requests

**Assessment:** Net new. Currently `/artist-portal/placements` shows every incoming request, including ones the artist has never opened. Per the user's brief: only requests the artist has engaged with belong in the portal; discovery happens on the public surfaces (Tasks 6a / 6b).

**Files:**
- Modify: `src/app/(pages)/artist-portal/placements/page.tsx`
- Modify: `src/app/api/placements/route.ts` (the GET branch) — add an `?engaged=true` filter

- [ ] **Step 1: Define "engaged"**

A placement counts as engaged for the artist when ANY is true:
- `status` ∈ (`"active"`, `"declined"`, `"completed"`, `"sold"`, `"cancelled"`) — non-pending
- `requester_user_id === artist's user_id` — the artist initiated
- The artist has sent at least one message into the placement's conversation thread (counter-offer, decline note, accept note)

The first two are easy SQL filters. The third needs a join to `messages`:

```sql
WHERE artist_user_id = $1
  AND (
    status <> 'pending'
    OR requester_user_id = $1
    OR EXISTS (
      SELECT 1 FROM messages m
      WHERE m.metadata->>'placementId' = placements.id::text
        AND m.sender_id = $1
    )
  )
```

- [ ] **Step 2: Add `?engaged=true` to the API**

```typescript
// In src/app/api/placements/route.ts GET:
const url = new URL(request.url);
const engagedOnly = url.searchParams.get("engaged") === "true";

// Build the query, then if engagedOnly add the message-existence filter via .or() / a custom SQL view.
// Supabase's PostgREST doesn't support correlated EXISTS easily — easiest is to pre-fetch the placement IDs
// where the artist has sent a message, then `.in("id", engagedIds)` on the placements query.

let engagedIds: Set<string> | null = null;
if (engagedOnly) {
  const { data: messages } = await db
    .from("messages")
    .select("metadata")
    .eq("sender_id", auth.user!.id)
    .not("metadata->placementId", "is", null);
  engagedIds = new Set((messages || []).map((m) => m.metadata?.placementId).filter(Boolean));
}

let query = db.from("placements").select("...").eq("artist_user_id", auth.user!.id);
if (engagedOnly) {
  query = query.or(
    `status.neq.pending,requester_user_id.eq.${auth.user!.id}`
      + (engagedIds && engagedIds.size > 0 ? `,id.in.(${[...engagedIds].join(",")})` : "")
  );
}
```

- [ ] **Step 3: Default the artist portal to `?engaged=true`**

In `artist-portal/placements/page.tsx`, change the fetch URL to `/api/placements?engaged=true`. Optionally add a small "Show all" link for an opt-out:

```tsx
<Link href="?all=1" className="text-xs text-muted">Show all incoming requests</Link>
```

- [ ] **Step 4: Smoke**

Sign in as a fresh artist. Visit `/artist-portal/placements` — empty. From `/artwork-requests`, click a request, send a counter — back to portal, the request now appears.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/placements/route.ts \
        "src/app/(pages)/artist-portal/placements/page.tsx"
git commit -m "fix(artist-portal): placements list shows only engaged-with requests"
```

---

### Task 6d: Submission form — four action types

**Assessment:** Net new. Replaces the existing "select existing works" primary entry with four action paths. Significant UX restructure.

**Files:**
- Modify: `src/components/SpacesPlacementRequestForm.tsx`
- Possibly extract sub-components for clarity

The four action types:

1. **Quote a price** — artist names a price for an existing work or a new commission.
2. **Request a placement** — artist proposes their work for the venue's wall under a specific arrangement (paid loan / free loan / rev share / QR).
3. **Suggest a commission** — artist proposes creating a new piece tailored to the venue.
4. **Just a message** — opens a normal message thread with no structured proposal.

- [ ] **Step 1: Top-level action picker**

```tsx
type Action = "quote" | "placement" | "commission" | "message";
const [action, setAction] = useState<Action>("placement");

<fieldset className="space-y-2">
  <legend className="text-sm font-medium mb-2">What do you want to send?</legend>
  {[
    { v: "placement",  label: "Request a placement", hint: "Propose your work for their wall under a specific arrangement." },
    { v: "quote",      label: "Quote a price",       hint: "For an existing work or a fixed commission price." },
    { v: "commission", label: "Suggest a commission",hint: "Propose creating something new tailored to their space." },
    { v: "message",    label: "Just a message",      hint: "Open a thread without a formal proposal." },
  ].map((a) => (
    <label key={a.v} className="flex items-start gap-3 p-3 border border-border rounded-sm cursor-pointer hover:bg-surface">
      <input
        type="radio"
        name="action"
        value={a.v}
        checked={action === a.v}
        onChange={() => setAction(a.v as Action)}
        className="mt-1"
      />
      <div>
        <p className="text-sm font-medium">{a.label}</p>
        <p className="text-xs text-muted">{a.hint}</p>
      </div>
    </label>
  ))}
</fieldset>
```

- [ ] **Step 2: Action-specific sub-form for "Request a placement"**

```tsx
{action === "placement" && (
  <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={paidLoan} onChange={(e) => setPaidLoan(e.target.checked)} />
        <span className="text-sm">Paid loan</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={qrEnabled} onChange={(e) => setQrEnabled(e.target.checked)} />
        <span className="text-sm">QR-enabled</span>
      </label>
    </div>

    {paidLoan && (
      <div>
        <label className="text-xs text-muted">Monthly fee (£)</label>
        <input
          type="number"
          min={0}
          value={monthlyFee}
          onChange={(e) => setMonthlyFee(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-full px-3 py-2 border border-border rounded-sm text-sm"
        />
      </div>
    )}

    {qrEnabled && (
      <div>
        <label className="text-xs text-muted">Revenue share to the venue (%)</label>
        <input
          type="number"
          min={0}
          max={50}
          value={revShare}
          onChange={(e) => setRevShare(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-full px-3 py-2 border border-border rounded-sm text-sm"
        />
        <p className="text-[11px] text-muted mt-1">Max 50% to the venue.</p>
      </div>
    )}

    {/* Multi-select work picker stays — but only inside the placement sub-form, not as a top-level entry */}
    <WorkPicker selectedIds={workIds} onChange={setWorkIds} />
  </div>
)}
```

- [ ] **Step 3: Action-specific sub-forms for the other three**

- "Quote a price": single-work picker + price input + optional message
- "Suggest a commission": price input + commission brief textarea + optional reference images
- "Just a message": message textarea only

Keep each sub-form to its minimum required fields; don't ask for things the action doesn't need.

- [ ] **Step 4: Submit dispatcher**

The existing submit handler probably calls one endpoint. Now it dispatches by action:

```tsx
async function submit() {
  if (action === "message") {
    await authFetch("/api/messages", {
      method: "POST",
      body: JSON.stringify({ recipientSlug: venueSlug, content: message }),
    });
  } else {
    // placement / quote / commission all create a placement row, with arrangement_type set per action
    const arrangementType =
      action === "placement"  ? (paidLoan ? "paid_loan" : qrEnabled ? "revenue_share" : "free_loan") :
      action === "quote"      ? "purchase" :
      /* commission */          "commission";

    await authFetch("/api/placements", {
      method: "POST",
      body: JSON.stringify({
        venueSlug,
        wallId: wallId || null,
        arrangementType,
        monthlyFeeGbp: paidLoan ? monthlyFee : null,
        revenueSharePercent: qrEnabled ? revShare : null,
        qrEnabled,
        extraWorks: workIds.map((id) => ({ work_id: id })),
        message: message.trim() || null,
      }),
    });
  }
}
```

(`commission` may need a small migration to introduce as a new `arrangement_type` value — mirror Plan C Task 14's pattern. If the timeline doesn't support a new migration in this PR, ship `purchase` for both quote and commission and add a follow-up chip.)

- [ ] **Step 5: Smoke**

Sign in as Maya Chen. Open the form via the "Submit your work" button on Copper Kettle's profile (Task 15 wires that up). Try each of the four action types end-to-end. Each lands in `/venue-portal/placements` (or `/venue-portal/messages` for "Just a message") with the right shape.

- [ ] **Step 6: Commit**

```bash
git add src/components/SpacesPlacementRequestForm.tsx
git commit -m "feat(requests): submission form has four action types (placement/quote/commission/message)"
```

---

### Task 6e: "Request sent" optimistic feedback

**Files:**
- Modify: `src/components/SpacesPlacementRequestForm.tsx`

- [ ] **Step 1: After successful submit, lock the form into a "sent" state**

```tsx
const [sent, setSent] = useState(false);

async function submit() {
  // ...existing submit logic...
  if (res.ok) {
    setSent(true);
    showToast("Request sent", { variant: "info", durationMs: 3000 }); // Plan D's toast
    setTimeout(() => onSuccess?.(), 1500); // close the modal after 1.5s
  }
}

// In render, when sent:
{sent && (
  <div className="text-center py-6">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2" className="mx-auto mb-3">
      <polyline points="20 6 9 17 4 12" />
    </svg>
    <p className="text-sm font-medium">Request sent</p>
    <p className="text-xs text-muted mt-1">The venue will see this in their inbox.</p>
  </div>
)}
```

When `sent`, the entire form (action picker + sub-forms + submit button) is replaced by the success block.

- [ ] **Step 2: Idempotency at the row level**

If the form is opened a second time for the same wall and the artist has already submitted a request, the form should detect that and pre-set `sent=true` rather than creating a duplicate. Server-side: the `/api/placements` POST already deduplicates on `(artist_user_id, venue_user_id, wall_id, status='pending')` — verify by reading the existing logic. Client-side: pre-flight a quick GET to `/api/placements?artistVenueWall=...&pending=1` and if a row exists, render `sent=true` immediately.

If the existing API doesn't dedup, add a unique partial index in a quick migration:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS placements_pending_unique_pair
  ON placements (artist_user_id, venue_user_id, COALESCE(wall_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'pending';
```

- [ ] **Step 3: Smoke**

Submit a request for the first time → success block + auto-close. Re-open the form for the same wall → already in "sent" state. No duplicates created in the DB.

- [ ] **Step 4: Commit**

```bash
git add src/components/SpacesPlacementRequestForm.tsx \
        supabase/migrations/0XX_placements_pending_unique.sql # if added
git commit -m "feat(requests): optimistic 'request sent' state + dedup index"
```

---

## Phase 3 — QR labels

### Task 7: Venue QR label style picker

**Assessment:** Net new. The QR label generator currently has a "style" picker only on the artist side; venues have a stripped-down editor without it.

**Files:**
- Modify: `src/app/(pages)/venue-portal/labels/page.tsx`
- Possibly factor a shared component if duplication is heavy

- [ ] **Step 1: Read both pages**

```bash
diff <(cat "src/app/(pages)/artist-portal/labels/page.tsx") <(cat "src/app/(pages)/venue-portal/labels/page.tsx") | head -100
```

Identify the style-picker component / state on the artist side (likely a chip group or radio with options like "Minimal", "Bold", "Inline-text").

- [ ] **Step 2: Lift to a shared component**

If duplication makes sense to reduce, extract: `src/components/labels/LabelStylePicker.tsx`. Both pages import.

- [ ] **Step 3: Wire on the venue page**

```tsx
import LabelStylePicker from "@/components/labels/LabelStylePicker";

const [labelStyle, setLabelStyle] = useState<LabelStyle>("minimal");

// In the form:
<LabelStylePicker value={labelStyle} onChange={setLabelStyle} />
```

Pass `labelStyle` into whichever build / preview function generates the printable label.

- [ ] **Step 4: Smoke**

Sign in as a venue. Open `/venue-portal/labels`. Style picker is visible. Switching style updates the preview.

- [ ] **Step 5: Commit**

```bash
git add # both portal label pages, new shared component if added
git commit -m "feat(labels): venues can pick label style, parity with artist portal"
```

---

### Task 8: Fix venue QR label tick deselect + size visibility

**Assessment:** Net new. Two specific bugs in the venue label editor:
1. Once a per-label visibility tick is on, clicking it doesn't toggle it off.
2. Size column is hidden / unreadable.

**Files:**
- Modify: `src/app/(pages)/venue-portal/labels/page.tsx`

- [ ] **Step 1: Reproduce locally**

`npm run dev`. Open `/venue-portal/labels`. Tick a per-row visibility checkbox. Try to untick.

- [ ] **Step 2: Diagnose the toggle**

The most common cause: `onChange` handler does `setState({ [field]: true })` instead of toggling. Verify by reading the handler. Replace with the canonical:

```tsx
onChange={(e) =>
  setLabelOptions((prev) => ({ ...prev, [field]: !prev[field] }))
}
// Or, if the input is uncontrolled:
checked={labelOptions[field]}
onChange={() =>
  setLabelOptions((prev) => ({ ...prev, [field]: !prev[field] }))
}
```

- [ ] **Step 3: Diagnose the size column**

Confirm whether the size data is in the DB but hidden by CSS, or absent from the query:
- Open devtools, inspect a row — if `<td>` exists but is `display: none` or `width: 0`, it's CSS.
- If the cell is missing entirely from the DOM, it's a render-side conditional — flip it on.

Common fixes:
```tsx
// If hidden by a sm:hidden:
<td className="text-xs">{row.size_label}</td> // remove sm:hidden
// If missing entirely, add the column header + cell to the table.
```

- [ ] **Step 4: Smoke**

Tick + untick a visibility row repeatedly — toggles cleanly. Size column visible on every row across viewports.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(pages)/venue-portal/labels/page.tsx"
git commit -m "fix(labels): venue editor — visibility ticks toggle, size column visible"
```

---

## Phase 4 — Demo data + scroll polish

### Task 9: Reset Maya Chen demo prices

**Assessment:** Net new. **This is a data fix, not a code change.** Plan F Task 9 (`formatPounds` robustness) is the formatting layer; this is data quality on the demo account.

**Files:**
- Create: `supabase/migrations/0XX_fix_maya_chen_demo_prices.sql` (number per the next free slot)

- [ ] **Step 1: Audit current state**

```sql
-- Run via Supabase Studio
SELECT id, title, price, dimensions, edition_size
FROM works
WHERE artist_slug = 'maya-chen'
ORDER BY title;
```

Identify which prices are wrong (£0, NaN-input legacy, decimal-misplaced, etc.).

- [ ] **Step 2: Decide on the corrected price set**

Confer with the product owner — Maya Chen is a demo persona, so the prices should be plausible (£300–£3,000 typical for emerging-artist works at that size range). Settle on a corrected list before writing the migration.

- [ ] **Step 3: Migration**

```sql
-- 0XX_fix_maya_chen_demo_prices.sql
--
-- One-shot data fix: Maya Chen's demo work prices were set incorrectly
-- during the initial seed (some £0, some with displaced decimals).
-- Aligns the demo to a plausible emerging-artist range.

UPDATE works SET price = 450 WHERE artist_slug = 'maya-chen' AND title = 'Untitled (Series 1)';
UPDATE works SET price = 850 WHERE artist_slug = 'maya-chen' AND title = 'Coastline Study';
-- ... (one row per work; final list comes from Step 2)

-- Sanity check
SELECT title, price FROM works WHERE artist_slug = 'maya-chen';
```

- [ ] **Step 4: Apply locally + staging**

```bash
psql "$LOCAL_SUPABASE_DB_URL" -f supabase/migrations/0XX_fix_maya_chen_demo_prices.sql
```

Verify the artist profile + browse pages show plausible prices.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0XX_fix_maya_chen_demo_prices.sql
git commit -m "fix(demo): reset Maya Chen work prices to plausible range"
```

---

### Task 10: Filter sidebar scroll passthrough

**Assessment:** Net new. Plan E Task 10 dropped `sticky` below `lg`, which addresses the overlap, but the user's complaint here is about scroll behaviour at desktop sizes: scrolling inside the sidebar reaches its bottom and the page doesn't continue scrolling.

**Files:**
- Modify: `src/app/(pages)/browse/page.tsx`

- [ ] **Step 1: Inspect the sidebar wrapper**

```bash
grep -n "overflow-y\\|max-h-screen\\|sticky" "src/app/(pages)/browse/page.tsx" | head
```

The sidebar likely has `overflow-y-auto` + `max-h-[calc(100vh-...)]`. When the user's wheel hits the inner scroll bottom, the browser doesn't pass the event to the page — the user has to physically move the cursor onto the grid to keep scrolling.

- [ ] **Step 2: Use `overscroll-contain` instead of `overscroll-none`**

CSS: `overscroll-behavior: contain` keeps inner scrolls inside the sidebar BUT releases when the inner content fits without scrolling. The problem the user describes is the opposite — scroll should chain naturally to the page when the inner element has nothing more to consume.

The fix is to remove the artificial scroll container at desktop sizes:

```tsx
// Was:
<aside className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">

// Now:
<aside className="lg:sticky lg:top-24">
{/* Drop max-h + overflow-y: let the sidebar grow naturally and the
    page handle scrolling. Sticky still works — it just unsticks when
    the sidebar's bottom passes the viewport bottom, which is the
    expected behaviour for a long sidebar.*/}
```

If the sidebar can be VERY long (lots of filter options), reintroduce `lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto` BUT add `overscroll-y-auto` so scroll chains:

```tsx
<aside className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto overscroll-y-auto">
```

- [ ] **Step 3: Smoke**

Desktop browser. On `/browse`, scroll wheel inside the sidebar. When the inner content runs out, the wheel keeps scrolling the main page without re-targeting the cursor.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/browse/page.tsx"
git commit -m "fix(browse): filter sidebar scroll chains to the page"
```

---

## Phase 5 — Save UX on web

### Task 11: Hover-to-save on artwork cards (desktop)

**Assessment:** Net new. Plan F Task 7 wired toasts on `<SaveButton>`; this task is about exposing the save action without requiring a click into the artwork detail page.

**Files:**
- Modify: `src/components/ArtworkThumb.tsx` (the card component)
- Optionally: `src/components/CollectionCard.tsx`, `src/components/BrowseArtistCard.tsx`

- [ ] **Step 1: Add a hover-revealed `<SaveButton>` overlay**

```tsx
import SaveButton from "@/components/SaveButton";

// In ArtworkThumb's render, inside the relative-positioned card wrapper:
<div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
  <SaveButton
    itemId={work.id}
    itemType="work"
    aria-label={`Save ${work.title}`}
    className="bg-white/90 hover:bg-white rounded-full p-2 shadow"
  />
</div>
```

The wrapping card's outer element needs `group` and `relative`:

```tsx
<Link href={...} className="group relative block">
  {/* …existing thumbnail content… */}
  {/* save overlay above */}
</Link>
```

- [ ] **Step 2: Touch device behaviour**

`group-hover` doesn't fire on touch. Two options:
- **A**: keep the overlay visible permanently on touch via `md:opacity-0` (only hidden by default on `md+`).
- **B**: use a tap-to-reveal pattern (already used elsewhere per commit `9ff19f8`) — first tap reveals controls; second tap navigates.

Option A is simpler and consistent. Use it:

```tsx
<div className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity duration-200">
```

- [ ] **Step 3: Stop event propagation**

Clicking the heart on a card-wrapped-in-Link would otherwise navigate to the artwork. Prevent:

```tsx
<div onClick={(e) => e.preventDefault()} ...>
  <SaveButton ... />
</div>
```

- [ ] **Step 4: Smoke**

Desktop: hover an artwork card → heart fades in. Click the heart → toast "Saved" (Plan F dependency), card stays on the same page (no navigation). Tap the card body → navigates to detail.

Mobile: heart visible permanently. Tap heart → save. Tap card → navigate.

- [ ] **Step 5: Commit**

```bash
git add src/components/ArtworkThumb.tsx
git commit -m "feat(browse): hover-to-save heart on artwork cards (desktop)"
```

---

## Phase 6 — Curated + content

### Task 12: Wallplace Curated visual upgrade

**Assessment:** Net new but vague — "look more professional" needs design decisions.

**This task requires brainstorming.** Before writing code, the brief should land on:
- Hero treatment (full-bleed image vs split-screen vs minimal)
- Whether to add a real client logos / case studies row
- Pricing block treatment (table, cards, or in-line tier comparison)
- Real testimonial copy (if any)

**Files:**
- Modify: `src/app/(pages)/curated/page.tsx`
- Modify: `src/app/(pages)/curated/CuratedClient.tsx`
- Modify: `src/app/(pages)/curated/[tier]/page.tsx`

- [ ] **Step 1: Brainstorm before coding**

Spend 15 minutes (or a designer-led session) listing what "professional" means for Curated. Output: a one-page wireframe and a list of copy changes. Without this, the implementation will be a guess.

If brainstorming isn't done before this task is picked up, **STOP and report BLOCKED** — the implementer can't make these calls in isolation.

- [ ] **Step 2: Implement against the brief**

Once the brief lands, the implementation is straight Tailwind work. Pull from `/artists/page.tsx` and `/venues/page.tsx` (Plan D Task 17) as reference points for hero / value-block / pricing patterns.

Common moves:
- Replace generic Unsplash hero with brand asset (Task 13 ships those)
- Tier cards: equalise heights, surface "Most popular" on the middle tier
- Add a simple "How it works" 3-step strip
- Include 1–2 short testimonials with attribution
- Pricing transparency block (what's included / what's extra)

- [ ] **Step 3: Smoke**

Open `/curated` and `/curated/[tier]` in a fresh window. Read it as a venue who's never used the platform — does it explain the offering, the price, the next step, in under 30 seconds?

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/curated"
git commit -m "feat(curated): visual upgrade — hero, tier cards, testimonials"
```

---

### Task 13: Generative-AI hero / marketing imagery

**Assessment:** Net new. Currently the marketing pages lean on Unsplash photos (mountain landscape on auth + signup pages, etc.). User wants AI-generated imagery that fits the brand.

**This is asset prep, not just code.** The code change is small (swap the `<Image src=...>`); the work is producing the assets.

**Files:**
- Add: `public/marketing/*.{webp,png}`
- Modify: every page currently using a generic Unsplash hero

- [ ] **Step 1: Asset brief + generation**

Draft prompts for ChatGPT / Midjourney / DALL-E that fit the Wallplace brand:
- Calm, considered, slightly faded film-photography aesthetic
- Architectural interiors with art on the wall (for venue-side imagery)
- Hands working in a studio (for artist-side imagery)
- Warm neutral palette: cream, oat, accent terracotta

Generate 2–3 variants per page hero. Pick one. Export at 2× retina (`1920×1080` for full-bleed, `1200×800` for half-screens).

- [ ] **Step 2: Convert to webp**

```bash
for f in public/marketing/*.png; do
  cwebp -q 80 "$f" -o "${f%.png}.webp"
done
```

(Project doesn't currently ship Sharp on the client side; webp via the build pipeline is the right format.)

- [ ] **Step 3: Replace Unsplash references**

```bash
grep -rln "images.unsplash.com" src/
```

For each match, swap to a local `public/marketing/<asset>.webp`. Use `next/image`:

```tsx
import Image from "next/image";
import heroImg from "@/../public/marketing/auth-hero.webp"; // or string path

<Image src={heroImg} alt="..." fill className="object-cover" priority />
```

- [ ] **Step 4: Smoke**

Each marketing page uses the new asset. Lighthouse score on `/login` and `/signup` should not regress (webp is smaller than the JPEG Unsplash served).

- [ ] **Step 5: Commit**

```bash
git add public/marketing/ # (every page that swapped imports)
git commit -m "feat(marketing): replace Unsplash heroes with brand-aligned generated imagery"
```

---

## Phase 7 — Mobile wall visualizer

### Task 14: Mobile wall visualizer UX

**Assessment:** Net new. Plan E covered general mobile layout (z-index, tap targets, sidebar stacking) but didn't touch the Three.js wall visualizer. The visualizer currently works on desktop with mouse drag / scroll-wheel zoom; on touch it's broken or awkward.

**This is the largest single task in Plan G.** Consider splitting into a dedicated plan if scope grows during implementation.

**Files:**
- Modify: `src/components/WallVisualiser.tsx` (the entry point)
- Modify: `src/components/visualizer/*` (sub-components)

- [ ] **Step 1: Audit current touch support**

Open the visualizer on a mobile device. Note what fails:
- Pinch-to-zoom doesn't work / is wrong axis
- Drag-to-pan doesn't work
- Tap-to-place-work doesn't fire
- The visualizer scrolls the page instead of zooming

- [ ] **Step 2: Add `OrbitControls` touch config**

In whichever sub-component sets up the camera controls (`@react-three/drei`'s `OrbitControls`):

```tsx
import { OrbitControls } from "@react-three/drei";

<OrbitControls
  enablePan
  enableZoom
  enableRotate={false} // 2D wall — disable rotation
  touches={{
    ONE: 2,    // ONE finger = pan (THREE.TOUCH.PAN)
    TWO: 1,    // TWO fingers = dolly (THREE.TOUCH.DOLLY_PAN)
  }}
  zoomToCursor
  minZoom={0.5}
  maxZoom={3}
/>
```

(Verify the constants — the actual values come from `THREE.TOUCH.{PAN,DOLLY_PAN}`. Use the enum, not magic numbers.)

- [ ] **Step 3: Prevent the page from scrolling while inside the visualizer**

```tsx
<div className="touch-none" style={{ touchAction: "none" }}>
  <Canvas>...</Canvas>
</div>
```

`touch-action: none` blocks the browser's default pan-y scroll within the canvas, so the user's drag belongs to the visualizer.

- [ ] **Step 4: Tap-to-place flow**

If the desktop flow is "click empty wall → opens an 'add work' picker", port it to touch:
- Single tap on empty wall → picker opens
- Long-press on a placed work → context menu (delete / replace)

Implement via `<Canvas>`'s `onPointerDown` / `onPointerUp` with a 400ms threshold for long-press:

```tsx
const downAt = useRef(0);
function onPointerDown() {
  downAt.current = Date.now();
}
function onPointerUp(e: ThreeEvent<PointerEvent>) {
  const elapsed = Date.now() - downAt.current;
  if (elapsed < 400) handleTap(e);
  else handleLongPress(e);
}
```

- [ ] **Step 5: Mobile UI scaffolding**

The visualizer's controls (zoom, reset, undo, save) likely live in a side panel on desktop. On mobile, fold them into a bottom toolbar:

```tsx
{isMobile && (
  <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border p-3 flex justify-around items-center pb-[env(safe-area-inset-bottom)]">
    <button aria-label="Reset view" onClick={resetView}>...</button>
    <button aria-label="Undo" onClick={undo} disabled={!canUndo}>...</button>
    <button aria-label="Save" onClick={save} className="bg-accent text-white px-4 py-2 rounded-sm">Save</button>
  </div>
)}
```

`isMobile` from a `useMediaQuery("(max-width: 768px)")` hook. If no such hook exists, write one:

```tsx
// src/lib/use-media-query.ts
import { useEffect, useState } from "react";
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    setMatches(m.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, [query]);
  return matches;
}
```

- [ ] **Step 6: Smoke**

Real iOS device:
- Pinch zoom works
- One-finger drag pans
- Two-finger pinch zooms
- Single tap on empty wall opens the picker
- Long-press on a placed work opens the context menu
- Bottom toolbar visible above the home indicator
- Page doesn't scroll while inside the canvas

- [ ] **Step 7: Commit**

```bash
git add src/components/WallVisualiser.tsx src/components/visualizer/ \
        src/lib/use-media-query.ts
git commit -m "feat(visualizer): mobile touch UX — pinch zoom, tap-to-place, bottom toolbar"
```

---

## Phase 8 — Cross-side artist↔venue submission

### Task 15: Artist sends works directly to a venue's wall

**Assessment:** Net new. The current artist→venue placement-request flow exists but goes through `/spaces-looking-for-art` (find a wall, fill a form). The user wants a more direct path: from a venue's profile page, an artist can pick a wall and submit work for consideration in one step.

**Files:**
- Modify: `src/app/(pages)/venues/[slug]/page.tsx` — surface the action when viewer is an artist
- Maybe modify: `src/components/SpacesPlacementRequestForm.tsx` — support being launched from a venue profile, not just the spaces page
- Possibly create: `src/app/(pages)/venues/[slug]/walls/[wallId]/submit/page.tsx` — dedicated submit form

- [ ] **Step 1: Decide on entry point**

Two options:
- **A** (modal): On the venue profile, each wall has a "Submit your work" button → opens `<SpacesPlacementRequestForm>` in a modal pre-filled with the wall id.
- **B** (dedicated page): clicking the button takes the artist to `/venues/[slug]/walls/[wallId]/submit`, which renders the form full-page.

Modal (A) is faster to ship and keeps the artist on the venue's profile. Dedicated page (B) gives more room for the form. Pick A for MVP.

- [ ] **Step 2: Show the button only for artist viewers**

```tsx
const { user, userType } = useAuth();
const isArtist = userType === "artist";

// In each wall row:
{isArtist && (
  <button
    onClick={() => setSubmittingWall(wall)}
    className="text-xs px-3 py-1.5 bg-accent text-white rounded-sm hover:bg-accent-hover"
  >
    Submit your work
  </button>
)}
```

For non-artists / logged-out viewers, show a different CTA (or nothing) — e.g. "Sign in as an artist to submit" linking to `/login?next=/venues/[slug]`.

- [ ] **Step 3: Render the form in a modal**

```tsx
{submittingWall && (
  <div className="fixed inset-0 z-modal bg-black/50 flex items-center justify-center p-4" onClick={() => setSubmittingWall(null)}>
    <div className="bg-background rounded-sm max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
      <SpacesPlacementRequestForm
        wallId={submittingWall.id}
        venueSlug={venue.slug}
        venueName={venue.name}
        onSuccess={() => { setSubmittingWall(null); showToast("Sent to venue", { variant: "info" }); }}
        onCancel={() => setSubmittingWall(null)}
      />
    </div>
  </div>
)}
```

If the form component doesn't currently accept `wallId` / `venueSlug` as props, widen its API to do so. The form likely reads these from the URL on `/spaces-looking-for-art` — add a fallback path that prefers props.

- [ ] **Step 4: Cap enforcement**

The plan note in QA report flagged that venues mustn't bypass message/request caps. The same applies here: an artist shouldn't be able to spam every wall. Reuse Plan A's rate-limit pattern:

```tsx
// On submit, the API endpoint that creates the placement request already
// enforces a per-artist-per-day cap (e.g. 5/day across all venues). Trust
// the server — UI just shows the error message if rate-limited.
```

If the existing endpoint doesn't enforce a cap, file a follow-up chip (don't bolt it into Plan G).

- [ ] **Step 5: Smoke**

Sign in as Maya Chen. Visit `/venues/copper-kettle`. Each wall row has "Submit your work". Click → modal opens with the wall pre-selected. Pick a work, send. Switch to the venue account → the request appears in `/venue-portal/placements`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(pages)/venues/[slug]/page.tsx" \
        src/components/SpacesPlacementRequestForm.tsx
git commit -m "feat(placements): artists submit work to a venue's wall from the venue's profile"
```

---

## Phase 9 — Spawned chips for structural redesigns

### Task 16: Spawn task chip for design-led work

Originally Plan G chipped two design-led follow-ups; the artwork-requests one is now folded directly into Tasks 6a–6e, so only the Curated brief remains as a chip.

- [ ] **Step 1: "Curated visual brief" pre-Task-12**

Title: `Wallplace Curated brief — hero / pricing / testimonials`

Summary: Plan G Task 12 ("Curated visual upgrade") explicitly blocks on a brief landing first. Spawn a task to produce that brief: 1-page wireframe, copy decisions, hero treatment direction.

- [ ] **Step 2: Use the spawn-task chip mechanism**

(In a Claude Code session, this is the `mcp__ccd_session__spawn_task` chip. Outside that context, file the same as a GitHub issue.)

This task itself produces no code change; just records the spawned chip so future executors don't re-do this scoping.

```bash
git commit --allow-empty -m "chore(plans): spawned chip for Curated visual brief (Plan G §16)"
```

---

## Phase 10 — Final verification

### Task 17: Full check + smoke + open PR

- [ ] **Step 1: `npm run check`** — clean.

- [ ] **Step 2: `npm run build`** — clean.

- [ ] **Step 3: 19-point smoke**

Demo accounts: Maya Chen (artist), Copper Kettle (venue), a customer.

1. Accept a counter offer leading to checkout — Back button lands on the placement detail, never 404.
2. Sign in as Maya Chen. Open the portal dropdown — every page in the sidebar appears in the dropdown.
3. As Maya Chen, view incoming artwork requests — venue NAME shown, not UUID.
4. As Copper Kettle, view incoming artist offers — artist NAME + image thumbnails.
5. Counter button visible on artwork-request rows for the side that didn't last respond.
6. Accept a paid_loan offer → it appears in `/artist-portal/placements` and `/venue-portal/placements`.
7. Visit `/artwork-requests` (signed out) — public list of open venue requests, each with venue name.
8. Visit `/spaces-looking-for-art?view=requests` — same list inline as the "Open requests" tab.
9. View Copper Kettle's public profile — open requests section appears below walls.
10. Sign in as a fresh artist with no engagement history — `/artist-portal/placements` is empty. Submit a request via the new four-action form. Refresh — the request now appears.
11. Open the submission form: action picker shows "Request a placement / Quote a price / Suggest a commission / Just a message". The "select existing works" entry is gone from the top level.
12. Select "Request a placement" — paid loan / monthly fee / QR / rev share / work picker all visible.
13. Submit — form swaps to "Request sent" success block + auto-closes after 1.5s with a toast.
14. Re-open the form for the same wall — already in the "sent" state; no duplicate row created in DB.
15. Sign in as Copper Kettle, open `/venue-portal/labels` — style picker is visible, parity with the artist version.
16. Toggle a per-row visibility tick on the venue label editor — turns off cleanly. Size column visible.
17. View Maya Chen on `/browse/maya-chen` — every work has a plausible price, no `£0` or `£NaN`.
18. On `/browse`, scroll within the filter sidebar — when it hits its bottom, the page continues scrolling.
19. Hover an artwork card on desktop — heart fades in. Click it — toast "Saved", no navigation.

Plus the design-led checks (only if the prerequisites have landed):
- `/curated` looks like a marketing page (per the brief).
- `/login` and `/signup/artist` heroes show the new generated imagery, not Unsplash.
- iOS Safari: open a wall in `/venue-portal/walls/[id]` — pinch zoom works, drag pans, tap-to-place opens the picker, bottom toolbar visible.

- [ ] **Step 4: Open PR**

```bash
git push -u origin claude/qa-g-targeted
gh pr create --title "Plan G: targeted fixes & features" --body "$(cat <<'EOF'
## Summary

Closes a fresh batch of bugs, UX gaps, and small features surfaced after Plans A–F.

- Checkout back-button after offer accept lands on the placement (was 404)
- Header portal dropdown synced with sidebar pages
- Artwork requests show venue / artist NAME (not UUID)
- Outgoing offers show selected work thumbnails
- Counter button on artwork-request rows
- Loan acceptances surface in placements lists
- Public /artwork-requests page + "Open requests" tab on /spaces-looking-for-art
- Venue profile surfaces their open requests
- Artist portal /placements only shows engaged-with rows (discovery moves to public surfaces)
- Submission form: four action types (placement / quote / commission / message); "select existing works" no longer top-level
- "Request sent" optimistic feedback + dedup index
- Venue QR label style picker (parity with artist)
- Venue label toggles deselect; size column visible
- Maya Chen demo prices fixed
- Filter sidebar scroll chains to the page
- Hover-to-save heart on artwork cards
- Wallplace Curated visual upgrade
- AI-generated marketing imagery replaces Unsplash heroes
- Mobile wall visualizer touch UX (pinch / pan / tap-to-place / bottom toolbar)
- Artists submit work to a venue's wall from the venue's profile

## Test plan

- [ ] `npm run check` clean
- [ ] `npm run build` clean
- [ ] 14-point smoke in plan §17 passes
- [ ] Real iOS device verification for Task 14

## Spawned follow-ups (out of scope)

- Curated visual brief — hero / pricing / testimonials direction
EOF
)"
```

---

## Self-review

**Assessment table — every item from the user's list:**

| # | Item | Already in plan? | Plan G task |
|---|---|---|---|
| 1 | Checkout-back after offer-accept 404s | No | Task 1 |
| 2 | Venue of artwork request shown as id | No | Task 3 (display fix) — structural piece folded into Tasks 6a–6c |
| 3 | Offer from artist: no images, artist id, no counter | No | Tasks 4 (display) + 5 (counter) |
| 4 | Loan acceptance creates placement row | No | Task 6 |
| 5 | QR label style picker only on artist side | No | Task 7 |
| 6 | Venue label toggles won't deselect, sizes hidden | No | Task 8 |
| 7 | Portal dropdowns out of sync with new pages | No | Task 2 |
| 8 | Maya Chen demo prices broken | No | Task 9 (data only) |
| 9 | Filter sidebar requires double-scroll at bottom | Plan E Task 10 dropped sticky on mobile but this is desktop scroll-chaining — different bug | Task 10 |
| 10 | Save works as favourites on hover (web) | No | Task 11 |
| 11 | Wallplace Curated needs to look professional | No (vague — needs brief) | Task 12 (with brief gate) + Task 16 chip |
| 12 | Use AI imagery instead of Unsplash | No | Task 13 |
| 13 | Mobile wall viz UX | Plan E covered general mobile but not visualizer | Task 14 |
| 14 | Send venue artists' works to walls | No | Task 15 |
| 15 | Venue-posted artwork requests linked to spaces page + own page | No | Task 6a |
| 16 | Engaged-only filter on artist portal | No | Task 6c |
| 17 | "Request sent" optimistic feedback to sender | No | Task 6e |
| 18 | Agreed placement / loan goes to My Placements | Same as #4 (auditable in Task 6) | Task 6 |
| 19 | "Request a placement" surfaces loan/fee/QR/rev-share + work picker | No | Task 6d |
| 20 | Form four-action restructure (drop "select existing works") | No | Task 6d |
| 21 | Venue making request shows name not id | Same as #2 | Task 3 (and surface contexts in Tasks 6a / 6b) |

All 21 net new for Plan G. One (item 11 / Curated) remains gated on a design brief via Task 16.

**Spec coverage:** every input has a destination — either a Plan G task or a spawned chip. Nothing dropped.

**Placeholder scan:** Task 6 (loan→placements) and Task 12 (Curated) both contain conditional "verify first / brainstorm first" branches — those are not placeholders, they're scoped audit steps with concrete next actions.

**Type / name consistency:**
- `safeRedirect` (Task 1) — same signature Plan A introduced ✓
- `<SaveButton>` (Task 11) — assumes the toast-emitting version from Plan F Task 7 ✓
- `<ImageWithFallback>` (Task 4) — assumes Plan F Task 2 ✓
- `useMediaQuery` (Task 14) — new hook introduced + used within the same task ✓
- `useToast` / `showToast` (Task 15) — assumes Plan D Task 3 ✓

**Independence + dependencies:**
- Soft deps on Plan F (Tasks 4, 11) — graceful fallback if Plan F isn't merged.
- Soft dep on Plan D's `<EmptyState>` and ToastContext (Task 15).
- Soft dep on Plan A's `safeRedirect` (Task 1) — if Plan A weren't already merged, would need to inline; but Plan A is on main.
- Touches Header.tsx (Task 2) and `SpacesPlacementRequestForm.tsx` (Task 15); both are touched by Plan D — sequential merge clean, no real conflict.

**Risk notes:**
- Task 14 (mobile visualizer) is the largest and trickiest single task. If it grows past ~300 lines of changes during implementation, split into a dedicated plan and ship Plan G without it.
- Task 13 (AI imagery) requires asset generation by a human in the loop. The implementer can't produce final imagery alone.
- Task 12 (Curated) blocks on Task 16's spawned brief. Don't pick up Task 12 until the brief lands; report BLOCKED.
- Task 9 (Maya Chen prices) requires confirmation from the product owner on the corrected price set. The migration is otherwise mechanical.

Plan looks complete. Ready to execute.

---

## Execution

Two paths:

**1. Subagent-driven** — Use `superpowers:subagent-driven-development`. Same loop Plans A / D / E / F used.

**2. Inline** — Use `superpowers:executing-plans`.

No new env vars. One small data migration (Task 9). Image assets needed for Task 13.
