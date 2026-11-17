-- Số liệu kênh (17/11/2026): báo realtime nhóm "metrics" khi bảng ProjectChannels hoặc Channel* thay đổi,
-- để màn hình Số liệu kênh tự cập nhật. Chạy sau viral-realtime.sql (và viral-read-perf.sql nếu đã dùng).
-- Chỉ tạo lại hai hàm của trigger; không đổi dữ liệu. Chạy lại nhiều lần vẫn an toàn.
begin;

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

-- Trigger đã trỏ tới hàm này; tạo lại phòng khi chưa có (ví dụ project mới).
drop trigger if exists viral_state_change_signal on public.viral_state;
create trigger viral_state_change_signal after insert or update on public.viral_state for each row execute function public.viral_signal_state_change();

commit;
