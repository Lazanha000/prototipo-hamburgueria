<script lang="ts">
  import { db } from "../db/client";
  import type { Profile, Story } from "../db/store";
  import { prefs, ui } from "../state.svelte";
  import { ago } from "../format";
  import Icon from "./Icon.svelte";

  type Ring = { profile: Profile; stories: (Story & { seen: number })[]; unseen: number };
  let rings = $state<Ring[]>([]);
  let open = $state<{ ring: number; idx: number } | null>(null);
  let progress = $state(0);
  let paused = $state(false);
  let raf = 0, start = 0, elapsed = 0;

  $effect(() => { void ui.tick; const t = [...prefs.tagIds]; db.storyRings(t).then(r => (rings = r)); });

  const cur = $derived(open ? rings[open.ring]?.stories[open.idx] : null);
  const ms = $derived(((cur?.duration ?? 5) || 5) * 1000);

  function show(ring: number, idx = -1) {
    const r = rings[ring];
    if (!r) return close();
    const first = idx >= 0 ? idx : Math.max(0, r.stories.findIndex(s => !s.seen));
    open = { ring, idx: first };
    begin();
  }
  function begin() {
    cancelAnimationFrame(raf);
    progress = 0; elapsed = 0; start = performance.now(); paused = false;
    if (cur) { db.markStorySeen(cur.id); cur.seen = 1; }
    const step = (t: number) => {
      if (!open) return;
      if (!paused) progress = Math.min(1, (elapsed + t - start) / ms);
      if (progress >= 1) return next();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  function next() {
    if (!open) return;
    const r = rings[open.ring];
    if (open.idx + 1 < r.stories.length) { open = { ...open, idx: open.idx + 1 }; begin(); }
    else if (open.ring + 1 < rings.length) show(open.ring + 1, 0);
    else close();
  }
  function prev() {
    if (!open) return;
    if (open.idx > 0) { open = { ...open, idx: open.idx - 1 }; begin(); }
    else if (open.ring > 0) show(open.ring - 1, 0);
    else begin();
  }
  function pause(p: boolean) {
    if (p === paused) return;
    if (p) elapsed += performance.now() - start; else start = performance.now();
    paused = p;
  }
  function close() {
    cancelAnimationFrame(raf); open = null;
    rings = [...rings].map(r => ({ ...r, unseen: r.stories.filter(s => !s.seen).length }));
  }
  function key(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") prev();
    else if (e.key === " ") { e.preventDefault(); pause(!paused); }
  }
</script>

<svelte:window onkeydown={key} />

{#if rings.length}
  <ul class="strip" aria-label="Stories">
    {#each rings as r, i (r.profile.id)}
      <li>
        <button type="button" class="ring" class:unseen={r.unseen > 0} onclick={() => show(i)} aria-label="Stories de @{r.profile.handle}{r.unseen ? `, ${r.unseen} não vistos` : ''}">
          <img src={r.profile.avatar_url} alt="" />
        </button>
        <span class="h">{r.profile.handle}</span>
      </li>
    {/each}
  </ul>
{/if}

{#if open && cur}
  {@const r = rings[open.ring]}
  <div class="viewer" role="dialog" aria-modal="true" aria-label="Story de @{r.profile.handle}">
    <div class="frame">
      <div class="bars">
        {#each r.stories as s, j (s.id)}<i><b style="width:{j < open.idx ? 100 : j === open.idx ? progress * 100 : 0}%"></b></i>{/each}
      </div>
      <div class="top">
        <img class="av" src={r.profile.avatar_url} alt="" />
        <b>@{r.profile.handle}</b><span>{ago(cur.taken_at)}</span>
        {#if cur.expires_at < Date.now()}<span class="kept">saiu do ar · cópia guardada</span>{/if}
        <button class="x" onclick={close} aria-label="Fechar"><Icon name="x" /></button>
      </div>
      {#if cur.kind === "video" && cur.url}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video src={cur.url} autoplay playsinline></video>
      {:else}
        <img class="media" src={cur.url || cur.thumb_url} alt="Story de @{r.profile.handle}" />
      {/if}
      <button class="zone left" aria-label="Anterior" onclick={prev} onpointerdown={() => pause(true)} onpointerup={() => pause(false)}></button>
      <button class="zone right" aria-label="Próximo" onclick={next} onpointerdown={() => pause(true)} onpointerup={() => pause(false)}></button>
      {#if paused}<span class="paused"><Icon name="pause" /></span>{/if}
    </div>
  </div>
{/if}

<style>
  .strip { display: flex; gap: 14px; overflow-x: auto; list-style: none; margin: 0 0 16px; padding: 4px 2px 6px; scrollbar-width: thin; }
  .strip li { display: grid; justify-items: center; gap: 4px; flex: 0 0 auto; width: 68px; }
  .ring { width: 64px; height: 64px; border-radius: 50%; padding: 3px; border: 2px solid var(--line); background: var(--paper); cursor: pointer; }
  .ring.unseen { border-color: var(--gold); border-width: 3px; }
  .ring img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  .h { font-size: 12px; color: var(--soft); max-width: 68px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .viewer { position: fixed; inset: 0; z-index: 50; background: var(--scrim); display: grid; place-items: center; }
  .frame { position: relative; height: min(92vh, 860px); aspect-ratio: 9/16; max-width: 100vw; background: #000; border-radius: 14px; overflow: hidden; }
  .media, video { width: 100%; height: 100%; object-fit: contain; }
  .bars { position: absolute; top: calc(8px + var(--sat)); left: 8px; right: 8px; display: flex; gap: 4px; z-index: 3; }
  .bars i { flex: 1; height: 3px; background: rgba(255, 255, 255, .35); border-radius: 2px; overflow: hidden; }
  .bars b { display: block; height: 100%; background: #fff; }
  .top { position: absolute; top: calc(18px + var(--sat)); left: 10px; right: 6px; display: flex; gap: 8px; align-items: center; color: #fff; z-index: 3; font-size: 15px; text-shadow: 0 1px 2px rgba(0,0,0,.5); }
  .top span { opacity: .8; }
  .kept { background: rgba(0,0,0,.4); padding: 0 6px; border-radius: 5px; font-size: 13px; }
  .av { width: 30px; height: 30px; border-radius: 50%; }
  .x { margin-left: auto; background: none; border: 0; color: #fff; cursor: pointer; padding: 6px; }
  .zone { position: absolute; top: calc(60px + var(--sat)); bottom: 0; width: 40%; background: none; border: 0; cursor: pointer; z-index: 2; }
  .zone.left { left: 0; } .zone.right { right: 0; width: 60%; }
  .paused { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; pointer-events: none; }
  @media (max-width: 640px) { .frame { height: 100vh; border-radius: 0; } }
</style>
