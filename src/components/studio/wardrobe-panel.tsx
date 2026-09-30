"use client";

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CATEGORY_LABELS, GARMENT_CATEGORIES, type Garment, type GarmentCategory } from "@/domain/garment";
import { garmentsInCategory, getGarment } from "@/domain/wardrobe";
import type { LookSelection } from "@/domain/look";
import { GarmentTile } from "./garment-tile";

const NEXT_KEYS = ["ArrowRight", "ArrowDown"];
const PREV_KEYS = ["ArrowLeft", "ArrowUp"];

export function WardrobePanel({
  selection,
  onSelect,
}: {
  selection: LookSelection;
  onSelect: (garment: Garment) => void;
}) {
  const categories = useMemo(() => GARMENT_CATEGORIES.filter((c) => garmentsInCategory(c).length > 0), []);
  const [active, setActive] = useState<GarmentCategory>(categories[0]);
  const tabRefs = useRef(new Map<GarmentCategory, HTMLButtonElement>());
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());
  const garments = useMemo(() => garmentsInCategory(active), [active]);

  function onTabKey(e: KeyboardEvent) {
    const i = categories.indexOf(active);
    let next: GarmentCategory | undefined;
    if (e.key === "ArrowRight") next = categories[(i + 1) % categories.length];
    else if (e.key === "ArrowLeft") next = categories[(i - 1 + categories.length) % categories.length];
    else if (e.key === "Home") next = categories[0];
    else if (e.key === "End") next = categories[categories.length - 1];
    if (!next) return;
    e.preventDefault();
    setActive(next);
    tabRefs.current.get(next)?.focus();
  }

  const onTileKey = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      const dir = NEXT_KEYS.includes(e.key) ? 1 : PREV_KEYS.includes(e.key) ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const i = garments.findIndex((g) => g.id === e.currentTarget.dataset.garmentId);
      const next = garments[(i + dir + garments.length) % garments.length];
      onSelect(next);
      tileRefs.current.get(next.id)?.focus();
    },
    [garments, onSelect],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Wardrobe" onKeyDown={onTabKey} className="no-scrollbar flex gap-1 overflow-x-auto px-3 lg:grid lg:grid-cols-4 lg:px-0">
        {categories.map((c) => {
          const isActive = c === active;
          return (
            <button
              key={c}
              ref={(el) => {
                if (el) tabRefs.current.set(c, el);
              }}
              role="tab"
              type="button"
              id={`tab-${c}`}
              aria-selected={isActive}
              aria-controls={`panel-${c}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(c)}
              className={`shrink-0 border-b-2 px-3 pb-2.5 pt-2 text-left transition-colors lg:px-1 ${
                isActive ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <span className="eyebrow block">{CATEGORY_LABELS[c].plural}</span>
              <span className="mt-1 hidden truncate text-[11px] text-muted lg:block">{getGarment(selection[c])?.name}</span>
            </button>
          );
        })}
      </div>
      <div className="h-px bg-line" />

      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        className="min-h-0 flex-1 lg:overflow-y-auto lg:py-4"
      >
        <div
          role="radiogroup"
          aria-label={CATEGORY_LABELS[active].plural}
          className="no-scrollbar flex snap-x gap-2 overflow-x-auto px-3 py-3 lg:grid lg:grid-cols-3 lg:gap-3 lg:overflow-visible lg:px-0 lg:py-0"
        >
          {garments.map((g) => (
            <GarmentTile
              key={g.id}
              ref={(el) => {
                if (el) tileRefs.current.set(g.id, el);
              }}
              garment={g}
              selected={selection[active] === g.id}
              focusable={selection[active] === g.id}
              onSelect={onSelect}
              onKeyDown={onTileKey}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
