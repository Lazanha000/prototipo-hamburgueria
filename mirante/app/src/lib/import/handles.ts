// Acha perfis do Instagram em qualquer texto: links, @nomes, links de post/reel/story,
// o following.json do "Baixar suas informações", HTML exportado, CSV, ou a lista exportada pelo Mirante
// (link<TAB>nome<TAB>playlists). Link de post vira "~p/CODIGO": o trabalhador descobre o dono.
export interface Found { handle: string; name: string | null; tag: string | null }

const RESERVED = new Set([
  "p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about", "developer", "legal", "web",
  "emails", "challenge", "privacy", "terms", "session", "login", "signup", "graphql", "api", "static", "help", "press",
]);
const H = "[A-Za-z0-9._]{1,30}";
const URL_RE = new RegExp(String.raw`(?:instagram\.com|instagr\.am)/(?:_u/)?(${H}|p|reels?|tv|stories)(?:/([A-Za-z0-9._-]{1,40}))?`, "gi");
const AT_RE = new RegExp(String.raw`(?<![\w@.\/])@(${H})`, "g");
const BARE_RE = new RegExp(String.raw`^@?(${H})$`);

export function validHandle(h: string): boolean {
  return /^[a-z0-9._]{1,30}$/.test(h) && !h.startsWith(".") && !h.endsWith(".") && !h.includes("..") && /[a-z]/.test(h) && !RESERVED.has(h);
}

export function extractProfiles(text: string): Found[] {
  const out: Found[] = [];
  const seen = new Set<string>();
  const push = (handle: string, name: string | null, tag: string | null) => {
    if (seen.has(handle)) return;
    seen.add(handle);
    out.push({ handle, name, tag });
  };
  for (const json of jsonHandles(text)) push(json, null, null);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = raw.split("\t");
    const name = parts.length > 1 ? parts[1].trim() || null : null;
    const tag = parts.length > 2 ? parts[2].split(",")[0].trim() || null : null;
    const found: string[] = [];
    for (const m of line.matchAll(URL_RE)) {
      const first = m[1].toLowerCase();
      if ((first === "p" || first === "reel" || first === "reels" || first === "tv") && m[2]) found.push("~p/" + m[2]);
      else if (first === "stories" && m[2]) found.push(m[2].toLowerCase());
      else found.push(first.replace(/\.+$/, ""));
    }
    for (const m of line.matchAll(AT_RE)) found.push(m[1].toLowerCase().replace(/\.+$/, ""));
    if (!found.length) {  // linha com só um nome, como numa lista simples
      const b = line.split(/[\t,;]/)[0].trim().match(BARE_RE);
      if (b && line.split(/\s+/).length <= 3) found.push(b[1].toLowerCase());
    }
    const ok = [...new Set(found)].filter(h => h.startsWith("~p/") || validHandle(h));
    for (const h of ok) push(h, ok.length === 1 ? name : null, tag);
  }
  return out;
}

/** following.json / followers.json do Instagram: pega "value" e "title" junto de links do Instagram. */
function jsonHandles(text: string): string[] {
  const t = text.trimStart();
  if (!t.startsWith("{") && !t.startsWith("[")) return [];
  let data: unknown;
  try { data = JSON.parse(t); } catch { return []; }
  const out: string[] = [];
  const walk = (o: unknown) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== "object") return;
    const r = o as Record<string, unknown>;
    if (Array.isArray(r.string_list_data)) {
      const title = typeof r.title === "string" ? r.title : "";
      for (const d of r.string_list_data as Record<string, unknown>[]) {
        const v = String(d.value || title || "").toLowerCase().replace(/^@/, "");
        if (validHandle(v)) out.push(v);
      }
      if (title && validHandle(title.toLowerCase())) out.push(title.toLowerCase());
      return;
    }
    Object.values(r).forEach(walk);
  };
  walk(data);
  return out;
}
