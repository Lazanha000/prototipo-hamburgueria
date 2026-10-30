import { describe, it, expect, beforeEach } from "vitest";
import init from "@sqlite.org/sqlite-wasm";
import { Store, type RawDB } from "../src/lib/db/store";
import { Collector } from "../src/lib/ig/collector";
import { classify, type Net } from "../src/lib/ig/net";
import { IgError } from "../src/lib/ig/errors";
import { parseProfileInfo, ownerFromHtml, ownerFromOembed } from "../src/lib/ig/parse";
import { computeOutliers, snapshotDue } from "../src/lib/ig/analytics";

const H = 3_600_000, NOW = Date.UTC(2026, 9, 30, 15);

// Resposta no formato do web_profile_info (montada à mão, a partir do formato conhecido do site).
function node(i: number, o: Record<string, unknown> = {}) {
  return {
    node: {
      __typename: "GraphImage", shortcode: `POST${i}`, taken_at_timestamp: Math.floor((NOW - i * 30 * H) / 1000), is_video: false,
      display_url: `https://cdn/full${i}.jpg`, thumbnail_resources: [{ src: `https://cdn/t150-${i}.jpg`, config_width: 150 }, { src: `https://cdn/t480-${i}.jpg`, config_width: 480 }, { src: `https://cdn/t640-${i}.jpg`, config_width: 640 }],
      edge_media_to_caption: { edges: [{ node: { text: `Receita de domingo ${i} #Receita #comida com @amiga.cozinha` } }] },
      edge_media_to_comment: { count: 10 + i }, edge_media_preview_like: { count: 100 + i * 10 }, location: { name: "São Paulo" }, ...o,
    },
  };
}
const reel = (i: number) => node(i, { __typename: "GraphVideo", is_video: true, product_type: "clips", video_url: `https://cdn/v${i}.mp4`, video_view_count: 900, video_play_count: 5000 * (i === 1 ? 6 : 1), video_duration: 31.4 });
const sidecar = (i: number) => node(i, { __typename: "GraphSidecar", edge_sidecar_to_children: { edges: [{ node: { is_video: false, display_url: "https://cdn/a.jpg" } }, { node: { is_video: true, video_url: "https://cdn/b.mp4", display_url: "https://cdn/b.jpg" } }] } });
const user = (handle: string, edges: unknown[], o: Record<string, unknown> = {}) => ({
  data: { user: { id: "1" + handle.length, username: handle, full_name: "Lia Cozinha", biography: "bio", profile_pic_url: "https://cdn/av.jpg", edge_followed_by: { count: 12000 }, edge_follow: { count: 80 },
    is_private: false, is_business_account: true, edge_owner_to_timeline_media: { count: 300, edges }, ...o } },
});

describe("leitura da resposta do Instagram", () => {
  const { profile, posts } = parseProfileInfo(user("Lia.Cozinha", [node(0), reel(1), sidecar(2), node(3, { edge_media_preview_like: { count: -1 } })]));
  it("perfil", () => {
    expect(profile).toMatchObject({ handle: "lia.cozinha", followers: 12000, is_business: true, is_private: false, avatar_src: "https://cdn/av.jpg" });
  });
  it("tipos, números, hashtags e miniatura mais leve com 480 px", () => {
    expect(posts.map(p => p.kind)).toEqual(["image", "reel", "carousel", "image"]);
    expect(posts[1]).toMatchObject({ views: 5000 * 6, duration: 31.4 });
    expect(posts[0].views).toBeNull();                    // foto não tem views
    expect(posts[0]).toMatchObject({ likes: 100, comments: 10, hashtags: "receita comida", mentions: "amiga.cozinha", location: "São Paulo" });
    expect(posts[0].thumb_src).toBe("https://cdn/t480-0.jpg");
    expect(posts[3].likes).toBeNull();                    // curtidas escondidas (-1)
    expect(posts[2].media.map(m => m.kind)).toEqual(["image", "video"]);
  });
  it("erros: perfil inexistente e resposta estranha", () => {
    expect(() => parseProfileInfo({ data: { user: null } })).toThrowError(/não existe/);
    expect(() => parseProfileInfo({ foo: 1 })).toThrowError(/não entendi/);
  });
  it("dono de um post", () => {
    expect(ownerFromOembed({ author_name: "Lia.Cozinha" })).toBe("lia.cozinha");
    expect(ownerFromHtml(`..."owner":{"id":"5","username":"bia.livros"}...`, "AbC")).toBe("bia.livros");
    expect(ownerFromHtml("nada", "AbC")).toBeNull();
  });
});

describe("respostas HTTP", () => {
  const kind = (r: { status: number; data: unknown }) => { try { classify(r); return "ok"; } catch (e) { return (e as IgError).kind; } };
  it("classifica", () => {
    expect(kind({ status: 200, data: {} })).toBe("ok");
    expect(kind({ status: 404, data: "" })).toBe("notfound");
    expect(kind({ status: 429, data: "" })).toBe("blocked");
    expect(kind({ status: 401, data: { message: "login", require_login: true } })).toBe("blocked");
    expect(kind({ status: 200, data: "<!DOCTYPE html><html>login" })).toBe("blocked");
    expect(kind({ status: 200, data: { status: "fail", require_login: true } })).toBe("blocked");
    expect(kind({ status: 503, data: "" })).toBe("network");
  });
});

describe("números do aparelho", () => {
  it("acima do normal", () => {
    const o = computeOutliers([
      { id: "a", kind: "image", likes: 100, views: null, taken_at: 3 }, { id: "b", kind: "image", likes: 300, views: null, taken_at: 2 },
      { id: "c", kind: "reel", likes: 5, views: 1000, taken_at: 1 }, { id: "d", kind: "reel", likes: 5, views: 4000, taken_at: 0 }]);
    expect(o.get("b")!).toBeGreaterThan(o.get("a")!); expect(o.get("d")).toBe(1.6);  // 4000 ÷ mediana(1000, 4000) = 1,6. Vídeos comparam views; o resto, curtidas
  });
  it("fotografias", () => {
    expect(snapshotDue(0, 30 * 60_000, [])).toBe(true);
    expect(snapshotDue(0, 50 * 60_000, [30 * 60_000])).toBe(false);
    expect(snapshotDue(0, 2 * H, [30 * 60_000])).toBe(true);
    expect(snapshotDue(0, 60 * 24 * H, [])).toBe(false);
  });
});

describe("coletor", () => {
  let store: Store, clock: { t: number }, calls: string[], blocked: boolean, responses: Record<string, unknown>;
  const net: Net = {
    async profile(h) { calls.push("profile:" + h); if (blocked) throw new IgError("blocked", "429"); if (!(h in responses)) throw new IgError("notfound", "não existe"); return parseProfileInfo(responses[h]); },
    async ownerOf(code) { calls.push("owner:" + code); return "lia.cozinha"; },
    async image(url) { calls.push("img"); return "data:image/webp;base64,AAAA" + url.length; },
  };
  const make = () => new Collector(store as never, net, { now: () => clock.t, sleep: async ms => { clock.t += ms; }, rand: () => 0.5 });

  beforeEach(async () => {
    const s = await init();
    store = new Store(new s.oo1.DB(":memory:") as unknown as RawDB);
    store.init();
    clock = { t: NOW }; calls = []; blocked = false;
    responses = { "lia.cozinha": user("lia.cozinha", [node(0), reel(1), sidecar(2)]), "bia.livros": user("bia.livros", [node(5)]) };
  });

  it("ciclo: verifica perfis novos, guarda posts, miniaturas e pesquisa acha", async () => {
    store.addProfiles([{ handle: "lia.cozinha", name: null, tag: "Cozinha" }, { handle: "bia.livros", name: null, tag: null }, { handle: "nao.existe", name: null, tag: null }]);
    const r = await make().run();
    expect(r).toMatchObject({ state: "ok", checked: 2, added: 4 });
    const feed = store.feed({ limit: 20 });
    expect(feed.total).toBe(4);
    expect(feed.rows.every(p => p.thumb_url?.startsWith("data:image/webp"))).toBe(true);
    expect(store.feed({ q: "receita domingo" }).total).toBe(4);
    const profiles = store.profiles();
    expect(profiles.find(p => p.handle === "lia.cozinha")).toMatchObject({ status: "ok", followers: 12000, name: "Lia Cozinha" });
    expect(profiles.find(p => p.handle === "lia.cozinha")?.avatar_url).toMatch(/^data:image/);
    expect(profiles.find(p => p.handle === "nao.existe")).toMatchObject({ status: "error" });
    expect(feed.rows.find(p => p.id === "POST1")).toMatchObject({ kind: "reel", views: 30000 });
    expect(feed.rows.find(p => p.id === "POST1")!.outlier).toBeGreaterThan(0);
  });

  it("respeita o intervalo, não duplica, e baixa miniatura só do que é novo", async () => {
    store.addProfiles([{ handle: "lia.cozinha", name: null, tag: null }]);
    await make().run();
    const imgs = calls.filter(c => c === "img").length;
    expect((await make().run()).state).toBe("idle");        // logo depois: nada a fazer
    clock.t += 4 * H;
    responses["lia.cozinha"] = user("lia.cozinha", [node(0, { edge_media_preview_like: { count: 999 } }), reel(1), sidecar(2), node(7)]);
    const r = await make().run();
    expect(r.added).toBe(1);
    expect(store.feed({}).total).toBe(4);
    expect(calls.filter(c => c === "img").length).toBe(imgs + 1);   // só o post novo
    expect(store.feed({}).rows.find(p => p.id === "POST0")!.likes).toBe(999);  // números atualizados
  });

  it("não apaga transcrição nem hashtags de posts já guardados", async () => {
    store.addProfiles([{ handle: "lia.cozinha", name: null, tag: null }]);
    await make().run();
    store.upsert("posts", [{ ...(store.post("POST0") as never as Record<string, unknown>), transcript: "olá pessoal hoje vamos cozinhar" }]);
    clock.t += 4 * H;
    await make().run();
    expect(store.feed({ q: "em:fala cozinhar" }).total).toBe(1);
  });

  it("pausa quando o Instagram pede e aumenta a espera se insistir", async () => {
    store.addProfiles([{ handle: "lia.cozinha", name: null, tag: null }]);
    blocked = true;
    let r = await make().run();
    expect(r).toMatchObject({ state: "blocked", until: NOW + 15 * 60_000 });
    calls.length = 0;
    expect((await make().run()).state).toBe("blocked");     // ainda em pausa: nem tenta
    expect(calls).toEqual([]);
    clock.t += 16 * 60_000;
    r = await make().run();
    expect(r.until! - clock.t).toBe(45 * 60_000);            // segunda vez: 45 min
    clock.t += 50 * 60_000; blocked = false;
    expect((await make().run()).state).toBe("ok");
    expect(await store.meta("ig:strikes")).toBe("0");
  });

  it("link de post vira o perfil do dono; duplicado some", async () => {
    store.addProfiles([{ handle: "lia.cozinha", name: null, tag: null }, { handle: "~p/ABC123", name: null, tag: null }]);
    await make().run();
    expect(store.profiles().map(p => p.handle)).toEqual(["lia.cozinha"]);
    expect(calls).toContain("owner:ABC123");
  });

  it("três respostas estranhas seguidas = o Instagram mudou", async () => {
    store.addProfiles(["a.a", "b.b", "c.c", "d.d"].map(handle => ({ handle, name: null, tag: null })));
    for (const h of ["a.a", "b.b", "c.c", "d.d"]) responses[h] = { weird: true };
    const r = await make().run();
    expect(r.state).toBe("changed");
  });

  it("atualizar agora ignora o intervalo, mas não a pausa", async () => {
    store.addProfiles([{ handle: "lia.cozinha", name: null, tag: null }]);
    await make().run();
    clock.t += 2 * 60_000;
    expect((await make().run(true)).state).toBe("ok");
    await store.setMeta("ig:blocked_until", String(clock.t + 1000));
    expect((await make().run(true)).state).toBe("blocked");
  });
});
