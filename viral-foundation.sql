-- Run this one file on a NEW Supabase project for the Viral adapter.
-- Legacy ERP migrations 0001..0050 are NOT needed for the new interface.
create table if not exists public.viral_state(id text primary key, data jsonb not null, version bigint not null default 0);
create table if not exists public.viral_members(auth_user_id uuid primary key references auth.users(id) on delete cascade,employee_id text not null unique,active boolean not null default true);
create table if not exists public.viral_outbox(id text primary key,chat_id text not null,body text not null,photo_file_id text,status text not null default 'pending',attempts integer not null default 0,lease_until timestamptz,last_error text,created_at timestamptz not null default now());
alter table public.viral_state enable row level security;
alter table public.viral_members enable row level security;
alter table public.viral_outbox enable row level security;
-- No browser policies: all business authorization happens at the server boundary.
revoke all on public.viral_state,public.viral_members,public.viral_outbox from anon,authenticated;
create or replace function public.viral_commit(expected_version bigint,new_data jsonb,events jsonb default '[]') returns boolean language plpgsql security definer set search_path=public as $$
declare updated integer;event jsonb;
begin
 update viral_state set data=new_data,version=version+1 where id='main' and version=expected_version;
 get diagnostics updated=row_count;if updated=0 then return false;end if;
 for event in select * from jsonb_array_elements(events) loop
 insert into viral_outbox(id,chat_id,body,photo_file_id) values(event->>'id',event->>'chat_id',event->>'text',nullif(event->>'photo_file_id','')) on conflict(id) do nothing;
 end loop;return true;
end $$;
create or replace function public.viral_claim_notifications() returns setof viral_outbox language sql security definer set search_path=public as $$
 update viral_outbox set status='sending',lease_until=now()+interval '5 minutes',attempts=attempts+1
 where id in(select id from viral_outbox where attempts<8 and (status='pending' or (status='sending' and lease_until<now())) order by created_at for update skip locked limit 3) returning *;
$$;
revoke all on function public.viral_commit(bigint,jsonb,jsonb),public.viral_claim_notifications() from public,anon,authenticated;
grant execute on function public.viral_commit(bigint,jsonb,jsonb),public.viral_claim_notifications() to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('viral-files','viral-files',false,10485760) on conflict(id) do nothing;
