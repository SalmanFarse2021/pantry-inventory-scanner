# Stock update notifications — plan

Status: **planned, not started** (decided 2026-10-14). Nothing is implemented yet.

## Goal
A signed-in student can "watch" any catalog item, regardless of its status (in stock, low, out). When anyone else updates that item's status, the watcher gets an email.

## Decisions

| Question | Decision |
|---|---|
| What counts as an update? | **Any** call to `set_item_status`, including re-confirming the same status (in stock -> in stock). Recent verification is itself useful information. |
| Subscription lifetime | Persistent until the user turns it off. |
| Delivery | **Batched**: one digest email per user listing every watched item that changed, not one email per change. Target cadence ~10 minutes. |
| Self-notify | No. The user who made the update is never notified about it. |
| Prediction ("likely back in stock") emails | Out of scope for now. Keep the queue generic enough (an event `type` column) to add later. See `prediction-model.md`. |
| Email provider | **Gmail SMTP** on a dedicated account (free, no domain). See constraints below. |

## Constraints that drove the provider choice
- Free only. No domain name, and UTA does not back the project, so no UTA-provided domain or mailbox.
- Resend free tier requires a verified domain. Without one it can only send from `onboarding@resend.dev` to the account owner's own address, so it cannot reach students.
- Do not send a `@gmail.com` "from" address through Brevo, SendGrid, etc. Gmail's DMARC policy causes rejection or spam-foldering.
- Supabase's built-in auth mailer is rate-limited and meant for auth mail only.

## Design

### Data (new migration)
- `item_subscriptions(user_id, item_id, created_at)`, primary key `(user_id, item_id)`, cascade on delete. RLS: users select/insert/delete only their own rows.
- `notification_queue(id, user_id, item_id, status, type default 'status_update', created_at, sent_at null)`. No client policies; written only by the database function and read by the sender with the service role.
- Add `last_seen_at` per subscription (or a small `subscription_seen` mechanism) for the in-app "changed since you last looked" badge.
- Extend `set_item_status` (`supabase/migrations/20261012000000_crowdsourced_status.sql`): after the update and log insert, insert one queue row per subscriber of `p_item_id`, excluding `auth.uid()`. Keep it in the same transaction so queue and status never diverge.

### Sending
- `api/notify.ts` (follow the auth pattern in `api/sweep.ts`: `Authorization: Bearer $CRON_SECRET`).
- Drains unsent queue rows, groups by user, collapses multiple rows for the same item to the latest, sends one digest per user, marks rows `sent_at`.
- Look up the recipient email from `auth.users` with the service-role client (`api/_lib/clients.ts` `admin`). Never expose it to the client.
- `sendEmail()` lives in one module so the transport can be swapped (Gmail SMTP now, Resend if a domain is acquired) by changing that module and env vars only.
- Gmail SMTP via nodemailer, `smtp.gmail.com`. Env vars: `SMTP_USER`, `SMTP_PASS` (app password).
- Cap per run; leave the remainder in the queue if near Gmail's ~500 recipients/day limit.
- Every email includes a one-click unsubscribe link (signed token, per user) plus a link to manage watches in the app.

### Scheduling
- Vercel Hobby only allows daily crons, so `vercel.json` cron is not enough for ~10-minute batching.
- Use Supabase `pg_cron` + `pg_net` to call `/api/notify` every ~10 minutes with the cron secret. (Daily Vercel cron can remain as a backstop.)

### UI
- Bell/"Notify me" toggle on each catalog item (`src/features/student/CatalogScreen.tsx`, `useCatalog.ts`), available for every status. Signed-out users are prompted to sign in.
- "Watching" list to manage all subscriptions in one place.
- In-app badge: watched items changed since the user last looked. This is the fallback if emails land in spam.
- Follow `component-conventions` (hook in its own folder, TanStack Query for server state).

## Risks
- Mail from a `@gmail.com` address to `@uta.edu` / `@mavs.uta.edu` (Microsoft 365) may land in junk, especially at first. Test early; tell users to mark as not junk.
- Google may throttle or suspend an account that sends automated mail. Unlikely at pantry volume; the swappable sender is the mitigation.
- The only real fix for deliverability is a domain (about $1-12/yr) plus Resend free tier (100/day, 3,000/month).

## Prerequisites (manual, by the project owner)
1. Create a dedicated Gmail account (not a personal one), enable 2FA, generate an app password.
2. Add `SMTP_USER`, `SMTP_PASS`, and `CRON_SECRET` to Vercel env vars and local `.env`.
3. Enable `pg_cron` and `pg_net` on the Supabase project.

## Build order
1. Migration: tables, RLS, `set_item_status` change. Extend `scripts/rls-test.ts` for the new tables.
2. `sendEmail()` + digest builder in `shared/` with unit tests (grouping, collapsing, self-exclusion).
3. `api/notify.ts` + unsubscribe endpoint.
4. `pg_cron` schedule.
5. Catalog toggle, watching list, in-app badge.
6. Send a real test to a `@mavs.uta.edu` address and check junk-folder behavior.
