-- إشعارات الويب (Web Push) لمن يستخدم التطبيق من المتصفح.
-- مفتاح VAPID يولّده الخادم نفسه (دالة notify-booking) ويبقى هنا: لا يراه أحد ولا يمر عبر لوحة أو محادثة.
create table if not exists public.push_keys (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_d text not null,
  created_at timestamptz not null default now()
);
alter table public.push_keys enable row level security;
revoke all on public.push_keys from anon, authenticated;
grant select, insert, update, delete on public.push_keys to service_role;

-- المفتاح العام فقط (يحتاجه المتصفح للاشتراك).
create or replace function public.vapid_public_key() returns text
language sql stable security definer set search_path = public as $$
  select public_key from push_keys where id = 1
$$;
revoke all on function public.vapid_public_key() from public;
grant execute on function public.vapid_public_key() to anon, authenticated;
