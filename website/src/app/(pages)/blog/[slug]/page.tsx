import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { blogPosts } from "@/data/blog-posts";
import type { Metadata } from "next";

export async function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = blogPosts.find((p) => p.slug === slug);
  if (!post) return { title: "Post Not Found – Wallspace" };
  return { title: `${post.title} – Wallspace Blog`, description: post.excerpt };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = blogPosts.find((p) => p.slug === slug);
  if (!post) notFound();

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
            <p className="text-sm text-muted mb-6">Whether you&rsquo;re an artist or a venue, Wallspace connects you with the right people.</p>
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
