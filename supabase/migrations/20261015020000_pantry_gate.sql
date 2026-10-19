-- Presence gate for uploads and stock updates. Nobody at the pantry runs this app, so the app
-- decides on its own who may write. A student may submit a photo (create an intake job) or change an
-- item's status only
--   1. while the pantry is open (pantry_hours, in the pantry's timezone), and
--   2. within 30 minutes of checking in, by scanning the QR code posted at the pantry.
-- Closing time wins: a check-in 20 minutes before close stops working at close.
--
-- Each user can check in once per calendar month (the pantry allows one visit a month). The check-in
-- is tied to the account, not the device, so a dead phone or a second phone is not a problem.
-- Check-in is refused, and nothing is recorded, when the pantry is closed or closes in under 15 minutes.
--
-- Photos are gated when the job is created, not when the model finishes with them, so a job that
-- was accepted keeps working after the pantry closes. Work done by the API (no signed-in user) is
-- never gated.
--
-- The switch: pantry_settings.gates_enabled. It starts 'false' so development and testing are
-- open. Set it to 'true' on the production project. With it off, check-in skips the hours rules
-- (so the flow can be tried any time) and nothing is refused.
--
-- The constants (30 minutes, 15 minutes, the hours) are mirrored in shared/pantryGate.ts for the UI.
-- set_item_status below is a copy of the one in 20261015010000_status_verification.sql plus one
-- line; if you change that function there, make the same change here.
--
-- Operating notes
--   Print the QR as  https://<site>/checkin?code=<code>  where
--     select value from public.pantry_settings where key = 'checkin_code';
--   Rotate it (a leaked code, a reprint): update public.pantry_settings
--     set value = replace(gen_random_uuid()::text, '-', '') where key = 'checkin_code';
--   Turn the gate on or off: update public.pantry_settings set value = 'true' where key = 'gates_enabled';
--   Hours or closures: edit public.pantry_hours (dow 0 = Sunday ... 6 = Saturday).
--   Reset one user's visit while testing: delete from public.pantry_checkins where user_id = '...';

-- ---------- settings and hours ----------

create table public.pantry_settings (
  key text primary key,
  value text not null
);
alter table public.pantry_settings enable row level security; -- no policies: functions only

insert into public.pantry_settings (key, value) values
  ('timezone', 'America/Chicago'),
  ('gates_enabled', 'false'),
  ('checkin_code', replace(gen_random_uuid()::text, '-', ''));

create table public.pantry_hours (
  dow int primary key check (dow between 0 and 6),
  opens time not null,
  closes time not null,
  check (closes > opens)
);
alter table public.pantry_hours enable row level security;
create policy pantry_hours_read on public.pantry_hours for select to anon, authenticated using (true);

-- Days without a row are closed.
insert into public.pantry_hours (dow, opens, closes) values
  (2, '09:00', '15:00'),
  (3, '09:00', '15:00'),
  (4, '11:00', '17:00');

-- ---------- check-ins ----------

create table public.pantry_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  visit_month date not null, -- first day of the month in the pantry's timezone
  checked_in_at timestamptz not null default now(),
  unique (user_id, visit_month)
);
alter table public.pantry_checkins enable row level security;
create policy pantry_checkins_select_own on public.pantry_checkins for select to authenticated
  using (user_id = auth.uid());
-- No client writes: rows are created by check_in().

-- Accounts that skip both gates (hours and check-in), for testing the app while the pantry is closed.
-- Managed by hand, no client access:
--   insert into public.pantry_gate_exempt (user_id) values ('<auth.users id>');
--   delete from public.pantry_gate_exempt where user_id = '<auth.users id>';
create table public.pantry_gate_exempt (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.pantry_gate_exempt enable row level security; -- no policies: SQL editor only

-- ---------- helpers ----------

create function public.pantry_gates_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.pantry_settings where key = 'gates_enabled'), 'true') = 'true';
$$;
revoke all on function public.pantry_gates_on() from public, anon, authenticated;

-- When the pantry closes today if it is open at p_at, otherwise null.
create function public.pantry_closes_at(p_at timestamptz default now()) returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := (select value from public.pantry_settings where key = 'timezone');
  v_local timestamp := p_at at time zone v_tz;
  v_hours public.pantry_hours;
begin
  select * into v_hours from public.pantry_hours where dow = extract(dow from v_local)::int;
  if not found then return null; end if;
  if v_local::time < v_hours.opens or v_local::time >= v_hours.closes then return null; end if;
  return (v_local::date + v_hours.closes) at time zone v_tz;
end;
$$;
revoke all on function public.pantry_closes_at(timestamptz) from public, anon, authenticated;

-- ---------- check in ----------

-- Returns when the check-in happened. Idempotent inside its 30-minute window, so scanning again
-- after a crash or on another phone just returns the same check-in.
create function public.check_in(p_code text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_tz text := (select value from public.pantry_settings where key = 'timezone');
  v_month date := date_trunc('month', now() at time zone v_tz)::date;
  v_close timestamptz;
  v_row public.pantry_checkins;
begin
  if not public.is_uta_user() then
    raise exception 'Sign in with a UTA email to check in';
  end if;
  if p_code is distinct from (select value from public.pantry_settings where key = 'checkin_code') then
    raise exception 'That QR code is not valid. Scan the code posted at the pantry.';
  end if;

  select * into v_row from public.pantry_checkins where user_id = v_uid and visit_month = v_month;
  if not found then
    if public.pantry_gates_on() and not exists (select 1 from public.pantry_gate_exempt where user_id = v_uid) then
      v_close := public.pantry_closes_at();
      if v_close is null then
        raise exception 'The pantry is closed right now. Check in when you are at the pantry during open hours.';
      end if;
      if v_close - now() < interval '15 minutes' then
        raise exception 'The pantry is about to close, so check-in is closed for today. Your visit this month was not used.';
      end if;
    end if;
    insert into public.pantry_checkins (user_id, visit_month) values (v_uid, v_month)
      on conflict (user_id, visit_month) do nothing;
    select * into v_row from public.pantry_checkins where user_id = v_uid and visit_month = v_month;
  end if;

  if v_row.checked_in_at <= now() - interval '30 minutes' then
    raise exception 'You already checked in this month. You can check in again next month.';
  end if;
  return v_row.checked_in_at;
end;
$$;
revoke all on function public.check_in(text) from public, anon;
grant execute on function public.check_in(text) to authenticated;

-- ---------- the gate ----------

-- Runs both gates for the calling user. Does nothing while gates_enabled is 'false' or for an exempt account.
create function public.assert_can_update_stock() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pantry_gates_on() then return; end if;
  if exists (select 1 from public.pantry_gate_exempt where user_id = auth.uid()) then return; end if;
  if public.pantry_closes_at() is null then
    raise exception 'The pantry is closed. Stock can only be updated during pantry hours.';
  end if;
  if not exists (
    select 1 from public.pantry_checkins
    where user_id = auth.uid() and checked_in_at > now() - interval '30 minutes'
  ) then
    raise exception 'Check in at the pantry first by scanning the QR code posted there. Check-ins last 30 minutes.';
  end if;
end;
$$;
revoke all on function public.assert_can_update_stock() from public, anon, authenticated;

-- Uploads: a signed-in student creating a job must be present. The API (no auth.uid()) is exempt.
create function public.intake_jobs_presence_gate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  -- The upload queue retries inserts; a job that already exists is for the primary key to report
  -- as a duplicate (the client counts that as done), not for this gate to refuse.
  if exists (select 1 from public.intake_jobs where id = new.id) then return new; end if;
  perform public.assert_can_update_stock();
  return new;
end;
$$;
revoke all on function public.intake_jobs_presence_gate() from public, anon, authenticated;

create trigger intake_jobs_presence_gate before insert on public.intake_jobs
  for each row execute function public.intake_jobs_presence_gate();

-- Same as 20261015010000_status_verification.sql plus the perform of assert_can_update_stock().
create or replace function public.set_item_status(p_item_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  c_out_cap constant int := 30;
  c_cooldown constant interval := interval '10 minutes';
  v_uid uuid := auth.uid();
  v_item public.items%rowtype;
  v_own_pending boolean;
begin
  if v_uid is null or not public.is_uta_email(auth.jwt() ->> 'email') then
    raise exception 'sign in with a UTA email to update stock';
  end if;
  if p_status not in ('in_stock', 'low', 'out') then
    raise exception 'invalid status';
  end if;
  perform public.assert_can_update_stock();

  select * into v_item from public.items where id = p_item_id for update;
  if not found then raise exception 'item not found'; end if;

  -- Same status as the current report: this is a confirmation (never for legacy rows with no reporter).
  if v_item.status_updated_by is not null and v_item.status = p_status then
    if v_item.status_verified then return; end if;
    if v_item.status_updated_by = v_uid then
      raise exception 'you already reported this; another student needs to confirm it';
    end if;
    update public.items set status_verified = true where id = p_item_id;
    insert into public.item_status_log (item_id, status, user_id, kind) values (p_item_id, p_status, v_uid, 'confirm');
    return;
  end if;

  -- A new report. Fixing your own still-pending report is always allowed.
  v_own_pending := v_item.status_updated_by = v_uid and not v_item.status_verified;
  if not v_own_pending and exists (
    select 1 from public.item_status_log
    where item_id = p_item_id and user_id = v_uid and created_at > now() - c_cooldown
  ) then
    raise exception 'you updated this item a moment ago; try again in a few minutes';
  end if;

  if p_status = 'out' then
    -- Serialize per user so parallel calls cannot slip past the cap.
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
    if (select count(*) from public.items
        where status_updated_by = v_uid and status = 'out' and not status_verified) >= c_out_cap then
      raise exception 'you have % out-of-stock reports waiting for another student to confirm', c_out_cap;
    end if;
  end if;

  update public.items
    set status = p_status, status_updated_at = now(), status_updated_by = v_uid, status_verified = false
    where id = p_item_id;
  insert into public.item_status_log (item_id, status, user_id, kind) values (p_item_id, p_status, v_uid, 'report');
end;
$$;
