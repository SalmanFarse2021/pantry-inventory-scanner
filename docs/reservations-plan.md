# Reservations Plan: Shelved

Status as of 2026-10-15. **Not being built.** The first version of this plan assumed pantry workers who would pick orders, scan pickup QR codes and run a stock ledger. The app no longer has any of that: every signed-in UTA user keeps the catalog up to date, items carry one of three statuses (in stock, low, out), and there are no exact counts to hold or reserve against. See `docs/project-direction-plan.md` for the current direction and `docs/implementation-plan.md` for how the app works today.

Reservations, appointment holds, pickup modes, order digests and the ledger-based stock arithmetic that depended on them are dropped. The full text is in git history (the commit before the one that removed the staff role).

## Ideas that still apply

- **Back-in-stock alerts.** A user asks to be told when an out-of-stock item becomes available again. This works with statuses alone: when `set_item_status` moves an item from `out` to `low` or `in_stock`, email each user with an active alert once. The notification design is in `docs/notifications-plan.md`.
- **Video intake.** Walk past the shelf, narrate the items, and get one review entry per detected item so keeping the catalog current takes minutes. Spike first: can Gemini return, from one narrated clip of up to a minute, a list of distinct items with a best-frame timestamp? Test on 5 clips, and check same-brand look-alikes (the known weak point in findings 3.4d). Upload straight from the phone to Supabase Storage, because Vercel function request bodies are capped at 4.5 MB. Each detected item becomes an `intake_jobs` row with the extracted frame and a status, so results land on the existing review screen. Confirm which model tiers accept video before committing.
- **Open hours.** Show "open now / next open" on the catalog. The pantry is open Tue and Wed 9am-3pm and Thu 11am-5pm (Fall 2026, America/Chicago); keep the hours in a table, not in code. Appointments are booked on a UTA portal the app cannot read or write, so the app never books anything.
