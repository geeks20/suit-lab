"use client";

import { useSyncExternalStore } from "react";
import type { GarmentCategory } from "@/domain/garment";
import { DEFAULT_LOOK, sanitizeLook, type LookSelection } from "@/domain/look";
import type { Profile } from "@/domain/profile";

/**
 * V0 session store. Everything lives in this browser (localStorage) — there is
 * no server copy yet. Phase 2 moves profiles, looks and images server-side.
 */

export interface GeneratedResult {
  profileId: string;
  lookKey: string;
  selection: LookSelection;
  imageUrl: string;
  createdAt: string;
}

export interface SavedLook {
  id: string;
  profileId: string;
  name: string;
  selection: LookSelection;
  imageUrl: string;
  createdAt: string;
}

export interface SessionState {
  hydrated: boolean;
  profile: Profile | null;
  currentLook: LookSelection;
  /** Recent generations, newest first. Doubles as the duplicate-generation cache. */
  results: GeneratedResult[];
  /** lookKey of the result currently on the stage. */
  displayedKey: string | null;
  looks: SavedLook[];
}

const STORAGE_KEY = "suitlab.session.v1";
const MAX_RESULTS = 12;

const INITIAL: SessionState = {
  hydrated: false,
  profile: null,
  currentLook: DEFAULT_LOOK,
  results: [],
  displayedKey: null,
  looks: [],
};

let state: SessionState = INITIAL;
let loaded = false;
const listeners = new Set<() => void>();

function load(): SessionState {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return { ...INITIAL, hydrated: true };
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    return {
      hydrated: true,
      profile: parsed.profile ?? null,
      currentLook: sanitizeLook(parsed.currentLook),
      results: Array.isArray(parsed.results) ? parsed.results.slice(0, MAX_RESULTS) : [],
      displayedKey: parsed.displayedKey ?? null,
      looks: Array.isArray(parsed.looks) ? parsed.looks : [],
    };
  } catch {
    return { ...INITIAL, hydrated: true };
  }
}

function ensureLoaded() {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    state = load();
  }
}

/** Last write error, surfaced by the UI (e.g. storage full). */
export let lastPersistError: string | null = null;

function persist() {
  try {
    const { profile, currentLook, results, displayedKey, looks } = state;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile, currentLook, results, displayedKey, looks }));
    lastPersistError = null;
    return true;
  } catch {
    lastPersistError = "Your browser storage is full. Delete a saved look and try again.";
    return false;
  }
}

function setState(update: (s: SessionState) => SessionState): boolean {
  ensureLoaded();
  const next = update(state);
  if (next === state) return true;
  const prev = state;
  state = next;
  const ok = persist();
  if (!ok) state = prev;
  listeners.forEach((l) => l());
  return ok;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  ensureLoaded();
  return state;
}

const getServerSnapshot = () => INITIAL;

export function useSession<T>(selector: (s: SessionState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getSnapshot()),
    () => selector(getServerSnapshot()),
  );
}

export const sessionActions = {
  setProfile(profile: Profile) {
    return setState((s) => ({ ...s, profile, results: [], displayedKey: null }));
  },
  selectGarment(category: GarmentCategory, garmentId: string) {
    return setState((s) =>
      s.currentLook[category] === garmentId ? s : { ...s, currentLook: { ...s.currentLook, [category]: garmentId } },
    );
  },
  setLook(selection: LookSelection) {
    return setState((s) => ({ ...s, currentLook: sanitizeLook(selection) }));
  },
  addResult(result: GeneratedResult) {
    return setState((s) => ({
      ...s,
      results: [result, ...s.results.filter((r) => !(r.profileId === result.profileId && r.lookKey === result.lookKey))].slice(0, MAX_RESULTS),
      displayedKey: result.lookKey,
    }));
  },
  showResult(lookKey: string | null) {
    return setState((s) => (s.displayedKey === lookKey ? s : { ...s, displayedKey: lookKey }));
  },
  saveLook(look: Omit<SavedLook, "id" | "name" | "createdAt"> & { name?: string }): SavedLook | null {
    const saved: SavedLook = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      name: look.name ?? nextLookName(state.looks),
      profileId: look.profileId,
      selection: look.selection,
      imageUrl: look.imageUrl,
    };
    return setState((s) => ({ ...s, looks: [saved, ...s.looks] })) ? saved : null;
  },
  renameLook(id: string, name: string) {
    const clean = name.trim().slice(0, 60);
    if (!clean) return false;
    return setState((s) => ({ ...s, looks: s.looks.map((l) => (l.id === id ? { ...l, name: clean } : l)) }));
  },
  deleteLook(id: string) {
    return setState((s) => ({ ...s, looks: s.looks.filter((l) => l.id !== id) }));
  },
  /** Deletes the model, its photo and every generation/look. */
  resetAll() {
    return setState(() => ({ ...INITIAL, hydrated: true }));
  },
};

export function nextLookName(looks: SavedLook[]): string {
  const used = new Set(looks.map((l) => l.name));
  for (let n = looks.length + 1; ; n++) {
    const name = `Look ${String(n).padStart(2, "0")}`;
    if (!used.has(name)) return name;
  }
}

/** Test-only: reset module state. */
export function __resetSessionForTests() {
  state = INITIAL;
  loaded = false;
}
