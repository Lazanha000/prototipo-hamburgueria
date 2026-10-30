// Transforma o que a pessoa digita numa consulta FTS5.
// Sintaxe opcional: "frase exata"  -palavra  @perfil  #hashtag  tipo:reel  em:fala|legenda|comentarios|imagem
export const FTS_COLS = ["caption", "hashtags", "comments_text", "ocr_text", "transcript", "profile_name"] as const;
export type FtsCol = (typeof FTS_COLS)[number];

const SCOPES: Record<string, FtsCol[]> = {
  legenda: ["caption", "hashtags"], descricao: ["caption", "hashtags"],
  fala: ["transcript"], video: ["transcript"],
  comentarios: ["comments_text"], comentario: ["comments_text"],
  imagem: ["ocr_text"], texto: ["ocr_text"],
};
const KINDS: Record<string, string> = { reel: "reel", reels: "reel", video: "video", foto: "image", imagem: "image", carrossel: "carousel" };

export interface ParsedQuery {
  match: string | null;  // expressão para "posts_fts MATCH ?"
  handles: string[];
  kinds: string[];
  terms: string[];       // palavras positivas, para grifar
  excluded: string[];
  empty: boolean;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;

export function parseQuery(input: string): ParsedQuery {
  const handles: string[] = [], kinds: string[] = [], terms: string[] = [], excluded: string[] = [];
  const parts: string[] = [], tags: string[] = [];
  let cols: FtsCol[] | null = null;
  const re = /(-?)"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m[2] !== undefined) {  // frase entre aspas
      const words = fold(m[2]).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      if (!words.length) continue;
      const phrase = quote(words.join(" "));
      if (m[1]) excluded.push(phrase); else { parts.push(phrase); terms.push(...words); }
      continue;
    }
    const tok = m[3];
    const low = fold(tok);
    if (low.startsWith("em:") && SCOPES[low.slice(3)]) { cols = [...(cols || []), ...SCOPES[low.slice(3)]]; continue; }
    if (low.startsWith("tipo:") && KINDS[low.slice(5)]) { kinds.push(KINDS[low.slice(5)]); continue; }
    if (/^@[\w.]{1,30}$/.test(tok)) { handles.push(low.slice(1)); continue; }
    if (/^#[\p{L}\p{N}_]+$/u.test(tok)) { tags.push(quote(low.slice(1))); terms.push(low.slice(1)); continue; }
    const neg = low.startsWith("-") && low.length > 1;
    const words = fold(neg ? tok.slice(1) : tok).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    for (const w of words) {
      const t = w.length >= 2 ? `${quote(w)}*` : quote(w);
      if (neg) excluded.push(t); else { parts.push(t); terms.push(w); }
    }
  }
  let expr = parts.join(" AND ");
  if (expr && cols) expr = `{${[...new Set(cols)].join(" ")}} : (${expr})`;
  if (tags.length) expr = [expr, ...tags.map(t => `hashtags : ${t}`)].filter(Boolean).join(" AND ");
  // FTS5 não aceita só exclusões; nesse caso elas são aplicadas por fora (ver queries.ts)
  if (expr && excluded.length) expr += excluded.map(e => ` NOT ${e}`).join("");
  return { match: expr || null, handles, kinds, terms, excluded, empty: !expr && !handles.length && !kinds.length && !excluded.length };
}
