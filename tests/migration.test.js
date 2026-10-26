import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = (
  await readFile(
    new URL('../supabase/migrations/20261025143207_align_ads_hub_schema.sql', import.meta.url),
    'utf8',
  )
).replace('create extension if not exists pgcrypto;', '-- built-in gen_random_uuid');

async function legacyDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth,public to authenticated,anon,service_role;
    grant execute on all functions in schema auth to authenticated,anon,service_role;
    create table public.bms(id text primary key,name text,fb_user_id text);
    create table public.ad_accounts(id text primary key,name text,bm_id text,account_status integer,balance text,is_tracked boolean default true);
    create table public.daily_insights(id uuid primary key default gen_random_uuid(),ad_account_id text,campaign_id text,date date,spend numeric,impressions bigint,actions jsonb,unique(campaign_id,date));
    create table public.clients(id uuid primary key,name text,slug text unique,owner_email text);
    create table public.report_configs(client_id uuid,month text,selected_metrics jsonb,custom_names jsonb,custom_metrics jsonb);
    alter table public.bms enable row level security;
    alter table public.ad_accounts enable row level security;
    alter table public.daily_insights enable row level security;
    alter table public.clients enable row level security;
    alter table public.report_configs enable row level security;
  `);
  return db;
}

test('repair preserves legacy structures and creates a protected schema that can store sessions', async () => {
  const db = await legacyDatabase();
  try {
    await db.exec(migration);
    const counts = (
      await db.query(
        "select table_schema,count(*)::int as n from information_schema.tables where table_schema in ('public','ads_hub_legacy') group by table_schema order by table_schema",
      )
    ).rows;
    assert.deepEqual(counts, [
      { table_schema: 'ads_hub_legacy', n: 5 },
      { table_schema: 'public', n: 8 },
    ]);
    const publicTables = (
      await db.query(
        "select relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r'",
      )
    ).rows;
    assert(publicTables.every((t) => t.relrowsecurity));
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from pg_proc where pronamespace='public'::regnamespace and prosecdef",
        )
      ).rows[0].n,
      0,
    );
    const owner = (await db.query('insert into auth.users values(gen_random_uuid()) returning id'))
      .rows[0].id;
    await db.exec('set role service_role');
    const row = (
      await db.query(
        "insert into public.user_sessions(user_id,email,role,token_hash) values($1,'owner@example.com','admin','test-only-hash') returning id,expires_at",
        [owner],
      )
    ).rows[0];
    assert(row.id);
    assert(new Date(row.expires_at).getTime() > Date.now());
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.user_sessions'));
    await assert.rejects(db.query('select * from ads_hub_legacy.bms'));
    await db.exec('reset role');
  } finally {
    await db.close();
  }
});

test('repair refuses non-empty legacy tables and leaves their data intact', async () => {
  const db = await legacyDatabase();
  try {
    await db.query("insert into public.bms values('existing','Keep me','old-owner')");
    await assert.rejects(db.exec(migration), /Legacy tables contain data/);
    await db.exec('rollback');
    assert.equal((await db.query('select name from public.bms')).rows[0].name, 'Keep me');
    assert.equal(
      (await db.query("select to_regnamespace('ads_hub_legacy') as ns")).rows[0].ns,
      null,
    );
  } finally {
    await db.close();
  }
});
