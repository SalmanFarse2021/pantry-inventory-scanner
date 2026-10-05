-- Phase 2: server-side helpers for /api/identify. Called with the service key only.

-- Atomically claim one request against a model's daily quota. Returns false when the
-- model is out for the day, so the caller can skip to the next tier before getting a 429.
create function public.reserve_model_usage(p_model text, p_day date, p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  insert into public.api_usage (model, day, count) values (p_model, p_day, 0)
  on conflict (model, day) do nothing;

  update public.api_usage set count = count + 1
  where model = p_model and day = p_day and count < p_limit
  returning count into v_count;

  return v_count is not null;
end;
$$;

-- A 429 means the model is out regardless of our own counter; pin the counter to the limit.
create function public.exhaust_model_usage(p_model text, p_day date, p_limit int) returns void
language sql security definer set search_path = public as $$
  insert into public.api_usage (model, day, count) values (p_model, p_day, p_limit)
  on conflict (model, day) do update set count = greatest(public.api_usage.count, p_limit);
$$;

-- Turn a successful identification into a new item plus its intake event, in one
-- transaction. Idempotent: a job that already has an item is left alone (retried requests).
-- Phase 3 replaces "always new item" with the name match.
create function public.resolve_intake_job(
  p_job_id uuid,
  p_name text,
  p_brand text,
  p_size text,
  p_categories text[],
  p_model text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_job public.intake_jobs;
  v_item_id uuid;
begin
  select * into v_job from public.intake_jobs where id = p_job_id for update;
  if not found then
    raise exception 'job not found';
  end if;
  if v_job.item_id is not null then
    return v_job.item_id;
  end if;

  insert into public.items (name, brand, size, categories, thumbnail_path, created_by)
  values (p_name, p_brand, p_size, p_categories, v_job.id::text || '.jpg', v_job.created_by)
  returning id into v_item_id;

  insert into public.inventory_events (item_id, type, delta, actor, job_id)
  values (v_item_id, 'intake', v_job.quantity, v_job.created_by, v_job.id);

  update public.intake_jobs
  set item_id = v_item_id, status = 'green', model_used = p_model, error = null
  where id = p_job_id;

  return v_item_id;
end;
$$;

revoke all on function public.reserve_model_usage(text, date, int) from public, anon, authenticated;
revoke all on function public.exhaust_model_usage(text, date, int) from public, anon, authenticated;
revoke all on function public.resolve_intake_job(uuid, text, text, text, text[], text) from public, anon, authenticated;
grant execute on function public.reserve_model_usage(text, date, int) to service_role;
grant execute on function public.exhaust_model_usage(text, date, int) to service_role;
grant execute on function public.resolve_intake_job(uuid, text, text, text, text[], text) to service_role;
