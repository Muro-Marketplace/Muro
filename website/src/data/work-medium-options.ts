/**
 * Common medium / material values for the artwork form. The list is
 * surfaced in the artist profile editor and the portfolio "Edit work"
 * form, both via the searchable Combobox component.
 *
 * It's a guidance list, not an enum, the Combobox runs in
 * `allowCustom` mode so artists can type free-form values like
 * "Oil + gold leaf on linen" when their work doesn't slot neatly
 * into one of the canonical entries.
 *
 * Lives in /src/data so client pages can import it without pulling
 * in another page module (Next.js page files shouldn't be cross-
 * imported, doing so can drag the whole route's runtime into the
 * importer and break rendering).
 */
export const WORK_MEDIUM_OPTIONS = [
  "Oil on canvas",
  "Oil on board",
  "Oil on linen",
  "Acrylic on canvas",
  "Acrylic on board",
  "Watercolour on paper",
  "Gouache on paper",
  "Ink on paper",
  "Pencil on paper",
  "Graphite on paper",
  "Charcoal on paper",
  "Pastel on paper",
  "Mixed media on paper",
  "Mixed media on canvas",
  "Mixed media on board",
  "Collage",
  "Linocut print",
  "Screen print",
  "Etching",
  "Lithograph",
  "Woodcut print",
  "Giclée print",
  "C-type print",
  "Archival pigment print",
  "Silver gelatin print",
  "Digital print",
  "Photograph",
  "Digital art",
  "Sculpture",
  "Ceramic",
  "Textile",
  "Other",
];
