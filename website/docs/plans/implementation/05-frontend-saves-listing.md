# 05. Frontend saves and listing integrity

Status: ready to execute
Scope: `website/src` (Next.js App Router, React 19)
Related: E41, E42, E43, live-test bugs 7, 12, 14, plus "Gate 2, listing integrity"

---

## 0. Summary

The audit class is "false success": the UI reports a save that never happened. The
root cause is structural, not a set of one-off slips.

1. `authFetch` returns the raw `Response` and never throws on a non-2xx
   (`src/lib/api-client.ts:18`). Every caller has to remember to check `res.ok`.
   Roughly a third of them do not.
2. There is no shared save primitive. Each page hand-rolls in-flight state,
   optimistic updates, rollback and toasts, so each one gets a different subset
   right.
3. Two server-side helpers silently narrow the write payload and still return
   `{ success: true }`, so even a correct client cannot detect the loss.

Confirmed counts:

- **24 false-success or dead controls** across the three portals and the public
  artist page (see the inventory in section 8).
- **7 fields** that a venue can edit and save but which are dropped before they
  reach Postgres.
- **1 legacy `localStorage`-only write path** that persists artwork nowhere.

Worst data-loss path: `src/app/(pages)/artist-portal/portfolio/page.tsx:404`
`saveWorks()`. It re-POSTs the artist's **entire** portfolio on every edit, does
not await or inspect any response, and drops `pricesBySize`, per-size shipping
and in-store price on the way through. A single price tweak can therefore damage
every work the artist owns while the toast says "Artwork updated".

Everything below is confirmed against the code unless explicitly marked
UNCONFIRMED.

---

## 1. The fix pattern

### 1.1 `src/lib/api-client.ts`, typed errors

Current file, in full:

```ts
import { supabase } from "@/lib/supabase";

/**
 * Fetch wrapper that automatically includes the current user's auth token.
 * Use for any API route that requires authentication.
 */
export async function authFetch(url: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, { ...options, headers });
}
```

Two problems. It cannot fail loudly on a 4xx/5xx, and if
`supabase.auth.getSession()` rejects (expired token, unreachable auth host) the
rejection escapes before `fetch` is ever called, so the caller sees a thrown
promise with **zero network activity**. That second path is the only mechanism in
the codebase that can produce bug 12's "no requests at all" symptom.

Replacement file:

```ts
import { supabase } from "@/lib/supabase";

/**
 * Thrown when a request reaches the server and comes back non-2xx. Carries the
 * status and the parsed body so callers can branch on `code` (the `error` key
 * our API routes use) without re-reading the response.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly payload: unknown;

  constructor(status: number, message: string, code: string | null, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

/** Thrown when the request never got a reply, or auth could not be resolved. */
export class NetworkError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "NetworkError";
    this.cause = cause;
  }
}

async function authHeaders(options: RequestInit): Promise<Headers> {
  const headers = new Headers(options.headers);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
  } catch (err) {
    // Previously this rejection escaped before fetch() ran, so a save looked
    // like it fired zero requests and produced no error anywhere.
    throw new NetworkError("Could not read your session. Please sign in again.", err);
  }
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

/**
 * Fetch wrapper that includes the current user's auth token. READ-ONLY use.
 * Returns the raw Response and never throws on a non-2xx, so callers must
 * check `res.ok` themselves. For anything that writes, use `mutate()`.
 */
export async function authFetch(url: string, options: RequestInit = {}) {
  const headers = await authHeaders(options);
  return fetch(url, { ...options, headers });
}

/**
 * Authenticated write. Throws ApiError on a non-2xx and NetworkError when the
 * request never lands, so a save can only be reported as successful if the
 * server actually confirmed it.
 *
 *   const { blog } = await mutate<{ blog: Blog }>("/api/blogs", {
 *     method: "POST",
 *     body: JSON.stringify(payload),
 *   });
 */
export async function mutate<T = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = await authHeaders(options);

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    throw new NetworkError("Network error. Please check your connection.", err);
  }

  const raw = await res.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { error: raw.slice(0, 200) };
    }
  }

  if (!res.ok) {
    const body = (payload ?? {}) as { error?: unknown; message?: unknown };
    const code = typeof body.error === "string" ? body.error : null;
    const message =
      (typeof body.message === "string" && body.message) ||
      code ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message, code, payload);
  }

  return payload as T;
}

/** True when the failure is worth retrying rather than reporting as invalid input. */
export function isTransient(err: unknown): boolean {
  return err instanceof NetworkError || (err instanceof ApiError && err.status >= 500);
}
```

Migration rule: **every** call site that passes `method: "POST" | "PUT" | "PATCH"
| "DELETE"` moves from `authFetch` to `mutate`. There are 101 such call sites
under `src/app/(pages)/{artist,venue,customer}-portal`, `src/app/(pages)/account`
and `src/components`. Lock it in afterwards with a lint rule in
`eslint.config.mjs`, in the same spirit as the existing
`no-raw-arrangement-type` rule:

```js
// no-authfetch-mutation: authFetch is read-only; writes must use mutate().
{
  selector:
    "CallExpression[callee.name='authFetch'] > ObjectExpression:nth-child(2) > Property[key.name='method']",
  message: "authFetch is read-only. Use mutate() from @/lib/api-client for writes.",
}
```

### 1.2 `src/hooks/useSaveAction.ts`, new file

The reference implementation for optimistic-plus-rollback already exists in
`src/context/SavedContext.tsx:92-148`: snapshot the state, apply optimistically,
throw on `!res.ok`, restore the snapshot and show an error toast in `.catch`.
`useSaveAction` generalises exactly that, and adds the two things `SavedContext`
does not need: an in-flight lock on the control, and deferred clearing of the
unsaved-changes guard.

```ts
"use client";

import { useCallback, useRef, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { ApiError, NetworkError } from "@/lib/api-client";

export interface SaveActionOptions<TArgs extends unknown[], TResult> {
  /** The write itself. Must throw on failure, so use `mutate()`, not `authFetch`. */
  run: (...args: TArgs) => Promise<TResult>;
  /**
   * Apply the optimistic UI change and return the function that undoes it.
   * Follows the snapshot/restore shape used by SavedContext.toggleSaved.
   * Omit for saves that should not move the UI until the server confirms.
   */
  optimistic?: (...args: TArgs) => () => void;
  /** Runs only after a confirmed 2xx. Reconcile server state here. */
  onSuccess?: (result: TResult, ...args: TArgs) => void;
  /** Toast on confirmed success. Omit for silent saves (auto-save). */
  successMessage?: string | ((result: TResult) => string);
  /** Fallback error copy when the server sends nothing usable. */
  errorMessage?: string;
  /**
   * Clears the unsaved-changes guard. Called ONLY after a confirmed success,
   * never optimistically.
   */
  clearDirty?: () => void;
}

export interface SaveActionState<TArgs extends unknown[]> {
  /** Bind to the control's `disabled`. True while the request is in flight. */
  saving: boolean;
  /** Last failure, for inline error text next to the control. */
  error: string | null;
  /** True only between a confirmed success and the next change. */
  saved: boolean;
  /** Awaitable. Resolves true on confirmed success, false on any failure. */
  save: (...args: TArgs) => Promise<boolean>;
  /** Drop the saved/error banner when the user edits again. */
  reset: () => void;
}

function describe(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof NetworkError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * One save control, done correctly.
 *
 *   - disables the control for the whole round trip (and refuses re-entry)
 *   - awaits the request
 *   - reports success ONLY when the server confirmed it
 *   - rolls the optimistic state back and surfaces the real error otherwise
 *   - clears the unsaved-changes guard only after a confirmed success
 *
 * Usage:
 *   const saveProfile = useSaveAction({
 *     run: () => mutate("/api/artist-profile", { method: "PUT", body }),
 *     successMessage: "Profile saved",
 *     clearDirty: () => setHasUnsavedChanges(false),
 *   });
 *   <button onClick={() => saveProfile.save()} disabled={saveProfile.saving}>
 *     {saveProfile.saving ? "Saving..." : "Save changes"}
 *   </button>
 */
export function useSaveAction<TArgs extends unknown[] = [], TResult = unknown>(
  opts: SaveActionOptions<TArgs, TResult>,
): SaveActionState<TArgs> {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A ref, not state: it has to block a second click within the same tick,
  // before React has flushed `saving`. Double-submit on a slow connection was
  // producing duplicate rows on the offers and messages endpoints.
  const inFlight = useRef(false);

  // Latest options without re-creating `save` on every render.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const save = useCallback(
    async (...args: TArgs): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setSaving(true);
      setError(null);
      setSaved(false);

      const rollback = optsRef.current.optimistic?.(...args);

      try {
        const result = await optsRef.current.run(...args);

        optsRef.current.onSuccess?.(result, ...args);
        // Guard is cleared here and nowhere else.
        optsRef.current.clearDirty?.();
        setSaved(true);

        const msg = optsRef.current.successMessage;
        if (msg) {
          showToast(typeof msg === "function" ? msg(result) : msg);
        }
        return true;
      } catch (err) {
        rollback?.();
        const message = describe(err, optsRef.current.errorMessage ?? "Could not save. Please try again.");
        setError(message);
        showToast(message, { variant: "error", durationMs: 5000 });
        return false;
      } finally {
        inFlight.current = false;
        setSaving(false);
      }
    },
    [showToast],
  );

  const reset = useCallback(() => {
    setSaved(false);
    setError(null);
  }, []);

  return { saving, error, saved, save, reset };
}
```

Note on toast variants: `ToastContext` currently exposes `"info" | "warn" |
"error"` (`src/context/ToastContext.tsx:5`). There is no `"success"` variant, so
confirmed saves use the default `info`. Add a `"success"` variant in the same PR
if we want green confirmations; it is a two-line change to `VARIANT_CLASSES`.

---

## 2. E41, artist profile and portfolio saves drop the write

### E41-a. The portfolio save is fire-and-forget

**Location.** `src/app/(pages)/artist-portal/portfolio/page.tsx:404-468`.

```ts
  function saveWorks(updated: ArtistWork[]) {
    setWorks(updated);
    ...
    updated.forEach((work, index) => {
      ...
      authFetch("/api/artist-works", {
        method: "POST",
        body: JSON.stringify({ ... }),
      })
        .then((r) => r.json())
        .then((res: { warnings?: string[]; savedRow?: {...} }) => { ... })
        .catch((err) => console.error("Work sync error:", err));
    });
  }
```

and the caller, `handleSubmit`, at lines 1805-1809:

```ts
    saveWorks(updated);
    // Clear dirty snapshot so the beforeunload guard drops after save
    initialFormJson.current = JSON.stringify(form);
    setShowForm(false);
    showToast(editingIndex !== null ? "Artwork updated" : "Artwork added");
```

**Mechanism.** `saveWorks` is synchronous and returns before any request
resolves. `res.ok` is never read, so a 402 (`subscription_required`), 403
(`post_limit_reached`), 400 or 500 is parsed as JSON, finds no `savedRow` and no
`warnings`, and produces exactly nothing. The `.catch` only reaches
`console.error`. Meanwhile the caller has already closed the form, reset the
dirty snapshot (so `useUnsavedWarning(formDirty)` at line 321 stops guarding, and
`formDirty` is `showForm && ...` so closing the form alone clears it) and fired a
success toast.

**Impact.** A Core artist at their post limit adds a ninth work, sees "Artwork
added", sees the card in the grid, navigates away with no warning, and the work
is gone. Same for any 500. This is the single worst data-loss path in the app,
and it sits on the listing flow the owner has called out.

**Fix.**

1. Make `saveWorks` `async` and return `Promise<boolean>`. Replace `authFetch`
   with `mutate`, and `forEach` with an awaited `Promise.allSettled` over the
   works that actually changed (see E41-c for the "only changed works" part).
2. Route `handleSubmit` through `useSaveAction`, so the toast, the
   `setShowForm(false)` and the `initialFormJson.current` reset all move into
   `onSuccess` / `clearDirty`.
3. On partial failure, keep the form open, restore `works` from the snapshot
   taken before `setWorks(updated)`, and surface the first `ApiError.message`.

```ts
  const saveWork = useSaveAction({
    optimistic: (updated: ArtistWork[]) => {
      const snapshot = works;
      setWorks(updated);
      return () => setWorks(snapshot);
    },
    run: async (updated: ArtistWork[]) => {
      const changed = updated.filter((w, i) => hasChanged(w, i));
      const results = await Promise.allSettled(changed.map((w, i) => postWork(w, i)));
      const failed = results.find((r) => r.status === "rejected");
      if (failed) throw (failed as PromiseRejectedResult).reason;
      return results.map((r) => (r as PromiseFulfilledResult<SavedRow>).value);
    },
    onSuccess: (rows) => { reconcile(rows); setShowForm(false); setEditingIndex(null); },
    clearDirty: () => { initialFormJson.current = JSON.stringify(form); },
    successMessage: editingIndex !== null ? "Artwork updated" : "Artwork added",
  });
```

**Test.** `src/app/(pages)/artist-portal/portfolio/page.test.tsx`:
- mock `mutate` to reject with `new ApiError(403, "post_limit_reached", "post_limit_reached", {})`;
  assert the form stays open, the error toast fires, `works` still has the old
  length, and no "Artwork added" toast appears;
- mock a resolve; assert the toast fires once and `showForm` is false.

### E41-b. Deletes are fire-and-forget

**Location.** `src/app/(pages)/artist-portal/portfolio/page.tsx:470-476`:

```ts
  function handleDeleteWork(index: number) {
    const work = works[index];
    // Delete from Supabase
    authFetch(`/api/artist-works?id=${work.id}`, { method: "DELETE" })
      .catch((err) => console.error("Work delete error:", err));
    saveWorks(works.filter((_, i) => i !== index));
  }
```

and the bulk equivalent at lines 543-551, which ends with an unconditional
`showToast(\`Deleted ${count} work...\`)`.

**Mechanism.** No `await`, no `res.ok`. The card leaves the grid regardless.
**Impact.** A failed delete leaves the work live on `/browse` while the artist
believes it is gone. **Fix.** `await mutate(...)` inside `useSaveAction`, remove
the row only in `onSuccess`. **Test.** Reject the delete, assert the card is
still rendered and an error toast fired.

### E41-c. Every save rewrites the entire portfolio

**Location.** `src/app/(pages)/artist-portal/portfolio/page.tsx:411`,
`updated.forEach((work, index) => {`.

**Mechanism.** One POST per work in the array, on any change. Each POST runs a
SELECT, an UPDATE and a read-back in `upsertWork`. **Impact.** Editing one work
in a twenty-work portfolio fires twenty concurrent writes, and turns the
field-dropping bugs below into portfolio-wide damage. It also makes the
`existingWorks.length >= postLimit` check in
`src/app/api/artist-works/route.ts:70` a TOCTOU race. **Fix.** Diff against the
last-known-persisted snapshot and POST only genuinely changed rows; POST a
lightweight `{ id, sortOrder }` batch for reorders.

### E41-d. `pricesBySize` is stripped on every save

**Location.** `src/app/(pages)/artist-portal/portfolio/page.tsx:415-420`:

```ts
      const frames = ((work as ArtistWork & { frameOptions?: { label: string; priceUplift: number; imageUrl?: string }[] }).frameOptions ?? [])
        .map((f) => ({
          label: f.label,
          priceUplift: typeof f.priceUplift === "number" ? f.priceUplift : Number(f.priceUplift) || 0,
          imageUrl: f.imageUrl,
        }));
```

**Mechanism.** `pricesBySize` exists in the form state (built at lines
1686-1701), is rehydrated on edit (lines 1488-1494) and is persisted by the API
(`route.ts:114-129`). `saveWorks` is the only transport and this `.map` does not
carry the key. **Impact.** Per-size frame pricing is wiped, and because
`saveWorks` re-POSTs everything, it is wiped across the whole portfolio when the
artist edits any unrelated work. **Fix.** `pricesBySize: f.pricesBySize` in the
map. **Test.** Unit-test the payload builder: given a work with
`frameOptions[0].pricesBySize`, assert the POST body retains it.

### E41-e. Bulk editors delete per-size shipping, in-store price and stock

**Location.** `src/app/(pages)/artist-portal/portfolio/page.tsx:1060-1065`:

```ts
      const newPricing = rowsForWork
        .filter((r) => r.label.trim() && r.price > 0)
        .map((r) => ({
          label: r.label.trim(),
          price: Math.round(r.price * 100) / 100,
        }));
```

and the "copy sizes" variant at lines 1239-1243, which keeps `quantityAvailable`
but drops `shippingPrice` and `inStorePrice`.

**Mechanism.** `pricing` is rebuilt from scratch as `{label, price}`, discarding
the other `SizePricing` fields (`src/data/artists.ts:5-25`). **Impact.** Tweaking
one price in the bulk editor removes per-size shipping and in-store pricing for
every row of every work, which also kills the "Collect from venue" CTA. **Fix.**
Merge into the existing row rather than replacing it:
`{ ...existingRowByIndex, label, price }`. **Test.** Given a work whose
`pricing[0]` has `shippingPrice: 4.5` and `inStorePrice: 90`, run the bulk save
and assert both survive.

### E41-f. The legacy `localStorage("wallplace-artist-works")` path

**Location.** `src/app/(pages)/artist-portal/profile/page.tsx:558-561`:

```ts
  function saveWorks(updated: ArtistWork[]) {
    setWorks(updated);
    localStorage.setItem("wallplace-artist-works", JSON.stringify(updated));
  }
```

Reached from the "+ Add Work" button (line 1163), the work modal's
"Save"/"Add Work" button (line 1253) via `handleSaveWork` at line 630
(`saveWorks(updated); setShowWorkForm(false);`), and by clicking any work card
(line 1264, `onClick={() => openEditWork(index)}`).

**Mechanism.** This is a second, entirely separate artwork editor living on the
**profile** page. It never touches `/api/artist-works`. `grep -rn
"wallplace-artist-works" src/` returns this one line: nothing reads the key back.
Worse, `works` is re-seeded from the server by the effect at lines 520-524
(`setWorks([...artist.works])`, dependency `[artist]`), and `handleSave` calls
`refetch()` at line 750, so saving the profile immediately discards whatever the
work modal wrote.

**Impact.** An artist who adds artwork from the profile page loses it entirely.
It never reaches the DB, never reaches `/browse`, and vanishes from the UI on the
next refetch. Two editors for the same object, one of which is a dead end.

**Fix.** Delete the artwork editor from the profile page (lines 558-632 and the
UI block 1163-1290) and replace it with a link to `/artist-portal/portfolio`.
Remove the `localStorage` key. Do **not** try to rewire it to the API: a second
editor for the same entity is the defect.

**Test.** `src/app/(pages)/artist-portal/profile/page.test.tsx`: assert no
"+ Add Work" control renders and `localStorage.setItem` is never called with
`"wallplace-artist-works"`.

### E41-g. `handleSave` on the artist profile is correct

`src/app/(pages)/artist-portal/profile/page.tsx:652-752` awaits, checks
`!res.ok` (line 736), toasts on failure and only then sets `saved` and clears
`hasUnsavedChanges`. Verdict SAFE. Keep it, and use it as the migration template
for the other profile page. The only nit: line 747 writes a
`"wallplace-artist-profile"` localStorage mirror that nothing reads. Remove it
with E41-f.

---

## 3. E42, venue profile toggles persist nothing, plus input corruption

### E42-a. "Not set" is bound into the input value

**Location.** `src/app/(pages)/venue-portal/profile/page.tsx:423-453`:

```tsx
            {([
              { label: "Venue Name", value: detailName || venue?.name || "Your Venue", setter: setDetailName, ... },
              { label: "Venue Type", value: detailType || venue?.type || "Not set", setter: setDetailType, ... },
              { label: "Location", value: detailLocation || venue?.location || "Not set", setter: setDetailLocation, ... },
              { label: "Wall Space", value: detailWallSpace || venue?.wallSpace || "Not set", setter: setDetailWallSpace, ... },
              { label: "Visitors per day (approx.)", value: detailFootfall || venue?.approximateFootfall || "Not set", setter: setDetailFootfall, inputType: "number" as const },
            ] as const).map(({ label, value, setter, placeholder, inputType }) => (
              ...
                  <input
                    type={inputType}
                    ...
                    value={value}
```

**Mechanism.** `value` is a display fallback chain, and the same expression is
bound to the controlled `<input>`. When the venue has no `type` yet, entering
edit mode puts the literal string `"Not set"` in the field. The user types, and
`onChange` receives `"Not set" + keystroke`, so `detailType` becomes
`"Not setc"`. If they do not touch the field at all, `handleSave` still sends
`detailType` (empty) and the value silently stays absent, so the two halves
disagree about what the user is looking at. The "Venue Name" row is worse: its
fallback is `"Your Venue"`, which is a plausible-looking name a user will accept
and save.

The footfall row compounds it: `inputType: "number"` with `value="Not set"` is
not a valid `<input type=number>` value, so the browser renders an empty box and
React logs a controlled-input warning, while the component believes the value is
`"Not set"`.

**Impact.** Corrupted venue names, types and locations on the public
`/venues/[slug]` page and in artist-facing search.

**Fix.** Split display from value.

```tsx
const rows = [
  { label: "Venue Name", value: detailName, fallback: venue?.name ?? "", placeholder: "Your Venue", setter: setDetailName, inputType: "text" as const },
  { label: "Venue Type", value: detailType, fallback: venue?.type ?? "", placeholder: "e.g. Independent cafe", setter: setDetailType, inputType: "text" as const },
  // ...
];
// editing:  <input value={value} placeholder={placeholder} .../>
// reading:  <p className={display ? "text-foreground" : "text-muted italic"}>{display || "Not set"}</p>
//           where const display = value || fallback;
```

Never let the "Not set" string enter `value`. The read-only block already does
this correctly at line 669 (`{value || "Not set"}`), so the pattern exists in the
same file.

**Test.** Render with `venue.type` undefined, click Edit, assert
`input.value === ""` and the placeholder is present. Type "Cafe", assert the PUT
body carries `type: "Cafe"`, not `"Not setCafe"`.

### E42-b. Two toggles are saved nowhere

**Location.** `src/app/(pages)/venue-portal/profile/page.tsx:324-346`, the whole
PUT payload:

```ts
        body: JSON.stringify({
          name: detailName || undefined,
          type: detailType || undefined,
          location: detailLocation || undefined,
          wall_space: detailWallSpace || undefined,
          approximate_footfall: detailFootfall || undefined,
          preferred_styles: styles,
          preferred_themes: themes,
          images: venueImages,
          interested_in_free_loan: freeLoan,
          interested_in_revenue_share: revenueShare,
          interested_in_direct_purchase: directPurchase,
          display_wall_space: displayWallSpace || undefined,
          ...
        }),
```

`localArtists` (state at line 211, toggle at lines 610-611
`onChange={(v) => { setLocalArtists(v); markDirty(); }}`) and `sizes` (state at
line 214, toggle `toggleSize` at lines 319-322) are **absent**. Both columns
exist: `interested_in_local_artists` and `preferred_sizes` are named in
`src/lib/db/venue-profiles.ts:64-65`.

A second confirmation that the sizes field is not wired:
`src/app/(pages)/venue-portal/profile/page.tsx:251` hydrates it from a hard-coded
literal rather than from the venue record:

```ts
      setSizes(["Medium (40 to 80cm)", "Large (80 to 120cm)"]);
```

**Mechanism.** Flipping either control calls `markDirty()`, the Save button
sends a payload without those keys, the API returns `{ success: true }`, and the
page renders the green "Saved" at line 396. On reload the toggle is back where it
started, and the sizes chips show the same two hard-coded values regardless.

**Impact.** Venues cannot express "I want local artists" or their preferred size
range. Artist matching silently ignores both preferences.

**Fix.** Add `interested_in_local_artists: localArtists` and
`preferred_sizes: sizes` to the payload, and hydrate `setSizes` from
`venue.preferredSizes` with the literal as a fallback only when the array is
empty (mirroring the `styles`/`themes` treatment on lines 249-250).

**Test.** Toggle "Local artists", click Save, assert the request body contains
`interested_in_local_artists: true`. Render with
`venue.preferredSizes = ["Small"]` and assert only "Small" is selected.

### E42-c. The server silently drops seven columns and still returns success

**Location.** `src/lib/db/venue-profiles.ts:54-79` (update branch):

```ts
  if (existing) {
    let { error } = await db
      .from("venue_profiles")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    // Retry without potentially missing columns if update fails. `images`
    // is added in migration 022 and may not exist in older environments.
    if (error) {
      // Strip columns that may not exist in older schemas (added in migrations 022, 028).
      const {
        preferred_sizes,
        interested_in_local_artists,
        images,
        display_wall_space,
        display_lighting,
        display_install_notes,
        display_rotation_frequency,
        ...safeData
      } = data as Record<string, unknown>;
      const retry = await db
        .from("venue_profiles")
        .update({ ...safeData, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      error = retry.error;
    }
    return { error };
  }
```

and lines 80-95 (insert branch), which strips the same seven keys
**unconditionally, with no failed first attempt**:

```ts
  } else {
    const {
      preferred_sizes,
      interested_in_local_artists,
      images,
      display_wall_space,
      display_lighting,
      display_install_notes,
      display_rotation_frequency,
      ...safeData
    } = data as Record<string, unknown>;
    const { error } = await db
      .from("venue_profiles")
      .insert({ ...safeData, user_id: userId });
    return { error };
  }
```

**Mechanism.** The update retry is triggered by **any** error, not just an
"unknown column" one. A constraint violation on an unrelated field triggers the
narrowed retry, which succeeds, and the route returns 200 `{ success: true }`
(`src/app/api/venue-profile/route.ts:31`). The insert branch is worse: a venue
whose profile row does not yet exist can never persist photos or display details
at all, first time, every time.

**Impact.** A venue uploads gallery photos, writes their lighting and
installation notes, clicks Save, sees "Saved", and none of it is stored. The
public `/venues/[slug]` page stays empty. The client cannot detect this because
the response is a success.

**Fix.** Delete both strip-lists. Migrations 022 and 028 are applied; the
defensive retry is now a data-loss mechanism, not a safety net. If a
back-compat path is genuinely still wanted, the retry must return the dropped
keys to the caller and the route must respond `207`-style with
`{ success: true, dropped: [...] }`, and `mutate()` should treat a non-empty
`dropped` array as a failure.

**Test.** `src/lib/db/venue-profiles.test.ts`: call `upsertVenueProfile` with
`images` on a non-existent row and assert `images` is present in the insert
payload passed to the mocked client. Add an API route test asserting a
round-trip of `images` through PUT then GET.

### E42-d. `|| undefined` makes fields unclearable

`src/app/(pages)/venue-portal/profile/page.tsx:330-334`. `JSON.stringify` omits
`undefined` values, so a venue can never blank out a wall-space description once
set. Low severity, fix alongside E42-a by sending `?? null` and letting the DAO
write NULL.

### E42-e. The venue page's own unsaved-changes guard is weaker than the shared one

`src/app/(pages)/venue-portal/profile/page.tsx:304-309` hand-rolls
`beforeunload` with only `e.preventDefault()` and no `e.returnValue = ""`. The
shared `useUnsavedWarning` (`src/lib/use-unsaved-warning.ts:32-38`) sets both,
plus the capture-phase anchor interception that catches Next.js client
navigation. Replace the local effect with `useUnsavedWarning(hasUnsavedChanges)`.

---

## 4. E43, further silent no-op and false-success actions

### E43-a. Placement status changes, both portals

**Location.** `src/app/(pages)/artist-portal/placements/page.tsx:626-647` and the
identical copy at `src/app/(pages)/venue-portal/placements/page.tsx:733-752`:

```ts
  function updateStatus(id: string, newStatus: PlacementStatus) {
    ...
    setPlacements(placements.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
    authFetch("/api/placements", {
      method: "PATCH",
      body: JSON.stringify({ id, status: apiStatus }),
    })
      .then(() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("wallplace:placement-changed", { ... }));
        }
      })
      .catch((err) => console.error("Status update error:", err));
  }
```

**Mechanism.** Optimistic `setPlacements`, no `res.ok`, no rollback, and the
`.then` fans the "placement changed" event out to the inbox and every other open
surface **even on a 403 or 500**. **Impact.** Accept, decline and mark-complete
all lie. The artist sees "Active", the venue's copy of the record still says
"Pending", and the inbox has been told a state change happened that did not.
**Fix.** `useSaveAction` with `optimistic` returning the snapshot restore, and
the event dispatch moved into `onSuccess`. **Test.** Reject the PATCH; assert the
row reverts to its previous status, an error toast fires, and no
`wallplace:placement-changed` event is dispatched.

### E43-b. Withdraw offer shows success unconditionally

**Location.** `src/components/offers/OffersList.tsx:562-568`:

```tsx
        onConfirm={async () => {
          if (!withdrawFor) return;
          const target = withdrawFor;
          setWithdrawFor(null);
          await act(target.id, "withdraw");
          showToast("Offer withdrawn.");
        }}
```

**Mechanism.** `act()` (lines 169-198) is itself correct: it checks `res.ok` and
calls `setError(...)` on failure. But it swallows the outcome, returning `void`,
so the caller cannot tell success from failure and fires the toast either way.
**Impact.** "Offer withdrawn." while the offer is still live and the artist can
still accept it. **Fix.** Change `act` to `Promise<boolean>` (return `false` in
both the `!res.ok` and `catch` branches) and gate the toast on it, or route the
withdraw through `useSaveAction` with `successMessage: "Offer withdrawn."`.
**Test.** Mock a 409 from `PATCH /api/offers/:id`; assert the error text renders
and "Offer withdrawn." never appears.

### E43-c. Mark fulfilled / close request swallows everything

**Location.** `src/app/(pages)/venue-portal/artwork-requests/[id]/page.tsx:167-175`:

```ts
  async function setStatus(status: "open" | "closed" | "fulfilled") {
    try {
      await authFetch(`/api/artwork-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch { /* swallow */ }
  }
```

**Mechanism.** No `res.ok`, and the `catch` is an explicit swallow. The
subsequent `load()` will eventually show the truth, but a network failure means
neither the state nor an error ever appears. **Impact.** The venue clicks "Mark
fulfilled", nothing happens, no reason is given. **Fix.** `useSaveAction` around
`mutate`, `onSuccess: () => load()`. Note the sibling `fulfillResponse` at lines
183-205 already does this correctly and is the in-file template.
**Test.** Reject the PATCH; assert an error message renders.

### E43-d. "Save Shipping Settings" reports nothing at all

**Location.** `src/app/(pages)/artist-portal/portfolio/page.tsx:1938-1953`:

```tsx
                <button
                  onClick={async () => {
                    if (hasError) return;
                    setSavingDefault(true);
                    await authFetch("/api/artist-profile", {
                      method: "PUT",
                      body: JSON.stringify({
                        default_shipping_price: ukVal,
                        ships_internationally: shipsInternationally,
                        international_shipping_price: intlVal,
                      }),
                    }).catch(() => {});
                    setSavingDefault(false);
                  }}
```

**Mechanism.** No `res.ok`, `.catch(() => {})`, and no success feedback either.
The API can reject this with a 400 `invalid_shipping_price`
(`src/app/api/artist-profile/route.ts:72-80`); the artist sees the button flip
from "Saving..." back to "Save Shipping Settings" and nothing else. **Impact.**
Default shipping silently stays at the old value, so every subsequent order is
priced wrong. **Fix.** `useSaveAction` with `successMessage: "Shipping settings
saved"`. **Test.** Mock a 400; assert an error toast and that the button is
re-enabled.

### E43-e. Report, delete conversation and block user all fake success

**Location.** `src/components/MessageInbox.tsx:1689-1698`, `1716-1725`,
`1744-1753`. The pattern, three times:

```ts
                        await authFetch("/api/messages/report", { method: "POST", body: ... });
                      } catch { /* swallow, UX still confirms */ }
                      setFlagSubmitted("reported");
```

```ts
                      } catch { /* fall through to confirmation UX */ }
                      setFlagSubmitted("deleted");
```

```ts
                      } catch { /* fall through */ }
                      setFlagSubmitted("blocked");
```

**Mechanism.** None checks `res.ok`; all three set the confirmation state
outside the `try`. The comments state the intent explicitly. **Impact.**
"Blocked" is a trust-and-safety promise. Telling a harassed user they have
blocked someone when the block never persisted is the most serious of the three.
**Fix.** All three through `useSaveAction`; `setFlagSubmitted` moves into
`onSuccess`. **Test.** One case per action: reject, assert the confirmation state
is not set and an error toast fires.

### E43-f. The enquiries page has two dead buttons

**Location.** `src/app/(pages)/venue-portal/enquiries/page.tsx:154-159` (desktop
table) and `200-205` (mobile list):

```tsx
                  <button
                    type="button"
                    className="text-xs text-accent hover:underline cursor-pointer"
                  >
                    View
                  </button>
```

**Mechanism.** No `onClick`, no `href`, no form association. `cursor-pointer` and
the accent colour make them look live. **Impact.** The only way to open an
enquiry from this page does nothing. **Fix.** Either wire them to the enquiry
detail (or to `/venue-portal/messages?conversation=<id>`, which is where enquiry
threads actually live), or remove them and make the row itself a link. Given the
enquiry data is already fetched at line 50, wiring is the smaller change.
**Test.** Click "View"; assert `router.push` is called with the expected path.

### E43-g. Saved-item removal, both portals

**Location.** `src/app/(pages)/artist-portal/saved/page.tsx:102-111` and the
identical `src/app/(pages)/customer-portal/saved/page.tsx:104`:

```ts
  async function handleRemove(item: SavedItemRow) {
    setRemoving(item.id);
    try {
      await authFetch("/api/saved", {
        method: "DELETE",
        body: JSON.stringify({ itemType: item.item_type, itemId: item.item_id }),
      });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch { /* ignore */ } finally { setRemoving(null); }
  }
```

**Mechanism.** Awaited but `res.ok` unchecked, and the failure path is an
explicit ignore. **Impact.** The item disappears from the list and comes back on
reload. **Fix.** `mutate` inside `useSaveAction` with optimistic removal and
rollback. Note `SavedContext.toggleSaved` already does this correctly
(`src/context/SavedContext.tsx:101-141`); these pages should arguably call
`toggleSaved` rather than duplicating the endpoint.

### E43-h. Public enquiry form confirms success inside its own catch

**Location.** `src/app/(pages)/browse/[slug]/ArtistProfileClient.tsx:1141-1170`:

```tsx
                      await authFetch("/api/messages", { method: "POST", body: ... });
                      // Also save to enquiries table for backward compatibility
                      await fetch("/api/enquiry", { method: "POST", headers: ..., body: ... });
                      setEnquirySent(true);
                    } catch {
                      setEnquirySent(true);
                    }
```

**Mechanism.** Neither request checks `res.ok`, and the `catch` sets the exact
same success state as the happy path. This is the purest instance of the class in
the codebase. **Impact.** This is the artist's primary inbound lead form, on the
public profile and artwork pages. Rate limiting, moderation blocks, an
unauthenticated session or any 500 all render "Enquiry sent" and the artist never
hears about it. **Fix.** `useSaveAction`; the `/api/messages` write is the
required one and the `/api/enquiry` mirror is best-effort, so:

```ts
run: async () => {
  await mutate("/api/messages", { method: "POST", body });          // must succeed
  await mutate("/api/enquiry", { method: "POST", body: legacy })    // best effort
    .catch(() => { /* legacy mirror, non-blocking */ });
},
```

**Test.** Reject `/api/messages`; assert the form stays open, an error renders,
and `enquirySent` is false. Reject only `/api/enquiry`; assert success still
shows.

### E43-i. Header mark-as-read calls

`src/components/Header.tsx:529` (`/api/messages` PATCH), `618` and `665`
(`/api/notifications` PATCH). Fire-and-forget, no `res.ok`. Low severity: the
badge count self-corrects on the next poll. Migrate to `mutate` with a silent
`.catch` so the intent is explicit rather than accidental.

### E43-j. `VenuePortalLayout` self-heal

`src/components/VenuePortalLayout.tsx:96-100`:

```ts
    authFetch("/api/venue-profile", {
      method: "PATCH",
      body: JSON.stringify({ ensureProfile: true }),
    }).catch(() => {});
```

A failure here leaves the venue with no `venue_profiles` row, and every
venue-only API then fails with a misleading error (the comment above it says
exactly that). It should surface a blocking error state rather than swallow.

### E43-k. Wall auto-save, UNCONFIRMED

`useUnsavedWarning` has exactly two consumers
(`artist-portal/profile/page.tsx:518`, `artist-portal/portfolio/page.tsx:321`).
`src/app/(pages)/venue-portal/walls/[id]/page.tsx` contains **no** layout save
call at all: the only mutation is the wall delete at lines 190-205, which is
correct (checks `res.status`, toasts on failure). Layout persistence goes through
`/api/walls/[id]/layouts` from the visualizer, and
`src/components/visualizer/WallVisualizer.tsx:669` does check `res.ok`. I could
not reproduce a "wall auto-save clears the unsaved warning early" defect from the
code. **Verdict UNCONFIRMED.** The related confirmed defect is E41-a's
`initialFormJson.current` reset before the save lands, which is the same class,
on the portfolio form.

---

## 5. Bug 12, the new-blog editor

### 5.1 Does `BLOGS_V1` explain it? No.

`BLOGS_V1` defaults to `devDefault: true, prodDefault: false`
(`src/lib/feature-flags.ts:87-95`). The flag is read in exactly two places:

- `src/app/api/blogs/route.ts:84-89`

```ts
export async function POST(request: Request) {
  if (!isFlagOn("BLOGS_V1")) {
    return NextResponse.json(
      { error: "Blog editor isn't enabled yet." },
      { status: 403 },
    );
  }
```

- `src/app/api/blogs/[id]/route.ts:100`, the same guard on PATCH.

The client checks the response. `src/components/BlogEditor.tsx:126-131`:

```ts
      const data = await res.json();
      if (!res.ok) {
        setError(describeSaveError(data));
        setSaving("error");
        return null;
      }
```

So with the flag off the editor would fire **one visible POST**, get a 403, and
render "Save failed" plus the red text "Blog editor isn't enabled yet."
(`describeSaveError` returns `obj.error` when there is no `issues`/`details`,
`src/lib/blogs/describe-save-error.ts:37`). That is the opposite of the reported
"zero network requests, shows Saved". **The flag does not explain bug 12.**

### 5.2 What the flag *is* responsible for (real defect, fix it anyway)

`grep -rn "BLOGS_V1" src/` returns **no client-side gate**. Specifically:

- `src/components/ArtistPortalLayout.tsx:35` renders the "Blogs" nav item
  unconditionally.
- `src/app/(pages)/artist-portal/blogs/new/page.tsx` renders `<BlogEditor />`
  with no flag check at all (the whole file is 10 lines).
- `src/app/(pages)/artist-portal/blogs/page.tsx` and `blogs/[id]/edit/page.tsx`
  contain no `isFlagOn` call.

So in production, where `BLOGS_V1` is off, every artist sees a Blogs nav item, a
fully interactive editor, and enabled buttons whose every save 403s. A gated
feature must hide its entry point, not present a working-looking editor. That is
a defect regardless of the flag's role in the reported repro.

**Fix.**

1. Gate the nav item: `...(isFlagOn("BLOGS_V1") ? [{ label: "Blogs", href: "/artist-portal/blogs" }] : [])`
   in `ArtistPortalLayout`'s link list.
2. Gate the routes. In each of the three blog pages, `if (!isFlagOn("BLOGS_V1")) notFound();`
   (`import { notFound } from "next/navigation"`). These are server components, so
   the check runs before any client JS ships.
3. Keep the 403 on the API as defence in depth.

### 5.3 The "zero requests" path

The only mechanism in this code that produces a save with **no network request
and no error surfaced** is `authFetch` throwing before `fetch`, from
`await supabase.auth.getSession()` at `src/lib/api-client.ts:8`. `supabase` is a
plain `createClient(...)` with non-null-asserted env vars
(`src/lib/supabase.ts:3-6`), so a placeholder or unreachable
`NEXT_PUBLIC_SUPABASE_URL` makes `getSession()` reject or hang on its token
refresh. A rejection lands in `handleCreate`'s catch (line 136) and shows
"Network error"; a hang leaves `saving === "saving"` and shows "Saving...".

**I cannot confirm a code path that shows the literal "Saved" with zero
requests.** `saving` starts at `"idle"` and only reaches `"saved"` after a 2xx
(lines 87, 133, 173). Marking that specific symptom **UNCONFIRMED**. The two
confirmed defects that the repro must resolve to are (a) the missing client-side
flag gate above and (b) `authFetch`'s pre-fetch rejection path, which section 1.1
fixes by converting it into a typed `NetworkError`.

**Fix (in addition to the gating).** Migrate `BlogEditor` to
`mutate` + `useSaveAction`. Also fix the auto-save at
`src/components/BlogEditor.tsx:100-106`, which is silent by design and can
therefore fail without the author noticing:

```ts
  useEffect(() => {
    if (!currentId) return;
    if (!canAutoSave) return;
    if (!title.trim() || !body.trim()) return;
    const t = setTimeout(saveExisting, 800);
    return () => clearTimeout(t);
  }, [currentId, title, body, cover, featured, saveExisting, canAutoSave]);
```

It does set `saving = "error"` on failure, which the status line shows, but there
is no unsaved-changes guard. Add `useUnsavedWarning(saving !== "saved" && dirty)`.

**Test.** `src/components/BlogEditor.test.tsx`:
- with `isFlagOn` mocked false, assert `/artist-portal/blogs/new` renders a
  not-found rather than the editor;
- with the flag on and `mutate` rejecting `ApiError(403, ...)`, assert the status
  reads "Save failed", the message renders, and `router.replace` is not called;
- with `mutate` resolving, assert exactly one POST and one `router.replace` to
  the edit URL.

---

## 6. Bug 14, the login "Sign In" button stops submitting

### 6.1 What the code guarantees

`src/app/(pages)/login/page.tsx:167-173`:

```tsx
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-accent text-white ... disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
```

The button is a plain `type="submit"` inside the `<form onSubmit={handleSubmit}>`
at line 132. There is no `onClick`, so nothing can `preventDefault` the click, and
implicit form submission does not depend on React at all. The asymmetry in the
report (a click does nothing, `form.requestSubmit()` works) leaves exactly two
mechanisms: the button carries `disabled`, or something covers it.

`HTMLElement.click()` on a disabled button is a silent no-op with no error, which
matches "no network request, no error" precisely, and `requestSubmit()` bypasses
the button entirely, which matches the rest.

### 6.2 Root cause: `loading` can get stuck true

`src/app/(pages)/login/page.tsx:55-87`:

```ts
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const precheck = await fetch("/api/auth/precheck", { ... });
      if (precheck.status === 429) { ...; setLoading(false); return; }
    } catch { /* network error, fall through and let Supabase handle */ }

    const { error: authError } = await signIn(email, password);

    if (authError) { ...; setLoading(false); return; }

    // Redirect happens via the useEffect above when user state updates
  }
```

Two confirmed leaks:

1. **`signIn` is not wrapped.** `AuthContext.signIn`
   (`src/context/AuthContext.tsx:112-115`) returns
   `supabase.auth.signInWithPassword(...)`'s result. supabase-js converts
   *auth* errors into the returned `{ error }`, but a genuine transport failure
   (unreachable auth host, DNS failure, an aborted request after a sign-out that
   invalidated the refresh token) rejects. `handleSubmit` has no try/catch around
   it, so the rejection escapes as an unhandled promise rejection, the remaining
   statements never run, and `setLoading(false)` is never called. The button is
   now permanently disabled, labelled "Signing in...", with no error text, and no
   click will ever reach the form again. This is the reported behaviour.
2. **The success path deliberately never resets `loading`** (the comment on line
   86). That is safe only while `if (user) return null;` (line 91) holds. If the
   redirect effect at lines 39-53 lands the user back on `/login` for any reason,
   the form re-renders with `loading` still true.

The "after logging out" framing fits: `Header.tsx:829` is
`onClick={() => signOut()}` with no navigation, so the portal layout's own guard
does the redirect, and the session teardown is exactly the window in which a
`signInWithPassword` transport rejection is most likely.

Secondary candidate, also confirmed as a real defect but a weaker fit: the cookie
banner at `src/components/CookieBanner.tsx:20-24` is
`fixed bottom-0 inset-x-0 z-50 p-4` and, before its 300 ms reveal timer fires,
carries `opacity-0` with **no** `pointer-events-none`. For those 300 ms it is an
invisible full-width click-catcher across the bottom of the viewport. It only
renders while `consentGiven === null` (line 18), so it cannot be a permanent
blocker, but it should be fixed regardless.

### 6.3 Fix

```ts
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");

    try {
      try {
        const precheck = await fetch("/api/auth/precheck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "login" }),
        });
        if (precheck.status === 429) {
          setError("Too many attempts. Please wait a minute and try again.");
          return;
        }
      } catch { /* precheck is advisory; let Supabase be the authority */ }

      const { error: authError } = await signIn(email, password);
      if (authError) {
        setError(
          authError.message === "Invalid login credentials"
            ? "Invalid email or password"
            : authError.message,
        );
        return;
      }
      // Success. The redirect effect fires when `user` lands; `finally`
      // re-enables the button so a failed redirect can never strand it.
    } catch (err) {
      // signIn() rejects (rather than returning { error }) on transport
      // failures. Previously this escaped as an unhandled rejection and left
      // `loading` true forever, permanently disabling the submit button.
      console.error("Login error:", err);
      setError("Could not reach the sign-in service. Please try again.");
    } finally {
      setLoading(false);
    }
  }
```

Plus, in `src/components/CookieBanner.tsx:22-24`, add `pointer-events-none` to
the hidden state:

```tsx
      className={`fixed bottom-0 inset-x-0 z-50 p-4 transition-opacity duration-500 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
```

### 6.4 Test

`src/app/(pages)/login/page.test.tsx` currently covers only the
already-logged-in redirect. Add:

- `signIn` mocked to reject; submit the form; assert the button is **enabled**
  afterwards and error text is rendered;
- `signIn` mocked to resolve `{ error: {...} }`; assert the button is re-enabled;
- a double-submit within one tick fires `signIn` exactly once;
- an integration-level assertion that clicking the button (not
  `requestSubmit`) calls `signIn`, which is the regression this bug needs.

---

## 7. Bug 7, `"undefined"` size label reaching the cart

**Location.** `src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.tsx:499-502`:

```ts
        {work.available && selectedPricing && (() => {
          const frameLabel = selectedFrame ? ` + ${selectedFrame.label}` : "";
          const sizeLabel = `${selectedPricing.label}${frameLabel}`;
          const totalPrice = displayPrice ?? selectedPricing.price;
```

with the default selection at line 89:

```ts
  const selectedPricing = work.pricing[selectedSizeIdx] || work.pricing[0];
```

**Mechanism.** `selectedPricing` is truthy (a row object exists) but its `label`
can be missing, because nothing validates it. `src/app/api/artist-works/route.ts:36`
destructures `pricing` raw, line 38 checks only `if (!id || !title || !image)`,
and line 169 writes `pricing: pricing || []` straight into the `jsonb` column.
Contrast the 45-line `frameOptions` sanitiser immediately above it (lines
88-132), which *does* enforce a non-empty string label. So a labelless row
persists, and on the artwork page the template literal coerces `undefined` to the
string `"undefined"`, which is then passed as `size:` to `addItem` (lines 524 and
557).

`normaliseSize` cannot rescue it, `src/context/CartContext.tsx:32`:

```ts
const normaliseSize = (s?: string) => (s && s.trim() ? s : "Original");
```

`"undefined"` is a non-blank string, so it survives and renders verbatim in the
cart, the checkout summary and the order confirmation email.

The same file already handles this correctly twice, at lines 530 and 563
(`dimensions: selectedPricing.label || work.dimensions`), so line 501 is an
inconsistency, not a design choice.

Two knock-on effects, both confirmed:

- `src/app/api/checkout/route.ts:215-217` matches the cart line against the DB
  tier with `p?.label?.toLowerCase?.() === item.size?.toLowerCase?.()`. A
  labelless row never matches, so `unitPence` falls back to the **client-supplied**
  price (line 213) and the anti-tampering check becomes a no-op for that line.
- `src/app/(pages)/artist-portal/portfolio/page.tsx:1061` (`r.label.trim()`) and
  `:1161` (`s.label.toLowerCase()`) will throw a TypeError on such a row, taking
  the bulk price editor down.

**Fix, all three layers.**

1. **API (authoritative).** In `src/app/api/artist-works/route.ts`, sanitise
   `pricing` the way `frameOptions` already is, before the write:

```ts
    // Size rows: a missing/blank label used to persist straight into the
    // jsonb column and then render as the string "undefined" in the cart,
    // and made the checkout price check unmatchable. Reject rather than
    // coerce, so the artist finds out at save time.
    const rawPricing = Array.isArray(pricing) ? pricing : [];
    const sanitizedPricing = rawPricing.map((p: unknown, i: number) => {
      const row = (p ?? {}) as Record<string, unknown>;
      const label = typeof row.label === "string" ? row.label.trim() : "";
      const price = typeof row.price === "number" ? row.price : Number(row.price);
      if (!label) {
        throw new BadRequest("invalid_size_row", `Size row ${i + 1} needs a label.`);
      }
      if (!Number.isFinite(price) || price < 0) {
        throw new BadRequest("invalid_size_price", `Size "${label}" needs a price of zero or more.`);
      }
      return { ...row, label, price: Math.round(price * 100) / 100 };
    });
    // ... pricing: sanitizedPricing
```

   (Implement `BadRequest` as a local helper returning
   `NextResponse.json({ error, message }, { status: 400 })`, matching the shape
   `describeSaveError` and `mutate` already read.)

2. **Read path (defence for rows already in the DB).** Line 501 becomes:

```ts
          const sizeLabel = `${selectedPricing.label || work.dimensions || "Original"}${frameLabel}`;
```

   and lines 171, 608 and 620, which call `.toLowerCase()` on a possibly-missing
   label, get the same guard.

3. **Cart (last line of defence).** `src/context/CartContext.tsx:32`:

```ts
// Normalise a blank/whitespace size to the canonical no-variant label so that
// addItem and mergeCarts deduplicate on the same value. "undefined"/"null" are
// treated as blank too: a missing size label upstream stringifies to those in a
// template literal and used to render verbatim in the cart (Bug 7).
const normaliseSize = (s?: string) => {
  const t = s?.trim();
  if (!t || t === "undefined" || t === "null") return "Original";
  return t;
};
```

**Tests.**
- `src/app/api/artist-works/route.test.ts`: POST with
  `pricing: [{ price: 120 }]` returns 400 `invalid_size_row` and writes nothing.
- `src/context/CartContext.test.tsx`: `addItem` with `size: "undefined"` produces
  a line whose `size` is `"Original"`, and two such adds dedupe to one line.
- `ArtworkPageClient` render test: a work whose `pricing[0]` has no `label`
  renders an Add to cart control and passes a non-`"undefined"` size.

---

## 8. Inventory of every save/mutation control

Verdicts: **SAFE** = awaits, checks `res.ok`, only reports success on 2xx.
**BROKEN** = fakes success, drops the write, or is dead. **UNVERIFIED** = not
fully traced.

### Artist portal

| Control | File:line | Handler behaviour | Verdict |
|---|---|---|---|
| Save profile | `artist-portal/profile/page.tsx:652` | awaits, `!res.ok` guard, error toast, sets saved after | SAFE |
| + Add Work / Save (work modal) | `artist-portal/profile/page.tsx:630`, `558` | writes only to `localStorage`, wiped on next refetch | BROKEN |
| Delete work (profile page grid) | `artist-portal/profile/page.tsx:1264` | opens the localStorage-only editor | BROKEN |
| Banner / avatar upload | `artist-portal/profile/page.tsx:538-547` | `uploadImage` unwrapped; a throw leaves `uploading` stuck | BROKEN |
| Save Changes (work form) | `artist-portal/portfolio/page.tsx:1805-1809` | `saveWorks` not awaited, no `res.ok`, toast fires immediately, dirty snapshot cleared early | BROKEN |
| Delete work | `artist-portal/portfolio/page.tsx:470-476` | fire-and-forget DELETE, row removed regardless | BROKEN |
| Bulk delete | `artist-portal/portfolio/page.tsx:543-551` | fire-and-forget per id, unconditional success toast | BROKEN |
| Bulk set availability | `artist-portal/portfolio/page.tsx:520-528` | `saveWorks` + unconditional toast | BROKEN |
| Bulk price editor save | `artist-portal/portfolio/page.tsx:1060-1079` | `saveWorks` + unconditional toast; also destroys per-size fields | BROKEN |
| Bulk copy sizes | `artist-portal/portfolio/page.tsx:1239-1243`, `1312` | same, plus drops shipping/in-store | BROKEN |
| Bulk add save all | `artist-portal/portfolio/page.tsx:967-968` | `saveWorks` + count toast; failed uploads silently excluded | BROKEN |
| Reorder (drag-drop) | `artist-portal/portfolio/page.tsx:490` | `saveWorks`, no feedback | BROKEN |
| Save Shipping Settings | `artist-portal/portfolio/page.tsx:1938-1953` | no `res.ok`, `.catch(() => {})`, no feedback either way | BROKEN |
| Primary image upload | `artist-portal/portfolio/page.tsx:1550`, `2023`, `2082` | unhandled rejection, spinner never clears | BROKEN |
| Blog: Save as draft | `components/BlogEditor.tsx:112-141` | awaits, `!res.ok` guard, `describeSaveError` | SAFE (but ungated, see §5.2) |
| Blog: Submit for review | `components/BlogEditor.tsx:143-178` | awaits, `!res.ok` guard | SAFE (ungated) |
| Blog: auto-save | `components/BlogEditor.tsx:67-106` | correct, but silent and no unsaved guard | SAFE |
| Placement accept/decline/complete | `artist-portal/placements/page.tsx:626-647` | optimistic, no `res.ok`, no rollback, event fanned out regardless | BROKEN |
| Placement respond (counter) | `artist-portal/placements/page.tsx:~600-624` | awaits with try/finally | UNVERIFIED |
| Bulk archive placements | `artist-portal/placements/page.tsx:652+` | confirm dialog, snapshot present | UNVERIFIED |
| Remove saved item | `artist-portal/saved/page.tsx:102-111` | awaited, `res.ok` unchecked, `catch {}` | BROKEN |
| Subscribe / manage billing | `artist-portal/billing/page.tsx:190`, `262` | awaits, checks `res.ok` | SAFE |
| Stripe Connect onboard | `artist-portal/settings/page.tsx` (via venue pattern) | UNVERIFIED | UNVERIFIED |
| Showroom create/edit | `artist-portal/showroom/new`, `[id]` | not traced | UNVERIFIED |
| Collections create/edit | `artist-portal/collections/page.tsx` | not traced | UNVERIFIED |
| Artwork-request respond | `artist-portal/artwork-requests/[id]/page.tsx` | not traced | UNVERIFIED |

### Venue portal

| Control | File:line | Handler behaviour | Verdict |
|---|---|---|---|
| Save Changes (profile) | `venue-portal/profile/page.tsx:324-364` | awaits and checks `res.ok`, but two fields are absent from the payload and seven more are dropped server-side | BROKEN |
| Venue Details inputs | `venue-portal/profile/page.tsx:423-453` | `"Not set"` / `"Your Venue"` bound into `value` | BROKEN |
| Local-artists toggle | `venue-portal/profile/page.tsx:610-611` | marks dirty, never sent | BROKEN |
| Preferred sizes chips | `venue-portal/profile/page.tsx:319-322`, `251` | never sent, hydrated from a hard-coded literal | BROKEN |
| Venue photo upload | `venue-portal/profile/page.tsx:266-293` | client side correct; `images` dropped by the DAO on insert | BROKEN |
| Placement accept/decline/complete | `venue-portal/placements/page.tsx:733-752` | identical to the artist copy | BROKEN |
| Mark fulfilled / close request | `venue-portal/artwork-requests/[id]/page.tsx:167-175` | no `res.ok`, `catch { /* swallow */ }` | BROKEN |
| Fulfil response | `venue-portal/artwork-requests/[id]/page.tsx:183-205` | awaits, checks `res.ok`, surfaces `data.error` | SAFE |
| Enquiries "View" | `venue-portal/enquiries/page.tsx:154-159` | no `onClick` | BROKEN (dead) |
| Enquiries "View Details" | `venue-portal/enquiries/page.tsx:200-205` | no `onClick` | BROKEN (dead) |
| Remove saved item | `venue-portal/saved/page.tsx` | mirrors the artist page | UNVERIFIED |
| Wall create | `venue-portal/walls/new/page.tsx` | not traced | UNVERIFIED |
| Wall delete | `venue-portal/walls/[id]/page.tsx:190-205` | checks `res.status`, error toast | SAFE |
| Wall layout save | `components/visualizer/WallVisualizer.tsx:669` | checks `res.ok` | SAFE |
| Stripe Connect onboard / dashboard | `venue-portal/settings/page.tsx:102`, `122` | awaits, checks `res.ok` | SAFE |
| Create artwork request | `venue-portal/artwork-requests/new/page.tsx` | not traced | UNVERIFIED |
| Profile self-heal | `components/VenuePortalLayout.tsx:96-100` | `.catch(() => {})` on a load-bearing call | BROKEN |

### Customer portal, account and public

| Control | File:line | Handler behaviour | Verdict |
|---|---|---|---|
| Remove saved item | `customer-portal/saved/page.tsx:104` | awaited, `res.ok` unchecked, ignored on failure | BROKEN |
| Favourite / unfavourite (global) | `context/SavedContext.tsx:92-148` | snapshot, optimistic, throws on `!res.ok`, rolls back, error toast | SAFE (reference) |
| Add to cart | `context/CartContext.tsx:144-186` | local-only by design, returns a typed result | SAFE |
| Checkout | `checkout/page.tsx:390` | awaits; `res.ok` not read, relies on `data.url` | UNVERIFIED |
| Enquiry form (public artist page) | `browse/[slug]/ArtistProfileClient.tsx:1141-1170` | success state set inside the catch | BROKEN |
| Make offer | `components/offers/MakeOfferModal.tsx` | not traced | UNVERIFIED |
| Accept / decline offer | `components/offers/OffersList.tsx:169-198` | awaits, checks `res.ok`, sets error | SAFE |
| Withdraw offer | `components/offers/OffersList.tsx:562-568` | unconditional success toast after a swallowing `act()` | BROKEN |
| Pay for offer | `components/offers/OffersList.tsx:200-215` | `res.ok` not read; `data.error` branch present | UNVERIFIED |
| Send message | `components/MessageInbox.tsx:~1200` | not traced | UNVERIFIED |
| Report user | `components/MessageInbox.tsx:1689-1698` | confirms outside the try, no `res.ok` | BROKEN |
| Delete conversation | `components/MessageInbox.tsx:1716-1725` | same | BROKEN |
| Block user | `components/MessageInbox.tsx:1744-1753` | same | BROKEN |
| Mark messages read | `components/Header.tsx:529` | fire-and-forget | BROKEN (low) |
| Mark notifications read | `components/Header.tsx:618`, `665` | fire-and-forget | BROKEN (low) |
| Accept terms | `components/ApplicationForm.tsx:290`, `295` | fire-and-forget, no `res.ok` | BROKEN |
| Account preferences | `account/**` via `/api/account/preferences` | not traced | UNVERIFIED |
| Delete account | `components/AccountDangerZone.tsx:46` | has its own test coverage | SAFE |

**Totals: 24 BROKEN, 14 SAFE, 16 UNVERIFIED.**

---

## 9. Gate 2, listing integrity

### 9.1 The pipeline as built

| Step | Code | Data shape | Persisted to |
|---|---|---|---|
| Pick / drop image | `artist-portal/portfolio/page.tsx:1527` `handleImageFile` | `File` | none |
| Validate + resize | `lib/upload.ts:89` `uploadImage`, `lib/image.ts:18` `resizeImage` | `Blob` (WebP, max 2000px for `artworks`) | none |
| Upload | `lib/upload.ts:141-158` | path `${user.id}/${Date.now()}-${rand}.${ext}` | Storage bucket `artworks` |
| Public URL | `getPublicUrl(path).data.publicUrl` | `string` | form state `form.imagePreview` |
| Sizes + prices | `WorkFormState.sizes` at `portfolio/page.tsx:90`, plus index-parallel `sizeShipping[]`, `inStorePricing[]`, `sizeStock[]` | `{label, price}[]` and `string[]` | none |
| Build work | `handleSubmit` at `portfolio/page.tsx:1651` | `ArtistWork` with `pricing: SizePricing[]` | none |
| POST | `saveWorks` at `portfolio/page.tsx:404-468` | JSON body, one request **per work in the whole portfolio** | `/api/artist-works` |
| Server | `api/artist-works/route.ts:25` | GATING_V1 gate, post-limit gate, frame + image + description sanitisers | calls `upsertWork` |
| Write | `lib/db/artist-works.ts:15` `upsertWork` | service-role client | table `artist_works` |
| Publish | no per-work publish column exists | | |
| `/browse` | `browse/page.tsx:552` -> `/api/browse-artists` -> `getAllArtists()` -> `artistsToGalleryWorks` (`data/galleries.ts:47`) | flattens every work, no image/price filter | |
| Public profile | `browse/[slug]/page.tsx:590-592` | filters only on a non-empty `image` string | |
| Work page | `browse/[slug]/[workSlug]/page.tsx:92` | `artist.works.find(w => slugify(w.title) === workSlug)` | |

**What actually makes a work public.** There is no `published` or `status`
column on `artist_works` (confirmed against `website/supabase/migrations/`, and
`034_rls_core_tables.sql:72-80`). A work is public iff its artist profile has
`review_status = 'approved'`, and, when `GATING_V1` is on, the artist's
subscription is `active` or `trialing` (`lib/db/merged-data.ts:39-42`).
`GATING_V1` currently defaults off in both dev and prod
(`lib/feature-flags.ts:78-86`). `available` is **not** a visibility gate; it only
switches the badge to "Sold" (`ArtistProfileClient.tsx:586-594`).

### 9.2 Defects on the listing path

Numbering matches the audit sweep. All CONFIRMED unless stated.

**L1. Upload failure is silent and locks the uploader.**
`portfolio/page.tsx:1550` `const url = await uploadImage(file, "artworks");`
inside `handleImageFile`, which has no try/catch. `uploadImage` throws on wrong
MIME, over 10 MB, no session, or a storage error, so `setUploading(false)` (line
1560) never runs and no error text is set. The drop handlers at lines 2023 and
2082 call it as `if (file) handleImageFile(file);` with no `await` and no
`.catch`, producing an unhandled rejection.
*Fix:* wrap in `try/catch/finally`, set `formError` from the caught message,
always clear `uploading`; make the drop handlers `void handleImageFile(file).catch(...)`.

**L2. Client MIME check is wider than the server allow-list.**
`portfolio/page.tsx:1528` `if (!file.type.startsWith("image/"))` versus
`lib/upload.ts:5` `ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]`.
`image/heic` (the iPhone camera default), `image/avif`, `image/svg+xml` and
`image/tiff` pass the client gate and then throw into L1. There is also no
client-side size check before the 10 MB server throw.
*Fix:* share `ALLOWED_TYPES` and `MAX_BYTES` from `lib/upload.ts`, check both
client-side, and add an explicit HEIC message ("iPhone HEIC photos are not
supported yet, please export as JPEG").

**L3. Save is not blocked during upload, and a work can be published with a stock photo.**
`portfolio/page.tsx:1764` `image: form.imagePreview || "https://picsum.photos/seed/new-work/900/600",`
and the disabled predicate at line 3026,
`disabled={!form.title || form.sizes.filter((s) => s.label && s.price > 0).length === 0}`,
which ignores `uploading`. The mirrored top save button (lines 1986-1991) has no
`disabled` at all, and `handleSubmit` never requires an image.
*Fix:* require a real `form.imagePreview`, add `|| uploading` to both disabled
predicates, and delete the picsum fallback.

**L4. `saveWorks` never checks `res.ok`.** See E41-a.

**L5. `pricesBySize` stripped on every save.** See E41-d.

**L6/L7. Bulk editors destroy per-size shipping, in-store price and stock.** See E41-e.

**L8. `upsertWork` is not scoped by owner.** `lib/db/artist-works.ts:22-32`:

```ts
  const { data: existing } = await db
    .from("artist_works")
    .select("id")
    .eq("id", work.id)
    .single();

  async function attempt(r: Record<string, unknown>) {
    if (existing) {
      return db.from("artist_works").update(r).eq("id", work.id);
    }
```

The probe and the UPDATE both filter on `id` alone, on the service-role client
that bypasses RLS, and `row` sets `artist_id` to the caller's profile. Work ids
are publicly enumerable (`GalleryWork.id = work.id`, served by
`/api/browse-artists`, `data/galleries.ts:50`). So a crafted POST can overwrite
another artist's listing **and reassign it to the attacker**. `deleteWork` at
lines 129-133 correctly does `.eq("id", workId).eq("artist_id", artistProfileId)`,
which proves the omission is a bug.
*Fix:* add `.eq("artist_id", artistProfileId)` to both the probe and the update,
and return a 404 when the probe finds an id the caller does not own.
*Test:* artist B posts artist A's work id; assert 404 and that A's row is unchanged.

**L9. `pricing` gets no validation at the API boundary.** See Bug 7, section 7.

**L10. Unapproved and lapsed artists are fully public at a direct URL.**
`lib/db/merged-data.ts:48-53` `getArtistBySlug` calls `getArtistProfileBySlug`,
which uses `getSupabaseAdmin()` (`lib/db/artist-profiles.ts:41-42`) and applies
neither the `review_status = 'approved'` filter that `getAllDatabaseArtists`
applies (line 68) nor the GATING_V1 subscription filter. So `/browse/<slug>` and
`/browse/<slug>/<work>` serve a pending, rejected or lapsed artist's whole
portfolio, with OG tags, to anyone with the URL. The admin review gate only hides
them from the listing.
*Fix:* apply the same `review_status` and subscription filters in
`getArtistBySlug`; return `notFound()` otherwise.

**L11. GATING_V1 "drafts" are published and labelled "Sold".**
`api/artist-works/route.ts:156-158` sets `effectiveAvailable = sub.active` for a
new work so drafts "can be saved during onboarding without publishing", but
`available` is not a visibility flag anywhere. The work appears on the public
profile marked "Sold".
*Fix:* introduce a real `status` column (`draft | live`) on `artist_works`, filter
on it in `browse/[slug]/page.tsx:590` and `data/galleries.ts:47`, and stop
overloading `available`.

**L12. Works are addressed by slugified title, so duplicates are unreachable.**
`browse/[slug]/[workSlug]/page.tsx:92`. The API only warns about duplicate titles
(`route.ts:209-213`), and `slugify` returns `""` for titles with no ASCII
alphanumerics (`lib/slugify.ts:31-32`). Two works called "Untitled" collide; the
second is permanently unreachable and both cards link to the first.
*Fix:* append a short id suffix to the work slug and match on it.

**L13. A stale five-minute `sessionStorage` cache that saves never invalidate.**
`hooks/useCurrentArtist.ts:46-52` reads `wallplace-artist-${user.id}` and uses it
if under 300000 ms old. Nothing clears it after a save, and `portfolio/page.tsx`
never calls `refetch()`. The seeding effect is one-shot-guarded
(`portfolio/page.tsx:323-326`, `if (!artist || initialised) return;`), so even the
background refresh does not repopulate `works`.
*Impact:* save a work, navigate away, come back within five minutes, and the new
work is missing from the grid. This is the most likely cause of "my edit did not
persist" reports that are not actually data loss.
*Fix:* clear the cache key in `saveWorks`' `onSuccess` and expose
`refetch()` from `useCurrentArtist` for the portfolio page to call.

**L14. Bulk-add drops failed uploads silently.**
`portfolio/page.tsx:752-758` catches the upload error, logs it and only clears the
per-draft `uploading` flag; the draft keeps its blob-URL preview so it still looks
fine. `bulkAddSaveAll` then filters on `d.imageUrl` (lines 882-888) and reports
`Added ${newWorks.length} works` (line 968).
*Fix:* mark the draft as failed, render the reason on the card, and block "Save
all" until every draft is resolved.

**L15. Bulk-add in-store prices are computed then discarded.** Built at
`portfolio/page.tsx:924-930`, attached at line 960, but `saveWorks`' POST body
(lines 424-442) has no `inStorePricing` key and the API never reads one
(`route.ts:36`). The single-work form has a second, working path that stores them
inside `pricing[i].inStorePrice` (lines 1753-1757).
*Fix:* make bulk-add use the same `pricing[i].inStorePrice` path.

**L16. Per-size arrays are re-aligned by label, so duplicate labels cross-assign.**
`portfolio/page.tsx:1729` `const formIdx = form.sizes.findIndex((x) => x.label === s.label);`
returns the first match, so two "A4" rows both take row 1's shipping, in-store
price and stock. *Fix:* carry a stable row id, or align by index.

**L17. Post-limit and duplicate detection are dead for every unapproved artist.**
`lib/db/artist-works.ts:5-12` uses the **anon** client:

```ts
export async function getWorksByArtistProfileId(artistProfileId: string): Promise<DbArtistWork[]> {
  const { data } = await supabase
    .from("artist_works")
    .select("*")
    .eq("artist_id", artistProfileId)
```

`supabase` is the anon-key singleton (`lib/supabase.ts:6`) with no session on the
server, so RLS `artist_works_select_public` (requires `review_status = 'approved'`)
returns nothing and `artist_works_select_own` cannot match (`auth.uid()` is null).
Every new artist is forced to `review_status = 'pending'`
(`lib/db/artist-profiles.ts:124-129`). So in `route.ts:68-69`, `existingWorks` is
always `[]`: the tier post limit never fires, `isNewWork` is always true, and
duplicate warnings never fire. `GET /api/artist-works` also returns
`{ works: [] }` for these artists, which is what `BlogEditor.tsx:51` and
`WallVisualizer.tsx:374` consume. The query error is discarded, so it fails with
no log.
*Fix:* use `getSupabaseAdmin()` in `getWorksByArtistProfileId` (it is only ever
called from server routes that have already authorised the caller), and surface
the error.

**L18. Deletes are fire-and-forget.** See E41-b.

**L19. Every save rewrites the whole portfolio.** See E41-c.

**L20. The stated image-protection behaviour does not exist.**
`portfolio/page.tsx:2063` and `2094` tell the artist "Public versions are capped
to a smaller resolution to discourage image theft, your full-resolution original
is kept on file for fulfilment." There is one upload and one URL
(`lib/upload.ts:141-158`); no original is retained. And `lib/image.ts:29-31`:

```ts
      // No resize needed
      if (width <= maxDimension && height <= maxDimension) {
        resolve(file);
        return;
      }
```

returns the untouched original when both dimensions are within 2000px, so a
1920x1280 original is served at full resolution as the "public version". Both
halves of the promise are false.
*Fix:* either implement it (upload an original to a private bucket plus a capped
public derivative) or delete the copy. Do not ship the claim as-is.

**L21. Dead WebP fallback and a leaked object URL.** `lib/image.ts:62-79` treats
a null blob as "WebP unsupported" and retries as JPEG, but per the canvas spec an
unsupported `toBlob` type falls back to `image/png` and still returns a blob, so
the JPEG branch is unreachable and non-WebP browsers ship a PNG that is often
larger than the source. `lib/image.ts:83` `img.src = URL.createObjectURL(file);`
is never revoked.

**L22. `getOptimizedUrl` ignores its arguments.** `lib/image.ts:92-99` returns
`url` unchanged, so `getThumbnailUrl` / `getPreviewUrl` are no-ops and full-size
2000px blobs are served into thumbnail grids.

**L23. API test coverage is limited to a disabled flag.**
`api/artist-works/route.test.ts` has five tests, all for GATING_V1, which
defaults off in both environments. Nothing tests the post limit, `pricing`,
image sanitisation, DELETE, or `upsertWork`. There is no
`src/lib/db/artist-works.test.ts`.

### 9.3 Gate 2 acceptance test

Add `website/e2e/listing-integrity.spec.ts` (Playwright, seeded artist with an
approved profile). Every step asserts against a fresh reload, not in-memory
state.

1. **Upload.** Go to `/artist-portal/portfolio`, open the add form, upload a
   3000x2000 JPEG. Assert the preview renders, the spinner clears within 15s, and
   the returned URL host is the Supabase storage host, not `picsum.photos`.
2. **Upload rejection is visible.** Upload a `.heic` and a 12 MB JPEG. Assert a
   named error renders for each and the spinner clears. (Covers L1, L2.)
3. **No save mid-upload.** Start a large upload; assert both Save controls are
   disabled while `uploading` is true. (Covers L3.)
4. **Sizes and prices.** Add three size rows with labels, prices, per-size
   shipping, in-store price and stock. Attempt to add a row with a blank label
   and assert Save is blocked with a message. (Covers L9 / Bug 7.)
5. **Save.** Click Save. Assert exactly **one** POST to `/api/artist-works`
   (not one per work in the portfolio), that the success toast appears only
   after the 200, and that a forced 500 keeps the form open with an error and no
   success toast. (Covers L4, L19.)
6. **Persistence.** Full page reload. Assert the work is present with all three
   size rows and every per-size field intact. (Covers L5, L6, L7, L15, L16.)
7. **Cache.** Navigate to `/artist-portal/profile`, then back to
   `/artist-portal/portfolio` within 60 seconds. Assert the work is still in the
   grid. (Covers L13.)
8. **Public listing.** Visit `/browse`; assert the work appears. Visit
   `/browse/<artist-slug>`; assert it appears. Visit
   `/browse/<artist-slug>/<work-slug>`; assert the title, the default size row's
   label (not the string `"undefined"`), and the price all render. (Covers L11,
   L12, Bug 7.)
9. **Cart.** Add to cart from the default pre-selected size without touching the
   size selector. Assert the cart line's size is the real label. Then go to
   checkout and assert the server-computed line price matches the DB tier.
   (Covers Bug 7 and the `checkout/route.ts:215` bypass.)
10. **Edit.** Change the title and one price. Save. Reload. Assert both changes
    persisted **and** that per-size shipping, in-store price, stock and
    `pricesBySize` are unchanged. (Covers L5, L6.)
11. **Delete.** Delete the work with the API forced to 500. Assert the card is
    still present and an error is shown. Then delete for real and assert it is
    gone from `/browse` after a reload. (Covers L18.)
12. **Ownership.** As artist B, POST artist A's work id directly. Assert 404 and
    that A's row is unchanged. (Covers L8.)
13. **Visibility.** Set the artist's `review_status` to `pending`. Assert
    `/browse/<slug>` returns 404, not the full portfolio. (Covers L10.)

---

## 10. Ordered task checklist

**Phase A, the primitives (no behaviour change on its own)**

- [ ] A1. Rewrite `src/lib/api-client.ts` per section 1.1: `ApiError`,
      `NetworkError`, `authHeaders` with the `getSession` try/catch, `mutate<T>()`,
      `isTransient`. Keep `authFetch` for reads.
- [ ] A2. Add `src/lib/api-client.test.ts`: 2xx returns the parsed body; 4xx
      throws `ApiError` with `status`/`code`/`message`; a non-JSON 500 throws
      `ApiError` with a truncated message; a `fetch` rejection throws
      `NetworkError`; a `getSession` rejection throws `NetworkError` and never
      calls `fetch`.
- [ ] A3. Add `src/hooks/useSaveAction.ts` per section 1.2.
- [ ] A4. Add `src/hooks/useSaveAction.test.tsx`: success path sets `saved`,
      calls `clearDirty` and toasts once; failure path rolls back, sets `error`,
      toasts `variant: "error"` and does **not** call `clearDirty`; a second
      `save()` while in flight is a no-op; `saving` is true for the whole round
      trip.
- [ ] A5. Add a `"success"` variant to `ToastContext` (optional, one line in
      `VARIANT_CLASSES` plus the union at line 5).

**Phase B, the confirmed data-loss paths**

- [ ] B1. E42-c: delete both column strip-lists in
      `src/lib/db/venue-profiles.ts:54-95`. Add `venue-profiles.test.ts`
      asserting `images` and the four `display_*` columns survive both insert
      and update.
- [ ] B2. E41-f: delete the localStorage artwork editor from
      `src/app/(pages)/artist-portal/profile/page.tsx` (lines 558-632 and the UI
      at 1163-1290); link to `/artist-portal/portfolio` instead. Remove the
      `wallplace-artist-profile` mirror at line 747.
- [ ] B3. E41-a + L4: make `saveWorks` async, move it to `mutate`, and route
      `handleSubmit` through `useSaveAction`.
- [ ] B4. E41-c + L19: diff-and-send. Only POST changed works; batch reorders.
- [ ] B5. E41-d + L5: carry `pricesBySize` in the frame map.
- [ ] B6. E41-e + L6/L7: merge into existing `pricing` rows instead of rebuilding.
- [ ] B7. L8: scope `upsertWork` by `artist_id`; 404 on a foreign id. Add
      `src/lib/db/artist-works.test.ts`.
- [ ] B8. L17: switch `getWorksByArtistProfileId` to `getSupabaseAdmin()` and
      surface the query error.
- [ ] B9. Bug 7 / L9: add the `pricing` sanitiser to
      `src/app/api/artist-works/route.ts`; harden `normaliseSize` in
      `CartContext`; guard `ArtworkPageClient.tsx:501` and the three
      `.toLowerCase()` sites.

**Phase C, the false-success controls**

- [ ] C1. E42-a: split display from value in the venue details rows.
- [ ] C2. E42-b: send `interested_in_local_artists` and `preferred_sizes`;
      hydrate `sizes` from the venue record.
- [ ] C3. E42-d/e: `?? null` instead of `|| undefined`; swap the local
      `beforeunload` for `useUnsavedWarning`.
- [ ] C4. E43-a: both `updateStatus` copies through `useSaveAction`; move the
      event dispatch into `onSuccess`.
- [ ] C5. E43-b: make `OffersList.act` return `Promise<boolean>`; gate the
      withdraw toast on it.
- [ ] C6. E43-c: `setStatus` on the artwork-request detail page.
- [ ] C7. E43-d: "Save Shipping Settings".
- [ ] C8. E43-e: report, delete conversation, block user.
- [ ] C9. E43-f: wire or remove the two dead enquiries buttons.
- [ ] C10. E43-g: both saved-item removal pages (prefer calling
      `SavedContext.toggleSaved`).
- [ ] C11. E43-h: the public enquiry form. Highest external impact of the group.
- [ ] C12. E43-i/j: Header mark-read calls and the `VenuePortalLayout` self-heal.
- [ ] C13. `ApplicationForm.tsx:290,295` terms acceptance.

**Phase D, bugs 12 and 14**

- [ ] D1. Bug 12: gate the Blogs nav item in `ArtistPortalLayout` and add
      `notFound()` to the three blog pages behind `isFlagOn("BLOGS_V1")`.
- [ ] D2. Bug 12: migrate `BlogEditor` to `mutate` + `useSaveAction`; add
      `useUnsavedWarning`.
- [ ] D3. Bug 14: wrap `handleSubmit` in try/catch/finally with a
      `if (loading) return;` re-entry guard.
- [ ] D4. Bug 14: add `pointer-events-none` to the hidden cookie banner.
- [ ] D5. Extend `src/app/(pages)/login/page.test.tsx` with the four cases in
      section 6.4.

**Phase E, the listing path**

- [ ] E1. L1/L2: wrap `handleImageFile`, share `ALLOWED_TYPES`/`MAX_BYTES`,
      add an explicit HEIC message.
- [ ] E2. L3: require an image, add `|| uploading` to both disabled predicates,
      delete the picsum fallback.
- [ ] E3. L13: clear the `wallplace-artist-` session cache after a confirmed
      save; expose `refetch()` from `useCurrentArtist`.
- [ ] E4. L14/L15/L16: bulk-add failure surfacing, in-store price path, and
      stable row ids.
- [ ] E5. L10: apply the `review_status` and subscription filters in
      `getArtistBySlug`.
- [ ] E6. L11: add a real `status` column to `artist_works` and filter on it;
      stop overloading `available`.
- [ ] E7. L12: id-suffixed work slugs.
- [ ] E8. L20: either implement the original-plus-derivative upload or remove the
      image-protection copy.
- [ ] E9. L21/L22: fix `resizeImage`'s dead JPEG branch, revoke the object URL,
      and either implement or delete `getOptimizedUrl`.

**Phase F, lock it in**

- [ ] F1. Add the `no-authfetch-mutation` lint rule from section 1.1; set it to
      `error`.
- [ ] F2. Add `website/e2e/listing-integrity.spec.ts`, all thirteen steps from
      section 9.3, to CI as the Gate 2 check.
- [ ] F3. Work through the 16 UNVERIFIED rows in the section 8 inventory and
      resolve each to SAFE or BROKEN.
