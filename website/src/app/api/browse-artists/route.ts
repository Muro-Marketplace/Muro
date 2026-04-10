import { NextResponse } from "next/server";
import { getAllArtists } from "@/lib/db/merged-data";

// GET: return all artists (static + database) for the browse page
export async function GET() {
  try {
    const artists = await getAllArtists();
    return NextResponse.json({ artists });
  } catch (err) {
    console.error("Browse artists error:", err);
    return NextResponse.json({ artists: [] }, { status: 500 });
  }
}

// Revalidate every 60 seconds for ISR-like behavior
export const revalidate = 60;
