// Lê a resposta pública do Instagram (web_profile_info) e a transforma nas linhas do app.
// Formato conhecido pelo site do Instagram; se ele mudar, o app avisa em vez de gravar lixo.
import { IgError } from "./errors";

export interface ParsedProfile {
  ig_id: string; handle: string; name: string | null; bio: string | null; avatar_src: string | null;
  followers: number | null; following: number | null; posts_count: number | null;
  is_business: boolean; is_private: boolean;
}
export interface ParsedPost {
  id: string; kind: "image" | "carousel" | "reel" | "video"; taken_at: number;
  caption: string | null; hashtags: string | null; mentions: string | null; location: string | null;
  duration: number | null; likes: number | null; comments: number | null; views: number | null;
  is_pinned: boolean; media: { kind: "image" | "video"; url: string }[]; thumb_src: string | null;
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) && v >= 0 ? v : null);  // -1 = escondido

export function parseProfileInfo(json: unknown): { profile: ParsedProfile; posts: ParsedPost[] } {
  const user = (json as Json)?.data?.user as Json | null | undefined;
  if (user === null) throw new IgError("notfound", "Esse perfil não existe ou mudou de nome.");
  if (!user || typeof user !== "object" || !user.username || !user.id) throw new IgError("format", "O Instagram respondeu de um jeito que eu não entendi.");
  const profile: ParsedProfile = {
    ig_id: String(user.id), handle: String(user.username).toLowerCase(),
    name: user.full_name || null, bio: user.biography || null,
    avatar_src: user.profile_pic_url || user.profile_pic_url_hd || null,
    followers: num(user.edge_followed_by?.count), following: num(user.edge_follow?.count),
    posts_count: num(user.edge_owner_to_timeline_media?.count),
    is_business: !!user.is_business_account || !!user.is_professional_account, is_private: !!user.is_private,
  };
  const edges: Json[] = user.edge_owner_to_timeline_media?.edges || [];
  const posts: ParsedPost[] = [];
  for (const e of edges) {
    const n = e?.node as Json | undefined;
    if (!n?.shortcode || !n.taken_at_timestamp) continue;
    const caption: string | null = n.edge_media_to_caption?.edges?.[0]?.node?.text ?? null;
    const video = !!n.is_video;
    const kind: ParsedPost["kind"] = n.__typename === "GraphSidecar" ? "carousel" : video ? (n.product_type === "clips" ? "reel" : "video") : "image";
    let media: ParsedPost["media"];
    if (kind === "carousel" && Array.isArray(n.edge_sidecar_to_children?.edges)) {
      media = n.edge_sidecar_to_children.edges.map((c: Json) => ({ kind: (c.node.is_video ? "video" : "image") as "video" | "image", url: c.node.is_video ? c.node.video_url : c.node.display_url })).filter((m: { url?: string }) => m.url);
    } else media = [{ kind: (video ? "video" : "image") as "video" | "image", url: (video ? n.video_url : n.display_url) || n.display_url }].filter(m => m.url);
    // miniatura: a menor versão com pelo menos 480 px, para gastar pouca internet
    const sizes: { src: string; config_width: number }[] = n.thumbnail_resources || [];
    const thumb = sizes.find(s => s.config_width >= 480)?.src || sizes[sizes.length - 1]?.src || n.thumbnail_src || n.display_url || null;
    posts.push({
      id: String(n.shortcode), kind, taken_at: n.taken_at_timestamp * 1000,
      caption, hashtags: tokens(caption, /#([\p{L}\p{N}_]+)/gu), mentions: tokens(caption, /@([\w.]+)/g),
      location: n.location?.name ?? null, duration: num(n.video_duration),
      likes: num(n.edge_media_preview_like?.count ?? n.edge_liked_by?.count),
      comments: num(n.edge_media_to_comment?.count ?? n.edge_media_preview_comment?.count),
      views: video ? num(n.video_play_count ?? n.video_view_count) : null,
      is_pinned: Array.isArray(n.pinned_for_users) && n.pinned_for_users.length > 0,
      media, thumb_src: thumb,
    });
  }
  return { profile, posts };
}

function tokens(text: string | null, re: RegExp): string | null {
  if (!text) return null;
  const set = new Set([...text.matchAll(re)].map(m => m[1].toLowerCase()));
  return set.size ? [...set].join(" ") : null;
}

/** Dono de um post, a partir da página pública dele (ou do oEmbed). */
export function ownerFromOembed(json: unknown): string | null {
  const a = (json as Json)?.author_name;
  return typeof a === "string" && /^[A-Za-z0-9._]{1,30}$/.test(a) ? a.toLowerCase() : null;
}
export function ownerFromHtml(html: string, code: string): string | null {
  const patterns = [/"owner":\{[^{}]*?"username":"([A-Za-z0-9._]{1,30})"/, new RegExp(`instagram\\.com/([A-Za-z0-9._]{1,30})/(?:p|reel)/${code}`), /"username":"([A-Za-z0-9._]{1,30})"/];
  for (const re of patterns) { const m = html.match(re); if (m) return m[1].toLowerCase(); }
  return null;
}
