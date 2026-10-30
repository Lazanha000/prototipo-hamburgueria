// Ordenação do feed. Cada chip tem direção ("desc" = mais, "asc" = menos) e peso.
// Dois modos para combinar critérios:
//   balanced: média dos percentis de cada critério (o "mais recente E mais visto ao mesmo tempo")
//   sequence: ordena pelo primeiro e desempata pelos seguintes
export type Crit = "date" | "views" | "likes" | "comments" | "engagement" | "relevance";
export type Dir = "desc" | "asc";
export interface SortKey { crit: Crit; dir: Dir; weight?: number }
export type Mode = "balanced" | "sequence";
export type Group = "" | "day" | "week" | "month";

export interface SortRow {
  rowid: number;
  taken_at: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  engagement: number | null;
  rel: number;
}

export const CRITS: Crit[] = ["date", "views", "likes", "comments", "engagement", "relevance"];

export function value(r: SortRow, c: Crit): number | null {
  switch (c) {
    case "date": return r.taken_at;
    case "views": return r.views;
    case "likes": return r.likes;
    case "comments": return r.comments;
    case "engagement": return r.engagement;
    case "relevance": return r.rel;
  }
}

/** Percentil (0..1) de cada linha no critério; empates recebem a média; sem valor = null. */
export function percentiles(rows: SortRow[], c: Crit): (number | null)[] {
  const idx: number[] = [];
  for (let i = 0; i < rows.length; i++) if (value(rows[i], c) != null) idx.push(i);
  const out: (number | null)[] = new Array(rows.length).fill(null);
  if (!idx.length) return out;
  idx.sort((a, b) => (value(rows[a], c) as number) - (value(rows[b], c) as number));
  const n = idx.length;
  for (let i = 0; i < n; ) {
    let j = i;
    const v = value(rows[idx[i]], c);
    while (j + 1 < n && value(rows[idx[j + 1]], c) === v) j++;
    const p = n === 1 ? 1 : (i + j) / 2 / (n - 1);
    for (let k = i; k <= j; k++) out[idx[k]] = p;
    i = j + 1;
  }
  return out;
}

function bucket(ts: number, g: Group): number {
  if (!g) return ts;
  const d = new Date(ts);
  if (g === "day") return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  if (g === "month") return Date.UTC(d.getFullYear(), d.getMonth(), 1);
  const day = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return day - ((d.getDay() + 6) % 7) * 864e5; // semana começando na segunda
}

/** Devolve as linhas na ordem pedida (não altera o array recebido). */
export function sortRows(rows: SortRow[], keys: SortKey[], mode: Mode = "balanced", group: Group = ""): SortRow[] {
  const ks = keys.length ? keys : [{ crit: "date" as Crit, dir: "desc" as Dir }];
  const byDate = (a: SortRow, b: SortRow) => b.taken_at - a.taken_at || b.rowid - a.rowid;

  if (mode === "balanced" && ks.length > 1) {
    const score = new Float64Array(rows.length);
    for (const k of ks) {
      const w = k.weight ?? 1;
      const p = percentiles(rows, k.crit);
      for (let i = 0; i < rows.length; i++) {
        const v = p[i];
        // sem valor (ex.: foto não tem views) conta como o pior, nas duas direções
        score[i] += w * (v == null ? 0 : k.dir === "desc" ? v : 1 - v);
      }
    }
    const order = rows.map((_, i) => i);
    order.sort((a, b) => score[b] - score[a] || byDate(rows[a], rows[b]));
    return order.map(i => rows[i]);
  }

  const cmp = (a: SortRow, b: SortRow) => {
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      let va = value(a, k.crit), vb = value(b, k.crit);
      if (k.crit === "date" && i === 0 && group && va != null && vb != null) { va = bucket(va, group); vb = bucket(vb, group); }
      if (va == null && vb == null) continue;
      if (va == null) return 1;  // sem valor vai para o fim
      if (vb == null) return -1;
      if (va !== vb) return k.dir === "desc" ? vb - va : va - vb;
    }
    return byDate(a, b);
  };
  return [...rows].sort(cmp);
}

/** O clique no chip: desligado → mais → menos → desligado. */
export function cycle(keys: SortKey[], crit: Crit): SortKey[] {
  const cur = keys.find(k => k.crit === crit);
  if (!cur) return [...keys, { crit, dir: "desc", weight: 1 }];
  if (cur.dir === "desc") return keys.map(k => (k.crit === crit ? { ...k, dir: "asc" as Dir } : k));
  return keys.filter(k => k.crit !== crit);
}

export const LABEL: Record<Crit, { name: string; desc: string; asc: string }> = {
  date: { name: "Data", desc: "Mais recentes", asc: "Mais antigos" },
  views: { name: "Visualizações", desc: "Mais vistos", asc: "Menos vistos" },
  likes: { name: "Curtidas", desc: "Mais curtidos", asc: "Menos curtidos" },
  comments: { name: "Comentários", desc: "Mais comentados", asc: "Menos comentados" },
  engagement: { name: "Engajamento", desc: "Mais engajamento", asc: "Menos engajamento" },
  relevance: { name: "Relevância", desc: "Mais relevantes", asc: "Menos relevantes" },
};
