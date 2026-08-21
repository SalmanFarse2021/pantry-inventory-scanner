# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Scaffolded and in active development. Vite + React + TypeScript SPA with Vercel Functions
for server-side Pixabay access, deployed on Vercel. See `brief.md` for the original design
brief and `.claude/plans/` (or ask) for the full architecture plan this was built from.

## Commands

- `npm run dev:vercel` — `vercel dev`, serves the Vite frontend and `/api/*` functions together
  (matches production topology). Requires the project to be linked to a Vercel account
  (`vercel link` — done; linked to `davids-projects-0cdca2cb/brainrot`). Named `dev:vercel`
  rather than the more obvious `dev` because Vercel CLI's recursion guard specifically checks
  whether `package.json`'s script *named* `dev` invokes `vercel dev` (its assumption being that
  `npm run dev` is the zero-config dev entrypoint) — and refuses to start at all if so, before
  even reading `vercel.json`'s `devCommand`. Any other script name with the identical
  `"vercel dev"` value is unaffected. Confirmed reproducing outside the agent sandbox too (not
  an environment quirk) — renaming the script is the real fix, not a workaround.
- `npm run dev:vite` — plain `vite`, frontend only, no `/api/*` routes served. Fine for UI work
  in mock mode (the default — see **Data sources** below). This is what's been used so far.
- `npm run build` — `tsc -b && vite build`. Type-checks `src/` (which transitively covers
  `shared/`) and produces `dist/`.
- `npm run typecheck:api` — type-checks `api/*.ts` (and `shared/`) separately, since those
  files aren't reachable from `src/`'s tsconfig and Vercel's own build doesn't run `tsc` on them.
- `npm run typecheck:scripts` — same idea for `scripts/*.ts`.
- `npm run bundle:generate [-- <dateKey>]` — runs `scripts/generate-bundle-local.ts` via `tsx`
  (a direct devDependency now, though `vite`/`@vercel/node` also pull it in transitively). Calls
  `generateDailyBundle` against the real Pixabay API (reads `PIXABAY_API_KEY` from `.env` via
  Node's built-in `process.loadEnvFile`) and writes `public/dev-bundles/<dateKey>.json`
  (`<dateKey>` defaults to today, UTC). Pair with `VITE_BUNDLE_SOURCE=local npm run dev:vite`.
- `npm run lint` — `oxlint`. Expect three `react(only-export-components)` warnings on the route
  files under `src/routes/` — inherent to TanStack Router's file-route convention (each file
  exports both `Route` and a component); not a real issue.
- `npm run test` / `npm run test:watch` — `vitest`. Currently covers `shared/weighting.ts` and
  `shared/pathGeneration.ts` (pure functions, including a test that the reachability guarantee
  holds even with zero correct likes).

## Architecture

```
api/                    Vercel Functions (Node runtime), server-only, has PIXABAY_API_KEY
  feed/batch.ts          GET — proxies Pixabay video search, normalizes to Post[]
  cron/                   (not yet built — daily bundle generation, see below)
  bundle/                 (not yet built — serves the daily bundle to the client)
shared/                 Isomorphic, imported by both api/ and src/
  categories.ts           the 20 fixed Pixabay video categories
  types.ts                Post, WeightState, DailyBundle, GameState, etc.
  pixabay.ts              raw Pixabay API types + fetchPixabayVideos + normalization
  weighting.ts            the category/tag weighting algorithm (pure, tested)
  pathGeneration.ts       the reachability path-generation algorithm (pure, tested)
  rng.ts                  seeded RNG (deterministic per UTC date) + weighted sampling
src/
  routes/                 TanStack Router file routes: index (splash), goal, feed
  components/feed/        FeedList (scroll container + all game-loop effects), VideoCard, LikeButton
  components/meters/      BrainrotMeter, HotColdMeter
  components/overlays/    WinOverlay (confetti), LoseOverlay
  game/gameStore.ts        zustand store — all fast-mutating game state
  lib/                     bundleSource, fillerSource, mockBundle, pixabayFiller, feedComposition, dailyKey
```

### Key design decisions

- **Pixabay key is never client-side.** `PIXABAY_API_KEY` (no `VITE_` prefix) lives only in
  `api/` function env. Reasons: Pixabay's 100 req/60s rate limit is per-key, so a client-embedded
  key would mean every player worldwide shares one budget; and Pixabay requires 24h result
  caching, which the proxy enforces via `Cache-Control` at the CDN edge. The client only ever
  talks to `/api/*`.
- **Two-tier weighting, scoped not globally clustered.** Tag weight keys are `${category}:${tag}`
  (see `shared/weighting.ts`) — a tag's "category" is just whichever Pixabay category the video
  carrying it was fetched under. Avoids building a global tag taxonomy. Category weight picks
  *which* Pixabay category to query more; tag weight (scoped inside that category) picks *which
  `q` term* to bias within it.
- **Category batch mix is a deterministic quota, not pure weighted sampling.** `pickNextBatchMix`
  guarantees `floor(weight)` slots to any category with weight `> 1` (an untouched category sits
  at exactly `1.0` forever under the decay formula below, so `> 1` cleanly means "has been liked
  at least once" — no separate flag needed). If guarantees would overflow `batchSize`, they're
  apportioned back down via the largest-remainder method (same one used for parliamentary seat
  allocation) rather than silently exceeding it; when every category's weight is equal this
  degenerates to a uniform random pick, matching what plain proportional sampling would do anyway.
  Leftover slots default to a random pick among still-untouched (weight `=== 1`) categories, so
  the batch keeps exploring by default — only once every category has been touched at least once
  does it fall back to highest-remaining-weight-first. `CATEGORY_MAX = 5` is intentionally kept
  below `FILLER_BATCH_SIZE = 10`, so no single liked category can ever fully dominate a batch by
  guarantee alone. Tag selection within a chosen category slot is unchanged (weighted pick over
  that category's tag weights). Recency-based tie-breaking was discussed but deliberately left
  unimplemented — ties currently resolve to random — pending a feel for whether ties even matter
  in practice; if added, it needs a decision between last-shown (anti-repetition) and last-liked
  (momentum) semantics, which were never resolved.
- **Skip decay is separate from layer decay, and proportional rather than linear.** `decay()`
  (existing, `DEFAULT_DECAY_FACTOR = 0.9`) still runs once per layer boundary and pulls every
  weight back toward 1. `applySkip()` (`SKIP_DECAY_FACTOR = 0.9`) is new: it fires once per
  scrolled-past-without-liking post (wired via `gameStore`'s `skipPost` action, called from
  `FeedList`'s swipe-tracking effect using the *previous* `currentPostId`, captured before the ref
  gets overwritten) and shrinks only that post's category + its category-scoped tags by 10% of
  their offset above 1 (`1 + (w-1)*0.9`, not `w*0.9` — decaying the raw weight instead of the
  offset would drift it below the 1.0 floor). Proportional rather than flat: a heavily-inflated
  category loses a lot on one skip, a barely-elevated one loses almost nothing — deliberately, so
  a single accidental skip doesn't meaningfully punish a category, but sustained disinterest in an
  oversaturated one (which the quota system above will show repeatedly once liked) corrects fast.
- **Reachability guarantee is unconditional injection, not convergence.** The daily bundle pins
  one real "linking post" per layer (`shared/pathGeneration.ts`); the client splices it into that
  layer's feed regardless of what the player has liked. The last layer's linking post *is* the
  goal. A player who never likes anything correctly still reaches the goal within N layers —
  covered by an explicit test in `shared/pathGeneration.test.ts`.
- **Feed windowing.** `FeedList` renders a full-height root `<div data-post-id>` for every post
  (so native scroll-snap geometry and the `IntersectionObserver` stay correct), but only the
  active card ± 1 (`VideoCard`'s `mounted` prop) actually mounts video/placeholder content — caps
  concurrent `<video>` elements at 3 regardless of how long the feed grows. Every mounted card
  (not just the active one) gets a real `src` + `preload="auto"` on its `<video>`, so the neighbor
  a swipe is about to land on has already been buffering — only actual playback (`.play()`) is
  gated on `isActive`. Layer loads are guarded by a synchronous `requestedLayersRef` test-and-set
  so React's dev-mode double-effect firing can't append the same layer twice (this previously
  caused a duplicate-React-key bug that looked like the feed "replaying" earlier posts).
- **Cross-layer post-id collisions are a second, distinct duplicate-key cause** (found via a live
  `VITE_FILLER_SOURCE=live` run: liking one category repeatedly narrows Pixabay's result pool for
  it, and the same post can resurface in a later layer). `fetchWeightedFillerBatch`'s internal
  dedup only ever covered a single call, so it couldn't catch this. Fixed by threading an
  `excludeIds: ReadonlySet<number>` through `FillerFetcher` — `FeedList` builds it from every post
  already in `feedPosts` plus every pinned linking post in `bundle.pathChain` (past *and* still
  upcoming, since a filler post can just as easily collide with a future pivot) before each
  layer's fetch.
- **Weighting is live from the start.** `src/lib/pixabayFiller.ts` already calls the real
  `pickNextBatchMix` algorithm (not a separate "uniform-only" placeholder) — weights start
  uniform, so behavior is uniform until the player likes something, then biases naturally.

### Data sources (mock vs live)

Two independent env-driven switches, both default to the zero-server option so `npm run dev:vite`
works standalone:

- `VITE_BUNDLE_SOURCE` — `mock` (default, hand-authored fixture in `src/lib/mockBundle.ts`) |
  `local` (reads `public/dev-bundles/<dateKey>.json`, written by
  `npm run bundle:generate` → `scripts/generate-bundle-local.ts`; see **Commands**) | `remote`
  (hits `/api/bundle/today`, backed by the daily cron + Blob persistence — see step 7 above).
- `VITE_FILLER_SOURCE` — `mock` (default, `mockFillerBatch`, colored placeholder cards) | `live`
  (`fetchWeightedFillerBatch`, real Pixabay videos through `/api/feed/batch`). `live` requires
  `/api/*` to actually be served, i.e. `VITE_FILLER_SOURCE=live npm run dev:vercel` (needs the
  project linked, see **Commands** above) or a deployment. Verified end-to-end against real
  Pixabay data: the category quota mechanism and the tag-within-category pick both confirmed
  working live (a sustained like on one category produced exactly its guaranteed slot count, with
  a live-updating weighted tag `q` param each layer).

`.env` holds `PIXABAY_API_KEY` and `BLOB_READ_WRITE_TOKEN` (gitignored). Both are required for
`VITE_BUNDLE_SOURCE=remote`/`VITE_FILLER_SOURCE=live` under `npm run dev:vercel` — see the
`vercel dev` env-loading note below.

**`vercel dev` only reads `.env`, not `.env.local`** (confirmed by testing; contradicts the
general Next.js-documented behavior). `vercel env pull .env.local` (what `vercel blob
create-store` and manual pulls write to) is invisible to this project's `api/*` functions under
`vercel dev` — only `vite`'s own frontend process reads `.env.local` (for `VITE_`-prefixed vars).
Any server-only var an `api/*` function needs locally (`PIXABAY_API_KEY`, `BLOB_READ_WRITE_TOKEN`)
must be copied into plain `.env` by hand after pulling/rotating it. `CRON_SECRET` is deliberately
**not** in `.env` — the cron endpoint treats a missing `CRON_SECRET` as "auth check skipped" (see
`api/cron/generate-daily-bundle.ts`), so local `vercel dev` calls to it are unauthenticated by
design, matching prod's fail-open-when-unconfigured behavior.

**No local Blob emulation** — `BLOB_READ_WRITE_TOKEN` in `.env` points at the real, single
`brainrot-bundles` store shared with production. `/api/bundle/today` and
`/api/cron/generate-daily-bundle` hit under `vercel dev` read/write the *same*
`bundles/<dateKey>.json` blob production serves (overwrite is idempotent — same `dateKey` just
regenerates from live Pixabay — but there's no isolated local sandbox to test against).

Also, restarting `vercel dev` (`npm run dev:vercel`) can silently bind to a stale already-running
instance's port instead of actually restarting: if a prior `vercel dev` process is still alive
(check `lsof -i :3000`), a new one prints `NOTE: Requested port 3000 is already in use` and falls
back to `:3001`, but requests to `:3001/api/*` still proxy through to the *old* process — so env
var changes (like the `.env` edit above) look like they didn't take effect until you
`pkill -f "vercel dev"` (and `pkill -f "vite --port"`) and start fresh.

## Implementation status

Following a phased build order (mock UI first, then real integrations):

1. ✅ Scaffold — Vite/Tailwind/DaisyUI/TanStack Router wired.
2. ✅ Types + mock bundle + zustand store.
3. ✅ Static UI — cards, meters, like/double-tap, scroll-snap, windowing.
4. ✅ Real Pixabay integration — `api/feed/batch.ts`, verified end-to-end against the live API via
   `vercel dev` (normalization, cache headers, category validation all confirmed working). That
   verification predated the project's first real `vercel deploy --prod` (done in step 7) and
   missed an ESM import-extension bug that only manifests in an actual deployed Function — see the
   pitfall note under step 7.
5. ✅ Weighting algorithm — wired live from the start (see above), not staged separately.
6. ✅ Reachability algorithm wired to real Pixabay data via a local generation script
   (`scripts/generate-bundle-local.ts`, run with `npm run bundle:generate`) — calls
   `generateDailyBundle` against the live API, writes `public/dev-bundles/<dateKey>.json`
   (gitignored), and `VITE_BUNDLE_SOURCE=local npm run dev:vite` serves it in place of the
   hardcoded mock goal/path chain. Verified end-to-end: real `cdn.pixabay.com` video URLs on
   every layer's linking post including the goal, fetched by the client at
   `/dev-bundles/<dateKey>.json` via Vite's static `public/` serving.
7. ✅ Daily cron — `api/cron/generate-daily-bundle.ts` generates against live Pixabay and writes
   to Vercel Blob (`api/_lib/dailyBundleStore.ts`, pathname `bundles/<dateKey>.json`,
   `addRandomSuffix: false` + `allowOverwrite: true` so reruns for the same day converge on one
   blob); `api/bundle/today.ts` serves it, self-healing by generating on demand if the cron
   hasn't produced today's bundle yet (deploy day, cron delay, prior failure) rather than erroring
   — same "reachability shouldn't depend on timing" spirit as the in-game guarantee. Cron schedule
   in `vercel.json` (`0 0 * * *`). `CRON_SECRET` is set (as a Vercel "sensitive" var — write-only,
   can't be read back via `env ls`/`env pull`; verified via a fresh secret + immediate curl at
   setup time) and checked by the cron endpoint when present. A Blob store (`brainrot-bundles`)
   is provisioned and linked; `PIXABAY_API_KEY` is set on Production + Development (not yet
   Preview — `vercel env add ... preview` needs an explicit non-`main` git branch, since `main`
   is the Production branch and there's no other branch yet). Deployed and verified live end to
   end: `/api/feed/batch` and `/api/bundle/today` both confirmed returning real Pixabay data on
   `https://brainrot-amber.vercel.app`, and the cron endpoint confirmed 401s without the secret
   and 200s (regenerating + overwriting the day's blob) with it.

   **ESM import-extension pitfall (cost real debugging time — read before touching `api/` or
   `shared/`):** every relative import in `shared/*.ts` and `api/**/*.ts` must end in an explicit
   `.js` extension (e.g. `from './categories.js'`), even though the actual file is `categories.ts`.
   `moduleResolution: "bundler"` (set in both `api/tsconfig.json` and `tsconfig.app.json`) resolves
   that `.js` specifier to the `.ts` source for type-checking, same as plain extensionless imports
   would — so omitting the extension type-checks fine and Vite (which fully bundles `src/` into
   one file) runs it fine too. But Vercel's Node function build does *not* bundle `api/`'s module
   graph into one file — it transpiles each `.ts` file to a sibling `.js` file independently
   (confirmed via `vercel build` + inspecting `.vercel/output/functions/**/*.func/`) and leaves
   import specifiers **byte-for-byte as written** (no extension rewriting, unlike a real bundler).
   At runtime, Node's native ESM loader then tries to resolve that literal specifier against the
   deployed files — so an extensionless or `.ts`-suffixed import 500s with `ERR_MODULE_NOT_FOUND`
   (`ts` extension doesn't get transpiled from `.ts`, only import specifier get copied) even though
   every local check (`typecheck:api`, `npm run build`, `vitest`) passes, because none of those
   exercise Node's real ESM resolution the way a deployed function does. `api/feed/batch.ts`
   (pre-existing, predates this fix) had this exact bug — the "verified end-to-end against the
   live API" note in step 4 below was true only for `vercel dev`, never a real deployment, which
   is why it went unnoticed until this cron work did the project's first actual `vercel deploy
   --prod`. If you add a new `api/` or `shared/` file, remember the `.js`-extension convention, and
   don't trust "typecheck + build pass" as proof a Vercel Function works — run `vercel build` and
   grep the emitted `.vercel/output/functions/**/*.func/**/*.js` for extensionless/`.ts`-suffixed
   relative imports, or just hit the deployed endpoint directly, before calling it verified.
8. ⬜ Velocity-aware brainrot decay (currently a fixed per-swipe decrement stub), Pixabay
   attribution UI (required by their ToS), mobile/responsive pass.
9. Explicitly deferred (per the brief): AI voiceovers, text overlays, background music.

## Project concept (from brief.md)

The new project ("brainrot") is a daily-challenge game that simulates a
TikTok-style short-form video feed. The player is shown a target
image/video (identified only by tags), then must scroll and "like" content
in an unrelated feed to steer a recommendation algorithm toward that target.

Key mechanics described in `brief.md`:
- **Recommendation algorithm**: content is tagged with weighted categories;
  liking a post nudges its category's weight up, biasing future batches.
  Batches are fetched in "layers" of ~10-20 posts as the user nears the end
  of the current batch.
- **Guaranteed reachability**: the target must always be reachable within a
  minimum number of layers — the brief proposes pre-computing a chained path
  of category pivots (via repeated weighted batch generation) so at least one
  post per layer links toward the goal, even if the player mis-likes.
- **Lose condition**: a "brainrot" meter starts at 100% and drains based on
  scroll velocity and irrelevant likes; hitting 0% ends the game.
- **Win condition**: a "hot/cold" proximity meter signals closeness to the
  target; swiping onto the target post auto-wins (no like required), and
  triggers a confetti celebration.
- **Screens**: splash/loading -> goal preview -> scrolling feed -> goal found
  (confetti overlay on the feed). The player cannot swipe back past the
  original goal-preview image once scrolling starts.

Intended tech stack per the brief: Vite + React, Tabler Icons, DaisyUI/Tailwind
for UI, TanStack for data fetching/routing, canvas-confetti (or similar) for
the win celebration, and the Pixabay API as a possible video/image source. No
backend is planned initially — client-side caching only. (In practice, a thin
server-only proxy in `api/` turned out to be necessary — see **Key design
decisions** above — but there's still no persistent backend/database.)

See `brief.md` for the full, unabridged design notes (algorithm details, UI
layout, technical challenges around guaranteeing a reachable path).
