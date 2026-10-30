<script lang="ts">
  import { db } from "../db/client";
  import type { FeedRow, Metric } from "../db/store";
  import { num, pct, times, ago } from "../format";

  let { post }: { post: FeedRow } = $props();
  let metrics = $state<Metric[]>([]);
  let base = $state<{ likes: number | null; comments: number | null; views: number | null; engagement: number | null; n: number } | null>(null);
  let rank = $state<number | null>(null);
  const video = $derived(post.kind === "reel" || post.kind === "video");

  $effect(() => {
    const id = post.id, pid = post.profile_id;
    db.metrics(id).then(m => (metrics = m));
    db.profileBaseline(pid).then(b => (base = b));
    db.rankAmongProfile(id).then(r => (rank = r));
  });

  // curva: views (reels) ou curtidas, pelas "fotografias" tiradas depois da publicação
  const series = $derived(metrics.map(m => ({ at: m.at, v: (video ? m.views : m.likes) ?? 0 })));
  const path = $derived.by(() => {
    if (series.length < 2) return "";
    const W = 300, H = 70, t0 = post.taken_at, t1 = series[series.length - 1].at, vmax = Math.max(1, ...series.map(s => s.v));
    const x = (t: number) => (Math.log1p((t - t0) / 36e5) / Math.log1p((t1 - t0) / 36e5)) * W;  // eixo em escala log: as primeiras horas aparecem
    return "M0," + H + " " + series.map(s => `L${x(s.at).toFixed(1)},${(H - (s.v / vmax) * (H - 6)).toFixed(1)}`).join(" ");
  });
  const verdict = $derived.by(() => {
    const o = post.outlier;
    if (o == null) return "Ainda calculando: preciso de mais posts deste perfil.";
    if (o >= 3) return "Foi muito acima do normal deste perfil.";
    if (o >= 1.5) return "Foi melhor que o normal deste perfil.";
    if (o >= 0.7) return "Ficou dentro do normal deste perfil.";
    return "Ficou abaixo do normal deste perfil.";
  });
</script>

<div class="perf">
  <p class="big"><span class="hot">{times(post.outlier)}</span> {verdict}</p>
  <p class="soft small">Comparado com a mediana dos últimos {base?.n ?? "…"} posts de @{post.handle}{video ? " (views)" : " (curtidas)"}.</p>

  <dl>
    {#if video}<div><dt>Visualizações</dt><dd>{num(post.views)}</dd><dd class="soft">normal: {num(base?.views)}</dd></div>{/if}
    <div><dt>Curtidas</dt><dd>{num(post.likes)}</dd><dd class="soft">normal: {num(base?.likes)}</dd></div>
    <div><dt>Comentários</dt><dd>{num(post.comments)}</dd><dd class="soft">normal: {num(base?.comments)}</dd></div>
    <div><dt>Engajamento</dt><dd>{pct(post.engagement)}</dd><dd class="soft">normal: {pct(base?.engagement)}</dd></div>
  </dl>
  {#if rank != null}<p>Melhor que <b>{Math.round(rank * 100)}%</b> dos posts de @{post.handle} guardados aqui.</p>{/if}

  <h4>Crescimento depois de publicado</h4>
  {#if path}
    <svg viewBox="0 0 300 74" class="spark" role="img" aria-label="Curva de {video ? 'visualizações' : 'curtidas'} ao longo do tempo">
      <path d={path} fill="none" stroke="var(--clay)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
    <p class="soft small">{series.map(s => num(s.v)).join(" → ")} · última anotação {ago(series[series.length - 1].at)}</p>
  {:else}
    <p class="soft small">A curva aparece quando o Mirante tiver anotado os números deste post algumas vezes (1 h, 6 h, 24 h, 3 dias, 7 dias depois). Só existe para posts que chegaram depois que o perfil entrou aqui.</p>
  {/if}
</div>

<style>
  .big { font: 600 19px/1.35 var(--serif); margin: 0 0 4px; }
  .hot { color: var(--clay); }
  .small { font-size: 14px; }
  dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 14px 0; }
  dl div { background: var(--paper); border-radius: 10px; padding: 8px 10px; }
  dt { font-size: 13px; color: var(--soft); }
  dd { margin: 0; font: 600 20px var(--serif); }
  dd.soft { font: 13px var(--sans); }
  h4 { margin: 18px 0 6px; font: 600 16px var(--serif); }
  .spark { width: 100%; height: 80px; background: var(--paper); border-radius: 10px; }
</style>
