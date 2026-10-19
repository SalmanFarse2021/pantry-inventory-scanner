-- Shelf scans: "Update stock" is a photo of a whole shelf. The API reads every product in it, matches
-- each one against the catalog and parks the result here as 'ready'. The student then looks at the
-- list and confirms; only that confirmation changes any item, and it only ever sets 'in_stock'.
-- Nothing is marked low or out by a scan.
--
-- A shelf scan is separate from intake_jobs on purpose: a job is one photo of one product that
-- creates or updates one item, a scan is one photo of many products that updates existing items only.
--
-- Lifecycle (status): queued -> processing -> ready -> confirmed
--                     any step may end in red (retry), waiting_quota (retry after reset) or rejected.
-- detections (written by the API, shape in shared/shelfScan.ts) is a json array, one entry per
-- product the model saw: name, confidence, a bounding box, and the match result.

create table public.shelf_scans (
  id uuid primary key default gen_random_uuid(),
  photo_path text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'ready', 'confirmed', 'red', 'waiting_quota', 'rejected')),
  detections jsonb,
  reject_reason text,
  model_used text,
  attempts int not null default 0,
  error text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index shelf_scans_by_user on public.shelf_scans (created_by, created_at desc);

alter table public.shelf_scans enable row level security;
create policy shelf_scans_select_own on public.shelf_scans for select to authenticated
  using (public.is_uta_user() and created_by = auth.uid());
create policy shelf_scans_insert_own on public.shelf_scans for insert to authenticated
  with check (
    public.is_uta_user() and created_by = auth.uid()
    and status = 'queued' and detections is null and reject_reason is null
  );
revoke update, delete, truncate on public.shelf_scans from anon, authenticated;

alter publication supabase_realtime add table public.shelf_scans;

-- Same presence gate as photo uploads (hours and a recent check-in). The API is exempt.
create function public.shelf_scans_presence_gate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if exists (select 1 from public.shelf_scans where id = new.id) then return new; end if;
  perform public.assert_can_update_stock();
  return new;
end;
$$;
revoke all on function public.shelf_scans_presence_gate() from public, anon, authenticated;
create trigger shelf_scans_presence_gate before insert on public.shelf_scans
  for each row execute function public.shelf_scans_presence_gate();

-- Mark the ticked items in stock. Goes through set_item_status so the two-student verification,
-- the cooldown and the presence gate all apply exactly as they do for a single item. An item that
-- set_item_status refuses (you reported it a moment ago, say) is skipped and reported back; the
-- rest still go through.
--
-- Returns { updated: n, skipped: [{ item_id, reason }] }.
create function public.confirm_shelf_scan(p_scan_id uuid, p_item_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_scan public.shelf_scans;
  v_id uuid;
  v_updated int := 0;
  v_skipped jsonb := '[]'::jsonb;
begin
  if not public.is_uta_user() then
    raise exception 'sign in with a UTA email to update stock';
  end if;
  if coalesce(array_length(p_item_ids, 1), 0) = 0 then
    raise exception 'select at least one item';
  end if;
  if array_length(p_item_ids, 1) > 200 then
    raise exception 'too many items';
  end if;
  perform public.assert_can_update_stock();

  select * into v_scan from public.shelf_scans where id = p_scan_id and created_by = v_uid for update;
  if not found then raise exception 'scan not found'; end if;
  if v_scan.status <> 'ready' then raise exception 'this scan was already confirmed or is not ready'; end if;

  -- Only items the scan actually found (matched or offered as a candidate) can be confirmed from it.
  for v_id in select distinct x from unnest(p_item_ids) x loop
    if not exists (
      select 1 from public.shelf_scans s, jsonb_array_elements(s.detections) d
      where s.id = p_scan_id
        and (d ->> 'item_id' = v_id::text
             or exists (select 1 from jsonb_array_elements(coalesce(d -> 'candidates', '[]')) c where c ->> 'item_id' = v_id::text))
    ) then
      v_skipped := v_skipped || jsonb_build_object('item_id', v_id, 'reason', 'not in this scan');
      continue;
    end if;
    begin
      perform public.set_item_status(v_id, 'in_stock');
      v_updated := v_updated + 1;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('item_id', v_id, 'reason', sqlerrm);
    end;
  end loop;

  update public.shelf_scans set status = 'confirmed', confirmed_at = now() where id = p_scan_id;
  return jsonb_build_object('updated', v_updated, 'skipped', v_skipped);
end;
$$;
revoke all on function public.confirm_shelf_scan(uuid, uuid[]) from public, anon;
grant execute on function public.confirm_shelf_scan(uuid, uuid[]) to authenticated;
