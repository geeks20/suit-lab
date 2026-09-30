import Link from "next/link";

export function Wordmark() {
  return (
    <span className="font-sans text-[13px] font-semibold tracking-[0.42em] text-ink">
      SUIT<span className="text-burgundy">·</span>LAB
    </span>
  );
}

export function SiteHeader({ current }: { current?: "studio" | "looks" }) {
  const link = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`eyebrow py-2 transition-colors ${active ? "text-ink" : "text-muted hover:text-ink"}`}
    >
      {label}
    </Link>
  );
  return (
    <header className="flex h-14 shrink-0 items-center justify-between px-4 sm:px-8">
      <Link href="/" aria-label="Suit Lab home" className="py-2">
        <Wordmark />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-6">
        {link("/studio", "Studio", current === "studio")}
        {link("/looks", "My Looks", current === "looks")}
      </nav>
    </header>
  );
}
