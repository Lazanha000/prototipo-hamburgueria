// Todas as consultas do banco local. Roda dentro do Web Worker (e em Node, nos testes).
import { SCHEMA, SCHEMA_VERSION, BM25_WEIGHTS } from "./schema";
import { parseQuery } from "./searchParse";
import { sortRows, type SortKey, type Mode, type Group, type SortRow } from "./sorting";

type Bind = (string | number | null)[] | Record<string, string | number | null>;
export interface RawDB {
  exec(opts: { sql: string; bind?: Bind; rowMode?: "object"; returnValue?: "resultRows" }): unknown;
  exec(sql: string): unknown;
  selectObjects(sql: string, bind?: Bind): Record<string, unknown>[];
  selectValue(sql: string, bind?: Bind): unknown;
  transaction<T>(fn: (db: RawDB) => T): T;
  changes(): number;
}

export interface Profile {
  id: string; ig_id?: string | null; handle: string; name?: string | null; bio?: string | null; avatar_url?: string | null;
  followers?: number | null; following?: number | null; posts_count?: number | null;
  is_business?: number; is_private?: number; status?: string; error?: string | null;
  on_feed?: number; priority?: number; last_post_at?: number | null; last_checked_at?: number | null;
  added_at?: number; updated_at?: number;
}
export interface Tag { id: string; name: string; color?: string | null; emoji?: string | null; position?: number; sort_pref?: string | null; updated_at?: number }
export interface MediaItem { kind: "image" | "video"; url: string; thumb?: string; w?: number; h?: number }
export interface Post {
  id: string; profile_id: string; kind: string; taken_at: number;
  caption?: string | null; hashtags?: string | null; mentions?: string | null; location?: string | null;
  duration?: number | null; likes?: number | null; comments?: number | null; views?: number | null;
  is_pinned?: number; thumb_url?: string | null; media?: string | null; top_comments?: string | null;
  ocr_text?: string | null; transcript?: string | null; outlier?: number | null; engagement?: number | null; updated_at?: number;
}
export interface Story { id: string; profile_id: string; taken_at: number; expires_at: number; kind: string; url: string; thumb_url?: string | null; duration?: number | null; links?: string | null; updated_at?: number }
export interface Comment { id: string; post_id: string; parent_id?: string | null; author: string; text: string; created_at: number; likes: number; replies: number; by_owner?: number }
export interface Metric { post_id: string; at: number; likes: number | null; comments: number | null; views: number | null }
export interface UserState { post_id: string; seen_at?: number | null; saved?: number; hidden?: number; updated_at?: number }

export interface FeedParams {
  tagIds?: string[]; profileId?: string; kinds?: string[];
  since?: number; until?: number;
  onlyUnseen?: boolean; onlySaved?: boolean; showHidden?: boolean; minViews?: number;
  q?: string;
  sort?: SortKey[]; mode?: Mode; group?: Group;
  offset?: number; limit?: number;
}
export interface FeedRow extends Post {
  handle: string; profile_name: string | null; avatar_url: string | null; followers: number | null;
  saved: number; hidden: number; seen_at: number | null; is_new: number;
  found_in?: string; snippet?: string;
}
export interface FeedResult { total: number; hiddenCount: number; rows: FeedRow[]; ms: number }

const now = () => Date.now();
const DAY = 864e5;
const COLS = {
  profiles: ["id", "ig_id", "handle", "name", "bio", "avatar_url", "followers", "following", "posts_count", "is_business", "is_private", "status", "error", "on_feed", "priority", "last_post_at", "last_checked_at", "added_at", "updated_at"],
  tags: ["id", "name", "color", "emoji", "position", "sort_pref", "updated_at"],
  profile_tags: ["profile_id", "tag_id", "updated_at"],
  posts: ["id", "profile_id", "kind", "taken_at", "caption", "hashtags", "mentions", "location", "duration", "likes", "comments", "views", "is_pinned", "thumb_url", "media", "top_comments", "ocr_text", "transcript", "outlier", "engagement", "updated_at"],
  stories: ["id", "profile_id", "taken_at", "expires_at", "kind", "url", "thumb_url", "duration", "links", "updated_at"],
  comments: ["id", "post_id", "parent_id", "author", "text", "created_at", "likes", "replies", "by_owner"],
  metrics: ["post_id", "at", "likes", "comments", "views"],
  user_state: ["post_id", "seen_at", "saved", "hidden", "updated_at"],
} as const;
export type Table = keyof typeof COLS;
const KEYS: Record<Table, string[]> = {
  profiles: ["id"], tags: ["id"], profile_tags: ["profile_id", "tag_id"], posts: ["id"], stories: ["id"],
  comments: ["id"], metrics: ["post_id", "at"], user_state: ["post_id"],
};
export const TABLES = Object.keys(COLS) as Table[];
const FOUND_LABEL = ["na legenda", "nas hashtags", "num comentário", "escrito na imagem", "no que é falado", "no nome do perfil"];

export class Store {
  private cache = new Map<string, SortRow[]>();
  private version = 0;
  constructor(private db: RawDB) {}

  init() {
    this.db.exec(SCHEMA);
    const v = this.meta("schema_version");
    if (!v) this.setMeta("schema_version", String(SCHEMA_VERSION));
    const last = this.meta("last_visit");
    this.setMeta("prev_visit", last || String(now()));
    this.setMeta("last_visit", String(now()));
  }

  // ---------- meta ----------
  meta(key: string): string | null {
    return (this.db.selectValue("SELECT value FROM meta WHERE key = ?", [key]) as string | undefined) ?? null;
  }
  setMeta(key: string, value: string) {
    this.db.exec({ sql: "INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", bind: [key, value] });
  }
  private touched() { this.version++; this.cache.clear(); }

  // ---------- gravação ----------
  /** Insere ou atualiza linhas (do servidor, da demonstração ou do próprio app). */
  upsert(table: Table, rows: Record<string, unknown>[]) {
    if (!rows.length) return;
    const cols = COLS[table] as readonly string[];
    const keys = KEYS[table];
    const sql = `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})
      ON CONFLICT(${keys.join(",")}) DO UPDATE SET ${cols.filter(c => !keys.includes(c)).map(c => `${c} = excluded.${c}`).join(", ")}`;
    this.db.transaction(db => {
      for (const r of rows) db.exec({ sql, bind: cols.map(c => norm(r[c])) });
      if (table === "posts") this.refreshFts(rows.map(r => r.id as string));
      if (table === "profiles") this.refreshFtsForProfiles(rows.map(r => r.id as string));
    });
    this.touched();
  }

  remove(table: Table, keyRows: Record<string, unknown>[]) {
    const keys = KEYS[table];
    this.db.transaction(db => {
      for (const k of keyRows) {
        if (table === "posts") db.exec({ sql: "DELETE FROM posts_fts WHERE rowid = (SELECT rowid FROM posts WHERE id = ?)", bind: [k.id as string] });
        db.exec({ sql: `DELETE FROM ${table} WHERE ${keys.map(c => `${c} = ?`).join(" AND ")}`, bind: keys.map(c => norm(k[c])) });
      }
    });
    this.touched();
  }

  private refreshFts(ids: string[]) {
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400);
      const ph = chunk.map(() => "?").join(",");
      this.db.exec({ sql: `DELETE FROM posts_fts WHERE rowid IN (SELECT rowid FROM posts WHERE id IN (${ph}))`, bind: chunk });
      this.db.exec({
        sql: `INSERT INTO posts_fts(rowid, caption, hashtags, comments_text, ocr_text, transcript, profile_name)
              SELECT p.rowid, p.caption, p.hashtags, p.top_comments, p.ocr_text, p.transcript, coalesce(pr.name,'') || ' ' || coalesce(pr.handle,'')
              FROM posts p LEFT JOIN profiles pr ON pr.id = p.profile_id WHERE p.id IN (${ph})`, bind: chunk,
      });
    }
  }
  private refreshFtsForProfiles(ids: string[]) {
    if (!ids.length) return;
    const posts = this.db.selectObjects(`SELECT id FROM posts WHERE profile_id IN (${ids.map(() => "?").join(",")})`, ids).map(r => r.id as string);
    if (posts.length) this.refreshFts(posts);
  }

  // ---------- fila de envio (o que o app mudou e ainda não foi para a nuvem) ----------
  queue(tbl: Table, op: "upsert" | "delete", row: Record<string, unknown>) {
    this.db.exec({ sql: "INSERT INTO outbox(tbl, op, row, at) VALUES (?, ?, ?, ?)", bind: [tbl, op, JSON.stringify(row), now()] });
  }
  outbox(): { id: number; tbl: Table; op: "upsert" | "delete"; row: Record<string, unknown> }[] {
    return this.db.selectObjects("SELECT id, tbl, op, row FROM outbox ORDER BY id LIMIT 500").map(r => ({ id: r.id as number, tbl: r.tbl as Table, op: r.op as "upsert" | "delete", row: JSON.parse(r.row as string) }));
  }
  clearOutbox(ids: number[]) {
    if (ids.length) this.db.exec({ sql: `DELETE FROM outbox WHERE id IN (${ids.map(() => "?").join(",")})`, bind: ids });
  }
  /** Mudança feita pelo usuário: grava aqui e enfileira para a nuvem. */
  local(table: Table, rows: Record<string, unknown>[], op: "upsert" | "delete" = "upsert") {
    const t = now();
    const stamped = rows.map(r => (op === "upsert" && (COLS[table] as readonly string[]).includes("updated_at") ? { ...r, updated_at: t } : r));
    if (op === "upsert") this.upsert(table, stamped); else this.remove(table, stamped);
    this.db.transaction(() => { for (const r of stamped) this.queue(table, op, r); });
  }

  // ---------- feed e pesquisa ----------
  feed(p: FeedParams): FeedResult {
    const t0 = performance.now();
    const { offset = 0, limit = 60 } = p;
    const key = JSON.stringify({ ...p, offset: 0, limit: 0 });
    let ordered = this.cache.get(key);
    let hiddenCount = 0;
    const q = p.q?.trim() ? parseQuery(p.q) : null;
    if (!ordered) {
      const where: string[] = [], bind: (string | number)[] = [];
      let from = "posts p JOIN profiles pr ON pr.id = p.profile_id LEFT JOIN user_state us ON us.post_id = p.id";
      let rel = "0";
      if (q?.match) {
        from += " JOIN posts_fts f ON f.rowid = p.rowid";
        where.push("posts_fts MATCH ?"); bind.push(q.match);
        rel = `-bm25(posts_fts, ${BM25_WEIGHTS.join(",")})`;
      } else if (q?.excluded.length) {
        where.push("p.rowid NOT IN (SELECT rowid FROM posts_fts WHERE posts_fts MATCH ?)"); bind.push(q.excluded.join(" OR "));
      }
      if (p.profileId) { where.push("p.profile_id = ?"); bind.push(p.profileId); }
      else if (!q?.handles.length) where.push("pr.on_feed = 1");
      if (q?.handles.length) { where.push(`pr.handle IN (${q.handles.map(() => "?").join(",")})`); bind.push(...q.handles); }
      if (p.tagIds?.length) { where.push(`p.profile_id IN (SELECT profile_id FROM profile_tags WHERE tag_id IN (${p.tagIds.map(() => "?").join(",")}))`); bind.push(...p.tagIds); }
      const kinds = [...(p.kinds || []), ...(q?.kinds || [])];
      if (kinds.length) { where.push(`p.kind IN (${kinds.map(() => "?").join(",")})`); bind.push(...kinds); }
      if (p.since) { where.push("p.taken_at >= ?"); bind.push(p.since); }
      if (p.until) { where.push("p.taken_at <= ?"); bind.push(p.until); }
      if (p.minViews) { where.push("coalesce(p.views, 0) >= ?"); bind.push(p.minViews); }
      if (p.onlyUnseen) where.push("us.seen_at IS NULL");
      if (p.onlySaved) where.push("us.saved = 1");
      const sql = `SELECT p.rowid AS rowid, p.taken_at, p.views, p.likes, p.comments, p.engagement, p.outlier, p.kind,
                   coalesce(us.hidden, 0) AS hidden, ${rel} AS rel FROM ${from}${where.length ? " WHERE " + where.join(" AND ") : ""}`;
      const raw = this.db.selectObjects(sql, bind);
      const t = now();
      const rows: SortRow[] = [];
      for (const r of raw) {
        if (r.hidden && !p.showHidden) { hiddenCount++; continue; }
        const age = Math.max(0, (t - (r.taken_at as number)) / DAY);
        const relv = q?.match
          ? (r.rel as number) * (1 + 0.15 * Math.exp(-age / 60))
          : ((r.outlier as number | null) ?? 1) * Math.exp(-age / 45);
        const video = r.kind === "reel" || r.kind === "video";
        rows.push({
          rowid: r.rowid as number, taken_at: r.taken_at as number,
          views: video ? (r.views as number | null) : null,  // fotos não têm contagem de views
          likes: r.likes as number | null, comments: r.comments as number | null,
          engagement: r.engagement as number | null, rel: relv,
        });
      }
      let sort = p.sort?.length ? p.sort : undefined;
      if (!sort) sort = q?.match ? [{ crit: "relevance", dir: "desc" }] : [{ crit: "date", dir: "desc" }];
      ordered = sortRows(rows, sort, p.mode || "balanced", p.group || "");
      (ordered as SortRow[] & { hiddenCount?: number }).hiddenCount = hiddenCount;
      this.cache.set(key, ordered);
      if (this.cache.size > 30) this.cache.delete(this.cache.keys().next().value as string);
    } else hiddenCount = (ordered as SortRow[] & { hiddenCount?: number }).hiddenCount || 0;

    const page = ordered.slice(offset, offset + limit).map(r => r.rowid);
    const rows = this.rowsFor(page);
    if (q?.match && page.length) this.addSnippets(rows, page, q.match);
    return { total: ordered.length, hiddenCount, rows, ms: Math.round((performance.now() - t0) * 10) / 10 };
  }

  private rowsFor(rowids: number[]): FeedRow[] {
    if (!rowids.length) return [];
    const prev = Number(this.meta("prev_visit") || 0);
    const got = this.db.selectObjects(
      `SELECT p.*, p.rowid AS _rowid, pr.handle, pr.name AS profile_name, pr.avatar_url, pr.followers,
              coalesce(us.saved, 0) AS saved, coalesce(us.hidden, 0) AS hidden, us.seen_at,
              (us.seen_at IS NULL AND p.taken_at > ?) AS is_new
       FROM posts p JOIN profiles pr ON pr.id = p.profile_id LEFT JOIN user_state us ON us.post_id = p.id
       WHERE p.rowid IN (${rowids.map(() => "?").join(",")})`, [prev, ...rowids]);
    const by = new Map(got.map(r => [r._rowid as number, r]));
    return rowids.map(id => by.get(id)).filter(Boolean) as unknown as FeedRow[];
  }

  private addSnippets(rows: FeedRow[], rowids: number[], match: string) {
    const cols = BM25_WEIGHTS.map((_, i) => `snippet(posts_fts, ${i}, char(2), char(3), '…', 14) AS s${i}`).join(", ");
    const got = this.db.selectObjects(
      `SELECT rowid, ${cols} FROM posts_fts WHERE posts_fts MATCH ? AND rowid IN (${rowids.map(() => "?").join(",")})`, [match, ...rowids]);
    const by = new Map(got.map(r => [r.rowid as number, r]));
    for (const row of rows) {
      const s = by.get((row as unknown as { _rowid: number })._rowid);
      if (!s) continue;
      for (let i = 0; i < BM25_WEIGHTS.length; i++) {
        const v = s[`s${i}`] as string;
        if (v && v.includes("\u0002")) { row.found_in = FOUND_LABEL[i]; row.snippet = v; break; }
      }
    }
  }

  // ---------- post ----------
  post(id: string): (FeedRow & { profile: Profile }) | null {
    const r = this.db.selectObjects("SELECT rowid FROM posts WHERE id = ?", [id])[0];
    if (!r) return null;
    const row = this.rowsFor([r.rowid as number])[0];
    const profile = this.db.selectObjects("SELECT * FROM profiles WHERE id = ?", [row.profile_id])[0] as unknown as Profile;
    return { ...row, profile };
  }
  /** Vizinhos na ordem atual do feed, para as setas ← → */
  neighbors(p: FeedParams, id: string): { prev: string | null; next: string | null } {
    const ordered = this.cache.get(JSON.stringify({ ...p, offset: 0, limit: 0 }));
    const rid = this.db.selectValue("SELECT rowid FROM posts WHERE id = ?", [id]) as number | undefined;
    if (!ordered || rid == null) return { prev: null, next: null };
    const i = ordered.findIndex(r => r.rowid === rid);
    const idOf = (k: number) => (k >= 0 && k < ordered.length ? (this.db.selectValue("SELECT id FROM posts WHERE rowid = ?", [ordered[k].rowid]) as string) : null);
    return { prev: idOf(i - 1), next: idOf(i + 1) };
  }

  /** Comentários de primeiro nível (ou todos, na pesquisa), na ordem pedida. Poucas centenas por post: filtra em JS. */
  comments(postId: string, sort: "likes" | "replies" | "new" | "old" = "likes", q = "", onlyOwner = false): Comment[] {
    const all = this.db.selectObjects("SELECT * FROM comments WHERE post_id = ?", [postId]) as unknown as Comment[];
    const words = fold(q).split(/\s+/).filter(Boolean);
    const ownerAnswered = new Set(all.filter(c => c.by_owner && c.parent_id).map(c => c.parent_id));
    const list = all.filter(c =>
      (words.length ? words.every(w => fold(c.text).includes(w)) : !c.parent_id) &&
      (!onlyOwner || c.by_owner || ownerAnswered.has(c.id)));
    const cmp = {
      likes: (a: Comment, b: Comment) => b.likes - a.likes || b.created_at - a.created_at,
      replies: (a: Comment, b: Comment) => b.replies - a.replies || b.likes - a.likes,
      new: (a: Comment, b: Comment) => b.created_at - a.created_at,
      old: (a: Comment, b: Comment) => a.created_at - b.created_at,
    }[sort];
    return list.sort(cmp).slice(0, 500);
  }
  ownerAnswered(postId: string): string[] {
    return this.db.selectObjects("SELECT DISTINCT parent_id FROM comments WHERE post_id = ? AND by_owner = 1 AND parent_id IS NOT NULL", [postId]).map(r => r.parent_id as string);
  }
  replies(commentId: string): Comment[] {
    return this.db.selectObjects("SELECT * FROM comments WHERE parent_id = ? ORDER BY created_at ASC", [commentId]) as unknown as Comment[];
  }
  metrics(postId: string): Metric[] {
    return this.db.selectObjects("SELECT * FROM metrics WHERE post_id = ? ORDER BY at", [postId]) as unknown as Metric[];
  }
  /** Mediana dos últimos 30 posts do perfil (para "x vezes acima do normal"). */
  profileBaseline(profileId: string) {
    const rows = this.db.selectObjects("SELECT likes, comments, views, kind, engagement FROM posts WHERE profile_id = ? ORDER BY taken_at DESC LIMIT 30", [profileId]);
    const med = (xs: number[]) => { const s = xs.filter(x => x != null && !isNaN(x)).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
    return {
      likes: med(rows.map(r => r.likes as number)),
      comments: med(rows.map(r => r.comments as number)),
      views: med(rows.filter(r => r.kind === "reel" || r.kind === "video").map(r => r.views as number)),
      engagement: med(rows.map(r => r.engagement as number)),
      n: rows.length,
    };
  }
  /** Posição do post entre os da mesma playlist/perfil (0..1, maior = melhor) pelo "acima do normal". */
  rankAmongProfile(postId: string): number | null {
    const r = this.db.selectObjects(
      `SELECT (SELECT count(*) FROM posts o WHERE o.profile_id = p.profile_id AND coalesce(o.outlier,0) < coalesce(p.outlier,0)) * 1.0 /
              max(1, (SELECT count(*) - 1 FROM posts o WHERE o.profile_id = p.profile_id)) AS r FROM posts p WHERE p.id = ?`, [postId])[0];
    return r ? (r.r as number) : null;
  }

  // ---------- estado do usuário ----------
  setState(postId: string, patch: Partial<UserState>) {
    const cur = (this.db.selectObjects("SELECT * FROM user_state WHERE post_id = ?", [postId])[0] as unknown as UserState) || { post_id: postId, saved: 0, hidden: 0, seen_at: null };
    this.local("user_state", [{ ...cur, ...patch, post_id: postId }]);
  }
  markSeen(postIds: string[]) {
    const t = now();
    const rows = postIds.map(id => {
      const cur = (this.db.selectObjects("SELECT * FROM user_state WHERE post_id = ?", [id])[0] as unknown as UserState) || { post_id: id, saved: 0, hidden: 0 };
      return cur.seen_at ? null : { ...cur, seen_at: t };
    }).filter(Boolean) as Record<string, unknown>[];
    if (rows.length) this.local("user_state", rows);
    return rows.length;
  }
  markAllSeen(p: FeedParams) {
    const ordered = this.cache.get(JSON.stringify({ ...p, offset: 0, limit: 0 })) || [];
    const ids = ordered.map(r => this.db.selectValue("SELECT id FROM posts WHERE rowid = ?", [r.rowid]) as string);
    return this.markSeen(ids);
  }

  // ---------- perfis e playlists ----------
  profiles(): (Profile & { tag_ids: string; post_total: number; new_count: number })[] {
    const prev = Number(this.meta("prev_visit") || 0);
    return this.db.selectObjects(
      `SELECT pr.*, (SELECT group_concat(tag_id) FROM profile_tags pt WHERE pt.profile_id = pr.id) AS tag_ids,
              (SELECT count(*) FROM posts p WHERE p.profile_id = pr.id) AS post_total,
              (SELECT count(*) FROM posts p LEFT JOIN user_state us ON us.post_id = p.id WHERE p.profile_id = pr.id AND us.seen_at IS NULL AND p.taken_at > ?) AS new_count
       FROM profiles pr ORDER BY lower(coalesce(pr.name, pr.handle))`, [prev]) as never;
  }
  profileByHandle(handle: string): Profile | null {
    return (this.db.selectObjects("SELECT * FROM profiles WHERE handle = ?", [handle.toLowerCase()])[0] as unknown as Profile) || null;
  }
  addProfiles(entries: { handle: string; name?: string | null; tag?: string | null }[]): { added: number; dup: number } {
    let added = 0, dup = 0;
    const t = now();
    const rows: Profile[] = [];
    const links: { profile_id: string; tag_id: string }[] = [];
    for (const e of entries) {
      const h = e.handle.toLowerCase();
      if (this.profileByHandle(h) || rows.some(r => r.handle === h)) { dup++; continue; }
      const id = uuid();
      rows.push({ id, handle: h, name: e.name || null, status: "pending", on_feed: 1, priority: 1, added_at: t });
      if (e.tag) links.push({ profile_id: id, tag_id: this.ensureTag(e.tag) });
      added++;
    }
    if (rows.length) this.local("profiles", rows as never);
    if (links.length) this.local("profile_tags", links);
    return { added, dup };
  }
  updateProfile(id: string, patch: Partial<Profile>) {
    const cur = this.db.selectObjects("SELECT * FROM profiles WHERE id = ?", [id])[0];
    if (cur) this.local("profiles", [{ ...cur, ...patch }]);
  }
  removeProfile(id: string) {
    const links = this.db.selectObjects("SELECT profile_id, tag_id FROM profile_tags WHERE profile_id = ?", [id]);
    if (links.length) this.local("profile_tags", links, "delete");
    const posts = this.db.selectObjects("SELECT id FROM posts WHERE profile_id = ?", [id]);
    this.remove("posts", posts);
    this.db.exec({ sql: "DELETE FROM stories WHERE profile_id = ?", bind: [id] });
    this.local("profiles", [{ id }], "delete");
  }
  tags(): (Tag & { profile_count: number; new_count: number })[] {
    const prev = Number(this.meta("prev_visit") || 0);
    return this.db.selectObjects(
      `SELECT t.*, (SELECT count(*) FROM profile_tags pt WHERE pt.tag_id = t.id) AS profile_count,
              (SELECT count(*) FROM posts p JOIN profile_tags pt ON pt.profile_id = p.profile_id LEFT JOIN user_state us ON us.post_id = p.id
                 WHERE pt.tag_id = t.id AND us.seen_at IS NULL AND p.taken_at > ?) AS new_count
       FROM tags t ORDER BY t.position, lower(t.name)`, [prev]) as never;
  }
  ensureTag(name: string): string {
    const n = name.trim().slice(0, 40);
    const found = this.db.selectValue("SELECT id FROM tags WHERE lower(name) = lower(?)", [n]) as string | undefined;
    if (found) return found;
    const pos = (this.db.selectValue("SELECT coalesce(max(position), 0) + 1 FROM tags") as number) || 1;
    const id = uuid();
    this.local("tags", [{ id, name: n, color: TAG_COLORS[(pos - 1) % TAG_COLORS.length], emoji: null, position: pos, sort_pref: null }]);
    return id;
  }
  saveTag(tag: Partial<Tag> & { id: string }) {
    const cur = this.db.selectObjects("SELECT * FROM tags WHERE id = ?", [tag.id])[0] || {};
    this.local("tags", [{ ...cur, ...tag }]);
  }
  deleteTag(id: string) {
    const links = this.db.selectObjects("SELECT profile_id, tag_id FROM profile_tags WHERE tag_id = ?", [id]);
    if (links.length) this.local("profile_tags", links, "delete");
    this.local("tags", [{ id }], "delete");
  }
  setProfileTag(profileId: string, tagId: string, on: boolean) {
    this.local("profile_tags", [{ profile_id: profileId, tag_id: tagId }], on ? "upsert" : "delete");
  }
  reorderTags(ids: string[]) {
    ids.forEach((id, i) => this.saveTag({ id, position: i + 1 }));
  }

  // ---------- stories ----------
  storyRings(tagIds: string[] = []): { profile: Profile; stories: (Story & { seen: number })[]; unseen: number }[] {
    const bind: (string | number)[] = [now() - 7 * DAY];
    let tagSql = "";
    if (tagIds.length) { tagSql = ` AND s.profile_id IN (SELECT profile_id FROM profile_tags WHERE tag_id IN (${tagIds.map(() => "?").join(",")}))`; bind.push(...tagIds); }
    const rows = this.db.selectObjects(
      `SELECT s.*, (ss.story_id IS NOT NULL) AS seen FROM stories s JOIN profiles pr ON pr.id = s.profile_id
       LEFT JOIN story_seen ss ON ss.story_id = s.id WHERE s.taken_at > ? AND pr.on_feed = 1${tagSql} ORDER BY s.profile_id, s.taken_at`, bind) as unknown as (Story & { seen: number })[];
    const by = new Map<string, (Story & { seen: number })[]>();
    for (const s of rows) { if (!by.has(s.profile_id)) by.set(s.profile_id, []); by.get(s.profile_id)!.push(s); }
    const out = [...by.entries()].map(([pid, stories]) => ({
      profile: this.db.selectObjects("SELECT * FROM profiles WHERE id = ?", [pid])[0] as unknown as Profile,
      stories, unseen: stories.filter(s => !s.seen).length,
    }));
    // quem tem story não visto primeiro, depois o mais recente
    return out.sort((a, b) => (b.unseen ? 1 : 0) - (a.unseen ? 1 : 0) || b.stories[b.stories.length - 1].taken_at - a.stories[a.stories.length - 1].taken_at);
  }
  markStorySeen(id: string) {
    this.db.exec({ sql: "INSERT OR IGNORE INTO story_seen(story_id, seen_at) VALUES (?, ?)", bind: [id, now()] });
  }

  counts() {
    return {
      profiles: this.db.selectValue("SELECT count(*) FROM profiles") as number,
      posts: this.db.selectValue("SELECT count(*) FROM posts") as number,
      saved: this.db.selectValue("SELECT count(*) FROM user_state WHERE saved = 1") as number,
      pending: this.db.selectValue("SELECT count(*) FROM outbox") as number,
    };
  }

  exportProfiles(): string {
    const rows = this.db.selectObjects(
      `SELECT pr.handle, coalesce(pr.name, '') AS name, coalesce((SELECT group_concat(t.name, ', ') FROM profile_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.profile_id = pr.id), '') AS tags
       FROM profiles pr ORDER BY pr.handle`);
    return rows.map(r => `https://www.instagram.com/${r.handle}/\t${r.name}\t${r.tags}`).join("\n") + "\n";
  }

  wipe() {
    this.db.exec(`DELETE FROM profiles; DELETE FROM tags; DELETE FROM profile_tags; DELETE FROM posts; DELETE FROM posts_fts;
                  DELETE FROM stories; DELETE FROM comments; DELETE FROM metrics; DELETE FROM user_state; DELETE FROM story_seen;
                  DELETE FROM outbox; DELETE FROM meta WHERE key LIKE 'sync:%';`);
    this.touched();
  }
}

export const TAG_COLORS = ["#2F5D50", "#B5603F", "#4A5D8C", "#8A6A2A", "#7A4E6B", "#3F6E7A", "#6B5B95", "#5E7D3A"];

function norm(v: unknown): string | number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" || typeof v === "string") return v;
  return JSON.stringify(v);
}
export const fold = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function uuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); });
}
