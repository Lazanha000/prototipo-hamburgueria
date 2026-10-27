// Acompanhamento do pedido. Também mostra a confirmação logo
// depois de finalizar. Na demonstração, só encontra pedidos feitos
// neste navegador e confere o telefone usado no pedido.

import { ETAPAS, consultarPedido, pedidosNesteAparelho, modoDemo } from '../services/api.js';
import { brl, esc, el } from '../utils.js';
import { whatsappAtivo, linkWhatsapp } from '../whatsapp.js';
import { CONFIG } from '../config.js';
import { textoPedido } from '../mensagem.js';
import { brCode, qrSvg, pixConfigurado } from '../pix.js';
import { avisar } from '../ui.js';
import { comandaHtml } from '../comanda.js';

// sem backend e fora da demonstração: o site não sabe o andamento; quem confirma é o restaurante
const semAcompanhamento = () => modoDemo() && !CONFIG.modoDemonstracao;

const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const pixAtivo = (p) => p.pagamento?.forma === 'pix' && pixConfigurado(CONFIG.pix);
const textoWhatsapp = (p) => textoPedido(p, { fuso: CONFIG.horario.fuso, marca: CONFIG.marca.nome, pix: pixAtivo(p) });

export const linkPedidoWhatsapp = (p) => linkWhatsapp(textoWhatsapp(p));

// QR + copia e cola do Pix com o valor do pedido
function blocoPix(p) {
  const codigo = brCode({ ...CONFIG.pix, centavos: p.totais.total, txid: p.codigo });
  return `<section class="pix" aria-labelledby="pix-h">
    <h2 id="pix-h" class="secao-titulo">Pague com Pix · ${brl(p.totais.total)}</h2>
    <div class="pix-qr">${qrSvg(codigo)}</div>
    <p class="campo-dica">Abra o app do seu banco, escolha Pix e leia o QR Code. Ou use o copia e cola:</p>
    <textarea class="pix-codigo" id="pix-txt" readonly rows="4" aria-label="Pix copia e cola">${esc(codigo)}</textarea>
    <button type="button" class="btn btn-sec" data-copiar-pix>Copiar código Pix</button>
    <p class="campo-dica">Para: ${esc(CONFIG.pix.nome)}. Depois de pagar, envie o pedido pelo WhatsApp.</p>
  </section>`;
}

function cartaoStatus(p) {
  const idx = ETAPAS.findIndex((e) => e.id === p.status);
  return `<article class="status" aria-labelledby="st-h">
    <header class="status-cab">
      <div><p class="olho">Pedido</p><h2 id="st-h" class="status-codigo">${esc(p.codigo)}</h2></div>
      <p class="status-hora">Feito às ${hora(p.criadoEm)}</p>
    </header>
    ${p.demonstracao ? '<p class="selo-demo">Status simulado para demonstração</p>' : ''}
    ${semAcompanhamento() ? '<p class="aviso">O restaurante confirma o pedido e o prazo pelo WhatsApp. Este site não acompanha o preparo.</p>' : `<ol class="etapas">
      ${ETAPAS.map((e, i) => `<li class="etapa ${i < idx ? 'is-feita' : i === idx ? 'is-atual' : ''}" ${i === idx ? 'aria-current="step"' : ''}>
        <span class="etapa-ponto" aria-hidden="true"></span><span class="etapa-nome">${esc(e.nome)}</span>
        ${i === idx ? '<span class="etapa-agora">agora</span>' : ''}
      </li>`).join('')}
    </ol>`}
    <details class="status-itens">
      <summary>${p.itens.reduce((s, i) => s + i.qtd, 0)} itens · ${brl(p.totais.total)}</summary>
      <ul class="cm-itens">${p.itens.map((i) => `<li><span class="cm-q">${i.qtd}×</span><span class="cm-n">${esc(i.nome)}${i.escolhas.length ? `<small>${esc(i.escolhas.join(' · '))}</small>` : ''}</span><span class="cm-v">${brl(i.precoUnitario * i.qtd)}</span></li>`).join('')}</ul>
      <p class="status-pag">Pagamento ${p.recebimento?.modo === 'retirada' ? 'na retirada' : 'na entrega'}: ${esc(p.pagamento.nome)}${p.pagamento.trocoPara ? ` · troco para ${brl(p.pagamento.trocoPara)}` : ''}</p>
    </details>
    <div class="status-acoes">
      ${semAcompanhamento() ? '' : '<button type="button" class="btn btn-sec" data-atualizar>Atualizar status</button>'}
      <button type="button" class="btn btn-sec" data-imprimir>Imprimir comanda</button>
    </div>
  </article>`;
}

export function paginaPedido(main, estado) {
  const sec = el('<section class="pagina pagina-pedido" aria-labelledby="pg-h"><div class="wrap wrap--estreito"></div></section>');
  main.append(sec);
  const wrap = sec.firstElementChild;
  const recem = estado?.recem || null;
  let consulta = recem ? { codigo: recem.codigo, telefone: recem.cliente.telefone } : null;

  const confirmacao = recem ? `
    <div class="confirmacao">
      <p class="olho">Tudo certo</p>
      <h1 id="pg-h" tabindex="-1">${recem.demonstracao ? 'Pedido de demonstração registrado' : semAcompanhamento() ? 'Falta só enviar pelo WhatsApp' : 'Pedido enviado'}</h1>
      ${recem.demonstracao ? '<p class="aviso aviso--demo"><strong>Nenhum restaurante recebeu este pedido</strong> e nada foi cobrado. Para receber pedidos de verdade, o site precisa ser ligado a um sistema de pedidos.</p>' : ''}
      <div class="codigo-box">
        <p>Código do pedido</p>
        <strong class="codigo" id="codigo-txt">${esc(recem.codigo)}</strong>
        <button type="button" class="link" data-copiar>Copiar código</button>
      </div>
      <p class="confirmacao-dica">Guarde o código. Para consultar, use o código e o telefone ${esc(recem.cliente.telefone)}.</p>
      ${pixAtivo(recem) ? blocoPix(recem) : ''}
      ${whatsappAtivo()
        ? `<a class="btn btn-zap" href="${esc(linkWhatsapp(textoWhatsapp(recem)))}" target="_blank" rel="noopener">Enviar pedido pelo WhatsApp</a>`
        : `<div class="zap-off"><button type="button" class="btn btn-zap" disabled>Enviar pedido pelo WhatsApp</button><p class="campo-dica">Disponível quando o número do restaurante for configurado.</p></div>`}
    </div>` : '';

  const recentes = pedidosNesteAparelho().slice(0, 4);
  wrap.innerHTML = `
    ${confirmacao}
    <div class="acompanhar">
      ${recem ? '<h2 class="secao-titulo">Acompanhar</h2>' : '<header class="pagina-cab"><p class="olho">Seu pedido</p><h1 id="pg-h" tabindex="-1">Acompanhar pedido</h1></header>'}
      <div class="status-host" aria-live="polite"></div>
      ${recem ? '<button type="button" class="link link--outro" data-outro>Consultar outro pedido</button>' : ''}
      <form class="form-consulta" novalidate ${recem ? 'hidden' : ''}>
        ${modoDemo() ? '<p class="campo-dica">Só é possível consultar pedidos feitos neste navegador.</p>' : ''}
        <div class="linha-campos">
          <div class="campo" data-campo="codigo">
            <label for="f-codigo">Código do pedido</label>
            <input id="f-codigo" name="codigo" autocomplete="off" autocapitalize="characters" placeholder="EB-XXXXX" aria-describedby="e-codigo">
            <p class="campo-erro" id="e-codigo"></p>
          </div>
          <div class="campo" data-campo="telefone">
            <label for="f-tel">Telefone usado no pedido</label>
            <input id="f-tel" name="telefone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(11) 98765-4321" aria-describedby="e-telefone">
            <p class="campo-erro" id="e-telefone"></p>
          </div>
        </div>
        ${recentes.length ? `<p class="recentes">Pedidos deste aparelho: ${recentes.map((r) => `<button type="button" class="chip chip--peq" data-cod="${esc(r.codigo)}">${esc(r.codigo)}</button>`).join(' ')}</p>` : ''}
        <button type="submit" class="btn btn-primario">Consultar</button>
      </form>
    </div>`;

  let ultimo = null; // pedido mostrado agora, para a comanda
  const host = wrap.querySelector('.status-host');
  const form = wrap.querySelector('.form-consulta');

  async function buscar(cod, tel, { silencioso = false } = {}) {
    if (!silencioso) host.innerHTML = '<div class="status status--carregando"><span class="esqueleto"></span><span class="esqueleto"></span><span class="esqueleto"></span></div>';
    try {
      const r = await consultarPedido(cod, tel);
      if (r.erro === 'nao-encontrado') {
        host.innerHTML = `<p class="aviso aviso--erro">Não encontramos o pedido ${esc(cod.toUpperCase())}. ${modoDemo() ? 'Só aparecem pedidos feitos neste navegador.' : 'Confira o código.'}</p>`;
        return;
      }
      if (r.erro === 'telefone') {
        host.innerHTML = '<p class="aviso aviso--erro">O telefone não confere com o usado neste pedido.</p>';
        return;
      }
      consulta = { codigo: cod, telefone: tel };
      ultimo = r.pedido;
      host.innerHTML = cartaoStatus(r.pedido);
    } catch (err) {
      host.innerHTML = `<p class="aviso aviso--erro">${esc(err.message)}</p>`;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const cod = form.querySelector('#f-codigo').value.trim();
    const tel = form.querySelector('#f-tel').value.trim();
    const erros = {
      codigo: /^EB-[A-Z0-9]{5}$/i.test(cod) ? '' : 'O código tem o formato EB-XXXXX.',
      telefone: tel.replace(/\D/g, '').length >= 10 ? '' : 'Digite o telefone com DDD.',
    };
    for (const [k, msg] of Object.entries(erros)) {
      form.querySelector(`#e-${k}`).textContent = msg;
      form.querySelector(`[data-campo="${k}"]`).classList.toggle('tem-erro', Boolean(msg));
      form.querySelector(k === 'codigo' ? '#f-codigo' : '#f-tel').setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    if (erros.codigo || erros.telefone) {
      form.querySelector(erros.codigo ? '#f-codigo' : '#f-tel').focus();
      return;
    }
    buscar(cod, tel);
  });

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-outro]')) {
      form.hidden = false;
      e.target.closest('[data-outro]').remove();
      form.querySelector('#f-codigo').focus();
      return;
    }
    const chip = e.target.closest('[data-cod]');
    if (chip) {
      form.querySelector('#f-codigo').value = chip.dataset.cod;
      form.querySelector('#f-tel').focus();
      return;
    }
    if (e.target.closest('[data-atualizar]') && consulta) {
      buscar(consulta.codigo, consulta.telefone, { silencioso: true }).then(() => avisar('Status atualizado'));
      return;
    }
    if (e.target.closest('[data-imprimir]') && ultimo) {
      // a comanda vai para #area-impressao; o CSS de impressão esconde o resto da página
      const area = document.getElementById('area-impressao');
      area.innerHTML = comandaHtml(ultimo, { fuso: CONFIG.horario.fuso, marca: CONFIG.marca.nome });
      window.addEventListener('afterprint', () => { area.innerHTML = ''; }, { once: true });
      window.print();
      return;
    }
    if (e.target.closest('[data-copiar-pix]')) {
      const campo = wrap.querySelector('#pix-txt');
      const manual = () => { campo.select(); avisar('Código selecionado. Copie com Ctrl+C ou toque longo.'); };
      try {
        navigator.clipboard.writeText(campo.value).then(() => avisar('Código Pix copiado'), manual);
      } catch {
        manual();
      }
      return;
    }
    if (e.target.closest('[data-copiar]')) {
      const txt = recem.codigo;
      const ok = () => avisar('Código copiado');
      try {
        navigator.clipboard.writeText(txt).then(ok, () => selecionar());
      } catch {
        selecionar();
      }
    }
  });

  function selecionar() {
    const r = document.createRange();
    r.selectNodeContents(wrap.querySelector('#codigo-txt'));
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    avisar('Código selecionado. Copie com Ctrl+C ou toque longo.');
  }

  if (consulta) buscar(consulta.codigo, consulta.telefone);
  return null;
}

