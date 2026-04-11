"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { label: "My Orders", href: "/customer-portal" },
  { label: "Messages", href: "/customer-portal/messages" },
  { label: "Settings", href: "/customer-portal/settings" },
];

export default function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, userType, displayName, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] lg:min-h-[calc(100vh-4rem)] bg-background">
      {/* Sidebar */}
      <aside className={`
        fixed top-14 lg:top-16 left-0 h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-4rem)]
        w-56 bg-[#F5F3F0] border-r border-border z-30 flex flex-col
        transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-0.5 px-2">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`block text-sm py-2 px-3 rounded-sm transition-colors duration-150 ${
                    pathname === item.href
                      ? "text-accent font-medium bg-accent/8"
                      : "text-foreground/70 hover:text-foreground hover:bg-white/60"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="my-4 mx-4 border-t border-border" />
          <ul className="space-y-0.5 px-2">
            <li>
              <Link href="/browse" onClick={() => setSidebarOpen(false)} className="block text-sm py-2 px-3 rounded-sm text-muted hover:text-foreground hover:bg-white/60 transition-colors duration-150">
                Browse Art
              </Link>
            </li>
            <li>
              <button onClick={() => signOut()} className="w-full text-left text-sm py-2 px-3 rounded-sm text-muted hover:text-foreground hover:bg-white/60 transition-colors duration-150">
                Logout
              </button>
            </li>
          </ul>
        </nav>
        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm font-medium">
              {displayName?.charAt(0)?.toUpperCase() || "C"}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground leading-tight">{displayName || "Customer"}</p>
              <p className="text-xs text-muted">Customer</p>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && <div className="lg:hidden fixed inset-0 z-20 bg-black/30" onClick={() => setSidebarOpen(false)} />}

      <div className="flex-1 lg:ml-56 min-w-0">
        <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-6 lg:pb-8">{children}</div>
      </div>
    </div>
  );
}
