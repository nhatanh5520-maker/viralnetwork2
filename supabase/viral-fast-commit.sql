-- Chạy một lần sau viral-foundation.sql (chạy lại an toàn). Không xóa hay thay dữ liệu nghiệp vụ.
-- Mục đích: lưu theo từng bảng (sheet) / từng dòng thay vì ghi đè toàn bộ JSON.
--  * Request chỉ gửi phần đã thay đổi -> nhỏ hơn rất nhiều, lưu nhanh hơn.
--  * Hai thao tác đồng thời chỉ xung đột khi cùng đụng một bảng. Chấm công ghi theo dòng nên nhiều
--    người vào ca/ra ca cùng lúc không còn chặn nhau, cũng không bị từ chối vì người khác vừa cập nhật
--    Sản xuất, Bảng tin hay bộ gửi thông báo chạy mỗi phút.
--  * Các thao tác vẫn gọi viral_commit (admin, lưu trữ chấm công...) được ghi log '*' nên mọi request
--    đang chạy dở sẽ đọc lại dữ liệu mới: an toàn như trước.
begin;

create table if not exists public.viral_state_log(
 version bigint primary key,
 keys text[] not null,
 ops jsonb,
 created_at timestamptz not null default now()
);
alter table public.viral_state_log add column if not exists ops jsonb;
alter table public.viral_state_log enable row level security;
revoke all on public.viral_state_log from public,anon,authenticated;
grant all on public.viral_state_log to service_role;

-- Ghi đè toàn bộ (đường cũ: admin, chuyển dữ liệu...) được ghi log '*' = đụng mọi bảng.
create or replace function public.viral_commit(expected_version bigint,new_data jsonb,events jsonb default '[]') returns boolean language plpgsql security definer set search_path=public as $$
declare updated integer;event jsonb;
begin
 update viral_state set data=new_data,version=version+1 where id='main' and version=expected_version;
 get diagnostics updated=row_count;if updated=0 then return false;end if;
 insert into viral_state_log(version,keys,ops) values(expected_version+1,array['*'],null) on conflict(version) do update set keys=excluded.keys,ops=null,created_at=now();
 for event in select * from jsonb_array_elements(events) loop
 insert into viral_outbox(id,chat_id,body,photo_file_id) values(event->>'id',event->>'chat_id',event->>'text',nullif(event->>'photo_file_id','')) on conflict(id) do nothing;
 end loop;return true;
end $$;

-- patches: [{"path":[...],"value":...,"remove":false}
--           |{"path":["books","main","Attendance"],"rows":{"update":[{"id","base","row"}],"append":[row],"unique":[1,2]}}]
-- read_keys: khóa các phần request đã đọc ('books/main/Attendance', 'books/main/Attendance#rows'...).
-- write_keys: khóa các phần request ghi (ghi theo dòng dùng hậu tố '#rows').
-- Trả về version mới, hoặc 0 nếu phải đọc lại và thử lại (có thao tác khác vừa sửa phần đã đọc).
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
 update viral_state set data=d,version=nv where id='main';
 insert into viral_state_log(version,keys,ops) values(nv,coalesce(write_keys,'{}'),log_ops) on conflict(version) do update set keys=excluded.keys,ops=excluded.ops,created_at=now();
 delete from viral_state_log where version<nv-2000;
 for event in select * from jsonb_array_elements(coalesce(events,'[]')) loop
  insert into viral_outbox(id,chat_id,body,photo_file_id) values(event->>'id',event->>'chat_id',event->>'text',nullif(event->>'photo_file_id','')) on conflict(id) do nothing;
 end loop;
 return nv;
end $$;

revoke all on function public.viral_commit(bigint,jsonb,jsonb),public.viral_commit_patch(bigint,text[],text[],jsonb,text[],jsonb) from public,anon,authenticated;
grant execute on function public.viral_commit(bigint,jsonb,jsonb),public.viral_commit_patch(bigint,text[],text[],jsonb,text[],jsonb) to service_role;
commit;
