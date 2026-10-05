-- Pantry inventory: schema, views, functions, RLS.
-- Stock changes only through inventory_events (append-only ledger).

create extension if not exists pg_trgm;
create extension if not exists vector;

-- ---------- tables ----------

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('worker', 'manager')),
  created_at timestamptz not null default now()
);

-- Keep in sync with shared/categories.ts.
create table public.categories (
  slug text primary key,
  sort_order int not null
);
insert into public.categories (slug, sort_order) values
  ('produce', 1), ('canned_jarred', 2), ('soup_broth', 3), ('pasta_grains_rice', 4),
  ('bread_bakery', 5), ('breakfast_cereal', 6), ('snacks', 7), ('beverages', 8),
  ('dairy_eggs', 9), ('meat_protein', 10), ('frozen', 11), ('condiments_sauces_spices', 12),
  ('baking', 13), ('baby', 14), ('supplements', 15), ('personal_care', 16),
  ('household', 17), ('other', 18);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  size text,
  categories text[] not null check (cardinality(categories) between 1 and 3),
  subcategory text,
  thumbnail_path text,
  limit_per_visit int check (limit_per_visit is null or limit_per_visit > 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index items_name_trgm on public.items using gin (name gin_trgm_ops);

create table public.item_images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  storage_path text not null,
  source text not null check (source in ('worker_confirmed', 'seed')),
  created_at timestamptz not null default now()
);

create table public.intake_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  photo_path text not null,
  quantity int not null check (quantity > 0),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'green', 'yellow', 'red', 'waiting_quota')),
  item_id uuid references public.items (id) on delete set null,
  candidates jsonb,
  model_used text,
  attempts int not null default 0,
  error text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  type text not null check (type in ('intake', 'checkout', 'adjustment')),
  delta int not null check (delta <> 0),
  actor uuid references auth.users (id), -- null for student checkouts
  job_id uuid references public.intake_jobs (id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_events_item on public.inventory_events (item_id);

create table public.api_usage (
  model text not null,
  day date not null,
  count int not null default 0,
  primary key (model, day)
);

-- ---------- helper functions ----------

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

create function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and role = 'manager');
$$;

-- ---------- views ----------

-- Staff-only: real counts. security_invoker so RLS on the base tables applies.
create view public.item_stock with (security_invoker = true) as
  select i.id as item_id, coalesce(sum(e.delta), 0)::int as stock
  from public.items i
  left join public.inventory_events e on e.item_id = i.id
  group by i.id;

-- Public: no counts. Runs as owner (default view behavior) on purpose, so anon
-- can see availability without any access to the ledger itself.
create view public.available_items as
  select
    i.id,
    i.name,
    i.categories[1] as category,
    i.thumbnail_path,
    case
      when coalesce(sum(e.delta), 0) <= 0 then 'out'
      when coalesce(sum(e.delta), 0) <= 3 then 'low'
      else 'in_stock'
    end as availability,
    i.limit_per_visit
  from public.items i
  left join public.inventory_events e on e.item_id = i.id
  group by i.id;

-- ---------- checkout (the one deliberate anonymous write) ----------

create function public.checkout_item(p_item_id uuid, p_qty int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_limit int;
  v_stock int;
begin
  if p_qty is null or p_qty < 1 then
    raise exception 'quantity must be at least 1';
  end if;

  -- Lock the item row so concurrent checkouts cannot oversell.
  select limit_per_visit into v_limit from public.items where id = p_item_id for update;
  if not found then
    raise exception 'item not found';
  end if;
  if v_limit is not null and p_qty > v_limit then
    raise exception 'limit is % per visit', v_limit;
  end if;

  select coalesce(sum(delta), 0) into v_stock from public.inventory_events where item_id = p_item_id;
  if p_qty > v_stock then
    raise exception 'only % in stock', v_stock;
  end if;

  insert into public.inventory_events (item_id, type, delta, actor)
  values (p_item_id, 'checkout', -p_qty, null);
end;
$$;

revoke all on function public.checkout_item(uuid, int) from public;
grant execute on function public.checkout_item(uuid, int) to anon, authenticated;

-- ---------- row-level security ----------

alter table public.staff enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.item_images enable row level security;
alter table public.intake_jobs enable row level security;
alter table public.inventory_events enable row level security;
alter table public.api_usage enable row level security; -- no policies: service role only

-- staff
create policy staff_select on public.staff for select to authenticated
  using (user_id = auth.uid() or public.is_manager());
create policy staff_manager_insert on public.staff for insert to authenticated
  with check (public.is_manager());
create policy staff_manager_update on public.staff for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy staff_manager_delete on public.staff for delete to authenticated
  using (public.is_manager());

-- categories: readable by everyone, never written from the client
create policy categories_read on public.categories for select to anon, authenticated using (true);

-- items
create policy items_staff_select on public.items for select to authenticated using (public.is_staff());
create policy items_staff_insert on public.items for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());
create policy items_staff_update on public.items for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy items_delete on public.items for delete to authenticated
  using (public.is_manager() or (public.is_staff() and created_by = auth.uid()));

-- item_images
create policy item_images_staff_all on public.item_images for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- intake_jobs
create policy intake_jobs_staff_select on public.intake_jobs for select to authenticated
  using (public.is_staff());
create policy intake_jobs_staff_insert on public.intake_jobs for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());
create policy intake_jobs_staff_update on public.intake_jobs for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- inventory_events: append-only. No update or delete policies.
-- Staff may insert intake and adjustment rows only; checkouts go through checkout_item().
create policy events_staff_select on public.inventory_events for select to authenticated
  using (public.is_staff());
create policy events_staff_insert on public.inventory_events for insert to authenticated
  with check (public.is_staff() and type in ('intake', 'adjustment') and actor = auth.uid());

-- ---------- grants ----------

revoke all on public.available_items from anon, authenticated;
grant select on public.available_items to anon, authenticated;
revoke all on public.api_usage from anon, authenticated;
-- Defense in depth: even with a policy mistake, the ledger cannot be edited or deleted by clients.
revoke update, delete, truncate on public.inventory_events from anon, authenticated;

-- ---------- realtime ----------

alter publication supabase_realtime add table public.intake_jobs;

-- ---------- storage ----------

-- Full-size intake photos: private, staff only.
insert into storage.buckets (id, name, public) values ('intake-photos', 'intake-photos', false);
-- Thumbnails shown to students: public read, staff write.
insert into storage.buckets (id, name, public) values ('thumbnails', 'thumbnails', true);

create policy intake_photos_staff on storage.objects for all to authenticated
  using (bucket_id = 'intake-photos' and public.is_staff())
  with check (bucket_id = 'intake-photos' and public.is_staff());
create policy thumbnails_staff_write on storage.objects for all to authenticated
  using (bucket_id = 'thumbnails' and public.is_staff())
  with check (bucket_id = 'thumbnails' and public.is_staff());
