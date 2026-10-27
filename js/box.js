// ============================================================
// EMBALAGEM 3D
// A caixa é calculada em 3D (largura, profundidade, altura) e
// projetada na tela. A tampa gira na dobra de trás, então o
// fechamento respeita a geometria real da caixa.
// Desenhada em duas camadas SVG: "fundo" (interior, tampa aberta)
// e "frente" (paredes externas, tampa fechando). Entre as duas
// ficam o hambúrguer e as batatas.
// ============================================================

import { logoMark } from './art.js';
import { CONFIG } from './config.js';

export const BOX = { W: 1.5, D: 1.1, H: 0.66, F: 0.15, ABERTA: 110 };

const f4 = (v) => Math.round(v * 10000) / 10000;
const f1 = (v) => Math.round(v * 10) / 10;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => mul(a, 1 / Math.hypot(...a));

// Câmera ortográfica: giro (yaw) e inclinação para baixo (pitch)
export function camera(yawGraus = -18, pitchGraus = 28) {
  const y = (yawGraus * Math.PI) / 180;
  const t = (pitchGraus * Math.PI) / 180;
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const ct = Math.cos(t);
  const st = Math.sin(t);
  return {
    project: ([x, yy, z]) => {
      const x1 = x * cy + z * sy;
      const z1 = -x * sy + z * cy;
      return [x1, -yy * ct + z1 * st];
    },
    olhar: [-sy * ct, st, cy * ct], // direção do objeto para a câmera
  };
}

// Inclinação da câmera: de cima com a caixa aberta (vê o que tem dentro,
// como na foto de referência) e mais baixa com a caixa fechada (mostra a frente).
export const PITCH = { aberta: 50, fechada: 28 };
const YAW = -18;
const CAM = camera(YAW, PITCH.fechada);
const { W, D, H, F, ABERTA } = BOX;

// cantos
const A = [-W / 2, 0, D / 2];
const B = [W / 2, 0, D / 2];
const C = [W / 2, H, D / 2];
const Dd = [-W / 2, H, D / 2];
const E = [-W / 2, 0, -D / 2];
const Fb = [W / 2, 0, -D / 2];
const G = [W / 2, H, -D / 2];
const Hh = [-W / 2, H, -D / 2];

export function tampa(phi) {
  const r = (phi * Math.PI) / 180;
  const u = [0, Math.sin(r), Math.cos(r)];
  const n = [0, -Math.cos(r), Math.sin(r)];
  const t = phi / ABERTA;
  const fd = unit(add(mul(n, 1 - 0.55 * t), mul(u, 0.55 * t)));
  const h0 = Hh;
  const h1 = G;
  const f0 = add(h0, mul(u, D));
  const f1 = add(h1, mul(u, D));
  return { h0, h1, f0, f1, q2: add(f1, mul(fd, F)), q3: add(f0, mul(fd, F)) };
}

// limites da silhueta projetada (em unidades), para enquadrar a câmera
export function limites(phi, pitch = PITCH.fechada) {
  const L = tampa(phi);
  const pts = [A, B, C, Dd, E, Fb, G, Hh, L.f0, L.f1, L.q2, L.q3].map(camera(YAW, pitch).project);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export const projetar = CAM.project;

// --- artes das faces (coordenadas locais: 100 por unidade) ---
const marca = CONFIG.marca;
const DISP = "font-family:'Big Shoulders Display','Arial Narrow',Impact,sans-serif;font-weight:900";
const MONO = "font-family:'IBM Plex Mono',ui-monospace,monospace;font-weight:600";

const LH = Math.round(BOX.H * 100); // altura local das paredes
const artFrente = (id) => `
  <rect width="150" height="${LH}" fill="url(#${id}fr)"/>
  <rect y="7" width="150" height="1.4" fill="#F15A24"/><rect y="${LH - 8.4}" width="150" height="1.4" fill="#F15A24"/>
  ${logoMark(35, LH / 2, 14.5)}
  <text x="58" y="${LH / 2 + 4}" textLength="74" lengthAdjust="spacingAndGlyphs" style="${DISP};font-size:22px" fill="#FFFFFF">${marca.nomeCurto}</text>
  <text x="59" y="${LH / 2 + 15}" textLength="54" lengthAdjust="spacingAndGlyphs" style="${DISP};font-size:8.6px" fill="#F15A24">${marca.sufixo}</text>
  <rect width="150" height="${LH}" fill="url(#${id}luz)"/>`;

// Versões com a arte fotográfica da marca (CONFIG.embalagem)
const EMB = CONFIG.embalagem || {};
const artFrenteFoto = (id) => {
  const h = 150 / EMB.proporcaoFrente;
  return `
  <rect width="150" height="${LH}" fill="#151112"/>
  <image href="${EMB.frente}" x="0" y="${(LH - h - 1.5).toFixed(2)}" width="150" height="${h.toFixed(2)}" preserveAspectRatio="none" mask="url(#${id}mf)"/>
  <rect width="150" height="${LH}" fill="url(#${id}luz)"/>`;
};
const artTampaSelo = (id) => `
  <rect width="150" height="110" fill="url(#${id}tf)"/>
  <image href="${EMB.selo}" x="51" y="34" width="48" height="48"/>`;

const artLado = (id) => `
  <rect width="110" height="${LH}" fill="url(#${id}ld)"/>
  <rect y="7" width="110" height="1.4" fill="#F15A24"/><rect y="${LH - 8.4}" width="110" height="1.4" fill="#F15A24"/>
  <text x="55" y="${LH / 2 - 1}" text-anchor="middle" textLength="62" lengthAdjust="spacingAndGlyphs" style="${MONO};font-size:6.6px" fill="#D9D2C9">FEITO NA HORA.</text>
  <text x="55" y="${LH / 2 + 8}" text-anchor="middle" textLength="74" lengthAdjust="spacingAndGlyphs" style="${MONO};font-size:4.4px" fill="#8F8780">QUENTE, FECHADO, NO CAPRICHO.</text>`;

const artTampaFora = (id) => `
  <rect width="150" height="110" fill="url(#${id}tf)"/>
  <rect x="6" y="6" width="138" height="98" rx="3" fill="none" stroke="#F15A24" stroke-width=".9"/>
  ${logoMark(75, 38, 17)}
  <text x="75" y="76" text-anchor="middle" textLength="76" lengthAdjust="spacingAndGlyphs" style="${DISP};font-size:22px" fill="#FFFFFF">${marca.nomeCurto}</text>
  <text x="75" y="88" text-anchor="middle" textLength="56" lengthAdjust="spacingAndGlyphs" style="${DISP};font-size:9px" fill="#F15A24">${marca.sufixo}</text>`;

const artTampaDentro = () => `
  <rect width="150" height="110" fill="#272321"/>
  <text x="75" y="56" text-anchor="middle" textLength="70" lengthAdjust="spacingAndGlyphs" style="${DISP};font-size:15px" fill="#3A3532">BOM APETITE.</text>
  <text x="75" y="66" text-anchor="middle" textLength="70" lengthAdjust="spacingAndGlyphs" style="${MONO};font-size:4px" fill="#3A3532">OBRIGADO POR PEDIR COM A GENTE</text>`;

const artAba = () => `
  <rect width="150" height="15" fill="#141414"/>
  <rect y="11.5" width="150" height="1" fill="#F15A24"/>
  <text x="75" y="8.2" text-anchor="middle" textLength="24" lengthAdjust="spacingAndGlyphs" style="${MONO};font-size:3.6px" fill="#9A928A">ABRA AQUI</text>`;

let nCaixas = 0;
export function criarCaixa(svgFundo, svgFrente) {
  let S = 100; // pixels por unidade
  const id = `cx${++nCaixas}`; // único por caixa (o modo sem animação tem 4 caixas na página)
  let cam = CAM; // câmera desta caixa (muda a inclinação durante a cena)
  let pitchAtual = PITCH.fechada;
  const P = (pt) => cam.project(pt).map((v) => v * S);
  const pts = (arr) => arr.map((pt) => P(pt).map(f1).join(',')).join(' ');
  const poly = (arr, fill, extra = '') => `<polygon points="${pts(arr)}" fill="${fill}" ${extra}/>`;
  // mapeia arte local (largura wl x altura hl) para o paralelogramo p0-p1-p3
  const matriz = (p0, p1, p3, wl, hl) => {
    const a = P(p0);
    const b = P(p1);
    const c = P(p3);
    const m = [(b[0] - a[0]) / wl, (b[1] - a[1]) / wl, (c[0] - a[0]) / hl, (c[1] - a[1]) / hl, a[0], a[1]].map(f4);
    return `matrix(${m.join(' ')})`;
  };
  const face = (p0, p1, p3, wl, hl, art) => `<g transform="${matriz(p0, p1, p3, wl, hl)}">${art}</g>`;
  const visivel = (n) => dot(n, cam.olhar) > 0;
  // Partes que dependem da câmera: marcadas com data-k e reposicionadas em reprojetar(),
  // sem recriar o SVG (a foto da frente não pisca).
  let ligados = [];
  let elsLigados = [];
  const liga = (fn) => { ligados.push(fn); return `data-k="${ligados.length - 1}"`; };
  const polyK = (arr, fill, extra = '') => `<polygon ${liga((e) => e.setAttribute('points', pts(arr)))} fill="${fill}" ${extra}/>`;
  const faceK = (p0, p1, p3, wl, hl, art) => `<g ${liga((e) => e.setAttribute('transform', matriz(p0, p1, p3, wl, hl)))}>${art}</g>`;
  const linhaK = (arr, extra) => `<polyline ${liga((e) => e.setAttribute('points', pts(arr)))} fill="none" ${extra}/>`;
  function reprojetar() {
    ligados.forEach((fn, i) => elsLigados[i] && fn(elsLigados[i]));
  }

  const defs = `<defs>
    <linearGradient id="${id}fr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#202020"/><stop offset="1" stop-color="#121212"/></linearGradient>
    <linearGradient id="${id}ld" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0B0B0B"/><stop offset="1" stop-color="#151515"/></linearGradient>
    <linearGradient id="${id}tf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151515"/><stop offset="1" stop-color="#1F1F1F"/></linearGradient>
    <linearGradient id="${id}luz" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".07"/><stop offset=".5" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151312"/><stop offset="1" stop-color="#2A2624"/></linearGradient>
    <linearGradient id="${id}mfv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset=".12" stop-color="#FFF"/></linearGradient>
    <mask id="${id}mf" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#${id}mfv)"/></mask>
    <linearGradient id="${id}pp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3EAD6"/><stop offset="1" stop-color="#DCCDAE"/></linearGradient>
  </defs>`;

  function estatico() {
    ligados = [];
    const borda = `stroke="#4A403A" stroke-width="${f1(S * 0.007)}" stroke-linejoin="round"`;
    // papel manteiga sob o hambúrguer
    const papel = [[-0.72, 0.002, -0.46], [-0.02, 0.002, -0.5], [0.02, 0.002, 0.46], [-0.7, 0.002, 0.5]];
    let fundo = defs + '<g class="tampa-fundo"></g>';
    fundo += polyK([A, B, Fb, E], '#1B1918'); // piso
    fundo += polyK(papel, `url(#${id}pp)`);
    fundo += faceK(papel[0], papel[1], papel[3], 70, 96,
      `<g opacity=".16" stroke="#8A6A3A" stroke-width=".6">${Array.from({ length: 9 }, (_, i) => `<path d="M0 ${10 + i * 10} H70"/>`).join('')}</g>`);
    fundo += polyK([E, Fb, G, Hh], `url(#${id}pf)`); // parede de trás (interna)
    // parede lateral interna visível
    if (visivel([1, 0, 0])) fundo += polyK([E, A, Dd, Hh], '#211E1C');
    else fundo += polyK([Fb, B, C, G], '#211E1C');
    fundo += linhaK([Dd, Hh, G, C], borda);

    let frente = '';
    frente += faceK(Dd, C, A, 150, LH, (EMB.frente ? artFrenteFoto : artFrente)(id));
    if (visivel([1, 0, 0])) frente += faceK(C, G, B, 110, LH, artLado(id));
    else frente += faceK(Hh, Dd, E, 110, LH, artLado(id));
    frente += linhaK([Dd, C], borda);
    frente += linhaK([C, B], `stroke="#2C2C2C" stroke-width="${f1(S * 0.006)}"`);
    frente += '<g class="tampa-frente"></g>';
    svgFundo.innerHTML = fundo;
    svgFrente.innerHTML = frente;
    elsLigados = [];
    for (const svg of [svgFundo, svgFrente]) svg.querySelectorAll('[data-k]').forEach((e) => { elsLigados[+e.dataset.k] = e; });
    reprojetar();
    gFundo = svgFundo.querySelector('.tampa-fundo');
    gFrente = svgFrente.querySelector('.tampa-frente');
    montarTampa();
    ultimoPhi = null;
  }

  // A tampa é montada uma vez; a cada quadro só mudam as posições.
  // Assim a imagem do selo não é recarregada durante o fechamento.
  let tampaG;
  let T;
  function montarTampa() {
    tampaG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    tampaG.innerHTML = `<g data-f="fora">${(EMB.selo ? artTampaSelo : artTampaFora)(id)}</g>
      <g data-f="dentro">${artTampaDentro()}</g>
      <g data-f="aba">${artAba()}</g>
      <polygon data-f="aba-dentro" fill="#222020"/>
      <polyline data-f="borda" fill="none" stroke="#3A3330" stroke-linejoin="round"/>`;
    const q = (n) => tampaG.querySelector(`[data-f="${n}"]`);
    T = { fora: q('fora'), dentro: q('dentro'), aba: q('aba'), abaDentro: q('aba-dentro'), borda: q('borda') };
  }

  let gFundo;
  let gFrente;
  let ultimoPhi = null;

  function desenharTampa(phi) {
    if (ultimoPhi !== null && Math.abs(phi - ultimoPhi) < 0.05) return;
    ultimoPhi = phi;
    const L = tampa(phi);
    const nTampa = mul(cross(sub(L.h1, L.h0), sub(L.f0, L.h0)), -1);
    const nAba = mul(cross(sub(L.f1, L.f0), sub(L.q3, L.f0)), -1);
    const vt = visivel(nTampa);
    T.fora.style.display = vt ? '' : 'none';
    T.dentro.style.display = vt ? 'none' : '';
    if (vt) T.fora.setAttribute('transform', matriz(L.h0, L.h1, L.f0, 150, 110));
    else T.dentro.setAttribute('transform', matriz(L.f0, L.f1, L.h0, 150, 110));
    const va = visivel(nAba);
    T.aba.style.display = va ? '' : 'none';
    T.abaDentro.style.display = va ? 'none' : '';
    if (va) T.aba.setAttribute('transform', matriz(L.f0, L.f1, L.q3, 150, 15));
    else T.abaDentro.setAttribute('points', pts([L.f0, L.f1, L.q2, L.q3]));
    T.borda.setAttribute('points', pts([L.h0, L.f0, L.f1, L.h1]));
    T.borda.setAttribute('stroke-width', f1(S * 0.005));
    const destino = phi > 90 ? gFundo : gFrente;
    if (tampaG.parentNode !== destino) destino.appendChild(tampaG);
  }

  return {
    escala(s) {
      S = s;
      estatico();
    },
    tampa: desenharTampa,
    // muda a inclinação da câmera desta caixa (graus)
    camera(pitch) {
      if (Math.abs(pitch - pitchAtual) < 0.02) return;
      pitchAtual = pitch;
      cam = camera(YAW, pitch);
      reprojetar();
      ultimoPhi = null;
    },
    projetar: (pt) => cam.project(pt),
  };
}
