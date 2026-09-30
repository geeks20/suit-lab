import type { Build } from "@/domain/profile";
import type { ResolvedLook } from "@/domain/look";
import { escapeXml, shade } from "./color";

/**
 * Flat editorial fashion illustration of a figure, either in a neutral base
 * outfit (the demo "original") or wearing a resolved look.
 *
 * This powers DEMO / MOCK mode only. Real try-on output comes from a provider.
 */

const W = 600;
const H = 900;
const SKIN = "#c9a083";
const HAIR = "#2a211c";

const BUILD_SCALE: Record<Build, number> = { slim: 0.93, average: 1, athletic: 1.05, broad: 1.11 };

export interface FigureOptions {
  look?: ResolvedLook | null;
  build?: Build;
  /** Small caption printed along the bottom edge (e.g. "MOCK TRY-ON"). */
  caption?: string;
  background?: string;
}

/** Draws the left half; the right half is mirrored. */
function mirrored(inner: string): string {
  return `<g>${inner}</g><g transform="translate(${W} 0) scale(-1 1)">${inner}</g>`;
}

function head(): string {
  return `
  <rect x="283" y="190" width="34" height="52" rx="10" fill="${shade(SKIN, -0.12)}"/>
  <ellipse cx="300" cy="148" rx="44" ry="56" fill="${SKIN}"/>
  <ellipse cx="256" cy="152" rx="7" ry="12" fill="${shade(SKIN, -0.08)}"/>
  <ellipse cx="344" cy="152" rx="7" ry="12" fill="${shade(SKIN, -0.08)}"/>
  <path d="M255 140 C252 96 278 82 302 84 C330 84 350 100 346 140 C340 118 326 108 300 110 C280 110 262 118 255 140 Z" fill="${HAIR}"/>
  <path d="M300 204 C284 204 272 196 266 186 C278 194 290 197 300 197 C310 197 322 194 334 186 C328 196 316 204 300 204 Z" fill="${shade(SKIN, -0.1)}" opacity="0.6"/>`;
}

function hands(): string {
  return mirrored(`<ellipse cx="186" cy="544" rx="15" ry="21" fill="${SKIN}"/>`);
}

function trousers(color: string): string {
  const leg = `<path d="M228 520 L300 520 L300 812 L242 812 L232 660 Z" fill="${color}"/>
    <path d="M266 560 L268 806" stroke="${shade(color, -0.25)}" stroke-width="1.5" opacity="0.6"/>`;
  return mirrored(leg) + `<rect x="226" y="516" width="148" height="18" fill="${shade(color, -0.08)}"/>`;
}

function shoes(kind: string | undefined, color: string): string {
  const sole = shade(color, -0.35);
  const shoe =
    kind === "loafer"
      ? `<path d="M236 810 L296 810 L298 832 L214 834 C212 822 222 812 236 810 Z" fill="${color}"/>
         <path d="M232 818 L284 818" stroke="${shade(color, 0.25)}" stroke-width="2" opacity="0.7"/>
         <rect x="212" y="832" width="88" height="5" fill="${sole}"/>`
      : kind === "sneaker"
        ? `<path d="M238 806 L296 806 L298 832 L212 834 C210 818 222 808 238 806 Z" fill="${color}"/>
           <rect x="211" y="830" width="89" height="8" rx="2" fill="${shade(color, -0.08)}"/>`
        : `<path d="M236 806 L296 806 L298 832 L212 834 C210 818 222 808 236 806 Z" fill="${color}"/>
           <path d="M222 822 C230 814 240 812 250 812" stroke="${shade(color, 0.3)}" stroke-width="1.6" fill="none" opacity="0.8"/>
           <path d="M262 810 L284 816 M262 816 L284 810" stroke="${shade(color, 0.3)}" stroke-width="1.2" opacity="0.8"/>
           <rect x="211" y="832" width="89" height="5" fill="${sole}"/>`;
  return mirrored(shoe);
}

function baseOutfit(): string {
  // Neutral "before" outfit: oat knit crew neck, dark trousers, white sneakers.
  const knit = "#cdbfa8";
  const torso = `
    <path d="M205 262 C230 248 262 240 284 238 C290 252 296 256 300 256 L300 530 L212 528 L216 430 L208 330 Z" fill="${knit}"/>
    <path d="M205 262 C186 270 182 300 180 330 L170 524 L203 526 L214 332 Z" fill="${shade(knit, -0.06)}"/>
    <rect x="168" y="512" width="36" height="14" rx="3" fill="${shade(knit, -0.12)}"/>`;
  return (
    trousers("#34322f") +
    shoes("sneaker", "#efece6") +
    hands() +
    mirrored(torso) +
    `<path d="M282 238 C288 254 296 258 300 258 C304 258 312 254 318 238" stroke="${shade(knit, -0.18)}" stroke-width="5" fill="none"/>`
  );
}

function suitedOutfit(look: ResolvedLook): string {
  const suit = look.suit.metadata.swatch;
  const shirt = look.shirt.metadata.swatch;
  const tie = look.tie.metadata.isEmpty ? null : look.tie.metadata.swatch;
  const shoe = look.shoes.metadata;
  const lapel = shade(suit, suit === "#161616" ? 0.08 : -0.1);
  const seam = shade(suit, -0.28);

  const sleeve = `
    <path d="M205 262 C186 270 182 300 180 330 L170 516 L205 518 L214 332 Z" fill="${shade(suit, -0.05)}"/>
    <rect x="171" y="514" width="32" height="10" rx="2" fill="${shirt}"/>`;

  const shirtFront = `<rect x="262" y="228" width="76" height="210" fill="${shirt}"/>`;

  const tieShape = tie
    ? `<path d="M291 244 L309 244 L306 264 L294 264 Z" fill="${shade(tie, -0.1)}"/>
       <path d="M294 264 L306 264 L316 404 L300 422 L284 404 Z" fill="${tie}"/>
       <path d="M300 268 L300 418" stroke="${shade(tie, 0.12)}" stroke-width="1" opacity="0.5"/>`
    : `<path d="M288 234 L300 262 L312 234 Z" fill="${SKIN}"/>`;

  const collar = `<path d="M280 228 L300 252 L276 262 L272 236 Z" fill="${shade(shirt, 0.04)}" stroke="${shade(shirt, -0.12)}" stroke-width="1"/>`;

  const panel = `
    <path d="M272 236 L205 262 L208 330 L215 430 L207 546 L302 552 L302 424 L300 420 Z" fill="${suit}"/>
    <path d="M272 236 L300 420 L276 330 L258 296 L246 288 L262 280 Z" fill="${lapel}"/>
    <path d="M272 236 L300 420" stroke="${seam}" stroke-width="1.2" opacity="0.7"/>
    <path d="M226 470 L262 468" stroke="${seam}" stroke-width="1.5" opacity="0.6"/>
    <path d="M230 346 L256 344" stroke="${seam}" stroke-width="1.2" opacity="0.55"/>
    <path d="M238 360 C242 420 244 470 236 540" stroke="${seam}" stroke-width="1" opacity="0.35" fill="none"/>`;

  return (
    trousers(suit) +
    shoes(shoe.silhouette, shoe.swatch) +
    hands() +
    shirtFront +
    tieShape +
    mirrored(collar) +
    mirrored(sleeve) +
    mirrored(panel) +
    `<circle cx="302" cy="446" r="4" fill="${seam}"/><circle cx="302" cy="492" r="4" fill="${seam}"/>`
  );
}

export function renderFigureSvg({ look, build = "average", caption, background = "#e8e2d8" }: FigureOptions = {}): string {
  const sx = BUILD_SCALE[build];
  const body = look ? suitedOutfit(look) : baseOutfit();
  const cap = caption
    ? `<text x="${W / 2}" y="${H - 26}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" letter-spacing="3" fill="#8a8378">${escapeXml(caption)}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <radialGradient id="light" cx="50%" cy="42%" r="50%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${background}"/>
  <rect width="${W}" height="${H}" fill="url(#light)"/>
  <ellipse cx="300" cy="840" rx="150" ry="14" fill="#000" opacity="0.10"/>
  <g transform="translate(${300 * (1 - sx)} 0) scale(${sx} 1)">${body}</g>
  ${head()}
  ${cap}
</svg>`;
}
