"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { sessionActions } from "@/lib/client/session-store";
import { DEMO_PROFILE } from "@/lib/demo";

export function DemoModelButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="lg"
      className={className}
      onClick={() => {
        sessionActions.setProfile({ ...DEMO_PROFILE, createdAt: new Date().toISOString() });
        router.push("/studio");
      }}
    >
      Try the demo model
    </Button>
  );
}
