-- Any signed-in UTA user keeps the pantry up to date; there is no staff or manager role.
-- 1. Staff, manager and the stock ledger go away. Availability is the three statuses on items.
-- 2. Scanning a photo sets a status (in stock / low / out) instead of adding a quantity. If the
--    photo is an item we already have, its status is updated; otherwise a new item is created.
-- 3. Nobody deletes items. Marking an item "out" is the only way to take it off the shelf.
-- 4. RLS: signed-in UTA users read items and their own jobs. Every write to items goes through
--    the functions below.

-- ---------- tear down staff, ledger and their policies ----------

drop policy items_staff_select on public.items;
drop policy items_staff_insert on public.items;
drop policy items_staff_update on public.items;
drop policy items_delete on public.items;
drop policy item_images_staff_all on public.item_images;
drop policy intake_jobs_staff_select on public.intake_jobs;
drop policy intake_jobs_staff_insert on public.intake_jobs;
drop policy intake_jobs_staff_update on public.intake_jobs;
drop policy intake_photos_staff on storage.objects;
drop policy thumbnails_staff_write on storage.objects;

drop view public.item_stock;
drop function public.adjust_stock(uuid, int);
drop function public.mark_out_of_stock(uuid);
drop function public.checkout_item(uuid, int);
drop function public.resolve_intake_job(uuid, text, text, text, text[], text);
drop function public.resolve_job_existing(uuid, uuid, text);
drop function public.resolve_job_new(uuid, text, text, text, text[], text, text);
drop function public.confirm_job(uuid);

drop table public.inventory_events;
drop table public.staff;
drop function public.is_staff();
drop function public.is_manager();

-- ---------- jobs carry a status instead of a quantity ----------

alter table public.intake_jobs drop column quantity;
alter table public.intake_jobs
  add column availability text not null default 'in_stock' check (availability in ('in_stock', 'low', 'out'));

alter table public.item_images drop constraint item_images_source_check;
update public.item_images set source = 'user_confirmed' where source = 'worker_confirmed';
alter table public.item_images
  add constraint item_images_source_check check (source in ('user_confirmed', 'seed'));

-- ---------- who may write ----------

-- Registration is already limited to UTA emails (handle_new_user); this keeps the rule in one place.
create function public.is_uta_user() returns boolean
language sql stable as $$
  select auth.uid() is not null and public.is_uta_email(auth.jwt() ->> 'email');
$$;

-- items: readable by signed-in users; no direct writes, no deletes.
create policy items_read on public.items for select to authenticated using (public.is_uta_user());
revoke insert, update, delete, truncate on public.items from anon, authenticated;

-- item_images: written only by the functions below.
revoke all on public.item_images from anon, authenticated;

-- intake_jobs: each user sees and creates only their own jobs, always starting queued.
-- Everything after that is done by the API (service role) or the functions below.
create policy intake_jobs_select_own on public.intake_jobs for select to authenticated
  using (public.is_uta_user() and created_by = auth.uid());
create policy intake_jobs_insert_own on public.intake_jobs for insert to authenticated
  with check (
    public.is_uta_user() and created_by = auth.uid()
    and status = 'queued' and item_id is null and candidates is null and identified is null
  );
revoke update, delete, truncate on public.intake_jobs from anon, authenticated;

-- storage: photos live under <user id>/..., so a user only reaches their own.
create policy intake_photos_own on storage.objects for all to authenticated
  using (bucket_id = 'intake-photos' and public.is_uta_user() and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'intake-photos' and public.is_uta_user() and (storage.foldername(name))[1] = auth.uid()::text);
-- Thumbnails are public to read. Users add them (and may replace one on a retried upload) but never delete.
create policy thumbnails_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'thumbnails' and public.is_uta_user());
create policy thumbnails_update on storage.objects for update to authenticated
  using (bucket_id = 'thumbnails' and public.is_uta_user())
  with check (bucket_id = 'thumbnails' and public.is_uta_user());

-- ---------- functions ----------

-- The one place an item's status changes. Not callable by clients.
create function public.apply_item_status(p_item_id uuid, p_status text, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.items
    set status = p_status, status_updated_at = now(), status_updated_by = p_user
    where id = p_item_id;
  if not found then raise exception 'item not found'; end if;
  insert into public.item_status_log (item_id, status, user_id) values (p_item_id, p_status, p_user);
end;
$$;
revoke all on function public.apply_item_status(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.set_item_status(p_item_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_uta_user() then
    raise exception 'sign in with a UTA email to update stock';
  end if;
  if p_status not in ('in_stock', 'low', 'out') then
    raise exception 'invalid status';
  end if;
  perform public.apply_item_status(p_item_id, p_status, auth.uid());
end;
$$;

-- Load a job for resolving. v_actor is null for the API (service role); a signed-in user may
-- only touch their own jobs.
create function public.lock_job(p_job_id uuid) returns public.intake_jobs
language plpgsql security definer set search_path = public as $$
declare
  v_job public.intake_jobs;
begin
  if auth.uid() is not null and not public.is_uta_user() then
    raise exception 'sign in with a UTA email';
  end if;
  select * into v_job from public.intake_jobs where id = p_job_id for update;
  if not found then raise exception 'job not found'; end if;
  if auth.uid() is not null and v_job.created_by <> auth.uid() then
    raise exception 'job not found';
  end if;
  return v_job;
end;
$$;
revoke all on function public.lock_job(uuid) from public, anon, authenticated;

-- This photo is an item we already have: set its status to what the user chose.
create function public.resolve_job_existing(p_job_id uuid, p_item_id uuid, p_model text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_job public.intake_jobs := public.lock_job(p_job_id);
  v_actor uuid := coalesce(auth.uid(), v_job.created_by);
begin
  if not exists (select 1 from public.items where id = p_item_id) then
    raise exception 'item not found';
  end if;
  if v_job.item_id is not null then return v_job.item_id; end if; -- already resolved

  perform public.apply_item_status(p_item_id, v_job.availability, v_actor);

  update public.intake_jobs
  set item_id = p_item_id, status = 'green', model_used = coalesce(p_model, model_used), error = null
  where id = p_job_id;

  if auth.uid() is not null then
    insert into public.item_images (item_id, storage_path, source)
    values (p_item_id, v_job.photo_path, 'user_confirmed');
  end if;
  return p_item_id;
end;
$$;

-- p_status is 'yellow' when the API creates an item on its own (the user should look at it once)
-- and 'green' when the user creates it.
create function public.resolve_job_new(
  p_job_id uuid,
  p_name text,
  p_brand text,
  p_size text,
  p_categories text[],
  p_status text default 'green',
  p_model text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_job public.intake_jobs := public.lock_job(p_job_id);
  v_actor uuid := coalesce(auth.uid(), v_job.created_by);
  v_item_id uuid;
begin
  if p_status not in ('green', 'yellow') then raise exception 'bad status'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'name required'; end if;
  if exists (select 1 from unnest(p_categories) c where c not in (select slug from public.categories)) then
    raise exception 'unknown category';
  end if;
  if v_job.item_id is not null then return v_job.item_id; end if;

  insert into public.items (name, brand, size, categories, thumbnail_path, created_by)
  values (btrim(p_name), nullif(btrim(p_brand), ''), nullif(btrim(p_size), ''), p_categories,
          v_job.id::text || '.jpg', v_actor)
  returning id into v_item_id;

  perform public.apply_item_status(v_item_id, v_job.availability, v_actor);

  update public.intake_jobs
  set item_id = v_item_id, status = p_status, model_used = coalesce(p_model, model_used), error = null
  where id = p_job_id;

  if auth.uid() is not null then
    insert into public.item_images (item_id, storage_path, source)
    values (v_item_id, v_job.photo_path, 'user_confirmed');
  end if;
  return v_item_id;
end;
$$;

-- The user checks an item the API created from their photo (yellow -> green), fixing its details
-- if needed. Only the job that created the item can edit it; matched items are never edited here.
create function public.confirm_job(p_job_id uuid, p_name text, p_brand text, p_categories text[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_job public.intake_jobs := public.lock_job(p_job_id);
begin
  if v_job.item_id is null then raise exception 'nothing to confirm'; end if;
  if v_job.status = 'green' then return; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'name required'; end if;
  if exists (select 1 from unnest(p_categories) c where c not in (select slug from public.categories)) then
    raise exception 'unknown category';
  end if;

  update public.items
  set name = btrim(p_name), brand = nullif(btrim(p_brand), ''), categories = p_categories
  where id = v_job.item_id;

  update public.intake_jobs set status = 'green' where id = p_job_id;
  if not exists (select 1 from public.item_images where item_id = v_job.item_id and storage_path = v_job.photo_path) then
    insert into public.item_images (item_id, storage_path, source)
    values (v_job.item_id, v_job.photo_path, 'user_confirmed');
  end if;
end;
$$;

revoke all on function public.resolve_job_existing(uuid, uuid, text) from public, anon;
revoke all on function public.resolve_job_new(uuid, text, text, text, text[], text, text) from public, anon;
revoke all on function public.confirm_job(uuid, text, text, text[]) from public, anon;
grant execute on function public.resolve_job_existing(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.resolve_job_new(uuid, text, text, text, text[], text, text) to authenticated, service_role;
grant execute on function public.confirm_job(uuid, text, text, text[]) to authenticated;
