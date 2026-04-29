/**
 * Wallplace taxonomy.
 *
 * Top-level disciplines + flat sub-styles per discipline. Digital illustration
 * lives as a sub-style under Drawing & Illustration rather than as its own
 * top-level, Wallplace's curated focus is original physical artwork, so a
 * standalone "Digital Art" bucket confused the marketplace.
 */
export const DISCIPLINES = [
  {
    id: "photography",
    label: "Photography",
    subStyles: [
      "landscape",
      "portrait",
      "urban",
      "documentary",
      "black-and-white",
      "fine-art",
      "abstract",
      "architectural",
      "still-life",
    ],
  },
  {
    id: "painting",
    label: "Painting",
    subStyles: [
      "abstract",
      "figurative",
      "landscape",
      "portrait",
      "still-life",
      "expressionist",
      "minimalist",
      "pop-art",
      "printmaking",
      "linocut",
      "screen-print",
    ],
  },
  {
    id: "drawing",
    label: "Drawing & Illustration",
    subStyles: [
      "botanical",
      "architectural",
      "portrait",
      "fashion",
      "editorial",
      "children",
      "line-art",
      "printmaking",
      "digital-illustration",
    ],
  },
  {
    id: "sketching",
    label: "Sketching",
    subStyles: ["urban", "figurative", "travel", "still-life", "architectural"],
  },
  {
    id: "sculpture",
    label: "Sculpture",
    subStyles: ["figurative", "abstract", "ceramic", "metal", "wood", "mixed-media"],
  },
  {
    id: "mixed",
    label: "Mixed / Other",
    subStyles: ["collage", "textile", "installation", "found-object", "multimedia"],
  },
] as const;

export type DisciplineId = (typeof DISCIPLINES)[number]["id"];
export type Discipline = (typeof DISCIPLINES)[number];

/** Find a discipline by its id. */
export function getDisciplineById(id: string): Discipline | null {
  return DISCIPLINES.find((d) => d.id === id) ?? null;
}

/** Get the sub-style list for a given discipline id (empty array if unknown). */
export function getSubStylesForDiscipline(id: string): readonly string[] {
  return getDisciplineById(id)?.subStyles ?? [];
}

/**
 * Human-readable label for a sub-style or theme slug.
 *   - "black-and-white"       -> "Black & White"
 *   - "colour-&-atmosphere"   -> "Colour & Atmosphere"
 *   - "still-life-&-objects"  -> "Still Life & Objects"
 *   - "travel-&-place"        -> "Travel & Place"
 *
 * Title-cases every word so tag pills read like editorial captions
 * rather than raw URL slugs.
 */
export function formatSubStyleLabel(slug: string): string {
  if (!slug) return "";
  return slug
    // Hyphen-encoded ampersands take precedence over the generic
    // dash-to-space rule so we don't end up with "Colour - Atmosphere".
    .replace(/-?&-?/g, " & ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/**
 * Top-level discipline label for a raw medium string + optional explicit
 * discipline id. Used in artist profile headers so the card reads as the
 * broad category ("Photography"), specific styles / themes ("Landscape
 * photography") live under the chips below.
 */
export function disciplineLabel(
  primaryMedium: string | null | undefined,
  rawDiscipline?: string | null,
): string {
  const id = resolveDiscipline(primaryMedium, rawDiscipline);
  return getDisciplineById(id)?.label || "Art";
}

/**
 * Map a free-text primary medium / legacy discipline onto the current
 * discipline taxonomy. Used so seed artists (and any DB rows that haven't
 * been backfilled) still appear under the right category filter.
 *
 * - Legacy "digital" discipline id is rehomed onto "drawing" (digital
 *   illustration lives there as a sub-style).
 * - Anything that doesn't match falls into "mixed".
 */
export function resolveDiscipline(
  primaryMedium: string | null | undefined,
  rawDiscipline?: string | null,
): DisciplineId {
  const explicit = (rawDiscipline || "").toLowerCase();
  if (explicit === "digital") return "drawing";
  if (
    explicit === "photography" ||
    explicit === "painting" ||
    explicit === "drawing" ||
    explicit === "sketching" ||
    explicit === "sculpture" ||
    explicit === "mixed"
  ) {
    return explicit;
  }
  const m = (primaryMedium || "").toLowerCase();
  if (m.includes("photo")) return "photography";
  if (
    m.includes("paint") ||
    m.includes("watercolour") ||
    m.includes("watercolor") ||
    m.includes("acrylic") ||
    m.includes("oil") ||
    m.includes("print")
  )
    return "painting";
  if (m.includes("sketch")) return "sketching";
  if (
    m.includes("sculpt") ||
    m.includes("ceramic") ||
    m.includes("clay") ||
    m.includes("bronze")
  )
    return "sculpture";
  if (
    m.includes("illust") ||
    m.includes("drawing") ||
    m.includes("digital") ||
    m.includes("ink")
  )
    return "drawing";
  if (m.includes("mixed") || m.includes("collage") || m.includes("textile"))
    return "mixed";
  return "mixed";
}
