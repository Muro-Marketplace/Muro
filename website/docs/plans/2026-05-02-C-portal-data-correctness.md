# Plan C — Portal Data Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every concrete "feature exists but is wrong / broken" bug in the three portals (customer / artist / venue) surfaced in the 2026-04-30 pre-launch QA report — the §2.1–§2.12 bucket. Each fix is small individually; together they're what stops a tester from saying "this feels half-finished" on every other page.

**Architecture:** No new architecture. Plan C is surgical — most tasks are 1–10 line code changes targeting specific file:line refs. The bigger pieces are: an account-deletion API + UI (§2.2), persistent notification preferences across the three portal settings pages (§2.3), and a clean separation between "free_loan" (paid loan with monthly fee) and "paid_loan" (the misnamed legacy value) in the counter-offer dialog (§2.5).

**Tech Stack:** Next.js 16.2, React 19.2, Supabase JS 2.103, Vitest 2.1. Tests colocated `*.test.ts(x)` siblings. Path alias `@/` → `src/`.

**Independence from Plans A and B:** Plan C touches portal pages and a few API routes; it does NOT collide with Plan A (auth/security) or Plan B (checkout/payments). Mergeable in any order. The closest overlap is §2.5 (counter-offer dialog) which sits next to Plan A's `lib/auth-roles.ts` consumers but doesn't share files.

**Out of scope (covered in other plans):**
- Auth gates, login redirect, signup verification (Plan A)
- Country dropdown, cart_sessions, refund tokens (Plan B)
- Navigation, breadcrumbs, search bar, empty-state polish (Plan D)
- Mobile / responsive / focus styles (Plan E)
- Toast UX, image fallbacks, currency edge cases (Plan F)

**Branch strategy:**
- One worktree: `git worktree add .claude/worktrees/qa-c-portal-correctness claude/qa-c-portal-correctness` (off `main`).
- One commit per task; push and open a draft PR after Phase 2 (so quick wins land early).
- `npm run check` MUST pass before each commit.

**Verification gate between phases:** After each phase, `npm run check` and a manual smoke against the demo accounts.

**Phases:**
1. Quick surgical fixes (Tasks 1–6) — six low-risk one-file changes
2. Filter / state fixes (Tasks 7–8) — collection size filter + browse location filter
3. Mobile tab switching (Task 9) — verify-first; skip if not reproducible
4. Account deletion (Tasks 10–11) — API + UI
5. Notification preferences persistence (Tasks 12–13)
6. Counter-offer arrangement type (Tasks 14–16)
7. Final verification + PR (Task 17)

---

## Phase 1 — Quick surgical fixes

### Task 1 (§2.1): Customer portal messages — `portalType="customer"` not `"venue"`

**Files:**
- Modify: `src/app/(pages)/customer-portal/messages/page.tsx`

- [ ] **Step 1: Read the file**

The QA report flagged line 14: `<MessageInbox portalType="venue" ...>`. Confirm.

```bash
grep -n "portalType" "src/app/(pages)/customer-portal/messages/page.tsx"
```

- [ ] **Step 2: Modify**

Change `portalType="venue"` to `portalType="customer"` on whatever line it appears.

- [ ] **Step 3: Verify the prop type accepts "customer"**

Read `src/components/MessageInbox.tsx` to confirm the `portalType` union includes `"customer"`. If it only accepts `"venue" | "artist"`, widen it to `"venue" | "artist" | "customer"` and update any switch / branch on `portalType` inside MessageInbox so the customer case is handled correctly (most likely identical to one of the existing branches).

- [ ] **Step 4: Smoke**

Sign in as a customer (or use the customer demo account). Navigate to `/customer-portal/messages`. Confirm:
- Page renders
- The inbox header reads "Messages" not "Venue messages"
- No console error about an unexpected `portalType` value

- [ ] **Step 5: Commit**

```bash
git add "src/app/(pages)/customer-portal/messages/page.tsx" \
        src/components/MessageInbox.tsx  # if widened
git commit -m "fix(customer-portal): MessageInbox uses portalType=customer not venue"
```

---

### Task 2 (§2.4): Wall delete success condition is inverted

**Files:**
- Modify: `src/app/(pages)/venue-portal/walls/[id]/page.tsx`

- [ ] **Step 1: Find the delete handler**

Run: `grep -n "fetch.*walls.*method.*DELETE\|res.status\|204" "src/app/(pages)/venue-portal/walls/[id]/page.tsx" | head -20`

The QA report pointed at line 181 — a check that's shaped like `if (res.status !== 204)` but ends up alerting on success. Confirm by reading the surrounding ~15 lines.

- [ ] **Step 2: Make the success condition explicit**

Replace whatever pattern is there with the canonical Next.js / fetch idiom:

```typescript
const res = await fetch(`/api/walls/${id}`, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${session.access_token}` },
});
if (!res.ok) {
  const data = await res.json().catch(() => ({}));
  alert(data.error || `Could not delete (status ${res.status}).`);
  return;
}
// Success: navigate back to walls list
router.push("/venue-portal/walls");
```

(Adapt to whatever existing variables are in scope.)

- [ ] **Step 3: Add a smoke test note in the commit body**

Manually verify by deleting a test wall in the venue portal — should redirect to the walls list, not show an alert.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/venue-portal/walls/[id]/page.tsx"
git commit -m "fix(venue-portal): wall delete uses res.ok for success, not status===204"
```

---

### Task 3 (§2.9): Wire real QR scan count into venue dashboard

**Files:**
- Modify: `src/app/(pages)/venue-portal/page.tsx`
- Verify: `src/app/api/dashboard/route.ts` (or `/api/analytics/venue`) returns `qr_scans`

- [ ] **Step 1: Find the hardcoded `0`**

Run: `grep -nB1 -A2 "QR Scans\|qr_scans" "src/app/(pages)/venue-portal/page.tsx"`

The QA report flagged "QR Scans stat hardcoded to '0'" around line 120. Confirm by reading that block.

- [ ] **Step 2: Check if the API already returns the value**

Run: `grep -n "qr_scans\|qrScans" src/app/api/dashboard/route.ts src/app/api/analytics/venue/route.ts 2>/dev/null`

If `qr_scans` is already in one of those payloads, just read it on the page (one-liner). If not, add it server-side.

- [ ] **Step 3a: API doesn't return it yet — add to `/api/analytics/venue`**

Open `src/app/api/analytics/venue/route.ts`. Already does scan tracking (see commit `fd76dae`). Extend the response payload with a count from `analytics_events`:

```typescript
const { count: qrScans } = await db
  .from("analytics_events")
  .select("*", { count: "exact", head: true })
  .eq("event_type", "qr_scan")
  .eq("venue_user_id", auth.user!.id);

return NextResponse.json({
  // ...existing fields
  qrScans: qrScans ?? 0,
});
```

- [ ] **Step 3b: Page reads it**

In `src/app/(pages)/venue-portal/page.tsx`, fetch from `/api/analytics/venue` (if not already), and render `qrScans` instead of `0`:

```typescript
const [stats, setStats] = useState({ qrScans: 0, /* ... */ });
useEffect(() => {
  if (!user) return;
  authFetch("/api/analytics/venue").then((r) => r.json()).then(setStats);
}, [user]);

// In render:
<StatCard label="QR Scans" value={stats.qrScans} />
```

- [ ] **Step 4: Smoke**

Trigger a few QR scans against a test venue (hit `/api/analytics/track` with `event_type=qr_scan, venue_user_id=...`). Reload the dashboard. Number should match.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(pages)/venue-portal/page.tsx" src/app/api/analytics/venue/route.ts
git commit -m "fix(venue-portal): QR scan count wired from analytics, not hardcoded 0"
```

---

### Task 4 (§2.10): Saved Collections link dead-ends

**Files:**
- Modify: `src/app/(pages)/customer-portal/saved/page.tsx`
- Modify: `src/app/(pages)/artist-portal/saved/page.tsx`
- Modify: `src/app/(pages)/venue-portal/saved/page.tsx` (same pattern)

- [ ] **Step 1: Find `linkForItem` (or equivalent)**

Run: `grep -nB1 -A6 "linkForItem\|browse?view=collections" "src/app/(pages)/customer-portal/saved/page.tsx" "src/app/(pages)/artist-portal/saved/page.tsx" "src/app/(pages)/venue-portal/saved/page.tsx"`

Each portal has a similar `linkForItem(itemType, itemId)` (or inline link construction) that returns `/browse?view=collections` for the collection case — generic, ignores `itemId`. The actual collection-detail route is `/browse/collections/[collectionId]`.

- [ ] **Step 2: Modify each**

Replace the collection branch:

```typescript
// Before:
if (item.item_type === "collection") return "/browse?view=collections";

// After:
if (item.item_type === "collection") return `/browse/collections/${encodeURIComponent(item.item_id)}`;
```

(Adapt to the actual function shape in each file. The pattern may be a switch / map / inline condition.)

- [ ] **Step 3: Smoke**

Save a collection (any portal). Open the Saved tab → Collections sub-tab. Click the saved collection card. Should land on the specific collection detail page, not a generic listing.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/customer-portal/saved/page.tsx" \
        "src/app/(pages)/artist-portal/saved/page.tsx" \
        "src/app/(pages)/venue-portal/saved/page.tsx"
git commit -m "fix(saved): collection cards link to /browse/collections/[id]"
```

---

### Task 5 (§2.11): Replace fake venue names in artist analytics premium tease

**Files:**
- Modify: `src/app/(pages)/artist-portal/analytics/page.tsx`

- [ ] **Step 1: Find the block**

QA report flagged hardcoded venue names ("The Coffee House", "Bloom Hotel", "Studio Works") around lines 310–327.

```bash
grep -nB2 -A6 "Coffee House\|Bloom Hotel\|Studio Works" "src/app/(pages)/artist-portal/analytics/page.tsx"
```

- [ ] **Step 2: Replace with empty-state-or-real-data**

Two options, pick the one matching the page's existing tier-check pattern:

**Option A — empty state for non-premium:**

```tsx
{userTier === "premium" ? (
  <RealVenueList venues={analyticsData.venuesViewedYou ?? []} />
) : (
  <div className="bg-surface rounded-sm p-6 text-center">
    <p className="text-sm text-muted">
      Upgrade to Premium to see which venues have viewed your work.
    </p>
    <Link href="/artist-portal/billing" className="text-accent text-sm mt-3 inline-block">
      Compare plans
    </Link>
  </div>
)}
```

**Option B — blurred real preview:**

If the page already has a "blurred real data" pattern, fetch real first 3 venues, blur them, link to upgrade. Don't fabricate.

Pick Option A unless the team has explicitly requested the blurred-tease pattern.

- [ ] **Step 3: Smoke**

Sign in as Maya Chen (artist demo). Navigate to `/artist-portal/analytics`. The "Venues That Viewed You" section should NOT show "The Coffee House" etc. — either it's the empty-state pitch, or it's real data behind a blur.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/artist-portal/analytics/page.tsx"
git commit -m "fix(artist-analytics): drop hardcoded fake venues from premium tease"
```

---

### Task 6 (§2.12): Add confirmation modal to collection delete

**Files:**
- Modify: `src/app/(pages)/artist-portal/collections/page.tsx`

- [ ] **Step 1: Find the delete handler**

Run: `grep -nB1 -A4 "handleDelete\|onDelete\|delete.*collection" "src/app/(pages)/artist-portal/collections/page.tsx" | head -20`

QA flagged it around lines 150–169. The delete is optimistic — happens on a single click with no confirmation.

- [ ] **Step 2: Add a confirmation step**

Use `window.confirm` (cheap and works) or a proper modal pattern. Recommend `confirm` for now to keep diff small; Plan F can replace with a polished modal later:

```tsx
async function handleDelete(collectionId: string) {
  const collection = collections.find((c) => c.id === collectionId);
  const ok = window.confirm(
    `Delete collection "${collection?.title || collectionId}"? Works in it stay in your portfolio.`,
  );
  if (!ok) return;

  // ... existing optimistic delete logic
}
```

- [ ] **Step 3: Smoke**

Create a test collection. Click the delete icon. Confirm dialog appears. Cancel — collection stays. Click delete again, confirm — collection removed.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/artist-portal/collections/page.tsx"
git commit -m "fix(artist-portal): confirm before deleting a collection"
```

---

## Phase 2 — Filter / state fixes

### Task 7 (§2.7): Wire size filter into collection page works grid

**Files:**
- Modify: `src/app/(pages)/browse/collections/[collectionId]/page.tsx`

- [ ] **Step 1: Find the SIZE_BANDS chips and the works grid**

Run: `grep -nB1 -A4 "SIZE_BANDS\|selectedSize" "src/app/(pages)/browse/collections/[collectionId]/page.tsx"`

QA flagged: chips render but works grid doesn't filter (lines 179–208 for chips, somewhere later for grid).

- [ ] **Step 2: Add `selectedSize` state**

Near the top of the component:

```tsx
const [selectedSize, setSelectedSize] = useState<string | null>(null);
```

- [ ] **Step 3: Wire chips to update state**

Each `SIZE_BANDS` chip becomes:

```tsx
<button
  key={band.label}
  onClick={() => setSelectedSize(selectedSize === band.label ? null : band.label)}
  className={`... ${selectedSize === band.label ? "bg-foreground text-background" : ""}`}
>
  {band.label}
</button>
```

(Re-clicking the active chip clears the filter. Match whatever toggle convention the page uses elsewhere.)

- [ ] **Step 4: Filter works in render**

Find `works.map(...)` (or wherever the works grid is rendered). Replace with:

```tsx
const filteredWorks = useMemo(() => {
  if (!selectedSize) return works;
  // SIZE_BANDS is a constant defined elsewhere — use the same matching
  // logic the browse page uses (lib/format-size-label.ts probably exposes
  // a sizeBandFor(work) helper).
  return works.filter((w) => sizeBandLabel(w) === selectedSize);
}, [works, selectedSize]);

// In render:
{filteredWorks.map(...)}
```

If `sizeBandLabel` isn't already exported from a lib, look at `src/components/browse/SizeBands.ts` (or wherever the browse page does this). Reuse — don't duplicate.

- [ ] **Step 5: Empty state when filter excludes everything**

```tsx
{filteredWorks.length === 0 ? (
  <p className="text-sm text-muted text-center py-12">
    No works in this collection match the {selectedSize} size.
  </p>
) : (
  /* existing grid */
)}
```

- [ ] **Step 6: Smoke**

Open a collection with works of varying sizes. Click "Small" — only small works show. Click "Small" again — all works back.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(pages)/browse/collections/[collectionId]/page.tsx"
git commit -m "fix(collections): size filter chips actually filter the works grid"
```

---

### Task 8 (§2.8): Browse location filter persists across view switches

**Files:**
- Modify: `src/app/(pages)/browse/page.tsx`

- [ ] **Step 1: Understand the current state**

QA report: "User sets location filter to 'Within 10km'; switches from Galleries to Collections view; filter resets to default. activeDiscipline persists but location filters reset."

The view (`?view=galleries|portfolios|collections`) lives in URL params — that's why discipline persists. Location filter lives in component state — that's why it resets.

- [ ] **Step 2: Move location filter to URL params**

Find where the location filter state is declared (probably `useState({ mode, postcode, maxDistance })`). Replace with URL-param-driven state:

```tsx
const sp = useSearchParams();
const router = useRouter();

const locationFilter = useMemo(
  () => ({
    mode: (sp.get("loc_mode") as "anywhere" | "postcode" | "geo") ?? "anywhere",
    postcode: sp.get("postcode") ?? "",
    maxDistance: Number.parseInt(sp.get("maxDistance") ?? "25000", 10),
  }),
  [sp],
);

const setLocationFilter = useCallback(
  (next: typeof locationFilter) => {
    const params = new URLSearchParams(sp.toString());
    if (next.mode === "anywhere") {
      params.delete("loc_mode");
      params.delete("postcode");
      params.delete("maxDistance");
    } else {
      params.set("loc_mode", next.mode);
      if (next.postcode) params.set("postcode", next.postcode);
      params.set("maxDistance", String(next.maxDistance));
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  },
  [sp, router],
);
```

(Read the existing location filter shape first; field names may differ.)

- [ ] **Step 3: Smoke**

On `/browse?view=galleries`, set location to "Within 10km" of a postcode. Switch tab to Collections. Confirm the location filter persists in the URL AND in the UI. Browser back / forward also works.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/browse/page.tsx"
git commit -m "fix(browse): location filter lives in URL params, survives view switch"
```

---

## Phase 3 — Mobile tab switching (verify-first)

### Task 9 (§2.6): Verify whether mobile tab switching is actually broken; fix if so

**Files:**
- Modify: `src/app/(pages)/browse/page.tsx` (only if reproduced)

QA report claimed "VIEW_OPTIONS tabs (Galleries, Portfolios, Collections) don't respond to taps on <1024px viewport". The agent didn't verify on a real device. Before writing code, reproduce.

- [ ] **Step 1: Reproduce in a real browser**

Run `npm run dev`. Open Chrome DevTools → device toolbar → choose iPhone 14. Navigate to `/browse`. Tap the "Portfolios" tab. Does the URL update? Does the grid re-render?

If both happen — the QA finding was wrong. **STOP, mark this task done with no code change**, and add a note to the commit body:

```bash
git commit --allow-empty -m "chore(browse): verified mobile tab switching works; QA finding §2.6 closed without code change"
```

- [ ] **Step 2: If broken, find the bug**

Common causes:
- `<button>` with no explicit `type="button"` inside a form context
- Touch event handler that swallows the click
- Conditional rendering that races with the URL update

Read the tab buttons (around line 600–700 of browse/page.tsx) and identify the issue. Common fix: ensure the button is a `<Link href={...}>` not a `<button onClick>`, so the URL update is the user's tap and React doesn't lag.

- [ ] **Step 3: If broken, write a fix**

Whatever shape it takes, ensure: (a) the tap target is at least 44px square, (b) the URL updates synchronously on tap, (c) the grid keys off the URL param via `useSearchParams`.

- [ ] **Step 4: Smoke**

Re-test on the simulated mobile viewport. Tap each tab. URL updates and grid swaps every time.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(pages)/browse/page.tsx"
git commit -m "fix(browse): mobile tab switching now responds to taps reliably"
```

---

## Phase 4 — Account deletion

### Task 10 (§2.2 part 1): Create `/api/account/delete` endpoint

**Files:**
- Create: `src/app/api/account/delete/route.ts`
- Test:   `src/app/api/account/delete/route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/account/delete/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockDeleteUser = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser: mockGetUser, admin: { deleteUser: mockDeleteUser } },
    from: fromMock,
  }),
}));

import { POST } from "./route";

beforeEach(() => {
  mockGetUser.mockReset();
  mockDeleteUser.mockReset();
  fromMock.mockReset();
});

function req(token = "Bearer x", body: unknown = { confirm: "DELETE MY ACCOUNT" }): Request {
  return new Request("http://localhost/api/account/delete", {
    method: "POST",
    headers: { authorization: token, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/delete", () => {
  it("requires authentication", async () => {
    const res = await POST(req(""));
    expect(res.status).toBe(401);
  });

  it("requires explicit confirmation string", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@x.com" } }, error: null });
    const res = await POST(req("Bearer valid", { confirm: "no" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/confirm/i);
  });

  it("deletes related rows and the auth user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@x.com" } }, error: null });
    const deleteFromTable = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
    fromMock.mockReturnValue({ delete: deleteFromTable });
    mockDeleteUser.mockResolvedValue({ data: null, error: null });

    const res = await POST(req("Bearer valid"));
    expect(res.status).toBe(200);
    expect(mockDeleteUser).toHaveBeenCalledWith("u1");
    // At least artist_profiles and venue_profiles should have been hit
    expect(deleteFromTable).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npx vitest run src/app/api/account/delete/route.test.ts`. Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/app/api/account/delete/route.ts
//
// GDPR right-to-erasure. Hard-deletes the authenticated user's
// auth row + every profile / artefact owned by them. Idempotent at
// row level (DELETE WHERE matches nothing returns success).
//
// The confirmation string requirement is a soft seatbelt against
// XSS / replay — a CSRF-style fluke can't accidentally delete an
// account because the body has to literally read "DELETE MY ACCOUNT".

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const CONFIRM_STRING = "DELETE MY ACCOUNT";

// Tables to wipe rows from, keyed by the user_id (or equivalent) column.
// Order matters: child tables before parents so foreign-key cascades
// don't fight us.
const TABLES_USER_ID: Array<{ table: string; col: string }> = [
  { table: "saved_items", col: "user_id" },
  { table: "messages", col: "sender_id" },
  { table: "messages", col: "recipient_id" },
  { table: "notifications", col: "user_id" },
  { table: "placements", col: "requester_user_id" },
  { table: "placements", col: "artist_user_id" },
  { table: "placements", col: "venue_user_id" },
  { table: "orders", col: "buyer_user_id" },
  { table: "orders", col: "artist_user_id" },
  { table: "refund_requests", col: "requester_user_id" },
  { table: "artist_profiles", col: "user_id" },
  { table: "venue_profiles", col: "user_id" },
  { table: "customer_profiles", col: "user_id" },
];

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  let body: { confirm?: string } = {};
  try {
    body = await request.json();
  } catch { /* fall through to validation below */ }

  if (body.confirm !== CONFIRM_STRING) {
    return NextResponse.json(
      { error: `To confirm, the body must contain { "confirm": "${CONFIRM_STRING}" }.` },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const userId = auth.user!.id;

  // Best-effort row deletes. Errors are logged but don't abort —
  // the auth.users delete at the end is what matters legally.
  for (const { table, col } of TABLES_USER_ID) {
    const { error } = await db.from(table).delete().eq(col, userId);
    if (error) console.error(`[account/delete] ${table}.${col} cleanup failed:`, error.message);
  }

  const { error: deleteErr } = await db.auth.admin.deleteUser(userId);
  if (deleteErr) {
    console.error("[account/delete] auth.deleteUser failed:", deleteErr);
    return NextResponse.json(
      { error: "Could not complete account deletion. Contact support." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests, typecheck**

Run: `npx vitest run src/app/api/account/delete/route.test.ts && npm run typecheck`. Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/account/delete/route.ts src/app/api/account/delete/route.test.ts
git commit -m "feat(account): add /api/account/delete endpoint with confirmation seatbelt"
```

---

### Task 11 (§2.2 part 2): Wire delete UI into customer / artist / venue settings

**Files:**
- Modify: `src/app/(pages)/customer-portal/settings/page.tsx`
- Modify: `src/app/(pages)/artist-portal/settings/page.tsx`
- Modify: `src/app/(pages)/venue-portal/settings/page.tsx`

- [ ] **Step 1: Find the existing "Delete account" UI in each**

QA flagged customer settings has a `mailto:` link. The other two portals may have similar or no UI.

- [ ] **Step 2: Replace mailto with an in-app delete flow**

Add a danger-zone section at the bottom of each settings page (same pattern in all three). Sample:

```tsx
function DangerZone() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (confirmText !== "DELETE MY ACCOUNT") {
      setError("Type DELETE MY ACCOUNT to confirm.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch("/api/account/delete", {
        method: "POST",
        body: JSON.stringify({ confirm: confirmText }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not delete your account.");
        setBusy(false);
        return;
      }
      // Sign out + redirect to homepage
      await supabase.auth.signOut();
      router.push("/");
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="text-lg font-medium text-red-600 mb-3">Delete account</h2>
      <p className="text-sm text-muted leading-relaxed mb-4 max-w-md">
        This permanently deletes your profile, messages, saved items,
        and any orders attached to your account. This cannot be undone.
      </p>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder="Type DELETE MY ACCOUNT to confirm"
        className="w-full max-w-md px-3 py-2 border border-border rounded-sm text-sm mb-3"
      />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy || confirmText !== "DELETE MY ACCOUNT"}
        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? "Deleting…" : "Permanently delete my account"}
      </button>
    </section>
  );
}
```

Add to all three settings pages (factor into a shared component if you prefer — `src/components/AccountDangerZone.tsx`).

- [ ] **Step 3: Smoke**

Sign in as a throwaway test user. Navigate to `/customer-portal/settings`. Type the confirm string, click delete. Should sign out, redirect to homepage. Try to sign in as the same user — should fail.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/customer-portal/settings/page.tsx" \
        "src/app/(pages)/artist-portal/settings/page.tsx" \
        "src/app/(pages)/venue-portal/settings/page.tsx" \
        src/components/AccountDangerZone.tsx  # if shared
git commit -m "feat(account): in-app delete account from settings (was mailto)"
```

---

## Phase 5 — Notification preferences persistence

### Task 12 (§2.3 part 1): Schema + API for notification prefs

The DB already has `email_digest_enabled` (artist_profiles) and `message_notifications_enabled` (artist + venue). Customer prefs may not exist. Add what's missing and surface them via `/api/account/preferences`.

**Files:**
- Create: `supabase/migrations/046_notification_prefs.sql`
- Create: `src/app/api/account/preferences/route.ts`
- Test:   `src/app/api/account/preferences/route.test.ts`

- [ ] **Step 1: Migration**

```sql
-- 046_notification_prefs.sql
--
-- Backfill notification-preference columns for customers (artists +
-- venues already have them). All preferences default to opt-in.

ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS email_digest_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS message_notifications_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS order_notifications_enabled boolean DEFAULT true;

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS order_notifications_enabled boolean DEFAULT true;

ALTER TABLE venue_profiles
  ADD COLUMN IF NOT EXISTS email_digest_enabled boolean DEFAULT true;
```

- [ ] **Step 2: API route**

```typescript
// src/app/api/account/preferences/route.ts
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parseRole } from "@/lib/auth-roles"; // if Plan A merged; otherwise inline check

const PREF_FIELDS = [
  "email_digest_enabled",
  "message_notifications_enabled",
  "order_notifications_enabled",
] as const;

type Pref = (typeof PREF_FIELDS)[number];

function tableForRole(role: string | null): string | null {
  if (role === "artist") return "artist_profiles";
  if (role === "venue") return "venue_profiles";
  if (role === "customer") return "customer_profiles";
  return null;
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const role = parseRole(auth.user!.user_metadata?.user_type);
  const table = tableForRole(role);
  if (!table) return NextResponse.json({ error: "Unsupported role" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data } = await db
    .from(table)
    .select(PREF_FIELDS.join(","))
    .eq("user_id", auth.user!.id)
    .maybeSingle();

  return NextResponse.json({
    preferences: PREF_FIELDS.reduce<Record<Pref, boolean>>(
      (acc, k) => ({ ...acc, [k]: (data as Record<string, unknown> | null)?.[k] ?? true }),
      {} as Record<Pref, boolean>,
    ),
  });
}

export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const role = parseRole(auth.user!.user_metadata?.user_type);
  const table = tableForRole(role);
  if (!table) return NextResponse.json({ error: "Unsupported role" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, boolean> = {};
  for (const field of PREF_FIELDS) {
    if (typeof body[field] === "boolean") updates[field] = body[field];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid preferences provided" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { error } = await db.from(table).update(updates).eq("user_id", auth.user!.id);
  if (error) {
    console.error("[preferences] update failed:", error);
    return NextResponse.json({ error: "Could not save preferences" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Test**

```typescript
// src/app/api/account/preferences/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({
    user: { id: "u1", user_metadata: { user_type: "artist" } },
    error: null,
  })),
}));

const fromMock = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

vi.mock("@/lib/auth-roles", () => ({
  parseRole: (v: unknown) => v as "artist" | "venue" | "customer" | null,
}));

import { GET, PATCH } from "./route";

beforeEach(() => fromMock.mockReset());

function req(method: "GET" | "PATCH", body?: unknown): Request {
  return new Request("http://localhost/api/account/preferences", {
    method,
    headers: { authorization: "Bearer x", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("/api/account/preferences", () => {
  it("GET returns preferences with defaults", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              email_digest_enabled: true,
              message_notifications_enabled: false,
              order_notifications_enabled: true,
            },
          }),
        }),
      }),
    });
    const res = await GET(req("GET"));
    const body = await res.json();
    expect(body.preferences.email_digest_enabled).toBe(true);
    expect(body.preferences.message_notifications_enabled).toBe(false);
  });

  it("PATCH writes only boolean fields", async () => {
    const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
    fromMock.mockReturnValue({ update });
    const res = await PATCH(
      req("PATCH", { email_digest_enabled: false, bogus: "ignored" }),
    );
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ email_digest_enabled: false });
  });
});
```

- [ ] **Step 4: Run, typecheck, commit**

```bash
git add supabase/migrations/046_notification_prefs.sql \
        src/app/api/account/preferences/route.ts \
        src/app/api/account/preferences/route.test.ts
git commit -m "feat(account): persistent notification preferences API + migration"
```

---

### Task 13 (§2.3 part 2): Wire prefs into all three portal settings pages

**Files:**
- Modify: `src/app/(pages)/customer-portal/settings/page.tsx`
- Modify: `src/app/(pages)/artist-portal/settings/page.tsx`
- Modify: `src/app/(pages)/venue-portal/settings/page.tsx`

- [ ] **Step 1: Replace localStorage state with API-backed state**

In each settings page, find the notification-pref toggles. They probably look like `useState(() => localStorage.getItem(...))`. Replace with:

```tsx
const [prefs, setPrefs] = useState<Record<string, boolean>>({
  email_digest_enabled: true,
  message_notifications_enabled: true,
  order_notifications_enabled: true,
});

useEffect(() => {
  if (!user) return;
  authFetch("/api/account/preferences")
    .then((r) => r.json())
    .then((data) => setPrefs(data.preferences))
    .catch(() => {});
}, [user]);

async function togglePref(field: keyof typeof prefs) {
  const next = { ...prefs, [field]: !prefs[field] };
  setPrefs(next); // optimistic
  const res = await authFetch("/api/account/preferences", {
    method: "PATCH",
    body: JSON.stringify({ [field]: next[field] }),
  });
  if (!res.ok) {
    setPrefs(prefs); // revert on failure
    // Toast or inline error
  }
}
```

Each toggle becomes:

```tsx
<label className="flex items-center justify-between py-3 border-b border-border">
  <span className="text-sm">Email digest</span>
  <input
    type="checkbox"
    checked={prefs.email_digest_enabled}
    onChange={() => togglePref("email_digest_enabled")}
  />
</label>
```

(Match the existing styling on each page — the structure is the same across portals but the visual chrome differs.)

- [ ] **Step 2: Drop the localStorage code**

Remove any `localStorage.setItem("notification-prefs-...")` calls. The API is now the source of truth.

- [ ] **Step 3: Smoke**

In each portal:
- Sign in
- Settings → toggle a preference
- Refresh the page
- The toggle stays in the new position (was: it would reset to localStorage default if cache cleared)

Then sign in on a different device / incognito → confirm toggle reflects the server-persisted value.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/customer-portal/settings/page.tsx" \
        "src/app/(pages)/artist-portal/settings/page.tsx" \
        "src/app/(pages)/venue-portal/settings/page.tsx"
git commit -m "fix(settings): notification prefs persisted server-side, not localStorage"
```

---

## Phase 6 — Counter-offer arrangement type

QA report §2.5: `CounterPlacementDialog.tsx:69` has logic where `paidLoan && !qr` returns `arrangementType = "free_loan"` because the legacy schema treats `free_loan` as "has a monthly fee". Cleaning up requires a migration to introduce `paid_loan` as a distinct value, then updating both the dialog and the API.

### Task 14: Migration to allow `paid_loan` arrangement type

**Files:**
- Create: `supabase/migrations/047_paid_loan_arrangement_type.sql`

- [ ] **Step 1: Inspect the current constraint**

```sql
-- Run via Supabase Studio or psql:
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'placements'::regclass
  AND contype = 'c'
  AND conname LIKE '%arrangement%';
```

Note the current allowed values (likely `'free_loan' | 'revenue_share' | 'purchase'`).

- [ ] **Step 2: Migration**

```sql
-- 047_paid_loan_arrangement_type.sql
--
-- Rename the misleading "free_loan with monthly fee" pattern. We introduce
-- paid_loan as a distinct arrangement_type and migrate any rows where
-- monthly_fee_gbp > 0 from free_loan → paid_loan. New rows go through
-- the cleanly-named value.

-- Drop old constraint (find the actual name from Step 1)
ALTER TABLE placements DROP CONSTRAINT IF EXISTS placements_arrangement_type_check;

-- Add new constraint with paid_loan included
ALTER TABLE placements
  ADD CONSTRAINT placements_arrangement_type_check
  CHECK (arrangement_type IN ('free_loan', 'paid_loan', 'revenue_share', 'purchase'));

-- Backfill: any existing free_loan with a monthly fee is actually a paid_loan
UPDATE placements
SET arrangement_type = 'paid_loan'
WHERE arrangement_type = 'free_loan'
  AND monthly_fee_gbp IS NOT NULL
  AND monthly_fee_gbp > 0;
```

- [ ] **Step 3: Apply locally + verify**

```bash
psql "$LOCAL_SUPABASE_DB_URL" -f supabase/migrations/047_paid_loan_arrangement_type.sql
psql "$LOCAL_SUPABASE_DB_URL" -c "SELECT arrangement_type, count(*) FROM placements GROUP BY 1;"
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/047_paid_loan_arrangement_type.sql
git commit -m "feat(db): introduce paid_loan arrangement type, migrate misclassified rows"
```

---

### Task 15: Counter-offer dialog uses `paid_loan` correctly

**Files:**
- Modify: `src/components/CounterPlacementDialog.tsx`

- [ ] **Step 1: Find the arrangementType derivation**

The current line 69 is:

```tsx
const arrangementType: "free_loan" | "revenue_share" = paidLoan ? "free_loan" : qr ? "revenue_share" : "free_loan";
```

(With the misleading comment about legacy column naming.)

- [ ] **Step 2: Replace with three-value derivation**

```tsx
type ArrangementType = "free_loan" | "paid_loan" | "revenue_share";

// paidLoan → paid_loan; qr (no monthly fee) → revenue_share; neither → free_loan.
const arrangementType: ArrangementType = paidLoan
  ? "paid_loan"
  : qr
    ? "revenue_share"
    : "free_loan";
```

Update the `CounterResult` interface (line 22) to match:

```tsx
arrangementType: "free_loan" | "paid_loan" | "revenue_share" | "purchase";
```

Drop the misleading comment on line 67–68; replace with the new mapping in plain English.

- [ ] **Step 3: Smoke**

Open a placement detail. Counter with a paid loan (toggle on, set fee). The PATCH body to `/api/placements` should now include `arrangementType: "paid_loan"` (verify via DevTools network tab). The current API will fail because it still expects `free_loan`. That's fixed in Task 16.

- [ ] **Step 4: Commit**

```bash
git add src/components/CounterPlacementDialog.tsx
git commit -m "fix(placements): counter-offer dialog uses paid_loan, not legacy free_loan"
```

---

### Task 16: `/api/placements` accepts `paid_loan`

**Files:**
- Modify: `src/app/api/placements/route.ts`

- [ ] **Step 1: Find the Zod schema or arrangementType validation**

Run: `grep -n "arrangementType\|arrangement_type" src/app/api/placements/route.ts | head -20`

There's likely a Zod schema (`placementUpdateSchema` or similar) that enums `arrangementType`. Add `"paid_loan"` to the enum.

```typescript
arrangementType: z.enum(["free_loan", "paid_loan", "revenue_share", "purchase"]).optional(),
```

- [ ] **Step 2: Verify the DB write doesn't translate**

Around line 873–876 (`termsUpdates.arrangement_type = counter.arrangementType`), the API writes the value directly. With Task 14's migration in place, `paid_loan` is now a valid DB value. Just confirm the column accepts the four-value enum.

- [ ] **Step 3: Update the auto-message text**

Around line 956–966, the counter-offer auto-message constructs human copy:

```typescript
if (counter.arrangementType === "revenue_share" && counter.revenueSharePercent !== undefined) {
  terms.push(`Revenue share: ${counter.revenueSharePercent}% to the venue`);
} else if (counter.arrangementType === "free_loan") {
  terms.push("Paid loan arrangement"); // ← MISLEADING — actually free
} else if (counter.arrangementType === "purchase") {
  terms.push("Purchase arrangement");
}
```

Replace with:

```typescript
if (counter.arrangementType === "revenue_share" && counter.revenueSharePercent !== undefined) {
  terms.push(`Revenue share: ${counter.revenueSharePercent}% to the venue`);
} else if (counter.arrangementType === "paid_loan") {
  terms.push("Paid loan arrangement");
} else if (counter.arrangementType === "free_loan") {
  terms.push("Free loan arrangement");
} else if (counter.arrangementType === "purchase") {
  terms.push("Purchase arrangement");
}
```

- [ ] **Step 4: Test**

Add a unit test (or extend if there's a test file):

```typescript
// in src/app/api/placements/route.test.ts (create if missing)
it("PATCH counter accepts arrangementType=paid_loan", async () => {
  // ... mock setup
  const res = await PATCH(req({ id: "p1", counter: { arrangementType: "paid_loan", monthlyFeeGbp: 50 } }));
  expect(res.status).toBe(200);
});
```

- [ ] **Step 5: Smoke**

End-to-end: open a placement, send a counter with paid-loan, see the auto-message read "Paid loan arrangement", DB row has `arrangement_type = 'paid_loan'`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/placements/route.ts src/app/api/placements/route.test.ts
git commit -m "fix(placements): API accepts paid_loan, auto-message text corrected"
```

---

## Phase 7 — Final verification

### Task 17: Full check + smoke + open PR

- [ ] **Step 1: Run full check suite**

```bash
npm run check
```

Expected: lint clean (76 pre-existing OK), typecheck clean, all vitest suites green.

- [ ] **Step 2: Run a build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 3: 12-step manual smoke**

Use demo accounts (Maya Chen artist + Copper Kettle venue + a fresh customer):

1. **§2.1 customer messages** — `/customer-portal/messages` renders without "venue" header.
2. **§2.4 wall delete** — delete a test wall in `/venue-portal/walls/[id]`. Lands on walls list, no error alert.
3. **§2.7 collection size filter** — open a collection, click "Small" chip, only small works show.
4. **§2.8 location filter persistence** — set location filter on `/browse`, switch tabs, filter persists.
5. **§2.9 QR scans** — venue dashboard shows a real number, not 0.
6. **§2.10 saved collections link** — save a collection, click it from saved tab, lands on detail page.
7. **§2.11 fake venues** — artist analytics → "Venues That Viewed You" → no fake names; either real data or empty state.
8. **§2.12 collection delete confirm** — try to delete a collection, confirm dialog appears.
9. **§2.6 mobile tab switching** — verify works on a mobile viewport (or confirm no-op commit was right).
10. **§2.2 account delete** — delete a throwaway account in customer settings. Sign-in fails for that user afterwards.
11. **§2.3 prefs persistence** — toggle a notification pref in any portal, refresh, toggle stays.
12. **§2.5 counter-offer paid_loan** — send a counter with a paid loan from a placement. DB row has `arrangement_type='paid_loan'`. Auto-message reads "Paid loan arrangement".

- [ ] **Step 4: Open the PR**

```bash
git push -u origin claude/qa-c-portal-correctness
gh pr create --title "Plan C: portal data correctness" --body "$(cat <<'EOF'
## Summary

Closes the §2.1–§2.12 bucket from the 2026-04-30 pre-launch QA audit — the "feature exists but is wrong" portal bugs.

- Customer portal messages identifies as customer (was "venue")
- Wall delete success condition fixed
- QR Scans dashboard wired from real analytics data
- Saved collections link to specific collection (not generic listing)
- Artist analytics drops fake venue names; shows empty state or real data
- Collection delete asks for confirmation
- Collection size filter actually filters
- Browse location filter survives view switches
- Mobile tab switching reproduced + fixed (or verified working)
- In-app account deletion (was mailto)
- Notification preferences persisted server-side, not localStorage
- Counter-offer dialog uses paid_loan as a distinct value (was misnamed free_loan)

## Test plan

- [ ] `npm run check` clean
- [ ] `npm run build` clean
- [ ] All 12 manual smoke checks in plan §17 pass
- [ ] Migrations 046 + 047 applied on staging + production
- [ ] Communicate `paid_loan` arrangement_type addition to whoever maintains email templates / analytics

## Out of scope

- Polished modal pattern for delete confirmations (Plan F)
- Carrier tracking links on order rows (Plan F)
- Venue dashboard chart redesign (Plan E)
EOF
)"
```

---

## Self-review

**1. Spec coverage** (sections from QA report covered):
- §2.1 customer messages portalType → Task 1 ✓
- §2.2 account deletion → Tasks 10–11 ✓
- §2.3 notification prefs persistence → Tasks 12–13 ✓
- §2.4 wall delete inverted condition → Task 2 ✓
- §2.5 counter-offer arrangement type → Tasks 14–16 ✓
- §2.6 mobile tab switching → Task 9 (verify-first) ✓
- §2.7 collection size filter → Task 7 ✓
- §2.8 location filter persistence → Task 8 ✓
- §2.9 QR scans hardcoded 0 → Task 3 ✓
- §2.10 saved collections link → Task 4 ✓
- §2.11 hardcoded fake venues → Task 5 ✓
- §2.12 collection delete confirmation → Task 6 ✓

All 12 covered.

**2. Placeholder scan:** every step has actual code or an exact command. Two flexibility notes deliberately remain:
- Task 7 step 4 says "if `sizeBandLabel` isn't already exported, look at SizeBands.ts" — tied to a file the executor reads first.
- Task 9 is the verify-first task — the steps explicitly handle both "reproduced" and "not reproducible" outcomes.

**3. Type / name consistency:**
- `CONFIRM_STRING` ("DELETE MY ACCOUNT") same in API (Task 10) and UI (Task 11) ✓
- `ArrangementType` union (`"free_loan" | "paid_loan" | "revenue_share" | "purchase"`) consistent across Tasks 14–16 ✓
- `prefs` shape (`email_digest_enabled`, `message_notifications_enabled`, `order_notifications_enabled`) matched between migration (Task 12) and UI (Task 13) ✓
- Migration filenames use `046_`, `047_` — the codebase already has up to `043_artwork_requests_and_commissions.sql` per the recent listing; if a different number has been claimed since, bump accordingly ✓

**4. Independence:** Plan C touches no files Plan A or Plan B modify. Plan A's `parseRole` is used in Task 12's API route — if Plan A hasn't merged, the executor can inline a simple `if (role === "artist") ... else if (role === "venue") ...` in `tableForRole()` and skip the import. Noted in Task 12.

**Risk notes:**
- Task 14 migration is destructive on the constraint; coordinate with whoever owns staging DB before running.
- Task 10's TABLES_USER_ID list is best-effort — if there are tables referencing `auth.users(id)` that aren't in this list, deletion may leave orphan rows. Audit with: `SELECT table_name, column_name FROM information_schema.columns WHERE column_name LIKE '%user_id%';` before merging.
- Task 11's danger-zone UI is plain enough to be jarring next to polished settings copy. Plan F can revisit the styling.

Plan looks complete. Ready to execute.

---

## Execution

When you're ready, two paths:

**1. Subagent-driven (recommended)** — Use `superpowers:subagent-driven-development`. Same loop Plan A used.

**2. Inline** — Use `superpowers:executing-plans`.

No special env vars needed for Plan C (unlike Plan B's `ORDER_TOKEN_SECRET`). Migrations 046 + 047 must be applied to staging before merging.
