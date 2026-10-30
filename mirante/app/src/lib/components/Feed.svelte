<script lang="ts">
  import { db } from "../db/client";
  import type { FeedRow, FeedParams } from "../db/store";
  import { prefs, ui, say, refresh, savePrefs } from "../state.svelte";
  import { plural } from "../format";
  import PostCard from "./PostCard.svelte";

  let { params, emptyText = "" }: { params: FeedParams; emptyText?: string } = $props();
  const PAGE = 60;
  let rows = $state<FeedRow[]>([]);
  let total = $state(0);
  let hiddenCount = $state(0);
  let ms = $state(0);
  let loading = $state(false);
  let sentinel = $state<HTMLElement | null>(null);
  let gen = 0;

  // recarrega do começo quando os filtros, a ordem ou os dados mudam
  $effect(() => {
    const p = JSON.stringify(params);
    void ui.tick;
    load(JSON.parse(p), true);
  });

  async function load(p: FeedParams, reset: boolean) {
    const my = reset ? ++gen : gen;
    loading = true;
    const r = await db.feed({ ...p, offset: reset ? 0 : rows.length, limit: PAGE });
    if (my !== gen) return;
    rows = reset ? r.rows : [...rows, ...r.rows];
    total = r.total; hiddenCount = r.hiddenCount; ms = r.ms;
    loading = false;
  }

  $effect(() => {
    if (!sentinel) return;
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting) && !loading && rows.length < total) load(params, false);
    }, { rootMargin: "800px" });
    io.observe(sentinel);
    return () => io.disconnect();
  });

  function open(id: string) { ui.openPost = id; history.pushState(null, "", "#post/" + id); }
  async function save(p: FeedRow) {
    await db.setState(p.id, { saved: p.saved ? 0 : 1 });
    p.saved = p.saved ? 0 : 1;
    say(p.saved ? "Salvo. Ele aparece em “Só salvos”." : "Tirado dos salvos.");
  }
  async function hide(p: FeedRow) {
    const was = p.hidden;
    await db.setState(p.id, { hidden: was ? 0 : 1 });
    refresh();
    if (!was) say("Post oculto.", { label: "Desfazer", run: async () => { await db.setState(p.id, { hidden: 0 }); refresh(); } });
  }
  async function allSeen() {
    const n = await db.markAllSeen(params);
    refresh();
    say(n ? `${plural(n, "post marcado", "posts marcados")} como visto.` : "Já estava tudo visto.");
  }
</script>

<div class="status" aria-live="polite">
  {#if total}
    <span><strong>{plural(total, "post", "posts")}</strong> <span class="soft">· {ms < 1 ? "<1" : ms} ms</span></span>
    {#if hiddenCount}<button class="linkish" onclick={() => { prefs.showHidden = !prefs.showHidden; savePrefs(); }}>{prefs.showHidden ? "Esconder ocultos" : `Mostrar ${plural(hiddenCount, "oculto", "ocultos")}`}</button>{/if}
    {#if rows.some(r => r.is_new)}<button class="linkish" onclick={allSeen}>Marcar todos como vistos</button>{/if}
  {/if}
  <span class="view" role="group" aria-label="Modo de exibição">
    <button class="btn small" class:quiet={prefs.view !== "list"} aria-pressed={prefs.view === "list"} onclick={() => { prefs.view = "list"; savePrefs(); }}>Lista</button>
    <button class="btn small" class:quiet={prefs.view !== "grid"} aria-pressed={prefs.view === "grid"} onclick={() => { prefs.view = "grid"; savePrefs(); }}>Grade</button>
  </span>
</div>

{#if !loading && !rows.length}
  <div class="empty">
    <h3>{emptyText ? "Nada por aqui" : "Nada com esses filtros"}</h3>
    {emptyText || "Tente outro período, desligue “Só não vistos” ou escolha outra playlist."}
  </div>
{:else}
  <ul class:list={prefs.view === "list"} class:grid={prefs.view === "grid"}>
    {#each rows as post (post.id)}
      <PostCard {post} grid={prefs.view === "grid"} onopen={open} onsave={save} onhide={hide} />
    {/each}
  </ul>
  <div bind:this={sentinel} class="end">
    {#if rows.length >= total && total}
      <p><span class="dot" aria-hidden="true"></span> Pronto, você está em dia.</p>
    {:else if loading}<p class="soft">Carregando…</p>{/if}
  </div>
{/if}

<style>
  .status { margin: 14px 0 6px; color: var(--soft); display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center; min-height: 34px; }
  .status strong { color: var(--ink); }
  .view { margin-left: auto; display: inline-flex; gap: 4px; }
  ul { list-style: none; margin: 0; padding: 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-top: 8px; }
  .end { padding: 28px 0 8px; text-align: center; color: var(--soft); font-family: var(--serif); font-style: italic; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--gold); margin-right: 6px; vertical-align: middle; }
</style>
