<script lang="ts">
  import { db } from "../db/client";
  import type { FeedRow, MediaItem, Profile } from "../db/store";
  import { ui, say, refresh, go, feedParams, searchParams } from "../state.svelte";
  import { fetchPostDetails } from "../sync";
  import { dateLong, num, KIND } from "../format";
  import Icon from "./Icon.svelte";
  import Comments from "./Comments.svelte";
  import Performance from "./Performance.svelte";

  let { id }: { id: string } = $props();
  let post = $state<(FeedRow & { profile: Profile }) | null>(null);
  let tab = $state<"comments" | "perf">("comments");
  let slide = $state(0);
  let nav = $state<{ prev: string | null; next: string | null }>({ prev: null, next: null });
  let panel = $state<HTMLElement | null>(null);
  let broken = $state(false);  // links de mídia do Instagram expiram depois de alguns dias

  $effect(() => {
    const pid = id;
    slide = 0;
    broken = false;
    db.openPost(pid).then(async p => {
      post = p;
      if (!p) return;
      db.markSeen([pid]);
      nav = await db.neighbors(ui.route === "buscar" ? searchParams(ui.q) : feedParams(), pid);
      if (ui.connected) fetchPostDetails(pid).then(() => refresh()).catch(() => {});
    });
    panel?.focus();
  });

  const media = $derived<MediaItem[]>(post?.media ? JSON.parse(post.media) : post?.thumb_url ? [{ kind: "image", url: post.thumb_url }] : []);
  const parts = $derived.by(() => {
    // legenda com #hashtags e @menções clicáveis
    const text = post?.caption || "";
    return text.split(/([#@][\p{L}\p{N}_.]+)/u).filter(Boolean);
  });

  function close() {
    ui.openPost = null;
    if (location.hash.startsWith("#post/")) history.replaceState(null, "", "#" + ui.route);
    refresh();
  }
  function goTo(other: string | null) { if (other) { ui.openPost = other; history.replaceState(null, "", "#post/" + other); } }
  function searchFor(token: string) { close(); ui.q = token.replace(/\.$/, ""); go("buscar"); }
  async function save() {
    if (!post) return;
    await db.setState(post.id, { saved: post.saved ? 0 : 1 });
    post.saved = post.saved ? 0 : 1;
    say(post.saved ? "Salvo." : "Tirado dos salvos.");
  }
  async function hide() {
    if (!post) return;
    await db.setState(post.id, { hidden: post.hidden ? 0 : 1 });
    post.hidden = post.hidden ? 0 : 1;
    say(post.hidden ? "Post oculto. Ele some do feed." : "Post de volta ao feed.");
  }
  async function copy() {
    try { await navigator.clipboard.writeText(`https://www.instagram.com/p/${id}/`); say("Link copiado."); } catch { say("Não consegui copiar o link."); }
  }
  function key(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.matches?.("input, textarea, select")) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight" && !e.shiftKey) goTo(nav.next);
    else if (e.key === "ArrowLeft" && !e.shiftKey) goTo(nav.prev);
    else if (e.key.toLowerCase() === "s") save();
  }
</script>

<svelte:window onkeydown={key} />

<div class="scrim" onclick={close} aria-hidden="true"></div>
<div class="panel" bind:this={panel} tabindex="-1" role="dialog" aria-modal="true" aria-label="Post de @{post?.handle ?? ''}">
  {#if post}
    <header>
      <img class="av" src={post.avatar_url} alt="" />
      <div class="who"><b>@{post.handle}</b><small class="soft">{post.profile_name}</small></div>
      <button class="btn icon quiet" onclick={() => goTo(nav.prev)} disabled={!nav.prev} aria-label="Post anterior"><Icon name="left" /></button>
      <button class="btn icon quiet" onclick={() => goTo(nav.next)} disabled={!nav.next} aria-label="Próximo post"><Icon name="right" /></button>
      <button class="btn icon quiet" onclick={close} aria-label="Fechar"><Icon name="x" /></button>
    </header>

    <div class="media" class:tall={post.kind === "reel"}>
      {#each media as m, i (i)}
        {#if i === slide}
          {#if broken}
            <img src={post.thumb_url} alt="Miniatura do post de @{post.handle}" />
          {:else if m.kind === "video" && !m.url.startsWith("data:image")}
            <video src={m.url} controls playsinline preload="metadata" poster={post.thumb_url ?? undefined} onerror={() => (broken = true)}><track kind="captions" /></video>
          {:else}
            <img src={m.url} alt="Imagem {i + 1} de {media.length} do post de @{post.handle}" onerror={() => (broken = true)} />
          {/if}
        {/if}
      {/each}
      {#if broken}<a class="expired" href="https://www.instagram.com/p/{post.id}/" target="_blank" rel="noopener">O arquivo original expirou. Ver no Instagram</a>{/if}
      {#if media.length > 1 && !broken}
        <button class="nav l" onclick={() => (slide = (slide + media.length - 1) % media.length)} aria-label="Imagem anterior"><Icon name="left" /></button>
        <button class="nav r" onclick={() => (slide = (slide + 1) % media.length)} aria-label="Próxima imagem"><Icon name="right" /></button>
        <span class="dots">{#each media as _, i (i)}<i class:on={i === slide}></i>{/each}</span>
      {/if}
    </div>

    <div class="content">
      <p class="meta soft">{KIND[post.kind] || post.kind} · {dateLong(post.taken_at)}{post.location ? ` · ${post.location}` : ""}</p>
      <p class="caption">{#each parts as t, i (i)}{#if /^[#@]/.test(t)}<button class="tag" onclick={() => searchFor(t)}>{t}</button>{:else}{t}{/if}{/each}</p>
      <p class="stats">
        {#if post.kind === "reel" || post.kind === "video"}<span><Icon name="eye" size={16} /> {num(post.views)}</span>{/if}
        <span><Icon name="heart" size={16} /> {num(post.likes)}</span>
        <span><Icon name="chat" size={16} /> {num(post.comments)}</span>
      </p>
      <div class="acts">
        <button class="btn" aria-pressed={!!post.saved} onclick={save}><Icon name="bookmark" size={16} />{post.saved ? "Salvo" : "Salvar"}</button>
        <button class="btn quiet" onclick={hide}>{post.hidden ? "Mostrar de novo" : "Ocultar"}</button>
        <a class="btn quiet" href="https://www.instagram.com/p/{post.id}/" target="_blank" rel="noopener"><Icon name="external" size={16} />Instagram</a>
        <button class="btn quiet" onclick={copy}><Icon name="link" size={16} />Copiar link</button>
      </div>

      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "comments"} onclick={() => (tab = "comments")}>Comentários</button>
        <button role="tab" aria-selected={tab === "perf"} onclick={() => (tab = "perf")}>Desempenho</button>
      </div>
      {#if tab === "comments"}<Comments postId={post.id} total={post.comments ?? null} />{:else}<Performance {post} />{/if}
    </div>
  {:else}
    <p class="soft pad">Abrindo…</p>
  {/if}
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgba(16, 25, 29, .35); z-index: 30; }
  .panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(560px, 100vw); background: var(--surface); z-index: 31; overflow-y: auto; box-shadow: var(--shadow); outline: none; }
  header { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px; padding: calc(10px + var(--sat)) 12px 10px; background: var(--surface); border-bottom: 1px solid var(--line); }
  .av { width: 36px; height: 36px; border-radius: 50%; }
  .who { flex: 1; min-width: 0; display: grid; }
  .who small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .media { position: relative; background: #000; aspect-ratio: 4/5; display: grid; place-items: center; }
  .media.tall { aspect-ratio: 9/14; }
  .media img, .media video { width: 100%; height: 100%; object-fit: contain; }
  .nav { position: absolute; top: 50%; translate: 0 -50%; background: rgba(255,255,255,.85); color: #1D2B36; border: 0; border-radius: 50%; width: 36px; height: 36px; display: grid; place-items: center; cursor: pointer; }
  .nav.l { left: 8px; } .nav.r { right: 8px; }
  .dots { position: absolute; bottom: 10px; display: flex; gap: 5px; }
  .dots i { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.5); }
  .dots i.on { background: #fff; }
  .expired { position: absolute; bottom: 12px; background: rgba(16,25,29,.85); color: #fff; padding: 6px 12px; border-radius: 8px; font-size: 14px; }
  .content { padding: 14px 16px 60px; }
  .meta { font-size: 14px; margin: 0 0 6px; }
  .caption { white-space: pre-line; font: 17px/1.55 var(--serif); margin: 0 0 10px; }
  .tag { all: unset; color: var(--green); cursor: pointer; }
  .tag:hover { text-decoration: underline; }
  .tag:focus-visible { outline: 3px solid var(--gold); }
  .stats { display: flex; gap: 16px; color: var(--soft); margin: 0 0 10px; }
  .stats span { display: inline-flex; gap: 5px; align-items: center; }
  .acts { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px; }
  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 12px; }
  .tabs button { background: none; border: 0; padding: 8px 12px; cursor: pointer; color: var(--soft); border-bottom: 3px solid transparent; }
  .tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--clay); font-weight: 700; }
  .pad { padding: 20px; }
</style>
