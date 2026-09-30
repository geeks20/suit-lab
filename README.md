# Suit Lab

**See the look before you wear it.** Suit Lab is a virtual suit studio. Upload a photo, pick a suit, and generate an image of yourself wearing it.

> **Visual try-on is not physical fit prediction.**
> Suit Lab answers "what could I look like wearing this?" It never answers "will this fit me?" Height, weight and build only shape the preview. They are not tailoring measurements, and Suit Lab makes no size recommendation.

## Status

| Phase | Scope | State |
|---|---|---|
| 1. Product shell | Home, onboarding, studio, wardrobe, My Looks, responsive UI | Done (tag `phase-1`) |
| **2A. Make the magic real** | Real photo + **one** real garment → real try-on, server-side pipeline, Neon, private storage | **Implemented; awaiting first real generation** |
| 2B / 3+ | Multi-garment, stylist, export… | Not started |

## Quick start

```bash
npm install
npm run dev           # http://localhost:3000
```

With no `.env.local`, everything runs locally:
- **Database:** an embedded Postgres (PGlite) in `.data/`, migrated automatically.
- **Storage:** private files in `.data/storage`, served only through signed, expiring URLs.
- **Provider:** the **mock** try-on provider. It makes no network calls and costs nothing.

To use Neon, set `DATABASE_URL` and run `npm run db:migrate`. To use R2, see [Storage](#storage-cloudflare-r2).

## Architecture

```
browser ──multipart──▶ POST /api/profile ──validate+normalise (sharp)──▶ storage: users/<uid>/profiles/<pid>/source.jpg
                                              └──▶ profiles row

browser ──▶ POST /api/generations ─┬─ cache hit?  → new row (cache_hit=true), same image, no provider call
                                   ├─ same job in flight? → return it (partial unique index)
                                   ├─ rate limits (user/hour, global in-flight, global/day)
                                   └─ row 'queued' → provider.submit(base64 person + garment) → 'processing'
browser ──poll 1.5s──▶ GET /api/generations/:id ── at most one provider status check per 1.5 s per job (DB-claimed)
                                   └─ completed → copy output into storage users/<uid>/generations/<gid>.<ext>
                                                  → row 'completed' (+duration, cost) → signed URL to the UI
```

- **No long-held HTTP requests.** Submitting is a quick call. The client polls our API, and our API makes at most one throttled status check per poll. No worker or webhook is needed for V0. The job only advances while someone polls, and the server times out jobs after `GENERATION_TIMEOUT_SECONDS`.
- **Provider boundary.** The studio and services depend only on `VirtualTryOnProvider` (`submit`, `getStatus`, `capabilities`, `model`, `optionsFingerprint`, `estimateCostCredits`). Implementations:
  - `MockTryOnProvider` is stateless: the job state lives in the job ID.
  - `FashnVirtualTryOnProvider` handles a single garment, suit only.
  - Adding a provider means one new adapter file plus a case in `src/server/tryon.ts`.
- **Honest capability.** The server tells the studio which categories the provider applies and which garments are "try-on ready". With FASHN, only the suit is applied, the studio says so, and generations and saved looks record only the garments actually applied.

```
src/
  domain/                pure product logic (wardrobe, looks, profile)
  lib/tryon/             provider interface, mock, FASHN adapter (isomorphic, no secrets)
  lib/client/            browser: API client, session store, generation hook
  server/                server-only
    config.ts            env parsing + production guards
    db/                  drizzle schema, client (Neon or PGlite), seed
    storage/             ObjectStorage: R2Storage | LocalStorage | MemoryStorage
    services/            profiles, generations, looks, privacy, session (dependency-injected)
    images.ts            upload validation / normalisation
    session.ts           anonymous signed session cookie
    http.ts              route helpers, origin check, error mapping
  app/api/               thin route handlers
drizzle/                 SQL migrations
scripts/                 db-migrate.mts, set-garment-asset.mts
```

## Database schema

Migrations are in `drizzle/` and are generated from `src/server/db/schema.ts`. Run `npm run db:generate` to create a migration and `npm run db:migrate` to apply it.

| Table | Key columns | Notes |
|---|---|---|
| `users` | id, created_at | Anonymous session users; accounts can attach later |
| `profiles` | id, user_id → users (cascade), height_cm, weight_kg, build, source_image_key, model_image_key, is_demo, created_at | Storage **keys**, never images or URLs |
| `garments` | id, category, name, color, style, material, formality, image_url, **try_on_image_key**, metadata, active | Seeded from `src/domain/wardrobe.ts`. `try_on_image_key` set means "try-on ready" |
| `generations` | id, user_id, profile_id, look_id, provider, provider_model, provider_job_id, status, request_key, look_key, input_data, output_key, error_code, error_detail, cache_hit, cached_from_id, duration_ms, cost_credits, last_polled_at, created_at, completed_at | Status is one of `queued`, `processing`, `completed`, `failed`. `input_data` holds garment IDs and options only. `error_detail` is internal. |
| `looks` | id, user_id, profile_id, name, suit_id / shirt_id / tie_id / shoes_id (nullable = not applied), generation_id, generated_image_key, created_at | Unique on (user_id, generation_id) |

Indexes:
- `generations_inflight_uniq`: a **partial unique index** on (user_id, request_key) where status is queued or processing. It makes duplicate paid jobs impossible, even under races.
- User and time indexes on every table that users own.

**Generation identity (`request_key`)** is sha256 over:
- the profile ID and model image key,
- each applied garment's ID and try-on asset key (the key contains a content hash),
- the provider ID and model,
- the provider options fingerprint (mode, resolution, seed, format).

Changing the photo, the garment photo, the model or the settings makes a new identity, so the cache never returns a stale image.

## Storage (Cloudflare R2)

```
users/<userId>/profiles/<profileId>/source.jpg        normalised upload (EXIF stripped, ≤2048px)
users/<userId>/generations/<generationId>.png|jpg     provider output copied in (never hot-linked)
garments/<garmentId>/tryon-<contentHash>.jpg          provider-grade garment photos
```

- The bucket must be **private**, with no public `r2.dev` URL and no custom domain.
- Clients only receive presigned GET URLs, valid for 1 hour by default.
- Credentials exist only on the server.

Setup:
1. Create a bucket, e.g. `suitlab-private`.
2. Create an **R2 API token** with *Object Read & Write* scoped to that bucket.
3. Set these variables:

   ```
   STORAGE_PROVIDER=r2
   STORAGE_BUCKET=suitlab-private
   STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   STORAGE_ACCESS_KEY=…
   STORAGE_SECRET_KEY=…
   ```

Browsers load images straight from R2 through presigned URLs, so no CORS rule is needed for `<img>`.

## FASHN integration

Built from the official docs at docs.fashn.ai, checked 2026-10-01:
- `POST https://api.fashn.ai/v1/run` with `{ model_name, inputs }`
- `GET /v1/status/{id}`
- Authorization is a `Bearer` token.

| | `tryon-v1.6` (default) | `tryon-max` |
|---|---|---|
| Stage | Stable | Preview |
| Garment input | `garment_image` (`category: auto`) | `product_image` |
| Cost per image | 1 credit | 1–5 credits (mode × resolution table) |
| Typical time | ~12–17 s (quality) | ~10–55 s |

Suit Lab always requests one image per job, with `seed=42`, `output_format=png`, and `return_base64=true` (FASHN keeps the output for 60 minutes instead of 3 days). Person and garment images are sent as **base64 data URIs**, so no private URL ever leaves the server.

## Privacy

- Uploads are validated in several ways:
  - Declared MIME type is checked against the actual decoded format.
  - Maximum size is 15 MB.
  - The short side must be at least 400 px.
  - There's a 60 MP pixel cap.
- Uploads are then re-encoded to JPEG, which **strips EXIF/GPS**.
- The session is an anonymous, signed, `HttpOnly`, `SameSite=Lax` cookie. Every query is scoped to the session user, so requesting another user's ID returns 404. Mutating requests with a foreign `Origin` are rejected.
- Logs contain IDs, codes and durations only. The logger drops anything that looks like a URL, data URI or signature.
- **Delete my photo, model and looks** (bottom of My Looks) deletes every object under `users/<id>/` in storage, then the user row. Profiles, generations and looks cascade with it.
- **Provider side (per FASHN's Data Retention & Privacy page):**
  - Base64 inputs: *"The temporary processing copy is deleted when the request finishes, with a one-day automatic cleanup backstop."*
  - Base64 outputs are available for 60 minutes.
  - *"There is currently no deletion endpoint. To have request records deleted, contact legal@fashn.ai and include your Organization and the relevant prediction IDs."*
  - FASHN states it does not train on customer content unless you opt in.
- Suit Lab makes no stronger claim than that.

## Testing

```bash
npm test             # Vitest: domain, client, server services (PGlite in-memory), adapters, routes
npm run test:e2e     # Playwright on a production build: isolated PGlite + local storage + mock provider
npm run typecheck && npm run lint
```

Tests never touch Neon, R2 or FASHN:
- The FASHN adapter is tested with mocked HTTP responses.
- The test setup also **blocks any request to `fashn.ai`**.
- The e2e server forces `VIRTUAL_TRYON_PROVIDER=mock` and an empty key.

**Mock failure switch:** set the cookie `sl_mock_fail=1`. The mock provider only reads it to exercise the error state, and real providers ignore it.

## Known limitations

- **One garment only.** FASHN applies the suit. The shirt, tie and shoes you select are not rendered, and the UI says so.
- **Two-piece suits are not a documented FASHN v1.6 category** (the documented ones are `tops`, `bottoms`, `one-pieces` and `auto`). How `auto` handles a full-suit photo is unverified until the first real test.
- **Jobs advance only while polled.** If the tab closes, the next poll finishes the job or the server times it out. With base64 output, a result that isn't collected within 60 minutes is lost, and the job is marked failed.
- **Anonymous sessions.** Clearing cookies loses access to that session's data. Accounts come later.
- **The demo model is illustrated.** It works with the mock provider only.
