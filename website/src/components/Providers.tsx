"use client";

import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { SavedProvider } from "@/context/SavedContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>
        <SavedProvider>{children}</SavedProvider>
      </CartProvider>
    </AuthProvider>
  );
}
