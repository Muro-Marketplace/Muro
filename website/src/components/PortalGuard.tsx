"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface PortalGuardProps {
  allowedType: "artist" | "venue" | "admin";
  children: React.ReactNode;
}

export default function PortalGuard({ allowedType, children }: PortalGuardProps) {
  const { user, loading, userType } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    } else if (!loading && user && userType && userType !== allowedType) {
      router.replace(
        userType === "admin" ? "/admin" :
        userType === "artist" ? "/artist-portal" :
        "/venue-portal"
      );
    }
  }, [user, loading, userType, allowedType, router]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-muted text-sm">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
