"use client";

// Page-side wrapper for /api/account/export. Email links referencing
// "Export your data" used to land here as a 404; the page now runs the
// export and offers the file as a direct download.
//
// C30/C31 (QA 2026-08-28): this page used to POST while the API only
// exported GET, so every export 405'd, and the ready state promised an
// email job that has never existed. The export is synchronous: we GET the
// dump with the caller's bearer token (a plain <a href> cannot carry it,
// the session lives in localStorage, not cookies), wrap it in a blob URL
// and hand it over as a download link.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

export default function AccountExportPage() {
  const { user, loading } = useAuth();
  const [state, setState] = useState<"idle" | "working" | "ready" | "error">("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    // setState lives inside the async resolution so the lint rule that
    // bans setState() during the synchronous effect body is satisfied.
    Promise.resolve().then(() => { if (!cancelled) setState("working"); });
    authFetch("/api/account/export")
      .then(async (res) => {
        if (!res.ok) {
          let message = "Could not prepare your export.";
          try {
            const body = await res.json();
            if (typeof body?.error === "string") message = body.error;
          } catch {
            /* keep the generic message */
          }
          throw new Error(message);
        }
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setDownloadUrl(url);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error && err.message ? err.message : "Could not reach the export service.");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  // Release the blob URL when the page unmounts.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

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
          {state === "ready" && downloadUrl && (
            <>
              <p className="text-muted leading-relaxed mb-6">
                Your data is ready. Click below to download it as a JSON file.
              </p>
              <a
                href={downloadUrl}
                download={`wallplace-export-${new Date().toISOString().slice(0, 10)}.json`}
                className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors"
              >
                Download
              </a>
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
