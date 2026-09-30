"use client";

import { Button } from "@/components/ui/button";

export type StageView = "original" | "look";

export function Stage({
  originalUrl,
  lookUrl,
  lookAlt,
  view,
  onViewChange,
  generating,
  error,
  onRetry,
  onDismissError,
  outfitChanged,
  badge,
}: {
  originalUrl: string;
  lookUrl: string | null;
  lookAlt: string;
  view: StageView;
  onViewChange: (v: StageView) => void;
  generating: boolean;
  error?: string;
  onRetry: () => void;
  onDismissError: () => void;
  outfitChanged: boolean;
  badge?: string;
}) {
  const showingLook = view === "look" && !!lookUrl;
  const src = showingLook ? lookUrl! : originalUrl;

  return (
    <section aria-label="Your model" className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-stone lg:m-4 lg:mr-0 lg:rounded-[2px]">
      {/* eslint-disable-next-line @next/next/no-img-element -- user photo / generated data URL */}
      <img
        key={src}
        src={src}
        alt={showingLook ? lookAlt : "Your original photo"}
        data-testid="stage-image"
        data-view={showingLook ? "look" : "original"}
        className={`h-full w-full animate-fade-in object-contain transition-[opacity,filter] duration-500 ${generating ? "opacity-50 blur-[1.5px]" : ""}`}
      />

      {lookUrl && (
        <div role="group" aria-label="Compare" className="absolute left-3 top-3 flex rounded-[3px] bg-ivory/85 p-0.5 backdrop-blur-sm sm:left-4 sm:top-4">
          {(["original", "look"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => onViewChange(v)}
              className={`eyebrow rounded-[2px] px-3 py-2 transition-colors ${view === v ? "bg-ink text-ivory" : "text-muted hover:text-ink"}`}
            >
              {v === "original" ? "Original" : "Look"}
            </button>
          ))}
        </div>
      )}

      {badge && (
        <span className="eyebrow absolute right-3 top-3 rounded-[2px] bg-ivory/85 px-2.5 py-2 text-[10px] text-muted backdrop-blur-sm sm:right-4 sm:top-4">
          {badge}
        </span>
      )}

      <div aria-live="polite" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {generating && (
          <div className="animate-fade-in rounded-[3px] bg-ivory/90 px-7 py-5 text-center shadow-sm backdrop-blur">
            <p className="font-serif text-2xl">Creating your look…</p>
            <p className="mt-1 text-xs text-muted">This can take a few seconds.</p>
            <div className="relative mx-auto mt-4 h-px w-32 overflow-hidden bg-line">
              <div className="absolute inset-y-0 left-0 w-1/2 animate-sweep bg-ink" />
            </div>
          </div>
        )}
      </div>

      {error && !generating && (
        <div role="alert" className="absolute inset-x-3 bottom-3 flex animate-fade-in flex-wrap items-center justify-between gap-3 rounded-[3px] bg-ivory px-4 py-3 shadow-md sm:inset-x-auto sm:bottom-5 sm:left-1/2 sm:-translate-x-1/2">
          <p className="text-sm">{error}</p>
          <div className="flex gap-1">
            <Button size="md" onClick={onRetry}>
              Try Again
            </Button>
            <Button size="md" variant="ghost" onClick={onDismissError} aria-label="Dismiss">
              ✕
            </Button>
          </div>
        </div>
      )}

      {outfitChanged && !generating && !error && (
        <p className="eyebrow pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 animate-fade-in whitespace-nowrap rounded-[2px] bg-ivory/85 px-3 py-2 text-[10px] text-muted backdrop-blur-sm sm:bottom-5">
          Outfit changed · Generate to see it
        </p>
      )}
    </section>
  );
}
