-- Mirante: banco na nuvem (Supabase / Postgres).
-- Datas em milissegundos desde 1970 (bigint), iguais às do app, para a sincronização ser simples.
-- O trabalhador grava com a chave de serviço (ignora RLS). O app lê e grava com o login do dono.

create or replace function now_ms() returns bigint language sql stable as
$$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

-- ---------- dono ----------
-- O primeiro usuário que entrar vira o dono. Depois disso, desligue novos cadastros em
-- Authentication → Sign In / Providers → "Allow new users to sign up".
create table if not exists owners (user_id uuid primary key references auth.users on delete cascade);

create or replace function is_owner() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from owners where user_id = auth.uid()) $$;

create or replace function claim_first_owner() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from owners) then insert into owners(user_id) values (new.id); end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created_mirante on auth.users;
create trigger on_auth_user_created_mirante after insert on auth.users for each row execute function claim_first_owner();

-- ---------- conteúdo ----------
create table if not exists profiles (
  id text primary key,
  ig_id text unique,
  handle text not null unique,
  name text, bio text, avatar_url text,
  followers integer, following integer, posts_count integer,
  is_business boolean default false, is_private boolean default false,
  status text not null default 'pending' check (status in ('pending', 'ok', 'error', 'private')),
  error text,
  on_feed boolean not null default true,
  priority smallint not null default 1,
  last_post_at bigint, last_checked_at bigint,
  next_check_at bigint default 0,
  stories_checked_at bigint default 0,
  added_at bigint default now_ms(),
  updated_at bigint not null default now_ms()
);

create table if not exists tags (
  id text primary key, name text not null, color text, emoji text,
  position integer default 0, sort_pref jsonb,
  updated_at bigint not null default now_ms()
);
create table if not exists profile_tags (
  profile_id text references profiles on delete cascade,
  tag_id text references tags on delete cascade,
  updated_at bigint not null default now_ms(),
  primary key (profile_id, tag_id)
);

create table if not exists posts (
  id text primary key,                         -- shortcode
  profile_id text not null references profiles on delete cascade,
  kind text not null,                          -- image | carousel | reel | video
  taken_at bigint not null,
  caption text, hashtags text, mentions text, location text,
  duration real,
  likes integer, comments integer, views integer,
  is_pinned boolean default false,
  thumb_url text,
  media jsonb,                                 -- [{kind, url, w, h}]
  top_comments text,                           -- textos dos comentários mais curtidos (entra na pesquisa)
  ocr_text text, transcript text,
  outlier real, engagement real,
  comments_checked_at bigint default 0,
  updated_at bigint not null default now_ms()
);
create index if not exists posts_profile_time on posts (profile_id, taken_at desc);
create index if not exists posts_updated on posts (updated_at);

create table if not exists stories (
  id text primary key,
  profile_id text not null references profiles on delete cascade,
  taken_at bigint not null, expires_at bigint not null,
  kind text not null, url text, thumb_url text, duration real, links text,
  storage_path text,
  updated_at bigint not null default now_ms()
);
create index if not exists stories_updated on stories (updated_at);

create table if not exists comments (
  id text primary key,
  post_id text not null references posts on delete cascade,
  parent_id text,
  author text, text text, created_at bigint,
  likes integer default 0, replies integer default 0, by_owner boolean default false,
  updated_at bigint not null default now_ms()
);
create index if not exists comments_post on comments (post_id);

-- "fotografias" dos números de cada post ao longo do tempo
create table if not exists metrics (
  post_id text references posts on delete cascade,
  at bigint,
  likes integer, comments integer, views integer,
  primary key (post_id, at)
);

-- ---------- o que é do usuário ----------
create table if not exists user_state (
  post_id text primary key,
  seen_at bigint, saved boolean default false, hidden boolean default false,
  updated_at bigint not null default now_ms()
);

-- remoções, para os aparelhos apagarem também
create table if not exists deleted (
  id bigserial primary key,
  tbl text not null, key jsonb not null,
  updated_at bigint not null default now_ms()
);
create index if not exists deleted_updated on deleted (updated_at);

-- ---------- conversa com o trabalhador ----------
create table if not exists commands (
  id bigserial primary key,
  kind text not null,                          -- ig_login | ig_code | refresh
  payload jsonb not null default '{}',
  status text not null default 'pending',      -- pending | running | needs_code | done | error
  result jsonb,
  created_at bigint not null default now_ms(),
  updated_at bigint not null default now_ms()
);
create table if not exists worker_status (
  id smallint primary key default 1 check (id = 1),
  state text, message text,
  last_run_at bigint, paused_until bigint,
  ig_user text, session_ok boolean default false,
  updated_at bigint not null default now_ms()
);
insert into worker_status (id, state, message) values (1, 'idle', 'Esperando o trabalhador') on conflict do nothing;

-- ---------- gatilhos ----------
create or replace function touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at := now_ms(); return new; end $$;

create or replace function remember_delete() returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb := to_jsonb(old); k jsonb;
begin
  if tg_table_name = 'profile_tags' then k := jsonb_build_object('profile_id', r->'profile_id', 'tag_id', r->'tag_id');
  elsif tg_table_name = 'user_state' then k := jsonb_build_object('post_id', r->'post_id');
  else k := jsonb_build_object('id', r->'id');
  end if;
  insert into deleted (tbl, key) values (tg_table_name, k);
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'tags', 'profile_tags', 'posts', 'stories', 'comments', 'user_state', 'commands', 'worker_status'] loop
    execute format('drop trigger if exists touch on %I', t);
    execute format('create trigger touch before insert or update on %I for each row execute function touch_updated_at()', t);
  end loop;
  foreach t in array array['profiles', 'tags', 'profile_tags', 'posts', 'stories', 'user_state'] loop
    execute format('drop trigger if exists tomb on %I', t);
    execute format('create trigger tomb after delete on %I for each row execute function remember_delete()', t);
  end loop;
end $$;

-- ---------- acesso (RLS) ----------
do $$
declare t text;
begin
  foreach t in array array['owners', 'profiles', 'tags', 'profile_tags', 'posts', 'stories', 'comments', 'metrics', 'user_state', 'deleted', 'commands', 'worker_status'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
  -- leitura: só o dono
  foreach t in array array['profiles', 'tags', 'profile_tags', 'posts', 'stories', 'comments', 'metrics', 'user_state', 'deleted', 'commands', 'worker_status'] loop
    execute format('drop policy if exists owner_read on %I', t);
    execute format('create policy owner_read on %I for select to authenticated using (is_owner())', t);
  end loop;
  -- escrita pelo app: perfis, playlists, estado dos posts
  foreach t in array array['profiles', 'tags', 'profile_tags', 'user_state'] loop
    execute format('drop policy if exists owner_write on %I', t);
    execute format('create policy owner_write on %I for all to authenticated using (is_owner()) with check (is_owner())', t);
  end loop;
end $$;
drop policy if exists owner_command on commands;
grant usage, select on sequence commands_id_seq to authenticated;
create policy owner_command on commands for insert to authenticated with check (is_owner() and kind in ('ig_login', 'ig_code', 'refresh'));
drop policy if exists owner_self on owners;
create policy owner_self on owners for select to authenticated using (user_id = auth.uid());

-- ---------- tempo real e arquivos ----------
do $$ begin
  alter publication supabase_realtime add table posts, stories, profiles;
exception when others then null; end $$;

insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
