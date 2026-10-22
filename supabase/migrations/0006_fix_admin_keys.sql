-- إصلاح: إعادة دالة قراءة الإضافات بالنسخة التي تُرجع المفاتيح للمالك (إن نُفّذ 0004 بعد 0005).
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
revoke execute on function public.admin_get_integration(uuid) from anon;
