-- إشعارات الهاتف (Firebase): أجهزة المستخدمين + إشعار فوري عند وصول حجز أونلاين.
-- يُنفَّذ مرة واحدة من SQL Editor بعد 0001_init.sql.

create extension if not exists pg_net;

create table if not exists public.device_tokens (
  token text primary key,
  user_id uuid not null references auth.users on delete cascade,
  shop_id uuid not null references public.shops on delete cascade,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);
create index if not exists device_tokens_shop_idx on public.device_tokens (shop_id);

alter table public.device_tokens enable row level security;
drop policy if exists device_tokens_own on public.device_tokens;
create policy device_tokens_own on public.device_tokens for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and member_role(shop_id) is not null);

-- إعدادات الخادم (رابط الدوال والمفتاح السري للاستدعاء الداخلي). لا يقرأها التطبيق.
create table if not exists public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;

-- عند إضافة حجز من رابط الحجز أو واتساب نستدعي دالة notify-booking لإرسال الإشعار.
create or replace function public.notify_new_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url text := (select value from app_config where key = 'functions_url');
  v_secret text := (select value from app_config where key = 'cron_secret');
begin
  if new.collection = 'appointments' and new.data->>'source' in ('online', 'whatsapp')
     and v_url is not null and v_secret is not null then
    perform net.http_post(
      url := v_url || '/notify-booking',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
      body := jsonb_build_object('shop_id', new.shop_id, 'appointment', new.data)
    );
  end if;
  return new;
end $$;

drop trigger if exists records_notify_booking on public.records;
create trigger records_notify_booking after insert on public.records
for each row execute function public.notify_new_booking();
