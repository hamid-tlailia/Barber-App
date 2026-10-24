-- أدوات المالك: مهلة السداد، إيقاف حساب موظف، نظرة عامة على كل صالون، نصوص الرسائل لكل صالون،
-- إشعار صاحب الصالون بعمليات موظفيه، وإشعار المالك بالاشتراكات القريبة من الانتهاء.

-- ───────────── مهلة السداد (3 أيام كحد أقصى بعد انتهاء الاشتراك) ─────────────
alter table public.shops add column if not exists grace_until timestamptz;

create or replace function public.shop_active(p_shop uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shops
    where id = p_shop and plan <> 'suspended'
      and (trial_ends_at > now()
        or (paid_until is not null and paid_until > now())
        or (grace_until is not null and grace_until > now()))
  );
$$;

create or replace function public.admin_grant_grace(p_shop uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v shops; v_until timestamptz;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into v from shops where id = p_shop;
  if v.paid_until is null then raise exception 'not_subscribed'; end if;
  if v.grace_until is not null and v.grace_until > v.paid_until then raise exception 'grace_already_given'; end if;
  v_until := greatest(v.paid_until, now()) + interval '3 days';
  update shops set grace_until = v_until where id = p_shop;
  return v_until;
end $$;

-- التجديد يلغي المهلة. التجديد بنفس الخطة يُضاف من نهاية الاشتراك الحالي.
create or replace function public.admin_set_license(p_shop uuid, p_plan text, p_paid_until timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update shops set plan = p_plan, paid_until = p_paid_until, grace_until = null, admin_note = coalesce(p_note, admin_note) where id = p_shop;
end $$;

-- ───────────── إيقاف حساب موظف ترك العمل ─────────────
alter table public.shop_members add column if not exists suspended boolean not null default false;

create or replace function public.member_role(p_shop uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from shop_members where shop_id = p_shop and user_id = auth.uid() and not suspended;
$$;

create or replace function public.set_member_suspended(p_shop uuid, p_user uuid, p_suspended boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if member_role(p_shop) not in ('owner', 'manager') then raise exception 'forbidden'; end if;
  update shop_members set suspended = p_suspended where shop_id = p_shop and user_id = p_user and role <> 'owner';
  if p_suspended then delete from device_tokens where shop_id = p_shop and user_id = p_user; end if;
end $$;

drop function if exists public.shop_team(uuid);
create or replace function public.shop_team(p_shop uuid)
returns table (user_id uuid, role text, staff_id text, display_name text, email text, suspended boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.role, m.staff_id, m.display_name, u.email::text, m.suspended
  from shop_members m join auth.users u on u.id = m.user_id
  where m.shop_id = p_shop and member_role(p_shop) in ('owner', 'manager');
$$;

-- أسماء من قام بالعمليات (لسجل التعديلات) — متاحة للمالك والمدير.
create or replace function public.shop_people(p_shop uuid)
returns table (user_id uuid, display_name text, role text)
language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(m.display_name, u.email::text), m.role
  from shop_members m join auth.users u on u.id = m.user_id
  where m.shop_id = p_shop and member_role(p_shop) in ('owner', 'manager');
$$;

drop function if exists public.my_shops();
create or replace function public.my_shops()
returns table (id uuid, name text, kind text, slug text, phone text, role text, staff_id text,
  trial_ends_at timestamptz, paid_until timestamptz, plan text, active boolean, server_time timestamptz,
  grace_until timestamptz, member_suspended boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.kind, s.slug, s.phone, m.role, m.staff_id, s.trial_ends_at, s.paid_until, s.plan,
    shop_active(s.id), now(), s.grace_until, m.suspended
  from shops s join shop_members m on m.shop_id = s.id and m.user_id = auth.uid()
  order by s.created_at;
$$;

-- ───────────── لوحة المالك ─────────────
drop function if exists public.admin_list_shops();
create or replace function public.admin_list_shops()
returns table (id uuid, name text, kind text, phone text, owner_email text, created_at timestamptz,
  trial_ends_at timestamptz, paid_until timestamptz, plan text, active boolean, records bigint, last_activity timestamptz, admin_note text,
  wa_addon boolean, ai_addon boolean, grace_until timestamptz, members bigint)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.kind, s.phone, u.email::text, s.created_at, s.trial_ends_at, s.paid_until, s.plan,
    shop_active(s.id),
    (select count(*) from records r where r.shop_id = s.id and not r.deleted),
    (select max(r.updated_at) from records r where r.shop_id = s.id),
    s.admin_note,
    coalesce(i.wa_addon, false), coalesce(i.ai_addon, false), s.grace_until,
    (select count(*) from shop_members m where m.shop_id = s.id)
  from shops s join auth.users u on u.id = s.owner_id
  left join shop_integrations i on i.shop_id = s.id
  where is_admin()
  order by s.created_at desc;
$$;

-- نظرة عامة على صالون (بدون أي أرقام مالية).
create or replace function public.admin_shop_overview(p_shop uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_settings jsonb; v_today text := to_char(now() at time zone 'Asia/Qatar', 'YYYY-MM-DD');
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select data->'settings' into v_settings from records where shop_id = p_shop and collection = 'meta' and id = 'settings';
  return jsonb_build_object(
    'slug', (select slug from shops where id = p_shop),
    'hours', v_settings->'hours',
    'members', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(m.display_name, u.email::text), 'role', m.role, 'suspended', m.suspended)), '[]')
                from shop_members m join auth.users u on u.id = m.user_id where m.shop_id = p_shop),
    'staff', (select count(*) from records where shop_id = p_shop and collection = 'staff' and not deleted and coalesce(data->>'active', 'true') <> 'false'),
    'services', (select count(*) from records where shop_id = p_shop and collection = 'services' and not deleted),
    'clients', (select count(*) from records where shop_id = p_shop and collection = 'clients' and not deleted),
    'appointments', (select count(*) from records where shop_id = p_shop and collection = 'appointments' and not deleted),
    'appointments_30d', (select count(*) from records where shop_id = p_shop and collection = 'appointments' and not deleted
                          and data->>'date' >= to_char((now() at time zone 'Asia/Qatar') - interval '30 days', 'YYYY-MM-DD') and data->>'date' <= v_today),
    'upcoming', (select count(*) from records where shop_id = p_shop and collection = 'appointments' and not deleted
                  and data->>'date' >= v_today and data->>'status' in ('pending', 'confirmed')),
    'online', (select count(*) from records where shop_id = p_shop and collection = 'appointments' and not deleted and data->>'source' in ('online', 'whatsapp')),
    'products', (select count(*) from records where shop_id = p_shop and collection = 'products' and not deleted),
    'devices', (select count(*) from device_tokens where shop_id = p_shop)
  );
end $$;

-- نصوص الرسائل: يحررها المالك لكل صالون (لا تظهر لصاحب الصالون).
create or replace function public.admin_get_templates(p_shop uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select data->'settings'->'templates' from records where shop_id = p_shop and collection = 'meta' and id = 'settings'), '{}'::jsonb);
end $$;

create or replace function public.admin_set_templates(p_shop uuid, p_templates jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  insert into records (shop_id, collection, id, data)
  values (p_shop, 'meta', 'settings', jsonb_build_object('settings', jsonb_build_object('templates', p_templates)))
  on conflict (shop_id, collection, id) do update
    set data = jsonb_set(coalesce(records.data, '{}'::jsonb), '{settings}',
      coalesce(records.data->'settings', '{}'::jsonb) || jsonb_build_object('templates', p_templates));
end $$;

-- المالك يرى المفاتيح المحفوظة ويستطيع نسخها.
create or replace function public.admin_get_integration(p_shop uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v shop_integrations;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into v from shop_integrations where shop_id = p_shop;
  return jsonb_build_object(
    'wa_addon', coalesce(v.wa_addon, false), 'ai_addon', coalesce(v.ai_addon, false), 'ai_provider', coalesce(v.ai_provider, 'anthropic'),
    'wa_phone_number_id', coalesce(v.wa_phone_number_id, ''), 'wa_token', coalesce(v.wa_token, ''), 'ai_key', coalesce(v.ai_key, ''),
    'has_token', v.wa_token is not null, 'has_ai_key', v.ai_key is not null, 'owner_whatsapp', coalesce(v.owner_whatsapp, ''));
end $$;

-- ───────────── إشعار صاحب الصالون بعمليات موظفيه ─────────────
create or replace function public.notify_staff_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url text := (select value from app_config where key = 'functions_url');
  v_secret text := (select value from app_config where key = 'cron_secret');
  v_role text;
begin
  if new.user_id is null or v_url is null or v_secret is null then return new; end if;
  if new.collection not in ('appointments', 'clients', 'sales', 'expenses', 'drawers', 'services', 'products', 'giftCards', 'clientPackages', 'staff') then return new; end if;
  select role into v_role from shop_members where shop_id = new.shop_id and user_id = new.user_id;
  if v_role is null or v_role = 'owner' then return new; end if;
  perform net.http_post(
    url := v_url || '/notify-booking',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := jsonb_build_object('kind', 'activity', 'shop_id', new.shop_id, 'user_id', new.user_id, 'collection', new.collection,
      'action', new.action, 'before', new.before, 'after', new.after)
  );
  return new;
end $$;
drop trigger if exists audit_notify_owner on public.audit_log;
create trigger audit_notify_owner after insert on public.audit_log
for each row execute function public.notify_staff_activity();

-- ───────────── إشعار المالك يومياً بالاشتراكات القريبة من الانتهاء (9 صباحاً بتوقيت قطر) ─────────────
do $$ begin
  perform cron.unschedule('miqass-expiring');
exception when others then null; end $$;
select cron.schedule('miqass-expiring', '0 6 * * *', $$
  select net.http_post(
    url := (select value from app_config where key = 'functions_url') || '/notify-booking',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select value from app_config where key = 'cron_secret'), 'Content-Type', 'application/json'),
    body := '{"kind":"expiring"}'::jsonb);
$$);

revoke execute on function public.admin_grant_grace(uuid) from anon;
revoke execute on function public.admin_shop_overview(uuid) from anon;
revoke execute on function public.admin_get_templates(uuid) from anon;
revoke execute on function public.admin_set_templates(uuid, jsonb) from anon;
revoke execute on function public.admin_list_shops() from anon;
revoke execute on function public.set_member_suspended(uuid, uuid, boolean) from anon;
