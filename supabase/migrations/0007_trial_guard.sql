-- منع تكرار التجربة المجانية: تجربة واحدة لكل جهاز (إضافة لكل حساب ولكل رقم هاتف)،
-- وتنبيه المالك في لوحته عند صالون يبدو مكرراً (نفس الجهاز أو نفس الرقم).

create table if not exists public.shop_devices (
  device_id text not null,
  shop_id uuid not null references public.shops on delete cascade,
  created_at timestamptz not null default now(),
  primary key (device_id, shop_id)
);
alter table public.shop_devices enable row level security;
revoke all on public.shop_devices from anon, authenticated;

drop function if exists public.create_shop(text, text, text);
create or replace function public.create_shop(p_name text, p_kind text, p_phone text, p_device text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_trial timestamptz := now() + interval '7 days';
  v_device text := nullif(trim(coalesce(p_device, '')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;
  if exists (select 1 from shops where owner_id = auth.uid())
     or (digits(p_phone) <> '' and exists (select 1 from shops where digits(phone) = digits(p_phone)))
     or (v_device is not null and exists (select 1 from shop_devices where device_id = v_device)) then
    v_trial := now(); -- سبق استخدام التجربة (حساب أو رقم أو جهاز): يُنشأ الصالون لكنه يحتاج تفعيلاً.
  end if;
  insert into shops (name, kind, phone, owner_id, trial_ends_at)
  values (trim(p_name), coalesce(nullif(p_kind, ''), 'men'), p_phone, auth.uid(), v_trial)
  returning id into v_id;
  insert into shop_members (shop_id, user_id, role, display_name)
  values (v_id, auth.uid(), 'owner', (select coalesce(raw_user_meta_data->>'name', email) from auth.users where id = auth.uid()));
  if v_device is not null then insert into shop_devices (device_id, shop_id) values (v_device, v_id) on conflict do nothing; end if;
  return v_id;
end $$;

-- جهاز صاحب الصالون يُسجَّل عند فتحه (لكشف نفس الشخص بحساب آخر). أجهزة الموظفين لا تُحسب.
create or replace function public.register_device(p_shop uuid, p_device text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if member_role(p_shop) is distinct from 'owner' or coalesce(trim(p_device), '') = '' then return; end if;
  insert into shop_devices (device_id, shop_id) values (trim(p_device), p_shop) on conflict do nothing;
end $$;

-- قائمة المالك: علامة «مكرر محتمل» وسببه.
drop function if exists public.admin_list_shops();
create or replace function public.admin_list_shops()
returns table (id uuid, name text, kind text, phone text, owner_email text, created_at timestamptz,
  trial_ends_at timestamptz, paid_until timestamptz, plan text, active boolean, records bigint, last_activity timestamptz, admin_note text,
  wa_addon boolean, ai_addon boolean, grace_until timestamptz, members bigint, duplicate_of text)
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
        (digits(o.phone) <> '' and digits(o.phone) = digits(s.phone))
        or exists (select 1 from shop_devices a join shop_devices b on a.device_id = b.device_id where a.shop_id = s.id and b.shop_id = o.id)))
  from shops s join auth.users u on u.id = s.owner_id
  left join shop_integrations i on i.shop_id = s.id
  where is_admin()
  order by s.created_at desc;
$$;

revoke execute on function public.admin_list_shops() from anon;
revoke execute on function public.create_shop(text, text, text, text) from anon;
revoke execute on function public.register_device(uuid, text) from anon;
