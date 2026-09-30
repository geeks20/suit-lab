# Suit Lab: Phase 1 Report

**Date:** 2026-09-30
**Scope:** Phase 1, the product shell. Following the brief's phase gates, work stopped here, before the image pipeline.

> Note: the build brief was cut off at section "39". If there is more, it still needs to be checked against what's built.

## Test results

| Check | Result |
|---|---|
| Typecheck (`npm run typecheck`) | Clean |
| Lint (`npm run lint`) | Clean |
| Unit tests (`npm test`, Vitest) | 23 / 23 pass |
| End-to-end tests (`npm run test:e2e`, Playwright, production build) | 22 pass, 2 skipped (mobile-only specs on the desktop run) |

End-to-end tests run at desktop (1440px) and mobile (390px) widths. All AI calls are mocked. No paid API is ever called.

**Run it:** `npm install && npm run dev`. On the home page, **Try the demo model** gets you into the studio in one click.

## What's in Phase 1

### Home
- Headline, **Create My Model**, **Try the demo model**, and an Original → Look example.

### Create your model
- Drag-and-drop or file picker, with a preview.
- Rejects the wrong file type, corrupt or tiny images (under 400px on the short side), and files over 15 MB, using the brief's error copy.
- Height, weight and build are validated.
- The loading screen rotates the three brief messages, with no fake percentages.

### Studio
- **Desktop:** the image takes about 70% of the width. The wardrobe sits on the right, with Suits / Shirts / Ties / Shoes tabs.
- **Mobile:** the image fills the top and garments scroll sideways. Generate is always within thumb reach.
- **Selecting vs generating:** picking garments never triggers a generation. Only **Generate Look** does.
- **Loading and errors:** the previous image stays visible (dimmed) while "Creating your look…" shows. A failure shows the friendly message and **Try Again**.
- **Comparing:** an Original / Look toggle, plus an "Outfit changed · Generate to see it" hint when the selection no longer matches the image.
- **Keyboard:** arrow keys move between tabs and garments.

### Protecting generation cost
- Double-clicks are ignored while a generation is in flight.
- An identical model + outfit reuses the cached image instead of generating again.
- Polling gives up after 90 seconds instead of hanging.
- Users only see friendly error messages, never raw provider errors.

### Save and My Looks
- Looks save as Look 01, Look 02…, and can be renamed, deleted or reopened in the studio.
- Empty state: "You haven't saved a look yet." with a **Create a Look** button.
- **Delete my photo, model and looks** wipes all stored data.

### Structure
- The wardrobe is structured garment data (6 suits, 4 shirts, 5 ties, 3 shoes), separate from the UI.
- The try-on provider sits behind a swappable interface (`VirtualTryOnProvider`: `submit` / `getStatus` / `capabilities`).
- The only implementation is a **clearly labelled mock provider**, with no network calls.
- Analytics is a stub using the brief's event names, with a swappable sink.
- `README.md` and `.env.example` are written.

## UX review

1. **The mock output is an illustration, not the user's photo.** The "that's actually ME" moment can't be judged until a real provider is connected in Phase 2/3. Every mock result is labelled "MOCK" so nobody mistakes it.
2. **All data stays in the browser for now.** Photos and looks are in localStorage, with no server and no accounts.
   - Upside: photos never reach a server.
   - Downsides: data is per-browser and limited to about 5 MB.
   - Cost protection is browser-only until generation moves server-side, so there is no real rate limiting yet.
   - The README documents this tradeoff.
3. **Two small Phase 4 items were pulled forward:** the before/after toggle and basic Save, because My Looks needed content. PNG export and Style Me are **not** built.
4. **Garment thumbnails are placeholder illustrations.** Real product photos will be needed for real try-on anyway.

## Phase status

| Phase | Scope | State |
|---|---|---|
| 1. Product shell | Home, onboarding, studio, wardrobe, My Looks, responsive UI, mock data | **Done** |
| 2. Image pipeline | Server upload, object storage, profiles in Postgres, provider API, FASHN adapter | Not started |
| 3. Full look | Multi-garment generation strategy per provider capability | Not started |
| 4. Product features | PNG export; save and before/after already exist in basic form | Partly done |
| 5. AI stylist | Style Me, structured recommendation, wardrobe-ID validation | Not started |
| 6. Polish | Performance, analytics sink, security review | Not started |

## Decisions needed before Phase 2

- [ ] **Database:** where it lives. Neon Postgres is available.
- [ ] **Image storage:** Cloudflare R2 or AWS S3.
- [ ] **FASHN API key:** is one available? Until it is, the FASHN integration can be built but not called.

## Repository state

The project folder is not a git repository, and nothing has been committed.
