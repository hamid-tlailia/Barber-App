-- حذف الصالون والحساب:
-- • صاحب الصالون يطلب الحذف مع السبب ← يصل المالكَ إشعار (جوال + بريد) ورسالة واتساب.
-- • المالك يوافق من لوحته ← تُحذف كل بيانات الصالون، وحساب صاحبه، وحسابات موظفيه التي لا تنتمي لصالون آخر.
-- • نحتفظ فقط ببصمة مُشفّرة (بريد/هاتف/جهاز) لمنع تكرار التجربة المجانية بعد الحذف.

alter table public.shops add column if not exists deletion_requested_at timestamptz;
alter table public.shops add column if not exists deletion_reason text;

create table if not exists public.trial_history (
  kind text not null,          -- email | phone | device
  value text not null,         -- md5 للبريد، آخر 8 أرقام للهاتف، معرّف الجهاز
  created_at timestamptz not null default now(),
  primary key (kind, value)
);
alter table public.trial_history enable row level security;
revoke all on public.trial_history from anon, authenticated;

-- التجربة المجانية مرة واحدة: حساب، رقم، جهاز — حتى بعد حذف صالون سابق.
create or replace function public.create_shop(p_name text, p_kind text, p_phone text, p_device text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_trial timestamptz := now() + interval '7 days';
  v_device text := nullif(trim(coalesce(p_device, '')), '');
  v_email text := (select md5(lower(email)) from auth.users where id = auth.uid());
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;
  if length(digits(p_phone)) < 8 then raise exception 'phone_required'; end if;
  if exists (select 1 from shops where right(digits(phone), 8) = right(digits(p_phone), 8) and owner_id <> auth.uid()) then
    raise exception 'phone_taken';
  end if;
  if exists (select 1 from shops where owner_id = auth.uid())
     or (v_device is not null and exists (select 1 from shop_devices where device_id = v_device))
     or exists (select 1 from trial_history where (kind = 'email' and value = v_email)
                  or (kind = 'phone' and value = right(digits(p_phone), 8))
                  or (kind = 'device' and value = v_device)) then
    v_trial := now();
  end if;
  insert into shops (name, kind, phone, owner_id, trial_ends_at)
  values (trim(p_name), coalesce(nullif(p_kind, ''), 'men'), trim(p_phone), auth.uid(), v_trial)
  returning id into v_id;
  insert into shop_members (shop_id, user_id, role, display_name)
  values (v_id, auth.uid(), 'owner', (select coalesce(raw_user_meta_data->>'name', email) from auth.users where id = auth.uid()));
  if v_device is not null then insert into shop_devices (device_id, shop_id) values (v_device, v_id) on conflict do nothing; end if;
  return v_id;
end $$;

-- ───────── طلب الحذف من صاحب الصالون ─────────
create or replace function public.request_shop_deletion(p_shop uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_url text := (select value from app_config where key = 'functions_url');
  v_secret text := (select value from app_config where key = 'cron_secret');
begin
  if member_role(p_shop) is distinct from 'owner' then raise exception 'forbidden'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  update shops set deletion_requested_at = now(), deletion_reason = left(trim(p_reason), 1000) where id = p_shop;
  if v_url is not null and v_secret is not null then
    perform net.http_post(url := v_url || '/notify-booking',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'deletion_request', 'shop_id', p_shop));
  end if;
end $$;

create or replace function public.cancel_shop_deletion(p_shop uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if member_role(p_shop) is distinct from 'owner' then raise exception 'forbidden'; end if;
  update shops set deletion_requested_at = null, deletion_reason = null where id = p_shop;
end $$;

create or replace function public.shop_deletion_status(p_shop uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('requested_at', deletion_requested_at, 'reason', deletion_reason)
  from shops where id = p_shop and member_role(p_shop) = 'owner';
$$;

-- ───────── الحذف الفعلي (تستدعيه دالة delete-shop بمفتاح الخدمة بعد التحقق أن الطالب هو المالك) ─────────
-- يحذف الصالون (وكل جداوله تُحذف تلقائياً)، ويعيد الحسابات التي يجب حذفها من نظام الدخول:
-- صاحب الصالون إن لم يبق له صالون آخر، والموظفون الذين لا ينتمون لأي صالون آخر. حسابات المالكين (المشرفين) لا تُحذف.
create or replace function public.delete_shop_data(p_shop uuid, p_delete_owner boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v shops;
  v_users uuid[];
begin
  select * into v from shops where id = p_shop;
  if v.id is null then raise exception 'not_found'; end if;

  insert into trial_history (kind, value)
    select 'email', md5(lower(u.email)) from auth.users u where u.id = v.owner_id and u.email is not null
    union select 'phone', right(digits(v.phone), 8) where length(digits(v.phone)) >= 8
    union select 'device', device_id from shop_devices where shop_id = p_shop
  on conflict do nothing;

  select coalesce(array_agg(m.user_id), '{}') into v_users from shop_members m
  where m.shop_id = p_shop
    and not exists (select 1 from app_admins a where a.user_id = m.user_id)
    and not exists (select 1 from shop_members o where o.user_id = m.user_id and o.shop_id <> p_shop)
    and (m.user_id <> v.owner_id or (p_delete_owner and not exists (select 1 from shops s where s.owner_id = v.owner_id and s.id <> p_shop)));

  delete from shops where id = p_shop;
  return jsonb_build_object('name', v.name, 'users', to_jsonb(v_users));
end $$;
revoke execute on function public.delete_shop_data(uuid, boolean) from public, anon, authenticated;

-- قائمة المالك: إظهار طلبات الحذف.
drop function if exists public.admin_list_shops();
create or replace function public.admin_list_shops()
returns table (id uuid, name text, kind text, phone text, owner_email text, created_at timestamptz,
  trial_ends_at timestamptz, paid_until timestamptz, plan text, active boolean, records bigint, last_activity timestamptz, admin_note text,
  wa_addon boolean, ai_addon boolean, grace_until timestamptz, members bigint, duplicate_of text,
  deletion_requested_at timestamptz, deletion_reason text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.kind, s.phone, u.email::text, s.created_at, s.trial_ends_at, s.paid_until, s.plan,
    shop_active(s.id),
    (select count(*) from records r where r.shop_id = s.id and not r.deleted),
    (select max(r.updated_at) from records r where r.shop_id = s.id),
    s.admin_note,
    coalesce(i.wa_addon, false), coalesce(i.ai_addon, false), s.grace_until,
    (select count(*) from shop_members m where m.shop_id = s.id),
    (select string_agg(distinct o.name, '، ') from shops o
      where o.id <> s.id and o.owner_id <> s.owner_id and (
        (digits(o.phone) <> '' and right(digits(o.phone), 8) = right(digits(s.phone), 8))
        or exists (select 1 from shop_devices a join shop_devices b on a.device_id = b.device_id where a.shop_id = s.id and b.shop_id = o.id))),
    s.deletion_requested_at, s.deletion_reason
  from shops s join auth.users u on u.id = s.owner_id
  left join shop_integrations i on i.shop_id = s.id
  where is_admin()
  order by s.deletion_requested_at desc nulls last, s.created_at desc;
$$;

-- بيانات إشعار طلب الحذف (لدالة الإشعارات فقط).
create or replace function public.deletion_request_info(p_shop uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', s.name, 'phone', s.phone, 'email', u.email, 'reason', s.deletion_reason,
    'members', (select count(*) from shop_members m where m.shop_id = s.id), 'paid_until', s.paid_until)
  from shops s join auth.users u on u.id = s.owner_id where s.id = p_shop;
$$;
revoke execute on function public.deletion_request_info(uuid) from public, anon, authenticated;

revoke execute on function public.admin_list_shops() from anon;
revoke execute on function public.create_shop(text, text, text, text) from anon;
revoke execute on function public.request_shop_deletion(uuid, text) from anon;
revoke execute on function public.cancel_shop_deletion(uuid) from anon;
revoke execute on function public.shop_deletion_status(uuid) from anon;
