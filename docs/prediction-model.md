Feature Specification: Automated Visual Intake & Predictive Inventory Engine

1. Overview
   The Automated Visual Intake & Predictive Inventory Engine enables frictionless, community-driven inventory management for the UTA Maverick Pantry. Instead of relying on manual text entry or staff logging, visiting students capture single full-shelf or haul photos. The system utilizes Gemini 1.5 Flash to perform multi-item spatial bounding, text extraction (OCR), and visual volume estimation.
   Over time, consecutive photo uploads form a self-verifying feedback loop that builds a time-series dataset to forecast item availability (e.g., restocking likelihoods and high-demand depletion rates during exam weeks).
2. Core Operational Workflow
   [Full-Shelf Photo Capture]
   │
   ▼
   [Gemini Vision + Canonical Matching] ───> Multi-item detection, OCR, & volume estimation
   │
   ▼
   [Pre-Filled Manifest] ─────────────────> Student 1-tap confirmation & update
   │
   ▼
   [State Mutation & Logging] ────────────> Updates live catalog & timestamped user attribution
   │
   ▼
   [Delta Verification & Decay Engine] ───> Compares T1 vs T2 snapshots to update predictive forecasts
   Full-Picture Capture: A student or volunteer snaps a photo of a shelf section or grocery haul using the web app camera.
   Multi-Item Parsing & Canonical Matching: The backend passes the image to Gemini Flash alongside a canonical pantry SKU dictionary. The model identifies product clusters, reads labels, and estimates counts or visual fill levels.
   1-Tap Confirmation: The user is presented with a pre-filled item manifest and taps "Confirm & Log" (with optional quick manual overrides) in under 3 seconds.
   Public Catalog Update: Item availability status (In Stock / Out of Stock) updates immediately on the student-facing catalog, tagged with the update date and the user's public handle for accountability.
   Delta Verification: As subsequent photos are submitted, the backend compares sequential snapshots (T
   1
   ​
   →T
   2
   ​
   ) to verify previous predictions, track consumption velocity, and refine predictive restock models.
3. Key Capabilities & Technical Specifications
   Component Technical Implementation Value / Benefit
   Multi-Item Vision Parsing Gemini 1.5 Flash multimodal endpoint using spatial bounding and fuzzy text/label matching against a target SKU list. Eliminates item-by-item barcode scanning. Captures entire shelf sections in a single photo.
   Visual Volume Estimation Categorizes container density into 3 visual tiers: High (>50%), Low (<25%/≤3 units), and Empty (0 units). Prevents data entry blockages on bulk/unbarcoded bins (e.g., creamer pods, condiments, paper goods).
   Ground-Truth Feedback Loop Compares sequential photo deltas and user override logs against previous AI outputs to calculate system accuracy scores. Continuously validates data integrity without needing custom ML model retraining.
   Predictive Restock & Depletion Alerts Combines visual volume density with category velocity rules and campus calendar events (e.g., exam week caffeine/snack demand spikes). Flags items as "Likely Gone Soon" or provides likelihood forecasts ("80% Monday Restock Probability") rather than fragile, exact stock counts.
   Public Attribution & Anti-Spam Attaches user handle and timestamp directly to item updates; uses session token rate-limiting. Discourages malicious reporting through social accountability without requiring complex upvote/downvote systems.
4. Strategic Value for Project Defense
   Solves the "Facebook Alternative" Argument: Facebook is a static media log; this feature acts as a relational state machine that converts unstructured photos into queryable database entities and forward-looking predictions.
   Bypasses Staff Bandwidth Constraints: Operates 100% independently of pantry staff intervention.
   Low Activation Friction: Reduces student logging time from minutes of typing down to a single camera snap.
