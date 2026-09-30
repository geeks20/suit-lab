import type { Metadata } from "next";
import { SiteHeader } from "@/components/ui/site-header";
import { CreateModelFlow } from "@/components/onboarding/create-model-flow";

export const metadata: Metadata = { title: "Create your model — Suit Lab" };

export default function CreatePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6 sm:px-8 sm:pt-12">
        <CreateModelFlow />
      </main>
    </>
  );
}
