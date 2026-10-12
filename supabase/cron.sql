-- جدولة دوال واتساب (نفّذه في SQL Editor بعد نشر الدوال). استبدل PROJECT_REF و CRON_SECRET.
-- يحتاج تفعيل الإضافتين pg_cron و pg_net من Database ← Extensions.
select cron.schedule('miqass-reminders', '5 * * * *', $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb);
$$);
-- 20:00 UTC = 23:00 بتوقيت قطر
select cron.schedule('miqass-daily-report', '0 20 * * *', $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/daily-report',
    headers := jsonb_build_object('Authorization', 'Bearer CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb);
$$);
