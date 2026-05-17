"use client";

import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { SavedProvider } from "@/context/SavedContext";
import { CookieConsentProvider } from "@/context/CookieConsentContext";
import { ToastProvider } from "@/context/ToastContext";
import { ConfirmProvider } from "@/context/ConfirmContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CookieConsentProvider>
      <AuthProvider>
        <CartProvider>
          <ToastProvider>
            <ConfirmProvider>
              <SavedProvider>{children}</SavedProvider>
            </ConfirmProvider>
          </ToastProvider>
        </CartProvider>
      </AuthProvider>
    </CookieConsentProvider>
  );
}
