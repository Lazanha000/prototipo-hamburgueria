// Peças de interface compartilhadas: aviso rápido (toast), imagem
// de produto com reserva, contador do carrinho.

import { artFor } from './art.js';
import { esc } from './utils.js';

let timerToast;
// acao opcional: { rotulo: 'Desfazer', fn }
export function avisar(texto, tipo = 'ok', acao = null) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.className = `toast toast--${tipo} is-on`;
  t.innerHTML = `<span>${esc(texto)}</span>${acao ? `<button type="button" class="toast-acao">${esc(acao.rotulo)}</button>` : ''}`;
  if (acao) {
    t.querySelector('button').addEventListener('click', () => {
      t.classList.remove('is-on');
      acao.fn();
    }, { once: true });
  }
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove('is-on'), acao ? 5000 : 2600);
}

// <img> do produto: foto real se houver; se faltar ou falhar, ilustração
export function imgProduto(prod, classe = '', tamanho = 'cartao') {
  const arte = artFor(prod);
  const src = prod.imagem || arte;
  const lazy = tamanho === 'cartao' ? 'loading="lazy" decoding="async"' : 'decoding="async"';
  const foto = prod.imagem ? ' is-foto' : '';
  return `<img class="${classe}${foto}" src="${esc(src)}" alt="${esc(prod.nome)}" ${lazy} data-fallback="${esc(arte)}">`;
}

// Reserva global: qualquer <img data-fallback> que falhar troca para a ilustração
export function instalarReservaDeImagens() {
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.dataset.fallback && img.src !== img.dataset.fallback) {
      img.classList.remove('is-foto');
      img.src = img.dataset.fallback;
    }
  }, true);
}

export function atualizarContador(qtd, animar = false) {
  const b = document.getElementById('cart-count');
  const link = document.getElementById('cart-link');
  if (!b || !link) return;
  b.textContent = qtd;
  b.hidden = qtd === 0;
  link.setAttribute('aria-label', qtd ? `Carrinho, ${qtd} ${qtd === 1 ? 'item' : 'itens'}` : 'Carrinho vazio');
  if (animar) {
    link.classList.remove('is-bump');
    void link.offsetWidth;
    link.classList.add('is-bump');
  }
}
