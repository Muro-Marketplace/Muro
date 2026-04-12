import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-background px-6">
      <div className="text-center max-w-lg">
        <p className="font-serif text-8xl sm:text-9xl text-foreground/10 select-none mb-4">
          404
        </p>
        <h1 className="text-2xl sm:text-3xl font-serif text-foreground mb-3">
          Page not found
        </h1>
        <p className="text-sm sm:text-base text-muted leading-relaxed mb-10">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          <Link
            href="/browse"
            className="flex flex-col items-center gap-2 px-5 py-5 border border-border rounded-sm hover:border-accent/30 hover:shadow-sm transition-all duration-200"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
            <span className="text-sm font-medium text-foreground">Browse Artwork</span>
          </Link>

          <Link
            href="/artists"
            className="flex flex-col items-center gap-2 px-5 py-5 border border-border rounded-sm hover:border-accent/30 hover:shadow-sm transition-all duration-200"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span className="text-sm font-medium text-foreground">For Artists</span>
          </Link>

          <Link
            href="/venues"
            className="flex flex-col items-center gap-2 px-5 py-5 border border-border rounded-sm hover:border-accent/30 hover:shadow-sm transition-all duration-200"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent"
              aria-hidden="true"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span className="text-sm font-medium text-foreground">For Venues</span>
          </Link>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors duration-200"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Go back home
        </Link>
      </div>
    </div>
  );
}
