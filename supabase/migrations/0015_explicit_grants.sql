-- صلاحيات Data API الصريحة لكل الجداول (مطلوبة لكل جدول جديد في public منذ 30 أكتوبر 2026).
-- مطابقة تماماً لما هو مطبّق الآن؛ الحماية الفعلية عبر RLS على كل جدول.
-- القاعدة لأي جدول جديد لاحقاً: أضف grant في نفس ملف إنشائه، ولا تمنح anon/authenticated جدولاً فيه أسرار.

-- جداول يصلها التطبيق (محمية بسياسات RLS).
grant select, insert, update, delete on
  public.shops, public.shop_members, public.records, public.invites, public.device_tokens,
  public.audit_log, public.app_admins, public.app_config, public.wa_outbox, public.wa_conversations
to anon, authenticated, service_role;

-- جداول للخادم فقط: مفاتيح واتساب، أجهزة التسجيل، سجل التجارب.
revoke all on public.shop_integrations, public.shop_devices, public.trial_history from anon, authenticated;
grant select, insert, update, delete on public.shop_integrations, public.shop_devices, public.trial_history to service_role;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;
