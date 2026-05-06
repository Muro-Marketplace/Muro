# Plan G2 Execution — Pre-launch QA Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every finding in `docs/plans/2026-05-03-G2-additional-qa-findings.md` (54 items, G2-1 through G2-54), grouped into a phased rollout that ships the highest-blast-radius bugs first and lets the rest land in slices.

**Architecture:** Six new shared utilities (`arrangement-labels`, `postcode`, `order-status-labels`, `useUrlState`, `confirmDialog`, `assert-handler`) plus surgical edits to ~50 files across portals, checkout, admin, and the public marketing surface. Three small DB migrations: `paid_loan` column rename, `orders.order_number` short id, `artist_applications.reviewed_at` / `reviewed_by`.

**Tech Stack:** Next.js 16.2, React 19.2, Tailwind 4, Zod 3, Vitest 2.1, Supabase. Path alias `@/` → `src/`. Tests colocated as `*.test.ts(x)` siblings unless explicitly noted.

**Independence:**
- Sits **on top of Plans A, B, C, D (already merged)**.
- Plans E (mobile/a11y), F (polish), G (targeted) are on unmerged branches. Where this plan touches a file Plan E/F/G also touches, the soft dep is noted in the task header. Sequential merge in any order is clean — no hard conflicts.
- Plan G2 explicitly augments three Plan G tasks: G2-7 augments Plan G's Tasks 3+4 with a vocabulary-consolidation library; G2-22 augments Plan F Task 21 (ToastContext) with the actual call-site migrations; G2-50 augments Plan G Task 13's grep target list.

**Out of scope (other plans):**
- Anything Plans A–G already covered. The findings doc's per-item Assessment lines confirm uniqueness.
- Mobile wall *visualizer* touch (Plan G Task 14).
- Image fallback / skeleton / SearchBar component (Plan F Tasks 2, 4, 14).
- Mobile layout fixes (Plan E).

**Branch strategy:**
- Worktree: `git worktree add .claude/worktrees/qa-g2-execution claude/qa-g2-execution` off `main` (after Plans E/F/G merge — or off whichever branch is most current).
- One commit per task. Push at every phase boundary so reviewers can track progress.
- `npm run check` MUST pass before each commit unless the task explicitly notes otherwise.

**Phases (mapping to suggested PR slices):**

| Phase | Tasks | PR slice | Purpose |
|---|---|---|---|
| 1. Severity-1 correctness | 1–7 | **PR-1: pre-launch correctness** | Block actual production damage |
| 2. Foundations (utilities + migrations) | 8–13 | **PR-2: G2 foundations** | Land the shared libs/migrations the rest depends on |
| 3. Cross-page IA & copy | 14–23 | **PR-3: IA + copy** | Wants product/copy review |
| 4. Customer-portal & checkout | 24–31 | **PR-4: customer + checkout** | Round out customer journey |
| 5. Artist-portal | 32–37 | **PR-5: artist polish** | (alert→toast in 5; subscription copy in 6) |
| 6. Venue-portal | 38–46 | **PR-5 cont.** | Wall editor + settings + labels |
| 7. Admin | 47–50 | **PR-6: admin uplift** | New surfaces (users/disputes/payouts) |
| 8. Public forms & browse | 51–57 | **PR-7: forms + browse polish** | Spam, GDPR, slider caps, URL state |
| 9. Final verification + PR | 58 | (per slice) | Smoke + PR description |

Each phase's leading task header lists which G2 findings it covers, in order, so the mapping back to the spec is auditable.

---

## Phase 1 — Severity-1 correctness (PR-1)

These seven tasks are the "block production damage" set. They ship together as one focused PR that can land the day it's reviewed. Don't bundle anything else in.

### Task 1: Checkout collection-fulfilment passes server validation (covers G2-14)

**Assessment:** Net new. Plan B (checkout payment integrity) covered shipping price + duplicate-prevention but didn't reshape `checkoutSchema` for non-shipping fulfilment.

**Symptom:** Buyer picks "Collect from artist", front-end hides address fields, server-side `checkoutSchema` still requires `addressLine1`, `city`, `postcode`. POST → 400 "Cart items and shipping required". Page shows generic submit error.

**Files:**
- Modify: `src/lib/validations.ts:175-203`
- Test: `src/lib/validations.test.ts` (extend or create)

- [ ] **Step 1: Read the current schema**

```bash
grep -n "checkoutSchema\|fulfilmentMethod\|shipping" src/lib/validations.ts | head -20
```

Confirm the current shape: `fulfilmentMethod` is part of the schema, address fields are top-level `safeString` requireds.

- [ ] **Step 2: Write failing tests**

```ts
// src/lib/validations.test.ts (extend)
import { describe, expect, it } from "vitest";
import { checkoutSchema } from "./validations";

describe("checkoutSchema fulfilment branches", () => {
  const cartItem = { workId: "11111111-1111-1111-1111-111111111111", price: 1000, qty: 1 };

  it("requires address fields when fulfilmentMethod is shipping", () => {
    const result = checkoutSchema.safeParse({
      cartItems: [cartItem],
      fulfilmentMethod: "shipping",
      // no address
    });
    expect(result.success).toBe(false);
  });

  it("does NOT require address fields when fulfilmentMethod is collection", () => {
    const result = checkoutSchema.safeParse({
      cartItems: [cartItem],
      fulfilmentMethod: "collection",
      // no address — should still pass
    });
    expect(result.success).toBe(true);
  });

  it("rejects collection with garbage address (still validates if provided)", () => {
    const result = checkoutSchema.safeParse({
      cartItems: [cartItem],
      fulfilmentMethod: "collection",
      addressLine1: "x".repeat(600),
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Verify FAIL**

Run: `npx vitest run src/lib/validations.test.ts -t "fulfilment branches"`. Expected: tests fail because schema currently rejects collection-without-address with the "Cart items and shipping required" path.

- [ ] **Step 4: Refactor to a discriminated union**

In `src/lib/validations.ts`:

```ts
const baseCheckoutFields = {
  cartItems: z.array(cartItemSchema).min(1).max(50),
  email: email.optional(),
  notes: safeString(800).optional(),
};

const shippingCheckoutSchema = z.object({
  ...baseCheckoutFields,
  fulfilmentMethod: z.literal("shipping"),
  fullName: safeString(120),
  addressLine1: safeString(200),
  addressLine2: safeString(200).optional(),
  city: safeString(100),
  postcode: safeString(20),
  country: safeString(60),
});

const collectionCheckoutSchema = z.object({
  ...baseCheckoutFields,
  fulfilmentMethod: z.literal("collection"),
  // Address fields optional — buyer is collecting in person.
  fullName: safeString(120).optional(),
  addressLine1: safeString(200).optional(),
  addressLine2: safeString(200).optional(),
  city: safeString(100).optional(),
  postcode: safeString(20).optional(),
  country: safeString(60).optional(),
});

export const checkoutSchema = z.discriminatedUnion("fulfilmentMethod", [
  shippingCheckoutSchema,
  collectionCheckoutSchema,
]);
```

- [ ] **Step 5: Verify PASS**

Run: `npx vitest run src/lib/validations.test.ts`. Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validations.ts src/lib/validations.test.ts
git commit -m "fix(checkout): collection fulfilment doesn't require shipping address"
```

---

### Task 2: Cart re-validates against DB at checkout (covers G2-15)

**Assessment:** Net new. **Highest blast-radius finding in G2.** Plan D Task 11 fixed *display* of stale references in collections; Plan B locked down payment integrity for happy-path. Neither covers re-pricing at the moment of charge.

**Symptom:** localStorage cart can carry an out-of-date `price` for a work the artist deleted, marked sold, or re-priced. `/api/checkout` blindly maps `items.price` into `unit_amount`. A buyer can be charged a wrong amount with no DB cross-check.

**Files:**
- Modify: `src/app/api/checkout/route.ts:60-72`
- Test: `src/app/api/checkout/route.test.ts` (extend or create)

- [ ] **Step 1: Read the current route**

```bash
sed -n '40,90p' src/app/api/checkout/route.ts
```

Confirm `items` is mapped directly from `body.cartItems` into a Stripe `line_items` array with `unit_amount: item.price * 100`.

- [ ] **Step 2: Write failing tests**

Use mocked Supabase client + a fake Stripe stub.

```ts
// src/app/api/checkout/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const works = new Map<string, { id: string; price: number; active: boolean; sold: boolean }>([
  ["work-1", { id: "work-1", price: 100, active: true, sold: false }],
  ["work-2-sold", { id: "work-2-sold", price: 250, active: true, sold: true }],
  ["work-3-deleted", { id: "work-3-deleted", price: 400, active: false, sold: false }],
]);

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        in: (_col: string, ids: string[]) => Promise.resolve({
          data: ids.map((id) => works.get(id)).filter(Boolean),
          error: null,
        }),
      }),
    }),
  }),
}));

vi.mock("stripe", () => ({
  default: class {
    checkout = {
      sessions: {
        create: vi.fn(async (args: any) => ({ id: "sess_test", url: "https://stripe.test", _args: args })),
      },
    };
  },
}));

import { POST } from "./route";

function jsonReq(body: unknown) {
  return new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/checkout — cart re-validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects checkout when a cart line refers to a sold work", async () => {
    const res = await POST(jsonReq({
      cartItems: [{ workId: "work-2-sold", price: 250, qty: 1 }],
      fulfilmentMethod: "collection",
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/sold/i);
  });

  it("rejects checkout when a cart line refers to an inactive/deleted work", async () => {
    const res = await POST(jsonReq({
      cartItems: [{ workId: "work-3-deleted", price: 400, qty: 1 }],
      fulfilmentMethod: "collection",
    }));
    expect(res.status).toBe(409);
  });

  it("recomputes unit_amount from DB price (ignores client price drift)", async () => {
    const res = await POST(jsonReq({
      cartItems: [{ workId: "work-1", price: 50 /* stale, DB says 100 */, qty: 1 }],
      fulfilmentMethod: "collection",
    }));
    expect(res.status).toBe(200);
    // Pull the args the Stripe stub captured
    // (the implementation should use 100 not 50)
    // assert via captured call (impl detail — adjust to your stub)
  });
});
```

- [ ] **Step 3: Verify FAIL**

Run: `npx vitest run src/app/api/checkout/route.test.ts`. Expected: all three new tests fail.

- [ ] **Step 4: Implement re-validation**

In `src/app/api/checkout/route.ts`, before the Stripe call:

```ts
const workIds = parsed.cartItems.map((i) => i.workId);
const { data: workRows, error } = await getSupabaseAdmin()
  .from("works")
  .select("id, price, active, sold, title, artist_user_id")
  .in("id", workIds);

if (error) {
  return NextResponse.json({ error: "Could not validate cart" }, { status: 500 });
}

const workById = new Map((workRows || []).map((w) => [w.id, w]));

for (const line of parsed.cartItems) {
  const w = workById.get(line.workId);
  if (!w || w.active === false) {
    return NextResponse.json(
      { error: `One of the works in your cart is no longer available.`, code: "work_unavailable", workId: line.workId },
      { status: 409 },
    );
  }
  if (w.sold) {
    return NextResponse.json(
      { error: `"${w.title}" has just been sold.`, code: "work_sold", workId: line.workId },
      { status: 409 },
    );
  }
}

// Recompute amounts from the DB (not the client)
const lineItems = parsed.cartItems.map((line) => {
  const w = workById.get(line.workId)!;
  return {
    quantity: line.qty,
    price_data: {
      currency: "gbp",
      unit_amount: Math.round(w.price * 100),
      product_data: { name: w.title },
    },
  };
});
```

- [ ] **Step 5: Verify PASS**

Run: `npx vitest run src/app/api/checkout/route.test.ts`. Expected: all pass.

- [ ] **Step 6: Surface the 409 nicely client-side**

In `src/app/(pages)/checkout/page.tsx`, find the submit handler. On `res.status === 409`:

```tsx
if (res.status === 409) {
  const data = await res.json().catch(() => ({}));
  const offendingId = data.workId as string | undefined;
  if (offendingId) {
    removeCartItem(offendingId); // existing CartContext helper
  }
  showToast(data.error ?? "Cart updated — one item became unavailable.", { variant: "warn", durationMs: 6000 });
  return; // do NOT redirect to Stripe
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/api/checkout/route.ts src/app/api/checkout/route.test.ts \
        "src/app/(pages)/checkout/page.tsx"
git commit -m "fix(checkout): re-validate cart against DB; reject sold/deleted works"
```

---

### Task 3: OrderStatusTracker recognises every API status (covers G2-16)

**Assessment:** Net new. Plan D Task 9 added carrier link only. The tracker's `STEPS` constant is hardcoded to four; the API/`/orders/track` already use seven labelled states.

**Symptom:** Order in `awaiting_dispatch` / `artist_notified` / `placed` → all four pips render gray; the tracker label falls back to the raw machine string ("awaiting_dispatch"). Customer sees DB internals.

**Files:**
- Create: `src/lib/order-status-labels.ts`
- Test: `src/lib/order-status-labels.test.ts`
- Modify: `src/components/OrderStatusTracker.tsx:8-13, 27, 57`
- Modify: `src/lib/order-state-machine.ts` (add the missing statuses to ORDER_STATUSES)

- [ ] **Step 1: Cross-reference the canonical statuses**

```bash
grep -n "STATUS_COPY\b" "src/app/(pages)/orders/track/page.tsx"
sed -n '40,60p' "src/app/(pages)/orders/track/page.tsx"
```

Capture the full set: `confirmed`, `artist_notified`, `awaiting_dispatch`, `processing`, `shipped`, `delivered`, `disputed`, `cancelled`, `refunded`. (Adjust to actual file output.)

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/order-status-labels.test.ts
import { describe, expect, it } from "vitest";
import { ORDER_STEPS, labelForStatus, isTerminalStatus } from "./order-status-labels";

describe("order-status-labels", () => {
  it("includes all seven progressive states in order", () => {
    expect(ORDER_STEPS.map((s) => s.key)).toEqual([
      "confirmed",
      "artist_notified",
      "awaiting_dispatch",
      "processing",
      "shipped",
      "delivered",
    ]);
  });

  it("labels each progressive state with human copy", () => {
    expect(labelForStatus("artist_notified")).toBe("Artist notified");
    expect(labelForStatus("awaiting_dispatch")).toBe("Awaiting dispatch");
    expect(labelForStatus("delivered")).toBe("Delivered");
  });

  it("falls back to a sensible label for unknown statuses (never raw machine string)", () => {
    expect(labelForStatus("aliens")).not.toBe("aliens");
  });

  it("treats cancelled / refunded / disputed as terminal", () => {
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("refunded")).toBe(true);
    expect(isTerminalStatus("disputed")).toBe(true);
    expect(isTerminalStatus("delivered")).toBe(true);
    expect(isTerminalStatus("shipped")).toBe(false);
  });
});
```

- [ ] **Step 3: Verify FAIL**

Run: `npx vitest run src/lib/order-status-labels.test.ts`. Expected: module not found.

- [ ] **Step 4: Implement**

```ts
// src/lib/order-status-labels.ts
//
// Canonical labels for every order status surfaced to customers. Used by
// /orders/track AND OrderStatusTracker. ORDER_STEPS is the linear pipeline
// (the row of pips); cancelled/refunded/disputed are off-pipeline terminal
// states with their own badges.

export type OrderStatus =
  | "confirmed"
  | "artist_notified"
  | "awaiting_dispatch"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "disputed";

interface Step { key: OrderStatus; label: string; }

export const ORDER_STEPS: Step[] = [
  { key: "confirmed", label: "Order placed" },
  { key: "artist_notified", label: "Artist notified" },
  { key: "awaiting_dispatch", label: "Awaiting dispatch" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

const TERMINAL = new Set<OrderStatus>(["delivered", "cancelled", "refunded", "disputed"]);

export function isTerminalStatus(s: string): boolean {
  return TERMINAL.has(s as OrderStatus);
}

export function labelForStatus(s: string): string {
  const step = ORDER_STEPS.find((x) => x.key === s);
  if (step) return step.label;
  switch (s) {
    case "cancelled": return "Cancelled";
    case "refunded": return "Refunded";
    case "disputed": return "Disputed";
    default: return "In progress";
  }
}
```

- [ ] **Step 5: Wire into OrderStatusTracker**

In `src/components/OrderStatusTracker.tsx`, replace the local `STEPS` and `isCancelled` with the new module:

```tsx
import { ORDER_STEPS, isTerminalStatus, labelForStatus } from "@/lib/order-status-labels";

// Replace local STEPS const
const STEPS = ORDER_STEPS;

// Replace `isCancelled` check
const isOffPipeline = ["cancelled", "refunded", "disputed"].includes(currentStatus);

// In the off-pipeline branch, render a tone-aware badge using labelForStatus(currentStatus).
// In the compact branch's fallback, replace `STEPS[currentIdx]?.label || currentStatus` with
// `STEPS[currentIdx]?.label || labelForStatus(currentStatus)`.
```

- [ ] **Step 6: Wire into /orders/track to share the source of truth**

In `src/app/(pages)/orders/track/page.tsx`, replace the local `STATUS_COPY` with `labelForStatus()` calls. Keep the `tone` mapping (warn for disputed, good for delivered) inline; the labels come from the new module.

- [ ] **Step 7: Update order-state-machine to recognise the new statuses**

In `src/lib/order-state-machine.ts`, expand `ORDER_STATUSES`:

```ts
export const ORDER_STATUSES = [
  "confirmed",
  "artist_notified",
  "awaiting_dispatch",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "disputed",
] as const;

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  confirmed: ["artist_notified", "cancelled"],
  artist_notified: ["awaiting_dispatch", "processing", "cancelled"],
  awaiting_dispatch: ["processing", "shipped", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "disputed"],
  delivered: ["refunded", "disputed"],
  cancelled: [],
  refunded: [],
  disputed: ["refunded", "delivered"],
};
```

- [ ] **Step 8: Verify**

```bash
npm run typecheck && npx vitest run src/lib/order-status-labels.test.ts src/lib/order-state-machine.test.ts
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/order-status-labels.ts src/lib/order-status-labels.test.ts \
        src/lib/order-state-machine.ts \
        src/components/OrderStatusTracker.tsx \
        "src/app/(pages)/orders/track/page.tsx"
git commit -m "fix(orders): tracker recognises every API status; canonical label module"
```

---

### Task 4: "Yes, delete my account" buttons get a working mailto fallback (covers G2-23)

**Assessment:** Net new. Worse than Plan C 2026-05-02 Task 11 assumes — the button is a no-op rather than a mailto. Until the API ships, point users at email so the destructive intent reaches a human.

**Files:**
- Modify: `src/app/(pages)/artist-portal/settings/page.tsx:257-259`
- Modify: `src/app/(pages)/venue-portal/settings/page.tsx:387-391`

- [ ] **Step 1: Find the artist button**

```bash
sed -n '240,270p' "src/app/(pages)/artist-portal/settings/page.tsx"
```

- [ ] **Step 2: Replace artist button with a mailto anchor**

```tsx
// before:
<button className="bg-red-600 text-white px-4 py-2 rounded-sm hover:bg-red-700">
  Yes, delete my account
</button>

// after:
<a
  href="mailto:support@wallplace.co.uk?subject=Delete%20my%20account&body=Please%20delete%20my%20Wallplace%20artist%20account%20associated%20with%20this%20email."
  className="inline-block bg-red-600 text-white px-4 py-2 rounded-sm hover:bg-red-700"
>
  Email support to delete account
</a>
```

(Update the surrounding "Are you absolutely sure?" copy to match: "We'll process the deletion within 7 days. You'll receive a confirmation email.")

- [ ] **Step 3: Replace venue button identically**

In `src/app/(pages)/venue-portal/settings/page.tsx:387-391`, same replacement. The body text reads "venue account" instead of "artist account".

- [ ] **Step 4: Smoke**

```bash
npm run dev
```

Visit `/artist-portal/settings` and `/venue-portal/settings`. Click "Email support to delete account". Confirm the OS opens a mailto draft with the right subject/body.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(pages)/artist-portal/settings/page.tsx" \
        "src/app/(pages)/venue-portal/settings/page.tsx"
git commit -m "fix(account): replace dead delete-account button with mailto fallback"
```

> **Follow-up:** When Plan C 2026-05-02 Task 11 ships the real DELETE endpoint, swap these mailto anchors back to the API call and a confirmation modal.

---

### Task 5: Settings save tells the truth about what persisted (covers G2-28, G2-30)

**Assessment:** Net new. Plan C 2026-05-02 Tasks 12–13 cover the persistence work for the message channel only. Until the rest ships, the page is dishonest.

**Symptom:** Toggling "Sales", "Payout notifications", "Wallplace newsletter" etc. and clicking Save Preferences shows "Saved!" — but only `messageNotifsEnabled` reaches the DB. The rest is localStorage.

**Files:**
- Modify: `src/app/(pages)/artist-portal/settings/page.tsx:108-117`
- Modify: `src/app/(pages)/venue-portal/settings/page.tsx:171-180`

- [ ] **Step 1: Mark unimplemented toggles disabled with a "Coming soon" pill**

In each settings page, find the notification preferences block. For every toggle except `messageNotifsEnabled`, wrap the label/control with:

```tsx
<div className="flex items-start gap-3 opacity-60">
  <input type="checkbox" disabled className="mt-1" />
  <div>
    <p className="text-sm font-medium text-foreground">Sales notifications</p>
    <p className="text-xs text-muted">
      Coming soon — notifications for this category aren't persisted yet.
    </p>
  </div>
</div>
```

(Apply the same pattern to all five non-message toggles. Keep the labels — just disable the input and add the "Coming soon" copy.)

- [ ] **Step 2: Update the success-toast copy**

In the `handleSave` (or equivalent) function on each page, change the toast from "Saved!" to:

```ts
showToast("Message preferences saved.", { variant: "info", durationMs: 3000 });
```

(Don't claim "all preferences saved" until they all do.)

- [ ] **Step 3: Smoke**

Sign in as artist or venue. Toggle a "Coming soon" item — input is disabled, can't toggle. Toggle the message preference — saves with the truthful toast.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/artist-portal/settings/page.tsx" \
        "src/app/(pages)/venue-portal/settings/page.tsx"
git commit -m "fix(settings): toggles + success copy reflect what actually persists"
```

> **Follow-up:** When Plan C lands the rest, remove the `disabled` and update the toast back to "Notification preferences saved."

---

### Task 6: Admin application accept/reject populates `reviewed_at` and `reviewed_by` (covers G2-41)

**Assessment:** Net new. The UI reads `reviewed_at` but the PUT handler never writes it.

**Files:**
- Create: `supabase/migrations/050_artist_applications_reviewed_metadata.sql`
- Modify: `src/app/api/admin/applications/[id]/route.ts:48-51`
- Test: `src/app/api/admin/applications/[id]/route.test.ts` (extend or create)

- [ ] **Step 1: Migration**

```sql
-- 050_artist_applications_reviewed_metadata.sql
ALTER TABLE artist_applications
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users (id);

-- Backfill: any application already in a non-pending status gets `reviewed_at = updated_at`
-- if updated_at exists; reviewed_by remains null for legacy rows.
UPDATE artist_applications
   SET reviewed_at = COALESCE(updated_at, created_at)
 WHERE reviewed_at IS NULL
   AND status IN ('approved','rejected');
```

- [ ] **Step 2: Apply locally**

```bash
psql "$LOCAL_SUPABASE_DB_URL" -f supabase/migrations/050_artist_applications_reviewed_metadata.sql
```

- [ ] **Step 3: Write the failing test**

```ts
// src/app/api/admin/applications/[id]/route.test.ts
// Mirror the pattern other admin route tests use; assert that on PUT with
// body.status === "approved", the UPDATE writes reviewed_at = now() and
// reviewed_by = the calling admin's user id.
```

- [ ] **Step 4: Modify the route**

In `src/app/api/admin/applications/[id]/route.ts`, the PUT handler:

```ts
const update: Record<string, unknown> = {
  status: body.status,
  reviewed_at: new Date().toISOString(),
  reviewed_by: auth.user!.id,
};
if (typeof body.feedback === "string" && body.feedback.trim().length > 0) {
  update.reviewer_feedback = body.feedback.trim();
}

const { error } = await db
  .from("artist_applications")
  .update(update)
  .eq("id", id);
```

(Add the `reviewer_feedback` column to the migration if it doesn't already exist — check first.)

- [ ] **Step 5: Verify + commit**

```bash
npm run check && \
git add supabase/migrations/050_artist_applications_reviewed_metadata.sql \
        src/app/api/admin/applications/[id]/route.ts \
        src/app/api/admin/applications/[id]/route.test.ts && \
git commit -m "fix(admin): applications accept/reject writes reviewed_at + reviewed_by"
```

---

### Task 7: Phase 1 verification + push

- [ ] **Step 1: `npm run check`** — clean across Phase 1.
- [ ] **Step 2: `npm run build`** — clean.
- [ ] **Step 3: Push** the branch with the seven commits above and open the PR with title "Plan G2 PR-1: pre-launch correctness". PR body lists G2-14, G2-15, G2-16, G2-23, G2-28, G2-30, G2-41 as the closed items.

---

## Phase 2 — Foundations (PR-2)

These six tasks land the shared utilities + migrations the rest of Plan G2 references.

### Task 8: `src/lib/arrangement-labels.ts` — canonical loan/arrangement vocabulary (covers G2-7)

**Files:**
- Create: `src/lib/arrangement-labels.ts`
- Test: `src/lib/arrangement-labels.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/lib/arrangement-labels.test.ts
import { describe, expect, it } from "vitest";
import { ARRANGEMENT_LABEL, labelForArrangement, ARRANGEMENT_TYPES } from "./arrangement-labels";

describe("arrangement-labels", () => {
  it("exports the three canonical types", () => {
    expect(ARRANGEMENT_TYPES).toEqual(["paid_loan", "revenue_share", "purchase"]);
  });

  it("labels each type with the canonical name", () => {
    expect(ARRANGEMENT_LABEL.paid_loan).toBe("Paid loan");
    expect(ARRANGEMENT_LABEL.revenue_share).toBe("Revenue-share loan (QR-enabled)");
    expect(ARRANGEMENT_LABEL.purchase).toBe("Direct purchase");
  });

  it("labelForArrangement falls back to a sensible default", () => {
    expect(labelForArrangement("paid_loan")).toBe("Paid loan");
    expect(labelForArrangement("free_loan")).toBe("Paid loan"); // legacy alias
    expect(labelForArrangement("nonsense")).toBe("Other arrangement");
  });
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npx vitest run src/lib/arrangement-labels.test.ts`. Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/arrangement-labels.ts
//
// Single source of truth for arrangement-type labels rendered to artists,
// venues, and customers. The DB column historically used `*_free_loan`
// for what is semantically a paid loan; we accept the legacy alias so
// callers can pass raw DB values without thinking.

export const ARRANGEMENT_TYPES = ["paid_loan", "revenue_share", "purchase"] as const;
export type ArrangementType = (typeof ARRANGEMENT_TYPES)[number];

export const ARRANGEMENT_LABEL: Record<ArrangementType, string> = {
  paid_loan: "Paid loan",
  revenue_share: "Revenue-share loan (QR-enabled)",
  purchase: "Direct purchase",
};

const LEGACY_ALIASES: Record<string, ArrangementType> = {
  free_loan: "paid_loan", // see migration 045_paid_loan_naming
};

export function labelForArrangement(raw: string | null | undefined): string {
  if (!raw) return "Other arrangement";
  if (raw in ARRANGEMENT_LABEL) return ARRANGEMENT_LABEL[raw as ArrangementType];
  const aliased = LEGACY_ALIASES[raw];
  if (aliased) return ARRANGEMENT_LABEL[aliased];
  return "Other arrangement";
}
```

- [ ] **Step 4: Verify PASS**

Run: `npx vitest run src/lib/arrangement-labels.test.ts`. Expected: all pass.

- [ ] **Step 5: Sweep call sites in this commit**

Replace literal "Paid Loan" / "Display" / "Display + Rev Share" strings in:

- `src/app/(pages)/admin/applications/page.tsx:250`
- `src/app/(pages)/admin/venues/page.tsx:99`
- `src/app/(pages)/spaces-looking-for-art/page.tsx:435-438`
- `src/components/ApplicationForm.tsx:742-743`
- `src/app/(pages)/faqs/page.tsx:206`

with `labelForArrangement(...)` reading the underlying `arrangement_type` (or computed equivalent for the application form's checkbox set).

- [ ] **Step 6: Commit**

```bash
git add src/lib/arrangement-labels.ts src/lib/arrangement-labels.test.ts \
        "src/app/(pages)/admin/applications/page.tsx" \
        "src/app/(pages)/admin/venues/page.tsx" \
        "src/app/(pages)/spaces-looking-for-art/page.tsx" \
        src/components/ApplicationForm.tsx \
        "src/app/(pages)/faqs/page.tsx"
git commit -m "feat(labels): single source of truth for arrangement-type vocabulary"
```

---

### Task 9: `src/lib/postcode.ts` — country-aware postcode validation (covers G2-20)

**Files:**
- Create: `src/lib/postcode.ts`
- Test: `src/lib/postcode.test.ts`
- Modify: `src/lib/validations.ts` (use the new validator inside `shippingCheckoutSchema`)
- Modify: `src/app/(pages)/checkout/page.tsx` (inline error display)

- [ ] **Step 1: Failing test**

```ts
// src/lib/postcode.test.ts
import { describe, expect, it } from "vitest";
import { isValidPostcode } from "./postcode";

describe("isValidPostcode", () => {
  it("accepts valid UK postcodes (with and without space)", () => {
    expect(isValidPostcode("SW1A 1AA", "GB")).toBe(true);
    expect(isValidPostcode("sw1a1aa", "GB")).toBe(true);
    expect(isValidPostcode("EC1V 9AA", "GB")).toBe(true);
  });

  it("rejects 'ab' or phone numbers in GB", () => {
    expect(isValidPostcode("ab", "GB")).toBe(false);
    expect(isValidPostcode("0207 123 4567", "GB")).toBe(false);
    expect(isValidPostcode("9999999999999999999", "GB")).toBe(false);
  });

  it("accepts US ZIP and ZIP+4", () => {
    expect(isValidPostcode("94110", "US")).toBe(true);
    expect(isValidPostcode("94110-1234", "US")).toBe(true);
    expect(isValidPostcode("xyz", "US")).toBe(false);
  });

  it("falls back to non-empty 1–20 char rule for unsupported countries", () => {
    expect(isValidPostcode("123 ABC", "FR")).toBe(true);
    expect(isValidPostcode("", "FR")).toBe(false);
  });
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npx vitest run src/lib/postcode.test.ts`. Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/postcode.ts
//
// Country-aware postcode validation for checkout and address forms.
// Coverage: GB, US, CA at strict regex; everything else gets the
// fallback 1–20 char non-empty rule (we don't pretend to know every
// country's format).

const PATTERNS: Record<string, RegExp> = {
  GB: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,
  US: /^\d{5}(-\d{4})?$/,
  CA: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,
};

export function isValidPostcode(value: string, country: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 20) return false;
  const pattern = PATTERNS[country.toUpperCase()];
  if (pattern) return pattern.test(trimmed);
  return true; // unsupported country — accept any non-empty 1-20
}
```

- [ ] **Step 4: Use inside the checkout schema**

In `src/lib/validations.ts`, augment `shippingCheckoutSchema` with a `superRefine` that calls `isValidPostcode(postcode, country)`:

```ts
import { isValidPostcode } from "./postcode";

const shippingCheckoutSchema = z
  .object({ /* ...as Task 1... */ })
  .superRefine((data, ctx) => {
    if (data.fulfilmentMethod === "shipping" && !isValidPostcode(data.postcode!, data.country!)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["postcode"],
        message: "Postcode doesn't match the expected format for this country.",
      });
    }
  });
```

- [ ] **Step 5: Inline error on the checkout page**

In the checkout form's `onChange` for the postcode field, debounce-validate against the country and surface a small red helper line below the input on invalid.

- [ ] **Step 6: Verify + commit**

```bash
npm run check && \
git add src/lib/postcode.ts src/lib/postcode.test.ts \
        src/lib/validations.ts \
        "src/app/(pages)/checkout/page.tsx" && \
git commit -m "feat(checkout): country-aware postcode validation with inline error"
```

---

### Task 10: `src/lib/use-url-state.ts` — keep React state in sync with `?param=` (covers G2-12, G2-19, G2-49)

**Files:**
- Create: `src/lib/use-url-state.ts`
- Test: `src/lib/use-url-state.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// src/lib/use-url-state.test.tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUrlState } from "./use-url-state";

// Mock next/navigation router
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""),
}));

describe("useUrlState", () => {
  it("hydrates state from the initial URL", () => {
    window.history.replaceState({}, "", "/?tab=artists");
    const { result } = renderHook(() => useUrlState("tab", "works"));
    expect(result.current[0]).toBe("artists");
  });

  it("falls back to defaultValue when param absent", () => {
    window.history.replaceState({}, "", "/");
    const { result } = renderHook(() => useUrlState("tab", "works"));
    expect(result.current[0]).toBe("works");
  });

  it("setting a value updates the URL via router.replace", () => {
    // Implementation detail — assert via the spied router stub
  });
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npx vitest run src/lib/use-url-state.test.tsx`. Expected: module not found.

- [ ] **Step 3: Implement**

```tsx
// src/lib/use-url-state.ts
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * Tiny URL-state hook. Reads `?param=` on mount; setting writes via
 * router.replace so state survives reload, share, back/forward.
 *
 * Designed for tab state, sort, single-value filters. For bulk-filter
 * objects, see useUrlFilterObject (TODO if anyone needs it).
 */
export function useUrlState<T extends string>(
  param: string,
  defaultValue: T,
): [T, (next: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = (searchParams.get(param) as T | null) ?? defaultValue;

  const set = useCallback(
    (next: T) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === defaultValue) params.delete(param);
      else params.set(param, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams, param, defaultValue],
  );

  return useMemo(() => [value, set], [value, set]);
}
```

- [ ] **Step 4: Verify PASS**

Run: `npx vitest run src/lib/use-url-state.test.tsx`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/use-url-state.ts src/lib/use-url-state.test.tsx
git commit -m "feat(util): useUrlState hook for tab/sort URL persistence"
```

---

### Task 11: `<ConfirmDialog>` shared component (covers preconditions for G2-27, G2-40)

**Files:**
- Create: `src/components/ConfirmDialog.tsx`
- Test: `src/components/ConfirmDialog.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// src/components/ConfirmDialog.test.tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import ConfirmDialog from "./ConfirmDialog";

describe("<ConfirmDialog />", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<ConfirmDialog open={false} title="t" onConfirm={() => {}} onClose={() => {}} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("calls onConfirm when the destructive button is clicked", () => {
    const onConfirm = vi.fn();
    const { getByText } = render(
      <ConfirmDialog open title="Delete this collection?" body="Permanent." confirmLabel="Delete" onConfirm={onConfirm} onClose={() => {}} />,
    );
    fireEvent.click(getByText("Delete"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("captures a reason when reasonRequired is set, and rejects empty submit", () => {
    const onConfirm = vi.fn();
    const { getByText, getByLabelText } = render(
      <ConfirmDialog open title="Reject application" reasonRequired onConfirm={onConfirm} onClose={() => {}} />,
    );
    fireEvent.click(getByText("Confirm"));
    expect(onConfirm).not.toHaveBeenCalled(); // empty reason → blocked
    fireEvent.change(getByLabelText(/reason/i), { target: { value: "Off-style for our roster." } });
    fireEvent.click(getByText("Confirm"));
    expect(onConfirm).toHaveBeenCalledWith({ reason: "Off-style for our roster." });
  });
});
```

- [ ] **Step 2: Verify FAIL**

`npx vitest run src/components/ConfirmDialog.test.tsx` → module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/ConfirmDialog.tsx
"use client";

import { useEffect, useRef, useState } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  reasonRequired?: boolean;
  onConfirm: (payload?: { reason?: string }) => void;
  onClose: () => void;
}

/**
 * Reusable confirm dialog. Replaces native confirm()/alert() calls.
 * If reasonRequired, renders a textarea and blocks submit until non-empty.
 */
export default function ConfirmDialog({
  open, title, body, confirmLabel = "Confirm", cancelLabel = "Cancel",
  destructive = false, reasonRequired = false, onConfirm, onClose,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleConfirm() {
    if (reasonRequired && reason.trim().length === 0) return;
    onConfirm(reasonRequired ? { reason: reason.trim() } : undefined);
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-title"
         className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-background rounded-sm max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 id="confirm-title" className="text-lg font-medium text-foreground">{title}</h3>
        {body && <p className="text-sm text-muted mt-2">{body}</p>}
        {reasonRequired && (
          <label className="block mt-4">
            <span className="text-xs text-muted">Reason</span>
            <textarea
              aria-label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 600))}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-sm text-sm mt-1"
            />
          </label>
        )}
        <div className="flex justify-end gap-2 mt-6">
          <button ref={cancelRef} onClick={onClose} className="text-sm px-4 py-2 border border-border rounded-sm">{cancelLabel}</button>
          <button onClick={handleConfirm}
                  className={`text-sm px-4 py-2 rounded-sm text-white ${destructive ? "bg-red-600 hover:bg-red-700" : "bg-accent hover:bg-accent-hover"}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify PASS**

`npx vitest run src/components/ConfirmDialog.test.tsx` → 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ConfirmDialog.tsx src/components/ConfirmDialog.test.tsx
git commit -m "feat(ui): ConfirmDialog component (replaces native confirm/alert)"
```

---

### Task 12: `orders.order_number` short-id migration (covers G2-24)

**Files:**
- Create: `supabase/migrations/051_orders_order_number.sql`

- [ ] **Step 1: Migration**

```sql
-- 051_orders_order_number.sql
-- Add a human-friendly short id for orders (rendered as "WP-XXXXXX").
-- The full UUID stays the primary key; order_number is for display only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_number text UNIQUE;

CREATE OR REPLACE FUNCTION orders_set_order_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'WP-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_order_number ON orders;
CREATE TRIGGER orders_set_order_number BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_set_order_number();

-- Backfill existing rows
UPDATE orders SET order_number = 'WP-' || upper(substring(replace(id::text, '-', '') from 1 for 6))
 WHERE order_number IS NULL;
```

- [ ] **Step 2: Apply locally**

```bash
psql "$LOCAL_SUPABASE_DB_URL" -f supabase/migrations/051_orders_order_number.sql
```

- [ ] **Step 3: Smoke**

```sql
SELECT id, order_number FROM orders LIMIT 5;
INSERT INTO orders (...) VALUES (...) RETURNING order_number;
-- second result should look like 'WP-A4F2B9'
```

- [ ] **Step 4: Update the orders API to select `order_number`**

```bash
grep -rn "from('orders')\|from(\"orders\")" src/app/api | head
```

In each route that selects `orders`, add `order_number` to the select list.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/051_orders_order_number.sql src/app/api
git commit -m "feat(orders): order_number short id (WP-XXXXXX) for display"
```

---

### Task 13: Phase 2 verification

- [ ] **Step 1: `npm run check`** clean across the foundations.
- [ ] **Step 2: Push** "Plan G2 PR-2: foundations" with the seven commits from Tasks 8–12.

---

## Phase 3 — Cross-page IA & copy (PR-3)

**Note:** Tasks 14–23 should land together as a copy-and-IA review PR. Several need product owner sign-off on copy choices (G2-2 trial wording, G2-7 final canonical labels — already locked in Task 8).

### Task 14: /pricing tells venues it's free for them (covers G2-1)

**Files:**
- Modify: `src/app/(pages)/pricing/page.tsx` (top of page)

- [ ] **Step 1: Add a banner above the artist tiers**

Just below the H1, insert:

```tsx
<aside className="mb-8 border border-border rounded-sm p-4 bg-warm-50">
  <p className="text-sm text-foreground">
    <strong>Are you a venue?</strong> Browsing and enquiring is free. See{" "}
    <Link href="/venues" className="underline">how it works for venues</Link> or{" "}
    <Link href="/curated" className="underline">explore Curated</Link> for managed selection from £49.
  </p>
</aside>
```

- [ ] **Step 2: Smoke + commit**

```bash
git add "src/app/(pages)/pricing/page.tsx"
git commit -m "fix(pricing): top-of-page banner clarifies venues are free"
```

---

### Task 15: Standardise on "First month free" site-wide (covers G2-2)

**Files:**
- Modify: `src/app/(pages)/pricing/page.tsx:139, 316`
- Modify: `src/app/(pages)/apply/page.tsx:49-53`

- [ ] **Step 1: Find every occurrence**

```bash
grep -rn "30-Day Free Trial\|30 Day Free Trial" src/
```

- [ ] **Step 2: Replace each with "First month free" (or "Apply now — first month free if accepted")**

For CTAs that say "Start Your 30-Day Free Trial" → "Apply to join — first month free".

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/pricing/page.tsx" "src/app/(pages)/apply/page.tsx"
git commit -m "fix(copy): unify 'first month free' wording (drops misleading 30-day trial)"
```

---

### Task 16: /apply CTA copy reflects the curation gate (covers G2-3)

**Files:**
- Modify: `src/app/(pages)/pricing/page.tsx:139, 316` (CTA text)
- Modify: `src/app/(pages)/artists/page.tsx` (any "free trial" CTA)

- [ ] **Step 1: Replace CTA labels**

`Start Your 30-Day Free Trial` → `Apply to join — first month free if accepted`. The expectation that the user joins a curation queue is now explicit.

- [ ] **Step 2: Add a clarifying note next to each CTA**

```tsx
<p className="text-[11px] text-muted mt-2">
  Applications reviewed within 5 business days.
</p>
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/pricing/page.tsx" "src/app/(pages)/artists/page.tsx"
git commit -m "fix(copy): apply CTAs name the curation gate honestly"
```

---

### Task 17: /how-it-works has actual content (covers G2-4)

**Files:**
- Modify: `src/app/(pages)/how-it-works/page.tsx` — currently a router; rewrite to show in-page tabbed content (no navigation away).

- [ ] **Step 1: Add a third audience: Buyer**

Pick a tab triple: Venue / Artist / Buyer.

- [ ] **Step 2: Render in-page tabs (no full-page nav)**

```tsx
"use client";
import { useState } from "react";

type Audience = "venue" | "artist" | "buyer";

export default function HowItWorksPage() {
  const [audience, setAudience] = useState<Audience>("venue");
  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-medium mb-6">How Wallplace works</h1>
      <div role="tablist" className="flex gap-2 mb-8 border-b border-border">
        {(["venue", "artist", "buyer"] as const).map((a) => (
          <button
            key={a}
            role="tab"
            aria-selected={audience === a}
            onClick={() => setAudience(a)}
            className={`px-4 py-2 text-sm capitalize border-b-2 ${audience === a ? "border-accent text-foreground" : "border-transparent text-muted"}`}
          >
            For {a}s
          </button>
        ))}
      </div>
      {audience === "venue" && <VenueExplainer />}
      {audience === "artist" && <ArtistExplainer />}
      {audience === "buyer" && <BuyerExplainer />}
    </main>
  );
}
```

Each `<XExplainer>` is a small inline component with the canonical 3-step explanation already on the homepage (Browse / Enquire / Arrange for venue; Apply / Get Accepted / Display for artist; Discover / Buy / Receive for buyer).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/how-it-works/page.tsx"
git commit -m "feat(how-it-works): in-page tabs replace dead segment-router; buyer path added"
```

---

### Task 18: Consolidate signup routes (covers G2-5)

**Files:**
- Modify: `src/app/(pages)/apply/page.tsx` (redirect → /signup/artist)
- Modify: `src/app/(pages)/register-venue/page.tsx` (redirect → /signup/venue)
- Create: `src/app/(pages)/signup/venue/page.tsx` (mirror of `/register-venue` content)

- [ ] **Step 1: Move /register-venue content into /signup/venue**

Copy the entire body of `register-venue/page.tsx` into a new `signup/venue/page.tsx`. Verify it works at the new URL.

- [ ] **Step 2: Replace `/register-venue` with a permanent redirect**

```tsx
// src/app/(pages)/register-venue/page.tsx
import { redirect } from "next/navigation";
export default function RegisterVenueRedirect() {
  redirect("/signup/venue");
}
```

- [ ] **Step 3: Replace `/apply` with a redirect that preserves auth state**

Plan G2 keeps `/apply`'s actual functionality at `/signup/artist?next=apply` but also keeps `/apply` as a stable URL for marketing CTAs:

```tsx
// src/app/(pages)/apply/page.tsx — top of file
// Keep the existing logic but ensure all internal links use /signup/artist directly.
```

- [ ] **Step 4: Update every internal link**

```bash
grep -rn 'href="/register-venue"' src/
```

Replace each with `/signup/venue`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(pages)/apply/page.tsx" \
        "src/app/(pages)/register-venue/page.tsx" \
        "src/app/(pages)/signup/venue/page.tsx" \
        # all files updated by the grep sweep
git commit -m "feat(signup): unify routes — /signup/{artist,customer,venue}; legacy paths redirect"
```

---

### Task 19: /faqs splits by audience (covers G2-6)

**Files:**
- Modify: `src/app/(pages)/faqs/page.tsx`

- [ ] **Step 1: Add an audience filter**

Mirror Task 17's tab pattern at the top of the FAQ list. Tag every FAQ with one of `artist | venue | buyer | all` and render only matching items.

- [ ] **Step 2: Default to `all` so the page never appears empty**

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/faqs/page.tsx"
git commit -m "feat(faqs): audience filter (artist/venue/buyer/all)"
```

---

### Task 20: /curated tier deep-dive matches the landing (covers G2-8)

**Files:**
- Modify: `src/app/(pages)/curated/[tier]/page.tsx`
- Modify: `src/app/(pages)/curated/CuratedClient.tsx` — add "Learn more" link per tier card

- [ ] **Step 1: Read both files**

```bash
sed -n '1,100p' "src/app/(pages)/curated/[tier]/page.tsx"
sed -n '1,100p' "src/app/(pages)/curated/CuratedClient.tsx"
```

- [ ] **Step 2: Decide on canonical tier set**

Use the landing page's set: `single_wall £49`, `full_space £149`, `bespoke from £299`, `managed_monthly £79.99`, `managed_quarterly £199.99`. Drop the `shortlist`/`multi_wall` keys from `[tier]`.

- [ ] **Step 3: Rewrite [tier]/page.tsx to use the same data**

Lift the tier list into a shared `src/lib/curated-tiers.ts` so both files import it.

- [ ] **Step 4: Add "Learn more" links**

Each tier card on the landing page gets `<Link href={`/curated/${tier.id}`}>Learn more</Link>`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(pages)/curated/[tier]/page.tsx" \
        "src/app/(pages)/curated/CuratedClient.tsx" \
        src/lib/curated-tiers.ts
git commit -m "fix(curated): tier deep-dive aligned to landing; Learn more links wired"
```

---

### Task 21: Per-page metadata + og-image (covers G2-9)

**Files:**
- Add: `public/og-image.png` (asset — 1200×630)
- Modify: `src/app/layout.tsx:37-49`
- Modify: `src/app/(pages)/{signup/artist,signup/customer,apply,how-it-works,browse,orders/track,register-venue,spaces-looking-for-art,forgot-password,reset-password}/page.tsx` — add per-route `metadata` exports.

- [ ] **Step 1: Generate or commit a brand og-image**

```bash
# 1200x630 PNG; place at public/og-image.png
```

(If asset isn't ready, ship the metadata code referencing `/og-image.png` and add a TODO chip.)

- [ ] **Step 2: Wire root openGraph**

```tsx
// src/app/layout.tsx (top of metadata)
export const metadata = {
  title: "Wallplace – Curated Art for Commercial Spaces",
  description: "...",
  openGraph: {
    title: "Wallplace",
    description: "...",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
};
```

- [ ] **Step 3: Per-page metadata**

For each of the listed pages, add at the top of the file:

```tsx
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Sign up as an artist – Wallplace",
  description: "Apply to join Wallplace's curated artist roster…",
};
```

(Adjust title/description per page.)

- [ ] **Step 4: Commit**

```bash
git add public/og-image.png src/app/layout.tsx \
        $(grep -rln "metadata: Metadata" "src/app/(pages)" | tr '\n' ' ')
git commit -m "feat(seo): per-page metadata + brand og-image"
```

---

### Task 22: Fix /artists H1 missing space (covers G2-10)

**Files:**
- Modify: `src/app/(pages)/artists/page.tsx`

- [ ] **Step 1: Find the H1**

```bash
grep -n "Display, discover" "src/app/(pages)/artists/page.tsx"
```

- [ ] **Step 2: Replace with a clean two-line H1**

```tsx
<h1>
  Display, discover, sell.
  <br />
  All in one place.
</h1>
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/artists/page.tsx"
git commit -m "fix(artists): H1 line break renders with space between sentences"
```

---

### Task 23: Phase 3 verification

- [ ] `npm run check` clean across Phase 3.
- [ ] Push "Plan G2 PR-3: IA + copy" with Tasks 14–22's commits.

---

## Phase 4 — Customer-portal & checkout (PR-4)

### Task 24: SavedContext awaits and rolls back on failure (covers G2-11)

**Files:**
- Modify: `src/context/SavedContext.tsx:99-114`
- Test: `src/context/SavedContext.test.tsx` (extend or create)

- [ ] **Step 1: Failing test**

Mock `authFetch` to reject; assert state reverts and an error toast fires.

- [ ] **Step 2: Modify `toggleSaved`**

```tsx
async function toggleSaved(item: SavedItem) {
  const was = saved.has(item.id);
  setSaved((prev) => {
    const next = new Set(prev);
    if (was) next.delete(item.id); else next.add(item.id);
    return next;
  });
  try {
    const res = await authFetch(`/api/saved/${item.itemType}/${item.id}`, {
      method: was ? "DELETE" : "POST",
    });
    if (!res.ok) throw new Error("save_failed");
  } catch {
    // Revert and tell the user
    setSaved((prev) => {
      const next = new Set(prev);
      if (was) next.add(item.id); else next.delete(item.id);
      return next;
    });
    showToast("Couldn't save — please try again.", { variant: "error" });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/context/SavedContext.tsx src/context/SavedContext.test.tsx
git commit -m "fix(saved): await persistence; revert + toast on failure"
```

---

### Task 25: Customer-portal saved tab in URL (covers G2-12)

**Files:**
- Modify: `src/app/(pages)/customer-portal/saved/page.tsx:52`

- [ ] **Step 1: Replace `useState` with `useUrlState`**

```tsx
import { useUrlState } from "@/lib/use-url-state";
type ItemType = "work" | "artist" | "collection";
const [activeTab, setActiveTab] = useUrlState<ItemType>("tab", "work");
```

- [ ] **Step 2: Smoke**

Visit `/customer-portal/saved?tab=collections`. Tab is preselected. Refresh — same tab. Switch tabs — URL updates.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/customer-portal/saved/page.tsx"
git commit -m "fix(customer): saved tab survives refresh + share via URL"
```

---

### Task 26: CustomerPortalLayout has the same role+verification gate (covers G2-13)

**Files:**
- Modify: `src/components/PortalGuard.tsx:12` (widen union to include `"customer"`)
- Modify: `src/components/CustomerPortalLayout.tsx:18-26` (wrap children in `<PortalGuard allowedType="customer">`)

- [ ] **Step 1: Widen the type**

```tsx
// PortalGuard.tsx
type AllowedType = "artist" | "venue" | "admin" | "customer";
```

Plus update the role-redirect mapping to include the customer portal path.

- [ ] **Step 2: Wrap CustomerPortalLayout**

```tsx
import PortalGuard from "@/components/PortalGuard";

export default function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGuard allowedType="customer">
      <div className="...existing layout...">{children}</div>
    </PortalGuard>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/PortalGuard.tsx src/components/CustomerPortalLayout.tsx
git commit -m "fix(customer): PortalGuard now covers customer portal (role + email-verify)"
```

---

### Task 27: Order detail shows Subtotal / Shipping / Tax / Total + currency (covers G2-17)

**Files:**
- Modify: `src/app/(pages)/customer-portal/page.tsx:155-173`
- Modify: `src/lib/format-currency.ts` (create if missing)

- [ ] **Step 1: Helper**

```ts
// src/lib/format-currency.ts
export function formatCurrency(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}
```

- [ ] **Step 2: Render the breakdown**

```tsx
{order.subtotal != null && (
  <li className="flex justify-between text-sm">
    <span>Subtotal</span>
    <span>{formatCurrency(order.subtotal, order.currency)}</span>
  </li>
)}
{order.shipping_total != null && (
  <li className="flex justify-between text-sm">
    <span>Shipping</span>
    <span>{order.shipping_total > 0 ? formatCurrency(order.shipping_total, order.currency) : "Included"}</span>
  </li>
)}
{order.tax_total != null && order.tax_total > 0 && (
  <li className="flex justify-between text-sm">
    <span>VAT</span>
    <span>{formatCurrency(order.tax_total, order.currency)}</span>
  </li>
)}
<li className="flex justify-between text-base font-medium border-t border-border pt-2 mt-2">
  <span>Total</span>
  <span>{formatCurrency(order.total, order.currency)}</span>
</li>
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/customer-portal/page.tsx" src/lib/format-currency.ts
git commit -m "fix(orders): customer detail shows subtotal/shipping/VAT/total with currency"
```

---

### Task 28: Refund eligibility uses the canonical state machine + 14-day cap (covers G2-18)

**Files:**
- Modify: `src/app/(pages)/customer-portal/page.tsx:179`
- Modify: `src/lib/order-status-labels.ts` (add `isRefundEligible(order)`)

- [ ] **Step 1: Add the helper**

```ts
// src/lib/order-status-labels.ts (append)
export function isRefundEligible(order: { status: string; delivered_at?: string | null }): boolean {
  const PRE_DISPATCH = ["confirmed", "artist_notified", "awaiting_dispatch", "processing"];
  if (PRE_DISPATCH.includes(order.status)) return true;
  if (order.status === "delivered" && order.delivered_at) {
    const ms = Date.now() - new Date(order.delivered_at).getTime();
    return ms < 14 * 24 * 60 * 60 * 1000; // 14 days
  }
  return false;
}
```

- [ ] **Step 2: Wire into the customer-portal page**

```tsx
import { isRefundEligible } from "@/lib/order-status-labels";
const refundEligible = selected ? isRefundEligible(selected) : false;
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/customer-portal/page.tsx" src/lib/order-status-labels.ts
git commit -m "fix(orders): refund eligibility tracks state machine + 14-day post-delivery cap"
```

---

### Task 29: Customer order list — filters, search, deep link (covers G2-19)

**Files:**
- Modify: `src/app/(pages)/customer-portal/page.tsx:44, 308-331`

- [ ] **Step 1: Status pill filter row**

```tsx
const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" }, // not in (cancelled, refunded, disputed, delivered)
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];
const [statusFilter, setStatusFilter] = useUrlState("status", "all");
```

- [ ] **Step 2: Drive `selectedOrder` from `?order=`**

```tsx
const [selectedOrderId, setSelectedOrderId] = useUrlState<string>("order", "");
const selected = orders.find((o) => o.id === selectedOrderId) ?? null;
```

- [ ] **Step 3: Date range + search**

Use `<input type="date">` for from/to and a small search input bound to `?q=` (matches against `order_number` and work titles).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/customer-portal/page.tsx"
git commit -m "feat(customer): order list status/date/search filters + ?order= deep link"
```

---

### Task 30: Customer address book (covers G2-21)

**Files:**
- Create: `supabase/migrations/052_customer_addresses.sql`
- Create: `src/app/api/customer-addresses/route.ts`
- Create: `src/app/(pages)/customer-portal/addresses/page.tsx`
- Modify: `src/app/(pages)/checkout/page.tsx` (saved-address picker)
- Modify: `src/components/CustomerPortalLayout.tsx` (sidebar entry)

- [ ] **Step 1: Migration**

```sql
-- 052_customer_addresses.sql
CREATE TABLE IF NOT EXISTS customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  line1 text NOT NULL,
  line2 text,
  city text NOT NULL,
  postcode text NOT NULL,
  country text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_addresses_user_id_idx ON customer_addresses (user_id);

ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_addresses_owner ON customer_addresses
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 2: API CRUD**

`src/app/api/customer-addresses/route.ts` (GET list, POST create) + `src/app/api/customer-addresses/[id]/route.ts` (PATCH update, DELETE).

- [ ] **Step 3: `/customer-portal/addresses` page**

List, add, edit, set default, delete. Uses `<ConfirmDialog>` (Task 11) for delete.

- [ ] **Step 4: Saved-address picker on checkout**

If `user`, fetch addresses on mount; render a `<select>` above the address fields with "Use new address" as the last option. Selecting a saved one populates the form (read-only fields).

- [ ] **Step 5: Sidebar entry**

Add `{ label: "Addresses", href: "/customer-portal/addresses" }` to `CustomerPortalLayout`'s nav list.

- [ ] **Step 6: Commit (one task, three commits)**

```bash
git add supabase/migrations/052_customer_addresses.sql
git commit -m "feat(addresses): customer_addresses table + RLS"

git add src/app/api/customer-addresses
git commit -m "feat(addresses): customer addresses CRUD API"

git add "src/app/(pages)/customer-portal/addresses/page.tsx" \
        "src/app/(pages)/checkout/page.tsx" \
        src/components/CustomerPortalLayout.tsx
git commit -m "feat(addresses): /customer-portal/addresses + saved-address picker on checkout"
```

---

### Task 31: Phase 4 verification

- [ ] `npm run check` clean.
- [ ] Push "Plan G2 PR-4: customer + checkout" with Tasks 24–30's commits.

---

## Phase 5 — Artist-portal (PR-5 — combine with Phase 6)

### Task 32: Artist-portal alert() → toast (covers G2-22, artist call sites)

**Files:**
- Modify: `src/app/(pages)/artist-portal/billing/page.tsx:181, 185, 201, 205, 218, 222, 235, 239`
- Modify: `src/app/(pages)/artist-portal/profile/page.tsx:678, 683`
- Modify: `src/app/(pages)/artist-portal/placements/page.tsx:598, 627, 635, 652, 662`
- Modify: `src/app/(pages)/artist-portal/showroom/[id]/page.tsx:167`

- [ ] **Step 1: Add the import + hook to each file**

```tsx
import { useToast } from "@/context/ToastContext";
// inside component:
const { showToast } = useToast();
```

- [ ] **Step 2: Replace each alert call**

```tsx
// before:
alert("Could not save changes");
// after:
showToast("Could not save changes", { variant: "error" });
```

For success-path alerts (rare), use `variant: "info"`.

- [ ] **Step 3: Commit (one per file is fine, or batched)**

```bash
git add "src/app/(pages)/artist-portal/"
git commit -m "fix(artist): replace alert() with showToast across portal"
```

---

### Task 33: Order ID short id rendered (covers G2-24)

**Files:**
- Modify: `src/app/(pages)/artist-portal/orders/page.tsx:200, 441`
- Modify: `src/app/(pages)/customer-portal/page.tsx` (use order_number wherever id is shown)

- [ ] **Step 1: Replace `{order.id}` with `{order.order_number}`**

(`order_number` was added in Task 12.)

- [ ] **Step 2: Update API responses**

If any API route returns orders without `order_number`, add it.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/artist-portal/orders/page.tsx" \
        "src/app/(pages)/customer-portal/page.tsx"
git commit -m "fix(orders): show order_number (WP-XXXXXX) instead of UUID"
```

---

### Task 34: Artwork-request detail shows venue name (covers G2-25)

**Files:**
- Modify: `src/app/api/artwork-requests/[id]/route.ts` (join venue_profiles.name)
- Modify: `src/app/(pages)/artist-portal/artwork-requests/[id]/page.tsx:143`
- Modify: `src/app/(pages)/artist-portal/artwork-requests/page.tsx:67`

Mirror Plan G Task 3's pattern.

- [ ] **Step 1: Server-side join**

```ts
const { data } = await db
  .from("artwork_requests")
  .select(`*, venue_profile:venue_profiles!venue_user_id ( name, slug )`)
  .eq("id", id)
  .single();
```

- [ ] **Step 2: Client-side render**

```tsx
<p>From: {req.venue_profile?.name ?? req.venue_slug ?? "Venue"}</p>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/artwork-requests/\[id\]/route.ts \
        "src/app/(pages)/artist-portal/artwork-requests/[id]/page.tsx" \
        "src/app/(pages)/artist-portal/artwork-requests/page.tsx"
git commit -m "fix(artwork-requests): detail page renders venue name"
```

---

### Task 35: Profile Save Changes has saving state (covers G2-26)

**Files:**
- Modify: `src/app/(pages)/artist-portal/profile/page.tsx:709-714`

- [ ] **Step 1: Wire `saving` state**

```tsx
const [saving, setSaving] = useState(false);

async function handleSave() {
  setSaving(true);
  try {
    await authFetch(...);
    showToast("Profile saved", { variant: "info" });
  } finally {
    setSaving(false);
  }
}

// JSX:
<button type="submit" disabled={saving} className={`...${saving ? "opacity-60 cursor-not-allowed" : ""}`}>
  {saving ? "Saving…" : "Save Changes"}
</button>
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(pages)/artist-portal/profile/page.tsx"
git commit -m "fix(artist-profile): Save Changes shows saving state, blocks double-submit"
```

---

### Task 36: Collection delete uses ConfirmDialog (covers G2-27)

**Files:**
- Modify: `src/app/(pages)/artist-portal/collections/page.tsx:150-167`

- [ ] **Step 1: Wrap `handleDelete` with `<ConfirmDialog>`**

(Use the component from Task 11.) State variable `pendingDeleteId`; on confirm, run the existing delete; on cancel, clear the id.

- [ ] **Step 2: Commit**

```bash
git add "src/app/(pages)/artist-portal/collections/page.tsx"
git commit -m "fix(collections): collection delete prompts ConfirmDialog"
```

---

### Task 37: PortalGuard differentiates `past_due` / `canceled` / `none` (covers G2-29)

**Files:**
- Modify: `src/components/PortalGuard.tsx:80-83, 116-144`

- [ ] **Step 1: Branch the gate copy by `subscription_status`**

```tsx
const status = profile?.subscription_status;
const gateContent = (() => {
  switch (status) {
    case "past_due": return {
      headline: "Update your payment method",
      body: "Your last payment failed. Update your card to keep using the artist portal.",
      cta: { label: "Update payment", href: "/artist-portal/billing" },
    };
    case "canceled": return {
      headline: "Resubscribe to access your portal",
      body: "Your subscription is cancelled. Resubscribe to continue.",
      cta: { label: "Choose Your Plan", href: "/artist-portal/billing" },
    };
    default: return {
      headline: "Choose Your Plan",
      body: "Pick a plan to start using the artist portal.",
      cta: { label: "Choose Your Plan", href: "/artist-portal/billing" },
    };
  }
})();
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PortalGuard.tsx
git commit -m "fix(auth): subscription gate copy differentiates past_due/canceled/none"
```

---

## Phase 6 — Venue-portal (PR-5 cont.)

### Task 38: Venue-portal alert() / confirm() → toast / ConfirmDialog (covers G2-22 venue, G2-40)

**Files:**
- Modify: `src/app/(pages)/venue-portal/placements/page.tsx:719, 736, 765, 775, 794, 804, 1386, 1394`

- [ ] **Step 1: Replace native `confirm()` with `<ConfirmDialog>`**

State pattern: a single `pendingAction: { type: 'cancel'|'archive'|'bulk_archive'; payload: ... } | null`.

- [ ] **Step 2: Replace `alert()` with `showToast`**

Per Task 32's pattern.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/venue-portal/placements/page.tsx"
git commit -m "fix(venue): replace native confirm/alert with ConfirmDialog/Toast"
```

---

### Task 39: Wall editor undo/redo + keyboard (covers G2-31)

**Files:**
- Modify: `src/components/visualizer/WallVisualizer.tsx`
- Modify: `src/components/visualizer/WallCanvas.tsx`

- [ ] **Step 1: Wrap items state with an undo stack**

```tsx
type Snapshot = WallItem[];
const [past, setPast] = useState<Snapshot[]>([]);
const [items, setItemsRaw] = useState<WallItem[]>(initial);
const [future, setFuture] = useState<Snapshot[]>([]);

function setItems(next: WallItem[] | ((prev: WallItem[]) => WallItem[])) {
  setPast((p) => [...p.slice(-30), items]);
  setItemsRaw(next);
  setFuture([]);
}

function undo() {
  if (past.length === 0) return;
  setFuture((f) => [items, ...f].slice(0, 30));
  setItemsRaw(past[past.length - 1]);
  setPast((p) => p.slice(0, -1));
}

function redo() { /* mirror */ }
```

- [ ] **Step 2: Keyboard listener**

```tsx
useEffect(() => {
  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); redo(); }
    if ((e.key === "Backspace" || e.key === "Delete") && selectedId) { e.preventDefault(); deleteItem(selectedId); }
    if (e.key.startsWith("Arrow") && selectedId) { e.preventDefault(); nudge(selectedId, e.key); }
  }
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [selectedId, items]);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/visualizer
git commit -m "feat(walls): undo/redo + Backspace/Delete + arrow-key nudge in editor"
```

---

### Task 40: Wall editor accepts HEIC (covers G2-32)

**Files:**
- Modify: `src/app/(pages)/venue-portal/walls/new/page.tsx:444, 101-105`
- Add dep: `heic2any`

- [ ] **Step 1: Add the dep**

```bash
npm install heic2any
```

- [ ] **Step 2: Widen the accept attribute**

```tsx
accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
```

- [ ] **Step 3: Decode HEIC client-side before resize**

```tsx
import heic2any from "heic2any";

async function normaliseImage(file: File): Promise<File> {
  if (/heic|heif/i.test(file.type) || /\.heic$|\.heif$/i.test(file.name)) {
    const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    return new File([blob as Blob], file.name.replace(/\.heic$|\.heif$/i, ".jpg"), { type: "image/jpeg" });
  }
  return file;
}
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/venue-portal/walls/new/page.tsx" package.json package-lock.json
git commit -m "feat(walls): accept HEIC photos (iPhone) via client-side decode"
```

---

### Task 41: Stripe Connect return toast (covers G2-33)

**Files:**
- Modify: `src/app/(pages)/venue-portal/settings/page.tsx`

- [ ] **Step 1: On mount, read `?stripe_connect=`**

```tsx
useEffect(() => {
  const sp = new URLSearchParams(window.location.search);
  const v = sp.get("stripe_connect");
  if (v === "complete") showToast("Payouts setup complete.", { variant: "info" });
  else if (v === "refresh") showToast("Setup paused — pick up where you left off.", { variant: "warn" });
  if (v) router.replace("/venue-portal/settings");
}, []);
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(pages)/venue-portal/settings/page.tsx"
git commit -m "fix(venue-settings): toast on Stripe Connect return; clears query"
```

---

### Task 42: Labels page can include sold/completed placements (covers G2-34)

**Files:**
- Modify: `src/app/(pages)/venue-portal/labels/page.tsx:80`

- [ ] **Step 1: Add an "Include sold/completed" toggle**

```tsx
const [includeArchived, setIncludeArchived] = useUrlState("include", "no");
const filtered = all.filter((p) => includeArchived === "yes" ? p.status !== "archived" : p.status === "active");
```

- [ ] **Step 2: Surface a status badge per row**

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/venue-portal/labels/page.tsx"
git commit -m "fix(labels): toggle to include sold/completed placements"
```

---

### Task 43: Venue can withdraw pending requests (covers G2-35)

**Files:**
- Modify: `src/app/(pages)/venue-portal/placements/page.tsx:1384-1392, 783-806`
- Modify: `src/app/api/placements/[id]/route.ts` (DELETE branch — verify behaviour)

- [ ] **Step 1: Conditional button label/behaviour**

```tsx
const isRequester = placement.requester_user_id === user?.id;
const isPending = placement.status === "pending";
{isPending && isRequester ? (
  <button onClick={() => withdraw(placement.id)}>Withdraw</button>
) : (
  <button onClick={() => cancel(placement.id)}>Cancel</button>
)}
```

`withdraw()` calls DELETE; `cancel()` keeps the existing PATCH-to-cancelled.

- [ ] **Step 2: Commit**

```bash
git add "src/app/(pages)/venue-portal/placements/page.tsx" \
        src/app/api/placements/\[id\]/route.ts
git commit -m "feat(placements): venue can Withdraw a pending request (vs Cancel)"
```

---

### Task 44: Wall public toggle has save indicator (covers G2-36)

**Files:**
- Modify: `src/app/(pages)/venue-portal/walls/[id]/page.tsx:269-334`

- [ ] **Step 1: Add toast on success/failure**

```tsx
async function togglePublic(next: boolean) {
  const was = wall.is_public;
  setWall({ ...wall, is_public: next });
  try {
    const res = await authFetch(`/api/walls/${wall.id}`, { method: "PATCH", body: JSON.stringify({ is_public: next }) });
    if (!res.ok) throw new Error();
    showToast(next ? "Wall is now public" : "Wall is now private", { variant: "info" });
  } catch {
    setWall({ ...wall, is_public: was });
    showToast("Couldn't update — try again.", { variant: "error" });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(pages)/venue-portal/walls/[id]/page.tsx"
git commit -m "fix(walls): public-profile toggle confirms with toast; reverts on failure"
```

---

### Task 45: Venue Profile per-section Cancel reverts edits (covers G2-37)

**Files:**
- Modify: `src/app/(pages)/venue-portal/profile/page.tsx:411-419`

- [ ] **Step 1: Snapshot on Edit-enter, restore on Cancel**

```tsx
const [snapshot, setSnapshot] = useState<typeof formState | null>(null);

function startEdit() {
  setSnapshot(structuredClone(formState));
  setEditing(true);
}

function cancelEdit() {
  if (snapshot) setFormState(snapshot);
  setSnapshot(null);
  setEditing(false);
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(pages)/venue-portal/profile/page.tsx"
git commit -m "fix(venue-profile): per-section Cancel restores pre-edit state"
```

---

### Task 46: Hide Payouts block until needed; controlled Account Details fields (covers G2-30 cont, G2-38)

**Files:**
- Modify: `src/app/(pages)/venue-portal/settings/page.tsx:171-180, 197-203, 280-332`
- Modify: `src/app/(pages)/venue-portal/page.tsx:137`

- [ ] **Step 1: Make Account Details controlled**

Either remove the duplicate inputs (link to `/venue-portal/profile`) OR convert to controlled with a real PUT to `/api/venue-profile`.

Recommended: remove and replace with a "Edit details on your venue profile →" link.

- [ ] **Step 2: Conditionally render Payouts block**

```tsx
const needsPayouts = (placements ?? []).some((p) =>
  p.arrangement_type === "paid_loan" || (p.arrangement_type === "revenue_share" && p.qr_enabled)
);

{needsPayouts ? <PayoutsBlock /> : <p className="text-xs text-muted">Set up payouts when you accept your first paid loan or revenue share.</p>}
```

- [ ] **Step 3: Match dashboard onboarding**

Same conditional in `venue-portal/page.tsx:137`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/venue-portal/settings/page.tsx" \
        "src/app/(pages)/venue-portal/page.tsx"
git commit -m "fix(venue): payouts surfaced only when needed; settings inputs no longer dead"
```

---

## Phase 7 — Admin (PR-6)

### Task 47: Admin app actions get ConfirmDialog + reason capture + audit log (covers G2-40, G2-41 follow-on)

**Files:**
- Create: `supabase/migrations/053_admin_actions.sql`
- Modify: `src/app/(pages)/admin/applications/page.tsx:73-94`
- Modify: `src/app/api/admin/applications/[id]/route.ts:48-51, 68`

- [ ] **Step 1: Migration**

```sql
-- 053_admin_actions.sql
CREATE TABLE IF NOT EXISTS admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users (id),
  action text NOT NULL,             -- e.g. 'application_approve'
  target_table text NOT NULL,       -- e.g. 'artist_applications'
  target_id uuid NOT NULL,
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_actions_target_idx ON admin_actions (target_table, target_id);
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
-- RLS policy: admins only (service role bypasses; client never reads)
```

- [ ] **Step 2: Replace native confirm/alert with ConfirmDialog**

Approve: `<ConfirmDialog>` with optional reason. Reject: `<ConfirmDialog reasonRequired>` capturing `feedback`.

- [ ] **Step 3: Server inserts admin_actions row**

In the PUT handler, after the application UPDATE succeeds, INSERT into `admin_actions`:

```ts
await db.from("admin_actions").insert({
  admin_user_id: auth.user!.id,
  action: `application_${body.status}`,
  target_table: "artist_applications",
  target_id: id,
  reason: body.feedback ?? null,
});
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/053_admin_actions.sql \
        "src/app/(pages)/admin/applications/page.tsx" \
        src/app/api/admin/applications/\[id\]/route.ts
git commit -m "feat(admin): application accept/reject uses ConfirmDialog + writes audit log"
```

---

### Task 48: Admin user management surface (covers G2-42)

**Files:**
- Create: `src/app/(pages)/admin/users/page.tsx`
- Create: `src/app/api/admin/users/route.ts`
- Modify: `src/components/AdminPortalLayout.tsx:8-15`

- [ ] **Step 1: GET /api/admin/users**

Read-only initial scope. Returns paginated list with `email`, `name`, `role`, `created_at`, `email_confirmed_at`, `subscription_status`. Search by `?q=`.

- [ ] **Step 2: Page**

Table with columns + search + pagination. Action buttons (initial scope): "Send password reset" (calls `db.auth.admin.generateLink`), "Force sign out" (revokes refresh tokens).

- [ ] **Step 3: Sidebar entry**

```tsx
{ label: "Users", href: "/admin/users" },
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/users src/components/AdminPortalLayout.tsx \
        "src/app/(pages)/admin/users/page.tsx"
git commit -m "feat(admin): /admin/users management surface (search, reset, force-logout)"
```

---

### Task 49: Admin disputes / payouts / moderation queues + complaint form on /complaints (covers G2-43)

**Files:**
- Create: `supabase/migrations/054_complaints.sql`
- Create: `src/app/api/complaints/route.ts`
- Modify: `src/app/(pages)/complaints/page.tsx` (add form alongside the policy)
- Create: `src/app/(pages)/admin/complaints/page.tsx`
- Create: `src/app/(pages)/admin/payouts/page.tsx`
- Create: `src/app/(pages)/admin/moderation/page.tsx`
- Modify: `src/components/AdminPortalLayout.tsx`

- [ ] **Step 1: Complaints table**

```sql
CREATE TABLE IF NOT EXISTS complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  role text,           -- artist | venue | buyer | other
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'new', -- new | acknowledged | resolved
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
-- public can INSERT (no SELECT); admin reads via service role
```

- [ ] **Step 2: POST /api/complaints**

Rate limited (existing `checkRateLimit`). Inserts the row, sends a notification email to ops via the existing email pipeline.

- [ ] **Step 3: Public form on /complaints**

Below the policy text, a styled form: name (optional), email, role (select), subject, body. On submit shows "Thanks — we'll respond within 5 business days."

- [ ] **Step 4: Admin /admin/complaints**

Table view with status filter; "Acknowledge" + "Resolve" buttons (both record an `admin_actions` row).

- [ ] **Step 5: /admin/payouts**

Read Stripe Connect transfers via `stripe.transfers.list`. Render a paginated table: artist/venue, amount, status, date, hold reason if any.

- [ ] **Step 6: /admin/moderation**

Initial scope: list works/profiles where any `report_count > 0`. The reporting flow itself is out of scope (follow-up); this just makes future flagged items visible.

- [ ] **Step 7: Sidebar entries**

```tsx
{ label: "Complaints", href: "/admin/complaints" },
{ label: "Payouts", href: "/admin/payouts" },
{ label: "Moderation", href: "/admin/moderation" },
```

- [ ] **Step 8: Commit (one per surface)**

```bash
git add supabase/migrations/054_complaints.sql src/app/api/complaints/route.ts \
        "src/app/(pages)/complaints/page.tsx"
git commit -m "feat(complaints): public intake form + complaints table"

git add "src/app/(pages)/admin/complaints/page.tsx" src/components/AdminPortalLayout.tsx
git commit -m "feat(admin): /admin/complaints queue with acknowledge/resolve"

git add "src/app/(pages)/admin/payouts/page.tsx"
git commit -m "feat(admin): /admin/payouts surfacing Stripe Connect transfers"

git add "src/app/(pages)/admin/moderation/page.tsx"
git commit -m "feat(admin): /admin/moderation placeholder for flagged items"
```

---

### Task 50: Admin/artists search + pagination parity with admin/venues (covers G2-44)

**Files:**
- Modify: `src/app/(pages)/admin/artists/page.tsx:38-82`
- Modify: `src/app/(pages)/admin/venues/page.tsx:62-85` (add pagination, parity)
- Modify: `src/app/api/admin/artists/route.ts` (server-side `q`, `limit`, `offset`)
- Modify: `src/app/api/admin/venues/route.ts` (same)

- [ ] **Step 1: Server-side search + pagination**

```ts
// /api/admin/artists/route.ts
const q = searchParams.get("q")?.trim() ?? "";
const limit = Math.min(100, Number(searchParams.get("limit") ?? 50));
const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));

let query = db.from("artist_profiles").select("*", { count: "exact" }).range(offset, offset + limit - 1);
if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%,email.ilike.%${q}%`);
const { data, count } = await query;
return NextResponse.json({ rows: data, total: count });
```

- [ ] **Step 2: Page UI**

Mirror the venues page's search box. Add "Showing X of Y" + "Load more" button.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/admin/artists/page.tsx" \
        "src/app/(pages)/admin/venues/page.tsx" \
        src/app/api/admin/artists src/app/api/admin/venues
git commit -m "feat(admin): artists + venues lists get search and pagination"
```

---

## Phase 8 — Public forms & browse polish (PR-7)

### Task 51: Newsletter form GDPR consent + double opt-in (covers G2-45)

**Files:**
- Modify: `src/components/NewsletterForm.tsx:45-67`
- Modify: `src/app/api/newsletter/route.ts` (issue confirm-link email)
- Create: `src/app/api/newsletter/confirm/route.ts` (GET handler that flips `confirmed`)

- [ ] **Step 1: Add the consent line + "Unsubscribe any time"**

```tsx
<p className="text-[11px] text-muted">
  By subscribing you agree to our <Link href="/privacy" className="underline">Privacy Policy</Link>.
  Unsubscribe any time.
</p>
```

- [ ] **Step 2: Server: token + confirm email**

```ts
// /api/newsletter/route.ts
const token = crypto.randomUUID();
await db.from("newsletter_subscribers").insert({ email, confirmed: false, confirm_token: token });
await sendConfirmEmail(email, token);
```

- [ ] **Step 3: /api/newsletter/confirm?token=…**

Looks up by token, sets `confirmed = true`, returns a small "You're subscribed" page.

- [ ] **Step 4: Commit**

```bash
git add src/components/NewsletterForm.tsx src/app/api/newsletter
git commit -m "feat(newsletter): GDPR consent line + double opt-in"
```

---

### Task 52: ContactForm honeypot + hCaptcha (covers G2-46)

**Files:**
- Modify: `src/components/ContactForm.tsx:96-141`
- Modify: `src/app/api/contact/route.ts` (reject if honeypot filled; verify captcha)

- [ ] **Step 1: Add hidden honeypot**

```tsx
<input
  type="text"
  name="website"
  tabIndex={-1}
  autoComplete="off"
  className="absolute left-[-9999px]"
  aria-hidden="true"
/>
```

- [ ] **Step 2: hCaptcha widget**

(Add `@hcaptcha/react-hcaptcha` and the site key envs. Skip if the team prefers honeypot-only.)

- [ ] **Step 3: Server-side checks**

```ts
if (typeof body.website === "string" && body.website.length > 0) {
  return NextResponse.json({ ok: true }, { status: 200 }); // silently drop
}
// verify captcha if present...
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ContactForm.tsx src/app/api/contact/route.ts
git commit -m "feat(contact): honeypot + hCaptcha to deter spam"
```

---

### Task 53: /apply real file upload (covers G2-47)

**Files:**
- Modify: `src/components/ApplicationForm.tsx:132-139`
- Create: `src/app/api/applications/upload/route.ts` (signs Supabase Storage upload URL)
- Modify: `src/app/(pages)/admin/applications/[id]/page.tsx` (render uploaded thumbnails)

- [ ] **Step 1: Storage bucket**

Use Supabase Storage; create bucket `application-samples` (private).

- [ ] **Step 2: Sign upload URL endpoint**

```ts
// /api/applications/upload/route.ts
const { data, error } = await db.storage.from("application-samples").createSignedUploadUrl(`${user.id}/${filename}`);
```

- [ ] **Step 3: Form widget**

`<input type="file" accept="image/*" multiple max=3>`. On change, upload each to the signed URL; collect the storage paths into `application.sample_paths` (jsonb).

- [ ] **Step 4: Admin renders thumbnails**

Sign read URLs server-side and render `<img>` thumbs in the admin detail.

- [ ] **Step 5: Commit**

```bash
git add src/components/ApplicationForm.tsx src/app/api/applications/upload \
        "src/app/(pages)/admin/applications/[id]/page.tsx"
git commit -m "feat(apply): real 3-image upload to private Storage; admin sees thumbnails"
```

---

### Task 54: Signup duplicate-email handling (covers G2-48)

**Files:**
- Modify: `src/app/(pages)/signup/artist/page.tsx:76-91`
- Modify: `src/app/(pages)/signup/customer/page.tsx`

- [ ] **Step 1: Detect Supabase "User already registered"**

```tsx
catch (err) {
  if (/already registered/i.test(String(err.message))) {
    setError(
      <span>
        This email is already in use.{" "}
        <Link href={`/login?email=${encodeURIComponent(email)}&next=/apply`} className="underline">
          Sign in instead.
        </Link>
      </span>
    );
    return;
  }
}
```

- [ ] **Step 2: Add explicit terms checkbox**

```tsx
<label className="flex items-start gap-2 text-xs">
  <input type="checkbox" required />
  <span>
    I agree to the <Link href="/terms" className="underline">Terms</Link> and{" "}
    <Link href="/privacy" className="underline">Privacy Policy</Link>.
  </span>
</label>
```

Submit is disabled unless checked (use `required`).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/signup/artist/page.tsx" \
        "src/app/(pages)/signup/customer/page.tsx"
git commit -m "fix(signup): duplicate-email shows 'sign in instead'; terms gesture is auditable"
```

---

### Task 55: Browse filter state in URL (covers G2-49)

**Files:**
- Modify: `src/app/(pages)/browse/page.tsx:213-258`
- Possibly create: `src/lib/use-url-filter-object.ts` (if URL-state hook for objects is wanted)

- [ ] **Step 1: Serialise filters**

```tsx
const [urlFilters, setUrlFilters] = useUrlFilters({
  view: "galleries",
  themes: [],
  mediums: [],
  sizes: [],
  arrangements: [],
  priceMin: 0,
  priceMax: 1000,
  sort: "featured",
  q: "",
  location: "",
  distanceKm: 0,
});
```

(`useUrlFilters` is a thin wrapper around `useUrlState` per param — implement inline in the file if a generic hook is overkill.)

- [ ] **Step 2: Hydrate state from URL on mount**

Convert array params via `?themes=urban,floral` joining with comma; numeric via `Number(sp.get(...))`.

- [ ] **Step 3: Replace `router.replace` calls**

Every filter change writes the param via `useUrlState`. Debounce text inputs (200 ms).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/browse/page.tsx"
git commit -m "feat(browse): all filter state serialised to URL params"
```

---

### Task 56: /blog Unsplash sweep (covers G2-50)

**Files:**
- Modify: `src/app/(pages)/blog/page.tsx:15-17`

- [ ] **Step 1: Replace inline `style={{ backgroundImage }}` with `<Image fill>`**

```tsx
<div className="relative h-[40vh] min-h-[320px]">
  <Image src="/marketing/blog-hero.webp" alt="" fill className="object-cover" priority />
  ...
</div>
```

(The asset itself is provided by Plan G Task 13; this task just rewires the markup.)

- [ ] **Step 2: Commit**

```bash
git add "src/app/(pages)/blog/page.tsx"
git commit -m "fix(blog): hero uses next/image — picks up Plan G Task 13 brand asset"
```

---

### Task 57: /spaces filters, browse slider cap, slider aria-labels, pricing tab role (covers G2-51, G2-52, G2-53, G2-54)

**Files:**
- Modify: `src/app/(pages)/spaces-looking-for-art/page.tsx`
- Modify: `src/app/(pages)/browse/page.tsx` (price slider)
- Modify: `src/app/(pages)/pricing/page.tsx` (Monthly/Annual toggle)

- [ ] **Step 1: /spaces filters**

Reuse the `BrowseFilters` component (medium / location / size / arrangement set). Default sort: most recent.

- [ ] **Step 2: Browse price slider — extend cap, log-step**

```tsx
<input type="range" min={0} max={5000} step={50} aria-label="Minimum price" value={priceMin} onChange={...} />
<input type="range" min={0} max={5000} step={50} aria-label="Maximum price" value={priceMax} onChange={...} />
```

Filter logic: treat `priceMax >= 5000` as "and above".

- [ ] **Step 3: Pricing Monthly/Annual proper roles**

```tsx
<div role="tablist" className="...">
  <button role="tab" aria-selected={!isAnnual} onClick={() => setIsAnnual(false)}>Monthly</button>
  <button role="tab" aria-selected={isAnnual} onClick={() => setIsAnnual(true)}>Annual</button>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/spaces-looking-for-art/page.tsx" \
        "src/app/(pages)/browse/page.tsx" \
        "src/app/(pages)/pricing/page.tsx"
git commit -m "fix(public): spaces filters; browse slider cap+aria; pricing tab roles"
```

---

## Phase 9 — Final verification + per-PR descriptions

### Task 58: Per-phase smoke + open PRs

For each PR slice (PR-1 through PR-7), run:

- [ ] **Step 1:** `npm run check` clean.
- [ ] **Step 2:** `npm run build` clean.
- [ ] **Step 3:** Manual smoke specific to that PR's tasks (drawn from each task's "Smoke" step).
- [ ] **Step 4:** Open PR with the canonical body:

```markdown
## Summary

Plan G2 — slice [N]: [title].

Closes the following items from `docs/plans/2026-05-03-G2-additional-qa-findings.md`:
- [G2-XX] [title]
- ...

## Test plan

- [ ] `npm run check` clean
- [ ] `npm run build` clean
- [ ] Per-task smoke (see plan §[task numbers])

## Out of scope

[Things that look related but live in another slice]

## Depends on

[Earlier Plan G2 slices that must merge first]
```

---

## Self-review

**Spec coverage — every G2-N has a task:**

| G2-N | Task | Phase |
|------|------|-------|
| G2-1 | Task 14 | 3 |
| G2-2 | Task 15 | 3 |
| G2-3 | Task 16 | 3 |
| G2-4 | Task 17 | 3 |
| G2-5 | Task 18 | 3 |
| G2-6 | Task 19 | 3 |
| G2-7 | Task 8 (foundation) | 2 |
| G2-8 | Task 20 | 3 |
| G2-9 | Task 21 | 3 |
| G2-10 | Task 22 | 3 |
| G2-11 | Task 24 | 4 |
| G2-12 | Task 25 (uses Task 10's hook) | 4 |
| G2-13 | Task 26 | 4 |
| G2-14 | Task 1 | 1 |
| G2-15 | Task 2 | 1 |
| G2-16 | Task 3 | 1 |
| G2-17 | Task 27 | 4 |
| G2-18 | Task 28 | 4 |
| G2-19 | Task 29 | 4 |
| G2-20 | Task 9 (foundation) | 2 |
| G2-21 | Task 30 | 4 |
| G2-22 | Tasks 32 (artist) + 38 (venue) | 5/6 |
| G2-23 | Task 4 | 1 |
| G2-24 | Tasks 12 (foundation) + 33 | 2/5 |
| G2-25 | Task 34 | 5 |
| G2-26 | Task 35 | 5 |
| G2-27 | Task 36 (uses Task 11's component) | 5 |
| G2-28 | Task 5 | 1 |
| G2-29 | Task 37 | 5 |
| G2-30 | Tasks 5 (truth) + 46 (controls) | 1/6 |
| G2-31 | Task 39 | 6 |
| G2-32 | Task 40 | 6 |
| G2-33 | Task 41 | 6 |
| G2-34 | Task 42 | 6 |
| G2-35 | Task 43 | 6 |
| G2-36 | Task 44 | 6 |
| G2-37 | Task 45 | 6 |
| G2-38 | Task 46 | 6 |
| G2-39 | (folded into Task 39's keyboard work) | 6 |
| G2-40 | Task 47 (uses Task 11) | 7 |
| G2-41 | Task 6 | 1 |
| G2-42 | Task 48 | 7 |
| G2-43 | Task 49 | 7 |
| G2-44 | Task 50 | 7 |
| G2-45 | Task 51 | 8 |
| G2-46 | Task 52 | 8 |
| G2-47 | Task 53 | 8 |
| G2-48 | Task 54 | 8 |
| G2-49 | Task 55 | 8 |
| G2-50 | Task 56 | 8 |
| G2-51 | Task 57 | 8 |
| G2-52 | Task 57 | 8 |
| G2-53 | Task 57 | 8 |
| G2-54 | Task 57 | 8 |

**Every G2 finding is covered. Several are folded into compound tasks where the surface area is shared (G2-22 alert→toast in two portals; G2-51-54 four small public-page polish items batched).**

**Placeholder scan:** every step has actual code or an exact command. The places that say "Mirror Plan G Task 3's pattern" reference an existing, already-merged task whose pattern is plain in `docs/plans/2026-05-03-G-targeted-fixes-and-features.md`. The "decide on canonical tier set" step (Task 20) is bounded by an explicit recommendation.

**Type / name consistency:**
- `OrderStatus` (Task 3) is the same shape used in `isRefundEligible` (Task 28) ✓
- `useUrlState<T>(param, default)` signature in Task 10 matches all callers (Tasks 25, 29, 42, 55) ✓
- `<ConfirmDialog open|title|reasonRequired|onConfirm|onClose>` (Task 11) signature matches all callers (Tasks 36, 47) ✓
- `ARRANGEMENT_LABEL` keys (Task 8) match the columns selected in Task 7's sweep ✓
- `order_number` column (Task 12) is referenced by Task 33 ✓

**Independence:**
- Phase 2 must merge before Phases 4–8 (utilities/migrations are dependencies).
- Phase 1 and Phase 2 are independent — can ship in either order.
- Phases 3, 5, 6, 7, 8 are independent of each other once Phase 2 is in.
- Phase 4 depends on Phase 2 (`useUrlState`, `ConfirmDialog`, `order_number`, `formatCurrency`, `isValidPostcode`, `isRefundEligible`).

**Risk notes:**
- Task 2 (cart re-validation) interacts with Stripe live keys — keep the test seeded with mocked Stripe and run the smoke against the *test* Stripe account.
- Task 12's `order_number` migration backfills via UUID slice; in theory two rows could collide. Probability is ~1 in 16M for the seeded set; if the orders table is large, replace the backfill with a per-row sequence.
- Task 30 (address book) introduces a new RLS-protected table; verify the policy works for both anon and the user's own session before shipping.
- Task 40 (HEIC) adds a runtime dep with a non-trivial bundle size; verify the chunk only loads when the user picks a HEIC file (use dynamic `import()`).
- Task 49 (admin payouts) calls Stripe API on every page load; cache server-side or paginate aggressively.

**Things explicitly NOT in this plan even though they might look related:**
- Mobile layout fixes — Plan E.
- Image fallback / skeleton / SearchBar — Plan F.
- Mobile wall *visualizer* touch — Plan G Task 14.
- Carrier link on order tracker — Plan D Task 9.
- /venues marketing landing — Plan D Task 17.
- Curated visual upgrade — Plan G Task 12 (gated on a brief).
- Wall-delete confirm dialog keyboard — Plan E Task 12.

Plan looks complete. Ready to execute.

---

## Execution

Two paths:

1. **Subagent-driven** — Use `superpowers:subagent-driven-development`. Each phase becomes one PR; each task fires a fresh subagent.
2. **Inline** — Use `superpowers:executing-plans`. Execute phases in order; commit between tasks.

**Recommended order:**
1. Phase 1 (PR-1: pre-launch correctness)
2. Phase 2 (PR-2: foundations)
3. Phases 3, 5, 6, 8 in any order (PR-3, PR-5, PR-7) — independent
4. Phase 4 (PR-4) — after Phase 2
5. Phase 7 (PR-6) — after Phase 2 (uses ConfirmDialog) and Phase 1 (extends `admin_actions`)

No new env vars needed. Three small migrations (050, 051, 052, 053, 054). One new dep (`heic2any`), optionally one more (`@hcaptcha/react-hcaptcha`). One asset to add (`public/og-image.png`); brand assets for /blog hero come from Plan G Task 13.
