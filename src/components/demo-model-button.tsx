"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import { sessionActions } from "@/lib/client/session-store";

export function DemoModelButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="lg"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { profile } = await api.createDemoProfile();
          sessionActions.setProfile(profile);
          router.push("/studio");
        } catch {
          setBusy(false);
        }
      }}
    >
      Try the demo model
    </Button>
  );
}
