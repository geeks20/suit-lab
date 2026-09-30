"use client";

import { useSyncExternalStore } from "react";
import { GARMENT_CATEGORIES, type GarmentCategory } from "@/domain/garment";
import { DEFAULT_LOOK, sanitizeLook, type LookSelection } from "@/domain/look";
import type { AppliedSelection, CapabilitiesDTO, GenerationDTO, LookDTO, ProfileDTO } from "@/lib/api-types";
import { api, ApiError } from "./api";

/**
 * Client view of the session. The server is the source of truth for the profile,
 * generations and looks; only the in-progress outfit and the on-stage result key
 * are kept in localStorage (no images, no personal data).
 */
export interface SessionState {
  hydrated: boolean;
  loadError: string | null;
  profile: ProfileDTO | null;
  capabilities: CapabilitiesDTO | null;
  currentLook: LookSelection;
  /** Completed results, newest first. */
  results: GenerationDTO[];
  /** lookKey of the result currently on the stage. */
  displayedKey: string | null;
  looks: LookDTO[];
}

const STORAGE_KEY = "suitlab.studio.v2";

const INITIAL: SessionState = {
  hydrated: false,
  loadError: null,
  profile: null,
  capabilities: null,
  currentLook: DEFAULT_LOOK,
  results: [],
  displayedKey: null,
  looks: [],
};

let state: SessionState = INITIAL;
let localLoaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function readLocal(): Pick<SessionState, "currentLook" | "displayedKey"> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { currentLook: sanitizeLook(parsed.currentLook), displayedKey: typeof parsed.displayedKey === "string" ? parsed.displayedKey : null };
  } catch {
    return { currentLook: DEFAULT_LOOK, displayedKey: null };
  }
}

function writeLocal() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentLook: state.currentLook, displayedKey: state.displayedKey }));
  } catch {}
}

function ensureLocal() {
  if (!localLoaded && typeof window !== "undefined") {
    localLoaded = true;
    state = { ...state, ...readLocal() };
  }
}

function set(update: (s: SessionState) => SessionState) {
  ensureLocal();
  const next = update(state);
  if (next === state) return;
  state = next;
  writeLocal();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  ensureLocal();
  return state;
}

export function useSession<T>(selector: (s: SessionState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(INITIAL));
}

export function getSessionState() {
  return getSnapshot();
}

/** Key of the garments a provider would apply from a selection (all categories when unknown). */
export function appliedKey(selection: LookSelection | AppliedSelection, categories?: GarmentCategory[]): string {
  return GARMENT_CATEGORIES.filter((c) => (!categories || categories.includes(c)) && selection[c])
    .map((c) => selection[c])
    .join("|");
}

export const sessionActions = {
  /** Loads (or refreshes) server state. Signed image URLs are re-issued on every load. */
  load(): Promise<void> {
    loading ??= api
      .session()
      .then((s) =>
        set((st) => ({
          ...st,
          hydrated: true,
          loadError: null,
          profile: s.profile,
          capabilities: s.capabilities,
          results: s.generations,
          looks: s.looks,
          displayedKey: s.generations.some((g) => g.lookKey === st.displayedKey) ? st.displayedKey : null,
        })),
      )
      .catch((e) => set((st) => ({ ...st, hydrated: true, loadError: e instanceof ApiError ? e.message : "Couldn't load your studio." })))
      .finally(() => {
        loading = null;
      });
    return loading;
  },
  setProfile(profile: ProfileDTO) {
    set((s) => ({ ...s, hydrated: true, profile, results: [], displayedKey: null }));
  },
  selectGarment(category: GarmentCategory, garmentId: string) {
    set((s) => (s.currentLook[category] === garmentId ? s : { ...s, currentLook: { ...s.currentLook, [category]: garmentId } }));
  },
  setLook(selection: Partial<LookSelection>) {
    set((s) => ({ ...s, currentLook: sanitizeLook({ ...s.currentLook, ...selection }) }));
  },
  addResult(result: GenerationDTO) {
    set((s) => ({ ...s, results: [result, ...s.results.filter((r) => r.lookKey !== result.lookKey)], displayedKey: result.lookKey }));
  },
  showResult(lookKey: string | null) {
    set((s) => (s.displayedKey === lookKey ? s : { ...s, displayedKey: lookKey }));
  },
  async saveLook(generationId: string) {
    const res = await api.saveLook(generationId);
    set((s) => ({ ...s, looks: [res.look, ...s.looks.filter((l) => l.id !== res.look.id)] }));
    return res;
  },
  async renameLook(id: string, name: string) {
    const clean = name.trim().slice(0, 60);
    if (!clean) return false;
    const prev = state.looks;
    set((s) => ({ ...s, looks: s.looks.map((l) => (l.id === id ? { ...l, name: clean } : l)) }));
    try {
      await api.renameLook(id, clean);
      return true;
    } catch {
      set((s) => ({ ...s, looks: prev }));
      return false;
    }
  },
  async deleteLook(id: string) {
    await api.deleteLook(id);
    set((s) => ({ ...s, looks: s.looks.filter((l) => l.id !== id) }));
  },
  /** Deletes the model, photo, generations and looks on the server and in this browser. */
  async resetAll() {
    await api.deleteMe();
    set(() => ({ ...INITIAL, hydrated: true, capabilities: state.capabilities }));
  },
};

/** Test-only: reset module state. */
export function __resetSessionForTests() {
  state = INITIAL;
  localLoaded = false;
  loading = null;
}
