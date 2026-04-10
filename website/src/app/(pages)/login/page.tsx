"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, userType, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(userType === "venue" ? "/venue-portal" : "/artist-portal");
    }
  }, [authLoading, user, userType, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: authError } = await signIn(email, password);

    if (authError) {
      setError(authError.message === "Invalid login credentials"
        ? "Invalid email or password"
        : authError.message
      );
      setLoading(false);
      return;
    }

    // Redirect happens via the useEffect above when user state updates
  }

  // Don't render form while checking auth
  if (authLoading) return null;
  if (user) return null;

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] lg:min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 py-16">
      {/* Background image */}
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

      <div className="w-full max-w-md">
        {/* Heading */}
        <div className="text-center mb-8">
          <h1 className="text-3xl lg:text-4xl mb-2 text-white">Welcome back</h1>
          <p className="text-white/50 text-sm">Sign in to your Wallspace account</p>
        </div>

        {/* Login form */}
        <div className="bg-white/95 backdrop-blur-sm rounded-sm p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="Your password"
                minLength={6}
                className="w-full px-4 py-3 bg-background border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

        {/* Sign-up links */}
        <div className="text-center mt-6 space-y-2">
          <p className="text-sm text-white/50">
            Don&rsquo;t have an account?{" "}
            <Link href="/apply" className="text-accent hover:underline underline-offset-4">
              Apply to join as an artist
            </Link>
            {" "}or{" "}
            <Link href="/register-venue" className="text-accent hover:underline underline-offset-4">
              register your venue
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
