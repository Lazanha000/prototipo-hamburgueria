// A coleta: de tempos em tempos, olha cada perfil que ficou "velho", traz os posts novos e os números
// atualizados e guarda no banco do aparelho. Devagar e com intervalos irregulares, como uma pessoa.
// Se o Instagram pedir calma, para e só volta depois de uma pausa.
import { IgError } from "./errors";
import type { Net } from "./net";

/** O que o coletor precisa do banco (o Store inteiro, ou o proxy dele; os métodos podem ser assíncronos). */
export interface Db {
  meta(key: string): unknown;
  setMeta(key: string, value: string): unknown;
  dueProfiles(now: number, intervalMs: number, priorityMs: number, limit: number): unknown;
  patchProfile(id: string, patch: Record<string, unknown>): unknown;
  profileByIgId(igId: string): unknown;
  profileByHandle(handle: string): unknown;
  removeProfile(id: string): unknown;
  missingThumbs(ids: string[]): unknown;
  ingest(profileId: string, followers: number | null, posts: unknown[], thumbs: Record<string, string>, at: number): unknown;
}
type Row = { id: string; handle: string; avatar_url?: string | null; last_checked_at?: number | null };

export interface Options {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  rand?: () => number;
  paceMin?: number;   // espera mínima entre perfis (ms)
  paceMax?: number;
  onProgress?: (p: { done: number; total: number; handle: string }) => void;
  onChange?: () => void;
}
export interface Summary { state: "ok" | "blocked" | "offline" | "idle" | "changed"; checked: number; added: number; message: string; until?: number }

const MIN = 60_000;
export const DEFAULT_INTERVAL_MIN = 180;
const AVATAR_MAX_AGE = 3 * 86_400_000;

export class Collector {
  private o: Required<Pick<Options, "now" | "sleep" | "rand" | "paceMin" | "paceMax">> & Options;
  constructor(private db: Db, private net: Net, o: Options = {}) {
    this.o = { now: Date.now, sleep: ms => new Promise(r => setTimeout(r, ms)), rand: Math.random, paceMin: 5000, paceMax: 9000, ...o };
  }

  async intervalMin(): Promise<number> {
    return Number(await this.db.meta("ig:interval_min")) || DEFAULT_INTERVAL_MIN;
  }

  async blockedUntil(): Promise<number> {
    return Number(await this.db.meta("ig:blocked_until")) || 0;
  }

  /** `force`: ignora o intervalo (botão "Atualizar agora"), mas nunca a pausa pedida pelo Instagram. */
  async run(force = false): Promise<Summary> {
    const now = this.o.now();
    const until = await this.blockedUntil();
    if (until > now) return { state: "blocked", checked: 0, added: 0, until, message: "O Instagram pediu uma pausa. Volto às " + hhmm(until) + "." };
    const every = force ? MIN : (await this.intervalMin()) * MIN;
    const due = (await this.db.dueProfiles(now, every, force ? MIN : Math.min(every, 90 * MIN), force ? 60 : 30)) as Row[];
    if (!due.length) return { state: "idle", checked: 0, added: 0, message: "Tudo em dia." };
    let checked = 0, added = 0, formatErrors = 0;
    for (const [i, p] of due.entries()) {
      if (i > 0) await this.pause();
      this.o.onProgress?.({ done: i, total: due.length, handle: p.handle.replace(/^~p\//, "post ") });
      try {
        added += await this.one(p);
        checked++;
        formatErrors = 0;
        await this.db.setMeta("ig:strikes", "0");
        this.o.onChange?.();
      } catch (e) {
        if (!(e instanceof IgError)) throw e;
        if (e.kind === "blocked") return this.block(checked, added);
        if (e.kind === "network") return { state: "offline", checked, added, message: "Sem conexão com o Instagram agora. Tento de novo depois." };
        if (e.kind === "notfound") await this.db.patchProfile(p.id, { status: "error", error: e.message, last_checked_at: this.o.now() });
        else {  // formato estranho: pode ser só este perfil; três seguidos = o Instagram mudou
          await this.db.patchProfile(p.id, { last_checked_at: this.o.now() });
          if (++formatErrors >= 3) return { state: "changed", checked, added, message: "O Instagram mudou o jeito de responder. Preciso de uma atualização do app." };
        }
        this.o.onChange?.();
      }
    }
    this.o.onProgress?.({ done: due.length, total: due.length, handle: "" });
    return { state: "ok", checked, added, message: added ? `${added} posts novos.` : "Tudo em dia." };
  }

  private pause() {
    const extra = this.o.rand() < 0.1 ? 10_000 + this.o.rand() * 20_000 : 0;  // às vezes demora mais, como quem parou para ler
    return this.o.sleep(this.o.paceMin + (this.o.paceMax - this.o.paceMin) * this.o.rand() + extra);
  }

  private async block(checked: number, added: number): Promise<Summary> {
    const strikes = (Number(await this.db.meta("ig:strikes")) || 0) + 1;
    const wait = Math.min(6 * 60, 45 * 2 ** (strikes - 1)) * MIN;  // 45 min, 1 h 30, 3 h, 6 h
    const until = this.o.now() + wait;
    await this.db.setMeta("ig:strikes", String(strikes));
    await this.db.setMeta("ig:blocked_until", String(until));
    return { state: "blocked", checked, added, until, message: "O Instagram pediu uma pausa. Volto às " + hhmm(until) + "; o que já chegou continua aqui." };
  }

  /** Verifica um perfil. Devolve quantos posts novos chegaram. */
  private async one(p: Row): Promise<number> {
    const now = this.o.now();
    let handle = p.handle;
    if (handle.startsWith("~p/")) {  // link de post: descobre o dono primeiro
      handle = await this.net.ownerOf(handle.slice(3));
      const dup = (await this.db.profileByHandle(handle)) as Row | null;
      if (dup && dup.id !== p.id) { await this.db.removeProfile(p.id); return 0; }
      await this.db.patchProfile(p.id, { handle });
      await this.pause();
    }
    const { profile, posts } = await this.net.profile(handle);
    const other = (await this.db.profileByIgId(profile.ig_id)) as Row | null;
    if (other && other.id !== p.id) { await this.db.removeProfile(p.id); return 0; }  // o mesmo perfil adicionado de dois jeitos
    const patch: Record<string, unknown> = {
      ig_id: profile.ig_id, handle: profile.handle, name: profile.name, bio: profile.bio, followers: profile.followers, following: profile.following,
      posts_count: profile.posts_count, is_business: profile.is_business, is_private: profile.is_private, last_checked_at: now, error: null,
      status: profile.is_private && !posts.length ? "private" : "ok",
    };
    if (patch.status === "private") patch.error = "Perfil privado: só dá para ver com uma conta que siga ele (em breve).";
    if (profile.avatar_src && (!p.avatar_url || now - (p.last_checked_at || 0) > AVATAR_MAX_AGE)) {
      try { patch.avatar_url = await this.net.image(profile.avatar_src, 160, 0.75); } catch (e) { if (e instanceof IgError && e.kind === "blocked") throw e; }
    }
    if (posts.length) patch.last_post_at = Math.max(...posts.map(x => x.taken_at));
    // miniaturas só dos posts que ainda não têm: poupa internet
    const missing = new Set((await this.db.missingThumbs(posts.map(x => x.id))) as string[]);
    const thumbs: Record<string, string> = {};
    for (const x of posts) {
      if (!missing.has(x.id) || !x.thumb_src) continue;
      try { thumbs[x.id] = await this.net.image(x.thumb_src, 480, 0.7); } catch (e) { if (e instanceof IgError && e.kind === "blocked") throw e; }
      await this.o.sleep(150 + this.o.rand() * 250);
    }
    await this.db.patchProfile(p.id, patch);
    const rows = posts.map(({ thumb_src: _t, ...rest }) => ({ ...rest, is_pinned: rest.is_pinned ? 1 : 0, media: JSON.stringify(rest.media) }));
    const r = (await this.db.ingest(p.id, profile.followers, rows, thumbs, now)) as { added: number };
    return r.added;
  }
}

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
