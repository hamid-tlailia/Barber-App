-- 0015 ألغى كل صلاحيات shop_integrations فاختفت حالة الإضافات عند صاحب الصالون.
-- نعيد قراءة الأعمدة غير السرية فقط (المفاتيح تبقى للخادم)؛ سياسة RLS تحصرها في أعضاء الصالون.
grant select (shop_id, owner_whatsapp, reminders_enabled, assistant_enabled, daily_report_enabled, wa_addon, ai_addon, updated_at)
  on public.shop_integrations to authenticated;

-- زر «إشعار تجريبي»: يرسل عبر نفس طريق إشعار الحجز (الخادم ← Firebase) لأجهزة المستخدم نفسه فقط.
-- يعيد عدد أجهزته المسجّلة في هذا الصالون (0 = الهاتف غير مسجّل).
create or replace function public.send_test_push(p_shop uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_url text := (select value from app_config where key = 'functions_url');
  v_secret text := (select value from app_config where key = 'cron_secret');
  v_devices int;
begin
  if member_role(p_shop) is null then raise exception 'forbidden'; end if;
  select count(*) into v_devices from device_tokens where user_id = auth.uid() and shop_id = p_shop;
  if v_devices > 0 and v_url is not null and v_secret is not null then
    perform net.http_post(url := v_url || '/notify-booking',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
      body := jsonb_build_object('kind', 'test', 'shop_id', p_shop, 'user_id', auth.uid()));
  end if;
  return v_devices;
end $$;
revoke all on function public.send_test_push(uuid) from public, anon;
grant execute on function public.send_test_push(uuid) to authenticated;
