-- الحجز الأونلاين:
-- 1) «أي شخص متاح» لم يكن يُقبل إذا كان أي موظف مشغولاً في نفس الوقت، رغم أن الصفحة تعرض الوقت (لأن غيره متاح).
--    الآن يُرفض الوقت فقط إذا لم يبق موظف متاح، بنفس منطق التطبيق.
-- 2) إجازات الموظفين وأيام راحتهم لم تكن تُرسل لصفحة الحجز ولا يتحقق منها الخادم.
-- 3) الموعد المكتمل لا يشغل الموظف.

-- هل الموظف في إجازة في هذا التاريخ؟ (يوم راحة أسبوعي أو إجازة بتاريخ، إلا إذا سُجّل حضوره استثنائياً)
create or replace function public.staff_off(p_staff jsonb, p_date text)
returns boolean language sql immutable as $$
  select case
    when coalesce(p_staff->'workDays', '[]'::jsonb) ? p_date then false
    when coalesce(p_staff->'leaves', '[]'::jsonb) ? p_date then true
    else exists (select 1 from jsonb_array_elements_text(coalesce(p_staff->'daysOff', '[]'::jsonb)) d
                 where d.value ~ '^\d+$' and d.value::int = extract(dow from p_date::date)::int)
  end;
$$;

create or replace function public.public_shop(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', s.name, 'kind', s.kind, 'phone', s.phone, 'active', shop_active(s.id),
    'settings', (select data from records where shop_id = s.id and collection = 'meta' and id = 'settings' and not deleted),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.data->>'name', 'price', r.data->'price',
        'duration', r.data->'duration', 'processing', r.data->'processing', 'category', r.data->>'category', 'deposit', r.data->'deposit'))
      from records r where r.shop_id = s.id and r.collection = 'services' and not r.deleted and coalesce(r.data->>'online', 'true') <> 'false'), '[]'),
    -- أيام الراحة والإجازات القادمة فقط (بدون أي بيانات شخصية أخرى).
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.data->>'name', 'specialty', r.data->>'specialty',
        'daysOff', coalesce(r.data->'daysOff', '[]'::jsonb),
        'leaves', coalesce((select jsonb_agg(l) from jsonb_array_elements_text(coalesce(r.data->'leaves', '[]'::jsonb)) l where l >= to_char(now(), 'YYYY-MM-DD')), '[]'::jsonb),
        'workDays', coalesce((select jsonb_agg(w) from jsonb_array_elements_text(coalesce(r.data->'workDays', '[]'::jsonb)) w where w >= to_char(now(), 'YYYY-MM-DD')), '[]'::jsonb)))
      from records r where r.shop_id = s.id and r.collection = 'staff' and not r.deleted and coalesce(r.data->>'active', 'true') <> 'false'), '[]'),
    'busy', coalesce((select jsonb_agg(jsonb_build_object('date', r.data->>'date', 'time', r.data->>'time', 'duration', r.data->'duration', 'staffId', r.data->>'staffId', 'items', r.data->'items'))
      from records r where r.shop_id = s.id and r.collection = 'appointments' and not r.deleted
        and r.data->>'status' not in ('cancelled', 'no_show', 'completed')
        and r.data->>'date' between to_char(now(), 'YYYY-MM-DD') and to_char(now() + interval '30 days', 'YYYY-MM-DD')), '[]')
  )
  from shops s where s.slug = lower(p_slug);
$$;

create or replace function public.public_book(p_slug text, p_name text, p_phone text, p_service_ids text[], p_staff text,
  p_date text, p_time text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid;
  v_client text;
  v_items jsonb := '[]';
  v_total numeric := 0;
  v_duration int := 0;
  v_deposit numeric := 0;
  v_id text := gen_random_uuid()::text;
  v_staff text := coalesce(p_staff, '');
  v_start int;
  v_team text[];
  v_busy text[];
  v_unassigned int;
  v_free int;
  r record;
begin
  select id into v_shop from shops where slug = lower(p_slug);
  if v_shop is null or not shop_active(v_shop) then raise exception 'shop_unavailable'; end if;
  if length(digits(p_phone)) < 8 or coalesce(trim(p_name), '') = '' then raise exception 'invalid_contact'; end if;
  if p_date !~ '^\d{4}-\d{2}-\d{2}$' or p_time !~ '^\d{2}:\d{2}$' or p_date::date < current_date then raise exception 'invalid_time'; end if;
  if (select count(*) from records where shop_id = v_shop and collection = 'appointments'
      and data->>'source' = 'online' and digits(data->>'onlinePhone') = digits(p_phone)
      and updated_at > now() - interval '1 day') >= 3 then raise exception 'too_many'; end if;

  for r in select id, data from records where shop_id = v_shop and collection = 'services' and not deleted and id = any(p_service_ids) loop
    v_items := v_items || jsonb_build_array(jsonb_build_object('serviceId', r.id, 'name', r.data->>'name',
      'price', coalesce((r.data->>'price')::numeric, 0), 'duration', coalesce((r.data->>'duration')::int, 30),
      'processing', coalesce((r.data->>'processing')::int, 0), 'staffId', v_staff));
    v_total := v_total + coalesce((r.data->>'price')::numeric, 0);
    v_duration := v_duration + coalesce((r.data->>'duration')::int, 30);
    v_deposit := v_deposit + coalesce((r.data->>'deposit')::numeric, 0);
  end loop;
  if jsonb_array_length(v_items) = 0 then raise exception 'no_services'; end if;
  v_deposit := least(v_deposit, v_total);

  -- الموظفون المتاحون في هذا اليوم.
  select coalesce(array_agg(id), '{}') into v_team from records
    where shop_id = v_shop and collection = 'staff' and not deleted and coalesce(data->>'active', 'true') <> 'false' and not staff_off(data, p_date);
  if v_staff <> '' and not (v_staff = any(v_team)) then raise exception 'slot_taken'; end if;

  -- المواعيد المتداخلة زمنياً: من يشغلها، وكم منها بدون موظف محدد.
  v_start := split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int;
  with overlap as (
    select coalesce(nullif(data->>'staffId', ''), (select i->>'staffId' from jsonb_array_elements(coalesce(data->'items', '[]'::jsonb)) i where coalesce(i->>'staffId', '') <> '' limit 1), '') as owner
    from records where shop_id = v_shop and collection = 'appointments' and not deleted
      and data->>'date' = p_date and data->>'status' not in ('cancelled', 'no_show', 'completed')
      and (split_part(data->>'time', ':', 1)::int * 60 + split_part(data->>'time', ':', 2)::int) < v_start + v_duration
      and v_start < (split_part(data->>'time', ':', 1)::int * 60 + split_part(data->>'time', ':', 2)::int + coalesce((data->>'duration')::int, 30))
  )
  select coalesce(array_agg(distinct owner) filter (where owner <> ''), '{}'), count(*) filter (where owner = '')
    into v_busy, v_unassigned from overlap;
  select count(*) into v_free from unnest(v_team) t where not (t = any(v_busy)) and t <> v_staff;

  if v_staff <> '' then
    if v_staff = any(v_busy) or v_free < v_unassigned then raise exception 'slot_taken'; end if;
  elsif (cardinality(v_busy) > 0 or v_unassigned > 0) and v_free <= v_unassigned then
    raise exception 'slot_taken';
  end if;

  select id into v_client from records where shop_id = v_shop and collection = 'clients' and not deleted
    and right(digits(data->>'phone'), 8) = right(digits(p_phone), 8) limit 1;
  if v_client is null then
    v_client := gen_random_uuid()::text;
    insert into records (shop_id, collection, id, data) values (v_shop, 'clients', v_client,
      jsonb_build_object('id', v_client, 'name', trim(p_name), 'phone', p_phone, 'notes', '', 'source', 'online', 'createdAt', to_char(now(), 'YYYY-MM-DD')));
  end if;

  insert into records (shop_id, collection, id, data) values (v_shop, 'appointments', v_id, jsonb_build_object(
    'id', v_id, 'clientId', v_client, 'items', v_items, 'staffId', v_staff, 'date', p_date, 'time', p_time,
    'duration', v_duration, 'price', v_total, 'deposit', v_deposit, 'status', 'pending', 'payments', '[]'::jsonb,
    'source', 'online', 'onlinePhone', p_phone, 'notes', coalesce(p_note, ''), 'createdAt', to_char(now(), 'YYYY-MM-DD')));
  return jsonb_build_object('id', v_id, 'total', v_total, 'deposit', v_deposit);
end $$;

grant execute on function public.public_shop(text) to anon, authenticated;
grant execute on function public.public_book(text, text, text, text[], text, text, text, text) to anon, authenticated;
