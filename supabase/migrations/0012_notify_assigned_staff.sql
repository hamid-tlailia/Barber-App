-- إشعار الموظف عندما يُحجز له موعد من التطبيق (المالك أو الاستقبال)، أو يُحوَّل إليه موعد.
-- الحجوزات الأونلاين وواتساب كما كانت (تصل المالك والاستقبال والحلاق المعيّن).

create or replace function public.appointment_staff(p jsonb) returns text
language sql immutable as $$
  select coalesce(nullif(p->>'staffId', ''),
    (select i->>'staffId' from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) i where coalesce(i->>'staffId', '') <> '' limit 1), '');
$$;

create or replace function public.notify_new_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url text := (select value from app_config where key = 'functions_url');
  v_secret text := (select value from app_config where key = 'cron_secret');
  v_today text := to_char(now() at time zone 'Asia/Qatar', 'YYYY-MM-DD');
  v_staff text;
  v_kind text;
begin
  if new.collection <> 'appointments' or v_url is null or v_secret is null or new.deleted then return new; end if;

  if tg_op = 'INSERT' and new.data->>'source' in ('online', 'whatsapp') then
    v_kind := 'booking';
  else
    v_staff := appointment_staff(new.data);
    -- موعد قادم لموظف محدد: حجز جديد، أو تحويله من موظف آخر. لا شيء للمواعيد القديمة (مثل استعادة نسخة احتياطية).
    if v_staff = '' or coalesce(new.data->>'date', '') < v_today or new.data->>'status' in ('cancelled', 'no_show', 'completed') then return new; end if;
    if tg_op = 'INSERT' then
      if coalesce(new.data->>'createdAt', v_today) < to_char((now() at time zone 'Asia/Qatar') - interval '1 day', 'YYYY-MM-DD') then return new; end if;
      v_kind := 'assigned';
    elsif appointment_staff(old.data) is distinct from v_staff then
      v_kind := 'reassigned';
    else
      return new;
    end if;
  end if;

  perform net.http_post(
    url := v_url || '/notify-booking',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := jsonb_build_object('kind', v_kind, 'shop_id', new.shop_id, 'appointment', new.data, 'actor', new.updated_by)
  );
  return new;
end $$;

drop trigger if exists records_notify_booking on public.records;
create trigger records_notify_booking after insert or update on public.records
for each row execute function public.notify_new_booking();
