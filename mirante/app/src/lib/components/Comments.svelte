<script lang="ts">
  import { db } from "../db/client";
  import type { Comment } from "../db/store";
  import { ago, num, plural } from "../format";
  import { ui } from "../state.svelte";

  let { postId, total }: { postId: string; total: number | null } = $props();
  type Sort = "likes" | "replies" | "new" | "old";
  // mesmo clique duplo da barra principal: o segundo clique inverte
  const PAIRS: { key: "likes" | "replies" | "date"; a: Sort; b: Sort; la: string; lb: string }[] = [
    { key: "likes", a: "likes", b: "likes", la: "Mais curtidos", lb: "Mais curtidos" },
    { key: "replies", a: "replies", b: "replies", la: "Mais respondidos", lb: "Mais respondidos" },
    { key: "date", a: "new", b: "old", la: "Mais recentes", lb: "Mais antigos" },
  ];
  let sort = $state<Sort>("likes");
  let q = $state("");
  let onlyOwner = $state(false);
  let list = $state<Comment[]>([]);
  let open = $state<Record<string, Comment[]>>({});
  let answered = $state<Set<string>>(new Set());

  $effect(() => {
    void ui.tick;
    const [id, s, query, own] = [postId, sort, q, onlyOwner];
    db.comments(id, s, query, own).then(r => (list = r));
    db.ownerAnswered(id).then(a => (answered = new Set(a)));
  });
  async function toggle(c: Comment) {
    if (open[c.id]) { delete open[c.id]; open = { ...open }; return; }
    open = { ...open, [c.id]: await db.replies(c.id) };
  }
  function pick(p: (typeof PAIRS)[number]) {
    sort = sort === p.a && p.a !== p.b ? p.b : p.a;
  }
</script>

<div class="tools">
  {#each PAIRS as p (p.key)}
    <button type="button" class="chip" class:on={sort === p.a || sort === p.b} onclick={() => pick(p)}>{sort === p.b && p.a !== p.b ? p.lb : p.la}</button>
  {/each}
  <label class="pill"><input type="checkbox" bind:checked={onlyOwner} /><span>Onde o perfil respondeu</span></label>
</div>
<input class="input search" type="search" placeholder="Pesquisar nos comentários" bind:value={q} aria-label="Pesquisar nos comentários" />

{#if !list.length}
  <p class="soft">{q ? "Nenhum comentário com essas palavras." : total ? "O Mirante lê só o que é público, e o texto dos comentários exige uma conta do Instagram conectada (ainda não disponível). Aqui aparece o número: " + total + "." : "Sem comentários."}</p>
{:else}
  <p class="soft count">{plural(list.length, "comentário", "comentários")}{total && total > list.length && !q ? ` de ${num(total)}` : ""}</p>
  <ul class="cs">
    {#each list as c (c.id)}
      <li>
        <p class="meta"><b>{c.author}</b> <span class="soft">{ago(c.created_at)}</span>
          {#if c.by_owner}<span class="owner">o perfil</span>{/if}
          {#if answered.has(c.id)}<span class="owner">respondido pelo perfil</span>{/if}</p>
        <p class="text">{c.text}</p>
        <p class="meta soft">♥ {num(c.likes)}
          {#if c.replies && !c.parent_id}· <button class="linkish" onclick={() => toggle(c)}>{open[c.id] ? "esconder respostas" : `ver ${plural(c.replies, "resposta", "respostas")}`}</button>{/if}</p>
        {#if open[c.id]}
          <ul class="replies">
            {#each open[c.id] as r (r.id)}
              <li><p class="meta"><b>{r.author}</b> <span class="soft">{ago(r.created_at)}</span>{#if r.by_owner}<span class="owner">o perfil</span>{/if}</p><p class="text">{r.text}</p></li>
            {/each}
          </ul>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .tools { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .chip { border: 1px solid var(--line); background: var(--surface); border-radius: 999px; padding: 3px 11px; font-size: 14px; cursor: pointer; }
  .chip.on { background: var(--green-wash); border-color: var(--green); font-weight: 700; }
  .search { width: 100%; margin-bottom: 8px; }
  .count { font-size: 14px; margin: 4px 0; }
  .cs, .replies { list-style: none; margin: 0; padding: 0; }
  .cs > li { padding: 10px 0; border-top: 1px solid var(--line); }
  .replies { margin: 6px 0 0 16px; border-left: 2px solid var(--line); padding-left: 12px; }
  .replies li { padding: 6px 0; }
  .meta { margin: 0; font-size: 14px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .text { margin: 2px 0; }
  .owner { background: var(--green-wash); color: var(--green); border-radius: 5px; padding: 0 6px; font-size: 13px; font-weight: 700; }
  :global(:root[data-theme="dark"]) .owner { color: var(--ink); }
</style>
