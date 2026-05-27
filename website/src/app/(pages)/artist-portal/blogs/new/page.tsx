import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import BlogEditor from "@/components/BlogEditor";

export default function NewBlogPage() {
  return (
    <ArtistPortalLayout activePath="/artist-portal/blogs">
      <BlogEditor />
    </ArtistPortalLayout>
  );
}
