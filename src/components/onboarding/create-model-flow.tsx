"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_DETAILS, type ProfileDetails } from "@/domain/profile";
import { sessionActions } from "@/lib/client/session-store";
import { track } from "@/lib/analytics";
import { PhotoStep } from "./photo-step";
import { DetailsStep } from "./details-step";
import { Preparing } from "./preparing";

type Step = "photo" | "details" | "preparing";

const PREPARE_MS = 3600;

export function CreateModelFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("photo");
  const [photo, setPhoto] = useState<string | null>(null);
  const [details, setDetails] = useState<ProfileDetails>(DEFAULT_DETAILS);
  const [error, setError] = useState<string | null>(null);

  async function create(d: ProfileDetails) {
    if (!photo) return setStep("photo");
    setDetails(d);
    setError(null);
    setStep("preparing");
    track("model_creation_started", { build: d.build });
    // Phase 1: no model-preparation service yet; the photo is used as-is.
    await new Promise((r) => setTimeout(r, PREPARE_MS));
    const ok = sessionActions.setProfile({
      id: crypto.randomUUID(),
      ...d,
      sourceImageUrl: photo,
      modelImageUrl: photo,
      isDemo: false,
      createdAt: new Date().toISOString(),
    });
    if (!ok) {
      setError("We couldn't save your model in this browser. Try a smaller photo.");
      return setStep("details");
    }
    track("model_creation_completed", { build: d.build });
    router.push("/studio");
  }

  return (
    <div>
      {step !== "preparing" && (
        <ol aria-label="Progress" className="mb-10 flex gap-6">
          {(["photo", "details"] as const).map((s, i) => (
            <li
              key={s}
              aria-current={step === s ? "step" : undefined}
              className={`eyebrow border-t pt-3 ${step === s ? "border-ink text-ink" : "border-line text-muted"}`}
            >
              0{i + 1} · {s === "photo" ? "Photo" : "Details"}
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p role="alert" className="mb-6 text-sm text-burgundy">
          {error}
        </p>
      )}
      {step === "photo" && <PhotoStep photo={photo} onPhoto={setPhoto} onContinue={() => setStep("details")} />}
      {step === "details" && <DetailsStep initial={details} onBack={() => setStep("photo")} onSubmit={create} />}
      {step === "preparing" && photo && <Preparing photo={photo} />}
    </div>
  );
}
