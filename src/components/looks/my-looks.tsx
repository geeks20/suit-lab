"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import type { LookDTO } from "@/lib/api-types";
import { appliedKey, sessionActions, useSession } from "@/lib/client/session-store";
import { LookCard } from "./look-card";

export function MyLooks() {
  const router = useRouter();
  const hydrated = useSession((s) => s.hydrated);
  const profile = useSession((s) => s.profile);
  const looks = useSession((s) => s.looks);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    void sessionActions.load();
  }, []);

  if (!hydrated) return <div aria-busy="true" className="flex-1" />;

  function open(look: LookDTO) {
    sessionActions.setLook(look.selection);
    if (profile?.id === look.profileId && look.generationId) {
      sessionActions.addResult({
        id: look.generationId,
        status: "completed",
        applied: look.selection,
        lookKey: appliedKey(look.selection),
        imageUrl: look.imageUrl,
        errorMessage: null,
        cacheHit: false,
        createdAt: look.createdAt,
      });
    }
    router.push("/studio");
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
      <h1 className="font-serif text-5xl sm:text-6xl">My Looks</h1>

      {looks.length === 0 ? (
        <div className="flex flex-col items-start gap-6 py-20">
          <p className="font-serif text-3xl text-muted">You haven&apos;t saved a look yet.</p>
          <ButtonLink href={profile ? "/studio" : "/create"} size="lg">
            Create a Look
          </ButtonLink>
        </div>
      ) : (
        <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
          {looks.map((look) => (
            <li key={look.id}>
              <LookCard
                look={look}
                onOpen={() => open(look)}
                onRename={(name) => void sessionActions.renameLook(look.id, name)}
                onDelete={() => void sessionActions.deleteLook(look.id).catch(() => {})}
              />
            </li>
          ))}
        </ul>
      )}

      {(profile || looks.length > 0) && (
        <section aria-label="Your data" className="mt-20 border-t border-line pt-6">
          <p className="max-w-xl text-xs leading-relaxed text-muted">
            Your photo, model and generated looks are stored privately on Suit Lab&apos;s servers. Deleting removes them from
            our database and storage.
          </p>
          <div className="mt-3 flex gap-1">
            {confirmReset ? (
              <>
                <Button
                  variant="ghost"
                  className="-ml-3 text-burgundy"
                  onClick={async () => {
                    setResetError(null);
                    try {
                      await sessionActions.resetAll();
                      setConfirmReset(false);
                    } catch {
                      setResetError("We couldn't delete your data just now. Please try again.");
                    }
                  }}
                >
                  Delete everything
                </Button>
                <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="ghost" className="-ml-3" onClick={() => setConfirmReset(true)}>
                Delete my photo, model and looks
              </Button>
            )}
          </div>
          {resetError && (
            <p role="alert" className="mt-2 text-sm text-burgundy">
              {resetError}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
