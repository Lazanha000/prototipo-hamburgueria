// Navegação entre páginas pelo endereço (#cardapio, #carrinho...).
// Funciona sem servidor especial e dentro de páginas publicadas.

const rotas = new Map();
let atual = null;
let estadoPendente = null;
let aoMudar = () => {};

export function rota(nome, render) {
  rotas.set(nome, render);
}

export function iniciar(callback) {
  aoMudar = callback;
  window.addEventListener('hashchange', () => abrir(lerHash()));
  abrir(lerHash());
}

function lerHash() {
  return decodeURIComponent((location.hash || '').replace(/^#\/?/, '')).trim();
}

export function ir(nome, estado = null) {
  estadoPendente = estado;
  const alvo = nome ? `#${nome}` : '#inicio';
  if (location.hash === alvo) {
    abrir(nome);
    return;
  }
  try {
    location.hash = alvo;
  } catch {
    abrir(nome);
  }
}

function abrir(nome) {
  const chave = rotas.has(nome) ? nome : nome === '' || nome === 'inicio' ? 'inicio' : '404';
  const estado = estadoPendente;
  estadoPendente = null;
  if (atual?.destruir) atual.destruir();
  atual = null;
  atual = aoMudar(chave, rotas.get(chave), estado) || null;
}
