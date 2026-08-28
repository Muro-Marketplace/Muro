// The artist Showroom is PARKED (owner decision 2026-08-28): removed from the
// portal for MVP; the public "view on your wall" visualiser stays. Revert this
// commit to bring the showroom back.
import { redirect } from "next/navigation";

export default function ParkedShowroom() {
  redirect("/artist-portal");
}
