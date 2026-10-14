-- Run once on the existing project. This only adds private staging/backup tables
-- and functions; no business data is imported, deleted or activated by this file.
create table if not exists public.viral_migration_stages(id uuid primary key,data jsonb not null,version bigint not null default 0,created_at timestamptz not null default now());
create table if not exists public.viral_migration_backups(id uuid primary key,data jsonb not null,members jsonb not null,outbox jsonb not null,source_stage uuid,created_at timestamptz not null default now());
alter table public.viral_migration_stages enable row level security;
alter table public.viral_migration_backups enable row level security;
revoke all on public.viral_migration_stages,public.viral_migration_backups from public,anon,authenticated;
grant select,insert,update,delete on public.viral_migration_stages,public.viral_migration_backups to service_role;

create or replace function public.viral_stage_commit(stage_id uuid,expected_version bigint,new_data jsonb) returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 update viral_migration_stages set data=new_data,version=version+1 where id=stage_id and version=expected_version and data->>'status'='prepared';
 get diagnostics n=row_count;return n=1;
end $$;

create or replace function public.viral_activate_migration(stage_id uuid,stage_version bigint,main_version bigint,mappings jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare current_main viral_state%rowtype;st viral_migration_stages%rowtype;b_id uuid:=gen_random_uuid();m jsonb;employee jsonb;emp_headers jsonb;id_col integer;active_col integer;seen_users text[]:='{}';seen_staff text[]:='{}';candidate jsonb;
begin
 select * into current_main from viral_state where id='main' for update;
 if not found or current_main.version<>main_version then raise exception 'Main data changed; refresh before activation';end if;
 select * into st from viral_migration_stages where id=stage_id for update;
 if not found or st.version<>stage_version or st.data->>'status'<>'prepared' then raise exception 'Staging changed or already activated';end if;
 if st.data->>'kind'<>'viral-migration' then raise exception 'Invalid staging';end if;
 if exists(select 1 from jsonb_array_elements(st.data->'issues') x where x->>'blocking'='true') then raise exception 'Blocking migration issues';end if;
 if exists(select 1 from jsonb_array_elements(st.data->'files') x where x->>'status'<>'copied' or coalesce(x->>'verified','false')<>'true') then raise exception 'Bills not verified';end if;
 candidate:=st.data->'candidate';
 for m in select * from jsonb_array_elements(st.data->'files') loop
 if candidate->'files'->(m->>'id')->>'sha256' is distinct from m->>'sha256' then raise exception 'File metadata mismatch';end if;
 end loop;
 if jsonb_typeof(mappings)<>'array' or jsonb_array_length(mappings)=0 then raise exception 'Account mappings required';end if;
 emp_headers:=candidate->'books'->'main'->'Employees'->0;
 select ordinality-1 into id_col from jsonb_array_elements_text(emp_headers) with ordinality where value='telegram_id';
 select ordinality-1 into active_col from jsonb_array_elements_text(emp_headers) with ordinality where value='active';
 for m in select * from jsonb_array_elements(mappings) loop
 if coalesce(m->>'authUserId','')=any(seen_users) or coalesce(m->>'employeeId','')=any(seen_staff) then raise exception 'Duplicate account mapping';end if;
 if not exists(select 1 from auth.users where id=(m->>'authUserId')::uuid) then raise exception 'Auth account missing';end if;
 select x into employee from jsonb_array_elements(candidate->'books'->'main'->'Employees') x where x->>id_col=m->>'employeeId' and lower(x->>active_col)='true';
 if employee is null then raise exception 'Active legacy employee missing';end if;
 seen_users:=array_append(seen_users,m->>'authUserId');seen_staff:=array_append(seen_staff,m->>'employeeId');
 end loop;
 insert into viral_migration_backups(id,data,members,outbox,source_stage) values(b_id,current_main.data,coalesce((select jsonb_agg(to_jsonb(v)) from viral_members v),'[]'),coalesce((select jsonb_agg(to_jsonb(v)) from viral_outbox v),'[]'),stage_id);
 -- Account/password rows in auth.users are never deleted or changed.
 update viral_members set employee_id='migration-unmapped:'||auth_user_id::text,active=false;
 for m in select * from jsonb_array_elements(mappings) loop
 insert into viral_members(auth_user_id,employee_id,active) values((m->>'authUserId')::uuid,m->>'employeeId',true)
 on conflict(auth_user_id) do update set employee_id=excluded.employee_id,active=true;
 end loop;
 -- No replay of test queue or historical notifications during the transition.
 update viral_outbox set status='migration_hold',lease_until=null where status in ('pending','sending');
 update viral_state set data=candidate,version=version+1 where id='main';
 update viral_migration_stages set data=jsonb_set(jsonb_set(data,'{status}','"activated"'),'{backupId}',to_jsonb(b_id::text)),version=version+1 where id=stage_id;
 return b_id;
end $$;

-- Restores a full prior snapshot; call only while web writes/cron are paused.
create or replace function public.viral_rollback_migration(backup_id uuid,main_version bigint) returns boolean language plpgsql security definer set search_path=public as $$
declare b viral_migration_backups%rowtype;v bigint;m jsonb;q jsonb;
begin
 select version into v from viral_state where id='main' for update;
 if v is distinct from main_version then raise exception 'Main changed; refresh before rollback';end if;
 select * into b from viral_migration_backups where id=backup_id;
 if not found then raise exception 'Backup missing';end if;
 insert into viral_migration_backups(id,data,members,outbox,source_stage) select gen_random_uuid(),data,coalesce((select jsonb_agg(to_jsonb(ms)) from viral_members ms),'[]'),coalesce((select jsonb_agg(to_jsonb(qs)) from viral_outbox qs),'[]'),null from viral_state where id='main';
 update viral_state set data=b.data,version=version+1 where id='main';
 delete from viral_members;
 for m in select * from jsonb_array_elements(b.members) loop
 insert into viral_members select * from jsonb_populate_record(null::viral_members,m);
 end loop;
 delete from viral_outbox;
 for q in select * from jsonb_array_elements(b.outbox) loop
 insert into viral_outbox select * from jsonb_populate_record(null::viral_outbox,q);
 end loop;
 return true;
end $$;
revoke all on function public.viral_stage_commit(uuid,bigint,jsonb),public.viral_activate_migration(uuid,bigint,bigint,jsonb),public.viral_rollback_migration(uuid,bigint) from public,anon,authenticated;
grant execute on function public.viral_stage_commit(uuid,bigint,jsonb),public.viral_activate_migration(uuid,bigint,bigint,jsonb),public.viral_rollback_migration(uuid,bigint) to service_role;
