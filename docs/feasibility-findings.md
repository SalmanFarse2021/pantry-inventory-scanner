# School Pantry Inventory: Feasibility Findings

Status as of 2026-10-05. Based on a small prototype, two shelf test photos, and a 10-photo single-item test (section 3.1b), so treat all results as early signals, not measured accuracy.

## 1. Goal and constraints

**Goal:** a phone-based inventory system for a school pantry. Staff log items as they arrive; the system identifies and categorizes them; checkout updates the inventory. The pantry has no existing item list and stock changes constantly, so the main purpose is a current, browsable list of what is available (to help students plan appointments).

**Constraints that shaped the findings:**
- Logging every item must be low-effort for staff, or the system won't be adopted.
- Staff handle counting and verification of quantities. The system only needs to identify and categorize.
- Hidden or occluded items are accepted as a known limit; the worker handles them.
- No paid services for now. Limited storage (no room for a 13 GB dataset).
- Identification will sometimes be wrong; a worker confirmation step is expected.

## 2. What was tested

All code is in `scripts/`; see section 7.

| Test | Result |
|---|---|
| Vision LLM identifies products in a photo | Works well on names and brands |
| Vision LLM returns bounding boxes, used to crop each item | Works on spaced-out items; weak on overlapping ones |
| Embedding model matches an item across photos (checkout idea) | 4/4 correct, with clear score gaps |

Test photos: one 11-item shelf (cluttered background, some items overlapping) and one 4-item close-up on a plain surface. Several items appear in both.

## 3. Findings

### 3.1 Identification by vision LLM (Gemini)

- **Names and brands:** all 11 products in the cluttered photo and all 4 in the close-up were found, and background clutter was ignored. Category assignment was sensible, including supplements and personal-care items.
- **Fewer items per photo is clearly better.** The 4-item photo was fully correct on every model tried; the 11-item photo had more small-text errors.
- **Sizes are unreliable when the label is small.** In the 11-item photo, the vitamin bottle came back as "60 capsules" (it is 180 softgels) and the furikake as 5.29 oz (label says 0.79 oz). The model marked these as high confidence. The prompt now says to leave size empty unless clearly legible, but size should be treated as unverified.
- **Confidence flags are not trustworthy** yet; wrong details were still marked high confidence.
- **Category consistency:** the same item landed in different categories across photos (furikake: `other` vs `condiments_sauces_spices`). Fix by categorizing each product once and saving the result (section 4).
- **Model notes:** `gemini-2.5-flash` and `gemini-3.5-flash` ran reliably. `gemini-3.7-flash` and `gemini-3.8-flash` frequently returned 503 "high demand" errors during testing. Latency ranged from about 4 to 100 seconds per photo (retries included), so speed is not predictable. Cost was not measured for Gemini.

### 3.1b Single-item photo test (2026-10-05)

Staff-style capture: one item per photo, held in hand, 10 photos of mixed pantry, supplement, personal-care and household items. Run with `npm run identify` on `gemini-3.5-flash`, one photo per request, sequentially. Results were checked against a manual read of the same photos (no ground-truth sheet).

| Item (Gemini's name) | Size returned | Category returned | Verdict |
|---|---|---|---|
| Barilla Spaghetti | 1 LB (454 g) | pasta_grains_rice | Correct |
| Central Market All-Natural Crunchy Peanut Butter | 18 OZ | condiments_sauces_spices | Name correct, "Salted" dropped. Size is an inference (label edge-cut at "1 LB 2 OZ"), not read. |
| Starbucks Classic Hot Cocoa Mix | 30 OZ (850 g) | beverages | Correct |
| Zab's Datil Pepper Hot Honey | 12 OZ | condiments_sauces_spices | Correct |
| House Foods Shichimi Togarashi | 0.63 OZ (18g) | condiments_sauces_spices | Correct |
| 365 Whole Foods Market Organic Chicken Broth Low Sodium | 32 FL OZ | soup_broth | Correct |
| Nutricost Niacinamide Vitamin B3 | 240 CAPSULES | supplements | Name correct, "500 mg" dropped |
| Kimono Mom's Umami Furikake | 0.79 OZ (22.5 g) | condiments_sauces_spices | Correct, including a partly covered brand. Pack is 5 packets; count not captured. |
| Gold Bond Healing Hydrating Cream Aloe | 5.5 oz | personal_care | Correct |
| Angel Soft Bathroom Tissue | 6 Mega Rolls | household | Correct |

- **10/10 correct on item name and category sensibility.** Misses were detail only: variety/strength dropped (Salted, 500 mg) and one size inferred rather than read. Non-food items worked as well as food.
- Every item was marked `high` confidence, including the two with detail issues, so the confidence field still does not separate good from questionable answers.
- **Latency:** 13.7s to 77.6s per photo (about 5 minutes for 10, sequential). Only about 1,700-1,900 total tokens per call, so the time is unlikely to be the work itself; likely server load, plus our own serial loop. Retries are included in the timer but are not logged, so this is not yet confirmed.
- **Decision from this test:** the staff photo is the source of truth and is shown on the website, so small label mismatches are acceptable as long as name and category are right. Categories may need refining (peanut butter and hot cocoa landed in debatable buckets). Latency is not a concern because processing will be queued and does not need to be instant.
- **Not tested yet:** several photos in one API request (this run was one photo per request, sequential, not concurrent), look-alike or flavor-variant items, harder photos (glare, partial labels, produce).

### 3.1c Free-tier quotas and model comparison (2026-10-05)

**Quota finding:** the Gemini free tier is limited per model per project, and `gemini-3.5-flash` allows only **20 requests/day** (hit after about 23 requests, including the earlier shelf tests and retries). Limits seen in AI Studio (ai.dev/rate-limit) for this project:

| Model | RPM | TPM | RPD |
|---|---|---|---|
| gemini-3.5-flash / 3.6 / 3.7 / 3.8 / 2.5-flash | 5 | 250K | 20 |
| gemini-3.5-flash-lite, gemini-3.1-flash-lite | 15 | 250K | 500 |
| gemma-4-26b, gemma-4-31b | 30 | 16K | 14,400 |

**Same 10 single-item photos, one photo per request, sequential:**

| Model | Calls OK | Time for 10 | Notes |
|---|---|---|---|
| gemini-3.5-flash | 10/10 | about 5 min (14-78s each) | Baseline. |
| gemini-3.5-flash-lite | 10/10 | **20s** (about 1.3s each) | All names/categories correct. Dropped "Datil Pepper" on the honey. |
| gemini-3.1-flash-lite | 10/10 | 67s (one call took 40s) | All names/categories correct. Peanut butter size read as "16 OZ (1 LB 2 OZ) 454g", which is inconsistent. |
| gemma-4-31b-it | 4/10 | 6 min | 5 calls failed with server 500, 1 returned invalid JSON. The 4 successes were correct. |

- Both flash-lite models matched the baseline on name and category for all 10 items, and were far faster. The earlier slowness was specific to `gemini-3.5-flash`, not inherent to the task.
- All models dropped "Salted" (peanut butter) and "500 mg" (niacinamide), and flash-lite shortened "Kimono Mom's" to "Kimono Mom". Accepted, since the staff photo is the source of truth.
- **Gemma second pass** (`gemma-4-31b-it`, 1 photo per request, one retry allowed on a bad answer): 8/10 identified correctly. Three of those needed a second attempt. Two photos still failed after two attempts (photo 4: two server 500s, which also failed in the first pass, so probably specific to that image; photo 9: invalid JSON, then a 500). The invalid JSON was valid JSON followed by extra text, so a more tolerant parser might avoid some retries. Gemma is slower (3-65s per call) and less reliable than flash-lite, but has a much larger quota (14,400/day).
- **Decided plan (fallback chain), per photo:**
  1. `gemini-3.5-flash-lite` (500/day)
  2. `gemini-3.1-flash-lite` (separate 500/day bucket)
  3. `gemma-4-31b-it` (14,400/day)
  4. Manual entry by the user; the photo and quantity are already saved, so nothing is lost.
  Retry rules: a bad answer (invalid JSON, schema mismatch, server 500) gets one retry on the same model, then moves to the next tier. A 429 moves to the next tier immediately, without retrying. If every tier is out of quota, queue and retry after the daily reset instead of sending the item straight to manual entry. Speed is not a concern.
- Open detail: different models may name or categorize the same item differently, so store which model produced each result.
- **Not yet tested:** several photos in one request (blocked by the quota at the time), look-alike items, harder photos.

### 3.2 Cropping items out of a batch photo

- The model returns a bounding box per item in the same call as the name. The script crops from the full-resolution original and saves 512px thumbnails.
- **Box quality depends on the model.** `gemini-2.5-flash` boxes were loose and sometimes shifted (a jar top was clipped). `gemini-3.5-flash` boxes were noticeably better and tight on the 4-item photo.
- **Overlapping items crop poorly** (a bottle behind a carton, a package in front of a box). This is a limit of the photo, not the model.
- Practical mitigations: tell staff to spread items in one layer on a plain surface, cap batches at roughly 5-6, warn and ask for a retake if boxes overlap heavily, and pad crops 5-8% (currently 2%, not yet changed).

### 3.3 Barcode approach

Barcodes are deterministic and fast, and give brand and size from a database instead of from a label. They cannot cover everything (produce, loose goods, store brands, imports, repackaged items), so photo + AI remains the fallback.

**Open Food Facts (free):**
- Rate limits (from their docs): 15 requests/min/IP for product reads, 10/min/IP for searches. Limits are per IP, so workers on one school network, or all requests routed through one server, share one budget.
- The full database dump is about 13 GB, too large to store.
- Don't rotate IPs or proxies to get around limits; send a descriptive User-Agent.
- Licensing: the data is ODbL and images are CC-BY-SA, so credit Open Food Facts. Confirm exact terms before redistributing.

**Other sources (not yet tested; details from memory, verify before relying on them):**
- USDA FoodData Central branded foods: free API key, downloadable, US UPCs, no images.
- UPCitemdb, Go-UPC, Barcode Lookup: free tiers are small or rate-limited; fuller use is paid.

**Reducing the storage and rate-limit problem (proposed, not yet built):**
- Stream the dump and keep only what is needed instead of storing 13 GB: US products only, with a name and a barcode, and a few columns (barcode, name, brand, quantity, category, image URL). Possibly filter further by how often a product is scanned, if that field exists in the data. Expected size is tens to a few hundred MB; this is an estimate to be measured.
- Store only image URLs in the database. Save a small thumbnail of an item only when a worker logs it (a few hundred items, a few MB).
- On a local miss, make one live API call. At normal scanning speeds this rarely approaches 15/min. If it misses or is rate-limited, go straight to the photo + AI flow, with no background queue and no "go back and check".

### 3.4 Training a classifier / embedding matching

- **A custom or off-the-shelf product classifier is not recommended.** Generic Hugging Face classifiers know categories like "can", not specific products. Public grocery datasets are small or from other markets. A trained classifier needs many photos per product and retraining for every new item, which fits a constantly changing pantry poorly. It also cannot read labels, which is how the LLM gets names right.
- **Embedding-based matching is a good fit for checkout.** We embedded the 11 crops from photo 1 as a "catalog" and queried with the 4 crops from photo 2 using CLIP (`clip-vit-base-patch32`, via transformers.js, run locally):

| Query (photo 2) | Correct match score | Best wrong match |
|---|---|---|
| Healthy Origins Vitamin D3 & K2 | 0.931 | 0.760 |
| Kirkland Multivitamin Gummies | 0.919 | 0.724 |
| 365 Organic Chicken Broth | 0.837 | 0.724 |
| Kimono Mom's Furikake | 0.845 | 0.626 |

  Top-1 accuracy was 4/4, even with several clipped or partly hidden catalog crops.
- **Limits of this test:** all 11 catalog products look very different from each other; both photos share a counter and lighting; the catalog is tiny. Near-identical items (two flavors of one cracker, two sizes of one soup) were not tested and are the likely failure case. Embeddings can only recognize items already in the catalog; a new item still needs a barcode or the vision LLM to get its name once.

### 3.4b Same-item re-photo and look-alike tests (2026-10-05)

Run with `npx tsx scripts/pair-test.ts` (CLIP `clip-vit-base-patch32`, local). Each `<name>1` photo is a catalog entry and each `<name>2` photo is a query that should match it, against about 13 other photos as distractors (duplicates removed by file hash). Two embedding modes: `center` (resize, CLIP's center-crop) and `pad` (whole photo shrunk into a square). Small sample, so treat as direction, not measured accuracy.

| Pair | What differs | Correct score (center / pad) | Best wrong (center / pad) | Result |
|---|---|---|---|---|
| furikake | flat on counter vs held in hand, different background | 0.875 / 0.831 | 0.639 / 0.601 | Rank 1 |
| ramune | two small, low-resolution photos | 0.882 / 0.923 | 0.608 / 0.586 | Rank 1 |
| olive oil | phone jpeg vs web webp | 0.685 / 0.743 | 0.508 / 0.546 | Rank 1 |
| barilla | landscape box on counter vs upright held box (rotated 90 degrees), different resolution | 0.658 / 0.739 | 0.612 / 0.667 (Starbucks tin) | Rank 1, thin gap (0.046 / 0.073) |
| spice | shichimi togarashi (phone) vs ichimi togarashi (web), **different products** | 0.612 / 0.572 | 0.629 / 0.637 | Not matched, correct |

**Findings**
- **Same product, very different photos still matches** for furikake, ramune and olive oil, with gaps of about 0.18 to 0.34. Whole-photo embedding worked without cropping on those.
- **Scene and hand leak into the score.** For barilla the runner-up was the Starbucks tin, which shares only the framing (portrait, hand on the left, dark floor). Hand-cropping each of the three to the product alone raised the barilla pair to 0.765 and lowered the tin to 0.571, a gap of about 0.19 instead of 0.07. Manual crops of three items only.
- **Rotation tolerance does not help.** Embedding the query at 0/90/180/270 degrees and keeping the best score left barilla unchanged (gap 0.067) and narrowed other gaps (furikake 0.230 to 0.185, olive oil 0.196 to 0.149). Not worth adding.
- **Look-alikes from the same brand are the failure case.** Two web shots of different products (Barilla Spaghetti 32 oz and Barilla Whole Grain Thin Spaghetti 16 oz) scored 0.806, higher than every phone-to-same-product pair above. Image style (white background, centered box) counts about as much as the product.

  | Barilla pair | Center / pad |
  |---|---|
  | barilla3 (32 oz classic) vs barilla4 (whole grain thin), different products | 0.806 / 0.806 |
  | barilla3 vs barilla1 (same variety, different size) | 0.806 / 0.640 |
  | barilla4 vs barilla1 | 0.699 / 0.565 |
  | barilla3 vs barilla2 | 0.604 / 0.595 |

  In `pad` mode a new barilla3 photo would match barilla4 (wrong product) at 0.806 with a gap of 0.166 to the next candidate. That would pass an "above 0.65 with a gap of at least 0.15" rule, so that rule would produce a wrong auto-match. In `center` mode it ties between barilla1 and barilla4 (gap 0), which the gap rule would correctly send to review.
- **Unrelated products stay well separated** (non-Barilla items stayed below about 0.61 against the Barilla photos in `pad` mode).

**Consequences for the design**
- Do not auto-resolve on a low similarity score. The safe starting point is auto-resolve only at very high similarity (the same-item scores at or above about 0.83 were furikake and ramune) and a clear gap; everything lower goes to the LLM. Not a measured threshold.
- Use embeddings to shortlist candidates and let the name read from the label decide between look-alikes.
- Define item identity as brand + product + variety, not size (size reads are unreliable, section 3.1).
- Add a framing guide to the capture screen so the item fills the frame; this directly reduces the scene and hand effect.
- Still to test: phone photos of real same-brand siblings (two pasta shapes, two flavors), and a crop step applied consistently to every photo so thresholds reflect the app's real input.

### 3.4c Browser embedding runtime on iPhone (2026-10-05)

Spike in `spikes/embed-runtime/` (transformers.js, `Xenova/clip-vit-base-patch32`, `q8`, WASM). One iPhone, iOS 18.7, Safari, 4 cores. Small sample.

| Config | Per photo (warm) | Model load |
|---|---|---|
| Plain HTTP (insecure context, no Cache API) | about 5,300ms | 5.5s every time |
| HTTPS | about 200ms | 5.0s cold, 0.6s cached |
| HTTPS + cross-origin isolation (threads) | about 147ms | 4.7s cold |

- 89 MB download. 30 embeddings in a row, repeated, with no crash and no slowdown.
- **The 5s figure was caused by testing over HTTP.** Always test on HTTPS (a Cloudflare quick tunnel works).
- **Decision:** embed in the browser with q8 on WASM. No isolation headers, since the gain is about 50ms and COEP breaks cross-origin resources. WebGPU and fp16 were not tested.
- **q8 vs fp32:** cosine against desktop fp32 is 0.90-0.96, the same on desktop Node q8 (0.91-0.96), so it comes from quantization, not the iPhone. Same-item pair scores moved by up to about 0.06 (furikake 0.833, ramune 0.871, barilla 0.718 on the phone). **Thresholds from 3.4b were measured at fp32 and must be re-measured on q8 embeddings.**

### 3.4d Look-alike test with q8 phone photos (2026-10-05)

Run with `npx tsx scripts/lookalike-test.ts` (CLIP `clip-vit-base-patch32`, `q8`, local; the same model the browser runs). Photos in `test_pictures/lookalikes/`, named `family_variant_n`. Leave-one-out: each photo is a query against every other photo, an item scores as the best of its photos. 14 queries, 7 items (pepper_coarse was misnamed at the time, so it was dropped from the queries), 4 same-brand or same-type families (Better Than Bouillon beef vs chicken, two avocado oils, two red pepper powders, Kirkland pepper vs salt). Small sample, one phone, one photographer.

| Crop | Top-1 correct | Wrong, to a sibling |
|---|---|---|
| center (resize, then CLIP's center crop) | 12/14 | 2 |
| pad (whole photo shrunk into a square) | 12/14 | 2 |
| guide (central 80% square, a stand-in for a framing guide) | 11/14 | 3 |

- **Siblings score as high as the same item.** A Better Than Bouillon beef photo matched the chicken jar at 0.838 to 0.850, above its own other photo at 0.814. Gaps between the right and wrong answer were often 0.02 to 0.04. Different-brand pairs were fine (Kirkland pepper vs salt, gaps 0.15 to 0.26).
- `pad` shrinks the gaps (the background stays in the embedding). The central-80% crop was not better than `center`, so a framing guide cannot be relied on to fix matching.
- **Auto-resolve rule (center), correct / false green / sent to LLM, of 14:** score 0.80 and gap 0.05 gave 9 / 0 / 5, but the worst wrong answer had a gap of 0.036, a thin margin. Gap 0.10 gave 4 / 0 / 10, with only the clearly distinct Kirkland items resolving. With no gap rule: 12 / 2 / 0, two false greens.
- **Conclusion:** photo similarity cannot be the first pass. A safe rule exists but resolves almost nothing, and wrong auto-matches are not acceptable for inventory. This led to the Gemini-first design in 3.4e. Image embeddings remain a possible later tool (weekly stock check, checkout) and the 3.4b to 3.4d numbers stay as the record of what they can and cannot do.

### 3.4e Gemini-first name matching (2026-10-05)

Pipeline tested: Gemini reads the label and returns a name and categories; the name is compared with the names of existing items. No photo embedding. Code: `shared/normalizeName.ts`, `shared/decideMatch.ts` (11 unit tests pass: `node --import tsx --test shared/decideMatch.test.ts`), `shared/categories.ts`, and the experiment `scripts/name-test.ts`.

**Matching rule (word by word, not whole-string similarity, because siblings differ by a whole word):**
1. Normalize: lowercase, strip accents and punctuation, drop filler words (the, a, of, and, with), singularize.
2. Drop package sizes ("32 oz", "240 capsules", "(454 g)"). Keep other numbers ("365", "2%", "500 mg") as part of the product.
3. Pair up words. A typo inside a word is tolerated: none for words of 4 letters or fewer ("beef" vs "beet" are different items), 1 edit for 5 to 7 letters, 2 for 8 or more. A different, extra or missing word is not a match.
4. Decision: every word pairs up and the numbers match, with exactly one such candidate, is **green** (resolve to that item). Anything else with a plausible candidate is **yellow** and shows the candidates with how they relate (`subset`: one name only adds words, `number_conflict`, `one_word_off`: one word differs on each side, such as Beef vs Chicken or a misread brand). No candidate is a new item.
5. A sibling is shown as a yellow candidate, never green, so the worker defaults to "new item" for it.

Name embeddings were rejected: they would place "beef" and "chicken" next to each other just like photo embeddings did.

**Test:** the 16 look-alike photos, one photo per request, `gemini-3.5-flash-lite`, 2 passes (32 calls, 31 succeeded; one 503 failed after its retry). The catalog held the name from photo 1, pass 1 of each of the 8 items; every other result was matched as a later scan.

| Outcome of 23 later scans | Count |
|---|---|
| Green, correct | 18 |
| **Green, wrong** | **0** |
| Yellow, correct item offered | 5 |
| New item (would create a duplicate) | 0 |

- No sibling was ever merged (beef/chicken bouillon, the two avocado oils, the two red pepper powders, Kirkland pepper/salt).
- The 5 yellows: Kirkland peppercorns reordered with an extra word ("Whole Peppercorns Black Pepper" vs "Whole Black Peppercorns", 2 scans), Chosen oil dropping "Naturally Refined" (2 scans), and one photo read with brand "CJ" instead of "Haetae" (flagged `one_word_off`, correct item offered). All are worker taps, not wrong stock.
- Small-print brand misreads varied between photos of the same item ("ChoriPDong", "ChopisDong", "ChopLipDong") but stayed within typo tolerance and matched green.
- Names were stable between passes; most variation was dropped words and word order.
- **Categories (fixed list, 1 to 3 per item, primary first, never a new one):** multi-category was used sensibly (bouillon: `soup_broth` + `condiments_sauces_spices`; salt and oils: `condiments_sauces_spices` + `baking`). The category set varied for 2 of 8 items (both oils sometimes added `baking`); the primary never changed. Categories are stored once when an item is created, so this only affects the first scan, and the worker can edit it. Whether oil and salt belong in `baking` depends on UTA's real category list (plan open decision 4).
- **Latency (this run):** median 5.1s per call, 10 of 32 calls over 30s, slowest 145s, about 14 minutes sequential in total. Server load dominated, as in 3.1. Queued processing and the fallback chain are still needed.
- **Limits:** 8 items, one model tier, the same photos in both passes. Names from `gemini-3.1-flash-lite` and `gemma-4-31b-it` were not compared and may be worded differently (more yellows); store `model_used` per result. Sizes remain unreliable and are not used for matching.

## 4. Recommended architecture (current thinking)

> Update 2026-10-05: item matching is now Gemini-first with word-by-word name matching (3.4e). Photo embeddings are no longer part of intake. The embedding-based checkout idea below is post-demo and unproven for look-alikes (3.4d). See `docs/implementation-plan.md` section 4 for the current flow.

**Intake**
1. Scan the barcode. Check your own catalog, then the local filtered Open Food Facts copy, then one live API call.
2. On a miss or no barcode, photograph up to about 5 spread-out items. The vision LLM returns names, categories, and boxes. Crops become the catalog thumbnails.
3. The worker confirms or edits each row and enters the quantity.
4. Save every confirmed product to your own catalog (barcode, name, category, thumbnail, embedding). Each product is looked up or categorized only once ever, so categories stay consistent and repeat donations are instant.

**Categorization:** use one fixed category list as the only valid output. Map external categories into it once per product and store the result. Workers can override, and overrides are saved.

**Checkout:** scan barcodes where available (exact). For items without barcodes, photograph the items, crop, embed, and match against the catalog. Auto-match only above a high score with a clear gap to the runner-up; otherwise ask the worker to choose. Always show a confirmation screen before decrementing stock.

**Open design question:** if the real need is "what is roughly on the shelf" for appointment planning, a periodic photo snapshot with approximate availability may be enough, and an exact ledger may not be needed. If exact counts are needed (reporting, per-student limits, reordering), keep the ledger. This has not been decided.

## 5. Known risks

- Inventory drift over time; plan a recount/adjust flow from the start.
- Student privacy: avoid logging student identity unless required, keep faces out of photos, short retention for stored photos, and check school policy (FERPA).
- Free-tier Gemini rate limits and 503 errors under load; retries and a fallback model are needed.
- Barcode decoding on iPhone Safari needs a library such as ZXing (no native BarcodeDetector support); glare and focus affect reliability.
- Hit rates for barcode databases on your actual donations are unmeasured.

## 6. Open questions

1. How many items move through per day, and how many workers use it at once?
2. Is the stock mostly packaged and barcoded, or is there a lot of fresh and loose food?
3. Are exact counts required, or is approximate availability enough?
4. Are expiry dates or per-student limits needed?
5. Where will it be hosted, and which free database tier will be used?

## 7. Code in the repo

| File | Purpose |
|---|---|
| `scripts/identify.ts` | Photo to structured items (name, category, size, box), crops each item, writes an overlay image. Run `npm run identify`. Reads `GEMINI_API_KEY` from `.env`. Override the model with `MODEL=...`. Default `gemini-3.5-flash`. Older, single-category schema. |
| `scripts/identify-batch.ts` | Several photos in one request (parked test, section 8). |
| `scripts/match-test.ts` | Embeds crops from two photos and checks cross-photo matching (3.4). |
| `scripts/pair-test.ts` | Same-item re-photo test, CLIP fp32, center/pad/rotation (3.4b). |
| `scripts/lookalike-test.ts` | Look-alike test with q8 embeddings, crop modes and threshold sweep (3.4d). |
| `scripts/name-test.ts` | Gemini-first name matching test, 2 passes, cached in `out/name-test/results.json` (3.4e). |
| `shared/categories.ts` | The fixed category list and a 1-to-3 category schema. |
| `shared/normalizeName.ts`, `shared/decideMatch.ts` | Name normalization and the green/yellow/new decision. Tests in `shared/decideMatch.test.ts`. |
| `spikes/embed-runtime/` | Standalone page that runs CLIP in the browser for the iPhone test (3.4c). `npm run reference` rebuilds the desktop reference embeddings; `HTTP=1 npx vite` serves it for a tunnel. |
| `samples/`, `test_pictures/` | Test photos (`test_pictures/lookalikes/` is the family_variant_n set). |
| `out/` | Generated JSON, crops, and box overlays (gitignored). |

## 8. Suggested next steps

Done since the first version of this list: the embedding runtime spike (3.4c), the look-alike test (3.4d) and the Gemini-first name matching test (3.4e). Photo embeddings are dropped from intake.

1. **Phase 1 foundation** (see the implementation plan): clean the working tree, scaffold the app, Supabase schema and RLS with access tests.
2. **Naming drift across model tiers (optional, cheap):** run `scripts/name-test.ts` with `MODEL=gemini-3.1-flash-lite` and `gemma-4-31b-it` and compare names against the flash-lite catalog. Informs how many yellows the fallback tiers produce.
3. **Multi-photo request test (parked):** about 5 single-item photos in one `gemini-3.5-flash-lite` request via `npm run identify-batch -- a.jpg b.jpg ...`. Only worth doing if the daily quota becomes a problem; handle one bad response failing all 5 photos.
4. **Barcode coverage** (only if barcodes come back as an accelerator): stream and filter the Open Food Facts dump and measure the hit rate on real pantry barcodes.
5. **Decide ledger vs snapshot** (section 4, open design question).
