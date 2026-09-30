"use client";

import { memo, type KeyboardEvent, type Ref } from "react";
import type { Garment } from "@/domain/garment";

export const GarmentTile = memo(function GarmentTile({
  garment,
  selected,
  focusable,
  onSelect,
  onKeyDown,
  ref,
}: {
  garment: Garment;
  selected: boolean;
  focusable: boolean;
  onSelect: (g: Garment) => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={focusable ? 0 : -1}
      onClick={() => onSelect(garment)}
      onKeyDown={onKeyDown}
      data-garment-id={garment.id}
      className={`group relative flex w-26 shrink-0 snap-start flex-col items-stretch rounded-[3px] p-1.5 text-left transition-[background-color,box-shadow] lg:w-auto ${
        selected ? "bg-paper shadow-[0_0_0_1px_var(--color-ink)]" : "hover:bg-paper/70"
      }`}
    >
      <span className="flex aspect-square items-center justify-center rounded-[2px] bg-stone/60">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG thumbnails */}
        <img src={garment.imageUrl} alt="" width={200} height={220} loading="lazy" decoding="async" className="h-[82%] w-[82%] object-contain" />
      </span>
      <span className="mt-2 flex items-start justify-between gap-1 px-0.5">
        <span className={`text-[12px] leading-tight ${selected ? "text-ink" : "text-muted group-hover:text-ink"}`}>{garment.name}</span>
        <span aria-hidden className={`mt-1 size-1.5 shrink-0 rounded-full bg-burgundy transition-opacity ${selected ? "opacity-100" : "opacity-0"}`} />
      </span>
    </button>
  );
});
