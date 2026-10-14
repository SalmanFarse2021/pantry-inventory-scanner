# Prediction Model: Feasibility Review

Review of `docs/prediction-model.md` (written 2026-10-14). Based on the spec only; existing code (e.g. the identify/matching API) was not checked against it.

## Verdict

The intake half (photo → detected items → confirm → catalog update) is feasible. The prediction half is feasible only as simple rule-based heuristics, not as a forecasting engine.

## What's feasible

- Multi-item photo parsing against a canonical SKU list with a multimodal LLM.
- Pre-filled manifest with one-tap confirm.
- Attribution (handle + timestamp) and live catalog updates.
- Coarse volume tiers (High / Low / Empty). Keep it at three tiers; exact counts are not realistic.

## Complications

1. **Stale model name.** Gemini 1.5 Flash has been retired. Refer to a "Gemini Flash-class vision model" and pin the version in config.
2. **Spatial bounding is oversold.** Bounding boxes from Flash-class models are rough and unnecessary. Ask for `{sku, tier, confidence}` instead.
3. **One photo can't show a whole shelf.** Occluded items and items out of frame look the same as missing items. Do not treat "not detected" as "out of stock". Only update positively detected items; absence means unchanged/unknown unless the user confirms.
4. **Unbarcoded/unlabeled items are hard** (creamer pods, loose condiments, paper goods). Expect low confidence and keep a manual-override path.
5. **Delta/feedback loop is shaky.**
   - T1→T2 comparison assumes similar framing of the same shelf region; students photograph arbitrary things, so a delta can be a framing difference rather than consumption.
   - User overrides are corrections, not ground truth, and blind "confirm" taps inflate apparent accuracy. Call the score "agreement rate", and spot-check a sample by hand.
6. **Prediction is a data-volume problem.** Probabilities like "80% Monday restock" need weeks to months of dense history per item. Start with rule-based labels ("Low for N days", "Likely gone soon") from tier + category rules. Exam-week spikes can be a hand-set multiplier, not a learned feature.
7. **Restocks aren't directly observable.** Donations and staff deliveries are invisible to the system. If the pantry has a fixed delivery schedule, ask staff for it once rather than learning it.
8. **Abuse and trust.** Handle attribution and rate limiting deter casual spam, not repeated false "Empty" reports. Add a guard (e.g. flag large simultaneous swings for review) and show photo age per item. Decide whether images are stored, and whether faces are blurred/stripped.
9. **Cost and latency.** Need a rate limit and upload size cap to protect the API bill. "Under 3 seconds" likely won't include model latency; use a loading state and keep the call server-side.
10. **Defense framing.** "100% independent of staff" conflicts with needing someone to maintain the SKU dictionary and fix a wrong catalog. Say "minimal staff involvement".

## Recommended build order

1. Photo → detected items with tier + confidence → confirm screen → catalog update.
2. Store every snapshot with timestamp and user; no prediction logic yet.
3. Rule-based "Low / Likely gone soon" labels from stored tiers.
4. After weeks of real data, try restock probabilities. Until then, present forecasting as future work enabled by the data being collected.

## Open items for when we return

- Check how much of step 1 the existing identify/matching code already covers.
- Rewrite `prediction-model.md` to the scoped version above (model name, no bounding boxes, absence ≠ out of stock, rule-based labels, staffing claim).
- Decide on image storage/retention and face handling.
- Define the anomaly guard for mass "Empty" reports.
