// Consentimento para cookies/medição (LGPD, art. 7º, I e art. 8º). O site não usa cookies nem ferramentas
// de rastreamento por padrão: CONFIG.analytics.id vazio = nada aparece e nada é carregado. Só com um ID de
// Google Analytics (G-...) o site pergunta, e só mede se a pessoa aceitar. Recusar vale tanto quanto aceitar
// (botões com o mesmo destaque), a escolha fica no aparelho e pode ser mudada pelo rodapé, e o botão
// "Apagar meus dados" da política de privacidade também a apaga.

import { CONFIG } from './config.js';
import { CHAVES, salvo, el } from './utils.js';

const ID_OK = /^G-[A-Z0-9]{6,12}$/;
const id = () => (ID_OK.test(CONFIG.analytics?.id || '') ? CONFIG.analytics.id : '');

export const medicaoLigada = () => Boolean(id());
export const escolha = () => salvo.ler(CHAVES.consentimento, null)?.medicao ?? null;   // true | false | null (não respondeu)

let carregado = false;
function carregarMedicao() {
  if (carregado || !id()) return;
  carregado = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  // sem anúncios, sem personalização, IP anonimizado; page_view manual a cada troca de #rota
  window.gtag('config', id(), { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false, send_page_view: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id())}`;
  document.head.append(s);
  window.addEventListener('hashchange', registrarVisita);
  registrarVisita();
}

// só a rota (#cardapio, #carrinho...), nunca o que vem depois do "?" (código e token do pedido)
export function registrarVisita() {
  if (!carregado || typeof window.gtag !== 'function') return;
  const rota = (location.hash.replace(/^#\/?/, '').split('?')[0] || 'inicio');
  window.gtag('event', 'page_view', { page_title: document.title, page_location: `${location.origin}${location.pathname}#${rota}` });
}

function gravar(medicao) {
  salvo.gravar(CHAVES.consentimento, { medicao, em: new Date().toISOString() });
  if (medicao) carregarMedicao();
  else if (carregado) location.reload();   // quem tira o consentimento para de ser medido já
}

function mostrarBanner() {
  document.getElementById('cookies-banner')?.remove();
  const b = el(`<section class="cookies" id="cookies-banner" role="dialog" aria-modal="false" aria-labelledby="ck-t">
    <h2 id="ck-t">Medição de visitas</h2>
    <p>Usamos o Google Analytics para contar visitas e ver quais telas são mais usadas, sem anúncios. Só medimos se você aceitar; recusar não muda nada no site. Detalhes na <a href="#privacidade">política de privacidade</a>.</p>
    <div class="cookies-botoes">
      <button type="button" class="btn btn-sec" data-ck="nao">Recusar</button>
      <button type="button" class="btn btn-sec" data-ck="sim">Aceitar</button>
    </div>
  </section>`);
  b.addEventListener('click', (e) => {
    const bt = e.target.closest('[data-ck]');
    if (!bt) return;
    gravar(bt.dataset.ck === 'sim');
    b.remove();
    document.querySelector('[data-cookies]')?.focus();
  });
  document.body.append(b);
  b.querySelector('button').focus({ preventScroll: true });
}

export function iniciarConsentimento() {
  const abrir = document.querySelector('[data-cookies]');
  if (!medicaoLigada()) return;   // nada a perguntar: o rodapé continua sem o botão
  if (abrir) {
    abrir.hidden = false;
    abrir.addEventListener('click', mostrarBanner);
  }
  const e = escolha();
  if (e === true) carregarMedicao();
  else if (e === null) mostrarBanner();
}
