import Link from "next/link";
import Image from "next/image";
import { blogPosts } from "@/data/blog-posts";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog – Wallplace",
  description: "Insights on art in commercial spaces, artist tips, and industry trends from the Wallplace team.",
};

export default function BlogPage() {
  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="relative -mt-14 lg:-mt-16 min-h-[50vh] lg:min-h-[60vh] flex items-center overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <img
            src="https://images.unsplash.com/photo-1471107340929-a87cd0f5b5f3?w=1920&h=800&fit=crop&crop=center"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/70" />
        </div>
        <div className="max-w-[1000px] mx-auto px-6 text-center relative z-10">
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">Blog</p>
          <h1 className="font-serif text-4xl lg:text-5xl text-white mb-4">Insights & Stories</h1>
          <p className="text-lg text-white/50 max-w-lg mx-auto">
            Tips for artists, advice for venues, and trends shaping the world of art in commercial spaces.
          </p>
        </div>
      </section>

      {/* Posts grid */}
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
          </div>
        </div>
      </section>
    </div>
  );
}
