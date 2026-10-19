# Pantry Inventory: Implementation Plan

Status as of 2026-10-15. Builds on `docs/feasibility-findings.md` (what we tested) and `docs/project-direction-plan.md` (why the app works the way it does). The pantry is kept up to date by its users: any signed-in UTA user photographs an item and sets how much is left. There are no exact counts and no special roles.

## 1. Decisions already made

| Area | Decision |
|---|---|
| Identification | AI-first. Barcodes are out of the main flow. |
| Item matching | Gemini-first. Gemini reads the label; the name is compared word by word with existing item names (typo-tolerant, numbers and varieties must agree). No photo embeddings in intake: same-brand look-alikes scored as high as the same item (findings 3.4d), while name matching had 0 wrong merges in 23 scans (3.4e). |
| Categories | One fixed list. Each item has 1 to 3 categories, primary first, assigned once at creation and stored. Never a new category. |
| LLM fallback chain | `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`, then `gemma-4-31b-it`, then manual entry (see findings 3.1c for retry rules). |
| Surfaces | One app: the public catalog at `/`, and the pages for signed-in users (`/capture`, `/queue`, `/review/:jobId`). One backend (Supabase). |
| Accounts | Anyone with a `@uta.edu` or `@mavs.uta.edu` address can register with a password. Everyone who is signed in has the same abilities. |
| Availability | Three statuses per item: in stock, low stock, out of stock. No quantities anywhere. The catalog shows who updated an item and when, and warns after a week. |
| Adding vs updating stock | **Add item** (`/capture`): a close-up of one product. New product, new card; a product already in the catalog is marked in stock. **Update stock** (`/shelf`): a photo of a whole shelf, read in the background into a list the student verifies (boxes on the photo; matched, possible matches, not recognised) before anything changes. A photo only ever sets **in stock**. **Low** and **Out** need no photo: tap the item in the catalog and mark it. |
| No deletes | Nobody deletes items. Marking an item "out of stock" is how it comes off the shelf. |
| Security | Enforced in the database (row-level security), never by hiding UI. |
| Demo | Live, two presenters, partly pre-seeded data. |

## 2. Open decisions

1. **"Waiting for quota" vs red dot** (decided): a neutral "waiting" state for quota waits, red only for real failures. Users can type the item in at any time either way.
2. **What counts as "the same item"** (decided, implemented in `shared/normalizeName.ts`): brand + product + variety, not size. Barilla Spaghetti 32 oz and 16 oz are one item; Barilla Whole Grain Thin Spaghetti is another. Package sizes are dropped before comparing; other numbers (365, 2%, 500 mg) are kept.
3. **Per-item limits and categories** (in person at UTA). Which items have limits, and the category list the pantry actually uses.
4. **Moderation.** Any registered user can add items, so a content filter runs on every photo (`shared/guardrail.ts`) and items in the `other` category stay off the public catalog until a moderation layer exists.

## 3. Architecture

```
Phone (PWA)                      Vercel                      Supabase
-----------                      ------                      --------
/capture  --upload-->            Storage (photos)
   queue (IndexedDB)   ---------> intake_jobs row (queued, with the chosen status)
                       POST /api/identify {jobId}
                                 1. Gemini chain          --> api_usage (quota counters)
                                 2. match name to items   --> items (word-by-word, shared/decideMatch)
                                 3. write result + dot    --> intake_jobs, items.status
/queue    <--Realtime-- job status changes
/ (everyone)  --read public view--> available_items
```

- **Frontend:** Vite + React + TypeScript, TanStack Router and Query, Zustand for the capture queue, Tailwind 4 + daisyUI.
- **Server code:** Vercel functions in `api/`. They keep the Gemini key and the Supabase service key off the client. The client triggers one function call per job rather than one long call for a whole batch.
- **Queue and retries:** a scheduled sweep retries jobs that were waiting on quota after the daily reset (`api/sweep.ts`).
- **Photos:** resized on the phone before upload (about 1568 px longest side), with a smaller thumbnail for the public catalog. Full-size photos are stored under the uploader's user id in a private bucket.
- **Offline tolerance:** captures are saved on the phone first and uploaded in the background, so weak Wi-Fi loses nothing.

### 3.1 Data model

- `items`: id, name, brand, size (nullable, unverified), categories (1 to 3 values from the fixed list in `shared/categories.ts`, primary first), subcategory, thumbnail_path, limit_per_visit (nullable), `status` (`in_stock`, `low`, `out`), status_updated_at, status_updated_by, created_by, created_at.
- `item_status_log`: item_id, status, user_id, created_at. One row per update, written only by database functions.
- `profiles`: user_id, display_name. Shown next to the items a user updates.
- `item_images`: id, item_id, storage_path, source (`user_confirmed` or `seed`), created_at. Photos kept for display and review only.
- `intake_jobs`: id, batch_id, photo_path, `availability` (the status the user chose), status (`queued`, `processing`, `green`, `yellow`, `red`, `waiting_quota`, `rejected`), item_id, candidates (json), identified (json), model_used, attempts, error, reject_reason, created_by.
- `api_usage`: model, day, count. Used to skip a tier before it returns a 429.
- **Public view `available_items`:** id, name, category, thumbnail, availability, limit_per_visit, updated_at, updated_by_name.

### 3.2 Access rules (RLS)

| Who | Can do |
|---|---|
| Anyone | Read `available_items` and the category list. |
| Signed-in UTA user | Read `items`. Create their own intake jobs (always starting `queued`) and read them. Upload photos to their own folder. Call `set_item_status`, `resolve_job_existing`, `resolve_job_new`, `confirm_job` (each works on the caller's own jobs only). |
| Nobody (client) | Write `items` directly, delete anything, or touch another user's jobs. Every change to an item goes through the functions above. |

`/api/identify` checks the caller's token and UTA email, and only runs the caller's own jobs.

### 3.3 Presence gate (`20261015020000_pantry_gate.sql`)

Nobody at the pantry operates this app, so the app itself keeps people from updating it when they are not there. No location services and no staff step:

- **Hours** come from the `pantry_hours` table (Tue and Wed 9-3, Thu 11-5, closed otherwise, in `America/Chicago`). They are checked first.
- **Check-in** is scanning the QR code posted at the pantry (`/checkin?code=...`). It records one row per student per calendar month, matching the pantry's one visit a month. A scan while the pantry is closed, or with under 15 minutes left, is refused and does not use up the month. Scanning again inside the 30 minutes (dead phone, another phone) returns the same check-in; after that it says the month is used.
- **What is gated:** creating an intake job (a photo upload) and `set_item_status`. Both need the pantry open and a check-in less than 30 minutes old, so a check-in never outlives closing time. Jobs are gated when created; the API finishing them later is not.
- **Testing:** `pantry_settings.gates_enabled` starts `false`, so development and testing stay open. Set it to `true` on the production project. Accounts listed in `pantry_gate_exempt` skip the gate for testing while it is on. There is no staff or admin account; resetting a visit or rotating the QR code is a SQL statement.
- Full design, operating queries and known gaps: `docs/presence-gate.md`.
- **Known limit:** a photo of the QR code works for whoever scans it during open hours, but it uses up that person's own visit for the month. We accept that; this is a crowdsourced app.
- The hours and durations also live in `shared/pantryGate.ts` for the UI messages. Keep the two in sync.

## 4. Matching logic (the core of the product)

Gemini-first. The photo is the source of truth shown to everyone; the name Gemini reads from the label decides which item it is. Tested in findings 3.4e (0 wrong merges in 23 later scans, 5 sent to review).

Per photo, on the server:

1. **Call the Gemini chain** (honoring quota counters and retry rules from the findings). The result is name (brand + product + variety, no size), brand, size (unverified), 1 to 3 categories from the fixed list (primary first), confidence. Save which model answered. The content guardrail can reject the photo here.
2. **Match the name** with `decideMatch(name, catalog)` in `shared/`:
   - Normalize both names: lowercase, strip accents and punctuation, drop filler words, singularize, drop package sizes, keep other numbers.
   - Pair words one by one. Typos are tolerated inside a word (none for 4 letters or fewer, 1 edit for 5 to 7, 2 for 8 or more). A different, extra or missing word is not a match.
   - **Green:** every word pairs up, numbers match, and exactly one existing item qualifies. The item's status is updated to what the user chose. No new item.
   - **Yellow:** a candidate exists but something differs: one name only adds words (a dropped "Salted"), numbers differ, or one word differs on each side (Beef vs Chicken, or a misread brand). The user sees the candidates and taps "Update this item" on the right one, or creates a new item. Default to "new item" for a `one_word_off` sibling.
   - **New item:** no candidate. Create it with the returned categories and the chosen status. Show it yellow once so the user can check the details.
3. **All tiers failed** after retries: **red**. The photo and status are already saved, so the user types the details. If every tier is out of quota, show a neutral "waiting" state and retry after the daily reset.
4. **The user confirms** a yellow item. Confirmed results save the photo and, for a new item, any edits to its name and categories.

The review screen also re-runs the match on whatever name the user types, so a manual entry that duplicates an existing item is offered as an update instead.

Never auto-resolve on a partial match. The cost of a wrong yellow is a tap; the cost of a wrong green is a wrong status on the wrong item. Identity is brand + product + variety, not size.

**Why not photo embeddings** (findings 3.4b to 3.4d): same-brand look-alikes scored as high as the same item, and a safe threshold resolved almost nothing. Name embeddings were rejected for the same reason ("beef" and "chicken" sit close together); word-by-word comparison is simpler, offline and unit-testable.

**Known limits:** brand and word misreads on small print still occur and cost a yellow; names from the fallback models (`gemini-3.1-flash-lite`, `gemma`) may be worded differently and were not tested; sizes are unreliable and not used. Two scans of the same new product finishing within milliseconds of each other can both create the item.

## 5. Status

- **Foundation, intake and matching: built.** Capture with a stock-level picker (in stock / low / out), IndexedDB upload queue, `/api/identify` with the model chain and quota counters, name matching, review screen, and the daily sweep.
- **Public catalog: built.** Search, category filter, hide-out-of-stock, who updated an item and when, and a stale warning after a week. Tapping an item opens a detail view where a signed-in user can mark it low or out of stock. There is no bulk edit mode.
- **Accounts: built.** Registration limited to UTA email addresses, enforced in the database.
- **Guardrail: built.** Unsafe or off-topic photos are rejected with a reason and never create an item.
- **Open-access change: this migration** (`20261015000000_remove_staff.sql`). Removes the staff allowlist and the stock ledger, replaces quantities with statuses on intake, and opens writes to every signed-in UTA user through database functions. Run `npm run rls-test` and `npm run intake-e2e` against a dev project after applying it.

- **Presence gate: written, not yet applied or tested.** Hours plus a monthly QR check-in guard uploads and status updates (section 3.3). Apply it to a dev project, test with a non-admin student account, then set `gates_enabled` to `true` in production.

### Next

- Seed data: 30-50 realistic items with reference images so the catalog is not empty, plus a few items deliberately left out for the "new item" moment.
- Demo script (under 2 minutes): (1) a user scans a new item (API path, slower), (2) scans it again and marks it low (resolves to the same item, no duplicate, shown green), (3) a second phone shows the catalog change.
- Failure drills: bad photo, duplicate scan, forced red dot, quota exhaustion, offline phone. Know the on-stage fallback for each (manual entry, pre-seeded item).
- Install as a PWA on both presenter phones, and test on the venue network if possible.
- Privacy pass: photo retention, no faces, check the school's policy (FERPA risk noted in the findings).
- A moderation layer so `other`-category items can appear publicly.
- Handover: who maintains this after you graduate.

## 6. Suggested repo layout

```
api/                 Vercel functions (identify, retry sweep)
shared/              Pure logic used by api and app: categories, schemas,
                     normalizeName, decideMatch, guardrail, catalog view, types
src/                 App: routes (/, /login, /checkin, /capture, /queue, /review/:jobId), components, hooks, stores
supabase/migrations/ Schema, RLS, views, functions
scripts/             Experiments and checks (identify, match-test, rls-test, intake-e2e)
docs/                Findings, this plan, experiment results
```

Put the matching decisions (`normalizeName`, `decideMatch`) in `shared/` as pure functions so they can be unit-tested without Supabase or Gemini.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Look-alike products wrongly merged | **Observed with photo embeddings** (findings 3.4d), so they are out of intake. Name matching never auto-merges a sibling (0 of 23). Only an exact word-by-word match is green; anything else is yellow |
| Gemini misreads small print or words names differently across models | Typo tolerance inside words, yellow with candidates otherwise, `model_used` stored, the user confirms. Fallback-model naming is untested |
| Gemini free-tier quota or 503s during the demo | Fallback chain, quota counters, pre-seeded items, manual entry |
| Anyone with a UTA address can change an item's status, wrongly or as a prank | Every update is logged with who and when (`item_status_log`), the catalog shows the updater's name, and statuses go stale after a week |
| Inappropriate photos | Content guardrail on every photo; rejected photos never create items and are removed from the public bucket |
| No UTA approval | Demo is built to be showable in person; nothing here depends on their systems |
| Statuses drift from reality | Freshness stamp on every item; a regular visit to re-check shelves |
| Single maintainer | Keep stack small, document setup, own accounts under a shared team email |

- **Shelf scan: written, not yet applied or tested** (`20261016000000_shelf_scans.sql`, `api/shelf.ts`, `shared/shelfScan.ts`, `src/features/shelf/`). `confirm_shelf_scan` goes through `set_item_status`, so the two-student verification, cooldown and presence gate apply per item. Apply the migration, then try a real shelf photo; the prompt and box handling are untested against Gemini. Shelf uploads are not saved to the phone first (unlike single-item captures), so a dropped connection loses that photo.
