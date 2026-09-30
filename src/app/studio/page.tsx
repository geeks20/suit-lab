import type { Metadata } from "next";
import { SiteHeader } from "@/components/ui/site-header";
import { Studio } from "@/components/studio/studio";

export const metadata: Metadata = { title: "Studio — Suit Lab" };

export default function StudioPage() {
  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <SiteHeader current="studio" />
      <Studio />
    </div>
  );
}
