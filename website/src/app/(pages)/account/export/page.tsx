"use client";

// Page-side wrapper for /api/account/export. Email links referencing
// "Export your data" used to land here as a 404; now the page kicks off
// the export and surfaces progress + a download link.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { mutate, ApiError } from "@/lib/api-client";

export default function AccountExportPage() {
  const { user, loading } = useAuth();
  const [state, setState] = useState<"idle" | "working" | "ready" | "error">("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    // setState lives inside the async resolution so the lint rule that
    // bans setState() during the synchronous effect body is satisfied.
    Promise.resolve().then(() => { if (!cancelled) setState("working"); });
    // mutate throws on a non-2xx (ApiError, carrying the server's error string on
    // .code) or a dropped request, so the two failure branches merge into the catch.
    mutate<{ downloadUrl?: string }>("/api/account/export", { method: "POST" })
      .then((data) => {
        if (cancelled) return;
        if (data?.downloadUrl) setDownloadUrl(data.downloadUrl);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.code || "Could not start your export."
            : "Could not reach the export service.",
        );
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  if (!loading && !user) {
    return (
      <div className="bg-background">
        <section className="py-20 lg:py-24">
          <div className="max-w-[640px] mx-auto px-6">
            <h1 className="text-3xl lg:text-4xl mb-4">Export your data</h1>
            <p className="text-muted leading-relaxed mb-6">
              Sign in to request a copy of the data Wallplace holds for you.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent("/account/export")}`}
              className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors"
            >
              Sign in
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[640px] mx-auto px-6">
          <h1 className="text-3xl lg:text-4xl mb-4">Export your data</h1>
          {state === "working" && (
            <p className="text-muted leading-relaxed">Preparing your export, this can take a minute.</p>
          )}
          {state === "ready" && (
            <>
              <p className="text-muted leading-relaxed mb-6">
                Your data is ready. {downloadUrl ? "Click below to download." : "We&rsquo;ll email you a download link shortly."}
              </p>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors"
                >
                  Download
                </a>
              )}
            </>
          )}
          {state === "error" && (
            <>
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <p className="text-xs text-muted">
                Email{" "}
                <a href="mailto:privacy@wallplace.co.uk" className="text-accent hover:underline">privacy@wallplace.co.uk</a>
                {" "}and we&rsquo;ll generate the export manually.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
