# Mobile ADR 03: The two canvas editors run in an embedded web view

**Status:** Proposed
**Date:** 2026-09-06
**Applies to:** the artist showroom editor and the venue wall editor
**Relates to:** §4.4 and §12.4 of `2026-09-06-wallplace-mobile-app-plan.md`, and `website/docs/products/WALL_VISUALIZER.md`

## Context

The wall visualiser is the product's most technically involved feature and its stack does not exist on React Native. It is:

| File | Lines | Depends on |
|---|---|---|
| `website/src/components/visualizer/WallVisualizer.tsx` | 2,025 | `react-konva`, `konva` |
| `website/src/components/visualizer/Wall3DCanvas.tsx` | 1,345 | `three`, `@react-three/fiber`, `@react-three/drei` |
| `website/src/components/visualizer/WallCanvas.tsx` | 768 | `react-konva` |

Neither `react-konva` nor `@react-three/fiber` runs on React Native. `WALL_VISUALIZER.md` §D1 records why Konva was chosen over Fabric, raw canvas and Pixi, and none of that reasoning transfers.

The usage is small. Verified in production on 2026-09-06: **12 rows in `walls`, 9 in `wall_layouts`, 9 in `wall_renders`, 29 in `visualizer_usage`**. Showroom publishing is Pro-only.

Layouts are stored with positions in **centimetres**, not pixels (`WALL_VISUALIZER.md` §D2), so the same layout renders at any canvas size. That is what makes an embedded view viable: the data model is already renderer-agnostic.

## Options considered

| Option | Cost | Verdict |
|---|---|---|
| **Embedded web view for the two editors, native chrome around them** | about 1 week | **Chosen** |
| Reimplement in React Native Skia | 6 to 10 engineer-weeks | Rejected. It is the entire P3 budget for a feature with 9 saved layouts |
| Native SceneKit and Filament | 10 to 16 weeks, twice | Rejected outright: two implementations, and ADR 01 exists partly to avoid that |
| A deliberately reduced native editor plus AR | 4 to 6 weeks | Rejected **for the editor**, accepted **for creation**: the wall photograph and AR measurement flow is native (P4, ranked 7th in §10), because that is the part venues actually use standing in a room |
| Drop the visualiser from the app entirely | 0 | Rejected. A venue that photographs a wall in the app and then cannot lay work on it has an incomplete tool |

## Decision

The **artist showroom editor** (`/artist-portal/showroom/[id]`) and the **venue wall editor** (`/venue-portal/walls/[id]`) are presented as a full-screen modal containing an embedded web view of the existing editor, wrapped in native chrome: a native top bar with the wall name, a native save state, a native quota chip and a native close control.

The **public showroom viewer** on an artist profile (`/browse/[slug]/showroom`) is a third, read-only case: an embedded three.js scene inline within an otherwise native profile screen.

Everything around them is native: the wall list, the create flow (preset picker or camera capture, and from P4 AR plane detection to measure the wall), the layout list, the works picker, the quota display, the publish action and the share.

The web view authenticates by passing the current access token through a one-time handshake, never by embedding a token in the URL, and it is torn down completely on dismiss rather than kept in a background stack.

## Why this survives Apple 4.2

Guideline 4.2 asks whether **the app** is "a repackaged website" and 4.2.2 whether it is "primarily marketing materials, advertisements, web clippings, content aggregators, or a collection of links" (retrieved 2026-09-06). The test is applied to the app, not to a component.

Wallplace's app is native: five tabs per role, native lists, native camera capture, native push, a native payment sheet, native printing, native share. Two editors inside it are embedded views. That ratio is unremarkable and is the same pattern used by mapping, document and design apps that pass review routinely. The justification is per screen and each one holds on its own: no native equivalent of the library exists, the alternative is 6 to 10 engineer-weeks against 9 production rows, and the surrounding flow is fully native.

## Consequences

**Positive**
- The visualiser reaches the app in P3 for about a week of work rather than a quarter.
- One implementation, so a visualiser change ships to web and app together.
- The tier limits, the quota ledger and `getTierLimits` stay exactly where they are, server-side.

**Negative**
- The editors will feel like web on a phone, because they are. Gestures are the browser's, not the platform's.
- Memory pressure on a 4GB Android device is real: Konva plus three.js in a WebView is heavy. Mitigated by modal presentation, complete teardown on dismiss, and a device-memory check that shows a message rather than crashing.
- Offline is not available in the editors.
- Two screens whose behaviour cannot be tested by the app's own unit tests, only end to end.

## What would reverse this

- Visualiser usage growing to where the editors are a daily tool rather than an occasional one (a reasonable trigger: more than 200 `wall_layouts` rows, or more than 30% of venues having edited a layout in the last 30 days). At that point a React Native Skia reimplementation of the 2D editor earns its 6 to 10 weeks; the 3D showroom probably still does not.
- The memory guard firing often enough on real devices to be a support problem.
- `react-konva` or `@react-three/fiber` gaining a supported React Native target, which would make the port mechanical.
