"use client";

/**
 * Cloudflare Turnstile widget for signup forms.
 *
 * Renders a Turnstile challenge when NEXT_PUBLIC_TURNSTILE_SITE_KEY is
 * set. Without that env var the component renders nothing and reports
 * a synthetic "skip" token so local dev / preview branches that don't
 * have a key still let people sign up.
 *
 * The companion server check lives in /api/auth/verify-turnstile and
 * is wired into the signup pages so the account flip-flop isn't
 * granted until the token verifies against Cloudflare.
 */

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "auto" | "light" | "dark";
          size?: "normal" | "compact";
        },
      ) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

interface Props {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  theme?: "auto" | "light" | "dark";
  className?: string;
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export default function Turnstile({
  onVerify,
  onExpire,
  theme = "auto",
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    // No site key configured → emit a synthetic dev-bypass token so the
    // signup form can proceed in environments without Turnstile set up.
    // The server-side /api/auth/verify-turnstile endpoint treats this
    // sentinel as a no-op only when its own secret is also unset.
    if (!SITE_KEY) {
      onVerify("dev-bypass");
      return;
    }
    if (typeof window === "undefined") return;

    let cancelled = false;

    function mount() {
      if (cancelled) return;
      if (!window.turnstile || !containerRef.current) return;
      // Re-mounts (React StrictMode in dev) shouldn't stack widgets.
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (token) => onVerify(token),
        "expired-callback": () => onExpire?.(),
        "error-callback": () => onExpire?.(),
        theme,
      });
    }

    if (window.turnstile) {
      mount();
    } else {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = mount;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
    // onVerify / onExpire intentionally excluded — re-rendering the
    // widget on every parent re-render would reset the user's challenge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  if (!SITE_KEY) return null;

  return <div ref={containerRef} className={className} />;
}
