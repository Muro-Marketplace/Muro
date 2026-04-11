export interface ArtCategory {
  id: string;
  label: string;
  /** primaryMedium values that belong to this category */
  mediums: string[];
  /** Subcategory labels derived from styleTags/themes within this medium group */
  subcategories: string[];
}

export const artCategories: ArtCategory[] = [
  {
    id: "photography",
    label: "Photography",
    mediums: [
      "Street Photography",
      "Architectural Photography",
      "Abstract Photography",
      "Landscape Photography",
      "Documentary Photography",
      "Urban Photography",
      "Fine Art Photography",
      "Still Life Photography",
      "Portrait Photography",
      "Nature Photography",
    ],
    subcategories: [
      "Landscape",
      "Street",
      "Architectural",
      "Portrait",
      "Documentary",
      "Fine Art",
      "Nature",
      "Abstract",
      "Urban",
      "Still Life",
      "Black & White",
    ],
  },
  {
    id: "painting",
    label: "Painting",
    mediums: [
      "Oil Painting",
      "Acrylic Painting",
      "Watercolour",
      "Abstract Painting",
      "Gouache Painting",
      "Encaustic Painting",
      "Acrylic & Collage",
    ],
    subcategories: [
      "Abstract",
      "Landscape",
      "Portrait",
      "Still Life",
      "Contemporary",
      "Minimalist",
      "Expressionist",
      "Plein Air",
    ],
  },
  {
    id: "printmaking",
    label: "Printmaking",
    mediums: [
      "Screen Printing",
      "Linocut Printmaking",
      "Risograph Printing",
      "Woodcut Printmaking",
    ],
    subcategories: [
      "Screen Print",
      "Linocut",
      "Woodcut",
      "Risograph",
      "Limited Edition",
    ],
  },
  {
    id: "drawing",
    label: "Drawing & Illustration",
    mediums: [
      "Charcoal Drawing",
      "Ink & Wash",
      "Botanical Illustration",
      "Digital Illustration",
    ],
    subcategories: [
      "Charcoal",
      "Ink",
      "Botanical",
      "Digital",
      "Figurative",
    ],
  },
  {
    id: "mixed-media",
    label: "Mixed Media",
    mediums: [
      "Mixed Media",
      "Textile Art",
      "Ceramic Wall Art",
    ],
    subcategories: [
      "Collage",
      "Textile",
      "Ceramic",
      "Sculptural",
    ],
  },
];

/** Find which category an artist's primaryMedium belongs to */
export function getCategoryForMedium(primaryMedium: string): ArtCategory | null {
  return artCategories.find((cat) => cat.mediums.includes(primaryMedium)) || null;
}

/** Check if an artist matches a subcategory (via styleTags or themes) */
export function matchesSubcategory(subcategory: string, styleTags: string[], themes: string[]): boolean {
  const lower = subcategory.toLowerCase();
  return (
    styleTags.some((t) => t.toLowerCase().includes(lower)) ||
    themes.some((t) => t.toLowerCase().includes(lower))
  );
}
