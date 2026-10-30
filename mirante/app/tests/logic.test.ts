import { describe, it, expect, beforeAll } from "vitest";
import init from "@sqlite.org/sqlite-wasm";
import { sortRows, cycle, percentiles, type SortRow } from "../src/lib/db/sorting";
import { parseQuery } from "../src/lib/db/searchParse";
import { extractProfiles } from "../src/lib/import/handles";
import { Store, type RawDB } from "../src/lib/db/store";
import { seedDemo, demoDetails } from "../src/lib/demo";

const D = 864e5, T = Date.UTC(2026, 9, 30);
const row = (rowid: number, days: number, views: number | null, likes = 0): SortRow =>
  ({ rowid, taken_at: T - days * D, views, likes, comments: 0, engagement: 0, rel: 0 });

describe("ordenação", () => {
  const rows = [row(1, 0, 100), row(2, 1, 9000), row(3, 700, 50000), row(4, 3, null)];
  it("clique gira: desligado → mais → menos → desligado", () => {
    let k = cycle([], "date");
    expect(k).toEqual([{ crit: "date", dir: "desc", weight: 1 }]);
    k = cycle(k, "date"); expect(k[0].dir).toBe("asc");
    expect(cycle(k, "date")).toEqual([]);
  });
  it("um critério: mais recente e mais antigo", () => {
    expect(sortRows(rows, [{ crit: "date", dir: "desc" }]).map(r => r.rowid)).toEqual([1, 2, 4, 3]);
    expect(sortRows(rows, [{ crit: "date", dir: "asc" }]).map(r => r.rowid)).toEqual([3, 4, 2, 1]);
  });
  it("sem views vai para o fim nas duas direções", () => {
    expect(sortRows(rows, [{ crit: "views", dir: "desc" }]).map(r => r.rowid)).toEqual([3, 2, 1, 4]);
    expect(sortRows(rows, [{ crit: "views", dir: "asc" }]).map(r => r.rowid)).toEqual([1, 2, 3, 4]);
  });
  it("equilibrado: recente E visto ganha do só recente e do só visto", () => {
    const out = sortRows(rows, [{ crit: "date", dir: "desc" }, { crit: "views", dir: "desc" }], "balanced");
    expect(out[0].rowid).toBe(2);
  });
  it("em sequência agrupando por mês desempata pelo segundo critério", () => {
    const rs = [row(1, 1, 10), row(2, 2, 500), row(3, 40, 9999)];
    const out = sortRows(rs, [{ crit: "date", dir: "desc" }, { crit: "views", dir: "desc" }], "sequence", "month");
    expect(out.map(r => r.rowid).indexOf(3)).toBe(2);
  });
  it("percentis com empate", () => {
    expect(percentiles([row(1, 0, 5), row(2, 0, 5), row(3, 0, 9)], "views")).toEqual([0.25, 0.25, 1]);
  });
});

describe("pesquisa", () => {
  it("prefixo, aspas, exclusão, perfil, hashtag, tipo e escopo", () => {
    const q = parseQuery('revolução "bossa nova" -enem @Lia.Cozinha #Receita tipo:reel em:fala');
    expect(q.handles).toEqual(["lia.cozinha"]);
    expect(q.kinds).toEqual(["reel"]);
    expect(q.match).toContain('{transcript} : ("revolucao"* AND "bossa nova")');
    expect(q.match).toContain('hashtags : "receita"');
    expect(q.match).toContain('NOT "enem"*');
  });
  it("só exclusão não vira MATCH", () => {
    const q = parseQuery("-enem");
    expect(q.match).toBeNull();
    expect(q.excluded.length).toBe(1);
  });
});

describe("colar perfis", () => {
  it("links, @nomes, post, story, e-mail ignorado, duplicados juntos", () => {
    const f = extractProfiles(`Olha https://www.instagram.com/lia.cozinha/reels/ e @Davi_foto. meu email eu@gmail.com
https://instagram.com/p/C1a2B3c4D5e/
https://www.instagram.com/stories/nina.livros/3312/
@lia.cozinha
https://www.instagram.com/explore/
https://www.instagram.com/clara.ciencia/\tClara Prado\tCiência, Livros`);
    expect(f.map(x => x.handle)).toEqual(["lia.cozinha", "davi_foto", "~p/C1a2B3c4D5e", "nina.livros", "clara.ciencia"]);
    expect(f[4]).toEqual({ handle: "clara.ciencia", name: "Clara Prado", tag: "Ciência" });
  });
  it("following.json do Instagram (formatos antigo e novo)", () => {
    const json = JSON.stringify({ relationships_following: [
      { title: "", string_list_data: [{ href: "https://www.instagram.com/beto.cafe", value: "beto.cafe", timestamp: 1 }] },
      { title: "mari.sol", string_list_data: [{ href: "https://www.instagram.com/_u/mari.sol", timestamp: 2 }] },
    ] });
    expect(extractProfiles(json).map(x => x.handle)).toEqual(["beto.cafe", "mari.sol"]);
  });
});

describe("banco local", () => {
  let store: Store;
  beforeAll(async () => {
    const s = await init();
    store = new Store(new s.oo1.DB(":memory:") as unknown as RawDB);
    store.init();
    seedDemo(store);
  });
  it("feed, playlists, filtros e paginação", () => {
    const all = store.feed({ limit: 20 });
    expect(all.rows.length).toBe(20);
    expect(all.rows[0].taken_at).toBeGreaterThanOrEqual(all.rows[1].taken_at);
    const tag = store.tags()[0];
    const f = store.feed({ tagIds: [tag.id], kinds: ["reel"], limit: 500 });
    expect(f.total).toBeGreaterThan(0);
    expect(f.rows.every(r => r.kind === "reel")).toBe(true);
    const p2 = store.feed({ offset: 20, limit: 20 });
    expect(p2.rows[0].id).not.toBe(all.rows[0].id);
  });
  it("pesquisa sem acento, com trecho e onde achou, rápida", () => {
    const r = store.feed({ q: "receita avo" });
    expect(r.total).toBeGreaterThan(0);
    expect(r.rows[0].found_in).toBe("na legenda");
    expect(r.rows[0].snippet).toContain("\u0002");
    const t = performance.now();
    for (let i = 0; i < 20; i++) store.feed({ q: "fotografia luz", sort: [{ crit: "date", dir: "desc" }, { crit: "views", dir: "desc" }], limit: 60 });
    expect((performance.now() - t) / 20).toBeLessThan(150);
  });
  it("ocultar, salvar, vistos e fila de envio", () => {
    const first = store.feed({}).rows[0];
    store.setState(first.id, { hidden: 1 });
    const after = store.feed({});
    expect(after.hiddenCount).toBe(1);
    expect(after.rows[0].id).not.toBe(first.id);
    store.setState(after.rows[0].id, { saved: 1 });
    expect(store.feed({ onlySaved: true }).total).toBe(1);
    expect(store.outbox().length).toBeGreaterThanOrEqual(2);
  });
  it("adicionar perfis, playlists e comentários", () => {
    const r = store.addProfiles([{ handle: "novo.perfil", name: null, tag: "Amigos" }, { handle: "novo.perfil", name: null, tag: null }]);
    expect(r).toEqual({ added: 1, dup: 1 });
    expect(store.tags().some(t => t.name === "Amigos" && t.profile_count === 1)).toBe(true);
    const p = store.feed({}).rows[0];
    demoDetails(store, p);
    const byLikes = store.comments(p.id, "likes");
    expect(byLikes.length).toBeGreaterThan(0);
    for (let i = 1; i < byLikes.length; i++) expect(byLikes[i - 1].likes).toBeGreaterThanOrEqual(byLikes[i].likes);
    const old = store.comments(p.id, "old");
    expect(old[0].created_at).toBeLessThanOrEqual(old[old.length - 1].created_at);
    expect(store.metrics(p.id).length).toBeGreaterThan(0);
    expect(store.storyRings().length).toBeGreaterThan(0);
  });
});
