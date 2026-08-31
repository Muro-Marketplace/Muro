import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { blogPosts } from "@/data/blog-posts";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { renderMarkdown } from "@/lib/markdown";
import { slugify } from "@/lib/slugify";
import type { Metadata } from "next";

// Phase 2.7: DB blogs are dynamic, so the page must allow params that
// aren't in generateStaticParams.
export const dynamicParams = true;
export const dynamic = "force-dynamic";

interface DbBlogRow {
  id: string;
  slug: string;
  title: string;
  body_markdown: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  author_user_id: string;
}

interface FeaturedArtwork {
  id: string;
  title: string;
  image: string;
  available: boolean;
  artistSlug: string | null;
}

async function loadFeaturedArtworks(blogId: string): Promise<FeaturedArtwork[]> {
  // Phase 2.7 follow-up: the editor lets artists pin featured artworks
  // to a blog, persisted to blog_featured_artworks. The public page
  // never read them back, so the selection was silently dropped on the
  // way to publish. This load joins:
  //   blog_featured_artworks → artist_works → artist_profiles
  // so the render can show the thumbnail, title and link to the
  // artist's work page (/browse/<artist>/<work>).
  try {
    const db = getSupabaseAdmin();
    const { data: rows, error } = await db
      .from("blog_featured_artworks")
      .select("artwork_id, position")
      .eq("blog_id", blogId)
      .order("position", { ascending: true });
    if (error || !rows || rows.length === 0) return [];

    const ids = (rows as Array<{ artwork_id: string }>).map((r) => r.artwork_id);
    const { data: works } = await db
      .from("artist_works")
      .select("id, title, image, available, artist_id")
      .in("id", ids);
    if (!works || works.length === 0) return [];

    const artistIds = Array.from(
      new Set(
        (works as Array<{ artist_id: string }>).map((w) => w.artist_id),
      ),
    );
    const slugByArtistId = new Map<string, string>();
    if (artistIds.length > 0) {
      const { data: profiles } = await db
        .from("artist_profiles")
        .select("id, slug")
        .in("id", artistIds);
      for (const p of (profiles ?? []) as Array<{ id: string; slug: string }>) {
        slugByArtistId.set(p.id, p.slug);
      }
    }

    const worksById = new Map<
      string,
      { id: string; title: string; image: string; available: boolean; artist_id: string }
    >();
    for (const w of works as Array<{
      id: string;
      title: string;
      image: string;
      available: boolean | null;
      artist_id: string;
    }>) {
      worksById.set(w.id, {
        id: w.id,
        title: w.title,
        image: w.image,
        available: !!w.available,
        artist_id: w.artist_id,
      });
    }

    // Preserve the editor's chosen order (position). Drop ids that no
    // longer resolve (artwork deleted since the blog was authored).
    const out: FeaturedArtwork[] = [];
    for (const r of rows as Array<{ artwork_id: string }>) {
      const w = worksById.get(r.artwork_id);
      if (!w) continue;
      out.push({
        id: w.id,
        title: w.title,
        image: w.image,
        available: w.available,
        artistSlug: slugByArtistId.get(w.artist_id) ?? null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function loadDbBlogBySlug(slug: string): Promise<{
  blog: DbBlogRow;
  authorSlug: string | null;
  authorName: string | null;
  featured: FeaturedArtwork[];
} | null> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("blogs")
    .select(
      "id, slug, title, body_markdown, cover_image_url, published_at, author_user_id, status",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle<DbBlogRow & { status: string }>();
  if (!data) return null;
  const [{ data: profile }, featured] = await Promise.all([
    db
      .from("artist_profiles")
      .select("slug, name")
      .eq("user_id", data.author_user_id)
      .maybeSingle<{ slug: string; name: string }>(),
    loadFeaturedArtworks(data.id),
  ]);
  return {
    blog: data,
    authorSlug: profile?.slug ?? null,
    authorName: profile?.name ?? null,
    featured,
  };
}

export async function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = blogPosts.find((p) => p.slug === slug);
  if (post) {
    return { title: post.title, description: post.excerpt };
  }
  const dbRecord = await loadDbBlogBySlug(slug);
  if (!dbRecord) return { title: "Post not found" };
  return {
    title: dbRecord.blog.title,
    description: (dbRecord.blog.body_markdown ?? "").slice(0, 160),
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = blogPosts.find((p) => p.slug === slug);
  if (!post) {
    const dbRecord = await loadDbBlogBySlug(slug);
    if (!dbRecord) notFound();
    return <DbBlogView record={dbRecord} />;
  }

  const otherPosts = blogPosts.filter((p) => p.slug !== slug).slice(0, 2);

  return (
    <div className="bg-background">
      {/* Hero image */}
      <div className="relative h-64 md:h-96">
        <Image src={post.image} alt={post.title} fill className="object-cover" sizes="100vw" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
          <div className="max-w-[800px] mx-auto">
            <span className="inline-block px-2.5 py-1 bg-accent text-white text-[10px] font-medium rounded-sm mb-3">
              {post.category}
            </span>
            <h1 className="font-serif text-3xl md:text-4xl text-white leading-tight">{post.title}</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <section className="py-12 lg:py-16">
        <div className="max-w-[800px] mx-auto px-6">
          <div className="flex items-center gap-4 text-sm text-muted mb-8 pb-6 border-b border-border">
            <span>{post.author}</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <time>{new Date(post.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</time>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>{post.readTime}</span>
          </div>

          <div className="prose prose-lg max-w-none">
            {post.content.split("\n\n").map((paragraph, i) => (
              <p key={i} className="text-foreground/80 leading-relaxed mb-6 text-base">
                {paragraph}
              </p>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-12 pt-8 border-t border-border bg-accent/5 rounded-sm p-8 text-center">
            <h3 className="font-serif text-xl mb-2">Ready to get started?</h3>
            <p className="text-sm text-muted mb-6">Whether you&rsquo;re an artist or a venue, Wallplace connects you with the right people.</p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/browse" className="px-6 py-3 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors">
                Browse Marketplace
              </Link>
              <Link href="/apply" className="px-6 py-3 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-surface transition-colors">
                Apply to Join
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Related posts */}
      {otherPosts.length > 0 && (
        <section className="py-12 lg:py-16 border-t border-border">
          <div className="max-w-[1200px] mx-auto px-6">
            <h2 className="font-serif text-2xl mb-8">More from the blog</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {otherPosts.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="group block">
                  <article className="bg-surface border border-border rounded-sm overflow-hidden hover:border-accent/30 transition-all duration-300">
                    <div className="relative h-48 overflow-hidden">
                      <Image src={p.image} alt={p.title} fill className="object-cover group-hover:scale-[1.03] transition-transform duration-500" sizes="50vw" />
                    </div>
                    <div className="p-5">
                      <p className="text-xs text-muted mb-2">{p.readTime}</p>
                      <h3 className="font-serif text-lg text-foreground group-hover:text-accent transition-colors leading-snug">{p.title}</h3>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function DbBlogView({
  record,
}: {
  record: {
    blog: DbBlogRow;
    authorSlug: string | null;
    authorName: string | null;
    featured: FeaturedArtwork[];
  };
}) {
  const { blog, authorSlug, authorName, featured } = record;
  return (
    <div className="bg-background">
      {blog.cover_image_url && (
        <div className="relative h-64 md:h-96">
          <Image src={blog.cover_image_url} alt={blog.title} fill className="object-cover" sizes="100vw" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
            <div className="max-w-[800px] mx-auto">
              <h1 className="font-serif text-3xl md:text-4xl text-white leading-tight">{blog.title}</h1>
            </div>
          </div>
        </div>
      )}
      <section className="py-12 lg:py-16">
        <div className="max-w-[800px] mx-auto px-6">
          {!blog.cover_image_url && (
            <h1 className="font-serif text-3xl md:text-4xl mb-8">{blog.title}</h1>
          )}
          <div className="flex items-center gap-4 text-sm text-muted mb-8 pb-6 border-b border-border">
            {authorName && authorSlug ? (
              <Link href={`/browse/${authorSlug}`} className="text-foreground hover:text-accent">
                {authorName}
              </Link>
            ) : authorName ? (
              <span>{authorName}</span>
            ) : null}
            {blog.published_at && (
              <>
                <span className="w-1 h-1 rounded-full bg-border" />
                <time>
                  {new Date(blog.published_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              </>
            )}
          </div>
          <div className="prose prose-lg max-w-none">
            {/* A32: the editor's own label says "Body (markdown)", but this
                used to split on blank lines and print each chunk verbatim, so
                artists' headings, links and lists were published as raw
                syntax. renderMarkdown returns React elements, never HTML, so
                nothing user-authored can inject markup. */}
            {renderMarkdown(blog.body_markdown ?? "")}
          </div>

          {featured.length > 0 && (
            <section className="mt-12 pt-10 border-t border-border">
              <h2 className="font-serif text-xl text-foreground mb-1">Featured works</h2>
              <p className="text-sm text-muted mb-6">
                Pieces from the artist that go with this piece of writing.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {featured.map((work) => {
                  const href =
                    work.artistSlug && work.title
                      ? `/browse/${work.artistSlug}/${slugify(work.title)}`
                      : null;
                  const card = (
                    <div className="group block">
                      <div className="relative aspect-[4/5] rounded-sm overflow-hidden border border-border bg-background">
                        <Image
                          src={work.image}
                          alt={work.title}
                          fill
                          className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
                          sizes="(max-width: 640px) 50vw, 33vw"
                        />
                        {!work.available && (
                          <span className="absolute top-2 right-2 text-[10px] uppercase tracking-wider bg-foreground/90 text-white px-1.5 py-0.5 rounded-sm">
                            Unavailable
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-foreground group-hover:text-accent transition-colors line-clamp-2">
                        {work.title}
                      </p>
                    </div>
                  );
                  return href ? (
                    <Link key={work.id} href={href}>
                      {card}
                    </Link>
                  ) : (
                    <div key={work.id}>{card}</div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
