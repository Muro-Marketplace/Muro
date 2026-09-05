# Collection size tiers

Date: 2026-09-05
Status: approved, ready for planning

## The problem

A collection today is a fixed set of works at a fixed price. `artist_collections`
carries one `bundle_price` and a `work_sizes` array pinning exactly one size per
work (migration 006). The buyer gets one button at one price.

That does not fit how most artists actually sell a set. A photographer with a
six-image series wants to offer it as A4 prints for £120, A3 for £250 and
50x70cm for £480. Right now they have to publish three near-identical
collections, which duplicates the images, splits the saves and reviews across
three pages, and reads badly on the browse grid.

## What we are building

A collection can optionally define several size tiers. Each tier has the
artist's own label, its own bundle price, and its own pinned size for every work
in the collection. The buyer picks a tier on the collection page and the price,
the saving and the per-work sizes all update to match.

Collections that do not define tiers behave exactly as they do now. Nothing
about their data or their code path changes.

## Decisions taken

**Tiers pin a size per work, rather than naming a shared size label.** A tier
carrying its own `workSizes` array handles the common case where an artist's
works do not share identical size labels: one work sells as "A3" and another as
"30x40cm", and both belong in the Medium tier. Resolving a single shared label
against every work would make that tier unbuildable.

**Tier prices are typed by the artist, not derived from the works.** The artist
sets each tier's bundle price directly, the same way they set `bundle_price`
today. Deriving it from the sum of the pinned sizes would stop the artist
pricing the jump between tiers, and would move the bundle price every time an
individual work is repriced. The collection page still shows the saving against
that tier's individual total, so the discount stays visible without being the
input.

**Stock is out of scope.** See "Known gap left open" below.

## Data model

One additive migration, one column.

```sql
ALTER TABLE artist_collections
  ADD COLUMN IF NOT EXISTS size_tiers JSONB NOT NULL DEFAULT '[]'::jsonb;
```

```ts
export interface CollectionSizeTier {
  /** The artist's own word: "Small", "A3", "Gallery". */
  label: string;
  /** Bundle price for this tier, in pounds. */
  price: number;
  /** Optional buyer-facing note, e.g. "A4 prints, unframed". */
  description?: string;
  /** Pinned size per work for this tier. Reuses CollectionWorkSize. */
  workSizes: CollectionWorkSize[];
}
```

`size_tiers = []` is the untiered collection, which is every collection that
exists today. JSONB matches how the table already stores `work_sizes`, and how
`artist_works` stores its `pricing` array, so this is the shape the codebase
already reasons about.

### Why a new column rather than folding the untiered case into it

Making every collection carry exactly one tier would be conceptually cleaner and
would leave one code path instead of two. It was rejected because it needs a
backfill over live rows and rewrites every read site, in exchange for a model no
artist asked to see. The additive column leaves untiered collections at zero
risk, which is worth more than the tidiness.

A relational `collection_size_tiers` table was also rejected. Tiers are always
read with their parent collection and never queried on their own, and it would
be the only relational sizing store in a codebase that keeps all of this in
JSONB.

### Keeping `bundle_price` populated

On every write to a tiered collection, the API sets `bundle_price` to the
cheapest tier's price. This is deliberate denormalisation and it buys two
things:

- The checkout availability guard already refuses a collection whose
  `bundle_price` is absent or non-positive
  (`src/app/api/checkout/route.ts`, the `collection_unavailable` branch).
  Keeping the column populated means that guard keeps working unchanged.
- `CollectionCard`, the browse feed and the saved lists all read `bundlePrice`
  and `bundlePriceBand`. Keeping the column live means none of them need to know
  tiers exist.

`bundlePriceBand` is built in the API, not the component, so a tiered collection
renders "From £120" by changing one string in
`src/app/api/browse-collections/route.ts` and its twin in
`src/app/api/collections/[id]/route.ts`. No card changes.

`bundle_price` is never the number a tiered collection is charged at. It is a
display and availability floor only. The charge always comes from the tier, and
the checkout section below makes that a hard failure rather than a fallback.

## API

### `POST` and `PUT /api/collections`

Accept an optional `sizeTiers` array. Validation, applied in the existing
`parseBody` helper alongside the current `workSizes` filtering:

- 0 to 6 tiers. Zero means untiered.
- `label` trimmed, 1 to 40 characters, unique within the collection,
  case-insensitively. Duplicate labels are rejected, because the label is the
  key the checkout re-prices against.
- `price` finite, greater than 0, at most 100000.
- `description` optional, trimmed, at most 200 characters.
- `workSizes` entries must reference a `workId` that is in this collection's
  `workIds`. Entries naming anything else are dropped.

Deliberately not validated: whether a tier's `sizeLabel` actually exists on that
work's `pricing` array. The existing `work_sizes` column is not validated that
way either, the read path already falls back to the work's first pricing entry
when a label does not match, and because tier prices are typed rather than
derived, a stale label cannot cause a mispricing. Adding the check would mean
loading every work on every collection write for no money-safety gain.

Anything failing the rules above is rejected with a 400 rather than silently
coerced, except the `workSizes` foreign-id case which is filtered, matching how
the route already treats `workIds`.

The subscription publish gate (`gatePublish`, D15) is untouched.

### `GET /api/collections/[id]`

Returns `sizeTiers` on the collection. The per-work resolution that currently
runs once against `work_sizes` runs once per tier, so the page gets each tier's
resolved size label and per-size price without a second request. Untiered
collections return `sizeTiers: []` and the existing single resolution.

### `GET /api/browse-collections`

Returns `sizeTiers` so cards can show a tier count, and sets `bundlePriceBand`
to "From £X" when tiers exist.

## Artist portal

`src/app/(pages)/artist-portal/collections/page.tsx` gains a checkbox: "Offer
this collection in several sizes". Unchecked is the current form, unchanged: one
bundle price, one size picker per work.

Checked replaces the single price field and the single per-work size list with a
tier editor. Each tier is a card holding a name field, a price field, an
optional description, and the same per-work size select grid that exists today,
scoped to that tier. Add and remove tier buttons, capped at six. The editor
prefills a new tier's sizes from the previous tier so the artist is adjusting
rather than starting blank each time.

The existing "Work removed from portfolio" row already handles a work deleted
out from under a collection, and it applies per tier without change.

The form's save guard currently requires a non-empty `bundlePrice`. When tiers
are on, that becomes: at least one tier, and every tier has a name and a price.

## Buyer surface

`src/app/(pages)/browse/collections/[collectionId]/page.tsx`.

When `sizeTiers` is empty the page renders exactly as it does now.

When tiers exist, a row of selectable pills sits above the buy button, one per
tier, defaulting to the cheapest. Selecting a tier updates:

- the headline bundle price and the `individualTotal` / `savings` line, both of
  which are already computed from state;
- the size and price shown on each work card in the grid, which currently read
  `selectedSize` and `selectedSizePrice` from the single resolution.

The cart line gains the tier: `size` becomes `"Medium · 6 works"` rather than
`"6 works"`, and a new `collectionTierLabel` field carries the label itself.
`size` already flows through the order record into the confirmation email, so
the receipt reads correctly with no email change.

## Checkout

`CartItem` in `src/lib/types.ts` and the cart line schema in
`src/lib/validations.ts` both gain `collectionTierLabel?: string`, capped at 80
characters, matching how `frameLabel` was added.

`src/app/api/checkout/route.ts`, in the collection branch of `priceLine`:

- Untiered collection: unchanged, priced from `bundle_price`.
- Tiered collection with a matching `collectionTierLabel`: priced from that
  tier's `price`. The match is case-insensitive, consistent with the
  case-insensitive size matching on the works path.
- Tiered collection with a label that matches no tier: **409**, code
  `collection_tier_unavailable`. It does not fall back to `bundle_price`.
- Tiered collection with no label at all: the same 409. This is a cart saved
  before the artist added tiers.

The no-fallback rule is the point of this section. `bundle_price` on a tiered
collection is the cheapest tier, so falling back would let a buyer select the
£480 Large tier, send a label the server cannot match, and be charged £120. The
codebase already answers this class of stale-cart problem with a 409 telling the
buyer to re-add the item, which is what `cart_line_unidentified` does a few
lines above.

The tier lookup needs `size_tiers` added to the existing
`artist_collections` select, which currently fetches
`id, available, bundle_price, name`. No extra round trip.

## Error handling

- **Work deleted from the portfolio.** The tier keeps its entry for the missing
  work; the read path drops works it cannot resolve, as it does today. The
  editor shows the existing "Work removed from portfolio" row.
- **A work's size labels change so a tier's pinned label no longer exists.** The
  display falls back to that work's first pricing entry, mirroring the current
  behaviour in `[id]/route.ts`. The tier price is unaffected because it is
  typed, not derived.
- **All tiers removed while a cart holds a tiered line.** The collection becomes
  untiered, the line's `collectionTierLabel` is ignored, and the untiered
  `bundle_price` path prices it. This cannot undercharge, because an untiered
  collection's `bundle_price` is the artist's own single price.
- **Collection unpublished or deleted.** Unchanged, the existing
  `collection_unavailable` 409.

## Testing

New tests, following the file conventions already in place:

- `src/app/api/collections/route.test.ts`: tier validation. Valid round trip;
  more than six tiers rejected; duplicate labels rejected case-insensitively;
  price of 0 and of a negative rejected; a `workSizes` entry naming a work
  outside the collection dropped; `bundle_price` written as the cheapest tier.
- `src/app/api/collections/[id]/route.test.ts` (new file, the route currently
  has no test): tiers returned with per-tier resolved sizes and prices; untiered
  collections unchanged.
- `src/app/api/checkout/route.test.ts`: tiered collection charged the selected
  tier's price; unmatched label returns 409 `collection_tier_unavailable`;
  missing label on a tiered collection returns the same 409; untiered
  collection still priced from `bundle_price`; the cheapest-tier fallback is
  proven absent by asserting the 409 rather than a £120 charge.
- `src/app/(pages)/browse/collections/[collectionId]/page.test.tsx` (exists,
  extend): the tier picker changes the headline price, the savings line and the
  per-work sizes; an untiered collection renders no picker.
- `src/app/(pages)/artist-portal/collections/page.test.tsx` (new file, the page
  currently has no test): toggling tiers on and off; the save guard requiring a
  name and price on every tier.

## Known gap left open

Buying a collection decrements no stock. The Stripe webhook decrements per
`workId` (`src/app/api/webhooks/stripe/route.ts`, the `decrement_work_stock`
loop) and a collection cart line has no `workId`, so the works inside a sold
bundle stay listed at full stock. A one-of-one piece can be sold inside a bundle
and then sold again individually.

This predates tiers and is explicitly out of scope here. It is worth recording
that tiers make it fixable for the first time: a tier states exactly which size
of which work a purchase contains, which is the information the decrement loop
would need. Tracked as a follow-up, not built here.

## Migration numbering

Local migrations end at 135. Production has run ahead of the branches before, so
check `list_migrations` against the live project before fixing the number on the
new file.

---

## What changed during implementation

Recorded 2026-09-06, after the work landed, so the spec matches the code.

**`bundle_price` is synced by a database trigger, not by the API.** The spec had
the route doing it. AGENTS.md bans a derived column written only by application
code, so migration 136 carries a `BEFORE INSERT OR UPDATE` trigger instead. That
also covers the seed script and any direct SQL, and the route was left with one
less thing to get wrong.

**The offer floor had to follow the tier.** Not anticipated by the spec. The 60%
floor in `api/offers` pinned to `bundle_price`, which was correct when that was a
collection's only price. As the cheapest tier it let a buyer looking at the £480
set anchor on £120 and open at £72, the same class of hole as the checkout
fallback. Fixed by reading the tier the offer names, passed through the offer
modal's existing `sizeLabel` field. An offer naming no size still falls back to
`bundle_price` rather than being refused, because the artist sees the number and
no money moves without them accepting.

**The stale-label fallback was a fix, not a mirror.** The spec said the detail
route already fell back to a work's first size when a pinned label no longer
matched. It did not: it fell back only when nothing was pinned, and otherwise
rendered a size the work does not sell with no price beside it. The missing half
was completed, which also changes that case for untiered collections.

**A tier's own price band.** One tier renders as a plain price rather than "From
£X", since a single tier is a named price and not a range.

## Still outstanding

- **Migration 136 is not applied to production.** The schema snapshot is updated
  on the branch per the convention in `phantom-columns.test.ts`, so the guard
  reads as if it were. Applying the migration is an owner action, and the
  snapshot should be regenerated properly with `npm run schema:snapshot` once
  `SUPABASE_ACCESS_TOKEN` is available.
- **Collection sales still decrement no stock**, as scoped. See "Known gap left
  open" above.
