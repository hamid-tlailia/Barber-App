-- 1) رقم واتساب الصالون لا يتكرر بين أصحاب صالونات مختلفين (نفس المالك يستطيع استخدامه لفروعه).
-- 2) إشعار مالك التطبيق (جوال + بريد) عند تسجيل صالون جديد، مع علامة «مكرر محتمل».

-- هل الرقم متاح للمستخدم الحالي؟ (للتحقق المبكر في شاشة الإنشاء)
create or replace function public.shop_phone_available(p_phone text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and not exists (
    select 1 from shops where right(digits(phone), 8) = right(digits(p_phone), 8) and length(digits(p_phone)) >= 8 and owner_id <> auth.uid());
$$;

create or replace function public.create_shop(p_name text, p_kind text, p_phone text, p_device text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_trial timestamptz := now() + interval '7 days';
  v_device text := nullif(trim(coalesce(p_device, '')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;
  if length(digits(p_phone)) < 8 then raise exception 'phone_required'; end if;
  if exists (select 1 from shops where right(digits(phone), 8) = right(digits(p_phone), 8) and owner_id <> auth.uid()) then
    raise exception 'phone_taken';
  end if;
  if exists (select 1 from shops where owner_id = auth.uid())
     or (v_device is not null and exists (select 1 from shop_devices where device_id = v_device)) then
    v_trial := now(); -- سبق استخدام التجربة (حساب أو جهاز): يُنشأ الصالون لكنه يحتاج تفعيلاً.
  end if;
  insert into shops (name, kind, phone, owner_id, trial_ends_at)
  values (trim(p_name), coalesce(nullif(p_kind, ''), 'men'), trim(p_phone), auth.uid(), v_trial)
  returning id into v_id;
  insert into shop_members (shop_id, user_id, role, display_name)
  values (v_id, auth.uid(), 'owner', (select coalesce(raw_user_meta_data->>'name', email) from auth.users where id = auth.uid()));
  if v_device is not null then insert into shop_devices (device_id, shop_id) values (v_device, v_id) on conflict do nothing; end if;
  return v_id;
end $$;

create or replace function public.update_shop(p_shop uuid, p_name text, p_kind text, p_phone text, p_slug text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if member_role(p_shop) not in ('owner', 'manager') then raise exception 'forbidden'; end if;
  if p_phone is not null and length(digits(p_phone)) >= 8 and exists (
      select 1 from shops o where o.id <> p_shop and right(digits(o.phone), 8) = right(digits(p_phone), 8)
        and o.owner_id <> (select owner_id from shops where id = p_shop)) then
    raise exception 'phone_taken';
  end if;
  update shops set
    name = coalesce(nullif(trim(p_name), ''), name),
    kind = coalesce(nullif(p_kind, ''), kind),
    phone = coalesce(p_phone, phone),
    slug = nullif(lower(trim(p_slug)), '')
  where id = p_shop;
end $$;

-- بيانات إشعار الصالون الجديد (لدالة الإشعارات بمفتاح الخدمة فقط).
create or replace function public.new_shop_info(p_shop uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', s.name, 'kind', s.kind, 'phone', s.phone, 'email', u.email,
    'trial', s.trial_ends_at > now(),
    'duplicate_of', (select string_agg(distinct o.name, '، ') from shops o
      where o.id <> s.id and o.owner_id <> s.owner_id and (
        (digits(o.phone) <> '' and right(digits(o.phone), 8) = right(digits(s.phone), 8))
        or exists (select 1 from shop_devices a join shop_devices b on a.device_id = b.device_id where a.shop_id = s.id and b.shop_id = o.id))),
    'total', (select count(*) from shops))
  from shops s join auth.users u on u.id = s.owner_id where s.id = p_shop;
$$;
revoke execute on function public.new_shop_info(uuid) from public, anon, authenticated;

create or replace function public.notify_new_shop() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url text := (select value from app_config where key = 'functions_url');
  v_secret text := (select value from app_config where key = 'cron_secret');
begin
  if v_url is null or v_secret is null then return new; end if;
  -- يُرسل بعد انتهاء العملية، فيرى جهاز التسجيل (shop_devices) لكشف التكرار.
  perform net.http_post(
    url := v_url || '/notify-booking',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := jsonb_build_object('kind', 'new_shop', 'shop_id', new.id));
  return new;
end $$;
drop trigger if exists shops_notify_admin on public.shops;
create trigger shops_notify_admin after insert on public.shops
for each row execute function public.notify_new_shop();

revoke execute on function public.shop_phone_available(text) from anon;
revoke execute on function public.create_shop(text, text, text, text) from anon;
revoke execute on function public.update_shop(uuid, text, text, text, text) from anon;
