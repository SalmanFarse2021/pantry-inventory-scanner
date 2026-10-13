-- Direction pivot (docs/project-direction-plan.md): any signed-in UTA student sets an item's
-- availability (in stock / low / out), and the public catalog shows when and by whom.
-- Registration is limited to @uta.edu and @mavs.uta.edu. The staff and ledger tables stay,
-- but the public catalog no longer reads from the ledger.

-- ---------- email domain rule ----------

create function public.is_uta_email(p_email text) returns boolean
language sql immutable as $$
  select coalesce(lower(p_email), '') ~ '^[^@[:space:]]+@(mavs\.)?uta\.edu$';
$$;

-- ---------- profiles (public display name for attribution) ----------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles for select to authenticated
  using (user_id = auth.uid());
-- No client writes: rows are created by the signup trigger below.

insert into public.profiles (user_id, display_name)
  select id, left(split_part(email, '@', 1), 40) from auth.users where email is not null
  on conflict do nothing;

-- Runs inside the signup transaction, so raising here rejects the registration.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_uta_email(new.email) then
    raise exception 'Only @uta.edu and @mavs.uta.edu emails can register';
  end if;
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 40)
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- item status ----------

alter table public.items
  add column status text not null default 'out' check (status in ('in_stock', 'low', 'out')),
  add column status_updated_at timestamptz,
  add column status_updated_by uuid references auth.users (id) on delete set null;

-- Carry over what the ledger said so the catalog is not blank after migrating.
update public.items i set
  status = case
    when s.stock <= 0 then 'out'
    when s.stock <= 3 then 'low'
    else 'in_stock'
  end,
  status_updated_at = i.created_at
from (
  select it.id, coalesce(sum(e.delta), 0) as stock
  from public.items it left join public.inventory_events e on e.item_id = it.id
  group by it.id
) s
where s.id = i.id;

-- History of every update (the plan's "verifications"). Written only by set_item_status.
create table public.item_status_log (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  status text not null check (status in ('in_stock', 'low', 'out')),
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index item_status_log_item on public.item_status_log (item_id, created_at desc);
alter table public.item_status_log enable row level security; -- no policies: function only

create function public.set_item_status(p_item_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_uta_email(auth.jwt() ->> 'email') then
    raise exception 'sign in with a UTA email to update stock';
  end if;
  if p_status not in ('in_stock', 'low', 'out') then
    raise exception 'invalid status';
  end if;

  update public.items
    set status = p_status, status_updated_at = now(), status_updated_by = auth.uid()
    where id = p_item_id;
  if not found then raise exception 'item not found'; end if;

  insert into public.item_status_log (item_id, status, user_id) values (p_item_id, p_status, auth.uid());
end;
$$;

revoke all on function public.set_item_status(uuid, text) from public, anon;
grant execute on function public.set_item_status(uuid, text) to authenticated;

-- ---------- public view ----------

-- Same leading columns as before (replace requires it); new ones at the end. Runs as owner so
-- anon can read availability and the updater's display name without table access.
create or replace view public.available_items as
  select
    i.id,
    i.name,
    i.categories[1] as category,
    i.thumbnail_path,
    i.status as availability,
    i.limit_per_visit,
    i.status_updated_at as updated_at,
    p.display_name as updated_by_name
  from public.items i
  left join public.profiles p on p.user_id = i.status_updated_by;
