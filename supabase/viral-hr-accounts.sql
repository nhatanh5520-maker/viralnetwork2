-- Adds atomic HR membership + employee data + Telegram welcome queue commit.
-- Does not create any account or change existing data when this SQL is run.
create or replace function public.viral_hr_create_account(expected_version bigint,new_data jsonb,auth_user uuid,employee text,welcome text) returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 update viral_state set data=new_data,version=version+1 where id='main' and version=expected_version;
 get diagnostics n=row_count;if n=0 then return false;end if;
 insert into viral_members(auth_user_id,employee_id,active) values(auth_user,employee,true);
 insert into viral_outbox(id,chat_id,body) values('account-welcome:'||auth_user::text,employee,welcome);
 return true;
end $$;
revoke all on function public.viral_hr_create_account(bigint,jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.viral_hr_create_account(bigint,jsonb,uuid,text,text) to service_role;

create or replace function public.viral_hr_resend_link(account_id uuid,telegram_id text,welcome text) returns text language plpgsql security definer set search_path=public as $$
declare event_id text:='account-password:'||account_id::text||':'||gen_random_uuid()::text;
begin
 if not exists(select 1 from viral_members where auth_user_id=account_id and employee_id=telegram_id and active) then raise exception 'Account membership missing';end if;
 update viral_outbox set status='cancelled',lease_until=null where chat_id=telegram_id and status='pending' and (id='account-welcome:'||account_id::text or id like 'account-password:'||account_id::text||':%');
 insert into viral_outbox(id,chat_id,body) values(event_id,telegram_id,welcome);return event_id;
end $$;
revoke all on function public.viral_hr_resend_link(uuid,text,text) from public,anon,authenticated;
grant execute on function public.viral_hr_resend_link(uuid,text,text) to service_role;
