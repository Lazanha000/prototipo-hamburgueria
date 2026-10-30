<script lang="ts">
  import { CRITS, LABEL, cycle, type Crit } from "../db/sorting";
  import { prefs, savePrefs } from "../state.svelte";

  // a pesquisa tem a sua própria ordem (começa por relevância); o Início, a dele
  let { search = false }: { search?: boolean } = $props();
  const keys = $derived(search ? prefs.searchSort : prefs.sort);
  const setKeys = (k: typeof prefs.sort) => { if (search) prefs.searchSort = k; else prefs.sort = k; savePrefs(); };
  const keyOf = (c: Crit) => keys.find(k => k.crit === c);
  const pos = (c: Crit) => keys.findIndex(k => k.crit === c) + 1;

  function click(c: Crit) { setKeys(cycle(keys, c)); }
  function weight(c: Crit) { setKeys(keys.map(k => (k.crit === c ? { ...k, weight: ((k.weight ?? 1) % 3) + 1 } : k))); }
  const label = (c: Crit) => { const k = keyOf(c); return k ? LABEL[c][k.dir] : LABEL[c].name; };
</script>

<div class="sortbar" role="group" aria-label="Ordenar">
  <span class="flabel">Ordenar</span>
  {#each CRITS as c (c)}
    {@const k = keyOf(c)}
    <button type="button" class="chip" class:on={!!k} aria-pressed={!!k}
      title={k ? (k.dir === "desc" ? "Clique para inverter" : "Clique para desligar") : "Clique para ordenar por " + LABEL[c].name.toLowerCase()}
      onclick={() => click(c)}>
      {#if k && keys.length > 1}<span class="n">{pos(c)}</span>{/if}
      {label(c)}
      {#if k}<span class="arrow" aria-hidden="true">{k.dir === "desc" ? "↓" : "↑"}</span>{/if}
    </button>
  {/each}
  {#if keys.length > 1}
    <label class="mode">
      <span class="sr">Como combinar</span>
      <select value={search ? prefs.searchMode : prefs.mode} onchange={e => { const v = (e.currentTarget as HTMLSelectElement).value as "balanced" | "sequence"; if (search) prefs.searchMode = v; else prefs.mode = v; savePrefs(); }}>
        <option value="balanced">Equilibrado</option>
        <option value="sequence">Em sequência</option>
      </select>
    </label>
    {#if (search ? prefs.searchMode : prefs.mode) === "balanced"}
      <span class="weights">
        {#each keys as k (k.crit)}
          <button type="button" class="linkish w" title="Peso de {LABEL[k.crit].name}: clique para mudar" onclick={() => weight(k.crit)}>{LABEL[k.crit].name} {k.weight ?? 1}×</button>
        {/each}
      </span>
    {/if}
  {/if}
  {#if !search && prefs.sort[0]?.crit === "date" && prefs.sort.length > 1 && prefs.mode === "sequence"}
    <label class="mode">
      <span class="sr">Agrupar datas</span>
      <select bind:value={prefs.group} onchange={savePrefs}>
        <option value="">Data exata</option>
        <option value="day">Por dia</option>
        <option value="week">Por semana</option>
        <option value="month">Por mês</option>
      </select>
    </label>
  {/if}
</div>

<style>
  .sortbar { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
  .flabel { color: var(--soft); font-size: 15px; margin-right: 2px; }
  .chip { border: 1px solid var(--line); background: var(--surface); border-radius: 999px; padding: 4px 12px; font-size: 15px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
  .chip:hover { border-color: var(--soft); }
  .chip.on { background: var(--green-wash); border-color: var(--green); font-weight: 700; }
  .n { display: inline-grid; place-items: center; width: 19px; height: 19px; border-radius: 50%; background: var(--green); color: var(--green-ink); font-size: 12px; font-weight: 700; }
  .arrow { color: var(--green); }
  .mode select { border: 1px solid var(--line); background: var(--surface); border-radius: 999px; padding: 4px 10px; font-size: 15px; }
  .weights { display: inline-flex; gap: 10px; font-size: 14px; }
  .w { color: var(--soft); }
</style>
