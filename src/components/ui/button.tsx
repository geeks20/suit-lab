import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[3px] font-medium uppercase tracking-[0.16em] transition-[background-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0 select-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-ink text-ivory shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.2)] hover:bg-charcoal disabled:bg-ink/10 disabled:text-ink/45 disabled:shadow-none",
  secondary: "bg-transparent text-ink ring-1 ring-inset ring-ink/25 hover:ring-ink/60 hover:bg-paper disabled:text-ink/35 disabled:ring-ink/10 disabled:hover:bg-transparent",
  ghost: "bg-transparent text-ink hover:bg-ink/5 disabled:text-ink/35",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-[11px]",
  lg: "h-13 px-7 text-xs",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
