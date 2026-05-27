import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { blogPosts } from "@/data/blog-posts";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
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

async function loadDbBlogBySlug(slug: string): Promise<{
  blog: DbBlogRow;
  authorSlug: string | null;
  authorName: string | null;
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
  const { data: profile } = await db
    .from("artist_profiles")
    .select("slug, name")
    .eq("user_id", data.author_user_id)
    .maybeSingle<{ slug: string; name: string }>();
  return {
    blog: data,
    authorSlug: profile?.slug ?? null,
    authorName: profile?.name ?? null,
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
  };
}) {
  const { blog, authorSlug, authorName } = record;
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
            {(blog.body_markdown ?? "").split("\n\n").map((paragraph, i) => (
              <p key={i} className="text-foreground/80 leading-relaxed mb-6 text-base whitespace-pre-wrap">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
