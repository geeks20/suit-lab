"use client";

import { useId, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { checkPhotoFile, preparePhoto, PHOTO_ERROR } from "@/lib/client/image";

export function PhotoStep({
  photo,
  onPhoto,
  onContinue,
}: {
  photo: string | null;
  onPhoto: (dataUrl: string | null) => void;
  onContinue: () => void;
}) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function accept(file: File | undefined) {
    if (!file) return;
    setError(null);
    const check = checkPhotoFile(file);
    if (!check.ok) return setError(check.message);
    setBusy(true);
    try {
      onPhoto(await preparePhoto(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : PHOTO_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void accept(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-4xl sm:text-5xl">Upload your photo</h2>
        <p className="mt-3 text-sm text-muted">For best results, use a clear photo with your face visible.</p>
      </div>

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-testid="photo-dropzone"
        className={`group relative flex aspect-[4/5] w-full max-w-[18rem] sm:max-w-sm cursor-pointer items-center justify-center overflow-hidden rounded-[2px] border transition-colors focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-burgundy ${
          dragging ? "border-ink bg-stone" : photo ? "border-transparent bg-stone" : "border-dashed border-stone-2 bg-paper hover:border-ink/40"
        }`}
      >
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            void accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
            <img src={photo} alt="Your uploaded photo" className="h-full w-full object-cover" />
            <span className="eyebrow absolute bottom-3 right-3 rounded-[2px] bg-ivory/90 px-3 py-2 text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              Replace photo
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-3 px-8 text-center">
            <span aria-hidden className="font-serif text-5xl text-stone-2">
              +
            </span>
            <span className="text-sm text-ink">{busy ? (
                "Checking your photo…"
              ) : (
                <>
                  <span className="sm:hidden">Tap to choose a photo</span>
                  <span className="hidden sm:inline">Drop a photo here or choose a file</span>
                </>
              )}</span>
            <span className="text-xs text-muted">JPG, PNG or WebP · up to 15 MB</span>
          </span>
        )}
      </label>

      <p role="alert" className="min-h-5 text-sm text-burgundy">
        {error}
      </p>

      <div className="flex items-center gap-3">
        <Button size="lg" disabled={!photo || busy} onClick={onContinue}>
          Continue
        </Button>
        <p className="text-xs text-muted">Your photo is stored privately. You can delete it any time from My Looks.</p>
      </div>
    </div>
  );
}
