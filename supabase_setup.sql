-- Run this once in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.kitchen_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.service_days (
  service_date date primary key,
  capacity integer not null default 5 check (capacity >= 0),
  booked_meals integer not null default 0 check (booked_meals >= 0),
  ordering_open boolean not null default false,
  created_at timestamptz not null default now(),
  check (capacity >= booked_meals),
  check (extract(dow from service_date) in (2, 3, 4))
);
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  service_date date not null unique references public.service_days(service_date) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text,
  price numeric(10,2) not null check(price > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text unique not null,
  service_date date not null references public.service_days(service_date),
  customer_name text not null,
  phone text not null,
  delivery_address text,
  total_quantity integer not null check(total_quantity > 0),
  total_amount numeric(10,2) not null check(total_amount > 0),
  payment_status text not null default 'pending' check(payment_status in ('pending', 'paid')),
  order_status text not null default 'accepted' check(order_status in ('accepted', 'cancelled')),
  created_at timestamptz not null default now()
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid,
  item_name text not null,
  unit_price numeric(10,2) not null,
  quantity integer not null check(quantity > 0),
  line_total numeric(10,2) not null
);

alter table public.kitchen_admins enable row level security;
alter table public.service_days enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create or replace function public.is_kitchen_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select exists(select 1 from kitchen_admins where user_id = auth.uid()) $$;

create policy "public reads open dates" on public.service_days for select using (ordering_open = true);
create policy "admins manage dates" on public.service_days for all using (is_kitchen_admin()) with check (is_kitchen_admin());
create policy "public reads enabled menu" on public.menu_items for select using (
  enabled = true and exists(
    select 1 from service_days d
    where d.service_date = menu_items.service_date and d.ordering_open
  )
);
create policy "admins manage menu" on public.menu_items for all using (is_kitchen_admin()) with check (is_kitchen_admin());
create policy "admins read orders" on public.orders for select using (is_kitchen_admin());
create policy "admins update orders" on public.orders for update using (is_kitchen_admin()) with check (is_kitchen_admin());
create policy "admins read order items" on public.order_items for select using (is_kitchen_admin());

create or replace function public.place_meal_order(
  p_service_date date,
  p_customer_name text,
  p_phone text,
  p_delivery_address text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d service_days;
  item jsonb;
  m menu_items;
  qty integer := 0;
  total numeric := 0;
  o orders;
  code text;
begin
  select * into d from service_days where service_date = p_service_date for update;
  if not found or not d.ordering_open then
    raise exception 'Ordering is not open for this date.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one plate.';
  end if;
  for item in select * from jsonb_array_elements(p_items) loop
    select * into m from menu_items
    where id = (item->>'menu_item_id')::uuid
      and service_date = p_service_date
      and enabled = true;
    if not found then
      raise exception 'A selected menu item is no longer available. Please refresh the menu.';
    end if;
    if (item->>'quantity')::integer < 1 then
      raise exception 'Quantity must be at least one.';
    end if;
    qty := qty + (item->>'quantity')::integer;
    total := total + m.price * (item->>'quantity')::integer;
  end loop;
  if d.booked_meals + qty > d.capacity then
    raise exception 'Only % plate(s) are remaining for today. Please adjust your quantity to continue.',
      greatest(0, d.capacity - d.booked_meals);
  end if;
  code := 'TP-' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
  insert into orders(
    order_code, service_date, customer_name, phone, delivery_address,
    total_quantity, total_amount
  )
  values (
    code, p_service_date, trim(p_customer_name), trim(p_phone),
    nullif(trim(p_delivery_address), ''), qty, total
  )
  returning * into o;
  for item in select * from jsonb_array_elements(p_items) loop
    select * into m from menu_items where id = (item->>'menu_item_id')::uuid;
    insert into order_items(order_id, menu_item_id, item_name, unit_price, quantity, line_total)
    values (
      o.id, m.id, m.name, m.price, (item->>'quantity')::integer,
      m.price * (item->>'quantity')::integer
    );
  end loop;
  update service_days set booked_meals = booked_meals + qty where service_date = p_service_date;
  return jsonb_build_object('order_code', o.order_code, 'total_amount', o.total_amount);
end;
$$;
grant execute on function public.place_meal_order(date, text, text, text, jsonb) to anon, authenticated;

create or replace function public.cancel_order_and_release(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o orders;
  d service_days;
begin
  if not is_kitchen_admin() then
    raise exception 'Not authorized';
  end if;
  select * into o from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if o.order_status = 'cancelled' then
    return;
  end if;
  select * into d from service_days where service_date = o.service_date for update;
  update orders set order_status = 'cancelled' where id = o.id;
  update service_days
  set booked_meals = greatest(0, booked_meals - o.total_quantity)
  where service_date = o.service_date;
end;
$$;
grant execute on function public.cancel_order_and_release(uuid) to authenticated;

-- Create an admin user in Authentication > Users, then add that user with:
-- insert into public.kitchen_admins(user_id)
-- select id from auth.users where email = 'YOUR_ADMIN_EMAIL';
