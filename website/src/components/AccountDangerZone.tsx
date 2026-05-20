"use client";

// Shared "Delete account" UI for customer / artist / venue settings pages.
//
// Wires the "DELETE MY ACCOUNT" confirm string into POST /api/account/delete
// (the hard-erasure endpoint). Note: this is intentionally NOT the soft-delete
// DELETE /api/account anonymisation flow — different endpoint, different
// confirm string, different semantics.
//
// On success: signOut() (best-effort — the auth user is already gone server-
// side, so the call may 401, hence the .catch swallow) and redirect home.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";

const CONFIRM_STRING = "DELETE MY ACCOUNT";

export default function AccountDangerZone() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (confirmText !== CONFIRM_STRING) {
      setError(`Type ${CONFIRM_STRING} to confirm.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch("/api/account/delete", {
        method: "POST",
        body: JSON.stringify({ confirm: confirmText }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not delete your account.");
        setBusy(false);
        return;
      }
      // Sign out (best-effort — the auth user is already gone, so this
      // may fail silently with 401; that's fine) then redirect to home.
      await supabase.auth.signOut().catch(() => {});
      router.push("/");
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="text-lg font-medium text-red-600 mb-3">Delete account</h2>
      <p className="text-sm text-muted leading-relaxed mb-4 max-w-md">
        This permanently deletes your profile, messages, saved items, and any
        orders attached to your account. This cannot be undone.
      </p>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => {
          setConfirmText(e.target.value);
          if (error) setError(null);
        }}
        placeholder={`Type ${CONFIRM_STRING} to confirm`}
        aria-label={`Type ${CONFIRM_STRING} to confirm account deletion`}
        className="w-full max-w-md px-3 py-2 border border-border rounded-sm text-sm mb-3 bg-background focus:outline-none focus:border-red-400 transition-colors"
      />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy || confirmText !== CONFIRM_STRING}
        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? "Deleting…" : "Permanently delete my account"}
      </button>
    </section>
  );
}
