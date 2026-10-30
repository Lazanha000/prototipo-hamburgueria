// Rede: no Android usa o HTTP nativo do Capacitor, que não tem a trava de CORS dos navegadores.
// Os pedidos saem do celular, pela internet do próprio usuário (IP comum, não de servidor).
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { IgError } from "./errors";
import { ownerFromHtml, ownerFromOembed, parseProfileInfo, type ParsedPost, type ParsedProfile } from "./parse";

export const isNative = () => Capacitor.isNativePlatform();

const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const BASE = { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.5" };
const API = { ...BASE, "x-ig-app-id": "936619743392459", "x-requested-with": "XMLHttpRequest", Accept: "*/*" };

export interface Net {
  profile(handle: string): Promise<{ profile: ParsedProfile; posts: ParsedPost[] }>;
  ownerOf(code: string): Promise<string>;
  /** Baixa uma imagem e devolve uma miniatura pequena (data URL). */
  image(url: string, width: number, quality: number): Promise<string>;
}

type Resp = { status: number; data: unknown };

async function get(url: string, headers: Record<string, string>, responseType?: "blob"): Promise<Resp> {
  try {
    const r = await CapacitorHttp.get({ url, headers, responseType, connectTimeout: 20000, readTimeout: 30000 });
    return { status: r.status, data: r.data };
  } catch (e) {
    throw new IgError("network", "Sem conexão com o Instagram agora: " + ((e as Error)?.message || "erro de rede"));
  }
}

/** Traduz a resposta HTTP do Instagram: 429/login = pausa; 404 = não existe. */
export function classify(r: Resp): void {
  if (r.status === 404) throw new IgError("notfound", "Esse perfil não existe ou mudou de nome.");
  if (r.status === 429 || r.status === 401 || r.status === 403) throw new IgError("blocked", "O Instagram pediu uma pausa.");
  if (typeof r.data === "string" && /^\s*</.test(r.data)) throw new IgError("blocked", "O Instagram pediu login (pausa).");  // página de login no lugar do JSON
  if (r.status >= 500) throw new IgError("network", "O Instagram está fora do ar agora.");
  if (r.status >= 400) throw new IgError("format", "O Instagram recusou o pedido (" + r.status + ").");
  const d = r.data as { status?: string; require_login?: boolean } | null;
  if (d && typeof d === "object" && (d.require_login || d.status === "fail")) throw new IgError("blocked", "O Instagram pediu login (pausa).");
}

export const nativeNet: Net = {
  async profile(handle) {
    const r = await get(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`, { ...API, Referer: `https://www.instagram.com/${handle}/` });
    classify(r);
    let json = r.data;
    if (typeof json === "string") { try { json = JSON.parse(json); } catch { throw new IgError("format", "O Instagram respondeu de um jeito que eu não entendi."); } }
    return parseProfileInfo(json);
  },
  async ownerOf(code) {
    const o = await get(`https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(`https://www.instagram.com/p/${code}/`)}`, API);
    if (o.status === 200 && typeof o.data === "object") { const h = ownerFromOembed(o.data); if (h) return h; }
    if (o.status === 429) throw new IgError("blocked", "O Instagram pediu uma pausa.");
    const h = await get(`https://www.instagram.com/p/${code}/`, { ...BASE, Accept: "text/html" });
    if (h.status === 404) throw new IgError("notfound", "Não achei esse post.");
    if (h.status === 429) throw new IgError("blocked", "O Instagram pediu uma pausa.");
    const owner = typeof h.data === "string" ? ownerFromHtml(h.data, code) : null;
    if (!owner) throw new IgError("notfound", "Não consegui descobrir de quem é esse post. Cole o link do perfil.");
    return owner;
  },
  async image(url, width, quality) {
    const r = await get(url, { ...BASE, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" }, "blob");
    if (r.status !== 200 || typeof r.data !== "string") throw new IgError("network", "Não consegui baixar a imagem.");
    return shrink(r.data, width, quality);
  },
};

/** Reduz a imagem (base64 vindo do HTTP nativo) para uma miniatura WebP em data URL. */
async function shrink(b64: string, width: number, quality: number): Promise<string> {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const bmp = await createImageBitmap(new Blob([bytes]));
  const scale = Math.min(1, width / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const out = await canvas.convertToBlob({ type: "image/webp", quality });
  return await new Promise<string>((ok, fail) => { const fr = new FileReader(); fr.onload = () => ok(fr.result as string); fr.onerror = () => fail(fr.error); fr.readAsDataURL(out); });
}
