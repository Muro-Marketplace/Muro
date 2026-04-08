export interface ArtistCollection {
  id: string;
  artistSlug: string;
  artistName: string;
  name: string;
  description?: string;
  workIds: string[];
  bundlePrice: number;
  bundlePriceBand: string;
  coverImage: string;
  available: boolean;
}

export const collections: ArtistCollection[] = [
  {
    id: "maya-chen-london-streets",
    artistSlug: "maya-chen",
    artistName: "Maya Chen",
    name: "London Streets",
    description:
      "A curated set of Maya's most atmospheric East London street photography. Warm, golden-hour tones that bring life to any commercial interior.",
    workIds: ["maya-chen-1", "maya-chen-2", "maya-chen-3"],
    bundlePrice: 450,
    bundlePriceBand: "£450",
    coverImage: "https://picsum.photos/seed/maya-street-golden/900/600",
    available: true,
  },
  {
    id: "tom-hadley-urban-wild",
    artistSlug: "tom-hadley",
    artistName: "Tom Hadley",
    name: "Urban Wild",
    description:
      "Three large-format landscape prints capturing the overlooked green spaces of London. Perfect for lobbies, restaurants, and hotel common areas.",
    workIds: ["tom-hadley-1", "tom-hadley-2", "tom-hadley-3"],
    bundlePrice: 680,
    bundlePriceBand: "£680",
    coverImage: "https://picsum.photos/seed/tom-landscape-1/900/600",
    available: true,
  },
  {
    id: "priya-kapoor-archive-collection",
    artistSlug: "priya-kapoor",
    artistName: "Priya Kapoor",
    name: "The Archive Collection",
    description:
      "Priya's most striking documentary work – raw, unfiltered South Asian narratives that spark conversation in any space.",
    workIds: ["priya-kapoor-1", "priya-kapoor-2", "priya-kapoor-4"],
    bundlePrice: 520,
    bundlePriceBand: "£520",
    coverImage: "https://picsum.photos/seed/priya-doc-1/900/600",
    available: true,
  },
];

export function getCollectionById(id: string): ArtistCollection | undefined {
  return collections.find((c) => c.id === id);
}

export function getCollectionsByArtist(artistSlug: string): ArtistCollection[] {
  return collections.filter((c) => c.artistSlug === artistSlug);
}
