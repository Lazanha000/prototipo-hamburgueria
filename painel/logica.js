// Regras do painel sem tela (testáveis em Node): andamento do pedido, horário,
// conversão do pedido do banco para a comanda e as consultas ao /rest/v1.

import { digitos } from '../js/utils.js';

export const STATUS = {
  recebido: 'Recebido',
  preparo: 'Em preparo',
  pronto: 'Pronto',
  saiu: 'Saiu para entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};
export const EM_ANDAMENTO = ['recebido', 'preparo', 'pronto', 'saiu'];
export const PAGAMENTOS = { pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito', dinheiro: 'Dinheiro' };

// próximo passo do pedido (botão principal do cartão). null = já terminou.
export function proximoPasso(p) {
  const retirada = p.modo === 'retirada';
  switch (p.status) {
    case 'recebido': return { status: 'preparo', rotulo: 'Começar preparo' };
    case 'preparo': return { status: 'pronto', rotulo: 'Marcar pronto' };
    case 'pronto': return retirada ? { status: 'entregue', rotulo: 'Cliente retirou' } : { status: 'saiu', rotulo: 'Saiu para entrega' };
    case 'saiu': return { status: 'entregue', rotulo: 'Marcar entregue' };
    default: return null;
  }
}

// status que fazem sentido para o modo (retirada não "sai para entrega")
export const statusPara = (modo) => Object.keys(STATUS).filter((s) => !(s === 'saiu' && modo === 'retirada'));

// ---------- horário (mesma regra de public._loja_aberta no banco) ----------
// horarios = linhas da tabela: [{ dia: 1..7 (segunda..domingo), abre: 'HH:MM[:SS]', fecha }]
const minutos = (t) => {
  const m = /^(\d{2}):(\d{2})/.exec(String(t || ''));
  return m ? +m[1] * 60 + +m[2] : NaN;
};
const SEMANA = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
export function dentroDoHorario(horarios, fuso = 'America/Sao_Paulo', data = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: fuso, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(data);
  const pega = (t) => partes.find((x) => x.type === t)?.value;
  const hoje = SEMANA[pega('weekday')];
  const ontem = hoje === 1 ? 7 : hoje - 1;
  const h = (+pega('hour') % 24) * 60 + +pega('minute');
  return (horarios || []).some((x) => {
    const a = minutos(x.abre);
    const f = minutos(x.fecha);
    if (!Number.isFinite(a) || !Number.isFinite(f)) return false;
    if (x.dia === hoje && a < f) return h >= a && h < f;
    if (x.dia === hoje && f < a && h >= a) return true;        // vira a meia-noite: parte de hoje
    return x.dia === ontem && f < a && h < f;                 // parte que veio de ontem
  });
}

// ---------- textos ----------
export const hora = (iso, fuso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso });

export function haQuanto(iso, agora = Date.now()) {
  const min = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
}

// telefone do banco (só dígitos, com DDD) -> "(33) 98877-6655" e links
export function telefoneTxt(t) {
  const d = digitos(t);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}
export const linkTelefone = (t) => `tel:+55${digitos(t)}`;
export const linkWhatsappCliente = (t) => `https://wa.me/55${digitos(t)}`;

// linhas de detalhe do item: "Tamanho: Média", "Sem cebola"
export const detalhesItem = (i) => [
  ...(Array.isArray(i.escolhas) ? i.escolhas : []).map((e) => `${e.grupo}: ${e.opcao}`),
  ...(Array.isArray(i.remover) ? i.remover : []).map((x) => `Sem ${String(x).toLowerCase()}`),
];

// pedido do banco -> formato de js/comanda.js (impressão)
export function paraComanda(p) {
  return {
    codigo: p.codigo,
    criadoEm: p.criado_em,
    recebimento: { modo: p.modo },
    entrega: p.entrega || null,
    cliente: { nome: p.cliente_nome, telefone: telefoneTxt(p.cliente_telefone) },
    itens: (p.pedido_itens || []).map((i) => ({
      qtd: i.qtd, nome: i.nome, precoUnitario: i.preco_unitario,
      escolhas: [...(i.escolhas || []).map((e) => e.opcao), ...(i.remover || []).map((x) => `Sem ${String(x).toLowerCase()}`)],
      obs: i.obs || '',
    })),
    totais: { subtotal: p.subtotal, desconto: p.desconto || 0, taxa: p.taxa, total: p.total },
    pagamento: { nome: PAGAMENTOS[p.pagamento_forma] || p.pagamento_forma, trocoPara: p.troco_para },
    obs: p.obs || '',
  };
}

// ---------- consultas ao /rest/v1 ----------
const COLUNAS_PEDIDO = 'id,codigo,criado_em,status,pagamento_status,modo,cliente_nome,cliente_telefone,entrega,'
  + 'pagamento_forma,troco_para,obs,subtotal,desconto,taxa,total,pedido_itens(ordem,nome,qtd,preco_unitario,escolhas,remover,obs)';
// em andamento (de qualquer dia) + todos das últimas 24 h
export function consultaPedidos(agora = Date.now()) {
  const desde = new Date(agora - 24 * 3600 * 1000).toISOString();
  return `pedidos?select=${COLUNAS_PEDIDO}&or=(status.in.(${EM_ANDAMENTO.join(',')}),criado_em.gte.${desde})`
    + '&order=criado_em.desc&pedido_itens.order=ordem&limit=300';
}
export const CONSULTAS = {
  equipe: (uid) => `equipe?select=nome&user_id=eq.${encodeURIComponent(uid)}`,
  loja: 'loja?select=aberta_manual,bloquear_fechado,fuso&id=eq.1',
  horarios: 'horarios?select=dia,abre,fecha',
  categorias: 'categorias?select=id,nome,ordem&order=ordem',
  produtos: 'produtos?select=id,nome,categoria_id,disponivel,ativo,ordem&order=ordem',
};
