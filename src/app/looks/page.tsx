import type { Metadata } from "next";
import { SiteHeader } from "@/components/ui/site-header";
import { MyLooks } from "@/components/looks/my-looks";

export const metadata: Metadata = { title: "My Looks — Suit Lab" };

export default function LooksPage() {
  return (
    <>
      <SiteHeader current="looks" />
      <MyLooks />
    </>
  );
}
