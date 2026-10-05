-- Phase 3: name matching and review. Jobs keep what Gemini read ("identified") so a worker can
-- resolve them later, and resolving goes through functions so the item, the intake event and the
-- job status always change together. resolve_intake_job (Phase 2) is superseded; drop it once
-- the new API is deployed.

alter table public.intake_jobs add column identified jsonb;

create function public.resolve_job_existing(p_job_id uuid, p_item_id uuid, p_model text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_job public.intake_jobs;
  v_actor uuid := auth.uid(); -- null for the service role (the API)
begin
  if v_actor is not null and not public.is_staff() then
    raise exception 'staff only';
  end if;
  select * into v_job from public.intake_jobs where id = p_job_id for update;
  if not found then raise exception 'job not found'; end if;
  if not exists (select 1 from public.items where id = p_item_id) then
    raise exception 'item not found';
  end if;
  if v_job.item_id is not null then return v_job.item_id; end if; -- already resolved

  insert into public.inventory_events (item_id, type, delta, actor, job_id)
  values (p_item_id, 'intake', v_job.quantity, coalesce(v_actor, v_job.created_by), v_job.id);

  update public.intake_jobs
  set item_id = p_item_id, status = 'green', model_used = coalesce(p_model, model_used), error = null
  where id = p_job_id;

  if v_actor is not null then
    insert into public.item_images (item_id, storage_path, source)
    values (p_item_id, v_job.photo_path, 'worker_confirmed');
  end if;
  return p_item_id;
end;
$$;

-- p_status is 'yellow' when the API creates an item on its own (a worker should look at it once)
-- and 'green' when a worker creates it.
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
  v_job public.intake_jobs;
  v_actor uuid := auth.uid();
  v_item_id uuid;
begin
  if v_actor is not null and not public.is_staff() then
    raise exception 'staff only';
  end if;
  if p_status not in ('green', 'yellow') then raise exception 'bad status'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'name required'; end if;
  if exists (select 1 from unnest(p_categories) c where c not in (select slug from public.categories)) then
    raise exception 'unknown category';
  end if;

  select * into v_job from public.intake_jobs where id = p_job_id for update;
  if not found then raise exception 'job not found'; end if;
  if v_job.item_id is not null then return v_job.item_id; end if;

  insert into public.items (name, brand, size, categories, thumbnail_path, created_by)
  values (btrim(p_name), nullif(btrim(p_brand), ''), nullif(btrim(p_size), ''), p_categories,
          v_job.id::text || '.jpg', coalesce(v_actor, v_job.created_by))
  returning id into v_item_id;

  insert into public.inventory_events (item_id, type, delta, actor, job_id)
  values (v_item_id, 'intake', v_job.quantity, coalesce(v_actor, v_job.created_by), v_job.id);

  update public.intake_jobs
  set item_id = v_item_id, status = p_status, model_used = coalesce(p_model, model_used), error = null
  where id = p_job_id;

  if v_actor is not null then
    insert into public.item_images (item_id, storage_path, source)
    values (v_item_id, v_job.photo_path, 'worker_confirmed');
  end if;
  return v_item_id;
end;
$$;

-- A worker accepts an item the API created on its own (yellow -> green).
create function public.confirm_job(p_job_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_job public.intake_jobs;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  select * into v_job from public.intake_jobs where id = p_job_id for update;
  if not found then raise exception 'job not found'; end if;
  if v_job.item_id is null then raise exception 'nothing to confirm'; end if;
  if v_job.status = 'green' then return; end if;

  update public.intake_jobs set status = 'green' where id = p_job_id;
  if not exists (select 1 from public.item_images where item_id = v_job.item_id and storage_path = v_job.photo_path) then
    insert into public.item_images (item_id, storage_path, source)
    values (v_job.item_id, v_job.photo_path, 'worker_confirmed');
  end if;
end;
$$;

revoke all on function public.resolve_job_existing(uuid, uuid, text) from public, anon;
revoke all on function public.resolve_job_new(uuid, text, text, text, text[], text, text) from public, anon;
revoke all on function public.confirm_job(uuid) from public, anon;
grant execute on function public.resolve_job_existing(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.resolve_job_new(uuid, text, text, text, text[], text, text) to authenticated, service_role;
grant execute on function public.confirm_job(uuid) to authenticated;
