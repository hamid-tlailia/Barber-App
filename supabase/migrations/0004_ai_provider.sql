-- مزوّد الذكاء الاصطناعي لكل صالون (Claude أو OpenAI) — يختاره المدير مع المفتاح.
alter table public.shop_integrations
  add column if not exists ai_provider text not null default 'anthropic' check (ai_provider in ('anthropic', 'openai'));

create or replace function public.admin_get_integration(p_shop uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v shop_integrations;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into v from shop_integrations where shop_id = p_shop;
  return jsonb_build_object(
    'wa_addon', coalesce(v.wa_addon, false), 'ai_addon', coalesce(v.ai_addon, false), 'ai_provider', coalesce(v.ai_provider, 'anthropic'),
    'wa_phone_number_id', coalesce(v.wa_phone_number_id, ''), 'has_token', v.wa_token is not null, 'has_ai_key', v.ai_key is not null,
    'owner_whatsapp', coalesce(v.owner_whatsapp, ''));
end $$;

drop function if exists public.admin_set_integration(uuid, boolean, boolean, text, text, text, boolean, boolean);
create or replace function public.admin_set_integration(p_shop uuid, p_wa_addon boolean, p_ai_addon boolean,
  p_phone_number_id text, p_token text, p_ai_key text, p_clear_token boolean default false, p_clear_ai_key boolean default false,
  p_ai_provider text default 'anthropic')
returns void language plpgsql security definer set search_path = public as $$
declare v_provider text := case when p_ai_provider = 'openai' then 'openai' else 'anthropic' end;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  insert into shop_integrations (shop_id, wa_addon, ai_addon, ai_provider, wa_phone_number_id, wa_token, ai_key, assistant_enabled)
  values (p_shop, p_wa_addon, p_ai_addon, v_provider, nullif(p_phone_number_id, ''), nullif(p_token, ''), nullif(p_ai_key, ''), p_ai_addon)
  on conflict (shop_id) do update set
    wa_addon = excluded.wa_addon,
    ai_addon = excluded.ai_addon,
    assistant_enabled = case when excluded.ai_addon and not shop_integrations.ai_addon then true else shop_integrations.assistant_enabled end,
    wa_phone_number_id = nullif(p_phone_number_id, ''),
    wa_token = case when p_clear_token then null else coalesce(nullif(p_token, ''), shop_integrations.wa_token) end,
    -- تغيير المزوّد بدون مفتاح جديد يحذف المفتاح القديم (مفتاح Claude لا يعمل مع OpenAI).
    ai_key = case when p_clear_ai_key or (shop_integrations.ai_provider <> v_provider and nullif(p_ai_key, '') is null) then null
                  else coalesce(nullif(p_ai_key, ''), shop_integrations.ai_key) end,
    ai_provider = v_provider,
    updated_at = now();
end $$;

revoke execute on function public.admin_get_integration(uuid) from anon;
revoke execute on function public.admin_set_integration(uuid, boolean, boolean, text, text, text, boolean, boolean, text) from anon;
