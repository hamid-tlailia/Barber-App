-- تقرير نهاية اليوم: كل صالون عند ساعة إغلاقه (بعضها يغلق بعد منتصف الليل)،
-- فنستدعي الدالة كل ساعة وهي تختار الصالونات التي حان موعدها.
do $$ begin
  perform cron.unschedule('miqass-daily-report');
exception when others then null; end $$;
select cron.schedule('miqass-daily-report', '0 * * * *', $$
  select net.http_post(
    url := (select value from app_config where key = 'functions_url') || '/daily-report',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select value from app_config where key = 'cron_secret'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb);
$$);
