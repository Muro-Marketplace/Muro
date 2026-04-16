"use client";

import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { SavedProvider } from "@/context/SavedContext";
import { CookieConsentProvider } from "@/context/CookieConsentContext";
import { ToastProvider } from "@/context/ToastContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CookieConsentProvider>
      <AuthProvider>
        <CartProvider>
          <ToastProvider>
            <SavedProvider>{children}</SavedProvider>
          </ToastProvider>
        </CartProvider>
      </AuthProvider>
    </CookieConsentProvider>
  );
}
