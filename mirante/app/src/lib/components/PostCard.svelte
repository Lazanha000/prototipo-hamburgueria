<script lang="ts">
  import type { FeedRow } from "../db/store";
  import { ago, num, times, KIND, marks } from "../format";
  import Icon from "./Icon.svelte";

  let { post, grid = false, onopen, onsave, onhide }: {
    post: FeedRow; grid?: boolean;
    onopen: (id: string) => void; onsave: (p: FeedRow) => void; onhide: (p: FeedRow) => void;
  } = $props();
  const video = $derived(post.kind === "reel" || post.kind === "video");
  const caption = $derived((post.caption || "").replace(/\n+#.*$/s, "").trim());
  const dur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
</script>

{#if grid}
  <li class="g" class:dim={post.hidden}>
    <button type="button" class="thumb" onclick={() => onopen(post.id)} aria-label="Abrir post de @{post.handle}">
      <img src={post.thumb_url} alt="" loading="lazy" decoding="async" />
      {#if video}<span class="badge"><Icon name="play" size={14} /> {num(post.views)}</span>
      {:else if post.kind === "carousel"}<span class="badge">▤</span>{/if}
      {#if post.is_new}<span class="new corner">Novo</span>{/if}
      {#if (post.outlier ?? 0) >= 2}<span class="hot">{times(post.outlier)}</span>{/if}
    </button>
  </li>
{:else}
  <li class="v" class:dim={post.hidden} class:saved={post.saved}>
    <button type="button" class="thumb" onclick={() => onopen(post.id)} tabindex="-1" aria-hidden="true">
      <img src={post.thumb_url} alt="" loading="lazy" decoding="async" />
      {#if video && post.duration}<span class="d">{dur(post.duration)}</span>{/if}
      {#if post.kind === "carousel"}<span class="d">▤</span>{/if}
    </button>
    <div class="body">
      <p class="who">
        <img class="av" src={post.avatar_url} alt="" loading="lazy" />
        <b>@{post.handle}</b>
        <span class="soft">· {ago(post.taken_at)} · {KIND[post.kind] || post.kind}</span>
        {#if post.is_new}<span class="new">Novo</span>{/if}
        {#if post.is_pinned}<span class="soft">· fixado</span>{/if}
      </p>
      <button type="button" class="cap" onclick={() => onopen(post.id)}>
        {#if post.snippet}
          {#each marks(post.snippet) as part, i (i)}{#if part.hit}<mark>{part.t}</mark>{:else}{part.t}{/if}{/each}
        {:else}
          {caption || "(sem legenda)"}
        {/if}
      </button>
      {#if post.found_in}<p class="found">Achei {post.found_in}</p>{/if}
      <p class="stats">
        {#if video}<span><Icon name="eye" size={15} /> {num(post.views)}</span>{/if}
        <span><Icon name="heart" size={15} /> {num(post.likes)}</span>
        <span><Icon name="chat" size={15} /> {num(post.comments)}</span>
        {#if post.outlier != null && post.outlier >= 1.5}<span class="hot">{times(post.outlier)} acima do normal</span>{/if}
      </p>
      <div class="acts">
        <button type="button" class="btn small" aria-pressed={!!post.saved} onclick={() => onsave(post)}><Icon name="bookmark" size={15} />{post.saved ? "Salvo" : "Salvar"}</button>
        <button type="button" class="btn small quiet" onclick={() => onhide(post)}>{post.hidden ? "Mostrar de novo" : "Ocultar"}</button>
        <a class="btn small quiet" href="https://www.instagram.com/p/{post.id}/" target="_blank" rel="noopener">Abrir no Instagram</a>
      </div>
    </div>
  </li>
{/if}

<style>
  .v { display: grid; grid-template-columns: 132px 1fr; gap: 16px; padding: 16px 0; border-top: 1px solid var(--line); content-visibility: auto; contain-intrinsic-size: auto 190px; }
  .v.dim, .g.dim { opacity: .5; }
  .thumb { position: relative; display: block; padding: 0; border: 0; cursor: pointer; background: var(--line); border-radius: 10px; overflow: hidden; aspect-ratio: 4/5; width: 100%; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .v.saved .thumb { outline: 3px solid var(--gold); outline-offset: 2px; }
  .d { position: absolute; right: 6px; bottom: 6px; background: rgba(16, 25, 29, .82); color: #fff; font-size: 13px; padding: 1px 6px; border-radius: 5px; }
  .body { min-width: 0; }
  .who { margin: 0 0 4px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 15px; }
  .av { width: 24px; height: 24px; border-radius: 50%; }
  .cap { all: unset; cursor: pointer; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font: 17px/1.45 var(--serif); max-width: 68ch; white-space: pre-line; }
  .cap:hover { text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 3px; }
  .cap:focus-visible { outline: 3px solid var(--gold); }
  .found { margin: 4px 0 0; font-size: 14px; color: var(--green); }
  .stats { display: flex; flex-wrap: wrap; gap: 4px 14px; color: var(--soft); font-size: 15px; margin: 8px 0 0; }
  .stats span { display: inline-flex; align-items: center; gap: 4px; }
  .hot { color: var(--clay); font-weight: 700; }
  .acts { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
  .g { list-style: none; content-visibility: auto; contain-intrinsic-size: auto 240px; }
  .g .thumb { border-radius: 8px; }
  .badge { position: absolute; left: 6px; bottom: 6px; display: inline-flex; gap: 3px; align-items: center; background: rgba(16, 25, 29, .78); color: #fff; font-size: 13px; padding: 1px 6px; border-radius: 5px; }
  .corner { position: absolute; left: 6px; top: 6px; }
  .g .hot { position: absolute; right: 6px; top: 6px; background: var(--clay); color: var(--clay-ink); border-radius: 5px; padding: 0 6px; font-size: 13px; }
  @media (max-width: 640px) { .v { grid-template-columns: 96px 1fr; gap: 12px; } .cap { font-size: 16px; } }
</style>
