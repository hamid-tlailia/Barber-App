-- الحجز غير المؤكد (بانتظار التأكيد) ينتهي دائماً بعد ساعة تأخير، حتى لو أُوقف «الإلغاء التلقائي» للمواعيد المؤكدة.

create or replace function public.check_late_appointments() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_url text := (select value from app_config where key = 'functions_url');
  v_secret text := (select value from app_config where key = 'cron_secret');
  v_today text := to_char(now() at time zone 'Asia/Qatar', 'YYYY-MM-DD');
  v_yesterday text := to_char((now() at time zone 'Asia/Qatar') - interval '1 day', 'YYYY-MM-DD');
  v_kind text;
  v_count int := 0;
  r record;
begin
  for r in
    select a.shop_id, a.id, a.data,
      ((a.data->>'date') || ' ' || (a.data->>'time'))::timestamp at time zone 'Asia/Qatar' as starts_at,
      coalesce(s.data->'settings'->>'autoCancelLate', 'true') <> 'false' as auto_cancel
    from records a
    left join records s on s.shop_id = a.shop_id and s.collection = 'meta' and s.id = 'settings' and not s.deleted
    where a.collection = 'appointments' and not a.deleted
      and a.data->>'status' in ('pending', 'confirmed', 'arrived')
      and a.data->>'date' in (v_yesterday, v_today)
      and coalesce(a.data->>'time', '') ~ '^\d{2}:\d{2}$'
  loop
    v_kind := null;
    if r.starts_at > now() or not shop_active(r.shop_id) then continue; end if;
    if r.starts_at > now() - interval '30 minutes' then
      -- حان الموعد (خلال آخر 15 دقيقة): إشعار للحلاق المعيّن وصاحب الصالون مرة واحدة.
      if coalesce(r.data->>'startNotified', '') = '' and r.starts_at > now() - interval '15 minutes' then
        update records set data = data || jsonb_build_object('startNotified', now()) where shop_id = r.shop_id and collection = 'appointments' and id = r.id;
        v_kind := 'starting';
      end if;
    elsif r.data->>'status' = 'arrived' then
      null;
    elsif coalesce(r.data->>'lateNotified', '') = '' then
      update records set data = data || jsonb_build_object('lateNotified', now()) where shop_id = r.shop_id and collection = 'appointments' and id = r.id;
      v_kind := 'late';
    elsif (r.auto_cancel or r.data->>'status' = 'pending') and coalesce(r.data->>'lateHandled', '') = ''
      and r.starts_at <= now() - interval '60 minutes'
      and (r.data->>'lateNotified')::timestamptz <= now() - interval '25 minutes' then
      update records set data = data || jsonb_build_object('status', 'cancelled', 'cancelledVia', 'late', 'cancelledAt', now())
        where shop_id = r.shop_id and collection = 'appointments' and id = r.id;
      v_kind := 'late_cancelled';
    end if;
    if v_kind is not null then
      v_count := v_count + 1;
      if v_url is not null and v_secret is not null then
        perform net.http_post(url := v_url || '/notify-booking',
          headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
          body := jsonb_build_object('kind', v_kind, 'shop_id', r.shop_id, 'appointment', r.data || jsonb_build_object('id', r.id)));
      end if;
    end if;
  end loop;
  return v_count;
end $$;
revoke execute on function public.check_late_appointments() from public, anon, authenticated;
