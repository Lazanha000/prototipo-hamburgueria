// Dados de demonstração: perfis, posts, stories e comentários inventados, para ver o app funcionando
// antes de existir a conta secundária e o Supabase. Tudo é gerado aqui, com sementes fixas.
import type { Store, Profile, Post, Story, Comment, Metric, Tag } from "./db/store";
import { TAG_COLORS } from "./db/store";

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);

interface Theme { tag: string; hues: [number, number]; words: string[]; captions: string[]; tags: string[] }
const THEMES: Theme[] = [
  { tag: "Filosofia", hues: [160, 40], words: ["ética", "liberdade", "Espinosa", "Hannah Arendt", "angústia", "Kant"],
    captions: ["O que {w} tem a dizer sobre a pressa de hoje? Fiz um resumo em 5 partes.", "Uma frase de {w} que mudou meu jeito de ler o jornal.", "Aula curta: {w} explicado sem jargão.", "Você já pensou em {w} como um exercício diário?"],
    tags: ["filosofia", "pensamento", "estudo"] },
  { tag: "Cozinha", hues: [18, 45], words: ["pão de fermentação natural", "moqueca", "feijoada vegana", "bolo de fubá", "café coado", "pesto de manjericão"],
    captions: ["Receita de domingo: {w}, do jeito da minha avó.", "Errei três vezes até acertar o {w}. Conto os erros no vídeo.", "{w} em 20 minutos, sem complicar.", "Ingredientes simples, {w} que abraça."],
    tags: ["receita", "comidadeverdade", "cozinhaafetiva"] },
  { tag: "Fotografia", hues: [210, 30], words: ["luz da manhã", "filme 35 mm", "retrato de rua", "contraluz", "preto e branco", "hora azul"],
    captions: ["Série nova: {w} no centro da cidade.", "Como eu uso {w} sem equipamento caro.", "{w}: antes e depois da edição.", "Três fotos, uma ideia: {w}."],
    tags: ["fotografia", "35mm", "fotoderua"] },
  { tag: "Livros", hues: [28, 330], words: ["Clarice Lispector", "Machado de Assis", "Conceição Evaristo", "Guimarães Rosa", "romance russo", "poesia"],
    captions: ["Terminei {w} e preciso conversar sobre o final.", "Por onde começar a ler {w}? Minha ordem sugerida.", "Trecho sublinhado de {w} para guardar.", "Clube do livro do mês: {w}."],
    tags: ["livros", "leitura", "literaturabrasileira"] },
  { tag: "Ciência", hues: [190, 260], words: ["buracos negros", "microbioma", "sono", "vacinas", "neurônios", "mudanças climáticas"],
    captions: ["{w} em um minuto, com fontes na legenda.", "O mito mais comum sobre {w} (e o que a pesquisa diz).", "Experimento caseiro: {w}.", "Pergunta de seguidor: como funciona {w}?"],
    tags: ["ciencia", "divulgacaocientifica", "curiosidade"] },
  { tag: "Viagem", hues: [95, 200], words: ["Chapada Diamantina", "Ouro Preto", "Lençóis Maranhenses", "Paraty", "Serra da Canastra", "Jalapão"],
    captions: ["Roteiro de 3 dias em {w} gastando pouco.", "O que ninguém te conta sobre {w}.", "{w} fora da temporada vale a pena?", "Diário de bordo: {w}, dia 2."],
    tags: ["viagem", "brasil", "mochilao"] },
  { tag: "Música", hues: [275, 330], words: ["choro", "bossa nova", "violão de 7 cordas", "samba de roda", "MPB dos anos 70", "Clube da Esquina"],
    captions: ["Toquei {w} pela primeira vez ao vivo.", "Por que {w} é tão difícil de tocar? Mostro a mão direita.", "Playlist: {w} para estudar.", "Uma história de {w} que pouca gente conhece."],
    tags: ["musica", "musicabrasileira", "violao"] },
  { tag: "Ilustração", hues: [340, 50], words: ["aquarela", "nanquim", "caderno de esboços", "personagens", "lettering", "gravura"],
    captions: ["Processo completo de uma {w}, do rascunho ao fim.", "Materiais baratos para começar em {w}.", "Desafio de 30 dias de {w}: dia 12.", "{w} feita no ônibus, só com caneta."],
    tags: ["ilustracao", "arte", "sketchbook"] },
];
const FIRST = ["Lia", "Davi", "Marina", "Caio", "Bruna", "Rafa", "Tainá", "Joaquim", "Helena", "Iago", "Nina", "Otávio", "Luana", "Benício", "Clara", "Teo"];
const LAST = ["Martins", "Souza", "Ribeiro", "Prado", "Nogueira", "Alves", "Campos", "Freitas", "Moraes", "Lima"];
const COMMENTERS = ["ana.lu", "joao_pedro", "mari.sol", "beto.cafe", "lua_nova", "pedro.h", "carol.lendo", "dani.foto", "gui_vieira", "re.tavares", "bia.mundo", "tom.sampaio"];
const COMMENTS = [
  "Que coisa linda, salvei para ver de novo!", "Isso me ajudou demais, obrigada!", "Você poderia fazer uma parte 2?",
  "Discordo um pouco, mas adorei a forma como explicou.", "Mandei para minha mãe na hora 😂", "Qual a fonte disso?",
  "Fiz ontem e deu certo!", "Que paciência para fazer tudo isso.", "Melhor post da semana.", "Onde você aprendeu isso?",
  "Mais vídeos assim, por favor.", "Fiquei pensando nisso o dia todo.",
];
const REPLIES = ["Obrigado! 💛", "Parte 2 sai semana que vem.", "Deixei a fonte no primeiro comentário.", "Que bom que gostou!"];

function svg(hues: [number, number], seed: number, w = 640, h = 640, label = ""): string {
  const r = rng(seed);
  const [a, b] = hues;
  const shapes = Array.from({ length: 3 }, () => {
    const cx = Math.round(r() * w), cy = Math.round(r() * h), rad = Math.round(80 + r() * 220);
    return `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="hsl(${(a + r() * 40) % 360} 45% ${55 + r() * 20}%)" opacity=".55"/>`;
  }).join("");
  const text = label ? `<text x="40" y="${h - 48}" font-family="Georgia,serif" font-size="${Math.round(w / 15)}" fill="rgba(255,255,255,.92)">${esc(label)}</text>` : "";
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a} 42% 42%)"/><stop offset="1" stop-color="hsl(${b} 48% 58%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>${shapes}${text}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
function avatar(name: string, hue: number): string {
  const ini = name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="hsl(${hue} 35% 88%)"/><text x="48" y="60" text-anchor="middle" font-family="Georgia,serif" font-size="38" fill="hsl(${hue} 45% 30%)">${esc(ini)}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
}

export function seedDemo(store: Store, nProfiles = 48, days = 150) {
  const r = rng(42);
  const now = Date.now();
  const tags: Tag[] = THEMES.map((t, i) => ({ id: `demo-tag-${i}`, name: t.tag, color: TAG_COLORS[i % TAG_COLORS.length], emoji: null, position: i + 1, sort_pref: null, updated_at: now }));
  store.upsert("tags", tags as never);
  const profiles: Profile[] = [], links: { profile_id: string; tag_id: string; updated_at: number }[] = [];
  const posts: Post[] = [], stories: Story[] = [];
  for (let i = 0; i < nProfiles; i++) {
    const th = THEMES[i % THEMES.length], ti = i % THEMES.length;
    const first = FIRST[i % FIRST.length], last = LAST[Math.floor(r() * LAST.length)];
    const handle = `${first}.${th.tag.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}${i > 15 ? i : ""}`.toLowerCase();
    const followers = Math.round(Math.exp(7.5 + r() * 6));  // de ~2 mil a ~800 mil
    const id = `demo-${handle}`;
    profiles.push({
      id, ig_id: String(100000 + i), handle, name: `${first} ${last} · ${th.tag.toLowerCase()}`,
      bio: `Escrevo e gravo sobre ${th.tag.toLowerCase()} com calma. ${th.words[0]} e afins.`,
      avatar_url: avatar(`${first} ${last}`, th.hues[0]), followers, following: Math.round(200 + r() * 900), posts_count: 0,
      is_business: r() < 0.7 ? 1 : 0, is_private: 0, status: "ok", on_feed: 1, priority: 1, added_at: now - 200 * 864e5, updated_at: now,
    });
    links.push({ profile_id: id, tag_id: tags[ti].id, updated_at: now });
    if (r() < 0.25) links.push({ profile_id: id, tag_id: tags[(ti + 3) % tags.length].id, updated_at: now });
    const nPosts = 25 + Math.floor(r() * 45);
    const base = followers * (0.15 + r() * 0.3);
    const mine: Post[] = [];
    for (let k = 0; k < nPosts; k++) {
      const taken = now - Math.pow(r(), 1.4) * days * 864e5;
      const roll = r();
      const kind = roll < 0.42 ? "reel" : roll < 0.78 ? "carousel" : "image";
      const boom = r() < 0.07 ? 3 + r() * 6 : 0.4 + r() * 1.3;
      const views = kind === "reel" ? Math.round(base * boom * (0.8 + r())) : null;
      const likes = Math.round((views ?? base * 0.6 * boom) * (0.04 + r() * 0.05));
      const comments = Math.round(likes * (0.01 + r() * 0.04));
      const w = th.words[Math.floor(r() * th.words.length)];
      const cap = th.captions[Math.floor(r() * th.captions.length)].replace("{w}", w);
      const hashtags = th.tags.filter(() => r() < 0.7);
      const pid = `D${hash(handle + k).toString(36).replace("-", "x")}${k}`;
      const n = kind === "carousel" ? 2 + Math.floor(r() * 4) : 1;
      const media = Array.from({ length: n }, (_, j) => ({ kind: kind === "reel" ? "video" : "image", url: svg(th.hues, hash(pid) + j, 640, kind === "reel" ? 1136 : 800, j === 0 ? w : ""), w: 640, h: kind === "reel" ? 1136 : 800 }));
      const top = Array.from({ length: 4 }, () => COMMENTS[Math.floor(r() * COMMENTS.length)]).join(" · ");
      mine.push({
        id: pid, profile_id: id, kind, taken_at: Math.round(taken),
        caption: `${cap}\n\n${hashtags.map(h => "#" + h).join(" ")}`, hashtags: hashtags.join(" "), mentions: null, location: r() < 0.2 ? th.words[0] : null,
        duration: kind === "reel" ? Math.round(12 + r() * 80) : null, likes, comments, views, is_pinned: k === 0 && r() < 0.3 ? 1 : 0,
        thumb_url: svg(th.hues, hash(pid), 320, 400, w), media: JSON.stringify(media), top_comments: top,
        ocr_text: null, transcript: null, outlier: null, engagement: (likes + comments) / followers, updated_at: now,
      });
    }
    // "acima do normal": métrica do post ÷ mediana dos posts do perfil (views para reels, curtidas para o resto)
    const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] || 1; };
    const mv = med(mine.filter(p => p.views != null).map(p => p.views!)), ml = med(mine.map(p => p.likes!));
    for (const p of mine) p.outlier = Math.round((p.views != null ? p.views / mv : p.likes! / ml) * 100) / 100;
    profiles[profiles.length - 1].posts_count = mine.length;
    profiles[profiles.length - 1].last_post_at = Math.max(...mine.map(p => p.taken_at));
    posts.push(...mine);
    if (r() < 0.45) {
      const n = 1 + Math.floor(r() * 4);
      for (let s = 0; s < n; s++) {
        const taken = now - r() * 20 * 3600e3;
        stories.push({ id: `S${hash(handle + s)}`, profile_id: id, taken_at: Math.round(taken), expires_at: Math.round(taken + 864e5), kind: "image",
          url: svg(th.hues, hash(handle + "s" + s), 540, 960, s === 0 ? "bom dia ☀" : ""), thumb_url: null, duration: 5, links: null, updated_at: now });
      }
    }
  }
  store.upsert("profiles", profiles as never);
  store.upsert("profile_tags", links);
  store.upsert("posts", posts as never);
  store.upsert("stories", stories as never);
  store.setMeta("demo", "1");
  return { profiles: profiles.length, posts: posts.length, stories: stories.length };
}

/** Comentários e "fotografias" de métricas inventados, criados só quando o post é aberto. */
export function demoDetails(store: Store, post: Post) {
  const r = rng(hash(post.id));
  const n = Math.min(80, Math.max(3, post.comments || 0));
  const out: Comment[] = [];
  for (let i = 0; i < n; i++) {
    const id = `${post.id}-c${i}`;
    const likes = Math.round(Math.pow(r(), 3) * Math.max(10, (post.likes || 0) * 0.05));
    const reps = r() < 0.25 ? 1 + Math.floor(r() * 4) : 0;
    out.push({ id, post_id: post.id, parent_id: null, author: COMMENTERS[Math.floor(r() * COMMENTERS.length)], text: COMMENTS[Math.floor(r() * COMMENTS.length)],
      created_at: Math.round(post.taken_at + r() * 4 * 864e5), likes, replies: reps, by_owner: 0 });
    for (let j = 0; j < reps; j++) {
      const owner = j === 0 && r() < 0.5;
      out.push({ id: `${id}-r${j}`, post_id: post.id, parent_id: id, author: owner ? "(perfil)" : COMMENTERS[Math.floor(r() * COMMENTERS.length)],
        text: owner ? REPLIES[Math.floor(r() * REPLIES.length)] : COMMENTS[Math.floor(r() * COMMENTS.length)],
        created_at: Math.round(post.taken_at + (1 + r() * 5) * 864e5), likes: Math.round(r() * 20), replies: 0, by_owner: owner ? 1 : 0 });
    }
  }
  store.upsert("comments", out as never);
  const marks: number[] = [1, 6, 24, 72, 168, 720].map(h => post.taken_at + h * 3600e3).filter(t => t < Date.now());
  marks.push(Date.now());
  const curve = (x: number) => 1 - Math.exp(-x / (30 + r() * 40));
  const metrics: Metric[] = marks.map(at => {
    const f = curve((at - post.taken_at) / 3600e3) / curve(720);
    return { post_id: post.id, at, likes: Math.round((post.likes || 0) * f), comments: Math.round((post.comments || 0) * f), views: post.views != null ? Math.round(post.views * f) : null };
  });
  store.upsert("metrics", metrics as never);
}
