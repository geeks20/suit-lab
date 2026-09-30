"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export interface ToastMessage {
  id: number;
  text: string;
  href?: string;
  linkLabel?: string;
}

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);
  const show = useCallback((m: Omit<ToastMessage, "id">) => setToast({ ...m, id: Date.now() }), []);
  return { toast, show };
}

export function Toast({ toast }: { toast: ToastMessage | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      {toast && (
        <div
          key={toast.id}
          className="pointer-events-auto flex animate-fade-in items-center gap-4 rounded-[3px] bg-ink px-5 py-3 text-sm text-ivory shadow-lg"
        >
          <span>{toast.text}</span>
          {toast.href && (
            <Link href={toast.href} className="eyebrow text-ivory/70 underline-offset-4 hover:text-ivory hover:underline">
              {toast.linkLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
