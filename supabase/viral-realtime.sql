-- Run once (safe to run again). Does not import, delete or replace business data.
begin;
create table if not exists public.viral_change_signal (
 id text primary key check(id='main'), version bigint not null default 0,
 versions jsonb not null default '{}', updated_at timestamptz not null default now()
);
alter table public.viral_change_signal enable row level security;
revoke all on public.viral_change_signal from public,anon,authenticated;
grant select on public.viral_change_signal to authenticated;
grant all on public.viral_change_signal to service_role;
-- Only an active mapped employee can receive the small invalidation signal.
create or replace function public.viral_can_receive_changes() returns boolean
language sql stable security definer set search_path=public as $$
 select exists (
  select 1 from public.viral_members m join public.viral_state s on s.id='main'
  cross join lateral jsonb_array_elements(coalesce(s.data#>'{books,main,Employees}','[]'::jsonb)) e
  where m.auth_user_id=(select auth.uid()) and m.active
  and e->>((select ordinality-1 from jsonb_array_elements_text(s.data#>'{books,main,Employees,0}') with ordinality where value='telegram_id')::integer)=m.employee_id
  and lower(e->>((select ordinality-1 from jsonb_array_elements_text(s.data#>'{books,main,Employees,0}') with ordinality where value='active')::integer))='true'
 );
$$;
revoke all on function public.viral_can_receive_changes() from public,anon;
grant execute on function public.viral_can_receive_changes() to authenticated,service_role;
drop policy if exists viral_signal_active_member on public.viral_change_signal;
create policy viral_signal_active_member on public.viral_change_signal for select to authenticated using ((select public.viral_can_receive_changes()));
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
drop trigger if exists viral_state_change_signal on public.viral_state;
create trigger viral_state_change_signal after insert or update on public.viral_state for each row execute function public.viral_signal_state_change();
insert into public.viral_change_signal(id,version,versions) select 'main',version,jsonb_build_object('settings',version) from public.viral_state where id='main' on conflict(id) do nothing;
-- Publish ONLY this metadata row. The private viral_state table stays private.
do $$ begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then raise exception 'Supabase Realtime publication is unavailable';end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='viral_change_signal') then alter publication supabase_realtime add table public.viral_change_signal;end if;
end $$;
commit;
