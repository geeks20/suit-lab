"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { BUILDS, BUILD_LABELS, profileDetailsSchema, type ProfileDetails } from "@/domain/profile";

export function DetailsStep({
  initial,
  onBack,
  onSubmit,
}: {
  initial: ProfileDetails;
  onBack: () => void;
  onSubmit: (details: ProfileDetails) => void;
}) {
  const [height, setHeight] = useState(String(initial.heightCm));
  const [weight, setWeight] = useState(String(initial.weightKg));
  const [build, setBuild] = useState(initial.build);
  const [errors, setErrors] = useState<Partial<Record<"heightCm" | "weightKg", string>>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = profileDetailsSchema.safeParse({ heightCm: Number(height), weightKg: Number(weight), build });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as "heightCm" | "weightKg"] ??= issue.message;
      return setErrors(next);
    }
    setErrors({});
    onSubmit(parsed.data);
  }

  const field = (id: "heightCm" | "weightKg", label: string, unit: string, value: string, set: (v: string) => void) => (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="eyebrow text-muted">
        {label}
      </label>
      <div className="flex items-baseline gap-2 border-b border-line focus-within:border-ink">
        <input
          id={id}
          name={id}
          inputMode="numeric"
          type="number"
          value={value}
          onChange={(e) => set(e.target.value)}
          aria-invalid={!!errors[id]}
          aria-describedby={errors[id] ? `${id}-error` : undefined}
          className="w-full bg-transparent py-2 font-serif text-4xl outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-sm text-muted">{unit}</span>
      </div>
      <p id={`${id}-error`} className="min-h-4 text-xs text-burgundy">
        {errors[id]}
      </p>
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <div>
        <h2 className="font-serif text-4xl sm:text-5xl">A little about you</h2>
        <p className="mt-3 max-w-md text-sm text-muted">
          This only shapes the preview. Suit Lab doesn&apos;t predict your size or how a garment will fit.
        </p>
      </div>

      <div className="grid max-w-md grid-cols-2 gap-8">
        {field("heightCm", "Height", "cm", height, setHeight)}
        {field("weightKg", "Weight", "kg", weight, setWeight)}
      </div>

      <fieldset className="max-w-md">
        <legend className="eyebrow mb-3 text-muted">Build</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BUILDS.map((b) => (
            <label
              key={b}
              className={`flex h-12 cursor-pointer items-center justify-center rounded-[3px] text-sm ring-1 ring-inset transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-burgundy ${
                build === b ? "bg-ink text-ivory ring-ink" : "ring-line hover:ring-ink/40"
              }`}
            >
              <input type="radio" name="build" value={b} checked={build === b} onChange={() => setBuild(b)} className="sr-only" />
              {BUILD_LABELS[b]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button size="lg" type="submit">
          Create My Model
        </Button>
        <Button variant="ghost" size="lg" onClick={onBack}>
          Back
        </Button>
      </div>
    </form>
  );
}
