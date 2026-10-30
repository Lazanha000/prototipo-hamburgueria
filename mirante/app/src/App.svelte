<script lang="ts">
  import { onMount } from "svelte";
  import { db } from "./lib/db/client";
  import type { Tag } from "./lib/db/store";
  import { prefs, ui, feedParams, searchParams as searchFor, go, refresh, say, savePrefs, selectTags, type Route } from "./lib/state.svelte";
  import { loadConfig, connect, session, syncNow, listen } from "./lib/sync";
  import { ago } from "./lib/format";
  import Icon from "./lib/components/Icon.svelte";
  import SortBar from "./lib/components/SortBar.svelte";
  import Filters from "./lib/components/Filters.svelte";
  import Feed from "./lib/components/Feed.svelte";
  import Stories from "./lib/components/Stories.svelte";
  import PostPanel from "./lib/components/PostPanel.svelte";
  import Profiles from "./lib/components/Profiles.svelte";
  import Settings from "./lib/components/Settings.svelte";
  import TagSidebar from "./lib/components/TagSidebar.svelte";
  import Toast from "./lib/components/Toast.svelte";

  const NAV: { route: Route; label: string; icon: string }[] = [
    { route: "inicio", label: "Início", icon: "home" },
    { route: "buscar", label: "Buscar", icon: "search" },
    { route: "perfis", label: "Perfis", icon: "people" },
    { route: "ajustes", label: "Ajustes", icon: "gear" },
  ];
  let tags = $state<Tag[]>([]);
  let profileCount = $state<number | null>(null);
  let qInput = $state(ui.q);
  let qTimer: ReturnType<typeof setTimeout>;
  let searchEl = $state<HTMLInputElement | null>(null);
  let showFilters = $state(false);

  $effect(() => { void ui.tick; db.tags().then(t => (tags = t)); db.status().then(s => { profileCount = s.profiles; ui.demo = s.demo; ui.persistent = s.persistent; ui.locked = s.locked; }); });

  const title = $derived(prefs.tagIds.length ? prefs.tagIds.map(id => tags.find(t => t.id === id)?.name).filter(Boolean).join(" + ") : "Todos os perfis");
  const homeParams = $derived(feedParams());
  const searchParams = $derived(searchFor(ui.q));
  const filtersOn = $derived(prefs.kinds.length + (prefs.period !== "all" ? 1 : 0) + (prefs.onlyUnseen ? 1 : 0) + (prefs.onlySaved ? 1 : 0) + (prefs.minViews ? 1 : 0));

  function route() {
    const h = location.hash.slice(1);
    if (h.startsWith("post/")) { ui.openPost = h.slice(5); return; }
    ui.openPost = null;
    if (NAV.some(n => n.route === h)) ui.route = h as Route;
  }
  function typed(v: string) {
    qInput = v;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { ui.q = v; }, 80);  // pesquisa enquanto digita, sem travar a digitação
  }
  function remember() {
    const q = ui.q.trim();
    if (!q) return;
    prefs.recent = [q, ...prefs.recent.filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
    savePrefs();
  }
  $effect(() => { if (ui.route === "buscar") { qInput = ui.q; queueMicrotask(() => searchEl?.focus()); } });

  async function sync(quiet = true) {
    if (!ui.connected || !ui.signedIn || ui.syncing || !navigator.onLine) return;
    ui.syncing = true;
    try { const r = await syncNow(); ui.lastSync = Date.now(); if (r.pulled || r.pushed) refresh(); }
    catch (e) { if (!quiet) say("Não consegui sincronizar agora. Continuo tentando."); console.warn(e); }
    ui.syncing = false;
  }

  onMount(() => {
    const t = localStorage.getItem("mirante:theme");
    if (t && t !== "auto") document.documentElement.dataset.theme = t;
    route();
    addEventListener("hashchange", route);
    addEventListener("popstate", route);
    const on = () => { ui.online = navigator.onLine; sync(); };
    addEventListener("online", on); addEventListener("offline", on);
    const key = (e: KeyboardEvent) => {
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName)) { e.preventDefault(); go("buscar"); }
    };
    addEventListener("keydown", key);

    let stop = () => {};
    const sb = connect(loadConfig());
    ui.connected = !!sb;
    if (sb) {
      session().then(async s => {
        ui.signedIn = !!s;
        if (s && (await db.meta("demo")) === "1") { await db.wipe(); await db.setMeta("demo", "0"); ui.demo = false; refresh(); }  // conta real: sai a demonstração
        sync(false);
      });
      sb.auth.onAuthStateChange((_ev, s) => { const was = ui.signedIn; ui.signedIn = !!s; if (s && !was) sync(false); });
      stop = listen(() => sync());
    }
    const every = setInterval(() => sync(), 5 * 60e3);
    const vis = () => { if (document.visibilityState === "visible") sync(); };
    document.addEventListener("visibilitychange", vis);
    return () => { stop(); clearInterval(every); document.removeEventListener("visibilitychange", vis); removeEventListener("hashchange", route); removeEventListener("keydown", key); };
  });

  async function startDemo() {
    const r = await db.seedDemo();
    ui.demo = true; refresh();
    say(`Demonstração pronta: ${r.profiles} perfis e ${r.posts} posts inventados.`);
  }
</script>

<div class="shell">
  <aside class="side">
    <div class="brand">
      <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4 9 13h14z" fill="var(--clay)" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round"/><path d="M11 13h10l2 15H9z" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 28v-6h4v6" fill="none" stroke="var(--ink)" stroke-width="1.4"/><circle cx="25.5" cy="7" r="3" fill="var(--gold)"/></svg>
      Mirante
    </div>
    <nav class="nav" aria-label="Seções">
      {#each NAV as n (n.route)}
        <button class:on={ui.route === n.route} aria-current={ui.route === n.route ? "page" : undefined} onclick={() => go(n.route)}><Icon name={n.icon} />{n.label}</button>
      {/each}
    </nav>
    <TagSidebar />
    <p class="sync soft">
      {#if !ui.online}Sem internet. Tudo o que já chegou continua aqui.
      {:else if ui.syncing}Sincronizando…
      {:else if ui.demo}Modo demonstração
      {:else if ui.lastSync}Atualizado {ago(ui.lastSync)}{/if}
    </p>
  </aside>

  <main>
    {#if ui.locked}
      <p class="banner card">O Mirante já está aberto em outra aba ou janela. Feche a outra e recarregue esta para ver os seus dados aqui.</p>
    {/if}
    {#if ui.route === "inicio"}
      <header class="top">
        <h1>{title}</h1>
        <div class="mtags" aria-label="Playlists">
          <button class="chip" class:on={!prefs.tagIds.length} onclick={() => selectTags([])}>Todos</button>
          {#each tags as t (t.id)}<button class="chip" class:on={prefs.tagIds.includes(t.id)} onclick={() => selectTags(prefs.tagIds.length === 1 && prefs.tagIds[0] === t.id ? [] : [t.id])}>{t.name}</button>{/each}
        </div>
      </header>

      {#if profileCount === 0}
        <div class="welcome card">
          <h2>Bem-vindo ao Mirante</h2>
          <p>Aqui você acompanha, com calma, os perfis do Instagram de que gosta: posts, stories e comentários, com pesquisa instantânea.</p>
          <div class="row">
            <button class="btn primary" onclick={() => go("perfis")}>Adicionar meus perfis</button>
            <button class="btn" onclick={startDemo}>Ver com dados de demonstração</button>
          </div>
          <p class="soft small">Para os posts chegarem de verdade, o app precisa do Supabase e do trabalhador ligados (em Ajustes). Enquanto isso, a demonstração mostra como tudo funciona.</p>
        </div>
      {:else}
        <Stories />
        <SortBar />
        <div class="frow">
          <button class="linkish" onclick={() => (showFilters = !showFilters)} aria-expanded={showFilters}>{showFilters ? "Esconder filtros" : "Filtros"}{filtersOn ? ` (${filtersOn})` : ""}</button>
        </div>
        {#if showFilters}<Filters />{/if}
        <Feed params={homeParams} />
      {/if}
    {:else if ui.route === "buscar"}
      <form class="ask" role="search" onsubmit={e => { e.preventDefault(); ui.q = qInput; remember(); }}>
        <label for="q" class="sr">O que você quer reencontrar?</label>
        <input id="q" bind:this={searchEl} type="search" placeholder="O que você quer reencontrar?" autocomplete="off" enterkeyhint="search"
          value={qInput} oninput={e => typed((e.currentTarget as HTMLInputElement).value)} onblur={remember} />
      </form>
      {#if prefs.recent.length}
        <ul class="recent" aria-label="Buscas recentes">
          {#each prefs.recent as r (r)}<li><button onclick={() => { qInput = r; ui.q = r; }}>{r}</button></li>{/each}
        </ul>
      {/if}
      <details class="help">
        <summary>Como pesquisar</summary>
        <p>Sem acento e enquanto você digita: <code>revolu</code> já acha “revolução”. Também vale:
          <code>"frase exata"</code> · <code>-palavra</code> para tirar · <code>@perfil</code> · <code>#hashtag</code> ·
          <code>tipo:reel</code> · <code>em:legenda</code> · <code>em:comentarios</code>. A pesquisa olha a legenda, as hashtags, os comentários mais curtidos e o nome do perfil.</p>
      </details>
      {#if ui.q.trim()}
        <div class="sortwrap"><SortBar search /></div>
        <Feed params={searchParams} emptyText="Nenhum post com essas palavras. Experimente uma palavra só, ou pesquise também nos comentários com em:comentarios." />
      {/if}
    {:else if ui.route === "perfis"}
      <Profiles />
    {:else}
      <Settings />
    {/if}
  </main>
</div>

<nav class="bottom" aria-label="Seções">
  {#each NAV as n (n.route)}
    <button class:on={ui.route === n.route} aria-current={ui.route === n.route ? "page" : undefined} onclick={() => go(n.route)}><Icon name={n.icon} size={22} /><span>{n.label}</span></button>
  {/each}
</nav>

{#if ui.openPost}<PostPanel id={ui.openPost} />{/if}
<Toast />

<style>
  .shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); max-width: 1180px; margin: 0 auto; min-height: 100vh; }
  .side { position: sticky; top: 0; height: 100vh; overflow-y: auto; padding: 20px 16px; border-right: 1px solid var(--line); display: flex; flex-direction: column; gap: 22px; }
  .brand { display: flex; align-items: center; gap: 8px; font: 600 23px/1 var(--serif); letter-spacing: -.01em; }
  .brand svg { width: 30px; height: 30px; }
  .nav { display: grid; gap: 2px; }
  .nav button { display: flex; align-items: center; gap: 10px; background: none; border: 0; border-radius: 10px; padding: 8px 10px; cursor: pointer; color: var(--soft); text-align: left; }
  .nav button:hover { color: var(--ink); background: var(--surface); }
  .nav button.on { color: var(--ink); background: var(--surface); font-weight: 700; box-shadow: inset 3px 0 0 var(--clay); }
  .sync { margin-top: auto; font-size: 13px; }
  main { padding: 26px 28px 120px; min-width: 0; }
  .top h1 { font-size: 30px; margin: 0 0 12px; }
  .mtags { display: none; }
  .chip { border: 1px solid var(--line); background: var(--surface); border-radius: 999px; padding: 4px 12px; font-size: 15px; cursor: pointer; white-space: nowrap; }
  .chip.on { background: var(--green-wash); border-color: var(--green); font-weight: 700; }
  .frow { margin: 12px 0 8px; }
  .welcome { padding: 22px; max-width: 640px; }
  .welcome p { max-width: 58ch; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0; }
  .small { font-size: 14px; }
  .ask { display: flex; border-bottom: 2px solid var(--ink); padding-bottom: 6px; }
  .ask:focus-within { border-color: var(--green); }
  .ask input { flex: 1; min-width: 0; border: 0; background: none; padding: 6px 0; font: 400 clamp(24px, 4.4vw, 36px)/1.2 var(--serif); letter-spacing: -.015em; }
  .ask input::placeholder { color: var(--soft); font-style: italic; opacity: .85; }
  .ask input:focus { outline: none; }
  .ask input::-webkit-search-cancel-button { display: none; }
  .recent { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 12px 0 0; padding: 0; list-style: none; }
  .recent button { border: 0; background: none; color: var(--soft); padding: 2px 0; cursor: pointer; text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 3px; }
  .recent button:hover { color: var(--ink); }
  .help { margin: 14px 0; color: var(--soft); font-size: 15px; }
  .help summary { cursor: pointer; width: max-content; }
  .help code { background: var(--surface); border: 1px solid var(--line); border-radius: 5px; padding: 0 5px; font-size: 14px; }
  .sortwrap { margin: 16px 0 0; }
  .bottom { display: none; }
  .banner { padding: 12px 16px; margin: 0 0 16px; border-color: var(--gold); background: var(--gold-wash); }

  @media (max-width: 900px) {
    .shell { grid-template-columns: 1fr; }
    .side { display: none; }
    main { padding: 14px 16px calc(96px + env(safe-area-inset-bottom)); }
    .top h1 { font-size: 24px; margin-bottom: 8px; }
    .mtags { display: flex; gap: 6px; overflow-x: auto; margin: 0 -16px 14px; padding: 0 16px 4px; scrollbar-width: none; }
    .bottom { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; background: var(--surface); border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom); }
    .bottom button { flex: 1; display: grid; justify-items: center; gap: 2px; background: none; border: 0; padding: 8px 0 6px; color: var(--soft); font-size: 12px; cursor: pointer; }
    .bottom button.on { color: var(--clay); font-weight: 700; }
  }
</style>
