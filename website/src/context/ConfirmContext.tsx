"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<{ confirm: ConfirmFn } | null>(null);

// A single ConfirmDialog instance lives at the app root so any
// component can pop "are you sure?" without wiring its own pendingId
// state. `confirm()` returns a Promise<boolean> so callers can write
// `if (!(await confirm(...))) return;` and read top-to-bottom the way
// the native confirm() used to.
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOpts(next);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolverRef.current?.(true);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  const handleClose = useCallback(() => {
    resolverRef.current?.(false);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmDialog
        open={opts !== null}
        title={opts?.title ?? ""}
        body={opts?.body}
        confirmLabel={opts?.confirmLabel}
        cancelLabel={opts?.cancelLabel}
        destructive={opts?.destructive}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    </ConfirmContext.Provider>
  );
}

// Fallback to the native confirm so unit tests and any orphan render
// outside the provider don't explode. ToastContext follows the same
// pattern.
const fallback: ConfirmFn = async (opts) =>
  typeof window !== "undefined" &&
  window.confirm(opts.body ? `${opts.title}\n\n${opts.body}` : opts.title);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  return ctx ?? { confirm: fallback };
}
