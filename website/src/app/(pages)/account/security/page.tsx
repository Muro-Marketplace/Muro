"use client";

// Linked from security emails (suspicious-login, password reset etc.).
// Routes signed-in users to the appropriate portal's security area; for
// signed-out users it explains the next step. Existed only as an API
// before, so every email's "Secure your account" button 404'd.

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function AccountSecurityPage() {
  const router = useRouter();
  const { user, userType, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    // Each portal owns its own settings surface, where password reset +
    // session controls live. Bounce the signed-in user into the right
    // one rather than duplicating those panels here.
    if (user && userType === "artist") router.replace("/artist-portal/profile");
    else if (user && userType === "venue") router.replace("/venue-portal/profile");
    else if (user && userType === "customer") router.replace("/customer-portal/settings");
  }, [loading, user, userType, router]);

  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[640px] mx-auto px-6">
          <h1 className="text-3xl lg:text-4xl mb-4">Account security</h1>
          <p className="text-muted leading-relaxed mb-6">
            If you didn&rsquo;t request a recent sign-in or change to your account, secure it now by resetting your password and reviewing recent activity.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/forgot-password"
              className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors"
            >
              Reset password
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold tracking-wider uppercase border border-border text-foreground rounded-sm hover:bg-foreground/5 transition-colors"
            >
              Sign in
            </Link>
          </div>
          <p className="text-xs text-muted mt-8">
            If you think your account has been compromised, email{" "}
            <a href="mailto:security@wallplace.co.uk" className="text-accent hover:underline">security@wallplace.co.uk</a>
            {" "}with the date and time of the suspicious activity.
          </p>
        </div>
      </section>
    </div>
  );
}
