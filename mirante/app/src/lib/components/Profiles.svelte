<script lang="ts">
  import { db } from "../db/client";
  import type { Profile, Tag } from "../db/store";
  import { extractProfiles } from "../import/handles";
  import { ui, say, refresh, selectTags, go } from "../state.svelte";
  import { num, plural, ago } from "../format";
  import Icon from "./Icon.svelte";

  type Row = Profile & { tag_ids: string | null; post_total: number; new_count: number };
  let list = $state<Row[]>([]);
  let tags = $state<Tag[]>([]);
  let text = $state("");
  let filter = $state("");
  let over = $state(false);
  let editing = $state<string | null>(null);

  $effect(() => { void ui.tick; db.profiles().then(r => (list = r as Row[])); db.tags().then(t => (tags = t)); });

  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shown = $derived(list.filter(p => !filter || fold(`${p.handle} ${p.name ?? ""}`).includes(fold(filter))));
  const tagName = (id: string) => tags.find(t => t.id === id);

  async function add(src: string) {
    const found = extractProfiles(src);
    if (!found.length) { say("Não achei nenhum perfil aí. Use links como instagram.com/fulano ou o próprio @fulano."); return; }
    const r = await db.addProfiles(found);
    if (r.added) text = "";
    say([r.added ? `${plural(r.added, "perfil adicionado", "perfis adicionados")}. Vou verificar cada um.` : "", r.dup ? `${plural(r.dup, "já estava", "já estavam")} na lista.` : ""].filter(Boolean).join(" "));
    if (list.length + r.added > 50) say(`Agora são ${list.length + r.added} perfis. Acima de ~50, a coleta fica mais lenta para não chamar atenção do Instagram.`);
    refresh();
  }
  async function readFiles(files: FileList | File[]) {
    const texts: string[] = [];
    for (const f of files) {
      if (f.size > 20e6) { say(`${f.name} é grande demais (máximo 20 MB).`); continue; }
      texts.push(await f.text());
    }
    if (texts.length) add(texts.join("\n"));
  }
  function onPaste(e: ClipboardEvent) {  // um link só numa caixa vazia: adiciona direto
    const t = e.clipboardData?.getData("text") || "";
    if (!text.trim() && !t.trim().includes("\n") && /instagram|^\s*@/.test(t)) { e.preventDefault(); add(t); }
  }
  async function toggleTag(p: Row, tagId: string) {
    const on = !(p.tag_ids || "").split(",").includes(tagId);
    await db.setProfileTag(p.id, tagId, on);
    refresh();
  }
  async function newTagFor(p: Row) {
    const name = (prompt("Nome da nova playlist (ex.: Filosofia, Amigos, Concorrentes):") || "").trim();
    if (!name) return;
    const id = await db.ensureTag(name);
    await db.setProfileTag(p.id, id, true);
    refresh();
  }
  async function remove(p: Row) {
    if (!confirm(`Tirar @${p.handle} da lista? Os posts guardados dele também saem.`)) return;
    await db.removeProfile(p.id);
    refresh();
    say(`@${p.handle} saiu da lista.`);
  }
  function exportList() {
    db.exportProfiles().then(txt => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" }));
      a.download = "meus-perfis.txt"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }
  const statusText = (p: Row) =>
    p.handle.startsWith("~p/") ? "Descobrindo o dono deste post…"
    : p.status === "pending" ? "Verificando…"
    : p.status === "private" ? "Perfil privado: a conta secundária precisa seguir ele."
    : p.status === "error" ? (p.error || "Não encontrei esse perfil.")
    : [p.followers != null ? `${num(p.followers)} seguidores` : null, p.post_total ? plural(p.post_total, "post", "posts") : null, p.last_post_at ? `último ${ago(p.last_post_at)}` : null].filter(Boolean).join(" · ");
</script>

<h2>Perfis</h2>
<p class="lede">O Mirante acompanha só os perfis desta lista. Até uns 50 a coleta fica tranquila.</p>

<div class="drop" class:over role="region" aria-label="Adicionar perfis"
  ondragover={e => { e.preventDefault(); over = true; }} ondragleave={() => (over = false)}
  ondrop={e => { e.preventDefault(); over = false; if (e.dataTransfer?.files.length) readFiles(e.dataTransfer.files); }}>
  <label class="big" for="paste">Cole um ou vários perfis</label>
  <textarea id="paste" bind:value={text} onpaste={onPaste} placeholder={"https://www.instagram.com/fulano\n@outroperfil\nou o link de um post"}
    onkeydown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) add(text); }}></textarea>
  <div class="row">
    <button class="btn primary" onclick={() => add(text)}>Adicionar perfis</button>
    <span class="btn filebtn"><Icon name="file" size={16} />Escolher arquivo
      <input type="file" accept=".txt,.csv,.json,.html,.htm,.md,text/*,application/json" multiple aria-label="Escolher arquivo com perfis"
        onchange={e => { const f = (e.currentTarget as HTMLInputElement).files; if (f) readFiles(f); (e.currentTarget as HTMLInputElement).value = ""; }} /></span>
  </div>
  <p class="hint">Vale link do perfil, @nome, link de post ou reel, ou um arquivo com vários. Para trazer todos que você segue: no Instagram, <i>Sua atividade → Baixar suas informações</i>, formato JSON, e solte aqui o <i>following.json</i>.</p>
</div>

{#if list.length}
  <div class="tools">
    <input class="input" type="search" placeholder="Procurar nos seus perfis" bind:value={filter} aria-label="Procurar nos seus perfis" />
    <span class="soft">{plural(list.length, "perfil", "perfis")}</span>
    <button class="btn" onclick={exportList}>Baixar lista</button>
  </div>
  <ul class="plist">
    {#each shown as p (p.id)}
      {@const ids = (p.tag_ids || "").split(",").filter(Boolean)}
      <li class:off={!p.on_feed}>
        {#if p.avatar_url}<img class="av" src={p.avatar_url} alt="" loading="lazy" />{:else}<span class="av ini" aria-hidden="true">{p.handle.replace(/^~p\//, "").slice(0, 2).toUpperCase()}</span>{/if}
        <div class="who">
          <b><a href="https://www.instagram.com/{p.handle}/" target="_blank" rel="noopener">{p.name || "@" + p.handle}</a></b>
          <small class:warn={p.status === "error" || p.status === "private"}>@{p.handle} · {statusText(p)}
            {#if p.status === "error"} <button class="linkish" onclick={async () => { await db.updateProfile(p.id, { status: "pending", error: null }); refresh(); }}>Tentar de novo</button>{/if}</small>
          <div class="tags">
            {#each ids as id (id)}{@const t = tagName(id)}{#if t}<span class="tag" style="--c:{t.color}">{t.name}</span>{/if}{/each}
            <button class="linkish small" onclick={() => (editing = editing === p.id ? null : p.id)}>{editing === p.id ? "Pronto" : ids.length ? "Mudar playlists" : "Pôr numa playlist"}</button>
          </div>
          {#if editing === p.id}
            <div class="tagpick">
              {#each tags as t (t.id)}
                <label class="pill"><input type="checkbox" checked={ids.includes(t.id)} onchange={() => toggleTag(p, t.id)} /><span>{t.name}</span></label>
              {/each}
              <button class="linkish" onclick={() => newTagFor(p)}>+ Nova playlist</button>
            </div>
          {/if}
        </div>
        <div class="ctl">
          {#if p.new_count}<button class="btn small" onclick={() => { selectTags([]); ui.q = "@" + p.handle; go("buscar"); }}>{p.new_count} novos</button>{/if}
          <label class="switch"><input type="checkbox" checked={!!p.on_feed} onchange={async e => { await db.updateProfile(p.id, { on_feed: (e.currentTarget as HTMLInputElement).checked ? 1 : 0 }); refresh(); }} />No feed</label>
          <label class="switch" title="Perfis com prioridade são verificados com mais frequência"><input type="checkbox" checked={(p.priority ?? 1) > 1} onchange={async e => { await db.updateProfile(p.id, { priority: (e.currentTarget as HTMLInputElement).checked ? 2 : 1 }); refresh(); }} />Prioridade</label>
          <button class="btn icon quiet" onclick={() => remove(p)} aria-label="Remover @{p.handle}" title="Remover"><Icon name="x" /></button>
        </div>
      </li>
    {/each}
  </ul>
{:else}
  <div class="empty"><h3>Nenhum perfil ainda</h3>Cole acima os links dos perfis que você gosta de acompanhar, um por linha, ou solte o arquivo de quem você segue.</div>
{/if}

<style>
  .drop { border: 2px dashed var(--line); border-radius: 14px; padding: 18px; background: var(--surface); transition: border-color .15s, background .15s; }
  .drop.over { border-color: var(--green); background: var(--green-wash); }
  .big { display: block; font: 600 18px/1.35 var(--serif); margin-bottom: 8px; }
  textarea { width: 100%; min-height: 96px; resize: vertical; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--paper); line-height: 1.45; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 10px; }
  .filebtn { position: relative; overflow: hidden; }
  .filebtn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .filebtn:focus-within { outline: 3px solid var(--gold); outline-offset: 2px; }
  .hint { color: var(--soft); font-size: 15px; margin: 10px 0 0; }
  .tools { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 26px 0 8px; }
  .tools input { flex: 1; min-width: 180px; }
  .plist { list-style: none; margin: 0; padding: 0; }
  .plist li { display: grid; grid-template-columns: 48px 1fr auto; gap: 12px; align-items: start; padding: 12px 0; border-top: 1px solid var(--line); }
  .plist li.off .who { opacity: .55; }
  .av { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
  .ini { display: grid; place-items: center; background: var(--green-wash); color: var(--green); font: 600 17px var(--serif); }
  .who { min-width: 0; }
  .who b a { text-decoration: none; }
  .who small { display: block; color: var(--soft); font-size: 14px; }
  .warn { color: var(--danger) !important; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 4px; }
  .tag { font-size: 13px; border-radius: 999px; padding: 0 9px; background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--ink); border: 1px solid color-mix(in srgb, var(--c) 45%, transparent); }
  .small { font-size: 14px; }
  .tagpick { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; align-items: center; }
  .ctl { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; }
  .switch { display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--soft); cursor: pointer; }
  .switch input { width: 18px; height: 18px; accent-color: var(--green); margin: 0; }
  @media (max-width: 640px) { .plist li { grid-template-columns: 40px 1fr; } .av { width: 40px; height: 40px; } .ctl { grid-column: 1 / -1; justify-content: flex-start; } }
</style>
