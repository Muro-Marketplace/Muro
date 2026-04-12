"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";

export default function CartIndicator({ className = "" }: { className?: string }) {
  const { itemCount } = useCart();

  if (itemCount === 0) return null;

  return (
    <Link
      href="/checkout"
      className={`relative inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 transition-colors ${className}`}
      title="View cart"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
      <span className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
        {itemCount}
      </span>
    </Link>
  );
}
