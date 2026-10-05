-- Phase 4: inventory management. Stock still changes only through inventory_events; these
-- functions lock the item row so an adjustment cannot push stock below zero, and give "mark
-- out of stock" a single atomic step (read the stock and write the offsetting row together).

create function public.adjust_stock(p_item_id uuid, p_delta int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_stock int;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'adjustment must not be zero'; end if;

  perform 1 from public.items where id = p_item_id for update;
  if not found then raise exception 'item not found'; end if;

  select coalesce(sum(delta), 0) into v_stock from public.inventory_events where item_id = p_item_id;
  if v_stock + p_delta < 0 then
    raise exception 'only % in stock', v_stock;
  end if;

  insert into public.inventory_events (item_id, type, delta, actor)
  values (p_item_id, 'adjustment', p_delta, auth.uid());
  return v_stock + p_delta;
end;
$$;

create function public.mark_out_of_stock(p_item_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_stock int;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  perform 1 from public.items where id = p_item_id for update;
  if not found then raise exception 'item not found'; end if;

  select coalesce(sum(delta), 0) into v_stock from public.inventory_events where item_id = p_item_id;
  if v_stock > 0 then
    insert into public.inventory_events (item_id, type, delta, actor)
    values (p_item_id, 'adjustment', -v_stock, auth.uid());
  end if;
end;
$$;

revoke all on function public.adjust_stock(uuid, int) from public, anon;
revoke all on function public.mark_out_of_stock(uuid) from public, anon;
grant execute on function public.adjust_stock(uuid, int) to authenticated;
grant execute on function public.mark_out_of_stock(uuid) to authenticated;
