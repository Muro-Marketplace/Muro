# Wall Visualizer — Product & Implementation Plan

> Status: **DRAFT for review** — no code written yet. Read end-to-end, then sign off (or request changes) on the MVP scope in §M before I begin Phase 1.
> Author: Claude · Date: 2026-04-25
>
> **Superseded in part, 2026-09-06.** The artist showroom described throughout this
> plan was built and has since been removed: the portal pages, the public showroom
> surfaces, the `artist_showroom` editor mode, the `can_publish_showroom` tier flag,
> the `showroom_publish` quota action and the `showroom` render kind are all gone.
> The customer and venue flows, and the mockup-attach path, remain. Read every
> showroom section here as history.

---

## Table of contents

- [A. Product design](#a-product-design)
- [B. UX flows](#b-ux-flows)
- [C. Information architecture](#c-information-architecture)
- [D. Technical design](#d-technical-design)
- [E. AI / rendering logic](#e-ai--rendering-logic)
- [F. Entitlement & rate-limit model](#f-entitlement--rate-limit-model)
- [G. Output / save logic](#g-output--save-logic)
- [H. Visual / design direction](#h-visual--design-direction)
- [I. Phased roadmap](#i-phased-roadmap)
- [J. Risks & decisions](#j-risks--decisions)
- [K. Final feature architecture](#k-final-feature-architecture)
- [L. Data model](#l-data-model)
- [M. Recommended MVP scope](#m-recommended-mvp-scope)
- [N. Implementation sequence](#n-implementation-sequence)
- [O. Exact next steps](#o-exact-next-steps)

---

## Guiding principles

Three principles drive every decision below:

1. **Editor is free, render costs.** Anything a browser can do locally (move, resize, swap frames, recolour a preset wall) **must not** burn quota. Only image-generation-grade output costs.
2. **Start non-AI, graduate to AI.** A well-built compositor with frame overlays + perspective tools already beats 90% of what users need. AI is a Phase-2 polish layer, not a Phase-1 dependency. This caps cost risk and lets us ship faster.
3. **One canvas, three personas.** Customer-on-artwork-page, venue-in-MyWalls, and artist-in-image-uploader all use **the same React component** with different chrome. Don't build three editors.

---

## A. Product design

### A1. Four use cases — one engine

| # | Use case | Who | Entry point | Output |
|---|---|---|---|---|
| 1 | **Quick preview on artwork page** | Customer / venue / artist | `View on your wall` button on artwork page | Ephemeral or saved |
| 2 | **Venue My Walls** | Venue (any tier) | Venue portal → My Walls | Saved layouts attached to wall |
| 3 | **Artist mockup tool** | Artist (any tier, gated) | Artwork edit screen → "View image on a wall" beside each image | Render saved as additional artwork image |
| 4 | **Artist Pro showroom** | Artist Pro | Artist profile → Showroom tab | Public 2.5D scene embedded on profile |

All four share one editor component (`<WallVisualizer />`), one layout JSON schema, one render API.

### A2. Editor capabilities (shared across all four use cases)

**Wall setup:**
- Pick preset wall (4–6 stock interiors: minimalist, café, studio, gallery, restaurant, hallway), or
- Upload a wall photo (manual dimensions required, perspective corner-tap optional)
- Wall colour swatch (only meaningful for preset walls)
- Wall dimensions (cm)

**Artwork placement:**
- Drag from a side panel (search/filter your works or your venue's hosted works)
- Resize handle (proportional only — no stretch)
- Free move + bounded snap (alignment guides, edge snap)
- Z-order (bring forward / send back)
- Multi-select + group move (V2)

**Frame system:**
- No frame
- 4 styles: thin black, classic wood, ornate gold, floater
- 3 finishes per style (where it makes sense)
- Adjustable depth/profile (V2)

**Save/share:**
- Save layout (no quota cost — JSON)
- Render polished output (quota cost — produces image)
- Export PNG / share link (V2)

### A3. Why daily limits, not monthly

Monthly buckets feel generous on day 1 and hostile on day 28. Daily limits:
- give predictable headroom to power users (no end-of-month panic)
- make abuse cheap to absorb (one bad day, not one bad month)
- reset overnight — natural cooldown
- pair well with a **monthly safety cap** as a circuit-breaker against runaway scripts

### A4. What the visualizer is NOT (scope discipline)

- Not a CAD tool. No millimetre-perfect lighting. No physically-based rendering.
- Not full 3D. The artist showroom is a stylised 2.5D scene, not Unity.
- Not auto-curating. The user places works themselves; we provide alignment guides.
- Not a print preview. We don't promise the colour matches. Add a disclaimer.

---

## B. UX flows

### B1. Venue creates a wall from scratch (preset)

1. Venue portal → **My Walls** → `+ New wall`
2. Modal: **Start with preset** | **Upload a photo of your wall**
3. Pick **Preset** → grid of 4–6 stock walls → select "Café back wall"
4. Form: **Wall name**, **Wall width (cm)**, **Wall height (cm)**, **Wall colour** (swatch + hex)
5. → Editor opens. Empty wall on canvas. Side panel shows the venue's hosted artists and `+ Add artwork`.
6. User drags works on, resizes, frames, repositions.
7. **Save** → layout persisted. No quota used.
8. Optional: **Generate polished render** → confirmation modal showing "Uses 1 of your 5 daily renders" → render runs (5–15s) → result attached to layout. Quota decremented.

### B2. Venue uploads a real wall photo

1. Same entry, choose **Upload a photo of your wall**.
2. Upload (max 8MB, JPG/PNG/HEIC).
3. **Required:** wall width (cm), wall height (cm).
4. **Optional:** tap the four corners of the actual wall (perspective hint). If skipped, we treat the image as front-on.
5. **Optional:** "Hanging area" rectangle (e.g. "above the banquette only").
6. Backend runs **wall-analysis pass** (1 quota event consumed) → returns: cleaned-up image, segmentation mask, perspective homography. **This is the only place an upload costs quota** — re-editing later is free.
7. Editor opens with the analysed wall as background.
8. Drag/drop/save same as B1.

### B3. Customer / venue clicks "View on your wall" on artwork page

1. Artwork page → button **View on your wall**.
2. Sheet slides up:
   - **My Walls** (if user has any saved) — list of thumbnails
   - **Quick preset** — picks 1 default preset
   - **Upload my wall** (gated; logged-in only)
3. **My Walls path:** click a saved wall → editor opens with this artwork pre-placed at a sensible default size relative to wall dimensions.
4. **Quick preset path:** editor opens with default preset wall + artwork pre-placed.
5. Resize, reposition, swap frame — all free (local).
6. **Save to wall** (only if logged-in; adds artwork to that saved wall layout) | **Generate render** (consumes quota).

### B4. Artist generates a mockup from artwork edit screen

1. Artist portal → Works → edit a work → image manager.
2. Beside each uploaded image: **"View on a wall"** button.
3. Clicking opens the visualizer in a sheet, pre-loaded with that image as the artwork on a default preset wall.
4. Artist picks wall preset / colour / dimensions, places, frames.
5. **Generate** → render runs (1 quota event) → preview shown.
6. Confirm → output is **saved as a new image on the artwork** with role `mockup` (so it's visually distinct from the primary photograph in admin views).
7. Now appears in the artwork's image gallery, public-facing.

### B5. Artist Pro showroom

1. Artist Pro → profile → **Showroom** tab → `+ Create showroom`.
2. Pick a **scene template** (4–6 stylised gallery rooms, hand-illustrated).
3. The scene has 1–4 walls + a floor. Each wall is a placement target.
4. Drag works onto walls (re-using the same `<WallVisualizer />` per wall).
5. **Publish** → public URL `/artist/{slug}/showroom`. Profile gets a Showroom tab.
6. Visitors see a smooth horizontal scroll between walls, optional ambient room background.
7. (V3) Add lighting/shadow pass once per publish (1 quota event per published wall).

### B6. Quota-reached UX

When a user hits their daily limit:
- The Generate button shows: **"Daily limit reached — 5/5 used"** with a small upgrade CTA.
- Clicking shows a sheet: **"Upgrade to Premium for 10 daily renders"** + "Resets at 00:00 GMT" countdown.
- All editor actions (drag/resize/save layout) remain available — only **Generate** is blocked.
- One "soft retry" option: a banner saying "Save this layout and generate tomorrow."

---

## C. Information architecture

```
/venue-portal
  └── /my-walls                      ← venue list of saved walls
       └── /[wallId]                 ← editor for a specific wall
            └── ?layout=…            ← deep-link to a specific layout

/artist-portal
  └── /works
       └── /[workId]/edit
            └── (image manager: each image has "View on a wall")
                 → /artist-portal/visualizer?work=…&image=…    (sheet/modal)
  └── /showroom                      ← artist Pro only
       └── /[showroomId]/edit

/artwork/[slug]
  └── (button: "View on your wall")
       → /visualizer?work=…  (sheet/modal — full-screen on mobile)

/artist/[slug]/showroom              ← public-facing artist Pro showroom
```

Routes summary:

| Route | Auth | Purpose |
|---|---|---|
| `/venue-portal/my-walls` | venue | List walls |
| `/venue-portal/my-walls/[wallId]` | venue (owner) | Editor |
| `/artist-portal/visualizer` | artist | Editor (modal/sheet) |
| `/artist-portal/showroom` | artist Pro | Showroom CMS |
| `/artist/[slug]/showroom` | public | Public showroom |
| `/visualizer` | optional | Customer flow from artwork page |
| `/api/walls/...` | varies | CRUD + render |

---

## D. Technical design

### D1. Frontend stack

- **Canvas**: [`react-konva`](https://konvajs.org/) — best balance of React ergonomics, touch support, image handling, hit-testing. Alternatives considered: Fabric.js (less React-friendly), raw `<canvas>` (too much work), Pixi (overkill). **Recommendation: react-konva.**
- **State**: local component state + `useReducer` for the layout JSON; persist to server on debounced save.
- **DnD**: works panel uses native HTML5 drag-and-drop into Konva (Konva picks up drop coords via a wrapper).
- **Frames**: SVG masks layered on top of artwork in Konva via `Konva.Group { Image(work) + Image(frame-overlay-png) }`. Frame PNGs are 9-slice ready (corners + edges) for clean scaling. Stored in `/public/frames/`.
- **Save**: debounced 1.5s `PATCH /api/walls/layouts/[id]` — sends layout JSON only. No round-trip on every drag.
- **Quota chip**: top-right of editor — `5 of 10 renders used today` — fetched on mount, updated after any render.

### D2. Layout JSON schema

```ts
type WallLayout = {
  id: string;
  wall_id: string;
  name: string;
  items: WallItem[];
  background: { kind: "preset"; preset_id: string; color_hex: string }
            | { kind: "uploaded"; image_path: string; perspective?: Homography };
  dimensions_cm: { width: number; height: number };
  updated_at: string;
};

type WallItem = {
  id: string;            // local UUID (stable across saves)
  work_id: string;       // FK to artist_works
  // Position in *wall coordinates* (cm), not pixels — resilient to canvas resize
  x_cm: number;          // distance from left of wall
  y_cm: number;          // distance from top of wall
  width_cm: number;
  height_cm: number;
  rotation_deg: number;  // small only; default 0
  z_index: number;
  frame: {
    style: "none" | "thin_black" | "classic_wood" | "ornate_gold" | "floater";
    finish: string;      // e.g. "matte" | "gloss" | "natural"
    depth_mm: number;    // V2
  };
};
```

**Why cm not pixels:** the same layout renders correctly whether the canvas is 600px wide or 1400px wide. Conversion is a single scale factor at render time.

### D3. Backend routes

| Route | Method | Auth | Quota | Purpose |
|---|---|---|---|---|
| `/api/walls` | GET | user | no | List my walls |
| `/api/walls` | POST | user | no | Create wall (preset) |
| `/api/walls/upload` | POST | user | **yes** (1 unit) | Upload + analyse wall photo |
| `/api/walls/[id]` | GET / PATCH / DELETE | owner | no | CRUD |
| `/api/walls/[id]/layouts` | GET / POST | owner | no | List / create layout |
| `/api/walls/[id]/layouts/[lid]` | PATCH / DELETE | owner | no | Edit / delete |
| `/api/walls/[id]/layouts/[lid]/render` | POST | owner | **yes** (1 unit, 2 if HD) | Run render → returns image URL |
| `/api/walls/quota` | GET | user | no | Current quota status |
| `/api/works/[id]/mockups` | POST | artist owner | (already counted) | Attach a render as work image |
| `/api/showrooms/[id]` | GET / PATCH | artist Pro owner | no | Showroom CMS |
| `/api/showrooms/[id]/publish` | POST | artist Pro owner | **yes** (1 per wall) | Publish + render lighting pass |

### D4. Quota enforcement (server-side)

```ts
// src/lib/visualizer-quota.ts
export async function consumeQuota(
  userId: string,
  action: VisualizerAction,
  units = 1,
): Promise<{ ok: true } | { ok: false; reason: "daily" | "monthly"; resetsAt: Date }> {
  const tier = await getTierForUser(userId);                    // 'core' | 'premium' | ... | 'venue_standard' | ...
  const limits = TIER_LIMITS[tier];                              // see §F
  const today = await countUsageToday(userId);
  const thisMonth = await countUsageThisMonth(userId);

  if (today + units > limits.daily)  return { ok: false, reason: "daily",   resetsAt: nextMidnightGMT() };
  if (thisMonth + units > limits.monthly) return { ok: false, reason: "monthly", resetsAt: firstOfNextMonth() };

  await db.from("visualizer_usage").insert({
    user_id: userId, action, cost_units: units,
    day_bucket: today_iso(), month_bucket: month_iso(),
  });
  return { ok: true };
}
```

- Counts are kept in `visualizer_usage` table, indexed on `(user_id, day_bucket)` and `(user_id, month_bucket)`.
- Consumption happens **before** the render kicks off. If the render fails server-side, we **refund** by inserting a negative cost row (audit-friendly, easier to reason about than deletes).
- Pair with **Upstash sliding-window rate limit** (already in the codebase) at 30 renders / 1 hour as a runaway-script circuit breaker independent of tier.

### D5. Storage

- Wall photos: Supabase Storage bucket `wall-photos` (private). Signed URLs (10 min) for editor access.
- Wall renders: bucket `wall-renders` (public-readable, signed-write). Path: `{user_id}/{layout_id}/{render_id}.webp`.
- Showroom outputs: bucket `showroom-renders` (public).
- Lifecycle: renders > 90 days old without an attached `wall_renders.kept = true` get archived to cold storage / deleted.

### D6. AI provider abstraction

```ts
// src/lib/ai/visualizer-provider.ts
export interface VisualizerProvider {
  analyseWall(imageBuffer: Buffer): Promise<{ mask: Buffer; homography: number[][] }>;
  composeRender(layout: WallLayout, opts: { hd: boolean }): Promise<{ imageUrl: string; cost: number }>;
  composeShowroom(scene: ShowroomScene): Promise<{ imageUrl: string; cost: number }>;
}

// MVP impl: `MockProvider` — does no AI, just composites with sharp/canvas server-side
// V2 impl: `ReplicateProvider` — calls Replicate's segmentation + img2img
// V3 impl: optional `StabilityProvider` swap
```

This means the API surface is stable from day 1; we swap providers without changing routes.

### D7. Abuse prevention

- **App-tier**: tier limits (§F)
- **Burst**: Upstash 30 renders / 1 hour per user (sliding window)
- **Per-IP**: 5 wall uploads / 1 hour anonymous; 20 / 1 hour authed
- **Webhook**: if Replicate returns >£X/day cost, alert (Slack webhook)
- **Pre-screen**: zod-validate layout JSON; reject if >50 items, image > 8MB, dimensions outside 50–1000cm
- **Watermark on free-tier renders** (small "wallplace.co.uk" footer) — discourages abuse-as-free-design-tool

---

## E. AI / rendering logic

### Where AI is genuinely useful

| Feature | AI-needed? | Tech | Phase |
|---|---|---|---|
| Drag/resize/recolour preset wall | **No** — pure DOM/canvas | react-konva | MVP |
| Frame overlays | **No** — SVG/PNG composition | sharp / canvas | MVP |
| Save layout | **No** — JSON | Supabase | MVP |
| Polished render of preset wall + artworks | **No** for MVP — server-side `sharp` composite is enough; **AI for V2** lighting/shadow realism | sharp → Replicate img2img | MVP non-AI, V2 AI |
| Wall photo upload analysis | **Yes** — segmentation makes this feel magical | Replicate (Mask2Former or similar) | V2 |
| Auto-fit artwork onto detected wall | **Yes** but optional | depth model + math | V2 |
| Realistic lighting/shadow on placed work | **Yes** | img2img with ControlNet | V3 |
| Showroom scene generation | **Mostly no** — use illustrated scene templates; AI for a final "polish" pass | Replicate img2img | V3 |

### Phase 1 render pipeline (no AI)

```
1. Receive POST /render with layout JSON
2. Fetch wall background (preset image or uploaded photo) at 2000px
3. For each item, fetch work image
4. For each item, composite via sharp:
     a. Resize work to (width_cm * pxPerCm) px
     b. If frame ≠ none: composite frame overlay with 9-slice resize
     c. Overlay onto wall at (x_cm * pxPerCm, y_cm * pxPerCm) with z-order
5. Apply soft drop-shadow (universal — fakes depth cheaply)
6. Output 1600×1200 webp at quality 85
7. Store + return URL
```

This costs **pennies** per render (CPU only, no AI calls). Quality is acceptable for MVP.

### Phase 2 render pipeline (AI realism)

After step 6 above, send the composite + the wall background to Replicate img2img with:
- prompt: `"natural museum lighting, soft cast shadows, realistic"`
- ControlNet: depth or canny from the original composite
- denoise strength: 0.25 (low — preserves original placement)

This makes shadows realistic and integrates the artwork into the lighting of the room. Cost ~$0.05 per render.

### Phase 3 render pipeline (showroom)

For the showroom, rendering is per-wall (same as Phase 2) plus a **scene polish pass** that runs once per publish:
- prompt seeded by template (e.g. "minimalist concrete gallery, soft daylight")
- low denoise, preserves wall placements
- output cached publicly

---

## F. Entitlement & rate-limit model

### F1. Recommended limits

| Tier | Daily renders | Monthly cap | Wall uploads / day | Saved walls | Saved layouts | Showroom |
|---|---|---|---|---|---|---|
| Logged-out customer | **1 trial** (browser-stored, ephemeral) | n/a | 0 | 0 | 0 | n/a |
| Logged-in customer | 2 | 30 | 1 | 1 | n/a | n/a |
| **Artist Core** | 3 | 50 | 1 | 2 | n/a | n/a |
| **Artist Premium** | 10 | 200 | 3 | 5 | 10 | n/a |
| **Artist Pro** | 25 | 500 | 5 | unlimited | unlimited | **1 published showroom** |
| **Venue Standard** | 5 | 100 | 2 | 3 | 10 | n/a |
| **Venue Premium** | 20 | 400 | 5 | unlimited | unlimited | n/a |

Notes:
- These should be **environment-configurable** so we can tune without redeploying schema.
- "Daily" resets at 00:00 GMT.
- "Monthly" resets at 00:00 GMT on the 1st.
- HD render costs **2 units** instead of 1 (V2+).

### F2. What costs a unit (✅) vs free (❌)

| Action | Cost |
|---|---|
| Drag, resize, rotate, reorder | ❌ |
| Change wall colour (preset) | ❌ |
| Swap frame style/colour | ❌ |
| Add/remove artwork on canvas | ❌ |
| Save layout JSON | ❌ |
| Edit a saved layout | ❌ |
| **Upload a wall photo** (analysed once) | ✅ 1 unit |
| **Generate render** (composite + optional AI) | ✅ 1 unit (HD: 2 units) |
| **Save render as artwork mockup** | ❌ (cost was at generate) |
| **Publish showroom** | ✅ 1 unit per wall |
| Re-render an already-rendered layout (unchanged) | ❌ (we cache by layout hash for 24h) |

The cache-by-hash rule is important: if a venue clicks "Generate" twice without changing anything, the second call is free.

### F3. Quota display & UX

- **Quota chip** (top-right of editor): `5 of 10 daily renders` (artist Premium colour palette).
- **On Generate hover**: tooltip — "Uses 1 of 10 daily renders. Resets at 00:00 GMT."
- **At 80% usage**: chip turns amber.
- **At 100%**: chip turns red, Generate disabled, soft upgrade CTA appears.
- **Upgrade prompt**: cards comparing current tier vs. next tier — only on quota-reach (don't nag).
- **My Walls list** shows a tiny "1 unrendered layout" badge on walls that have edits without a render.

### F4. Backend enforcement

1. Auth check (Supabase JWT)
2. Owner check (user owns the wall/layout)
3. Tier lookup (already in `subscriptions` table)
4. Quota check (`consumeQuota` helper)
5. Upstash circuit breaker (30/hour per user)
6. Run render
7. On failure: refund (negative usage row)

### F5. Abuse vectors covered

- **Bot signups generating renders**: Cloudflare Turnstile on signup (already planned) + email verification gating render access until verified.
- **Single user, many renders**: daily + monthly + 1-hour Upstash window.
- **Same layout re-rendered 1000×**: hash-cache.
- **Massive uploads**: 8MB image cap, dimensions cap, file-type allow-list.
- **Wall photo upload abuse**: 1–5/day per tier; processed offline so even if accepted, doesn't tie up server.
- **Pro tier showroom abuse**: 1 published showroom per artist, edits free, publish costs.

---

## G. Output / save logic

| Object | Saved as | Lifetime | Visibility | Reusable? |
|---|---|---|---|---|
| Wall (preset config) | `walls` row | until deleted | owner only | yes — basis for layouts |
| Wall (uploaded photo) | `walls` row + Supabase Storage | until deleted | owner only | yes |
| Layout (positions + frames) | `wall_layouts` row | until deleted | owner only (V2: shareable) | yes |
| Render (composite image) | `wall_renders` row + Supabase Storage | 90d unless `kept=true` | owner only | downloadable |
| Artwork mockup | `artist_work_images` row with `role='mockup'` and `source_render_id` | until artwork deleted | public (on artwork page) | yes |
| Showroom | `artist_showrooms` row (publish state) | until artist deletes | public | profile embed |
| Saved walls reusable from artwork page | join via `walls.user_id` for current user | n/a | n/a | yes |

### G1. Linking a render → artwork mockup (artist flow)

When an artist clicks "Save to artwork" after a render:
1. Render is already in `wall_renders`.
2. POST `/api/works/[id]/mockups` with `{ render_id }`.
3. Server inserts into `artist_work_images` with:
   - `role = 'mockup'`
   - `source_render_id = render.id`
   - `display_order = max + 1`
4. **No quota cost** — the cost was at render time.
5. Mockup now appears on the public artwork page in the gallery, marked with a small "Mockup" badge so customers know it's a visualisation not the actual photo.

### G2. Layout deep-linking from artwork page

When user lands on the artwork page and clicks "View on your wall":
- Fetch their saved walls (`/api/walls?include_layouts=false`).
- If any exist, show them; clicking instantiates a **fresh draft layout** on top of that wall, pre-placed with this artwork at default size.
- The draft is auto-saved as a new layout under that wall (named `"<artwork title> on <wall name>"`).
- They can promote it to a permanent layout by hitting Save.

---

## H. Visual / design direction

To make this feel premium not toy-like:

- **Editor chrome**: full-bleed canvas, **floating** translucent toolbars (no boxy panels). Wall fills 80% of viewport.
- **Side panel** for works: 240px wide, slides in/out, search at top, virtualised grid below.
- **Frame preview**: hover any frame thumbnail → live preview on selected artwork in <100ms (pre-loaded overlays).
- **Drag feedback**: artwork ghost at 60% opacity, real-time alignment guides (dotted lines snap to centre/thirds/edges of wall and other artworks).
- **Render moment**: when user clicks Generate, show a beautiful loading state (gradient shimmer over the wall, "Composing your render…") — not a generic spinner. Take pride in this moment; it's the wow.
- **Render delivery**: arrives via fade-in over 300ms, with a "Save to wall" / "Download" / "Share" tray.
- **Type**: serif headings ("My Walls", "Showroom") to feel curated; sans-serif UI.
- **Colour**: warm whites and stone greys for editor background — never pure white (washes out artwork). Frame previews on neutral 2A2A2A.
- **Mobile**: works as a vertical-scroll editor; resize handles 44×44px touch targets; long-press to enter "frame mode."

Reference benchmarks (for design inspiration):
- Saatchi Art's wall preview (clean but limited)
- Artmajeur's view-in-room (good but dated)
- Apple's "Try on" AR sheet UX (the gold standard for premium overlay flow)

---

## I. Phased roadmap

### Phase 1 — MVP (4–6 weeks, ~2 dev-weeks of code)

Ship the core editor + customer-on-artwork-page flow + venue My Walls + non-AI renders.

- [ ] react-konva editor with drag/resize/frame
- [ ] 4 preset walls
- [ ] Wall + layout data model (Supabase migration)
- [ ] `/venue-portal/my-walls` CMS
- [ ] `View on your wall` button on artwork page → editor sheet
- [ ] Server-side `sharp` composite render
- [ ] Quota infrastructure (`visualizer_usage`, helper, Upstash limit) — even if generous limits initially
- [ ] Quota chip + upgrade prompt
- [ ] Save layouts + render storage
- [ ] No uploaded walls yet
- [ ] No artist-side mockup tool yet
- [ ] No AI

**Outcome:** customers/venues can preview works on stylish preset walls. Venues build saved layouts. Renders are good enough to share.

### Phase 2 — V2 (4–6 weeks)

- [ ] Wall photo upload + manual dimensions + corner perspective tap
- [ ] Replicate provider for wall segmentation
- [ ] AI img2img realism pass on renders (lighting/shadows)
- [ ] HD render option (2-unit cost)
- [ ] Artist mockup tool (per-image "View on a wall" → save as artwork image)
- [ ] Multi-artwork layouts polished (alignment guides, group select)
- [ ] Layout share links (read-only)
- [ ] Mobile polish

**Outcome:** artists materially upgrade their listings; venues use real photos of their spaces.

### Phase 3 — Premium / Pro (6–8 weeks)

- [ ] Artist Pro Showroom CMS
- [ ] 4–6 illustrated scene templates
- [ ] Per-wall placement within a scene
- [ ] Public showroom route on artist profile
- [ ] AI scene-polish pass
- [ ] Optional: AR view via WebXR for mobile customers
- [ ] Optional: video walk-through generation (cost-heavy — Pro only)

**Outcome:** Pro tier has a flagship feature that's a real reason to upgrade. Profiles feel like exhibitions.

---

## J. Risks & decisions

### Product decisions to lock in

| Decision | Recommendation | Why |
|---|---|---|
| Daily vs monthly limit primary | Daily primary, monthly secondary | Daily is more predictable; monthly is just a circuit breaker |
| Customer free tier visualizer access | 2 renders/day for logged-in only | Drives signups; logged-out = 1 trial/browser |
| Watermark free tier renders | Yes | Discourages abuse-as-design-tool |
| Allow non-paying artists to save walls | No (Core gets 0 saved walls) | Save = commitment moment; tied to upgrade |
| Customer can save walls? | Yes, 1 wall — the wall they're hanging art on | Drives commerce: "I bought it because I saw it on my wall" |
| Render quality default | "Standard" — HD is upsell on Premium+ | Cost control |
| Frame system extensibility | Start with 4 styles × 3 finishes = 12 options | Enough variety, manageable asset count |

### Technical decisions to lock in

| Decision | Recommendation | Why |
|---|---|---|
| Canvas library | react-konva | React-native, touch-friendly, mature |
| MVP render technology | server-side `sharp` (no AI) | Cheap, instant, sufficient |
| AI provider | Replicate (Phase 2+) | Best models for segmentation + img2img |
| Storage | Supabase Storage (existing) | Already wired |
| Quota counter | Postgres rows + Upstash circuit | Postgres for audit + refund; Upstash for burst |
| Layout coords | cm not pixels | Resolution-independent |
| Authoring wall photos | Manual dim entry first; perspective optional | AI for dimensions is unreliable |

### What could become too complex (cut first if needed)

- 3D showroom — start 2.5D illustrated, only go 3D if Pro adoption proves it.
- Multi-user collaborative editing — defer indefinitely; not the use case.
- Print preview / colour calibration — explicitly disclaim.
- Realistic shadow physics — img2img with low denoise gives 80% of the value.
- Auto-curate layouts ("AI lays out works for you") — gimmicky; users want control.
- AR (WebXR) — wait for clear customer demand.

### Where we should simplify aggressively

- **MVP doesn't need uploaded walls.** Preset walls + a customer/venue's artwork is already a strong product moment. Uploads add 30% of the build effort for, honestly, 20% of the value. **Push to V2.**
- **MVP doesn't need AI.** Sharp composites with frame overlays + a soft drop-shadow look surprisingly good.
- **MVP doesn't need the artist mockup tool.** Ship venue + customer flows first; artists wait one phase. (Artists will ask for it; that's fine — it justifies V2.)

---

## K. Final feature architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                       <WallVisualizer />                            │
│   (single component — used by 4 surfaces, configured via props)    │
└────────────────────────────────────────────────────────────────────┘
            │                  │                 │              │
   Customer (artwork page)   Venue MyWalls   Artist mockup   Artist showroom
            │                  │                 │              │
            ▼                  ▼                 ▼              ▼
       Sheet modal        /my-walls/[id]    Sheet modal     /showroom/[id]
                                                            (multi-wall scene)

      ┌────────────────────── Shared subsystems ──────────────────────┐
      │ Layout JSON schema  │  Quota service     │  Render service    │
      │ Frame overlay set   │  (consume/refund)  │  (sharp → AI later)│
      │ Wall preset library │  Storage adapter   │  Provider abstr.   │
      └───────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                              Supabase
                  walls · wall_layouts · wall_renders ·
                  visualizer_usage · artist_showrooms
```

---

## L. Data model

### L1. New tables (Phase 1 migration)

```sql
-- 035_visualizer_core.sql

-- Walls (preset config or uploaded photo)
create table walls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_type text not null check (owner_type in ('venue','artist','customer')),
  name text not null,
  kind text not null check (kind in ('preset','uploaded')),
  preset_id text,                        -- when kind='preset' (e.g. 'cafe_back_wall')
  source_image_path text,                -- when kind='uploaded' (Storage path)
  width_cm numeric(8,2) not null check (width_cm between 50 and 1000),
  height_cm numeric(8,2) not null check (height_cm between 50 and 1000),
  wall_color_hex text default '#FFFFFF',
  perspective_homography jsonb,          -- 3x3 matrix when uploaded + corners tapped
  segmentation_mask_path text,           -- Storage path to mask (V2)
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index walls_user_idx on walls(user_id);

-- Layouts on a wall
create table wall_layouts (
  id uuid primary key default gen_random_uuid(),
  wall_id uuid not null references walls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,  -- WallItem[] (see schema)
  layout_hash text,                          -- sha256 of items+wall — for render cache
  last_render_id uuid,                       -- soft FK to wall_renders.id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wall_layouts_wall_idx on wall_layouts(wall_id);
create index wall_layouts_hash_idx on wall_layouts(layout_hash);

-- Renders (composite outputs)
create table wall_renders (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid references wall_layouts(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('standard','hd','showroom')),
  output_path text not null,                 -- Supabase Storage path
  layout_hash text not null,                 -- for cache lookups
  cost_units int not null default 1,
  kept boolean not null default false,       -- if true, exempt from 90d cleanup
  created_at timestamptz not null default now()
);
create index wall_renders_user_idx on wall_renders(user_id);
create index wall_renders_hash_idx on wall_renders(layout_hash);
create index wall_renders_keep_idx on wall_renders(created_at) where kept = false;

-- Quota tracking
create table visualizer_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,                       -- 'render','wall_upload','showroom_publish'
  cost_units int not null,                    -- positive (consume) or negative (refund)
  day_bucket date not null,                   -- (now() AT TIME ZONE 'UTC')::date
  month_bucket text not null,                 -- 'YYYY-MM'
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index vis_usage_user_day_idx on visualizer_usage(user_id, day_bucket);
create index vis_usage_user_month_idx on visualizer_usage(user_id, month_bucket);

-- Artist showrooms (Phase 3)
create table artist_showrooms (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artist_profiles(id) on delete cascade,
  scene_template text not null,
  walls jsonb not null default '[]'::jsonb,    -- references to walls + per-wall placement
  published_at timestamptz,
  published_render_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index artist_showrooms_one_per_artist on artist_showrooms(artist_id);

-- Quota overrides (support tool)
create table visualizer_quota_overrides (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_extra int not null default 0,
  monthly_extra int not null default 0,
  expires_at timestamptz,
  reason text
);
```

### L2. RLS policies

- `walls`, `wall_layouts`, `wall_renders`: SELECT only own rows; mutations via service-role only (matches existing pattern).
- `visualizer_usage`: SELECT only own rows; INSERT only via service-role.
- `artist_showrooms`: SELECT public for `published_at IS NOT NULL`, otherwise owner only.

### L3. Existing tables touched

- `artist_work_images`: add `role text default 'photo' check (role in ('photo','mockup','detail'))` and `source_render_id uuid references wall_renders(id)`.
- `subscriptions` (or wherever tier is stored): no schema change — read-only.

---

## M. Recommended MVP scope

This is what I'd build in **Phase 1**. Sign off here (or amend) before I start.

### In scope
1. **Data model** (migration `035_visualizer_core.sql` — walls, wall_layouts, wall_renders, visualizer_usage, quota overrides).
2. **`<WallVisualizer />` editor** (react-konva), with:
   - Preset wall mode only (4 stock walls)
   - Wall colour swatch + dimensions form
   - Drag/drop/resize artworks from a side panel
   - 4 frame styles × 3 finishes
   - Alignment guides
   - Save layout (debounced, no quota)
   - Generate render button (consumes quota)
3. **Customer flow**: `View on your wall` button on artwork page → editor in a sheet.
4. **Venue flow**: `/venue-portal/my-walls` (list + create + edit + delete).
5. **Server render**: `sharp`-based composite + soft drop-shadow + frame overlay (no AI).
6. **Quota infrastructure**: tier lookup, daily + monthly limits, Upstash burst limit, refunds, quota chip UI, upgrade prompt.
7. **Storage**: `wall-photos` (unused in MVP but provisioned), `wall-renders` buckets.
8. **Tests**: Vitest for quota service, render hash cache, validation; Playwright for editor open + place + render happy path.

### Out of scope for MVP (deferred to V2/V3)
- Wall photo uploads + segmentation (V2)
- AI realism pass (V2)
- Artist mockup tool (V2)
- HD render option (V2)
- Layout share links (V2)
- Artist Pro showroom (V3)
- AR / WebXR (TBD)

### MVP success criteria
- Customers can preview an artwork on a stylish preset wall in <30 seconds from the artwork page.
- Venues can build a layout with 5+ works, save, and render in <60 seconds.
- All editor interactions are sub-100ms locally.
- A render completes in <8 seconds server-side.
- No render exceeds tier quota; quota chip is always accurate.
- Lighthouse mobile performance on the editor route ≥ 70.

---

## N. Implementation sequence

Ordered so each PR is small (<800 LOC), reviewable, and shippable behind a feature flag.

| # | PR | Description | Est |
|---|---|---|---|
| 1 | `feat(visualizer): data model + types` | Migration 035, TS types for `WallLayout`/`WallItem`, RLS policies, types-only for `<WallVisualizer />` props | 0.5 d |
| 2 | `feat(visualizer): quota service` | `consumeQuota`, `getQuotaStatus`, Upstash integration, tests, env config for limits | 0.5 d |
| 3 | `feat(visualizer): editor scaffolding` | react-konva install, editor component skeleton, side panel of works, no DnD yet | 1 d |
| 4 | `feat(visualizer): drag/resize/move` | Konva DnD, alignment guides, frame overlay system (4×3 assets) | 1.5 d |
| 5 | `feat(visualizer): preset walls + colour` | 4 stock walls (assets in `/public/walls/`), colour swatch, dimensions form | 0.5 d |
| 6 | `feat(visualizer): layout save/load` | Debounced save, layout JSON validation (zod), API routes, tests | 0.5 d |
| 7 | `feat(visualizer): server render` | `sharp`-based composite, frame overlays, drop-shadow, layout-hash cache, tests | 1 d |
| 8 | `feat(visualizer): quota chip + upgrade UX` | Editor chip, upgrade modal, quota-reached UX, tier-aware copy | 0.5 d |
| 9 | `feat(visualizer): venue MyWalls UI` | List page, create-wall modal, wall card with thumbnail | 0.5 d |
| 10 | `feat(visualizer): artwork-page entry` | "View on your wall" button + sheet modal + my-walls picker | 0.5 d |
| 11 | `chore(visualizer): tests + Playwright` | E2E happy path; unit coverage for quota + render service | 0.5 d |
| 12 | `chore(visualizer): polish + flag flip` | Mobile QA, Lighthouse, copy review, flip flag in prod | 0.5 d |

**Total: ~8.5 dev-days** behind the `WALL_VISUALIZER_V1` feature flag. Each PR is independently revertable.

---

## O. Exact next steps

To start building Phase 1, I need three things from you:

### 1. Approval of the MVP scope (§M)

Either:
- ✅ "Build it as specced," or
- ✏️ "Change X, Y, Z," or
- ❌ "Don't build this; do something else"

### 2. Approval of the entitlement table (§F1)

Specifically the **daily render numbers** for each tier. These are my recommended values; tweak any that feel off:

| Tier | Daily | Monthly | OK? |
|---|---|---|---|
| Logged-in customer | 2 | 30 | |
| Artist Core | 3 | 50 | |
| Artist Premium | 10 | 200 | |
| Artist Pro | 25 | 500 | |
| Venue Standard | 5 | 100 | |
| Venue Premium | 20 | 400 | |

### 3. Three product calls

a. **Should logged-out customers get a free trial render?** (Recommended: 1 trial per browser, watermarked.)
b. **Watermark free-tier renders?** (Recommended: yes, small footer "wallplace.co.uk".)
c. **Should the artwork-page "View on your wall" button show for logged-out users?** (Recommended: yes, but clicking prompts sign-in for save/render — preview-only is free.)

### Once approved, I will, in order:

1. Open PR #1 (data model + types) — migration only, behind feature flag, no UI.
2. Open PR #2 (quota service) — back-end only, fully tested.
3. Open PR #3–#12 in sequence, each landing independently.
4. Flip `WALL_VISUALIZER_V1` flag to true in production once all 12 PRs are merged + Lighthouse + manual QA pass.

I'll also flag any new external setup needed (Replicate API key for V2, additional Supabase Storage buckets) as we go.

---

## Appendix: open questions for product to decide later

- Frame asset sourcing — design in-house or buy a frame mockup pack? (Recommend buy initially; ~$50 for a quality pack.)
- Whether to give a free render credit to all users on signup (welcome gift) — could drive trial.
- Do we surface the visualizer in the mobile artwork page, or hide it for V1 mobile? (Recommend show but optimised — works fine on phones with react-konva.)
- Should "save to wall" from the artwork page require login, or work as guest with browser storage? (Recommend require login — drives signups, simpler permissions.)
- For Artist Pro showrooms, is **one** showroom enough, or do they need multiple? (Recommend one — quality > quantity, and scales linearly with cost.)
