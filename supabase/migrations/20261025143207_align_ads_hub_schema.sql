-- Upgrade the inspected, empty legacy Ads Hub setup. No table or data is deleted.
-- New projects should run supabase/schema.sql instead of this repair migration.
begin;
set local lock_timeout = '10s';
lock table public.bms, public.ad_accounts, public.daily_insights, public.clients, public.report_configs in access exclusive mode;
do $$
begin
 if exists(select 1 from public.bms) or exists(select 1 from public.ad_accounts) or exists(select 1 from public.daily_insights) or exists(select 1 from public.clients) or exists(select 1 from public.report_configs) then
  raise exception 'Legacy tables contain data. Stop and prepare a data-preserving migration.';
 end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='bms' and column_name='workspace_id') then
  raise exception 'Schema is already initialized. This repair only targets the inspected legacy setup.';
 end if;
end $$;
create schema ads_hub_legacy;
revoke all on schema ads_hub_legacy from public,anon,authenticated;
alter table public.bms set schema ads_hub_legacy;
alter table public.ad_accounts set schema ads_hub_legacy;
alter table public.daily_insights set schema ads_hub_legacy;
alter table public.clients set schema ads_hub_legacy;
alter table public.report_configs set schema ads_hub_legacy;

-- Ads Hub: run once in the Supabase SQL editor. Exactly eight application tables.
create extension if not exists pgcrypto;
create schema if not exists ads_hub_private;
revoke all on schema ads_hub_private from public,anon;
grant usage on schema ads_hub_private to authenticated;

create table public.bms (
 workspace_id uuid not null references auth.users(id) on delete cascade,
 id text not null, name text not null, created_at timestamptz not null default now(),
 primary key(workspace_id,id)
);
create table public.ad_accounts (
 workspace_id uuid not null references auth.users(id) on delete cascade,
 id text not null, bm_id text, name text not null, account_status integer not null default 1,
 role text not null default 'Advertiser', currency text not null default 'VND', timezone_name text not null default 'Asia/Ho_Chi_Minh',
 balance numeric not null default 0, amount_spent numeric not null default 0,
 is_tracked boolean not null default true, fb_user_id text, meta_token_encrypted text,
 last_synced_at timestamptz, last_sync_error text, sync_lock_until timestamptz,
 created_at timestamptz not null default now(), primary key(workspace_id,id),
 foreign key(workspace_id,bm_id) references public.bms(workspace_id,id)
);
create table public.campaigns (
 workspace_id uuid not null, id text not null, account_id text not null, name text not null,
 status text not null default 'UNKNOWN', objective text, daily_budget numeric,
 primary key(workspace_id,id), unique(workspace_id,id,account_id),
 foreign key(workspace_id,account_id) references public.ad_accounts(workspace_id,id) on delete cascade
);
create table public.daily_insights (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, campaign_id text not null, account_id text not null,
 date date not null, spend numeric not null default 0, impressions bigint not null default 0,
 reach bigint not null default 0, clicks bigint not null default 0, ctr numeric not null default 0,
 cpc numeric not null default 0, frequency numeric not null default 0,
 leads numeric not null default 0, purchases numeric not null default 0, purchase_value numeric not null default 0,
 synced_at timestamptz not null default now(), unique(workspace_id,campaign_id,date),
 foreign key(workspace_id,campaign_id,account_id) references public.campaigns(workspace_id,id,account_id) on delete cascade
);
create table public.clients (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 80), owner_email text not null check(owner_email=lower(owner_email)),
 created_at timestamptz not null default now(), unique(workspace_id,id)
);
create table public.client_accounts (
 workspace_id uuid not null, client_id uuid not null, account_id text not null,
 primary key(client_id,account_id),
 foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete cascade,
 foreign key(workspace_id,account_id) references public.ad_accounts(workspace_id,id) on delete cascade
);
create table public.report_configs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, client_id uuid not null,
 month text not null check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 selected_metrics jsonb not null default '["spend","impressions","clicks","actions:purchase","purchase_value","ROAS"]'::jsonb,
 custom_names jsonb not null default '{}'::jsonb, custom_metrics jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now(), unique(client_id,month),
 foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete cascade
);
create table public.user_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 email text not null, fb_user_id text, role text not null check(role in ('admin','client')),
 token_hash text not null unique, created_at timestamptz not null default now(),
 last_active timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days'
);
create index insights_date_idx on public.daily_insights(workspace_id,account_id,date);
create index clients_email_idx on public.clients(owner_email);
create index sessions_user_idx on public.user_sessions(user_id,expires_at);
create index accounts_tracking_idx on public.ad_accounts(is_tracked);
create index accounts_bm_idx on public.ad_accounts(workspace_id,bm_id);
create index campaigns_account_idx on public.campaigns(workspace_id,account_id);
create index insights_campaign_idx on public.daily_insights(workspace_id,campaign_id,account_id);
create index links_client_idx on public.client_accounts(workspace_id,client_id);
create index links_account_idx on public.client_accounts(workspace_id,account_id);
create index reports_client_idx on public.report_configs(workspace_id,client_id);

-- Role is issued only by the server after authenticating with Supabase Auth.
create function ads_hub_private.hub_admin(owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and owner=auth.uid() and exists(select 1 from public.user_sessions where user_id=auth.uid() and role='admin' and expires_at>now());
$$;
create function ads_hub_private.hub_client(client uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.clients c where c.id=client and (ads_hub_private.hub_admin(c.workspace_id) or c.owner_email=lower(auth.jwt()->>'email')));
$$;
create function ads_hub_private.hub_account(owner uuid,account text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (ads_hub_private.hub_admin(owner) or exists(select 1 from public.client_accounts ca join public.clients c on ca.client_id=c.id where ca.workspace_id=owner and ca.account_id=account and c.owner_email=lower(auth.jwt()->>'email')));
$$;

alter table public.bms enable row level security;
alter table public.ad_accounts enable row level security;
alter table public.campaigns enable row level security;
alter table public.daily_insights enable row level security;
alter table public.clients enable row level security;
alter table public.client_accounts enable row level security;
alter table public.report_configs enable row level security;
alter table public.user_sessions enable row level security;

create policy bms_read on public.bms for select to authenticated using(ads_hub_private.hub_admin(workspace_id));
create policy accounts_read on public.ad_accounts for select to authenticated using(ads_hub_private.hub_account(workspace_id,id));
create policy campaigns_read on public.campaigns for select to authenticated using(ads_hub_private.hub_account(workspace_id,account_id));
create policy insights_read on public.daily_insights for select to authenticated using(ads_hub_private.hub_account(workspace_id,account_id));
create policy clients_read on public.clients for select to authenticated using(ads_hub_private.hub_client(id));
create policy links_read on public.client_accounts for select to authenticated using(ads_hub_private.hub_client(client_id));
create policy reports_read on public.report_configs for select to authenticated using(ads_hub_private.hub_client(client_id));
create policy sessions_private on public.user_sessions for all to anon,authenticated using(false) with check(false);
-- No public mutation policies. Writes go through authenticated server APIs.
-- Sessions explicitly deny browser roles. Hashes and encrypted tokens stay server-only.
revoke all on public.bms,public.ad_accounts,public.campaigns,public.daily_insights,public.clients,public.client_accounts,public.report_configs,public.user_sessions from anon,authenticated;
grant select on public.bms,public.campaigns,public.daily_insights,public.clients,public.client_accounts,public.report_configs to authenticated;
grant select(workspace_id,id,bm_id,name,account_status,role,currency,timezone_name,balance,amount_spent,is_tracked,last_synced_at,last_sync_error) on public.ad_accounts to authenticated;
grant all on public.bms,public.ad_accounts,public.campaigns,public.daily_insights,public.clients,public.client_accounts,public.report_configs,public.user_sessions to service_role;

create function public.save_client(p_workspace uuid,p_id uuid,p_name text,p_email text,p_accounts text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result public.clients; account text;
begin
 if p_id is not null and not exists(select 1 from public.clients where id=p_id and workspace_id=p_workspace) then raise exception 'Client not found'; end if;
 foreach account in array p_accounts loop
  if not exists(select 1 from public.ad_accounts where workspace_id=p_workspace and id=account) then raise exception 'Account outside workspace'; end if;
 end loop;
 if (select count(distinct currency) from public.ad_accounts where workspace_id=p_workspace and id=any(p_accounts))>1 then raise exception 'Client accounts must use the same currency'; end if;
 if p_id is null then
  insert into public.clients(workspace_id,name,owner_email) values(p_workspace,p_name,p_email) returning * into result;
 else
  update public.clients set name=p_name,owner_email=p_email where id=p_id and workspace_id=p_workspace returning * into result;
 end if;
 delete from public.client_accounts where client_id=result.id;
 insert into public.client_accounts(workspace_id,client_id,account_id) select p_workspace,result.id,unnest(p_accounts) on conflict do nothing;
 return to_jsonb(result);
end $$;

create function public.replace_insights_range(p_workspace uuid,p_account text,p_since date,p_until date,p_rows jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_rows)<>'array' then raise exception 'Rows must be an array'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where (r->>'workspace_id')::uuid<>p_workspace or r->>'account_id'<>p_account or (r->>'date')::date not between p_since and p_until) then raise exception 'Invalid insight scope'; end if;
 delete from public.daily_insights where workspace_id=p_workspace and account_id=p_account and date between p_since and p_until;
 insert into public.daily_insights(workspace_id,account_id,campaign_id,date,spend,impressions,reach,clicks,ctr,cpc,frequency,leads,purchases,purchase_value,synced_at)
 select p_workspace,p_account,r.campaign_id,r.date,r.spend,r.impressions,r.reach,r.clicks,r.ctr,r.cpc,r.frequency,r.leads,r.purchases,r.purchase_value,now()
 from jsonb_to_recordset(p_rows) as r(campaign_id text,date date,spend numeric,impressions bigint,reach bigint,clicks bigint,ctr numeric,cpc numeric,frequency numeric,leads numeric,purchases numeric,purchase_value numeric)
 on conflict(workspace_id,campaign_id,date) do update set spend=excluded.spend,impressions=excluded.impressions,reach=excluded.reach,clicks=excluded.clicks,ctr=excluded.ctr,cpc=excluded.cpc,frequency=excluded.frequency,leads=excluded.leads,purchases=excluded.purchases,purchase_value=excluded.purchase_value,synced_at=excluded.synced_at;
end $$;
revoke all on function public.save_client(uuid,uuid,text,text,text[]),public.replace_insights_range(uuid,text,date,date,jsonb) from public,anon,authenticated;
grant execute on function public.save_client(uuid,uuid,text,text,text[]),public.replace_insights_range(uuid,text,date,date,jsonb) to service_role;
revoke all on function ads_hub_private.hub_admin(uuid),ads_hub_private.hub_client(uuid),ads_hub_private.hub_account(uuid,text) from public,anon;
grant execute on function ads_hub_private.hub_admin(uuid),ads_hub_private.hub_client(uuid),ads_hub_private.hub_account(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
