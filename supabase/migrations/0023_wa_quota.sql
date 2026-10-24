-- حد رسائل «واتساب الذكي» الشهري: 500 رسالة مشمولة، ويرفعه مدير المنصة لمن يشتري رسائل إضافية.
-- يُحسب كل ما يرسله الخادم من رقم المنصة (تذكير، عرض، تقرير يومي). ردود المساعد داخل المحادثة لا تُحسب.
alter table public.shop_integrations add column if not exists wa_quota int not null default 500;
grant select (wa_quota) on public.shop_integrations to authenticated;

-- الاستهلاك منذ بداية الشهر (بتوقيت قطر).
create or replace function public.wa_usage(p_shop uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_start timestamptz := date_trunc('month', now() at time zone 'Asia/Qatar') at time zone 'Asia/Qatar';
  v_used int;
  v_quota int;
begin
  if auth.uid() is not null and member_role(p_shop) is null and not is_admin() then raise exception 'forbidden'; end if;
  select count(*) into v_used from wa_outbox where shop_id = p_shop and status = 'sent' and sent_at >= v_start;
  select coalesce(wa_quota, 500) into v_quota from shop_integrations where shop_id = p_shop;
  return jsonb_build_object('used', v_used, 'quota', coalesce(v_quota, 500), 'left', greatest(0, coalesce(v_quota, 500) - v_used));
end $$;
revoke all on function public.wa_usage(uuid) from public, anon;
grant execute on function public.wa_usage(uuid) to authenticated, service_role;

create or replace function public.admin_set_wa_quota(p_shop uuid, p_quota int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update shop_integrations set wa_quota = greatest(0, least(coalesce(p_quota, 500), 100000)) where shop_id = p_shop;
end $$;
revoke all on function public.admin_set_wa_quota(uuid, int) from public, anon;
grant execute on function public.admin_set_wa_quota(uuid, int) to authenticated;
