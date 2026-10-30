const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
export const num = (n: number | null | undefined) => (n == null ? "—" : compact.format(n));
export const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
const MONTHS = "jan fev mar abr mai jun jul ago set out nov dez".split(" ");
export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 2 * 86400) return "ontem";
  if (s < 7 * 86400) return `há ${Math.floor(s / 86400)} dias`;
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date(now).getFullYear() ? " " + d.getFullYear() : ""}`;
}
export const dateLong = (ts: number) => new Date(ts).toLocaleString("pt-BR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const pct = (x: number | null | undefined) => (x == null ? "—" : (x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%");
export const times = (x: number | null | undefined) => (x == null ? "—" : x.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "×");
export const KIND: Record<string, string> = { reel: "Reel", carousel: "Carrossel", image: "Foto", video: "Vídeo" };
/** Divide um trecho com marcas \u0002…\u0003 (vindas do FTS) em pedaços para grifar sem usar HTML cru. */
export function marks(s: string): { t: string; hit: boolean }[] {
  const [head, ...rest] = s.split("\u0002");
  const out = [{ t: head, hit: false }];
  for (const chunk of rest) {
    const [hit, plain = ""] = chunk.split("\u0003");
    out.push({ t: hit, hit: true }, { t: plain, hit: false });
  }
  return out.filter(p => p.t);
}
