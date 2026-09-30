"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { getGarment } from "@/domain/wardrobe";
import { GARMENT_CATEGORIES } from "@/domain/garment";
import type { SavedLook } from "@/lib/client/session-store";

const dateFmt = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

export function LookCard({
  look,
  onOpen,
  onRename,
  onDelete,
}: {
  look: SavedLook;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(look.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const garments = GARMENT_CATEGORIES.map((c) => getGarment(look.selection[c])?.name).filter(Boolean);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (draft.trim()) onRename(draft);
    else setDraft(look.name);
    setEditing(false);
  }

  return (
    <article className="group flex flex-col" data-testid="look-card">
      <button type="button" onClick={onOpen} className="block overflow-hidden rounded-[2px] bg-stone" aria-label={`Open ${look.name} in the studio`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated image */}
        <img
          src={look.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="aspect-[2/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
        />
      </button>
      <div className="mt-3 flex items-start justify-between gap-2">
        {editing ? (
          <form onSubmit={submit} className="flex-1">
            <label htmlFor={`name-${look.id}`} className="sr-only">
              Look name
            </label>
            <input
              id={`name-${look.id}`}
              autoFocus
              value={draft}
              maxLength={60}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submit}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDraft(look.name);
                  setEditing(false);
                }
              }}
              className="w-full border-b border-ink bg-transparent font-serif text-2xl outline-none"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-left font-serif text-2xl leading-tight hover:text-burgundy"
            aria-label={`Rename ${look.name}`}
          >
            {look.name}
          </button>
        )}
        <time dateTime={look.createdAt} className="mt-1.5 shrink-0 text-xs text-muted">
          {dateFmt.format(new Date(look.createdAt))}
        </time>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">{garments.join(" · ")}</p>
      <div className="mt-2 flex gap-1">
        <Button variant="ghost" className="-ml-3" onClick={onOpen}>
          Open
        </Button>
        {confirmDelete ? (
          <>
            <Button variant="ghost" className="text-burgundy" onClick={onDelete}>
              Confirm delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
      </div>
    </article>
  );
}
