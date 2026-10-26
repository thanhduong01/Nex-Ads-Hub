import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const owner = '00000000-0000-4000-8000-000000000001',
  other = '00000000-0000-4000-8000-000000000002',
  clientUser = '00000000-0000-4000-8000-000000000003';
test('Postgres schema, RLS, atomic writes and cross-client isolation', async (t) => {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$; grant usage on schema auth,public to authenticated,anon,service_role; grant execute on all functions in schema auth to authenticated,anon,service_role;`,
  );
  const sql = (await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')).replace(
    'create extension if not exists pgcrypto;',
    '-- gen_random_uuid is built into this PostgreSQL runtime.',
  );
  await db.exec(sql);
  await db.query('insert into auth.users(id) values($1),($2),($3)', [owner, other, clientUser]);
  await db.query(
    "insert into public.user_sessions(user_id,email,role,token_hash) values($1,'owner@example.com','admin','hash-owner')",
    [owner],
  );
  await db.query(
    "insert into public.ad_accounts(workspace_id,id,name,meta_token_encrypted) values($1,'act_1','Owner account','ciphertext'),($1,'act_2','Other client account',null),($2,'act_3','Another workspace',null)",
    [owner, other],
  );
  const a = (
    await db.query(
      "select public.save_client($1,null,'Client A','a@example.com',array['act_1']) as c",
      [owner],
    )
  ).rows[0].c;
  const b = (
    await db.query(
      "select public.save_client($1,null,'Client B','b@example.com',array['act_2']) as c",
      [owner],
    )
  ).rows[0].c;
  await db.query(
    "insert into public.campaigns(workspace_id,id,account_id,name) values($1,'camp_a','act_1','Campaign A'),($1,'camp_b','act_2','Campaign B')",
    [owner],
  );
  await t.test('schema has exactly 8 tables, all with RLS', async () => {
    const result = await db.query(
      "select relname,relrowsecurity from pg_class join pg_namespace on pg_class.relnamespace=pg_namespace.oid where nspname='public' and relkind='r'",
    );
    assert.equal(result.rows.length, 8);
    assert(result.rows.every((r) => r.relrowsecurity));
  });
  await t.test(
    'cannot assign account outside workspace and transaction preserves links',
    async () => {
      await assert.rejects(
        db.query("select public.save_client($1,$2,'Wrong','a@example.com',array['act_3'])", [
          owner,
          a.id,
        ]),
      );
      assert.equal(
        (await db.query('select account_id from public.client_accounts where client_id=$1', [a.id]))
          .rows[0].account_id,
        'act_1',
      );
    },
  );
  await t.test(
    'mixed currencies are rejected without changing client account assignments',
    async () => {
      await db.query(
        "update public.ad_accounts set currency='USD' where workspace_id=$1 and id='act_2'",
        [owner],
      );
      await assert.rejects(
        db.query(
          "select public.save_client($1,$2,'Client A','a@example.com',array['act_1','act_2'])",
          [owner, a.id],
        ),
      );
      assert.deepEqual(
        (
          await db.query('select account_id from public.client_accounts where client_id=$1', [a.id])
        ).rows.map((r) => r.account_id),
        ['act_1'],
      );
      await db.query(
        "update public.ad_accounts set currency='VND' where workspace_id=$1 and id='act_2'",
        [owner],
      );
    },
  );
  await t.test('sync is idempotent and removes revised missing dates atomically', async () => {
    const rows = [
      {
        workspace_id: owner,
        account_id: 'act_1',
        campaign_id: 'camp_a',
        date: '2026-10-01',
        spend: 100,
        impressions: 200,
        reach: 150,
        clicks: 20,
        ctr: 10,
        cpc: 5,
        frequency: 1.3,
        leads: 1,
        purchases: 1,
        purchase_value: 300,
      },
    ];
    for (let i = 0; i < 2; i++)
      await db.query(
        "select public.replace_insights_range($1,'act_1','2026-10-01','2026-10-02',$2)",
        [owner, JSON.stringify(rows)],
      );
    assert.equal(
      (await db.query('select count(*)::int as n from public.daily_insights')).rows[0].n,
      1,
    );
    await db.query(
      "select public.replace_insights_range($1,'act_1','2026-10-01','2026-10-02','[]')",
      [owner],
    );
    assert.equal(
      (await db.query('select count(*)::int as n from public.daily_insights')).rows[0].n,
      0,
    );
  });
  await t.test('client sees only own folders and assigned account', async () => {
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [clientUser, JSON.stringify({ email: 'a@example.com' })],
    );
    await db.exec('set role authenticated');
    assert.deepEqual(
      (await db.query('select id from public.clients')).rows.map((r) => r.id),
      [a.id],
    );
    assert.deepEqual(
      (await db.query('select id from public.ad_accounts')).rows.map((r) => r.id),
      ['act_1'],
    );
    assert.equal(
      (await db.query('select id from public.clients where id=$1', [b.id])).rows.length,
      0,
    );
    await db.exec('reset role');
  });
  await t.test(
    'client cannot mutate reports, access tokens, inspect sessions or call write RPC',
    async () => {
      await db.exec('set role authenticated');
      await assert.rejects(
        db.query(
          "insert into public.report_configs(workspace_id,client_id,month) values($1,$2,'2026-10')",
          [owner, a.id],
        ),
      );
      await assert.rejects(db.query('select meta_token_encrypted from public.ad_accounts'));
      await assert.rejects(db.query('select * from public.user_sessions'));
      await assert.rejects(
        db.query("select public.save_client($1,$2,'Attack','a@example.com',array['act_2'])", [
          owner,
          a.id,
        ]),
      );
      await db.exec('reset role');
    },
  );
  await t.test('admin sees only their workspace', async () => {
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [owner, JSON.stringify({ email: 'owner@example.com' })],
    );
    await db.exec('set role authenticated');
    assert.deepEqual(
      (await db.query('select id from public.ad_accounts order by id')).rows.map((r) => r.id),
      ['act_1', 'act_2'],
    );
    await db.exec('reset role');
  });
  await db.close();
});
