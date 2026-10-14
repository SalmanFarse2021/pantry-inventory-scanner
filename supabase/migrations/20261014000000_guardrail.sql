-- Gemini content guardrail.
-- 1. A job the guardrail refuses ends as 'rejected' with a reason; no item is created for it.
-- 2. Items in the 'other' category are hidden from the public catalog until a moderation layer exists.

alter table public.intake_jobs drop constraint if exists intake_jobs_status_check;
alter table public.intake_jobs add constraint intake_jobs_status_check
  check (status in ('queued', 'processing', 'green', 'yellow', 'red', 'waiting_quota', 'rejected'));

-- Keep in sync with REJECT_REASONS in shared/guardrail.ts.
alter table public.intake_jobs add column reject_reason text
  check (reject_reason is null or reject_reason in (
    'not_a_product', 'alcohol', 'tobacco_vape', 'medicine', 'unsafe', 'inappropriate', 'not_grocery', 'unreadable'
  ));

-- Same columns as before; only the filter is new. Runs as owner so anon needs no table access.
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
  left join public.profiles p on p.user_id = i.status_updated_by
  where not ('other' = any (i.categories));
