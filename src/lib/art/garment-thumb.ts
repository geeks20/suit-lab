import type { Garment } from "@/domain/garment";
import { shade } from "./color";

/** Simple flat-lay style thumbnails for the seed wardrobe. */
export function renderGarmentThumbSvg(g: Garment): string {
  const c = g.metadata.swatch;
  let body: string;
  switch (g.category) {
    case "suit": {
      const seam = shade(c, -0.3);
      const lapel = shade(c, c === "#161616" ? 0.1 : -0.1);
      const half = `
        <path d="M86 40 L44 56 C34 62 32 80 30 96 L24 176 L44 178 L50 100 L54 190 L100 194 L100 118 Z" fill="${c}"/>
        <path d="M86 40 L100 118 L90 80 L80 68 L74 64 L82 60 Z" fill="${lapel}"/>
        <path d="M60 150 L80 149" stroke="${seam}" stroke-width="1.5" opacity="0.6"/>`;
      body = `<rect x="84" y="36" width="32" height="90" fill="#f4f1ea"/>
        <g>${half}</g><g transform="translate(200 0) scale(-1 1)">${half}</g>
        <circle cx="101" cy="132" r="2.6" fill="${seam}"/><circle cx="101" cy="156" r="2.6" fill="${seam}"/>`;
      break;
    }
    case "shirt": {
      const edge = shade(c, -0.18);
      const half = `
        <path d="M84 40 L50 54 C40 60 36 76 34 92 L28 170 L48 172 L54 104 L56 192 L100 194 L100 50 Z" fill="${c}" stroke="${edge}" stroke-width="1"/>
        <path d="M84 36 L100 54 L80 64 L78 42 Z" fill="${shade(c, 0.05)}" stroke="${edge}" stroke-width="1"/>`;
      body = `<g>${half}</g><g transform="translate(200 0) scale(-1 1)">${half}</g>
        <path d="M100 56 L100 192" stroke="${edge}" stroke-width="1"/>
        ${[80, 108, 136, 164].map((y) => `<circle cx="104" cy="${y}" r="1.8" fill="${edge}"/>`).join("")}`;
      break;
    }
    case "tie": {
      if (g.metadata.isEmpty) {
        body = `<path d="M84 60 L100 80 L116 60" stroke="#b9b1a4" stroke-width="2" fill="none"/>
          <circle cx="100" cy="118" r="34" stroke="#b9b1a4" stroke-width="2" fill="none" stroke-dasharray="4 5"/>`;
      } else {
        body = `<path d="M90 28 L110 28 L106 52 L94 52 Z" fill="${shade(c, -0.12)}"/>
          <path d="M94 52 L106 52 L122 176 L100 198 L78 176 Z" fill="${c}"/>
          <path d="M100 56 L100 192" stroke="${shade(c, 0.14)}" stroke-width="1" opacity="0.6"/>`;
      }
      break;
    }
    case "shoes": {
      const sole = shade(c, -0.4);
      const hi = shade(c, 0.28);
      body =
        g.metadata.silhouette === "loafer"
          ? `<path d="M40 128 C40 112 52 104 70 104 L112 106 C140 108 166 120 172 138 L172 146 L36 146 Z" fill="${c}"/>
             <path d="M104 116 L150 124" stroke="${hi}" stroke-width="3" opacity="0.7"/>
             <rect x="32" y="144" width="144" height="8" rx="2" fill="${sole}"/>`
          : `<path d="M40 128 C40 104 54 94 72 94 L104 98 C136 104 164 118 172 136 L172 146 L36 146 Z" fill="${c}"/>
             <path d="M140 116 C150 120 160 128 166 138" stroke="${hi}" stroke-width="1.6" fill="none" opacity="0.8"/>
             <path d="M94 102 L118 110 M92 110 L116 104" stroke="${hi}" stroke-width="1.4" opacity="0.8"/>
             <rect x="32" y="144" width="144" height="8" rx="2" fill="${sole}"/>`;
      break;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" width="200" height="220">${body}</svg>`;
}
