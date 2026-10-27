// Finalização do pedido: dados do cliente, entrega, pagamento.
// Nenhum dado de cartão é pedido: o pagamento é feito na entrega.

import { CONFIG } from '../config.js';
import { modosAtivos, taxaPorBairro, bairros, tempoPara, faixaDeTaxa, semEntregaNoBairro } from '../delivery.js';
import { buscarProduto } from '../products.js';
import { carrinho, precoUnitario, resumoEscolhas } from '../store.js';
import { brl, esc, el, digitos, salvo } from '../utils.js';
import { avisar, atualizarContador } from '../ui.js';
import { criarPedido } from '../services/api.js';
import { linhasComanda, totaisComanda, motivoBloqueio, avisoLoja } from './cart.js';
import { ir } from '../router.js';
import { whatsappAtivo } from '../whatsapp.js';
import { linkPedidoWhatsapp } from './tracking.js';
import { telefoneValido, limiteDeEnvios, pareceRobo } from '../antifraude.js';

const CHAVE_DADOS = 'exemplo-burguer:dados:v1';
const CHAVE_ENVIOS = 'exemplo-burguer:envios:v1';
const CAMPOS_SALVOS = ['nome', 'email', 'telefone', 'cep', 'cidade', 'endereco', 'numero', 'complemento', 'bairro'];

const campo = (id, rotulo, { tipo = 'text', auto = '', modo = '', dica = '', opcional = false, extra = '' } = {}) => `
  <div class="campo" data-campo="${id}">
    <label for="f-${id}">${rotulo}${opcional ? ' <span class="opcional">opcional</span>' : ''}</label>
    <input id="f-${id}" name="${id}" type="${tipo}" ${auto ? `autocomplete="${auto}"` : ''} ${modo ? `inputmode="${modo}"` : ''} aria-describedby="e-${id}${dica ? ` d-${id}` : ''}" ${extra}>
    ${dica ? `<p class="campo-dica" id="d-${id}">${dica}</p>` : ''}
    <p class="campo-erro" id="e-${id}"></p>
  </div>`;

const campoBairro = () => taxaPorBairro()
  ? `<div class="campo" data-campo="bairro">
      <label for="f-bairro">Bairro</label>
      <select id="f-bairro" name="bairro" autocomplete="address-level3" aria-describedby="e-bairro d-bairro">
        <option value="">Escolha o bairro</option>
        ${bairros().map((b) => `<option value="${esc(b.nome)}">${esc(b.nome)} · taxa ${brl(b.valor)}</option>`).join('')}
      </select>
      <p class="campo-dica" id="d-bairro">Não achou seu bairro? Fale com a gente pelo WhatsApp.</p>
      <p class="campo-erro" id="e-bairro"></p>
    </div>`
  : campo('bairro', 'Bairro', { auto: 'address-level3' });

const mascTel = (v) => {
  const d = digitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
const mascCep = (v) => {
  const d = digitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};
// lê "100", "100,50", "R$ 1.000,00" -> centavos
const lerReais = (v) => {
  const t = String(v).replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

export function paginaFinalizar(main) {
  const sec = el('<section class="pagina pagina-finalizar" aria-labelledby="pg-h"><div class="wrap"></div></section>');
  main.append(sec);
  const wrap = sec.firstElementChild;
  const est = carrinho.estado();

  if (!est.itens.length) {
    wrap.innerHTML = `<header class="pagina-cab"><p class="olho">Finalizar</p><h1 id="pg-h" tabindex="-1">Nada para finalizar</h1></header>
      <div class="vazio"><p class="vazio-titulo">Seu carrinho está vazio.</p><p>Adicione algo do cardápio para fazer o pedido.</p><a class="btn btn-primario" href="#cardapio">Ver cardápio</a></div>`;
    return null;
  }
  const bloqueioInicial = motivoBloqueio(est);
  if (bloqueioInicial) {
    const t = { esgotado: 'Item esgotado', fechado: 'Loja fechada', minimo: 'Falta pouco' }[bloqueioInicial.cod];
    wrap.innerHTML = `<header class="pagina-cab"><p class="olho">Finalizar</p><h1 id="pg-h" tabindex="-1">${t}</h1></header>
      <div class="vazio"><p class="vazio-titulo">${esc(bloqueioInicial.cod === 'minimo' ? `Faltam ${brl(est.faltaMinimo)} para o pedido mínimo.` : bloqueioInicial.msg)}</p>
      ${bloqueioInicial.cod === 'minimo' ? `<p>O pedido mínimo é ${brl(est.minimo)}.</p><a class="btn btn-primario" href="#cardapio">Adicionar mais itens</a>` : '<a class="btn btn-primario" href="#carrinho">Voltar ao carrinho</a>'}</div>`;
    return null;
  }

  const modos = modosAtivos();
  const blocoReceber = modos.length === 2
    ? `<fieldset class="bloco" aria-describedby="e-modo">
        <legend>Como receber</legend>
        <div class="pags">
          <label class="pag"><input type="radio" name="modo" value="entrega" checked>
            <span class="pag-nome">Entrega</span>
            <span class="pag-det">${esc(tempoPara('entrega'))} · taxa ${esc(faixaDeTaxa())}</span></label>
          <label class="pag"><input type="radio" name="modo" value="retirada">
            <span class="pag-nome">Retirada</span>
            <span class="pag-det">${esc(tempoPara('retirada'))} · sem taxa</span></label>
        </div>
        <p class="campo-erro" id="e-modo"></p>
        <p class="aviso aviso--alerta" id="aviso-modo" hidden></p>
      </fieldset>`
    : `<p class="aviso aviso--info" id="aviso-modo-unico">${modos[0] === 'retirada' ? `Retirada no local em ${esc(tempoPara('retirada'))}.` : `Entrega em ${esc(tempoPara('entrega'))}.`}</p>`;
  const localRetirada = `<p class="aviso aviso--info" id="local-retirada" hidden><strong>Retire em:</strong> ${esc(CONFIG.retirada?.local || '')}</p>`;

  const pagamentos = CONFIG.pagamentos.map((pg) => `
    <label class="pag">
      <input type="radio" name="pagamento" value="${esc(pg.id)}">
      <span class="pag-nome">${esc(pg.nome)}</span>
      <span class="pag-det">${esc(pg.detalhe)}</span>
    </label>`).join('');

  wrap.innerHTML = `
    <header class="pagina-cab"><p class="olho">Último passo</p><h1 id="pg-h" tabindex="-1">Finalizar pedido</h1></header>
    ${CONFIG.modoDemonstracao ? `<p class="aviso aviso--demo"><strong>Modo demonstração.</strong> Nenhum restaurante recebe este pedido e nada é cobrado. Use dados fictícios.</p>` : ''}
    <div class="finalizar-grade">
      <form class="form-pedido" novalidate>
        <p class="aviso aviso--erro" id="erro-geral" role="alert" tabindex="-1" hidden></p>
        ${avisoLoja()}
        ${blocoReceber}
        ${localRetirada}
        <fieldset class="bloco">
          <legend>Seus dados</legend>
          ${campo('nome', 'Nome completo', { auto: 'name' })}
          <div class="linha-campos">
            ${campo('email', 'E-mail', { tipo: 'email', auto: 'email', modo: 'email' })}
            ${campo('telefone', 'Telefone (WhatsApp)', { tipo: 'tel', auto: 'tel-national', modo: 'tel', extra: 'placeholder="(11) 98765-4321"' })}
          </div>
        </fieldset>
        <fieldset class="bloco" id="bloco-endereco">
          <legend>Endereço de entrega</legend>
          <div class="linha-campos linha-campos--cep">
            ${campo('cep', 'CEP', { auto: 'postal-code', modo: 'numeric', extra: 'placeholder="00000-000"' })}
            ${campo('cidade', 'Cidade', { auto: 'address-level2' })}
          </div>
          ${campo('endereco', 'Rua ou avenida', { auto: 'address-line1' })}
          <div class="linha-campos linha-campos--num">
            ${campo('numero', 'Número', { modo: 'text', extra: 'placeholder="123 ou s/n"' })}
            ${campo('complemento', 'Complemento', { opcional: true, auto: 'address-line2', extra: 'placeholder="Apto, bloco, referência"' })}
          </div>
          ${campoBairro()}
        </fieldset>
        <fieldset class="bloco" aria-describedby="e-pagamento">
          <legend>Pagamento <span class="opcional" id="leg-pag">na entrega</span></legend>
          <div class="pags">${pagamentos}</div>
          <p class="campo-erro" id="e-pagamento"></p>
          <div class="troco" hidden>
            <label class="check"><input type="checkbox" id="f-precisaTroco"> Preciso de troco</label>
            <div class="troco-valor" hidden>${campo('troco', 'Troco para quanto?', { modo: 'numeric', extra: 'placeholder="Ex.: 100"' })}</div>
          </div>
          <p class="campo-dica">Este site não pede dados de cartão.</p>
        </fieldset>
        <fieldset class="bloco">
          <legend>Observações do pedido</legend>
          <div class="campo">
            <label for="f-obs">Algo que o restaurante precisa saber? <span class="opcional">opcional</span></label>
            <textarea id="f-obs" name="obs" rows="3" maxlength="240" placeholder="Ex.: interfone quebrado, ligar ao chegar"></textarea>
          </div>
        </fieldset>
        <div class="isca" aria-hidden="true"><label>Não preencha este campo <input name="confirmar_site" id="f-isca" tabindex="-1" autocomplete="off"></label></div>
        <label class="check"><input type="checkbox" id="f-lembrar"> Lembrar meus dados neste aparelho <span class="opcional">só fica neste navegador</span></label>
        <p class="campo-dica">Ao confirmar, você aceita a <a href="#privacidade">política de privacidade</a>.</p>
        <button type="submit" class="btn btn-primario btn-largo btn-enviar">
          <span class="btn-txt"></span>
        </button>
      </form>
      <aside class="comanda comanda--fixa" aria-label="Resumo do pedido">
        <p class="cm-cab"><span>Comanda</span><a href="#carrinho" class="link">Editar</a></p>
        <ul class="cm-itens">${linhasComanda(est.itens)}</ul>
        <div data-totais></div>
      </aside>
    </div>`;

  const form = wrap.querySelector('form');
  const abertoEm = Date.now();
  const $ =(id) => form.querySelector(`#f-${id}`);
  const troco = form.querySelector('.troco');
  const trocoValor = form.querySelector('.troco-valor');
  const blocoEndereco = form.querySelector('#bloco-endereco');
  const CAMPOS_ENDERECO = ['cep', 'cidade', 'endereco', 'numero', 'bairro'];

  // escolha atual de recebimento: { modo, bairro }
  const recebimento = () => ({
    modo: modos.length === 1 ? modos[0] : (form.querySelector('input[name="modo"]:checked')?.value || null),
    bairro: taxaPorBairro() ? ($('bairro').value || null) : null,
  });
  const rotuloEnviar = (t) => `${CONFIG.modoDemonstracao ? 'Registrar pedido de demonstração' : 'Confirmar pedido'} · ${brl(t.total)}`;

  // totais, aviso de mínimo e visibilidade do endereço seguem a escolha do cliente
  function atualizarRecebimento() {
    const rec = recebimento();
    const t = carrinho.estado(rec);
    const retirada = rec.modo === 'retirada';
    blocoEndereco.hidden = retirada;
    form.querySelector('#local-retirada').hidden = !retirada;
    form.querySelector('#leg-pag').textContent = retirada ? 'na retirada' : 'na entrega';
    wrap.querySelector('[data-totais]').innerHTML = totaisComanda(t);
    const btn = form.querySelector('.btn-enviar .btn-txt');
    if (!form.querySelector('.btn-enviar').classList.contains('is-carregando')) btn.textContent = rotuloEnviar(t);
    const aviso = form.querySelector('#aviso-modo');
    if (aviso) {
      aviso.hidden = !t.faltaMinimo;
      if (t.faltaMinimo) aviso.textContent = `Para ${retirada ? 'retirada' : 'entrega'} o pedido mínimo é ${brl(t.minimo)}. Faltam ${brl(t.faltaMinimo)}${modos.length === 2 ? ` ou escolha ${retirada ? 'entrega' : 'retirada'}` : ''}.`;
    }
    // o troco depende do total: confere de novo se já estava preenchido
    if (!trocoValor.hidden && $('troco').value) validar('troco');
  }

  // máscaras
  $('telefone').addEventListener('input', (e) => { e.target.value = mascTel(e.target.value); });
  $('cep').addEventListener('input', (e) => { e.target.value = mascCep(e.target.value); });
  $('troco').addEventListener('blur', (e) => {
    const c = lerReais(e.target.value);
    if (c) e.target.value = brl(c);
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'modo' || e.target.name === 'bairro') {
      atualizarRecebimento();
      if (e.target.name === 'modo') marcarErro('modo', '');
    }
    if (e.target.name === 'pagamento') {
      troco.hidden = e.target.value !== 'dinheiro';
      marcarErro('pagamento', '');
    }
    if (e.target.id === 'f-precisaTroco') trocoValor.hidden = !e.target.checked;
  });
  // limpa o erro de um campo ao corrigir
  form.addEventListener('input', (e) => {
    const nome = e.target.name;
    if (nome && form.querySelector(`[data-campo="${nome}"].tem-erro`)) validar(nome);
  });
  form.addEventListener('focusout', (e) => {
    const nome = e.target.name;
    if (nome && e.target.value && form.querySelector(`[data-campo="${nome}"]`)) validar(nome);
  });

  function marcarErro(nome, msg) {
    const box = form.querySelector(`[data-campo="${nome}"]`);
    const erro = form.querySelector(`#e-${nome}`);
    const inp = form.querySelector(`#f-${nome}`);
    if (erro) erro.textContent = msg;
    box?.classList.toggle('tem-erro', Boolean(msg));
    if (inp) inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !msg;
  }

  const retirando = () => recebimento().modo === 'retirada';
  const total = () => carrinho.totais(recebimento()).total;
  const REGRAS = {
    nome: (v) => (v.trim().split(/\s+/).filter((p) => p.length >= 2).length >= 2 ? '' : 'Digite nome e sobrenome.'),
    email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Digite um e-mail válido, como nome@email.com.'),
    telefone: (v) => (telefoneValido(v) ? '' : 'Digite um telefone com DDD, como (11) 98765-4321.'),
    cep: (v) => (retirando() || digitos(v).length === 8 ? '' : 'O CEP tem 8 números.'),
    cidade: (v) => (retirando() || v.trim().length >= 2 ? '' : 'Digite a cidade.'),
    endereco: (v) => (retirando() || v.trim().length >= 3 ? '' : 'Digite a rua ou avenida.'),
    numero: (v) => (retirando() || v.trim() ? '' : 'Digite o número ou “s/n”.'),
    bairro: (v) => (!retirando() && semEntregaNoBairro(v) ? 'Não entregamos neste bairro pelo site. Fale com a gente pelo WhatsApp.' : retirando() || v.trim().length >= 2 ? '' : (taxaPorBairro() ? 'Escolha o bairro.' : 'Digite o bairro.')),
    troco: (v) => {
      if (troco.hidden || trocoValor.hidden) return '';
      const c = lerReais(v);
      if (!c) return 'Digite para quanto precisa de troco.';
      return c > total() ? '' : `O valor precisa ser maior que o total (${brl(total())}).`;
    },
  };

  function validar(nome) {
    const inp = form.querySelector(`#f-${nome}`);
    return marcarErro(nome, REGRAS[nome](inp.value));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const erroGeral = form.querySelector('#erro-geral');
    erroGeral.hidden = true;
    const invalidos = Object.keys(REGRAS).filter((n) => !validar(n));
    const pg = form.querySelector('input[name="pagamento"]:checked');
    if (!recebimento().modo) {
      marcarErro('modo', 'Escolha entrega ou retirada.');
      invalidos.unshift('modo');
    }
    if (!pg) {
      marcarErro('pagamento', 'Escolha como vai pagar.');
      invalidos.push('pagamento');
    }
    if (invalidos.length) {
      const primeiro = ['pagamento', 'modo'].includes(invalidos[0]) ? form.querySelector(`input[name="${invalidos[0]}"]`) : $(invalidos[0]);
      primeiro.focus();
      avisar(invalidos.length === 1 ? 'Confira o campo destacado.' : `Confira os ${invalidos.length} campos destacados.`, 'erro');
      return;
    }
    const rec = recebimento();
    const atual = carrinho.estado(rec);
    if (!atual.itens.length) return ir('carrinho');
    const bloqueio = motivoBloqueio(atual);
    if (bloqueio) {
      const msg = bloqueio.cod === 'minimo'
        ? `Para ${rec.modo === 'retirada' ? 'retirada' : 'entrega'} o pedido mínimo é ${brl(atual.minimo)}. Faltam ${brl(atual.faltaMinimo)}.`
        : bloqueio.msg;
      erroGeral.textContent = msg;
      erroGeral.hidden = false;
      erroGeral.focus();
      avisar(msg, 'erro');
      return;
    }
    const barrado = (msg) => {
      erroGeral.textContent = msg;
      erroGeral.hidden = false;
      erroGeral.focus();
      avisar(msg, 'erro');
    };
    const robo = pareceRobo({ isca: $('isca').value, ms: Date.now() - abertoEm });
    if (robo === 'isca') return barrado('Não foi possível enviar o pedido. Fale com a gente pelo WhatsApp.');
    if (robo === 'rapido') return barrado('Só um instante: confira seus dados e toque em confirmar de novo.');
    const limite = limiteDeEnvios(salvo.ler(CHAVE_ENVIOS, []));
    if (limite.bloqueado) return barrado(`Você já enviou vários pedidos há pouco. Tente de novo em ${limite.esperaMin} min ou fale com a gente pelo WhatsApp.`);
    const btn = form.querySelector('.btn-enviar');
    btn.disabled = true;
    btn.classList.add('is-carregando');
    btn.querySelector('.btn-txt').textContent = 'Registrando pedido…';
    const pedido = {
      cliente: { nome: $('nome').value.trim(), email: $('email').value.trim(), telefone: $('telefone').value.trim() },
      recebimento: {
        modo: rec.modo,
        nome: rec.modo === 'retirada' ? 'Retirada' : 'Entrega',
        tempo: tempoPara(rec.modo),
        local: rec.modo === 'retirada' ? (CONFIG.retirada?.local || '') : null,
      },
      entrega: rec.modo === 'retirada' ? null : {
        cep: $('cep').value, cidade: $('cidade').value.trim(), endereco: $('endereco').value.trim(),
        numero: $('numero').value.trim(), complemento: $('complemento').value.trim(), bairro: $('bairro').value.trim(),
      },
      pagamento: {
        forma: pg.value,
        nome: CONFIG.pagamentos.find((x) => x.id === pg.value)?.nome,
        trocoPara: pg.value === 'dinheiro' && !trocoValor.hidden ? lerReais($('troco').value) : null,
      },
      obs: form.querySelector('#f-obs').value.trim(),
      itens: atual.itens.map((it) => ({
        produtoId: it.produtoId,
        nome: buscarProduto(it.produtoId).nome,
        qtd: it.qtd,
        escolhas: resumoEscolhas(it),
        obs: it.obs,
        precoUnitario: precoUnitario(it),
      })),
      totais: { subtotal: atual.subtotal, taxa: atual.taxa, total: atual.total },
    };
    // Abre a aba do WhatsApp já no clique (senão o navegador bloqueia o pop-up depois do await);
    // o site fica na aba original, com o QR do Pix. Se bloquear, o botão da tela do pedido segue valendo.
    const abaZap = whatsappAtivo() ? window.open('', '_blank') : null;
    try {
      const registrado = await criarPedido(pedido);
      if (abaZap) abaZap.location.href = linkPedidoWhatsapp(registrado);
      salvo.gravar(CHAVE_ENVIOS, [Date.now(), ...salvo.ler(CHAVE_ENVIOS, [])].slice(0, 10));
      if ($('lembrar').checked) {
        salvo.gravar(CHAVE_DADOS, { ...Object.fromEntries(CAMPOS_SALVOS.map((n) => [n, $(n).value])), modo: rec.modo, pagamento: pg.value });
      } else {
        salvo.apagar(CHAVE_DADOS);
      }
      carrinho.limpar();
      atualizarContador(0);
      ir('pedido', { recem: registrado });
    } catch (err) {
      abaZap?.close();
      erroGeral.textContent = `Não deu para registrar o pedido. ${err.message || 'Tente de novo.'} Seus dados continuam aqui.`;
      erroGeral.hidden = false;
      erroGeral.focus?.();
      btn.disabled = false;
      btn.classList.remove('is-carregando');
      btn.querySelector('.btn-txt').textContent = `Tentar de novo · ${brl(atual.total)}`;
    }
  });

  // dados lembrados (só se a pessoa marcou "lembrar" num pedido anterior)
  const dados = salvo.ler(CHAVE_DADOS, null);
  if (dados) {
    for (const n of CAMPOS_SALVOS) if (dados[n]) $(n).value = dados[n];
    if (dados.modo && modos.includes(dados.modo)) form.querySelector(`input[name="modo"][value="${dados.modo}"]`)?.click();
    if (dados.pagamento) form.querySelector(`input[name="pagamento"][value="${dados.pagamento}"]`)?.click();
    $('lembrar').checked = true;
  }

  atualizarRecebimento();
  return null;
}

export const _teste = { mascTel, mascCep, lerReais };
