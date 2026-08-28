"use client";

import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import BlogEditor from "@/components/BlogEditor";
import { authFetch } from "@/lib/api-client";
import { isFlagOn } from "@/lib/feature-flags";

interface BlogRow {
  id: string;
  title: string;
  body_markdown: string | null;
  cover_image_url: string | null;
  status: string;
}

export default function EditBlogPage() {
  // bug-12: same BLOGS_V1 gate as the list and new-blog pages.
  if (!isFlagOn("BLOGS_V1")) notFound();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [blog, setBlog] = useState<BlogRow | null>(null);
  const [featured, setFeatured] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/blogs/${id}`);
        if (!res.ok) {
          if (!cancelled) {
            setError("Couldn't load this blog.");
            setLoading(false);
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setBlog(data.blog);
        setFeatured(data.featured ?? []);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Network error.");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <ArtistPortalLayout activePath="/artist-portal/blogs">
      {loading ? (
        <p className="text-sm text-muted px-6 py-8">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600 px-6 py-8">{error}</p>
      ) : blog ? (
        <BlogEditor
          blogId={blog.id}
          initialTitle={blog.title}
          initialBody={blog.body_markdown ?? ""}
          initialCover={blog.cover_image_url}
          initialFeatured={featured}
          status={blog.status}
        />
      ) : null}
    </ArtistPortalLayout>
  );
}
