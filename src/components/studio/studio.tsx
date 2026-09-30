"use client";

import { useCallback, useMemo, useState } from "react";
import { ButtonLink, Button } from "@/components/ui/button";
import { Toast, useToast } from "@/components/ui/toast";
import { CATEGORY_LABELS, GARMENT_CATEGORIES, type Garment } from "@/domain/garment";
import { lookKey, resolveLook, type LookSelection } from "@/domain/look";
import { track } from "@/lib/analytics";
import { useGeneration } from "@/lib/client/generation";
import { sessionActions, useSession, lastPersistError } from "@/lib/client/session-store";
import { Stage, type StageView } from "./stage";
import { WardrobePanel } from "./wardrobe-panel";

export function describeLook(selection: LookSelection): string {
  const r = resolveLook(selection);
  return GARMENT_CATEGORIES.map((c) =>
    r[c].metadata.isEmpty ? r[c].name.toLowerCase() : `${r[c].name} ${CATEGORY_LABELS[c].singular.toLowerCase()}`,
  ).join(", ");
}

export function Studio() {
  const hydrated = useSession((s) => s.hydrated);
  const profile = useSession((s) => s.profile);
  const currentLook = useSession((s) => s.currentLook);
  const results = useSession((s) => s.results);
  const displayedKey = useSession((s) => s.displayedKey);
  const looks = useSession((s) => s.looks);

  const gen = useGeneration(profile, results);
  const { toast, show } = useToast();
  // Before/after choice applies to the result it was made on; a new result always shows the look.
  const [viewChoice, setViewChoice] = useState<{ key: string | null; view: StageView }>({ key: null, view: "look" });
  const view: StageView = viewChoice.key === displayedKey ? viewChoice.view : "look";

  const displayed = useMemo(
    () => (profile ? results.find((r) => r.profileId === profile.id && r.lookKey === displayedKey) ?? null : null),
    [results, profile, displayedKey],
  );
  const currentKey = lookKey(currentLook);
  const outfitChanged = !!displayed && displayed.lookKey !== currentKey;

  const onSelect = useCallback((g: Garment) => {
    sessionActions.selectGarment(g.category, g.id);
    track("garment_selected", { category: g.category, garment_id: g.id });
  }, []);

  if (!hydrated) return <div className="flex-1 bg-stone lg:m-4" aria-busy="true" />;

  if (!profile) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="font-serif text-4xl">Create your model before entering the studio.</p>
        <ButtonLink href="/create" size="lg">
          Create My Model
        </ButtonLink>
      </div>
    );
  }

  const generating = gen.phase === "generating";
  const alreadySaved = !!displayed && looks.some((l) => l.profileId === profile.id && l.imageUrl === displayed.imageUrl);

  function save() {
    if (!displayed || !profile) return;
    if (alreadySaved) return show({ text: "Already in My Looks", href: "/looks", linkLabel: "View" });
    const saved = sessionActions.saveLook({ profileId: profile.id, selection: displayed.selection, imageUrl: displayed.imageUrl });
    if (!saved) return show({ text: lastPersistError ?? "Couldn't save this look." });
    track("look_saved", { look_key: displayed.lookKey });
    show({ text: `Saved as ${saved.name}`, href: "/looks", linkLabel: "My Looks" });
  }

  const upToDate = !!displayed && !outfitChanged;

  return (
    <main className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,30%)]">
      <Stage
        originalUrl={profile.sourceImageUrl}
        lookUrl={displayed?.imageUrl ?? null}
        lookAlt={displayed ? `You wearing a ${describeLook(displayed.selection)}` : ""}
        view={view}
        onViewChange={(v) => setViewChoice({ key: displayedKey, view: v })}
        generating={generating}
        error={gen.phase === "error" ? gen.message : undefined}
        onRetry={() => gen.generate(currentLook)}
        onDismissError={gen.dismissError}
        outfitChanged={outfitChanged}
        badge={profile.isDemo ? "Demo model · mock" : "Mock preview"}
      />

      <aside aria-label="Wardrobe" className="flex shrink-0 flex-col border-t border-line bg-ivory lg:min-h-0 lg:border-0 lg:px-6 lg:pt-4">
        <div className="min-h-0 lg:flex-1">
          <WardrobePanel selection={currentLook} onSelect={onSelect} />
        </div>

        <div className="flex gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 lg:flex-col lg:border-t lg:border-line lg:px-0 lg:py-5">
          <Button
            size="lg"
            className="flex-1 lg:w-full lg:flex-none"
            onClick={() => gen.generate(currentLook)}
            disabled={upToDate}
            aria-disabled={generating || undefined}
            aria-busy={generating}
            data-testid="generate-look"
          >
            {generating ? <span className="animate-breathe">Creating…</span> : upToDate ? "Up to date" : "Generate Look"}
          </Button>
          <Button size="lg" variant="secondary" className="lg:w-full" onClick={save} disabled={!displayed || generating}>
            Save Look
          </Button>
        </div>
      </aside>
      <Toast toast={toast} />
    </main>
  );
}
