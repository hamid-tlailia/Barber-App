-- صاحب الصالون يوقف الحجز الأونلاين أو عبر واتساب (مؤقتاً حتى تاريخ عودة، أو حتى يعيد تشغيله).
-- الإعدادات في meta/settings: onlineBookingOff / onlineBookingUntil و waBookingOff / waBookingUntil (تاريخ العودة، فارغ = حتى إشعار آخر).
create or replace function public.booking_paused(p_shop uuid, p_channel text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((s.data->'settings'->>(p_channel || 'BookingOff'))::boolean, false)
    and (coalesce(s.data->'settings'->>(p_channel || 'BookingUntil'), '') = ''
      or to_char(now() at time zone 'Asia/Qatar', 'YYYY-MM-DD') < s.data->'settings'->>(p_channel || 'BookingUntil'))
  from (select (select data from records where shop_id = p_shop and collection = 'meta' and id = 'settings' and not deleted) as data) s;
$$;
revoke all on function public.booking_paused(uuid, text) from public, anon;
grant execute on function public.booking_paused(uuid, text) to authenticated, service_role;

-- يرفض الخادم أي حجز جديد يصل من القناة الموقوفة (الرابط أو واتساب)، أياً كان مصدره. المواعيد الموجودة تبقى قابلة للتعديل.
create or replace function public.guard_booking_pause() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_channel text;
begin
  if new.deleted then return new; end if;
  v_channel := case new.data->>'source' when 'online' then 'online' when 'whatsapp' then 'wa' end;
  if v_channel is null then return new; end if;
  if exists (select 1 from records where shop_id = new.shop_id and collection = new.collection and id = new.id) then return new; end if;
  if booking_paused(new.shop_id, v_channel) then raise exception 'booking_paused' using errcode = '42501'; end if;
  return new;
end $$;

drop trigger if exists records_guard_booking_pause on public.records;
create trigger records_guard_booking_pause before insert on public.records
  for each row when (new.collection = 'appointments') execute function public.guard_booking_pause();
