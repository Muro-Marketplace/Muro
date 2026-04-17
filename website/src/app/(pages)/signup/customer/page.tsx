"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import TermsCheckbox from "@/components/TermsCheckbox";

export default function CustomerSignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreedToTos, setAgreedToTos] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { user_type: "customer", display_name: name },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      // Sign in immediately
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Account created! Please sign in.");
        setLoading(false);
        return;
      }

      // Record terms acceptance (fire-and-forget)
      fetch("/api/terms/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail: email,
          userType: "customer",
          termsVersion: "v1.0-2026-04",
          termsType: "platform_tos",
        }),
      }).catch(() => {});

      router.push("/browse");
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative">
      <div className="absolute inset-0 -z-10">
        <Image
          src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop&crop=center"
          alt="Mountain landscape"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/55" />
      </div>

      <div className="w-full max-w-md px-6 py-16">
        <div className="text-center mb-8">
          <h1 className="text-3xl lg:text-4xl font-serif mb-2 text-white">Create Account</h1>
          <p className="text-white/50 text-sm">Buy art, track orders, build your collection</p>
        </div>

        <div className="bg-white/95 backdrop-blur-sm rounded-sm p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Your name"
                className="w-full px-4 py-3 bg-background border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-background border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="At least 6 characters"
                className="w-full px-4 py-3 bg-background border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted">or continue with</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signInWithOAuth({
                    provider: "google",
                    options: { redirectTo: `${window.location.origin}/browse`, queryParams: { access_type: "offline", prompt: "consent" } },
                  });
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-sm text-sm font-medium text-foreground hover:bg-background transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Google
              </button>
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signInWithOAuth({
                    provider: "apple",
                    options: { redirectTo: `${window.location.origin}/browse` },
                  });
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-sm text-sm font-medium text-foreground hover:bg-background transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                Apple
              </button>
            </div>

            <div className="py-1">
              <TermsCheckbox
                termsType="platform_tos"
                checked={agreedToTos}
                onChange={setAgreedToTos}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !agreedToTos}
              className="w-full px-6 py-3 bg-accent text-white text-sm font-semibold uppercase tracking-wider rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-sm text-white/50">
          Already have an account?{" "}
          <Link href="/login" className="text-white hover:text-accent transition-colors">Sign in</Link>
          {" · "}
          <Link href="/signup" className="text-white hover:text-accent transition-colors">Other account types</Link>
        </p>
      </div>
    </div>
  );
}
