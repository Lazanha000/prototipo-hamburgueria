// ============================================================
// PAINEL DO RESTAURANTE (admin.html)
//
// Login da equipe (Supabase Auth, e-mail e senha) e, depois de entrar:
//   * pedidos chegando em tempo real, com som e destaque para os novos;
//   * mudar o andamento (status) e a situação do pagamento;
//   * marcar item esgotado / disponível;
//   * fechar e reabrir a loja na hora.
// Tudo é gravado no banco, com o token de quem entrou: o que cada um pode
// fazer é decidido pela RLS (supabase/schema.sql), não por este arquivo.
// Quem entra: usuários cadastrados na tabela "equipe" (supabase/LEIAME.md, passo 5).
// ============================================================

import { CONFIG } from '../js/config.js';
import { brl, esc, chaveLocal, CHAVES } from '../js/utils.js';
import { linkMapa } from '../js/mensagem.js';
import { comandaHtml } from '../js/comanda.js';
import { clienteSupabase, guardaLocal, tempoRealPedidos } from './supabase.js';
import {
  STATUS, EM_ANDAMENTO, PAGAMENTOS, proximoPasso, statusPara, dentroDoHorario, hora, haQuanto,
  telefoneTxt, linkTelefone, linkWhatsappCliente, detalhesItem, paraComanda, consultaPedidos, CONSULTAS,
} from './logica.js';

const $ = (s, raiz = document) => raiz.querySelector(s);
const main = $('#pn-conteudo');
const acoesTopo = $('#pn-acoes');
const nomeLoja = CONFIG.marca?.nome || 'Restaurante';
const TITULO = `Painel · ${nomeLoja}`;

$('[data-marca]').textContent = nomeLoja;
document.title = TITULO;

// mesmo tema escolhido no site (claro/escuro)
try {
  const t = localStorage.getItem(CHAVES.tema) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro');
  if (t === 'escuro') {
    document.documentElement.dataset.tema = 'escuro';
    $('meta[name=theme-color]').content = '#17130F';
  }
} catch { /* sem localStorage */ }

let timerToast;
function avisar(texto, tipo = 'ok') {
  const t = $('#toast');
  t.className = `toast toast--${tipo} is-on`;
  t.textContent = texto;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove('is-on'), tipo === 'erro' ? 6000 : 2600);
}

// ---------- som de pedido novo (sem arquivo: dois bipes gerados na hora) ----------
const CHAVE_SOM = chaveLocal('painel-som');
let somLigado = (() => { try { return localStorage.getItem(CHAVE_SOM) === '1'; } catch { return false; } })();
let audio = null;
function prepararAudio() {
  if (!somLigado) return;
  try {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch { /* navegador sem Web Audio */ }
}
function tocar() {
  if (!somLigado || !audio) return;
  const t0 = audio.currentTime;
  [0, 0.28].forEach((d, i) => {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = i ? 1175 : 880;
    g.gain.setValueAtTime(0.0001, t0 + d);
    g.gain.exponentialRampToValueAtTime(0.4, t0 + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.24);
    o.connect(g).connect(audio.destination);
    o.start(t0 + d);
    o.stop(t0 + d + 0.25);
  });
}
function mostrarSom() {
  const b = $('#pn-som');
  b.setAttribute('aria-pressed', String(somLigado));
  $('.pn-som-txt', b).textContent = somLigado ? 'Som ligado' : 'Som desligado';
}
$('#pn-som').addEventListener('click', () => {
  somLigado = !somLigado;
  try { localStorage.setItem(CHAVE_SOM, somLigado ? '1' : '0'); } catch { /* fica só nesta aba */ }
  prepararAudio();
  mostrarSom();
  if (somLigado) tocar();
});
// o navegador só libera o som depois de um toque na página
document.addEventListener('pointerdown', prepararAudio);
mostrarSom();

// ============================================================
// SEM BANCO (CONFIG.api vazio): só explica o que falta
// ============================================================
function telaSemBanco() {
  main.innerHTML = `<section class="pn-cartao pn-login">
    <h1>Painel do restaurante</h1>
    <p class="aviso aviso--alerta">O painel precisa do banco de pedidos ligado. Siga o passo a passo em
    <code>supabase/LEIAME.md</code> e preencha <code>api</code> em <code>js/config.js</code>.</p>
    <p><a class="link" href="./">Voltar para o site</a></p>
  </section>`;
}

const cliente = CONFIG.api?.supabaseUrl && CONFIG.api?.chavePublica ? clienteSupabase({
  url: CONFIG.api.supabaseUrl,
  chave: CONFIG.api.chavePublica,
  guarda: guardaLocal(chaveLocal('painel')),
}) : null;

// ============================================================
// ESTADO
// ============================================================
const estado = {
  pedidos: [],
  conhecidos: null,      // ids já vistos (null = primeira carga, não toca som)
  novos: new Set(),      // pedidos recebidos que ninguém mexeu ainda
  filtro: 'andamento',
  aba: 'pedidos',
  loja: null,
  horarios: [],
  categorias: [],
  produtos: [],
  conexao: 'conectando',
  ultimaCarga: 0,
  ocupado: new Set(),
};
let canal = null;
let timers = [];
let recarga = null;
let motivoSaida = '';

cliente?.aoTrocarToken((t) => {
  if (t) canal?.trocarToken(t);
  else encerrar();
});

function encerrar() {
  canal?.fechar();
  canal = null;
  timers.forEach(clearInterval);
  timers = [];
  estado.conhecidos = null;
  estado.novos.clear();
  acoesTopo.hidden = true;
  document.title = TITULO;
  telaLogin(motivoSaida || 'Sua sessão terminou. Entre de novo.');
  motivoSaida = '';
}

// ============================================================
// LOGIN
// ============================================================
function telaLogin(mensagem = '') {
  main.innerHTML = `<section class="pn-cartao pn-login">
    <h1>Painel do restaurante</h1>
    <p class="pn-dica">Entre com o e-mail e a senha que o dono cadastrou para você.</p>
    <form id="pn-form-login" novalidate>
      <div class="campo"><label for="pn-email">E-mail</label>
        <input id="pn-email" type="email" autocomplete="username" required maxlength="120" inputmode="email"></div>
      <div class="campo"><label for="pn-senha">Senha</label>
        <input id="pn-senha" type="password" autocomplete="current-password" required maxlength="120"></div>
      <p class="aviso aviso--erro pn-login-erro" id="pn-login-erro" role="alert" ${mensagem ? '' : 'hidden'}>${esc(mensagem)}</p>
      <button class="btn btn-primario btn-largo" type="submit"><span class="btn-txt">Entrar</span></button>
    </form>
  </section>`;
  const form = $('#pn-form-login');
  const erro = $('#pn-login-erro');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = $('#pn-email').value.trim();
    const senha = $('#pn-senha').value;
    const falhar = (m) => { erro.textContent = m; erro.hidden = false; };
    if (!email || !senha) { falhar('Preencha e-mail e senha.'); return; }
    const botao = $('button[type=submit]', form);
    botao.disabled = true;
    botao.classList.add('is-carregando');
    erro.hidden = true;
    prepararAudio();
    try {
      await cliente.entrar(email, senha);
      await iniciarPainel();
    } catch (e) {
      if (!document.body.contains(form)) return;   // já trocou de tela (ex.: sem acesso)
      falhar(e.message || 'Não deu para entrar agora.');
      botao.disabled = false;
      botao.classList.remove('is-carregando');
    }
  });
  $('#pn-email').focus();
}

// ============================================================
// PAINEL
// ============================================================
async function iniciarPainel() {
  const uid = cliente.usuario()?.id;
  let equipe;
  try {
    equipe = await cliente.rest(CONSULTAS.equipe(uid));
  } catch (e) {
    if (e.status === 401) return;   // sessão caiu: encerrar() já mostrou o login
    main.innerHTML = `<section class="pn-cartao pn-login"><h1>Painel do restaurante</h1>
      <p class="aviso aviso--erro" role="alert">${esc(e.message)}</p>
      <button class="btn btn-primario btn-largo" type="button" data-tentar>Tentar de novo</button></section>`;
    $('[data-tentar]').addEventListener('click', iniciarPainel);
    return;
  }
  if (!Array.isArray(equipe) || !equipe.length) {
    motivoSaida = 'Este usuário não tem acesso ao painel. Peça ao dono para incluir você na equipe.';
    await cliente.sair();
    return;
  }

  acoesTopo.hidden = false;
  main.innerHTML = `
    <section class="pn-loja" id="pn-loja" aria-label="Situação da loja"><p class="pn-dica">Carregando a loja…</p></section>
    <div class="pn-abas" role="tablist" aria-label="Seções do painel">
      <button type="button" role="tab" id="tab-pedidos" aria-controls="pn-aba-pedidos" aria-selected="true" data-aba="pedidos">Pedidos <span class="pn-cont" id="pn-cont" hidden></span></button>
      <button type="button" role="tab" id="tab-cardapio" aria-controls="pn-aba-cardapio" aria-selected="false" data-aba="cardapio" tabindex="-1">Cardápio</button>
    </div>
    <section id="pn-aba-pedidos" role="tabpanel" aria-labelledby="tab-pedidos">
      <div class="pn-filtros">
        <button type="button" class="chip chip--peq" data-filtro="andamento" aria-pressed="true">Em andamento</button>
        <button type="button" class="chip chip--peq" data-filtro="concluidos" aria-pressed="false">Concluídos e cancelados (24 h)</button>
      </div>
      <p class="aviso aviso--erro" id="pn-erro" role="alert" hidden></p>
      <div class="pn-lista" id="pn-lista"><p class="pn-dica">Carregando pedidos…</p></div>
    </section>
    <section id="pn-aba-cardapio" role="tabpanel" aria-labelledby="tab-cardapio" hidden>
      <p class="pn-dica">Esgotado: o produto continua aparecendo no site, mas ninguém consegue pedir. Volta a vender quando você marcar disponível.</p>
      <div id="pn-cardapio"><p class="pn-dica">Carregando cardápio…</p></div>
    </section>`;

  await Promise.all([carregarPedidos(), carregarLoja(), carregarCardapio()]);
  if (!cliente.usuario()) return;

  canal = tempoRealPedidos({
    url: CONFIG.api.supabaseUrl,
    chave: CONFIG.api.chavePublica,
    token: () => cliente.token(),
    aoMudar: () => {
      clearTimeout(recarga);
      recarga = setTimeout(carregarPedidos, 250);
    },
    aoEstado: (s) => {
      // voltou a conexão: busca o que mudou enquanto estava fora
      if (s === 'ao-vivo' && estado.conexao !== 'ao-vivo' && estado.ultimaCarga) carregarPedidos();
      estado.conexao = s;
      mostrarConexao();
    },
  });

  timers.push(setInterval(() => {
    // sem tempo real: confere a cada 15 s. Com tempo real: a cada 2 min, por garantia.
    const espera = estado.conexao === 'ao-vivo' ? 120_000 : 15_000;
    if (Date.now() - estado.ultimaCarga >= espera) carregarPedidos();
  }, 5000));
  timers.push(setInterval(() => {
    document.querySelectorAll('[data-ha]').forEach((n) => { n.textContent = haQuanto(n.dataset.ha); });
    mostrarLoja();   // o horário pode virar (abre/fecha sozinha)
  }, 30_000));
}

function mostrarConexao() {
  const n = $('#pn-conexao');
  n.dataset.estado = estado.conexao;
  n.textContent = estado.conexao === 'ao-vivo' ? 'Ao vivo'
    : estado.conexao === 'conectando' ? 'Conectando…' : 'Sem tempo real: atualizando a cada 15 s';
}

function mostrarErro(msg) {
  const n = $('#pn-erro');
  if (!n) return;
  n.textContent = msg ? `Não deu para atualizar os pedidos: ${msg}` : '';
  n.hidden = !msg;
}

let carregando = null;
async function carregarPedidos() {
  if (carregando) return carregando;
  carregando = (async () => {
    try {
      const lista = await cliente.rest(consultaPedidos());
      estado.ultimaCarga = Date.now();
      receberPedidos(Array.isArray(lista) ? lista : []);
      mostrarErro('');
    } catch (e) {
      estado.ultimaCarga = Date.now();
      if (e.status !== 401) mostrarErro(e.message);
    } finally {
      carregando = null;
    }
  })();
  return carregando;
}

function receberPedidos(lista) {
  const primeira = estado.conhecidos === null;
  const conhecidos = estado.conhecidos || new Set();
  const chegaram = lista.filter((p) => !conhecidos.has(p.id) && p.status === 'recebido');
  lista.forEach((p) => conhecidos.add(p.id));
  estado.conhecidos = conhecidos;
  estado.pedidos = lista;
  if (!primeira && chegaram.length) {
    chegaram.forEach((p) => estado.novos.add(p.id));
    tocar();
    avisar(chegaram.length === 1 ? `Pedido novo: ${chegaram[0].codigo}` : `${chegaram.length} pedidos novos`);
  }
  // "novo" some quando alguém mexe no pedido
  for (const id of estado.novos) {
    const p = lista.find((x) => x.id === id);
    if (!p || p.status !== 'recebido') estado.novos.delete(id);
  }
  document.title = estado.novos.size ? `(${estado.novos.size}) Pedido novo! · ${nomeLoja}` : TITULO;
  mostrarPedidos();
}

// ---------- lista de pedidos ----------
function mostrarPedidos() {
  const alvo = $('#pn-lista');
  if (!alvo) return;
  const andamento = estado.pedidos.filter((p) => EM_ANDAMENTO.includes(p.status))
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));   // fila da cozinha: mais antigo primeiro
  const concluidos = estado.pedidos.filter((p) => !EM_ANDAMENTO.includes(p.status));
  const cont = $('#pn-cont');
  cont.textContent = andamento.length;
  cont.hidden = !andamento.length;
  const lista = estado.filtro === 'andamento' ? andamento : concluidos;

  // guarda o foco (o cartão é redesenhado a cada mudança)
  const ativo = document.activeElement;
  const foco = ativo?.closest?.('.pn-pedido') && ativo.dataset.foco ? `${ativo.closest('.pn-pedido').dataset.id}|${ativo.dataset.foco}` : null;

  alvo.innerHTML = lista.length ? lista.map(cartaoPedido).join('')
    : `<p class="pn-vazio">${estado.filtro === 'andamento' ? 'Nenhum pedido em andamento. Os novos aparecem aqui sozinhos.' : 'Nenhum pedido concluído nas últimas 24 horas.'}</p>`;

  if (foco) {
    const [id, f] = foco.split('|');
    alvo.querySelector(`.pn-pedido[data-id="${CSS.escape(id)}"] [data-foco="${CSS.escape(f)}"]`)?.focus();
  }
}

function cartaoPedido(p) {
  const fuso = estado.loja?.fuso || CONFIG.horario?.fuso || 'America/Sao_Paulo';
  const e = p.entrega;
  const prox = proximoPasso(p);
  const ocupado = estado.ocupado.has(p.id);
  const dis = ocupado ? ' disabled' : '';
  const pago = p.pagamento_status === 'confirmado';
  const forma = PAGAMENTOS[p.pagamento_forma] || p.pagamento_forma;
  const destino = p.modo === 'entrega' && e
    ? `<p>${esc(e.endereco)}, ${esc(e.numero)}${e.complemento ? ` · ${esc(e.complemento)}` : ''}<br>${esc(e.bairro)}, ${esc(e.cidade)}${e.cep ? ` · CEP ${esc(e.cep)}` : ''}</p>
       <p><a class="link" href="${esc(linkMapa(e))}" target="_blank" rel="noopener noreferrer">Abrir no mapa</a></p>`
    : '<p><b>Retirada no balcão</b></p>';
  const itens = (p.pedido_itens || []).map((i) => `<li>
      <span class="pn-qtd">${i.qtd}x</span>
      <span class="pn-item"><b>${esc(i.nome)}</b>${detalhesItem(i).map((d) => `<small>${esc(d)}</small>`).join('')}${i.obs ? `<small class="pn-obs">Obs.: ${esc(i.obs)}</small>` : ''}</span>
      <span class="pn-preco">${brl(i.preco_unitario * i.qtd)}</span>
    </li>`).join('');
  const troco = p.pagamento_forma === 'dinheiro' && p.troco_para
    ? `<br>Troco para ${brl(p.troco_para)}: levar <b>${brl(p.troco_para - p.total)}</b>` : '';
  const opcoes = statusPara(p.modo).map((s) => `<option value="${s}"${s === p.status ? ' selected' : ''}>${STATUS[s]}</option>`).join('');

  return `<article class="pn-pedido is-${p.status}${estado.novos.has(p.id) ? ' is-novo' : ''}" data-id="${p.id}" aria-label="Pedido ${esc(p.codigo)}">
    <header class="pn-ped-topo">
      <p class="pn-ped-cod">${esc(p.codigo)}</p>
      <p class="pn-ped-hora">${esc(hora(p.criado_em, fuso))} · <span data-ha="${esc(p.criado_em)}">${esc(haQuanto(p.criado_em))}</span></p>
      <p class="pn-etiquetas">
        ${estado.novos.has(p.id) ? '<span class="pn-tag pn-tag--novo">Novo</span>' : ''}
        <span class="pn-tag">${p.modo === 'retirada' ? 'Retirada' : 'Entrega'}</span>
        <span class="pn-tag pn-tag--${p.status}">${STATUS[p.status] || esc(p.status)}</span>
      </p>
    </header>
    <div class="pn-ped-cliente">
      <p><b>${esc(p.cliente_nome)}</b></p>
      <p><a class="link" href="${esc(linkTelefone(p.cliente_telefone))}">${esc(telefoneTxt(p.cliente_telefone))}</a>
        · <a class="link" href="${esc(linkWhatsappCliente(p.cliente_telefone))}" target="_blank" rel="noopener noreferrer">WhatsApp</a></p>
      ${destino}
    </div>
    <ul class="pn-itens">${itens}</ul>
    ${p.obs ? `<p class="pn-ped-obs">Obs. do pedido: ${esc(p.obs)}</p>` : ''}
    <dl class="pn-totais">
      <div><dt>Subtotal</dt><dd>${brl(p.subtotal)}</dd></div>
      ${p.modo === 'entrega' ? `<div><dt>Entrega</dt><dd>${p.taxa ? brl(p.taxa) : 'grátis'}</dd></div>` : ''}
      ${p.desconto ? `<div><dt>Desconto</dt><dd>−${brl(p.desconto)}</dd></div>` : ''}
      <div class="pn-total"><dt>Total</dt><dd>${brl(p.total)}</dd></div>
    </dl>
    <p class="pn-pag">${esc(forma)} · <span class="pn-tag pn-pag--${pago ? 'ok' : p.pagamento_status === 'cancelado' ? 'cancelado' : 'pendente'}">${pago ? 'Pago' : p.pagamento_status === 'cancelado' ? 'Pagamento cancelado' : 'Pagamento pendente'}</span>${troco}</p>
    <div class="pn-ped-acoes">
      ${prox ? `<button type="button" class="btn btn-primario" data-status="${prox.status}" data-foco="avancar"${dis}>${prox.rotulo}</button>` : ''}
      <button type="button" class="btn btn-sec" data-pagamento="${pago ? 'pendente' : 'confirmado'}" data-foco="pagamento"${dis}>${pago ? 'Desfazer pagamento' : 'Confirmar pagamento'}</button>
      <label class="pn-mudar"><span>Status</span>
        <select data-mudar data-foco="mudar" aria-label="Mudar status do pedido ${esc(p.codigo)}"${dis}>${opcoes}</select></label>
      <button type="button" class="link" data-imprimir data-foco="imprimir">Imprimir comanda</button>
    </div>
  </article>`;
}

async function mudarPedido(id, campos) {
  const p = estado.pedidos.find((x) => x.id === id);
  if (!p || estado.ocupado.has(id)) return;
  estado.ocupado.add(id);
  estado.novos.delete(id);
  mostrarPedidos();
  try {
    const r = await cliente.rest(`pedidos?id=eq.${id}`, { method: 'PATCH', body: campos, headers: { Prefer: 'return=representation' } });
    if (!Array.isArray(r) || r.length !== 1) throw new Error('Sem permissão para mudar este pedido.');
    Object.assign(p, campos, { status: r[0].status, pagamento_status: r[0].pagamento_status });
    avisar(`${p.codigo}: ${'status' in campos ? STATUS[p.status] : p.pagamento_status === 'confirmado' ? 'pagamento confirmado' : 'pagamento pendente'}`);
  } catch (e) {
    if (e.status !== 401) avisar(e.message || 'Não deu para salvar.', 'erro');
  } finally {
    estado.ocupado.delete(id);
    document.title = estado.novos.size ? `(${estado.novos.size}) Pedido novo! · ${nomeLoja}` : TITULO;
    mostrarPedidos();
  }
}

// ---------- loja aberta / fechada ----------
async function carregarLoja() {
  try {
    const [loja, horarios] = await Promise.all([cliente.rest(CONSULTAS.loja), cliente.rest(CONSULTAS.horarios)]);
    estado.loja = Array.isArray(loja) ? loja[0] || null : null;
    estado.horarios = Array.isArray(horarios) ? horarios : [];
  } catch (e) {
    if (e.status === 401) return;
    const n = $('#pn-loja');
    if (n) n.innerHTML = `<p class="aviso aviso--erro">Não deu para ler a situação da loja: ${esc(e.message)}</p>`;
    return;
  }
  mostrarLoja();
}

function mostrarLoja() {
  const n = $('#pn-loja');
  const l = estado.loja;
  if (!n || !l) return;
  const noHorario = dentroDoHorario(estado.horarios, l.fuso);
  let titulo;
  let detalhe;
  if (!l.aberta_manual) {
    titulo = 'Loja fechada agora';
    detalhe = 'Você fechou pelo painel. Ninguém consegue pedir pelo site até reabrir.';
  } else if (noHorario) {
    titulo = 'Loja aberta';
    detalhe = 'Recebendo pedidos pelo site.';
  } else {
    titulo = 'Fora do horário';
    detalhe = l.bloquear_fechado ? 'O site não aceita pedidos agora. Abre sozinha no horário de funcionamento.'
      : 'Fora do horário, mas o site está aceitando pedidos (bloquear_fechado desligado).';
  }
  const aberta = l.aberta_manual && (noHorario || !l.bloquear_fechado);
  n.className = `pn-loja ${aberta ? 'is-aberta' : 'is-fechada'}`;
  n.innerHTML = `<p class="pn-loja-txt"><b>${titulo}</b><span>${detalhe}</span></p>
    <button type="button" class="btn ${l.aberta_manual ? 'btn-sec' : 'btn-primario'}" data-loja="${l.aberta_manual ? 'fechar' : 'abrir'}">
      ${l.aberta_manual ? 'Fechar agora' : 'Reabrir a loja'}</button>`;
}

async function mudarLoja(abrir) {
  if (!abrir && !confirm('Fechar a loja agora? O site para de aceitar pedidos até você reabrir.')) return;
  const b = $('[data-loja]');
  if (b) b.disabled = true;
  try {
    const r = await cliente.rest('loja?id=eq.1', { method: 'PATCH', body: { aberta_manual: abrir }, headers: { Prefer: 'return=representation' } });
    if (!Array.isArray(r) || r.length !== 1) throw new Error('Sem permissão para abrir ou fechar a loja.');
    estado.loja = { ...estado.loja, aberta_manual: r[0].aberta_manual };
    avisar(abrir ? 'Loja reaberta.' : 'Loja fechada: o site não aceita pedidos.');
  } catch (e) {
    if (e.status !== 401) avisar(e.message || 'Não deu para salvar.', 'erro');
  }
  mostrarLoja();
}

// ---------- cardápio: esgotado / disponível ----------
async function carregarCardapio() {
  try {
    const [cats, prods] = await Promise.all([cliente.rest(CONSULTAS.categorias), cliente.rest(CONSULTAS.produtos)]);
    estado.categorias = Array.isArray(cats) ? cats : [];
    estado.produtos = Array.isArray(prods) ? prods : [];
  } catch (e) {
    if (e.status === 401) return;
    const n = $('#pn-cardapio');
    if (n) n.innerHTML = `<p class="aviso aviso--erro">Não deu para ler o cardápio: ${esc(e.message)}</p>`;
    return;
  }
  mostrarCardapio();
}

function mostrarCardapio() {
  const n = $('#pn-cardapio');
  if (!n) return;
  const blocos = estado.categorias.map((c) => {
    const prods = estado.produtos.filter((p) => p.categoria_id === c.id);
    if (!prods.length) return '';
    return `<section class="pn-cat"><h2>${esc(c.nome)}</h2><ul>${prods.map((p) => `
      <li class="pn-prod${p.disponivel ? '' : ' is-esgotado'}${p.ativo ? '' : ' is-oculto'}">
        <span class="pn-prod-nome">${esc(p.nome)}${p.ativo ? '' : ' <small>(fora do cardápio)</small>'}</span>
        <button type="button" class="pn-chave" role="switch" aria-checked="${p.disponivel}" data-produto="${esc(p.id)}"
          aria-label="${esc(p.nome)}: ${p.disponivel ? 'disponível' : 'esgotado'}"${estado.ocupado.has(`p:${p.id}`) ? ' disabled' : ''}>
          <span class="pn-chave-txt">${p.disponivel ? 'Disponível' : 'Esgotado'}</span></button>
      </li>`).join('')}</ul></section>`;
  }).join('');
  n.innerHTML = blocos || '<p class="pn-vazio">Nenhum produto no banco.</p>';
}

async function mudarProduto(id) {
  const p = estado.produtos.find((x) => x.id === id);
  const chave = `p:${id}`;
  if (!p || estado.ocupado.has(chave)) return;
  estado.ocupado.add(chave);
  mostrarCardapio();
  try {
    const r = await cliente.rest(`produtos?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { disponivel: !p.disponivel }, headers: { Prefer: 'return=representation' } });
    if (!Array.isArray(r) || r.length !== 1) throw new Error('Sem permissão para mudar o cardápio.');
    p.disponivel = r[0].disponivel;
    avisar(`${p.nome}: ${p.disponivel ? 'disponível' : 'esgotado'}`);
  } catch (e) {
    if (e.status !== 401) avisar(e.message || 'Não deu para salvar.', 'erro');
  } finally {
    estado.ocupado.delete(chave);
    mostrarCardapio();
    $(`[data-produto="${CSS.escape(id)}"]`)?.focus();
  }
}

// ---------- abas e filtros ----------
function trocarAba(aba) {
  estado.aba = aba;
  document.querySelectorAll('[data-aba]').forEach((b) => {
    const sel = b.dataset.aba === aba;
    b.setAttribute('aria-selected', String(sel));
    b.tabIndex = sel ? 0 : -1;
  });
  $('#pn-aba-pedidos').hidden = aba !== 'pedidos';
  $('#pn-aba-cardapio').hidden = aba !== 'cardapio';
  if (aba === 'cardapio') carregarCardapio();
}

// ---------- cliques (um ouvinte só para tudo) ----------
main.addEventListener('click', (ev) => {
  const alvo = ev.target.closest('button, a');
  if (!alvo) return;
  const cartao = alvo.closest('.pn-pedido');
  const id = cartao ? Number(cartao.dataset.id) : null;
  if (alvo.dataset.aba) trocarAba(alvo.dataset.aba);
  else if (alvo.dataset.filtro) {
    estado.filtro = alvo.dataset.filtro;
    document.querySelectorAll('[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String(b === alvo)));
    mostrarPedidos();
  } else if (alvo.dataset.status && id) mudarPedido(id, { status: alvo.dataset.status });
  else if (alvo.dataset.pagamento && id) mudarPedido(id, { pagamento_status: alvo.dataset.pagamento });
  else if (alvo.dataset.loja) mudarLoja(alvo.dataset.loja === 'abrir');
  else if (alvo.dataset.produto) mudarProduto(alvo.dataset.produto);
  else if (alvo.hasAttribute('data-imprimir') && id) {
    const p = estado.pedidos.find((x) => x.id === id);
    if (!p) return;
    const area = $('#area-impressao');
    area.innerHTML = comandaHtml(paraComanda(p), { fuso: estado.loja?.fuso || CONFIG.horario.fuso, marca: nomeLoja });
    window.addEventListener('afterprint', () => { area.innerHTML = ''; }, { once: true });
    window.print();
  }
});

main.addEventListener('change', (ev) => {
  const sel = ev.target.closest('[data-mudar]');
  if (!sel) return;
  const id = Number(sel.closest('.pn-pedido').dataset.id);
  const p = estado.pedidos.find((x) => x.id === id);
  if (!p || sel.value === p.status) return;
  if (sel.value === 'cancelado' && !confirm(`Cancelar o pedido ${p.codigo}? Avise o cliente pelo WhatsApp.`)) {
    sel.value = p.status;
    return;
  }
  mudarPedido(id, { status: sel.value });
});

// setas do teclado nas abas (padrão de acessibilidade de tablist)
main.addEventListener('keydown', (ev) => {
  const tab = ev.target.closest('[role=tab]');
  if (!tab || !['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
  const outra = tab.dataset.aba === 'pedidos' ? 'cardapio' : 'pedidos';
  trocarAba(outra);
  $(`[data-aba="${outra}"]`).focus();
});

$('#pn-sair').addEventListener('click', () => {
  motivoSaida = 'Você saiu do painel.';
  cliente.sair();
});

// voltou para a aba (tablet acordou): atualiza na hora
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && cliente?.usuario() && !acoesTopo.hidden) {
    carregarPedidos();
    carregarLoja();
  }
});

// ============================================================
// INÍCIO
// ============================================================
if (!cliente) telaSemBanco();
else if (cliente.usuario()) iniciarPainel();
else telaLogin();
