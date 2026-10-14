-- No roster or Auth data is applied by running this DDL.
create table if not exists public.viral_staff_imports(id uuid primary key,data jsonb not null,version bigint not null default 0,created_at timestamptz not null default now());
alter table public.viral_staff_imports enable row level security;
revoke all on public.viral_staff_imports from public,anon,authenticated;
grant select,insert,update on public.viral_staff_imports to service_role;
create or replace function public.viral_staff_sync(stage_id uuid,stage_version bigint,main_version bigint,new_data jsonb,mappings jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare st viral_staff_imports%rowtype;old viral_state%rowtype;b uuid:=gen_random_uuid();m jsonb;seen text[]:='{}';
begin
 select * into old from viral_state where id='main' for update;if not found or old.version<>main_version then raise exception 'Main changed';end if;
 select * into st from viral_staff_imports where id=stage_id for update;if not found or st.version<>stage_version or st.data->>'status'<>'prepared' then raise exception 'Staff import changed';end if;
 if jsonb_array_length(mappings)<>jsonb_array_length(st.data->'people') then raise exception 'Not all staff accounts provisioned';end if;
 for m in select * from jsonb_array_elements(mappings) loop
 if not exists(select 1 from auth.users where id=(m->>'authUserId')::uuid) or m->>'employeeId'=any(seen) then raise exception 'Invalid staff mappings';end if;seen:=array_append(seen,m->>'employeeId');
 end loop;
 insert into viral_migration_backups(id,data,members,outbox) values(b,old.data,coalesce((select jsonb_agg(to_jsonb(ms)) from viral_members ms),'[]'),coalesce((select jsonb_agg(to_jsonb(qs)) from viral_outbox qs),'[]'));
 update viral_members set active=false,employee_id='staff-unmapped:'||auth_user_id::text;
 for m in select * from jsonb_array_elements(mappings) loop
 insert into viral_members(auth_user_id,employee_id,active) values((m->>'authUserId')::uuid,m->>'employeeId',(m->>'active')::boolean) on conflict(auth_user_id) do update set employee_id=excluded.employee_id,active=excluded.active;
 end loop;
 update viral_state set data=new_data,version=version+1 where id='main';
 update viral_staff_imports set data=jsonb_set(data,'{status}','"applied"'),version=version+1 where id=stage_id;
 return b;
end $$;
revoke all on function public.viral_staff_sync(uuid,bigint,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.viral_staff_sync(uuid,bigint,bigint,jsonb,jsonb) to service_role;
