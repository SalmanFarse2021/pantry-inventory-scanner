-- Two-student verification for item status.
-- A status change shows immediately but is "pending" until a different signed-in student reports
-- the same status. A different status from another student replaces it (and is pending itself).
-- Abuse limits: a user can hold at most 30 unverified 'out' reports at once, and cannot change an
-- item they touched in the last 10 minutes (unless correcting their own pending report).

alter table public.items
  add column status_verified boolean not null default false;

-- 'report' sets the status; 'confirm' is a second student agreeing with it.
alter table public.item_status_log
  add column kind text not null default 'report' check (kind in ('report', 'confirm'));

-- Backs the per-user cap on outstanding unverified 'out' reports.
create index items_unverified_out on public.items (status_updated_by)
  where status = 'out' and not status_verified;

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

-- Same leading columns as before; 'pending' is new. A status with no reporter (carried over from the
-- old ledger) is not pending: nobody has reported it, so there is nothing to confirm.
create or replace view public.available_items as
  select
    i.id,
    i.name,
    i.categories[1] as category,
    i.thumbnail_path,
    i.status as availability,
    i.limit_per_visit,
    i.status_updated_at as updated_at,
    p.display_name as updated_by_name,
    (i.status_updated_by is not null and not i.status_verified) as pending
  from public.items i
  left join public.profiles p on p.user_id = i.status_updated_by
  where not ('other' = any (i.categories));
