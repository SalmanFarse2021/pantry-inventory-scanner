# Reservations Plan: Online Cart, Holds, and Video Intake

Status as of 2026-10-06. Extends `docs/implementation-plan.md` (Phases 0-5 are built or partly built). This plan covers what we add so the pantry has a reason to pick us over a generic inventory app: students reserve items before their appointment, staff see what to pick, and stock stays honest.

## 1. Why this exists

Scanlily (the closest competitor) matches us on photo/video intake, an approval step, and a public catalog link. Owners can control which fields and staff names show. Those are not differentiators.

What it does not have is a notion of a student, a visit, or a hold. Our edge is:

1. **Reserve before you go.** Students browse any day (the pantry is open only Tue and Wed 9-3 and Thu 11-5), build a cart, and hold items for their appointment.
2. **Less prep time.** Staff get a pick list for the appointment and can gather items before the student arrives.
3. **Honest availability.** Stock shown to students is on hand minus held, so a student doesn't plan around an item someone else already reserved.
4. **Back-in-stock alerts** for the item a student came for and couldn't get.
5. **Video intake** so keeping stock current costs staff minutes, not an afternoon (Scanlily's video intake is good; we need parity).

## 2. Facts that shape the design

| Fact | Consequence |
|---|---|
| Appointments are required and booked on a UTA portal we cannot read or write | We do not book anything. The student enters the time they booked, we trust it, and they can edit or cancel it. The UI must say "this does not book your appointment". |
| Open Tue/Wed 9am-3pm, Thu 11am-5pm (Fall 2026), America/Chicago | Holds expire by open hours, not wall clock. The time picker offers open windows only. Hours live in a table the manager can edit, not in code. |
| Open to students, faculty and staff, with a MAV ID | Sign-in accepts an allowed list of UTA email domains (verify the real domains). We do not collect the MAV ID. |
| Whether anyone is stationed is unknown (to be checked in person) | Build both pickup modes behind one setting (section 5). Reserved counts shown publicly work either way. |
| Existing decision: students are anonymous and check out themselves (honor system) | Stays for walk-in checkout. Cart orders are the one place a student is identified, and only to staff. |
| Existing public view shows no exact stock counts | Stays. We add a reserved count, not a stock count. |

## 3. Data model additions

New migration (suggested name `20261006000000_reservations.sql`).

- `student_profiles`: user_id (pk, references `auth.users`), first_name, last_name, created_at. One row per signed-in shopper. Staff are still decided by the `staff` table, so a student auth user never gains staff rights (every existing policy checks `is_staff()`).
- `open_hours`: weekday (0-6), opens, closes, semester_label. Plus `closed_dates` (date, note) for holidays. Timezone is fixed to America/Chicago.
- `pantry_settings` (single row): max_items_per_order, grace_minutes, self_serve_pickup (bool), alert_cooldown_days.
- `orders`: id, student_id, status (`reserved`, `picked_up`, `cancelled`, `expired`), appointment_at (nullable until the student enters it), expires_at, qr_token (random, unique), created_at, updated_at, picked_up_at, picked_up_by (staff user id or null for self-serve).
- `order_items`: order_id, item_id, qty (primary key on the pair).
- `inventory_events` gets a nullable `order_id`, so pickup rows in the ledger point at their order.
- `stock_alerts`: user_id, item_id, created_at, notified_at. Unique on (user_id, item_id) while `notified_at` is null.

The cart itself is client-side (Zustand, persisted in the browser) until submit. Drafts hold nothing, so abandoned carts cannot lock stock.

### 3.1 Holds and availability

A hold is the sum of `order_items.qty` for orders with `status = 'reserved'` and `expires_at > now()`. Because expiry is checked at read time, correctness never depends on a cron job; the cron only tidies statuses.

- `item_availability` view (security definer, same pattern as `available_items`): on_hand, held, available = on_hand - held. Not exposed publicly.
- `available_items` (public) changes so `availability` is computed from available, not on_hand, and gains `reserved_count` (number of units held, no student info). Existing thresholds (`out` at 0, `low` at 3 or less) apply to available.
- `checkout_item` (anonymous walk-in checkout) must check against available, not on_hand, or a walk-in could take units that are held for someone else. This is a change to an existing function and needs a test.
- `adjust_stock` and `mark_out_of_stock` may drop on_hand below held. Do not block staff. Instead, mark affected orders as short (a computed flag on the staff order screen: "needs 2, only 1 on hand") so staff can substitute or contact the student.

### 3.2 Functions (all `security definer`, row-locked like `checkout_item`)

| Function | Who | Does |
|---|---|---|
| `submit_order(items jsonb, appointment_at timestamptz)` | signed-in student | Locks the item rows in id order (avoids deadlocks), checks available per line, per-item `limit_per_visit`, `max_items_per_order`, and one active order per student, then inserts the order and lines and sets `expires_at`. All or nothing. |
| `update_order(order_id, items, appointment_at)` | owner | Same checks, re-run against stock excluding this order's own hold. |
| `cancel_order(order_id)` | owner | Sets `cancelled`, which frees the hold immediately. |
| `complete_order(qr_token)` | staff; or the owner if `self_serve_pickup` | Writes one `checkout` ledger row per line (with `order_id`), sets `picked_up`. Idempotent: a second scan does nothing. |
| `expire_holds()` | service role (cron) | Flips lapsed `reserved` orders to `expired`. |
| `request_alert(item_id)` / `cancel_alert(item_id)` | signed-in student | Maintains `stock_alerts`. |

`expires_at` rules, computed by a pure helper that is also mirrored in `shared/openHours.ts` for the UI and unit tests:

- With an appointment time: closing time of that open day plus `grace_minutes`.
- Without one: closing time of the next open day after submit (so a Friday submit lasts through Tuesday).
- Appointment times outside open hours or in the past are rejected.

## 4. Access rules (RLS additions)

| Who | Can do |
|---|---|
| Anyone | Read `available_items`, `open_hours`, `closed_dates`. Walk-in `checkout_item` as today. |
| Signed-in student | Read and write only their own `student_profiles`, `stock_alerts`; read only their own `orders` and `order_items`; call the order functions above. Cannot read the ledger, stock counts, or other students' orders. |
| Staff | Read all orders and profiles. Call `complete_order`. |
| Manager | Edit `open_hours`, `closed_dates`, `pantry_settings`. |

Sign-in details:

- Staff login keeps `shouldCreateUser: false` (`src/routes/login.tsx`). Students use a separate route that allows account creation.
- The email-domain restriction must be enforced in the database or an auth hook, not only in the client. A client-only check is bypassable because anyone can call Supabase auth directly.
- Use an emailed one-time code or magic link. No passwords.

Privacy: collect only school email and first and last name. Orders are visible to staff only, never publicly. A `purge_semester()` function deletes orders, order lines, alerts and profiles after the pilot. Tell students this on the sign-in page.

## 5. Pickup modes

One setting, `self_serve_pickup`, picks the mode. Decide after checking in person whether anyone is stationed.

| | Staffed | Unstaffed (keycard) |
|---|---|---|
| Order submitted | Worker sees it on the staff orders screen and the daily digest, preps the bag | No prep. The order is a reservation and a restock signal |
| Pickup | Student shows the order QR, worker scans it, `complete_order` runs | Student opens their order, taps "I picked these up" after taking items |
| Stock accuracy | High | Depends on honesty. Per-visit limits stay on, and mismatches show up at the weekly stock check |
| Public view | Shows `N reserved` per item | Same |

Reserved counts on the public view are the fallback that works with no staff at all.

## 6. Notifications

- **Staff digest:** one daily cron (fits the Hobby plan's daily limit) emails staff the next open day's orders, grouped by appointment time with per-item totals. The existing `api/sweep.ts` daily cron can host it.
- **Back-in-stock:** when an item's available goes from 0 to above 0 (after an intake, a cancel or an expiry), email each student with an active alert once, then set `notified_at`. Cap by `alert_cooldown_days` so one item flapping doesn't spam.
- **Student:** confirmation on submit, and a reminder the evening before the appointment time they entered.
- **Email provider:** Supabase's built-in auth email is not meant for this volume. Pick a provider before Phase R4 (see open decisions).

## 7. Phases

Order follows the build order we agreed (availability, then cart, then staff screens, then video), with sign-in pulled forward because alerts and carts both need it.

### Phase R1: Open hours and hold-aware availability (about 2 days)

- Migration: `open_hours`, `closed_dates`, `pantry_settings`, `orders`, `order_items`, `item_availability`, updated `available_items`, updated `checkout_item`.
- `shared/openHours.ts` (next open window, hold expiry, valid appointment times) with unit tests, in the style of `decideMatch.test.ts`.
- Student catalog: "open now / next open" banner, "last updated" stamp, reserved badge, availability from available.
- Extend `npm run rls-test` and add a hold race test (two submits for the last unit, only one succeeds; walk-in checkout cannot take held units).

*Exit criteria:* a hand-inserted order reduces availability on the catalog; walk-in checkout respects it; an expired order stops holding without any cron run.

### Phase R2: Student sign-in (about 1 day)

- Student login route with account creation, domain gate in the database, profile form (first and last name).
- Nothing else changes for anonymous browsing.

*Exit criteria:* a non-UTA email cannot create an account even by calling the auth API directly; a student account cannot read any staff table (RLS test).

### Phase R3: Cart and my reservation (about 3 days)

- Add-to-cart on catalog cards, cart drawer with quantity steppers capped by limit and `max_items_per_order`.
- Submit with the appointment time picker (open windows only) and the "this does not book your appointment" notice with a link to the UTA portal.
- "My reservation" page: view, edit items, change time, cancel. QR code for pickup.
- `submit_order`, `update_order`, `cancel_order` wired to the UI. Plain error messages for "someone else just reserved that".

*Exit criteria:* two phones race for the last unit and exactly one wins with a clear message; cancelling frees the item on the other phone.

### Phase R4: Staff orders, pickup, digest (about 3 days)

- `/staff/orders`: upcoming orders by time, per-item totals, short-stock flags, search by student name.
- QR scan (reuse the camera component) calling `complete_order`; self-serve button behind the setting.
- Daily digest email and student reminder.

*Exit criteria:* a full loop works end to end: browse, reserve, staff scan, ledger shows the checkout, stock updates.

### Phase R5: Back-in-stock alerts (about 1 day)

- "Notify me" button on out-of-stock items, a student alerts list, and the send step triggered where stock increases (intake resolve, cancel, expire).

### Phase R6: Video intake (about 4-5 days, separate spike first)

Goal: parity with Scanlily's "walk around, show items, say what they are and how many".

- **Spike first (1 day):** can Gemini return, from one narrated clip of up to a minute, a list of distinct items with counts and a best-frame timestamp? Test on 5 clips. Check accuracy of narrated counts and same-brand look-alikes (the known weak point in findings 3.4d).
- Upload straight from the phone to Supabase Storage, because Vercel function request bodies are capped at 4.5 MB.
- One function call per clip; for each detected item, create an `intake_jobs` row with the extracted frame and the narrated quantity, so results land on the existing review screen from Phase 3 with green/yellow/red as usual.
- Keep the single-photo path for one-off items and any checkout use.
- Open question: the fallback chain (`gemini-3.1-flash-lite`, `gemma-4-31b-it`) may not accept video. Confirm which tiers do, and decide what happens when none are available (queue and retry, like `waiting_quota`).

### Phase R7: Pilot hardening (about 2 days)

- `purge_semester()` and a documented retention statement.
- Seed data and a demo script that includes the cart: reserve on one phone, staff pick list on another.
- Failure drills: submit race, expired hold, short stock, offline cart.
- Pitch demo for the pantry owner.

## 8. Open decisions

1. **Is anyone stationed during open hours?** Check in person. Decides the default for `self_serve_pickup` and how much the staff screen matters.
2. **Allowed email domains** for students, faculty and staff. Verify against UTA's actual addresses.
3. **Email provider** for digests and alerts (a transactional email service; the Vercel Marketplace is the first place to look). Needs a sender domain or at least a verified sender.
4. **Limits:** `max_items_per_order` and per-item limits come from the pantry (extends open decision 4 in the main plan).
5. **One active order per student, or several?** Default proposal: one, to prevent hoarding.
6. **Does the public view keep hiding on-hand counts** while showing reserved counts? Proposal: yes, to match the existing decision.
7. **What happens to holds when the appointment passes with no pickup?** Proposal: expire at close of that day plus grace, with no penalty on the student's account.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Nobody is stationed, so notifications go unread | Public reserved counts, daily digest, and self-serve pickup mode |
| Self-reported appointment times drift from the UTA portal | Say so in the UI; holds are bounded by open hours and limits |
| Hoarding by a few students | One active order, per-item and per-order limits, short expiry |
| Holds and walk-in checkout fight over the same stock | `checkout_item` checks available, with a test; all stock changes still go through the ledger |
| Staff reduce stock below what is held | Never block; flag short orders on the staff screen |
| Student data is sensitive (it implies food insecurity) | Minimal fields, staff-only visibility, semester purge, owner approval before launch |
| Open sign-up invites junk accounts | Domain gate in the database, emailed code, rate limits |
| Competitor ships holds or ordering | Our lead is pantry fit and the UTA relationship; keep the pilot close to the staff and ship fast |
| Video intake accuracy on look-alikes | Spike first; same yellow review path as photos |

## 10. First three actions

1. Verify staffing and the email domains in person, and ask the owner the appointment-portal questions above.
2. Write the Phase R1 migration and `shared/openHours.ts` with tests.
3. Run the video spike (Phase R6, first day) in parallel, since its result decides how much of the intake budget it takes.
