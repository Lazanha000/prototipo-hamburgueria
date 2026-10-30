// Confere a migração num Postgres embutido: npm run test:sql
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const db = new PGlite();
await db.exec(`
create schema auth; create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
create role authenticated; create publication supabase_realtime;
`);
const sql = fs.readFileSync(process.argv[2], "utf8");
await db.exec(sql);
await db.exec(sql); // rodar duas vezes não pode quebrar
await db.exec(`insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');`);
console.log("donos:", (await db.query("select * from owners")).rows);
await db.exec(`insert into profiles (id, handle) values ('a', 'lia'); insert into tags (id, name) values ('t', 'X'); insert into profile_tags values ('a', 't');
insert into posts (id, profile_id, kind, taken_at) values ('P1', 'a', 'reel', 1);`);
const r = (await db.query("select updated_at from posts")).rows[0];
console.log("updated_at preenchido:", r.updated_at > 1700000000000);
await db.exec(`delete from profiles where id = 'a';`);
console.log("remoções:", (await db.query("select tbl, key from deleted order by id")).rows);
await db.exec(`grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated; set role authenticated; select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);`);
console.log("não-dono vê perfis:", (await db.query("select count(*) from profiles")).rows);
await db.exec(`reset role; insert into profiles (id, handle) values ('b', 'bia'); set role authenticated; select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);`);
console.log("dono vê perfis:", (await db.query("select count(*)::int as n from profiles")).rows);
try { await db.exec(`insert into commands (kind) values ('apagar_tudo')`); console.log("ERRO: pedido estranho aceito"); } catch { console.log("pedido estranho recusado: ok"); }
await db.exec(`insert into commands (kind, payload) values ('refresh', '{}')`); console.log("pedido refresh aceito: ok");
try { await db.exec(`insert into posts (id, profile_id, kind, taken_at) values ('X', 'b', 'reel', 1)`); console.log("ERRO: app gravou post"); } catch { console.log("app não grava posts: ok"); }
