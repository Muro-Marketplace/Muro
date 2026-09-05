"use client";

import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import Button from "@/components/Button";
import WorksEditor from "@/components/portfolio/WorksEditor";

/**
 * My Portfolio: the full-screen home of the works editor.
 *
 * The editor itself lives in @/components/portfolio/WorksEditor, because the
 * profile page's Works section mounts the same thing (2026-09-06). This page is
 * now only the chrome around it: the layout, the page title, and the shortcut
 * across to the profile.
 */
export default function PortfolioPage() {
  return (
    <ArtistPortalLayout activePath="/artist-portal/portfolio">
      <WorksEditor
        title={<h1 className="text-2xl lg:text-3xl">My Portfolio</h1>}
        headerActions={
          <Button href="/artist-portal/profile" variant="secondary" size="sm">
            Edit Profile
          </Button>
        }
      />
    </ArtistPortalLayout>
  );
}
