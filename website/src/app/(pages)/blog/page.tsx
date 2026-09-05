import Link from "next/link";
import Image from "next/image";
import { blogPosts } from "@/data/blog-posts";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { markdownToPlainText } from "@/lib/markdown";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog",
  description: "Tips for artists, advice for collectors, and ideas for spaces putting art on real walls, from the Wallplace team.",
};

// Phase 2.7: merge curated static posts with DB-backed artist posts.
// Always read fresh so newly approved blogs land on the index without
// a revalidation window.
export const dynamic = "force-dynamic";

interface PublishedDbBlog {
  slug: string;
  title: string;
  body_markdown: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  author_user_id: string;
  author_slug: string | null;
  author_name: string | null;
}

async function loadPublishedBlogs(): Promise<PublishedDbBlog[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("blogs")
    .select(
      "slug, title, body_markdown, cover_image_url, published_at, author_user_id",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];

  const authorIds = Array.from(
    new Set(data.map((r) => (r as { author_user_id: string }).author_user_id)),
  );
  const byId = new Map<string, { slug: string; name: string }>();
  if (authorIds.length > 0) {
    const { data: profiles } = await db
      .from("artist_profiles")
      .select("user_id, slug, name")
      .in("user_id", authorIds);
    for (const p of (profiles ?? []) as Array<{ user_id: string; slug: string; name: string }>) {
      byId.set(p.user_id, { slug: p.slug, name: p.name });
    }
  }
  return data.map((r) => {
    const row = r as PublishedDbBlog;
    const author = byId.get(row.author_user_id);
    return {
      ...row,
      author_slug: author?.slug ?? null,
      author_name: author?.name ?? null,
    };
  });
}

export default async function BlogPage() {
  const dbBlogs = await loadPublishedBlogs();
  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="relative -mt-14 lg:-mt-16 min-h-[50vh] lg:min-h-[42vh] flex items-center justify-center pt-14 lg:pt-16 overflow-hidden"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1471107340929-a87cd0f5b5f3?w=1920&h=800&fit=crop&crop=center')", backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className="absolute inset-0 bg-black/70" />
        <div className="max-w-[1000px] mx-auto px-6 text-center relative z-10">
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">Blog</p>
          <h1 className="font-serif text-4xl lg:text-5xl text-white mb-4">Insights & Stories</h1>
          <p className="text-lg text-white/50 max-w-lg mx-auto">
            Tips for artists, advice for collectors, and stories from spaces putting art on real walls.
          </p>
        </div>
      </section>

      {/* Posts grid: curated static posts up top, then artist posts. */}
      <section className="py-16 lg:py-20">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {blogPosts.map((post, i) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className={`group block ${i === 0 ? "md:col-span-2" : ""}`}
              >
                <article className="bg-surface border border-border rounded-sm overflow-hidden hover:border-accent/30 hover:shadow-lg transition-all duration-300">
                  <div className={`relative overflow-hidden ${i === 0 ? "h-64 md:h-80" : "h-48"}`}>
                    <Image
                      src={post.image}
                      alt={post.title}
                      fill
                      className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
                      sizes={i === 0 ? "100vw" : "(max-width: 768px) 100vw, 50vw"}
                    />
                    <div className="absolute top-3 left-3">
                      <span className="inline-block px-2.5 py-1 bg-white/90 text-[10px] font-medium text-foreground rounded-sm backdrop-blur-sm">
                        {post.category}
                      </span>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center gap-3 text-xs text-muted mb-3">
                      <time>{new Date(post.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</time>
                      <span className="w-1 h-1 rounded-full bg-border" />
                      <span>{post.readTime}</span>
                    </div>
                    <h2 className={`font-serif text-foreground mb-2 leading-snug group-hover:text-accent transition-colors ${i === 0 ? "text-2xl" : "text-lg"}`}>
                      {post.title}
                    </h2>
                    <p className="text-sm text-muted leading-relaxed line-clamp-2">
                      {post.excerpt}
                    </p>
                  </div>
                </article>
              </Link>
            ))}
            {dbBlogs.map((post) => (
              <Link
                key={`db-${post.slug}`}
                href={`/blog/${post.slug}`}
                className="group block"
              >
                <article className="bg-surface border border-border rounded-sm overflow-hidden hover:border-accent/30 hover:shadow-lg transition-all duration-300">
                  {post.cover_image_url && (
                    <div className="relative overflow-hidden h-48">
                      <Image
                        src={post.cover_image_url}
                        alt={post.title}
                        fill
                        className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
                        sizes="(max-width: 768px) 100vw, 50vw"
                      />
                    </div>
                  )}
                  <div className="p-6">
                    <div className="flex items-center gap-3 text-xs text-muted mb-3">
                      <time>
                        {post.published_at &&
                          new Date(post.published_at).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                      </time>
                      {post.author_name && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-border" />
                          <span>{post.author_name}</span>
                        </>
                      )}
                    </div>
                    <h2 className="font-serif text-foreground mb-2 leading-snug group-hover:text-accent transition-colors text-lg">
                      {post.title}
                    </h2>
                    <p className="text-sm text-muted leading-relaxed line-clamp-2">
                      {markdownToPlainText(post.body_markdown).slice(0, 240)}
                    </p>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
