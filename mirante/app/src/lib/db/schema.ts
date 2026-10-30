// Banco local (SQLite no aparelho). Espelha as tabelas do Supabase, com datas em milissegundos.
export const SCHEMA_VERSION = 1;

export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  ig_id TEXT,
  handle TEXT NOT NULL UNIQUE,
  name TEXT, bio TEXT, avatar_url TEXT,
  followers INTEGER, following INTEGER, posts_count INTEGER,
  is_business INTEGER DEFAULT 0, is_private INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  error TEXT,
  on_feed INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 1,
  last_post_at INTEGER, last_checked_at INTEGER,
  added_at INTEGER, updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, emoji TEXT,
  position INTEGER DEFAULT 0, sort_pref TEXT, updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS profile_tags (profile_id TEXT, tag_id TEXT, updated_at INTEGER, PRIMARY KEY (profile_id, tag_id));

CREATE TABLE IF NOT EXISTS posts (
  rowid INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  profile_id TEXT NOT NULL,
  kind TEXT,
  taken_at INTEGER NOT NULL,
  caption TEXT, hashtags TEXT, mentions TEXT, location TEXT,
  duration REAL,
  likes INTEGER, comments INTEGER, views INTEGER,
  is_pinned INTEGER DEFAULT 0,
  thumb_url TEXT,
  media TEXT,
  top_comments TEXT,
  ocr_text TEXT, transcript TEXT,
  outlier REAL, engagement REAL,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS posts_profile_time ON posts(profile_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS posts_time ON posts(taken_at DESC);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL,
  taken_at INTEGER, expires_at INTEGER,
  kind TEXT, url TEXT, thumb_url TEXT, duration REAL, links TEXT,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS stories_profile ON stories(profile_id, taken_at);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL, parent_id TEXT,
  author TEXT, text TEXT, created_at INTEGER,
  likes INTEGER, replies INTEGER, by_owner INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id);

CREATE TABLE IF NOT EXISTS metrics (post_id TEXT, at INTEGER, likes INTEGER, comments INTEGER, views INTEGER, PRIMARY KEY (post_id, at));

CREATE TABLE IF NOT EXISTS user_state (post_id TEXT PRIMARY KEY, seen_at INTEGER, saved INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS story_seen (story_id TEXT PRIMARY KEY, seen_at INTEGER);

CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY, tbl TEXT NOT NULL, op TEXT NOT NULL, row TEXT NOT NULL, at INTEGER);

CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
  caption, hashtags, comments_text, ocr_text, transcript, profile_name,
  tokenize = "unicode61 remove_diacritics 2", prefix = '2 3 4'
);
`;

/** Pesos da relevância por coluna, na ordem do FTS: legenda, hashtags, comentários, imagem, fala, perfil. */
export const BM25_WEIGHTS = [3, 1.5, 0.5, 1.5, 2, 1];
