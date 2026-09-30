"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_DETAILS, type ProfileDetails } from "@/domain/profile";
import { sessionActions } from "@/lib/client/session-store";
import { api, ApiError, dataUrlToBlob } from "@/lib/client/api";
import { track } from "@/lib/analytics";
import { PhotoStep } from "./photo-step";
import { DetailsStep } from "./details-step";
import { Preparing } from "./preparing";

type Step = "photo" | "details" | "preparing";

const MIN_PREPARE_MS = 2400;

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
    try {
      // Upload runs alongside a minimum display time so the moment isn't rushed.
      const [{ profile }] = await Promise.all([
        dataUrlToBlob(photo).then((blob) => api.createProfile(blob, d)),
        new Promise((r) => setTimeout(r, MIN_PREPARE_MS)),
      ]);
      sessionActions.setProfile(profile);
      track("model_creation_completed", { build: d.build });
      router.push("/studio");
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "We couldn't create your model. Please try again.";
      setError(message);
      setStep(e instanceof ApiError && e.code.startsWith("upload_") ? "photo" : "details");
    }
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
