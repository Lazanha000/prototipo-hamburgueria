<script lang="ts">
  import { toast } from "../state.svelte";
</script>

{#if toast.msg}
  <div class="toast" role="status">
    {toast.msg}
    {#if toast.action}<button class="linkish" onclick={() => { toast.action?.run(); toast.msg = ""; }}>{toast.action.label}</button>{/if}
  </div>
{/if}

<style>
  .toast { position: fixed; left: 50%; bottom: calc(22px + var(--sab)); transform: translateX(-50%); background: var(--ink); color: var(--paper); padding: 10px 18px; border-radius: 12px; max-width: min(92vw, 560px); box-shadow: 0 6px 24px rgba(0,0,0,.18); z-index: 60; display: flex; gap: 14px; align-items: center; }
  .toast .linkish { color: var(--gold); }
  @media (max-width: 760px) { .toast { bottom: calc(76px + var(--sab)); } }
</style>
