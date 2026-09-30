"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { lookKey } from "@/domain/look";
import { sessionActions, useSession, type SavedLook } from "@/lib/client/session-store";
import { LookCard } from "./look-card";

export function MyLooks() {
  const router = useRouter();
  const hydrated = useSession((s) => s.hydrated);
  const profile = useSession((s) => s.profile);
  const looks = useSession((s) => s.looks);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!hydrated) return <div aria-busy="true" className="flex-1" />;

  function open(look: SavedLook) {
    sessionActions.setLook(look.selection);
    if (profile?.id === look.profileId) {
      sessionActions.addResult({
        profileId: look.profileId,
        lookKey: lookKey(look.selection),
        selection: look.selection,
        imageUrl: look.imageUrl,
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
                onRename={(name) => sessionActions.renameLook(look.id, name)}
                onDelete={() => sessionActions.deleteLook(look.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {(profile || looks.length > 0) && (
        <section aria-label="Your data" className="mt-20 border-t border-line pt-6">
          <p className="max-w-xl text-xs leading-relaxed text-muted">
            Your photo, model and looks are stored only in this browser in this version of Suit Lab.
          </p>
          <div className="mt-3 flex gap-1">
            {confirmReset ? (
              <>
                <Button
                  variant="ghost"
                  className="-ml-3 text-burgundy"
                  onClick={() => {
                    sessionActions.resetAll();
                    setConfirmReset(false);
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
        </section>
      )}
    </main>
  );
}
