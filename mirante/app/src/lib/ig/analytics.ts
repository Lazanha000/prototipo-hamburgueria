// Contas feitas no aparelho: "acima do normal" e as "fotografias" de números ao longo do tempo.
export interface PostNums { id: string; kind: string; likes: number | null; views: number | null; taken_at: number }

const median = (xs: number[]) => {
  const s = xs.filter(x => x != null && !isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const isVideo = (k: string) => k === "reel" || k === "video";

/** Métrica do post ÷ mediana dos últimos `window` posts do perfil. Vídeos comparam views; o resto, curtidas. */
export function computeOutliers(posts: PostNums[], window = 30): Map<string, number> {
  const recent = [...posts].sort((a, b) => b.taken_at - a.taken_at).slice(0, window);
  const mv = median(recent.filter(p => isVideo(p.kind) && p.views).map(p => p.views as number));
  const ml = median(recent.filter(p => p.likes).map(p => p.likes as number));
  const out = new Map<string, number>();
  for (const p of posts) {
    if (isVideo(p.kind) && p.views != null && mv) out.set(p.id, Math.round((p.views / mv) * 100) / 100);
    else if (p.likes != null && ml) out.set(p.id, Math.round((p.likes / ml) * 100) / 100);
  }
  return out;
}

export function engagement(likes: number | null, comments: number | null, followers: number | null): number | null {
  if (!followers || likes == null) return null;
  return Math.round((((likes || 0) + (comments || 0)) / followers) * 1e5) / 1e5;
}

const H = 3_600_000;
export const SNAPSHOT_HOURS = [1, 6, 24, 72, 168, 720];
/** Falta anotar os números deste post agora? Uma anotação por marco: 1 h, 6 h, 24 h, 3 d, 7 d, 30 d. */
export function snapshotDue(takenAt: number, now: number, existing: number[]): boolean {
  const ageH = (now - takenAt) / H;
  if (ageH > SNAPSHOT_HOURS[SNAPSHOT_HOURS.length - 1] * 1.5) return false;
  const passed = SNAPSHOT_HOURS.filter(h => h <= ageH);
  if (!passed.length) return existing.length === 0;
  const mark = takenAt + passed[passed.length - 1] * H;
  return !existing.some(a => a >= mark);
}
