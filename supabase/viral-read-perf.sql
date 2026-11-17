-- Tăng tốc đọc/lưu dữ liệu (16/11/2026). Chạy một lần, chạy lại vẫn an toàn. Không thay đổi dữ liệu.
-- Cần đã chạy viral-foundation.sql, viral-fast-commit.sql và viral-realtime.sql trước đó.
--  1. viral_read_tables: đọc nhiều bảng mà chỉ giải nén khối dữ liệu MỘT lần (cách cũ giải nén lại
--     cả khối cho từng bảng nên càng nhiều bảng càng chậm, có lúc vượt giới hạn 8 giây của Supabase).
--  2. viral_commit_patch: báo cho trigger realtime biết bảng nào vừa đổi.
--  3. Trigger realtime: dùng thông tin đó thay vì so sánh cả khối dữ liệu cũ và mới mỗi lần lưu.
begin;

-- Returns {version, properties, archive, files?, tables:{name: grid}}. Missing tables are omitted.
create or replace function public.viral_read_tables(tables text[],include_files boolean default false) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare d jsonb;v bigint;m jsonb;
begin
 select data,version into d,v from viral_state where id='main';
 if not found then return null;end if;
 m:=coalesce(d->'books'->'main','{}'::jsonb);
 return jsonb_build_object('version',v,'properties',coalesce(d->'properties','{}'::jsonb),'archive',d->'attendanceArchive',
  'files',case when include_files then coalesce(d->'files','{}'::jsonb) else null end,
  'tables',coalesce((select jsonb_object_agg(t,m->t) from unnest(coalesce(tables,'{}')) t where m ? t),'{}'::jsonb));
end $$;
revoke all on function public.viral_read_tables(text[],boolean) from public,anon,authenticated;
grant execute on function public.viral_read_tables(text[],boolean) to service_role;

create or replace function public.viral_commit_patch(expected_version bigint,read_keys text[],write_keys text[],patches jsonb,outbox_done text[] default '{}',events jsonb default '[]') returns bigint language plpgsql security definer set search_path=public as $$
declare cur bigint;d jsonb;p jsonb;path text[];i integer;nv bigint;event jsonb;sheet jsonb;u jsonb;a jsonb;idx integer;log_ops jsonb:='[]';
begin
 select version,data into cur,d from viral_state where id='main' for update;
 if not found then return 0;end if;
 if cur<>expected_version then
  if cur<expected_version then return 0;end if;
  -- Mọi version từ lúc đọc phải có log; thiếu log (ví dụ SQL sửa tay) thì coi là xung đột cho an toàn.
  if (select count(*) from viral_state_log where version>expected_version and version<=cur)<>cur-expected_version then return 0;end if;
  if exists(select 1 from viral_state_log where version>expected_version and version<=cur and ('*'=any(keys) or keys && coalesce(read_keys,'{}'))) then return 0;end if;
 end if;
 for p in select * from jsonb_array_elements(coalesce(patches,'[]')) loop
  path:=array(select jsonb_array_elements_text(p->'path'));
  if cardinality(path)=0 then raise exception 'empty patch path';end if;
  -- Tạo các nút cha còn thiếu (jsonb_set chỉ tạo được khóa cuối).
  for i in 1..cardinality(path)-1 loop
   if jsonb_typeof(d#>path[1:i]) is distinct from 'object' then d:=jsonb_set(d,path[1:i],'{}'::jsonb,true);end if;
  end loop;
  if p ? 'rows' then
   sheet:=d#>path;
   if jsonb_typeof(sheet) is distinct from 'array' then return 0;end if;
   for u in select * from jsonb_array_elements(coalesce(p#>'{rows,update}','[]')) loop
    -- Dòng phải còn y như lúc đọc; nếu đã bị sửa thì đọc lại và thử lại.
    select (e.n-1)::integer into idx from jsonb_array_elements(sheet) with ordinality e(r,n) where e.n>1 and e.r->>0=u->>'id' limit 1;
    if idx is null or sheet->idx<>u->'base' then return 0;end if;
    sheet:=jsonb_set(sheet,array[idx::text],u->'row');
   end loop;
   for a in select * from jsonb_array_elements(coalesce(p#>'{rows,append}','[]')) loop
    -- Chống trùng (ví dụ: cùng người, cùng ngày chấm công từ hai máy cùng lúc).
    if jsonb_array_length(coalesce(p#>'{rows,unique}','[]'))>0 and exists(
     select 1 from jsonb_array_elements(sheet) with ordinality e(r,n) where e.n>1 and not exists(
      select 1 from jsonb_array_elements_text(p#>'{rows,unique}') k(c) where (e.r->>(k.c::integer)) is distinct from (a->>(k.c::integer)))) then return 0;end if;
    sheet:=sheet||jsonb_build_array(a);
   end loop;
   d:=jsonb_set(d,path,sheet,false);
   log_ops:=log_ops||jsonb_build_array(jsonb_build_object('path',p->'path','rows',jsonb_build_object(
    'update',coalesce((select jsonb_agg(jsonb_build_object('id',x->'id','row',x->'row')) from jsonb_array_elements(coalesce(p#>'{rows,update}','[]')) x),'[]'::jsonb),
    'append',coalesce(p#>'{rows,append}','[]'))));
  else
   if coalesce((p->>'remove')::boolean,false) then d:=d#-path;else d:=jsonb_set(d,path,p->'value',true);end if;
   log_ops:=log_ops||jsonb_build_array(jsonb_build_object('path',p->'path'));
  end if;
 end loop;
 if cardinality(coalesce(outbox_done,'{}'))>0 and jsonb_typeof(d->'outbox')='array' then
  d:=jsonb_set(d,'{outbox}',coalesce((select jsonb_agg(e) from jsonb_array_elements(d->'outbox') e where not coalesce(e->>'id','')=any(outbox_done)),'[]'::jsonb));
  log_ops:=log_ops||'[{"path":["outbox"]}]'::jsonb;
 end if;
 nv:=cur+1;
 -- Tell the realtime trigger which parts changed so it does not compare the whole document.
 perform set_config('viral.changed_keys','patch:'||array_to_string(coalesce(write_keys,'{}'),','),true);
 update viral_state set data=d,version=nv where id='main';
 insert into viral_state_log(version,keys,ops) values(nv,coalesce(write_keys,'{}'),log_ops) on conflict(version) do update set keys=excluded.keys,ops=excluded.ops,created_at=now();
 delete from viral_state_log where version<nv-2000;
 for event in select * from jsonb_array_elements(coalesce(events,'[]')) loop
  insert into viral_outbox(id,chat_id,body,photo_file_id) values(event->>'id',event->>'chat_id',event->>'text',nullif(event->>'photo_file_id','')) on conflict(id) do nothing;
 end loop;
 return nv;
end $$;
revoke all on function public.viral_commit_patch(bigint,text[],text[],jsonb,text[],jsonb) from public,anon,authenticated;
grant execute on function public.viral_commit_patch(bigint,text[],text[],jsonb,text[],jsonb) to service_role;

-- Which screens (realtime scopes) a sheet belongs to. Shared by both trigger modes.
create or replace function public.viral_sheet_scopes(sheet text) returns text[] language sql immutable as $$
 select case
  when sheet like 'Production%' or sheet like 'Idea%' then array['production','work']
  when sheet='Tasks' then array['work']
  when sheet in ('Employees','UserAvatars') then array['people']
  when sheet='Projects' then array['projects']
  when sheet='Attendance' or sheet like 'Field%' then array['attendance']
  when sheet like 'Expense%' or sheet='PaymentBatches' then array['expenses']
  when sheet in ('Announcements','PostComments','PostLikes','Feed','FeedComments','FeedLikes') then array['news']
  when sheet like 'Meeting%' then array['meetings']
  when sheet like 'Equipment%' then array['equipment']
  when sheet like 'Leave%' then array['leave']
  when sheet in ('Schedule','Overtime') then array['schedule','attendance']
  when sheet='Settings' then array['settings']
  when sheet like 'Channel%' or sheet='ProjectChannels' then array['metrics']
  else '{}'::text[] end
$$;

-- Saves through viral_commit_patch say which keys they wrote (viral.changed_keys), so the trigger maps
-- those keys directly. Other writes (viral_commit, manual SQL) still compare the old and new document.
create or replace function public.viral_signal_state_change() returns trigger
language plpgsql security definer set search_path=public as $$
declare previous jsonb:='{}'; current_main jsonb; previous_main jsonb:='{}'; key text; parts text[]; scopes text[]:='{}'; scope text; counters jsonb; hint text;
begin
 if new.id<>'main' then return new; end if;
 hint:=current_setting('viral.changed_keys',true);
 if hint like 'patch:%' then
  perform set_config('viral.changed_keys','',true);
  foreach key in array string_to_array(substr(hint,7),',') loop
   if key='' then continue;end if;
   parts:=string_to_array(split_part(key,'#',1),'/');
   if parts[1]='books' and parts[2]='main' and cardinality(parts)>=3 then scopes:=scopes||public.viral_sheet_scopes(parts[3]);
   elsif parts[1]='books' then scopes:=scopes||array['people','expenses'];
   elsif parts[1]='properties' then scopes:=scopes||array['settings'];end if;
  end loop;
 else
  if tg_op='UPDATE' then previous:=old.data;previous_main:=coalesce(old.data#>'{books,main}','{}');end if;
  current_main:=coalesce(new.data#>'{books,main}','{}');
  for key in select jsonb_object_keys(previous_main||current_main) loop
   if (previous_main->key) is not distinct from (current_main->key) then continue;end if;
   scopes:=scopes||public.viral_sheet_scopes(key);
  end loop;
  if (new.data->'properties') is distinct from (previous->'properties') then scopes:=scopes||array['settings'];end if;
  if (coalesce(new.data->'books','{}')-'main') is distinct from (coalesce(previous->'books','{}')-'main') then scopes:=scopes||array['people','expenses'];end if;
 end if;
 if cardinality(scopes)=0 then return new;end if;
 select versions into counters from public.viral_change_signal where id='main';counters:=coalesce(counters,'{}');
 foreach scope in array scopes loop counters:=jsonb_set(counters,array[scope],to_jsonb(new.version));end loop;
 insert into public.viral_change_signal(id,version,versions,updated_at) values('main',new.version,counters,now())
 on conflict(id) do update set version=excluded.version,versions=excluded.versions,updated_at=excluded.updated_at;
 return new;
end $$;
revoke all on function public.viral_signal_state_change() from public,anon,authenticated;

commit;
