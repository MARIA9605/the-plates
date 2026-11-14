-- Run once in the existing Supabase project before deploying the updated app.
create or replace function public.enforce_ordering_deadline()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  deadline timestamptz;
begin
  deadline := ((new.service_date - 1) + time '21:00') at time zone 'Asia/Kolkata';
  if now() >= deadline then
    raise exception 'Orders for this date closed at 9:00 PM on the previous day.';
  end if;
  new.order_code := 'TP-' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  return new;
end;
$$;
drop trigger if exists enforce_ordering_deadline on public.orders;
create trigger enforce_ordering_deadline
before insert on public.orders
for each row execute function public.enforce_ordering_deadline();

create or replace function public.cancel_customer_order(p_order_code text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o orders;
  deadline timestamptz;
  normalized_phone text;
begin
  normalized_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if length(normalized_phone) < 8 then
    raise exception 'Enter the phone number used for this order.';
  end if;

  select * into o
  from orders
  where order_code = upper(trim(coalesce(p_order_code, '')))
    and regexp_replace(phone, '[^0-9]', '', 'g') = normalized_phone
  for update;

  if not found then
    raise exception 'We could not find an order matching that ID and phone number.';
  end if;
  if o.order_status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled', 'message', 'This order has already been cancelled.');
  end if;

  deadline := ((o.service_date - 1) + time '21:00') at time zone 'Asia/Kolkata';
  if now() >= deadline then
    raise exception 'Cancellation is no longer available. Orders can be cancelled until 9:00 PM IST on the day before service.';
  end if;

  perform 1 from service_days where service_date = o.service_date for update;
  if not found then
    raise exception 'The service date for this order could not be found.';
  end if;

  update orders set order_status = 'cancelled' where id = o.id;
  update service_days
  set booked_meals = greatest(0, booked_meals - o.total_quantity)
  where service_date = o.service_date;

  return jsonb_build_object(
    'status', 'cancelled',
    'message', 'Your order has been cancelled and the plates released back to available capacity.'
  );
end;
$$;
revoke all on function public.cancel_customer_order(text, text) from public;
grant execute on function public.cancel_customer_order(text, text) to anon, authenticated;
