import { notFound } from "next/navigation";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import BlogEditor from "@/components/BlogEditor";
import { isFlagOn } from "@/lib/feature-flags";

export default function NewBlogPage() {
  // bug-12: BLOGS_V1 is off in prod and the API 403s every save, so without this
  // gate an artist got a fully interactive editor whose every save failed. This is
  // a server component, so the check runs before any client JS ships.
  if (!isFlagOn("BLOGS_V1")) notFound();
  return (
    <ArtistPortalLayout activePath="/artist-portal/blogs">
      <BlogEditor />
    </ArtistPortalLayout>
  );
}
