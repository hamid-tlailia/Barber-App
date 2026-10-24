-- الإضافات المدفوعة (واتساب الذكي + المساعد الذكي): يفعّلها مدير المنصة فقط لكل صالون،
-- ومعها إعدادات الربط والمفاتيح السرية. صاحب الصالون يرى ويتحكم فقط بالمفاتيح (تشغيل/إيقاف) ورقمه.

alter table public.shop_integrations
  add column if not exists wa_addon boolean not null default false,
  add column if not exists ai_addon boolean not null default false,
  add column if not exists ai_key text;

-- إلغاء صلاحية العمود وحدها لا يكفي إذا كانت صلاحية الجدول ممنوحة؛ نمنح الأعمدة المسموحة فقط.
revoke all on public.shop_integrations from anon, authenticated;
grant select (shop_id, owner_whatsapp, reminders_enabled, assistant_enabled, daily_report_enabled, wa_addon, ai_addon, updated_at)
  on public.shop_integrations to authenticated;

-- صاحب الصالون: يحفظ التفضيلات فقط (لا أرقام ربط ولا مفاتيح).
drop function if exists public.save_integration(uuid, text, text, text, boolean, boolean, boolean);
create or replace function public.save_integration(p_shop uuid, p_owner_whatsapp text, p_reminders boolean, p_assistant boolean, p_daily boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if member_role(p_shop) is distinct from 'owner' then raise exception 'forbidden'; end if;
  insert into shop_integrations (shop_id, owner_whatsapp, reminders_enabled, assistant_enabled, daily_report_enabled)
  values (p_shop, nullif(p_owner_whatsapp, ''), p_reminders, p_assistant, p_daily)
  on conflict (shop_id) do update set
    owner_whatsapp = excluded.owner_whatsapp,
    reminders_enabled = excluded.reminders_enabled,
    assistant_enabled = excluded.assistant_enabled,
    daily_report_enabled = excluded.daily_report_enabled,
    updated_at = now();
end $$;

-- المدير: قراءة حالة الإضافات (المفاتيح لا تُعاد، فقط هل هي موجودة).
create or replace function public.admin_get_integration(p_shop uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v shop_integrations;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into v from shop_integrations where shop_id = p_shop;
  return jsonb_build_object(
    'wa_addon', coalesce(v.wa_addon, false), 'ai_addon', coalesce(v.ai_addon, false),
    'wa_phone_number_id', coalesce(v.wa_phone_number_id, ''), 'has_token', v.wa_token is not null, 'has_ai_key', v.ai_key is not null,
    'owner_whatsapp', coalesce(v.owner_whatsapp, ''));
end $$;

-- المدير: تفعيل الإضافات وحفظ الربط. الحقول السرية الفارغة تُبقي القيمة الحالية؛ p_clear_* لحذفها.
create or replace function public.admin_set_integration(p_shop uuid, p_wa_addon boolean, p_ai_addon boolean,
  p_phone_number_id text, p_token text, p_ai_key text, p_clear_token boolean default false, p_clear_ai_key boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  insert into shop_integrations (shop_id, wa_addon, ai_addon, wa_phone_number_id, wa_token, ai_key, assistant_enabled)
  values (p_shop, p_wa_addon, p_ai_addon, nullif(p_phone_number_id, ''), nullif(p_token, ''), nullif(p_ai_key, ''), p_ai_addon)
  on conflict (shop_id) do update set
    wa_addon = excluded.wa_addon,
    ai_addon = excluded.ai_addon,
    -- عند تفعيل المساعد لأول مرة نشغّله للصالون مباشرة.
    assistant_enabled = case when excluded.ai_addon and not shop_integrations.ai_addon then true else shop_integrations.assistant_enabled end,
    wa_phone_number_id = nullif(p_phone_number_id, ''),
    wa_token = case when p_clear_token then null else coalesce(nullif(p_token, ''), shop_integrations.wa_token) end,
    ai_key = case when p_clear_ai_key then null else coalesce(nullif(p_ai_key, ''), shop_integrations.ai_key) end,
    updated_at = now();
end $$;

-- قائمة الصالونات للمدير مع حالة الإضافات.
drop function if exists public.admin_list_shops();
create or replace function public.admin_list_shops()
returns table (id uuid, name text, kind text, phone text, owner_email text, created_at timestamptz,
  trial_ends_at timestamptz, paid_until timestamptz, plan text, active boolean, records bigint, last_activity timestamptz, admin_note text,
  wa_addon boolean, ai_addon boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.kind, s.phone, u.email::text, s.created_at, s.trial_ends_at, s.paid_until, s.plan,
    shop_active(s.id),
    (select count(*) from records r where r.shop_id = s.id and not r.deleted),
    (select max(r.updated_at) from records r where r.shop_id = s.id),
    s.admin_note,
    coalesce(i.wa_addon, false), coalesce(i.ai_addon, false)
  from shops s join auth.users u on u.id = s.owner_id
  left join shop_integrations i on i.shop_id = s.id
  where is_admin()
  order by s.created_at desc;
$$;

revoke execute on function public.admin_list_shops() from anon;
revoke execute on function public.admin_get_integration(uuid) from anon;
revoke execute on function public.admin_set_integration(uuid, boolean, boolean, text, text, text, boolean, boolean) from anon;
revoke execute on function public.save_integration(uuid, text, boolean, boolean, boolean) from anon;
