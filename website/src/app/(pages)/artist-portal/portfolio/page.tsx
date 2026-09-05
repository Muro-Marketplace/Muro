"use client";

import Button from "@/components/Button";
import WorksEditor from "@/components/portfolio/WorksEditor";

/**
 * My Portfolio: the full-screen home of the works editor.
 *
 * The editor itself lives in @/components/portfolio/WorksEditor, because the
 * profile page's Works section mounts the same thing (2026-09-06). This page is
 * now only the title and the shortcut across to the profile.
 *
 * The portal chrome is NOT here: it mounts once in the route layout, and
 * tests/integration/portal-chrome-in-layout.test.ts keeps pages out of it.
 */
export default function PortfolioPage() {
  return (
    <WorksEditor
      title={<h1 className="text-2xl lg:text-3xl">My Portfolio</h1>}
      headerActions={
        <Button href="/artist-portal/profile" variant="secondary" size="sm">
          Edit Profile
        </Button>
      }
    />
  );
}
