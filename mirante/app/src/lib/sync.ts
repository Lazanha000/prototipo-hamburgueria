// Sincronização com o Supabase: baixa só o que mudou, envia o que você mudou, e escuta novidades em tempo real.
import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { db } from "./db/client";
import type { Table } from "./db/store";

const PULL: Table[] = ["profiles", "tags", "profile_tags", "posts", "stories", "user_state"];
const PUSHABLE = new Set<Table>(["profiles", "tags", "profile_tags", "user_state"]);
const PAGE = 1000;
const CFG_KEY = "mirante:supabase";

export interface Config { url: string; key: string }
export function loadConfig(): Config | null {
  const env = { url: import.meta.env.VITE_SUPABASE_URL as string | undefined, key: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined };
  if (env.url && env.key) return { url: env.url, key: env.key };
  try { const c = JSON.parse(localStorage.getItem(CFG_KEY) || "null"); return c?.url && c?.key ? c : null; } catch { return null; }
}
export function saveConfig(c: Config | null) {
  try { if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c)); else localStorage.removeItem(CFG_KEY); } catch { /* sem armazenamento */ }
}

let sb: SupabaseClient | null = null;
export const client = () => sb;

export function connect(cfg: Config | null): SupabaseClient | null {
  sb = cfg ? createClient(cfg.url, cfg.key, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;
  return sb;
}
export async function session(): Promise<Session | null> {
  if (!sb) return null;
  return (await sb.auth.getSession()).data.session;
}
export async function sendMagicLink(email: string) {
  if (!sb) throw new Error("Sem Supabase");
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
  if (error) throw error;
}

/** Baixa as mudanças de cada tabela desde a última vez. Devolve quantas linhas chegaram. */
export async function pull(): Promise<number> {
  if (!sb) return 0;
  let total = 0;
  for (const t of PULL) {
    let since = Number((await db.meta("sync:" + t)) || 0);
    let offset = 0;
    for (;;) {
      const { data, error } = await sb.from(t).select("*").gte("updated_at", since).order("updated_at").range(offset, offset + PAGE - 1);
      if (error) throw error;
      if (!data.length) break;
      await db.upsert(t, data.map(fromServer));
      total += data.length;
      const max = Math.max(...data.map(r => Number(r.updated_at)));
      if (max > since) { since = max; offset = data.filter(r => Number(r.updated_at) === max).length; } else offset += data.length;
      await db.setMeta("sync:" + t, String(since));
      if (data.length < PAGE) break;
    }
  }
  // remoções feitas em outro aparelho (ou pelo trabalhador)
  const since = Number((await db.meta("sync:deleted")) || 0);
  const { data, error } = await sb.from("deleted").select("*").gt("updated_at", since).order("updated_at").limit(5000);
  if (error) throw error;
  if (data.length) {
    for (const d of data) await db.remove(d.tbl as Table, [d.key as Record<string, unknown>]);
    await db.setMeta("sync:deleted", String(Math.max(...data.map(r => Number(r.updated_at)))));
  }
  return total;
}

/** Envia a fila do aparelho. Se falhar no meio, o que sobrou tenta de novo na próxima vez. */
export async function push(): Promise<number> {
  if (!sb) return 0;
  let sent = 0;
  for (;;) {
    const items = await db.outbox();
    if (!items.length) break;
    const done: number[] = [];
    for (const it of items) {
      if (!PUSHABLE.has(it.tbl)) { done.push(it.id); continue; }
      const row = toServer(it.row);
      const res = it.op === "upsert"
        ? await sb.from(it.tbl).upsert(row)
        : await Object.entries(row).reduce((q, [k, v]) => q.eq(k, v as never), sb.from(it.tbl).delete());
      if (res.error) { await db.clearOutbox(done); throw res.error; }
      done.push(it.id); sent++;
    }
    await db.clearOutbox(done);
  }
  return sent;
}

export async function syncNow(): Promise<{ pulled: number; pushed: number }> {
  const pushed = await push();
  const pulled = await pull();
  return { pulled, pushed };
}

/** Comentários e métricas não ficam todos no aparelho: chegam quando o post é aberto. */
export async function fetchPostDetails(postId: string) {
  if (!sb) return;
  const [c, m] = await Promise.all([
    sb.from("comments").select("*").eq("post_id", postId).limit(1000),
    sb.from("metrics").select("*").eq("post_id", postId).order("at"),
  ]);
  if (c.data?.length) await db.upsert("comments", c.data.map(fromServer));
  if (m.data?.length) await db.upsert("metrics", m.data.map(fromServer));
}

/** Avisa o app quando chega post, story ou perfil verificado. */
export function listen(onChange: () => void) {
  if (!sb) return () => {};
  let t: ReturnType<typeof setTimeout>;
  const ch = sb.channel("mirante");
  for (const table of ["posts", "stories", "profiles"]) {
    ch.on("postgres_changes", { event: "*", schema: "public", table }, () => { clearTimeout(t); t = setTimeout(onChange, 1500); });
  }
  ch.subscribe();
  return () => { sb?.removeChannel(ch); };
}

/** Pedidos para o trabalhador (entrar na conta secundária, atualizar agora…). */
export async function command(kind: string, payload: Record<string, unknown> = {}) {
  if (!sb) throw new Error("Sem Supabase");
  const { data, error } = await sb.from("commands").insert({ kind, payload }).select().single();
  if (error) throw error;
  return data as { id: number };
}
export async function commandResult(id: number) {
  if (!sb) return null;
  const { data } = await sb.from("commands").select("status, result").eq("id", id).maybeSingle();
  return data as { status: string; result: Record<string, unknown> | null } | null;
}
export async function workerStatus() {
  if (!sb) return null;
  const { data } = await sb.from("worker_status").select("*").eq("id", 1).maybeSingle();
  return data as null | { state: string; message: string | null; last_run_at: number | null; paused_until: number | null; ig_user: string | null; session_ok: boolean };
}

const fromServer = (r: Record<string, unknown>) => {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) o[k] = typeof v === "boolean" ? (v ? 1 : 0) : Array.isArray(v) || (v && typeof v === "object") ? JSON.stringify(v) : v;
  return o;
};
const BOOL = new Set(["is_business", "is_private", "on_feed", "saved", "hidden", "is_pinned", "by_owner"]);
const toServer = (r: Record<string, unknown>) => {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (k !== "updated_at") o[k] = BOOL.has(k) ? !!v : v;
  return o;
};
