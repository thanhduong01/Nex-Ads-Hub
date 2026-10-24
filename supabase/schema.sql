-- Chạy trong Supabase SQL Editor
create table if not exists bms (id text primary key, name text not null, fb_user_id text, created_at timestamp default now());
create table if not exists ad_accounts (id text primary key, name text, bm_id text references bms(id), account_status int, balance text, amount_spent text, fb_user_id text, is_tracked boolean default true, created_at timestamp default now());
create table if not exists campaigns (id text primary key, name text, ad_account_id text references ad_accounts(id), status text, daily_budget text, created_at timestamp default now());
create table if not exists daily_insights (id uuid primary key default gen_random_uuid(), ad_account_id text references ad_accounts(id), campaign_id text, date date not null, spend numeric, impressions bigint, reach bigint, clicks bigint, ctr numeric, cpc numeric, actions jsonb, purchase_value numeric, unique(campaign_id, date));
create table if not exists clients (id uuid primary key default gen_random_uuid(), name text not null, slug text unique, owner_email text, created_at timestamp default now());
create table if not exists client_accounts (client_id uuid references clients(id), ad_account_id text references ad_accounts(id), primary key (client_id, ad_account_id));
create table if not exists report_configs (id uuid primary key default gen_random_uuid(), client_id uuid references clients(id), month text not null, selected_metrics jsonb, custom_names jsonb, custom_metrics jsonb, created_at timestamp default now(), unique(client_id, month));
create table if not exists user_sessions (id uuid primary key default gen_random_uuid(), email text, fb_user_id text, token text, last_active timestamp default now(), expires_at timestamp default now() + interval '7 days');
-- RLS tắt cho service_role làm việc, bạn bật lại khi có Auth
alter table daily_insights enable row level security;
create policy "service_role_all" on daily_insights for all using (true);