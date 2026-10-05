# Pantry Inventory: Implementation Plan

Status as of 2026-10-05. Builds on `docs/feasibility-findings.md` (what we tested) and the design decisions made since. The goal is a convincing, low-friction demo to show the UTA pantry manager, then a path to something they could actually run.

## 1. Decisions already made

| Area | Decision |
|---|---|
| Identification | AI-first. Barcodes are out of the main flow. |
| Item matching | Gemini-first. Gemini reads the label; the name is compared word by word with existing item names (typo-tolerant, numbers and varieties must agree). No photo embeddings in intake: same-brand look-alikes scored as high as the same item (findings 3.4d), while name matching had 0 wrong merges in 23 scans (3.4e). |
| Categories | One fixed list. Each item has 1 to 3 categories, primary first, assigned once at creation and stored. Never a new category. |
| LLM fallback chain | `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`, then `gemma-4-31b-it`, then manual entry (see findings 3.1c for retry rules). |
| Surfaces | One app, two areas: public student pages, and `/staff` behind login. One backend (Supabase). |
| Security | Enforced in the database (row-level security), never by hiding UI. |
| Staff access | Invite-only allowlist, managed by the pantry manager. |
| Student view | In stock / out of stock (optionally "low"), no exact counts. Self-checkout by tapping an item and choosing a quantity. Honor system, no student identity. |
| Worker checkout | Not required. Students check themselves out (QR at the exit). Optional photo or search checkout for workers later. |
| Stock accuracy | Weekly stock check (post-demo) using the same Gemini-first identification and name match. |
| Demo | Live, two presenters, partly pre-seeded data. |

## 2. Open decisions (need an answer before or during the phase noted)

1. **Where embeddings run** (MOOT for intake, since photo embeddings were dropped; if revived later: in the browser, q8 on WASM, about 200ms per photo on an iPhone; see findings 3.4c). Original question: In the browser (transformers.js, no server, but a roughly 50-90 MB first download per phone), or on a server (needs a host that can fit the model runtime; Vercel's function size limits may be a problem, so verify). Default plan: try the browser first.
2. **What gets embedded** (RESOLVED: nothing in intake). Photo embeddings cannot separate same-brand look-alikes reliably (findings 3.4d), so they are out of the intake path. They may return for the weekly stock check or checkout, which are post-demo.
2b. **What counts as "the same item"** (DECIDED, implemented in `shared/normalizeName.ts`): brand + product + variety, not size. Barilla Spaghetti 32 oz and 16 oz are one item; Barilla Whole Grain Thin Spaghetti is another. Package sizes are dropped before comparing; other numbers (365, 2%, 500 mg) are kept.
3. **"Waiting for quota" vs red dot** (Phase 3). Findings say that if every model tier is out of quota, the job should wait for the daily reset. Your wireframe says red means failed. Proposal: show a neutral "waiting" state for quota waits, and red only for real failures. Workers can type the item in at any time either way.
4. **Per-item limits and categories** (in person at UTA). Which items have limits, and the category list the pantry actually uses.
5. **Student abuse guard.** Anonymous writes to stock are the one deliberate hole. Proposal: a server-side function caps each checkout at current stock and the item's limit, and everything is in an append-only ledger so the manager can undo. Add basic rate limiting if cheap.

## 3. Architecture

```
Phone (PWA)                      Vercel                      Supabase
-----------                      ------                      --------
/staff capture  --upload-->      Storage (photos)
   queue (IndexedDB)   ---------> intake_jobs row (queued)
                       POST /api/identify {jobId}
                                 1. Gemini chain          --> api_usage (quota counters)
                                 2. match name to items   --> items (word-by-word, shared/decideMatch)
                                 3. write result + dot    --> intake_jobs
/staff queue screen  <--Realtime-- job status changes
/ (students)  --read public view--> items availability
              --rpc checkout_item-> inventory_events (ledger)
```

- **Frontend:** Vite + React + TypeScript, TanStack Router and Query, Zustand for the capture queue, Tailwind 4 + daisyUI. This is the stack the repo had before (recoverable from git history), so the setup is familiar.
- **Server code:** Vercel functions in `api/`. They keep the Gemini key and the Supabase service key off the client. Check current function duration limits for the plan you are on; Gemini latency varied from 1 to 100 seconds, so the client should trigger one function call per job rather than one long call for a whole batch.
- **Queue and retries:** the client triggers `/api/identify` per job. A scheduled sweep retries jobs that were waiting on quota after the daily reset. Hobby-plan cron is limited to daily runs, which matches the quota reset; confirm the current limits.
- **Photos:** resize on the phone before upload (the identify script already shows the target: about 1568 px longest side) and save a smaller thumbnail for the student pages.
- **Offline tolerance:** captures are saved on the phone first and uploaded in the background, so weak Wi-Fi loses nothing.

### 3.1 Data model

- `items`: id, name, brand, size (nullable, unverified), categories (1 to 3 values from the fixed list in `shared/categories.ts`, primary first), subcategory, thumbnail_path, limit_per_visit (nullable), created_at. Categories are assigned once per item and stored, so they stay consistent; workers can edit them. Name matching runs in `shared/` code; if the catalog grows large, a pg_trgm index can shortlist candidates before the word-by-word comparison.
- `item_images`: id, item_id, storage_path, source (`worker_confirmed` or `seed`), created_at. Photos kept for display and review only (no embeddings in the demo). Add a vector column later only if embedding-based checkout is revived.
- `inventory_events`: append-only ledger. id, item_id, type (`intake`, `checkout`, `adjustment`), delta, actor (staff user or null for students), job_id, created_at. Current stock is a view that sums deltas.
- `intake_jobs`: id, batch_id, photo_path, quantity, status (`queued`, `processing`, `green`, `yellow`, `red`, `waiting_quota`), item_id, candidates (json), model_used (kept, because different models word names differently), attempts, error, created_by.
- `api_usage`: model, day, count. Used to skip a tier before it returns a 429.
- `staff`: user id, email, role (`worker`, `manager`).
- **Public view `available_items`:** id, name, category, thumbnail, availability (`in_stock`, `low`, `out`), limit_per_visit. No counts.

### 3.2 Access rules (RLS)

| Who | Can do |
|---|---|
| Anyone | Read `available_items`. Call `checkout_item(item_id, qty)`. |
| Staff | Read everything. Create jobs. Insert `intake` and `adjustment` events. Edit items. Delete items they created. |
| Manager | All of the above, plus edit the `staff` table. |
| Nobody | Direct writes to `inventory_events` from the client, except through the functions above. |

`checkout_item` is a database function that checks quantity against stock and limit, and writes one ledger row. Stock changes only through events, so every number can be explained and any bad checkout can be reversed.

## 4. Matching logic (the core of the product)

Gemini-first. The photo is the source of truth shown to students; the name Gemini reads from the label decides which item it is. Tested in findings 3.4e (0 wrong merges in 23 later scans, 5 sent to review).

Per photo, on the server:

1. **Call the Gemini chain** (honoring quota counters and retry rules from the findings). The result is name (brand + product + variety, no size), brand, size (unverified), 1 to 3 categories from the fixed list (primary first), confidence. Save which model answered.
2. **Match the name** with `decideMatch(name, catalog)` in `shared/`:
   - Normalize both names: lowercase, strip accents and punctuation, drop filler words, singularize, drop package sizes, keep other numbers.
   - Pair words one by one. Typos are tolerated inside a word (none for 4 letters or fewer, 1 edit for 5 to 7, 2 for 8 or more). A different, extra or missing word is not a match.
   - **Green:** every word pairs up, numbers match, and exactly one existing item qualifies. Resolve to it.
   - **Yellow:** a candidate exists but something differs: one name only adds words (a dropped "Salted"), numbers differ, or one word differs on each side (Beef vs Chicken, or a misread brand). Show candidates with how they relate. Default to "new item" for a `one_word_off` sibling.
   - **New item:** no candidate. Create it with the returned categories. Show it yellow once so a worker eyeballs it.
3. **All tiers failed** after retries: **red**. The photo and quantity are already saved, so the worker types the details. If every tier is out of quota, show a neutral "waiting" state and retry after the daily reset.
4. **The worker confirms** at the end of a batch. Confirmed results save the photo and, for a new item, its categories. An override of a match or a category is saved.

Never auto-resolve on a partial match. The cost of a wrong yellow is a tap; the cost of a wrong green is wrong stock. Identity is brand + product + variety, not size.

**Why not photo embeddings** (findings 3.4b to 3.4d): same-brand look-alikes scored as high as the same item, and a safe threshold resolved almost nothing. Name embeddings were rejected for the same reason ("beef" and "chicken" sit close together); word-by-word comparison is simpler, offline and unit-testable.

**Known limits:** brand and word misreads on small print still occur and cost a yellow; names from the fallback models (`gemini-3.1-flash-lite`, `gemma`) may be worded differently and were not tested; sizes are unreliable and not used.

## 5. Phases

Time estimates are rough, for two people part-time.

### Phase 0: Spikes (DONE 2026-10-05)

1. **Embedding runtime:** passes. CLIP q8 on WASM ran at about 200ms per photo on an iPhone over HTTPS, with 30 in a row stable (findings 3.4c). Not needed for intake any more.
2. **Look-alike embedding test:** failed as a first pass (findings 3.4d). Siblings score as high as the same item.
3. **Gemini-first name matching:** passes (findings 3.4e). 0 wrong merges, 5 of 23 later scans to review.

*Result:* the intake path is Gemini-first with word-by-word name matching, and photo embeddings are dropped from the demo.
*Remaining, optional:* compare names across the fallback model tiers (`gemini-3.1-flash-lite`, `gemma-4-31b-it`).

### Phase 1: Foundation (about 2 days)

- Remove or commit the old app deletions (the working tree still shows the previous app as deleted) and delete the leftover cron in the old `vercel.json`, which pointed at a job that no longer exists.
- Scaffold Vite + React + TS + Router + Tailwind + daisyUI. Keep `scripts/` as is.
- New Supabase project: enable `vector` and `pg_trgm`. Write the schema, views, functions, and RLS as migrations in `supabase/migrations/`. Seed the category list.
- Auth: magic-link login restricted to emails in `staff`. No public signup.
- Vercel: there is no `.vercel` folder locally, so link the project and confirm which Vercel project it deploys to. Add env vars (Supabase URL and keys, Gemini key) in Vercel and a local `.env`; `.env` is already gitignored.
- **RLS tests:** a script that runs as anonymous, as a worker, and as the manager, and checks that each blocked action is blocked. This is the guarantee behind the security claim, so test it first.

### Phase 2: Intake vertical slice (about 4 days)

Build the whole path once with the Gemini chain only. Name matching and review come in Phase 3, so until then every result creates a new item.

- Capture screen: camera view with a framing guide so the item fills the frame, capture button, quantity stepper, Confirm / Retake (as in the wireframe). Repeat-item shortcut ("same as last").
- Local queue (IndexedDB) and background upload.
- `/api/identify`: model chain, retries, quota counters, structured output validated with zod (reuse the schema from `identify.ts`, drop the bounding box since photos are single-item).
- Queue screen with live status dots through Realtime.
- Resolution writes the `intake` event and makes the item appear.

*Exit criteria:* photograph 10 items, see them appear in order with dots, no manual steps except quantity.

### Phase 3: Matching and review (about 3 days)

- Wire `shared/decideMatch.ts` into `/api/identify`: match the Gemini name against existing items, write green, yellow or new.
- A pg_trgm shortlist only if the catalog gets large (the word-by-word comparison is cheap for a few hundred items).
- Yellow review screen (candidates as tap targets, default "new item" for `one_word_off` siblings, edit fields and categories) and red manual-entry screen, both reusing the item detail page.
- Category picker: the fixed list, 1 to 3 values, primary first.
- Quota-wait state and the retry sweep.
- Unit tests for the model-chain fallback behavior (fake the Gemini client). Matching tests already exist in `shared/decideMatch.test.ts`; add cases from real misses as they appear.

*Exit criteria:* scanning the same item twice resolves to one item with no duplicate; "Ritz Cracker" and "Ritz Crackers" resolve to one item; a sibling variety never resolves green.

### Phase 4: Inventory management (about 3 days)

- Update screen: list of all items with search, sort, filter by category and availability.
- Quick actions per row (adjust, mark out of stock), full edit on the detail page, delete.
- Adjustments always go through the ledger.

### Phase 5: Student side (about 3 days)

- Public pages: search, category filter, item cards with photo and availability, "limit N per person" badge.
- Self-checkout: tap item, quantity, confirm, then `checkout_item`.
- QR code page for the exit sign.
- Mobile-first, fast load, no login.

### Phase 6: Demo hardening (about 3 days)

- **Seed data:** 30-50 realistic items with reference images so the catalog is not empty, plus a few items deliberately left out for the "new item" moment.
- **Demo script (under 2 minutes):** (1) worker scans a new item (API path, slower), (2) scans it again (resolves to the same item, no duplicate, shown green), (3) a student phone shows it appear, (4) student checks one out, (5) dashboard updates live.
- **Failure drills:** bad photo, duplicate scan, forced red dot, quota exhaustion, offline phone. Know the on-stage fallback for each (manual entry, pre-seeded item).
- **Install as a PWA** on both presenter phones, and test on the venue network if possible.
- Time an inventory run (for example, 20 items in N minutes) to quote to the manager.

### After the demo (only if approved)

- Weekly stock check flow (scan, show system count, enter actual, save the difference as an adjustment).
- Worker photo/search checkout.
- Manager screen for the staff allowlist.
- Privacy pass: photo retention, no faces, check the school's policy (FERPA risk noted in the findings).
- Barcode scan as an optional accelerator, using the plan in the findings.
- Handover: who maintains this after you graduate.

## 6. Suggested repo layout

```
api/                 Vercel functions (identify, retry sweep)
shared/              Pure logic used by api and app: categories, schemas,
                     normalizeName, decideMatch (threshold logic), types
src/                 App: routes (/, /staff/*), components, hooks, stores
supabase/migrations/ Schema, RLS, views, functions
scripts/             Experiments (identify, match-test, new RLS test)
docs/                Findings, this plan, experiment results
```

Put the matching decisions (`normalizeName`, `decideMatch`) in `shared/` as pure functions so they can be unit-tested without Supabase or Gemini.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Look-alike products wrongly merged | **Observed with photo embeddings** (findings 3.4d), so they are out of intake. Name matching never auto-merges a sibling (0 of 23). Only an exact word-by-word match is green; anything else is yellow |
| Gemini misreads small print or words names differently across models | Typo tolerance inside words, yellow with candidates otherwise, `model_used` stored, worker confirms. Fallback-model naming is untested |
| Gemini free-tier quota or 503s during the demo | Fallback chain, quota counters, pre-seeded items, manual entry |
| Heavy in-browser model on phones | Phase 0 device test; server fallback |
| Anonymous checkout abused | Server-side caps, ledger, manager can reverse; honor system accepted |
| No UTA approval | Demo is built to be showable to workers in person; nothing here depends on their systems |
| Drift in counts | Weekly stock check (post-demo), adjustments recorded in the ledger |
| Single maintainer | Keep stack small, document setup, own accounts under a shared team email |

## 8. First three actions

1. Clean the old app out of the working tree (Phase 1) and commit the new `shared/`, `scripts/`, `spikes/` and `docs/`.
2. Create the Supabase project and write the schema and RLS migrations with the access tests.
3. Scaffold the new frontend and start the intake slice (Phase 2).
