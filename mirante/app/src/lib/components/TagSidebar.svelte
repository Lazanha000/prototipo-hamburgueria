<script lang="ts">
  import { db } from "../db/client";
  import type { Tag } from "../db/store";
  import { prefs, ui, selectTags, refresh, say, go } from "../state.svelte";
  import { TAG_COLORS } from "../db/store";

  type T = Tag & { profile_count: number; new_count: number };
  let tags = $state<T[]>([]);
  let edit = $state(false);
  $effect(() => { void ui.tick; db.tags().then(t => (tags = t as T[])); });

  function pick(id: string, e: MouseEvent) {
    // Ctrl/Cmd + clique combina playlists; clique simples mostra só uma
    if (e.ctrlKey || e.metaKey) selectTags(prefs.tagIds.includes(id) ? prefs.tagIds.filter(x => x !== id) : [...prefs.tagIds, id]);
    else selectTags(prefs.tagIds.length === 1 && prefs.tagIds[0] === id ? [] : [id]);
    if (ui.route !== "inicio") go("inicio");
  }
  async function create() {
    const name = (prompt("Nome da nova playlist (ex.: Filosofia, Amigos, Concorrentes):") || "").trim();
    if (!name) return;
    const id = await db.ensureTag(name);
    refresh();
    say(`Playlist “${name}” criada. Na aba Perfis, ponha os perfis nela.`);
    selectTags([id]);
  }
  async function rename(t: T) {
    const name = (prompt("Novo nome:", t.name) || "").trim();
    if (name && name !== t.name) { await db.saveTag({ id: t.id, name }); refresh(); }
  }
  async function recolor(t: T) {
    const i = TAG_COLORS.indexOf(t.color || "");
    await db.saveTag({ id: t.id, color: TAG_COLORS[(i + 1) % TAG_COLORS.length] }); refresh();
  }
  async function del(t: T) {
    if (!confirm(`Apagar a playlist “${t.name}”? Os perfis continuam na sua lista.`)) return;
    await db.deleteTag(t.id);
    selectTags(prefs.tagIds.filter(x => x !== t.id));
    refresh();
  }
  async function move(i: number, d: number) {
    const ids = tags.map(t => t.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await db.reorderTags(ids); refresh();
  }
</script>

<nav class="tags" aria-label="Playlists">
  <p class="head">Playlists <button class="linkish small" onclick={() => (edit = !edit)}>{edit ? "pronto" : "editar"}</button></p>
  <ul>
    <li><button class="t" class:on={!prefs.tagIds.length} onclick={() => { selectTags([]); go("inicio"); }}><span class="dot all"></span>Todos os perfis</button></li>
    {#each tags as t, i (t.id)}
      <li>
        <button class="t" class:on={prefs.tagIds.includes(t.id)} onclick={e => pick(t.id, e)} title="Ctrl + clique para combinar com outras">
          <span class="dot" style="background:{t.color}"></span><span class="name">{t.emoji ? t.emoji + " " : ""}{t.name}</span>
          {#if t.new_count}<span class="count">{t.new_count}</span>{/if}
        </button>
        {#if edit}
          <span class="ed">
            <button class="linkish" onclick={() => rename(t)}>nome</button>
            <button class="linkish" onclick={() => recolor(t)}>cor</button>
            <button class="linkish" onclick={() => move(i, -1)} aria-label="Subir {t.name}">↑</button>
            <button class="linkish" onclick={() => move(i, 1)} aria-label="Descer {t.name}">↓</button>
            <button class="linkish danger" onclick={() => del(t)}>apagar</button>
          </span>
        {/if}
      </li>
    {/each}
  </ul>
  <button class="linkish" onclick={create}>+ Nova playlist</button>
</nav>

<style>
  .tags { font-size: 15px; }
  .head { color: var(--soft); text-transform: uppercase; letter-spacing: .06em; font-size: 12px; margin: 0 0 6px; display: flex; justify-content: space-between; }
  .small { font-size: 12px; text-transform: none; letter-spacing: 0; }
  ul { list-style: none; margin: 0 0 8px; padding: 0; }
  .t { width: 100%; display: flex; align-items: center; gap: 8px; background: none; border: 0; padding: 6px 8px; border-radius: 8px; cursor: pointer; text-align: left; }
  .t:hover { background: var(--surface); }
  .t.on { background: var(--green-wash); font-weight: 700; }
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
  .dot.all { border: 2px solid var(--soft); }
  .count { background: var(--gold); color: var(--gold-ink); border-radius: 999px; font-size: 12px; padding: 0 7px; font-weight: 700; }
  .ed { display: flex; gap: 10px; padding: 0 8px 6px 26px; font-size: 13px; }
  .danger { color: var(--danger); }
</style>
