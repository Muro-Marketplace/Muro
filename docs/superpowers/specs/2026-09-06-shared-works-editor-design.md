# A shared works editor

Date: 2026-09-06
Status: approved

## The problem

Artists manage works in two places that do different amounts.

`/artist-portal/portfolio` is the real editor: 4,755 lines covering the work
form (images, title, medium, description, dimensions, a sizes table with
per-size shipping and in-store prices, availability, stock, frames), a grid with
drag reorder and multi-select, three bulk modals (bulk add, bulk pricing, bulk
edit), copy and paste of sizes and prices, keyboard shortcuts, and the artist's
default and international shipping settings.

`/artist-portal/profile` section 6 is a read-only thumbnail grid and a button
that sends you to the portfolio.

The owner wants the profile's Works section to do everything the portfolio does.

Worth recording: the profile's inline quick-add card was deliberately removed
once, with the code noting "the owner wants artists using the full Portfolio
editor instead". This reverses that, on the owner's instruction. What is being
built now is not the old quick-add card; it is the whole editor, in both places.

## What we are building

One `WorksEditor` component holding everything the portfolio page does except
its page chrome. Both surfaces render it, so the two can never drift and a fix
lands in both at once.

My Portfolio keeps its own page title and its "Edit Profile" button. Everything
else, including the works count, the tier-limit upsell, the "+ Add New Work"
button and the shipping settings, moves into the component.

## Decisions taken

**Both pages keep the editor, sharing one component.** Retiring My Portfolio
was considered and rejected: it is a working full-screen surface for heavy
sessions, and retiring it would move the nav, the links and any bookmarks for no
gain.

**Everything except page chrome comes across**, shipping settings included. They
are artist-level rather than works-level, but they are read and set while pricing
works, so splitting them would make the embedded editor incomplete for the exact
task it exists to serve.

**Works keep saving instantly.** They already save per action, through
`useSaveAction`, with optimistic update, rollback and error toasts. Rewiring that
to batch behind the profile's Save button would put the riskiest part of this
change on the one path that touches live data, and would give the profile page
two different meanings for one button. The Works section says plainly that works
save as they go.

## Shape

New home: `src/components/portfolio/`, beside the existing `FrameOptionsEditor`.

```
src/components/portfolio/
  WorksEditor.tsx          the page body, moved
  frame-payload.ts         moved from the page's folder
  bulk-pricing.ts          "
  changed-works.ts         "
  bulk-add-validation.ts   "
  work-availability.ts     "
```

None of the five helpers is imported anywhere outside the portfolio page today,
so they move with it. `git mv` keeps their history and their tests.

```tsx
interface WorksEditorProps {
  /** Shown on the left of the header row. The portfolio page passes its page
      title; the profile section passes nothing, because its own section
      heading already sits above. */
  title?: React.ReactNode;
  /** Extra controls beside the works count. The portfolio page passes its
      "Edit Profile" button. */
  headerActions?: React.ReactNode;
}
```

The component keeps `useCurrentArtist()` internally, so both mounts behave
identically and neither page has to thread the artist through.

The loading and no-profile branch currently returns wrapped in
`ArtistPortalLayout`. The component returns the bare message instead and each
page wraps it, which is what lets the profile mount it inside a section.

Afterwards:

```tsx
// portfolio/page.tsx, in full
<ArtistPortalLayout activePath="/artist-portal/portfolio">
  <WorksEditor
    title={<h1 className="text-2xl lg:text-3xl">My Portfolio</h1>}
    headerActions={<Button href="/artist-portal/profile" variant="secondary" size="sm">Edit Profile</Button>}
  />
</ArtistPortalLayout>
```

```tsx
// profile/page.tsx, section 6
<div className={sectionClass}>
  <h2 className="text-lg font-medium">Your Works</h2>
  <p className="text-sm text-muted">Works save as you go, so the Save button above covers your profile only.</p>
  <WorksEditor />
</div>
```

## How it is sequenced

Two commits, so a regression bisects to one of them.

1. **The move.** Cut the page body into the component, changing nothing else.
   The portfolio page's 22 existing tests must pass untouched. If they need
   edits, the move was not faithful and the edit is a bug, not a fixture change.
2. **The mount.** Render it in the profile's Works section, replacing the
   read-only grid and the "Go to My Portfolio" button.

## Testing

The 22 portfolio tests are the safety net for step 1 and are not modified.

New tests on the profile page for step 2:

- The Works section renders the editor: the add control and the works grid are
  present, where before there was only a thumbnail list.
- Adding a work from the profile page saves it, without the profile's own Save
  button being pressed.
- The profile's Save button still saves only the profile, and its
  unsaved-changes state is not affected by editing a work.
- The read-only grid and the "Go to My Portfolio" button are gone.

## Known wrinkle

Both the profile form and the work form call `useUnsavedWarning`. With a dirty
profile and a dirty work form at once, leaving the page raises two confirms in
sequence. It fails safe, toward not losing work, and deduplicating the hook is a
separate change. Recorded rather than fixed.
