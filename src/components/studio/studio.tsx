"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ButtonLink, Button } from "@/components/ui/button";
import { Toast, useToast } from "@/components/ui/toast";
import { CATEGORY_LABELS, GARMENT_CATEGORIES, type Garment } from "@/domain/garment";
import { getGarment } from "@/domain/wardrobe";
import type { AppliedSelection } from "@/lib/api-types";
import { track } from "@/lib/analytics";
import { useGeneration } from "@/lib/client/generation";
import { appliedKey, sessionActions, useSession } from "@/lib/client/session-store";
import { Stage, type StageView } from "./stage";
import { WardrobePanel } from "./wardrobe-panel";

/** Describes only the garments that were actually applied. */
export function describeLook(selection: AppliedSelection): string {
  return GARMENT_CATEGORIES.flatMap((c) => {
    const g = selection[c] ? getGarment(selection[c]!) : undefined;
    if (!g) return [];
    return [g.metadata.isEmpty ? g.name.toLowerCase() : `${g.name} ${CATEGORY_LABELS[c].singular.toLowerCase()}`];
  }).join(", ");
}

export function Studio() {
  const hydrated = useSession((s) => s.hydrated);
  const loadError = useSession((s) => s.loadError);
  const profile = useSession((s) => s.profile);
  const caps = useSession((s) => s.capabilities);
  const currentLook = useSession((s) => s.currentLook);
  const results = useSession((s) => s.results);
  const displayedKey = useSession((s) => s.displayedKey);

  useEffect(() => {
    void sessionActions.load();
  }, []);

  const gen = useGeneration(profile);
  const { toast, show } = useToast();
  const [saving, setSaving] = useState(false);
  // Before/after choice applies to the result it was made on; a new result always shows the look.
  const [viewChoice, setViewChoice] = useState<{ key: string | null; view: StageView }>({ key: null, view: "look" });
  const view: StageView = viewChoice.key === displayedKey ? viewChoice.view : "look";

  const displayed = useMemo(() => results.find((r) => r.lookKey === displayedKey) ?? null, [results, displayedKey]);
  // Compare only the categories the provider applies: changing an unapplied item can't change the image.
  const currentKey = appliedKey(currentLook, caps?.categories);
  const outfitChanged = !!displayed && displayed.lookKey !== currentKey;

  const onSelect = useCallback((g: Garment) => {
    sessionActions.selectGarment(g.category, g.id);
    track("garment_selected", { category: g.category, garment_id: g.id });
  }, []);

  if (!hydrated) return <div className="flex-1 bg-stone lg:m-4" aria-busy="true" />;

  if (!profile) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="font-serif text-4xl">{loadError ?? "Create your model before entering the studio."}</p>
        <ButtonLink href="/create" size="lg">
          Create My Model
        </ButtonLink>
      </div>
    );
  }

  const generating = gen.phase === "generating";
  const real = !!caps?.realTryOn;
  const blockedReason = !caps
    ? null
    : caps.provider === "unavailable"
      ? "Try-on is unavailable right now"
      : real && profile.isDemo
        ? "Needs your own photo"
        : caps.categories.some((c) => !caps.readyGarmentIds.includes(currentLook[c]))
          ? "Not available for this garment"
          : null;

  async function save() {
    if (!displayed || saving) return;
    setSaving(true);
    try {
      const { look, alreadySaved } = await sessionActions.saveLook(displayed.id);
      if (alreadySaved) return show({ text: "Already in My Looks", href: "/looks", linkLabel: "View" });
      track("look_saved", { look_key: displayed.lookKey });
      show({ text: `Saved as ${look.name}`, href: "/looks", linkLabel: "My Looks" });
    } catch {
      show({ text: "Couldn't save this look. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const upToDate = !!displayed && !outfitChanged;
  const appliedNames = caps?.categories.map((c) => CATEGORY_LABELS[c].singular.toLowerCase()).join(", ");

  return (
    <main className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,30%)]">
      <Stage
        originalUrl={profile.sourceImageUrl}
        lookUrl={displayed?.imageUrl ?? null}
        lookAlt={displayed ? `You wearing a ${describeLook(displayed.applied)}` : ""}
        view={view}
        onViewChange={(v) => setViewChoice({ key: displayedKey, view: v })}
        generating={generating}
        error={gen.phase === "error" ? gen.message : undefined}
        onRetry={() => gen.generate(currentLook)}
        onDismissError={gen.dismissError}
        outfitChanged={outfitChanged}
        badge={real ? undefined : profile.isDemo ? "Demo model · mock" : "Mock preview"}
      />

      <aside aria-label="Wardrobe" className="flex shrink-0 flex-col border-t border-line bg-ivory lg:min-h-0 lg:border-0 lg:px-6 lg:pt-4">
        <div className="min-h-0 lg:flex-1">
          <WardrobePanel selection={currentLook} onSelect={onSelect} />
        </div>

        {real && (
          <p data-testid="tryon-scope" className="px-3 pb-1 text-[11px] leading-snug text-muted lg:px-0 lg:pb-3">
            Real try-on applies the {appliedNames} only. Other selections aren&apos;t rendered yet.
          </p>
        )}

        <div className="flex gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 lg:flex-col lg:border-t lg:border-line lg:px-0 lg:py-5">
          <Button
            size="lg"
            className="flex-1 lg:w-full lg:flex-none"
            onClick={() => gen.generate(currentLook)}
            disabled={upToDate || (!!blockedReason && !generating)}
            aria-disabled={generating || undefined}
            aria-busy={generating}
            data-testid="generate-look"
          >
            {generating ? <span className="animate-breathe">Creating…</span> : upToDate ? "Up to date" : (blockedReason ?? "Generate Look")}
          </Button>
          <Button size="lg" variant="secondary" className="lg:w-full" onClick={save} disabled={!displayed || generating || saving}>
            Save Look
          </Button>
        </div>
      </aside>
      <Toast toast={toast} />
    </main>
  );
}
