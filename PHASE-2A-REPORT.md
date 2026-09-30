# Suit Lab: Phase 2A Report ("Make the magic real")

**Date:** 2026-10-01
**Stop condition reached:** implementation and automated tests are complete. Phase 2B and 3 have **not** been started.

> **No real virtual try-on has been generated yet.** The FASHN key is configured and verified with a free, non-generating status lookup (`GET /v1/status/<nonexistent>` → `404 Prediction not found`, meaning the key was accepted). No paid call has been made.
>
> The first real generation still needs two things only you can provide: **your own photo** and **one provider-grade suit photo**. See section 8.

---

## 1. Architecture implemented

- **Before Phase 2A:** a browser-only prototype.
- **Now:** a server-side pipeline inside the same Next.js monolith.

Flow:
1. **Browser → secure upload** (`POST /api/profile`, multipart).
2. **Validation:** MIME type, magic bytes, size and dimensions.
3. **Normalisation:** re-encode to JPEG, strip EXIF, cap at 2048 px.
4. **Private storage:** `users/<uid>/profiles/<pid>/source.jpg`.
5. **Profile row** in Neon.
6. **`POST /api/generations`** checks, in order:
   - cache,
   - in-flight dedupe,
   - rate limits,
   - then creates a `queued` row and calls `provider.submit()` (fast) → `processing`.
7. **Browser polls** `GET /api/generations/:id` every 1.5 s. The server makes **at most one** provider status check per 1.5 s per job. That slot is claimed atomically in the database.
8. **Completed:** output is copied into private storage (`users/<uid>/generations/<gid>.png`), the row is updated (`completed`, `duration_ms`, `cost_credits`), and a **signed URL** goes back to the Studio.

Providers:
- The provider interface is preserved: `VirtualTryOnProvider` with `submit`, `getStatus` and `capabilities`, plus `model`, `optionsFingerprint` and `estimateCostCredits` for metrics and caching.
- `MockTryOnProvider` is now stateless: the job state is encoded in the job ID.
- `FashnVirtualTryOnProvider` is new: one garment, suit only, `realTryOn: true`.
- The Studio doesn't know which provider is running. It reads `capabilities` from `/api/session`.

UI: no redesign, and the Studio looks the same. The only additions are honest states:
- One line: "Real try-on applies the suit only. Other selections aren't rendered yet."
- The Generate button explains itself when unavailable: "Not available for this garment" or "Needs your own photo".
- The "Mock preview" badge is hidden when the provider is real.

## 2. Database schema (Neon)

- **Project:** `suit-lab` (`nameless-hat-77093535`), region `aws-eu-central-1` (Frankfurt), Postgres 17.
- **Database:** `suitlab`.
- **Migration:** `drizzle/0000_init.sql`, **applied**.
- **Wardrobe seeded:** suit=6, shirt=4, tie=5, shoes=3.

| Table | Purpose |
|---|---|
| `users` | Anonymous session users |
| `profiles` | Body details + storage keys of source/model image |
| `garments` | Catalog; `try_on_image_key` marks a garment "try-on ready" |
| `generations` | Every request, including cache hits: status, provider, model, job ID, request_key, applied garments, output key, error code (internal detail kept separately), cache_hit, duration_ms, cost_credits |
| `looks` | Saved looks; unapplied categories are NULL |

The full column list is in `README.md` → *Database schema*.

Key guarantees:
- The partial unique index `generations_inflight_uniq (user_id, request_key) WHERE status IN ('queued','processing')` makes duplicate paid jobs impossible.
- Deleting a user cascades to that user's profiles, generations and looks.

## 3. R2 structure

```
users/<userId>/profiles/<profileId>/source.jpg
users/<userId>/generations/<generationId>.png|jpg
garments/<garmentId>/tryon-<contentHash>.jpg
```

- The bucket must be private. Clients only ever receive presigned GET URLs (1 hour).
- `R2Storage` uses the S3-compatible API. It is tested for presigning, put, get and delete-by-prefix with a stubbed S3 client.
- **R2 credentials are not configured yet.** Until they are, the app uses the local private-disk driver, which serves files only through HMAC-signed, expiring `/api/files/...` URLs.
- Production refuses to start without R2 (`STORAGE_PROVIDER=r2` is enforced).

## 4. FASHN integration status

| Item | Status |
|---|---|
| Adapter written from the official docs (run/status endpoints, statuses, inputs, errors, retention) | Done |
| `tryon-v1.6` (Stable, 1 credit) default; `tryon-max` (Preview) selectable via `FASHN_MODEL` | Done |
| Documented error names mapped to user-safe codes; 429/5xx on status treated as transient | Done |
| Base64 inputs (no private URLs leave the server); `return_base64=true` (60-minute provider retention) | Done |
| Output-host allowlist (`cdn.fashn.ai`, `media.fashn.ai`) for URL outputs | Done |
| Cost recorded only from documented pricing (v1.6 = 1 credit; max = documented table) | Done |
| API key present in `.env.local` and accepted by FASHN (free status lookup) | Verified |
| `VIRTUAL_TRYON_PROVIDER=fashn` enabled | **Not yet** (it's step 3 in section 8) |
| First real generation | **Not done.** Needs your photo and a garment photo |

**Note on your key:** you added it as `fashin_API="…"`. I renamed that line to `FASHN_API_KEY=` in `.env.local` without changing the value.

## 5. Environment variables still required

| Variable | Needed for | Status |
|---|---|---|
| `VIRTUAL_TRYON_PROVIDER=fashn` | Real try-on | Set it when ready (step 3) |
| `STORAGE_PROVIDER=r2`, `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` | R2 (required for any deployment) | **Missing.** Needs your Cloudflare account |
| `SESSION_SECRET` | Sessions | Set locally; set a new one per deployment |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Neon | Set locally |
| `FASHN_API_KEY` | FASHN | Set and verified |

## 6. Test results

| Suite | Result |
|---|---|
| Typecheck, lint | Clean |
| Unit / integration (Vitest) | **100 / 100 pass** (11 files) |
| End-to-end (Playwright, production build, desktop 1440 + mobile 390) | **24 pass**, 2 skipped (mobile-only specs on the desktop project) |

All Phase 1 tests are preserved; tests that relied on localStorage were ported to the server-backed flow. New tests cover:
- **Upload:** a valid upload is stored privately, EXIF is stripped, and the photo is only reachable through a signed URL.
- **Invalid upload:** wrong type, MIME mismatch, corrupt bytes, SVG disguised as a photo, too small, over 15 MB, and a friendly error with nothing stored.
- **Storage:** R2 presign, put, get and prefix delete; local signed URLs rejecting tampering, expiry and path traversal.
- **Profiles:** persistence, the latest profile winning, and the per-user rate limit.
- **Ownership checks (IDOR):** profiles, generations, looks, the file route and forged cookies.
- **FASHN adapter**, against mocked HTTP responses:
  - v1.6 and max payloads, and bearer auth;
  - every documented status;
  - HTTP 400/401/429/500 and network errors;
  - runtime error names;
  - base64 and `_expired` output;
  - costs.
- **Generation lifecycle:**
  - creation, and the `queued → processing → completed` transitions;
  - terminal states never change again;
  - provider failure, submit rejection, timeout, and a misconfigured provider.
- **Cost protection:**
  - 4 concurrent identical requests → 1 job;
  - cache reuse, and cache invalidation when settings change;
  - status-check throttling;
  - per-user, in-flight and daily caps.
- **Delete my data:** storage and database are wiped, other users and shared garment assets are untouched, and the cookie is cleared.
- **Studio:** capability states are shown honestly.
- **End to end:** the full FASHN flow through the real adapter with mocked HTTP.

**No test can make a paid call.** The Vitest setup blocks every request to `fashn.ai`, and the e2e server runs with `VIRTUAL_TRYON_PROVIDER=mock`, an empty key, and a throwaway local database (never Neon).

## 7. Security and privacy notes

**Uploads**
- Declared MIME must match the decoded format.
- Limits: 15 MB, short side ≥ 400 px, long side ≤ 12,000 px, 60 MP cap.
- Everything is re-encoded, which drops EXIF/GPS.

**Access**
- Private objects only; signed URLs for 1 hour.
- The local file route sends CSP `sandbox`, `nosniff` and `no-referrer`.

**Sessions**
- HMAC-signed anonymous cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in production.
- All queries are scoped to the user; other users' data returns 404.
- Mutating requests with a foreign `Origin` are rejected with 403.

**Secrets**
- Server-only: nothing is `NEXT_PUBLIC_`, and `server-only` guards the imports.
- `.env*` is gitignored; I scanned staged files for the actual secret values before committing.

**Logs**
- IDs, codes and durations only. The logger drops URLs, data URIs and signatures.

**Deletion**
- "Delete my photo, model and looks" removes `users/<id>/` from storage, then the database rows.

**Provider retention** (quoted from FASHN's Data Retention & Privacy page; no stronger claim is made):
- Base64 inputs: the processing copy is deleted when the request finishes, with a one-day backstop.
- Base64 outputs: kept 60 minutes.
- There is **no deletion endpoint**. Records are deleted on request to legal@fashn.ai with the prediction IDs, which are stored in `generations.provider_job_id`.

**Not yet done**
- Account auth.
- CAPTCHA or abuse scoring beyond rate limits.
- A virus scan (uploads are re-encoded, never served raw).

## 8. Exact steps to run the FIRST REAL virtual try-on

1. **Get one provider-grade suit photo** for *Midnight Navy*, or any single suit you have rights to use.
   - Clear product shot, flat-lay or on-model.
   - The whole jacket visible, plain background, at least 1024 px on the short side.
   - Put it in `private-assets/` (gitignored), e.g. `private-assets/navy-suit.jpg`.
2. **Register it as the try-on garment.** This writes to Neon and to local private storage.
   ```bash
   npm run garment:set -- suit-midnight-navy private-assets/navy-suit.jpg
   ```
3. **Turn on the real provider** by adding this to `.env.local`:
   ```
   VIRTUAL_TRYON_PROVIDER=fashn
   # optional: FASHN_MODEL=tryon-max  (Preview; 2 credits at balanced/1k)
   ```
4. **Start the app** with `npm run dev` and open http://localhost:3000.
5. **Create My Model.** Upload *your own* photo:
   - well lit, facing the camera, your face visible;
   - ideally waist-up or full-body, arms not covering your torso.
6. **Generate.** In the Studio, keep **Suits → Midnight Navy** selected and click **Generate Look**. Expect about 12–17 s with `tryon-v1.6` at quality. **This spends 1 FASHN credit.** Failed predictions don't consume credits.
7. **Judge it.**
   - Toggle **Original / Look**.
   - Click **Save Look** and check **My Looks**.
   - Clicking Generate again with the same suit should return instantly as a cache hit, with no second credit.
8. **Inspect the metrics:**
   ```sql
   select provider, provider_model, status, cache_hit, duration_ms, cost_credits, provider_job_id, error_code, created_at
   from generations order by created_at desc limit 5;
   ```

**The decision to make:** is this believably *you*, wearing *that* suit?

## 9. Known provider limitations (from verified docs only)

- **One garment per call.** v1.6 categories are `auto`, `tops`, `bottoms`, `one-pieces`. A **two-piece suit is not a documented category**, so how `auto` treats a full suit photo (jacket only, or jacket plus trousers) is **unknown until tested**.
- v1.6 processes inputs at **864 × 1296 px**. Output resolution is bounded by that. `tryon-max` offers 1k/2k/4k.
- `tryon-max` is **Preview**: its output may change as the model evolves.
- Rate limits: `/run` 50 per 60 s, `/status` 50 per 10 s, **6 concurrent**. Suit Lab caps in-flight real jobs at 4.
- Output retention: 3 days (URL) or 60 minutes (base64, our setting). A job not collected within 60 minutes is lost and marked failed.
- Webhooks exist, but the docs don't document signature verification, so Suit Lab polls instead.
- The docs make **no claims about identity preservation** (face, body, skin tone). That's exactly what step 7 has to judge.

## 10. Files changed

- **Added:**
  - `drizzle.config.ts`, `drizzle/0000_init.sql` (plus migration metadata)
  - `scripts/db-migrate.mts`, `scripts/set-garment-asset.mts`
  - `src/server/**`: config, db, storage (R2, local, memory), services, images, session, http, log, tryon
  - `src/app/api/**`: session, profile, profile/demo, generations, generations/[id], looks, looks/[id], me, files/[...key]
  - `src/lib/api-types.ts`, `src/lib/messages.ts`, `src/lib/client/api.ts`, `src/lib/tryon/fashn-provider.ts`
  - `tests/unit/server/*` (7 files), `tests/unit/studio-capabilities.test.tsx`, `tests/stubs/empty.ts`
  - `PHASE-2A-REPORT.md`
- **Modified:**
  - `src/lib/tryon/{types,mock-provider,index}.ts`
  - `src/lib/client/{session-store,generation}.ts`
  - Studio, My Looks, look card, onboarding flow, photo step, demo button
  - `next.config.ts`, `package.json` and lockfile, `playwright.config.ts`, `vitest.config.mts`
  - `.env.example`, `README.md`
  - Phase 1 unit and e2e tests (ported to the server-backed flow)
- **Removed:** `src/lib/demo.ts`. The demo profile is now created server-side.
- **Local only, not committed:** `.env.local`

## 11. Git status

- `phase-1` tag → commit `5aaf06a` "feat: complete Suit Lab Phase 1 product shell".
- Phase 2A is committed on `main` on top of it.
- **Remote:** `https://github.com/geeks20/suit-lab`, which is **public**. `main` and the `phase-1` tag are pushed there, as you asked.
- No secrets are in history: `.env.local` is gitignored, and the staged files were scanned for the actual secret values before the commit.
