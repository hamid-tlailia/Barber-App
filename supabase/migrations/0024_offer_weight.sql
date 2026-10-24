-- رسالة العرض تسويقية عند Meta وتكلف قرابة 3 أضعاف رسالة التذكير، فتُحسب بـ3 رسائل من رصيد الشهر.
create or replace function public.wa_usage(p_shop uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_start timestamptz := date_trunc('month', now() at time zone 'Asia/Qatar') at time zone 'Asia/Qatar';
  v_used int;
  v_quota int;
begin
  if auth.uid() is not null and member_role(p_shop) is null and not is_admin() then raise exception 'forbidden'; end if;
  select coalesce(sum(case when kind = 'offer' then 3 else 1 end), 0) into v_used from wa_outbox where shop_id = p_shop and status = 'sent' and sent_at >= v_start;
  select coalesce(wa_quota, 500) into v_quota from shop_integrations where shop_id = p_shop;
  return jsonb_build_object('used', v_used, 'quota', coalesce(v_quota, 500), 'left', greatest(0, coalesce(v_quota, 500) - v_used), 'offer_weight', 3);
end $$;
