/**
 * Geocode a UK postcode to lat/lng using postcodes.io (free, no API key required).
 */
export async function geocodePostcode(
  postcode: string
): Promise<{ lat: number; lng: number } | null> {
  const clean = postcode.replace(/\s+/g, "").toUpperCase();
  if (!clean) return null;
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${clean}`);
    if (!res.ok) return null;
    const data = await res.json();
    const { latitude, longitude } = data.result ?? {};
    if (typeof latitude !== "number" || typeof longitude !== "number") return null;
    return { lat: latitude, lng: longitude };
  } catch {
    return null;
  }
}
