<script lang="ts">
  import { prefs, savePrefs, type Period } from "../state.svelte";
  const KINDS = [["reel", "Reels"], ["carousel", "Carrosséis"], ["image", "Fotos"]] as const;
  const PERIODS: [Period, string][] = [["all", "Qualquer época"], ["1", "Hoje"], ["7", "7 dias"], ["30", "30 dias"], ["90", "3 meses"], ["365", "1 ano"]];
  function toggleKind(k: string) {
    prefs.kinds = prefs.kinds.includes(k) ? prefs.kinds.filter(x => x !== k) : [...prefs.kinds, k];
    savePrefs();
  }
</script>

<div class="filters">
  <div class="row" role="group" aria-label="Tipo de post">
    <span class="flabel">Tipo</span>
    {#each KINDS as [k, label] (k)}
      <label class="pill"><input type="checkbox" checked={prefs.kinds.includes(k)} onchange={() => toggleKind(k)} /><span>{label}</span></label>
    {/each}
  </div>
  <div class="row" role="radiogroup" aria-label="Período">
    <span class="flabel">Publicado</span>
    {#each PERIODS as [v, label] (v)}
      <label class="pill"><input type="radio" name="period" checked={prefs.period === v} onchange={() => { prefs.period = v; savePrefs(); }} /><span>{label}</span></label>
    {/each}
  </div>
  <div class="row">
    <span class="flabel">Mostrar</span>
    <label class="pill"><input type="checkbox" bind:checked={prefs.onlyUnseen} onchange={savePrefs} /><span>Só não vistos</span></label>
    <label class="pill"><input type="checkbox" bind:checked={prefs.onlySaved} onchange={savePrefs} /><span>Só salvos</span></label>
    <label class="views">Views mínimas
      <input class="input" type="number" min="0" step="1000" inputmode="numeric" placeholder="0" bind:value={prefs.minViews} onchange={savePrefs} />
    </label>
  </div>
</div>

<style>
  .filters { display: grid; gap: 10px; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
  .flabel { color: var(--soft); font-size: 15px; min-width: 84px; }
  .views { display: inline-flex; align-items: center; gap: 6px; color: var(--soft); font-size: 15px; margin-left: 6px; }
  .views input { width: 100px; padding: 3px 8px; }
  @media (max-width: 640px) { .flabel { min-width: 100%; } }
</style>
