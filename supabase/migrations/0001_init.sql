-- مِقص — قاعدة بيانات الصالونات (Supabase / Postgres)
-- يُنفَّذ مرة واحدة من SQL Editor في لوحة Supabase أو عبر `supabase db push`.

create extension if not exists pgcrypto;

-- ───────────────────────── الجداول ─────────────────────────

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'men' check (kind in ('men', 'women', 'mixed')),
  slug text unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  phone text,
  owner_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  -- الترخيص: لا يملك صاحب المحل صلاحية تعديل هذه الحقول؛ فقط المطوّر عبر admin_set_license.
  trial_ends_at timestamptz not null default now() + interval '7 days',
  paid_until timestamptz,
  plan text not null default 'trial' check (plan in ('trial', 'monthly', 'yearly', 'lifetime', 'suspended')),
  admin_note text
);

create table if not exists public.shop_members (
  shop_id uuid not null references public.shops on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('owner', 'manager', 'reception', 'staff')),
  staff_id text,
  display_name text,
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users on delete cascade
);

-- كل بيانات الصالون (زبائن، مواعيد، مخزون...) تُخزَّن كسجلات JSON مع مزامنة تزايدية حسب updated_at.
create table if not exists public.records (
  shop_id uuid not null references public.shops on delete cascade,
  collection text not null check (collection ~ '^[a-zA-Z]{2,40}$'),
  id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (shop_id, collection, id)
);
create index if not exists records_sync_idx on public.records (shop_id, updated_at);

create table if not exists public.audit_log (
  id bigserial primary key,
  shop_id uuid not null references public.shops on delete cascade,
  user_id uuid,
  collection text not null,
  record_id text not null,
  action text not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index if not exists audit_shop_idx on public.audit_log (shop_id, at desc);

create table if not exists public.invites (
  code text primary key default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  shop_id uuid not null references public.shops on delete cascade,
  role text not null check (role in ('manager', 'reception', 'staff')),
  staff_id text,
  created_by uuid not null default auth.uid(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid
);

-- إعدادات واتساب لكل صالون. الرمز السري لا يُقرأ من التطبيق إطلاقاً (صلاحيات أعمدة).
create table if not exists public.shop_integrations (
  shop_id uuid primary key references public.shops on delete cascade,
  wa_phone_number_id text,
  wa_token text,
  owner_whatsapp text,
  reminders_enabled boolean not null default true,
  assistant_enabled boolean not null default false,
  daily_report_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- سجل رسائل واتساب الصادرة، يُستخدم لربط ردود الزبائن بالصالون والموعد.
create table if not exists public.wa_outbox (
  id bigserial primary key,
  shop_id uuid not null references public.shops on delete cascade,
  phone text not null,
  appointment_id text,
  kind text not null,
  sent_at timestamptz not null default now(),
  status text not null default 'sent'
);
create index if not exists wa_outbox_phone_idx on public.wa_outbox (phone, sent_at desc);

-- سجل محادثة المساعد الذكي (آخر الرسائل لكل رقم).
create table if not exists public.wa_conversations (
  shop_id uuid not null references public.shops on delete cascade,
  phone text not null,
  messages jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (shop_id, phone)
);

-- ───────────────────────── دوال مساعدة ─────────────────────────

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid());
$$;

create or replace function public.member_role(p_shop uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from shop_members where shop_id = p_shop and user_id = auth.uid();
$$;

create or replace function public.shop_active(p_shop uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shops
    where id = p_shop and plan <> 'suspended'
      and (trial_ends_at > now() or (paid_until is not null and paid_until > now()))
  );
$$;

create or replace function public.digits(p text) returns text
language sql immutable as $$ select regexp_replace(coalesce(p, ''), '\D', '', 'g'); $$;

-- ───────────────────────── المشغّلات ─────────────────────────

-- وقت الخادم هو المرجع للمزامنة (وليس ساعة الجهاز).
create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
for each row execute function public.records_touch();

-- سجل تدقيق: من عدّل أو حذف ماذا ومتى (يحمي صاحب المحل من التلاعب بالفواتير).
create or replace function public.records_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.collection in ('photos', 'messages') then return new; end if;
  if tg_op = 'INSERT' then
    insert into audit_log (shop_id, user_id, collection, record_id, action, after)
    values (new.shop_id, auth.uid(), new.collection, new.id, 'create', new.data);
  elsif new.deleted and not old.deleted then
    insert into audit_log (shop_id, user_id, collection, record_id, action, before)
    values (new.shop_id, auth.uid(), new.collection, new.id, 'delete', old.data);
  elsif old.data is distinct from new.data then
    insert into audit_log (shop_id, user_id, collection, record_id, action, before, after)
    values (new.shop_id, auth.uid(), new.collection, new.id, 'update', old.data, new.data);
  end if;
  return new;
end $$;
drop trigger if exists records_audit on public.records;
create trigger records_audit after insert or update on public.records
for each row execute function public.records_audit();

-- ───────────────────────── صلاحيات الصفوف (RLS) ─────────────────────────

alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.app_admins enable row level security;
alter table public.records enable row level security;
alter table public.audit_log enable row level security;
alter table public.invites enable row level security;
alter table public.shop_integrations enable row level security;
alter table public.wa_outbox enable row level security;
alter table public.wa_conversations enable row level security;

drop policy if exists shops_read on public.shops;
create policy shops_read on public.shops for select
  using (member_role(id) is not null or is_admin());
-- لا توجد سياسة insert/update على shops: الإنشاء والتعديل عبر دوال create_shop/update_shop فقط.

drop policy if exists members_read on public.shop_members;
create policy members_read on public.shop_members for select
  using (member_role(shop_id) is not null);
drop policy if exists members_remove on public.shop_members;
create policy members_remove on public.shop_members for delete
  using (member_role(shop_id) in ('owner', 'manager') and role <> 'owner');

drop policy if exists admins_self on public.app_admins;
create policy admins_self on public.app_admins for select using (user_id = auth.uid());

-- القراءة متاحة للأعضاء دائماً (حتى بعد انتهاء التجربة) ليتمكن صاحب المحل من تصدير بياناته.
drop policy if exists records_read on public.records;
create policy records_read on public.records for select
  using (member_role(shop_id) is not null);

-- الكتابة مقفلة بعد انتهاء التجربة دون شراء. الحذف للمالك والمدير فقط.
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert
  with check (member_role(shop_id) is not null and shop_active(shop_id) and not deleted);
drop policy if exists records_update on public.records;
create policy records_update on public.records for update
  using (member_role(shop_id) is not null and shop_active(shop_id))
  with check (
    shop_active(shop_id)
    and (not deleted or member_role(shop_id) in ('owner', 'manager') or collection in ('waitlist', 'messages', 'notes'))
  );

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select
  using (member_role(shop_id) in ('owner', 'manager'));

drop policy if exists invites_read on public.invites;
create policy invites_read on public.invites for select
  using (member_role(shop_id) in ('owner', 'manager'));

drop policy if exists integrations_read on public.shop_integrations;
create policy integrations_read on public.shop_integrations for select
  using (member_role(shop_id) in ('owner', 'manager'));
revoke select (wa_token) on public.shop_integrations from authenticated, anon;

-- ───────────────────────── دوال التطبيق ─────────────────────────

create or replace function public.server_now() returns timestamptz
language sql stable as $$ select now(); $$;

-- إنشاء صالون: تجربة واحدة فقط لكل مستخدم ولكل رقم هاتف لمنع تكرار التجربة المجانية.
create or replace function public.create_shop(p_name text, p_kind text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_trial timestamptz := now() + interval '7 days';
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;
  if exists (select 1 from shops where owner_id = auth.uid())
     or (digits(p_phone) <> '' and exists (select 1 from shops where digits(phone) = digits(p_phone))) then
    v_trial := now(); -- سبق استخدام التجربة: يُنشأ الصالون لكنه يحتاج تفعيلاً.
  end if;
  insert into shops (name, kind, phone, owner_id, trial_ends_at)
  values (trim(p_name), coalesce(nullif(p_kind, ''), 'men'), p_phone, auth.uid(), v_trial)
  returning id into v_id;
  insert into shop_members (shop_id, user_id, role, display_name)
  values (v_id, auth.uid(), 'owner', (select coalesce(raw_user_meta_data->>'name', email) from auth.users where id = auth.uid()));
  return v_id;
end $$;

create or replace function public.update_shop(p_shop uuid, p_name text, p_kind text, p_phone text, p_slug text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if member_role(p_shop) not in ('owner', 'manager') then raise exception 'forbidden'; end if;
  update shops set
    name = coalesce(nullif(trim(p_name), ''), name),
    kind = coalesce(nullif(p_kind, ''), kind),
    phone = coalesce(p_phone, phone),
    slug = nullif(lower(trim(p_slug)), '')
  where id = p_shop;
end $$;

create or replace function public.my_shops()
returns table (id uuid, name text, kind text, slug text, phone text, role text, staff_id text,
  trial_ends_at timestamptz, paid_until timestamptz, plan text, active boolean, server_time timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.kind, s.slug, s.phone, m.role, m.staff_id, s.trial_ends_at, s.paid_until, s.plan,
    shop_active(s.id), now()
  from shops s join shop_members m on m.shop_id = s.id and m.user_id = auth.uid()
  order by s.created_at;
$$;

create or replace function public.shop_team(p_shop uuid)
returns table (user_id uuid, role text, staff_id text, display_name text, email text)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.role, m.staff_id, m.display_name, u.email::text
  from shop_members m join auth.users u on u.id = m.user_id
  where m.shop_id = p_shop and member_role(p_shop) in ('owner', 'manager');
$$;

create or replace function public.create_invite(p_shop uuid, p_role text, p_staff text)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if member_role(p_shop) not in ('owner', 'manager') then raise exception 'forbidden'; end if;
  insert into invites (shop_id, role, staff_id) values (p_shop, p_role, nullif(p_staff, '')) returning code into v_code;
  return v_code;
end $$;

create or replace function public.accept_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v invites;
begin
  select * into v from invites where code = upper(trim(p_code)) and used_by is null and expires_at > now();
  if v.code is null then raise exception 'invalid_invite'; end if;
  insert into shop_members (shop_id, user_id, role, staff_id, display_name)
  values (v.shop_id, auth.uid(), v.role, v.staff_id, (select coalesce(raw_user_meta_data->>'name', email) from auth.users where id = auth.uid()))
  on conflict (shop_id, user_id) do update set role = excluded.role, staff_id = excluded.staff_id;
  update invites set used_by = auth.uid() where code = v.code;
  return v.shop_id;
end $$;

create or replace function public.save_integration(p_shop uuid, p_phone_number_id text, p_token text, p_owner_whatsapp text,
  p_reminders boolean, p_assistant boolean, p_daily boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if member_role(p_shop) <> 'owner' then raise exception 'forbidden'; end if;
  insert into shop_integrations (shop_id, wa_phone_number_id, wa_token, owner_whatsapp, reminders_enabled, assistant_enabled, daily_report_enabled)
  values (p_shop, nullif(p_phone_number_id, ''), nullif(p_token, ''), p_owner_whatsapp, p_reminders, p_assistant, p_daily)
  on conflict (shop_id) do update set
    wa_phone_number_id = coalesce(nullif(excluded.wa_phone_number_id, ''), shop_integrations.wa_phone_number_id),
    wa_token = coalesce(nullif(excluded.wa_token, ''), shop_integrations.wa_token),
    owner_whatsapp = excluded.owner_whatsapp,
    reminders_enabled = excluded.reminders_enabled,
    assistant_enabled = excluded.assistant_enabled,
    daily_report_enabled = excluded.daily_report_enabled,
    updated_at = now();
end $$;

-- ───────────────────────── لوحة المطوّر (بيع التراخيص) ─────────────────────────

create or replace function public.admin_list_shops()
returns table (id uuid, name text, kind text, phone text, owner_email text, created_at timestamptz,
  trial_ends_at timestamptz, paid_until timestamptz, plan text, active boolean, records bigint, last_activity timestamptz, admin_note text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.kind, s.phone, u.email::text, s.created_at, s.trial_ends_at, s.paid_until, s.plan,
    shop_active(s.id),
    (select count(*) from records r where r.shop_id = s.id and not r.deleted),
    (select max(r.updated_at) from records r where r.shop_id = s.id),
    s.admin_note
  from shops s join auth.users u on u.id = s.owner_id
  where is_admin()
  order by s.created_at desc;
$$;

create or replace function public.admin_set_license(p_shop uuid, p_plan text, p_paid_until timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update shops set plan = p_plan, paid_until = p_paid_until, admin_note = coalesce(p_note, admin_note) where id = p_shop;
end $$;

create or replace function public.admin_extend_trial(p_shop uuid, p_days int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update shops set trial_ends_at = greatest(trial_ends_at, now()) + make_interval(days => p_days) where id = p_shop;
end $$;

-- ───────────────────────── الحجز الأونلاين (رابط عام بدون تسجيل دخول) ─────────────────────────

create or replace function public.public_shop(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', s.name, 'kind', s.kind, 'phone', s.phone, 'active', shop_active(s.id),
    'settings', (select data from records where shop_id = s.id and collection = 'meta' and id = 'settings' and not deleted),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.data->>'name', 'price', r.data->'price',
        'duration', r.data->'duration', 'processing', r.data->'processing', 'category', r.data->>'category', 'deposit', r.data->'deposit'))
      from records r where r.shop_id = s.id and r.collection = 'services' and not r.deleted and coalesce(r.data->>'online', 'true') <> 'false'), '[]'),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.data->>'name', 'specialty', r.data->>'specialty'))
      from records r where r.shop_id = s.id and r.collection = 'staff' and not r.deleted and coalesce(r.data->>'active', 'true') <> 'false'), '[]'),
    'busy', coalesce((select jsonb_agg(jsonb_build_object('date', r.data->>'date', 'time', r.data->>'time', 'duration', r.data->'duration', 'staffId', r.data->>'staffId', 'items', r.data->'items'))
      from records r where r.shop_id = s.id and r.collection = 'appointments' and not r.deleted
        and r.data->>'status' not in ('cancelled', 'no_show')
        and r.data->>'date' between to_char(now(), 'YYYY-MM-DD') and to_char(now() + interval '30 days', 'YYYY-MM-DD')), '[]')
  )
  from shops s where s.slug = lower(p_slug);
$$;

create or replace function public.public_book(p_slug text, p_name text, p_phone text, p_service_ids text[], p_staff text,
  p_date text, p_time text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid;
  v_client text;
  v_items jsonb := '[]';
  v_total numeric := 0;
  v_duration int := 0;
  v_deposit numeric := 0;
  v_id text := gen_random_uuid()::text;
  r record;
begin
  select id into v_shop from shops where slug = lower(p_slug);
  if v_shop is null or not shop_active(v_shop) then raise exception 'shop_unavailable'; end if;
  if length(digits(p_phone)) < 8 or coalesce(trim(p_name), '') = '' then raise exception 'invalid_contact'; end if;
  if p_date !~ '^\d{4}-\d{2}-\d{2}$' or p_time !~ '^\d{2}:\d{2}$' or p_date::date < current_date then raise exception 'invalid_time'; end if;
  -- حماية بسيطة من الإزعاج: ٣ حجوزات أونلاين كحد أقصى لكل رقم في اليوم.
  if (select count(*) from records where shop_id = v_shop and collection = 'appointments'
      and data->>'source' = 'online' and digits(data->>'onlinePhone') = digits(p_phone)
      and updated_at > now() - interval '1 day') >= 3 then raise exception 'too_many'; end if;

  for r in select id, data from records where shop_id = v_shop and collection = 'services' and not deleted and id = any(p_service_ids) loop
    v_items := v_items || jsonb_build_array(jsonb_build_object('serviceId', r.id, 'name', r.data->>'name',
      'price', coalesce((r.data->>'price')::numeric, 0), 'duration', coalesce((r.data->>'duration')::int, 30),
      'processing', coalesce((r.data->>'processing')::int, 0), 'staffId', coalesce(p_staff, '')));
    v_total := v_total + coalesce((r.data->>'price')::numeric, 0);
    v_duration := v_duration + coalesce((r.data->>'duration')::int, 30);
    v_deposit := v_deposit + coalesce((r.data->>'deposit')::numeric, 0);
  end loop;
  if jsonb_array_length(v_items) = 0 then raise exception 'no_services'; end if;

  if exists (select 1 from records where shop_id = v_shop and collection = 'appointments' and not deleted
      and data->>'date' = p_date and data->>'status' not in ('cancelled', 'no_show')
      and (coalesce(p_staff, '') = '' or coalesce(data->>'staffId', '') in ('', p_staff))
      and (split_part(data->>'time', ':', 1)::int * 60 + split_part(data->>'time', ':', 2)::int) < (split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int + v_duration)
      and (split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int) < (split_part(data->>'time', ':', 1)::int * 60 + split_part(data->>'time', ':', 2)::int + coalesce((data->>'duration')::int, 30))) then
    raise exception 'slot_taken';
  end if;

  select id into v_client from records where shop_id = v_shop and collection = 'clients' and not deleted
    and right(digits(data->>'phone'), 8) = right(digits(p_phone), 8) limit 1;
  if v_client is null then
    v_client := gen_random_uuid()::text;
    insert into records (shop_id, collection, id, data) values (v_shop, 'clients', v_client,
      jsonb_build_object('id', v_client, 'name', trim(p_name), 'phone', p_phone, 'notes', '', 'source', 'online', 'createdAt', to_char(now(), 'YYYY-MM-DD')));
  end if;

  insert into records (shop_id, collection, id, data) values (v_shop, 'appointments', v_id, jsonb_build_object(
    'id', v_id, 'clientId', v_client, 'items', v_items, 'staffId', coalesce(p_staff, ''), 'date', p_date, 'time', p_time,
    'duration', v_duration, 'price', v_total, 'deposit', v_deposit, 'status', 'pending', 'payments', '[]'::jsonb,
    'source', 'online', 'onlinePhone', p_phone, 'notes', coalesce(p_note, ''), 'createdAt', to_char(now(), 'YYYY-MM-DD')));
  return jsonb_build_object('id', v_id, 'total', v_total, 'deposit', v_deposit);
end $$;

grant execute on function public.public_shop(text) to anon, authenticated;
grant execute on function public.public_book(text, text, text, text[], text, text, text, text) to anon, authenticated;
revoke execute on function public.admin_list_shops() from anon;
revoke execute on function public.admin_set_license(uuid, text, timestamptz, text) from anon;
revoke execute on function public.admin_extend_trial(uuid, int) from anon;

-- المزامنة الفورية بين الأجهزة.
do $$ begin
  alter publication supabase_realtime add table public.records;
exception when others then null; end $$;
