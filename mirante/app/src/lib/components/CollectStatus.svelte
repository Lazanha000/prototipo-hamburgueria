<script lang="ts">
  import { collector as cs, ui } from "../state.svelte";
  import { collect, canCollect } from "../ig/runtime";
  import { ago } from "../format";
  const pct = $derived(cs.total ? Math.round((cs.done / cs.total) * 100) : 0);
  const blocked = $derived(cs.state === "blocked" && cs.until > Date.now());
</script>

{#if canCollect}
  <div class="cs" aria-live="polite">
    {#if cs.running}
      <p>Verificando perfis… <span class="soft">{cs.total ? `${cs.done} de ${cs.total}` : ""}{cs.current ? ` · @${cs.current}` : ""}</span></p>
      {#if cs.total}<div class="bar"><i style="width:{pct}%"></i></div>{/if}
    {:else}
      <p class="row">
        <span class:warn={blocked || cs.state === "changed"}>
          {#if blocked || cs.state === "changed" || cs.state === "offline"}{cs.message}
          {:else if ui.lastSync}Atualizado {ago(ui.lastSync)}.
          {:else if cs.message}{cs.message}{/if}
        </span>
        <button class="btn small" onclick={() => collect(true)} disabled={blocked}>Atualizar agora</button>
      </p>
    {/if}
  </div>
{/if}

<style>
  .cs { margin: 0 0 14px; font-size: 15px; }
  p { margin: 0; }
  .row { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; color: var(--soft); }
  .warn { color: var(--clay); }
  .bar { height: 3px; background: var(--line); border-radius: 3px; overflow: hidden; margin-top: 6px; }
  .bar i { display: block; height: 100%; background: var(--green); transition: width .3s; }
</style>
