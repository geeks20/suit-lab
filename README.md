# Suit Lab

**See the look before you wear it.** Suit Lab is an AI-powered virtual suit studio: upload a photo, build an outfit from a small curated wardrobe (suit, shirt, tie, shoes), and generate an image of yourself wearing it.

> **Visual try-on is not physical fit prediction.**
> Suit Lab answers "what could I look like wearing this?" It never answers "will this fit me?" Height, weight and build only shape the preview. They are not tailoring measurements, and the product makes no size recommendation.

## Status: Phase 1 (product shell)

| Phase | Scope | State |
|---|---|---|
| 1. Product shell | Home, onboarding, studio, wardrobe, My Looks, responsive UI, mock data | **Done** |
| 2. Image pipeline | Server upload, object storage, profiles in Postgres, provider API, FASHN adapter | Not started |
| 3. Full look | Multi-garment generation strategy per provider capability | Not started |
| 4. Product features | PNG export, polish on save/before-after (basic save and before/after already exist) | Partly done |
| 5. AI stylist | "Style Me", structured recommendation, wardrobe-ID validation | Not started |
| 6. Polish | Performance, analytics sink, security review | Not started |

In Phase 1, **everything runs in the browser, and no paid API is ever called.** Generation uses the mock try-on provider, which returns a flat illustration of the outfit captioned *MOCK TRY-ON · NO AI CALL MADE*.

## Running it

```bash
npm install
npm run dev              # http://localhost:3000
```

Two ways in:
- **Create My Model**: upload any JPG, PNG or WebP photo at least 400 px on the short side.
- **Try the demo model**: an illustrated sample model with no upload needed. Good for sales demos and UI work.

## Testing

```bash
npm test                 # unit tests (Vitest): domain, store, generation, mock provider
npm run test:e2e         # Playwright: builds, starts on :3217, runs desktop (1440) + mobile (390) projects
npm run typecheck
npm run lint
```

First run of the e2e suite: `npx playwright install chromium`.

All AI and provider calls are mocked. Tests never make network calls to paid services.

What is covered: photo upload (valid, wrong type, corrupt file), profile validation, studio empty state, garment selection, `currentLook` persistence across reload, generation success and failure with Try Again, double-click and duplicate protection, cached identical looks, before/after, save, rename, reopen, My Looks empty state, keyboard operation of the wardrobe, and the 390 px layout (image first, actions in reach, no horizontal scroll).

**Mock failure switch (dev only):** `localStorage.setItem("suitlab.mock.failureRate", "1")` makes every mock job fail, so you can exercise the error state. Remove the key to go back to normal.

## Architecture

A single Next.js 16 (App Router) monolith. Layers are kept separate so later phases swap implementations instead of rewriting UI.

```
src/
  domain/            Pure logic, no React, no I/O
    garment.ts         Garment type + categories
    wardrobe.ts        Seed catalog (6 suits, 4 shirts, 5 ties, 3 shoes) + lookups
    look.ts            LookSelection, withGarment, validation, lookKey (cache key)
    profile.ts         Body details schema (zod). Never used for sizing.
  lib/
    tryon/             Virtual try-on boundary
      types.ts           VirtualTryOnProvider: submit() / getStatus(), capabilities
      mock-provider.ts   MOCK provider (no network): queued → processing → completed
      index.ts           createTryOnProvider(id)
    art/               SVG illustration (demo model, mock output, wardrobe thumbnails)
    client/
      session-store.ts   Browser session store (useSyncExternalStore + localStorage)
      generation.ts      useGeneration: lock, cache, polling, timeout, friendly errors
      image.ts           Upload validation + client-side downscale (strips EXIF)
    analytics.ts       track(event, props) with a swappable sink
  components/        UI only: onboarding/, studio/, looks/, ui/
  app/               Routes: / · /create · /studio · /looks
    wardrobe-art/[file]  Statically generated garment thumbnails
    demo-assets/[file]   Demo model and sample look (DEMO MODE)
```

### Selection is separate from generation

Clicking garments only updates `currentLook` (instant, free). A generation runs only when the user presses **Generate Look**. Protections:

- **Lock:** a second request while one is in flight is ignored (covers double-clicks).
- **Cache:** an identical `profile + lookKey` returns the existing result without a provider call.
- **Timeout:** polling stops after 90 s and shows a recoverable error. The UI never hangs.
- **Friendly errors only:** provider `detail` stays internal. Users see one of the messages the brief specifies.

### Try-on providers

Product code depends only on `VirtualTryOnProvider`:

```ts
interface VirtualTryOnProvider {
  id: string;
  capabilities: { categories; maxGarmentsPerCall; async };
  submit(req: { personImage; garments; options }): Promise<TryOnJob>;   // → queued/processing/…
  getStatus(providerJobId): Promise<TryOnJob>;                            // poll until completed/failed
}
```

`capabilities` exists so Phase 3 can plan a per-provider pipeline (for example, one call for top and bottom, then separate passes) instead of assuming one call can apply suit, shirt, tie and shoes. FASHN, Google Virtual Try-On or an in-house model each become one adapter file. **No FASHN integration exists yet.** It waits for Phase 2 and real credentials.

### Data and auth (V0 tradeoff)

There is no server state and no accounts in Phase 1. The profile, photo, current look, the 12 most recent generations and saved looks live in `localStorage` under `suitlab.session.v1`:

- The photo is downscaled to 1280 px JPEG in the browser before storage. This also drops EXIF data such as GPS.
- Nothing leaves the device, and nothing reaches logs or analytics. Analytics props are scalars only (garment IDs, categories, durations).
- **Delete my photo, model and looks** (at the bottom of My Looks) wipes everything.
- Limitations: data is per-browser, not synced, and lost if site data is cleared. Storage quota is about 5 MB, so a very large number of saved looks could fill it. The UI reports this rather than failing silently.

Phase 2 moves this to Postgres (users, profiles, garments, looks, generations) and private object storage with signed URLs, behind anonymous-session auth that can later be upgraded to accounts.

## Known limitations (Phase 1)

- Generated images are **mock illustrations**, not photos of the user. The real "that's actually me" moment requires Phase 2 and 3.
- The mock output reflects the selected build but otherwise does not use the uploaded photo.
- No PNG export and no AI stylist yet.
- Garment thumbnails are illustrations. Real product photography (`tryOnImageUrl`) is needed for real try-on.
- No server means no rate limiting yet. Cost protection is client-side only (lock and cache) until generation moves server-side.

## Deployment

Phase 1 is a standard Next.js app with no required environment variables: `npm run build && npm start`, or deploy to any Next.js host. See `.env.example` for the variables later phases will need.
