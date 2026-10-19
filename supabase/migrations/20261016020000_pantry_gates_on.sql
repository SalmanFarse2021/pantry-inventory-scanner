-- 20261015020000_pantry_gate.sql was edited after it was first applied, so some databases are
-- missing pantry_gates_on() and the gates_enabled setting that its newer functions call.
-- Idempotent: safe on databases that already have them.
insert into public.pantry_settings (key, value) values ('gates_enabled', 'false')
  on conflict (key) do nothing;

create or replace function public.pantry_gates_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.pantry_settings where key = 'gates_enabled'), 'true') = 'true';
$$;
revoke all on function public.pantry_gates_on() from public, anon, authenticated;
