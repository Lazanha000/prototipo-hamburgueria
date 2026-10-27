// Texto do pedido que vai por WhatsApp ao vendedor. Função pura (testável em Node).

import { brl, taxaTxt } from './utils.js';

// link do Google Maps com o endereço (abre o app de mapas no celular do entregador)
export const linkMapa = (e) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${e.endereco}, ${e.numero}, ${e.bairro}, ${e.cidade}, Brasil`)}`;

const hhmm = (iso, fuso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso });
const dia = (iso, fuso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: fuso });

export function textoPedido(p, { fuso = 'America/Sao_Paulo', marca = '', pix = false } = {}) {
  const retirada = p.recebimento?.modo === 'retirada';
  const e = p.entrega;
  const pg = p.pagamento;
  const linhas = [
    `*NOVO PEDIDO${marca ? ` · ${marca}` : ''}*`,
    `Código da venda: *${p.codigo}* (o entregador confere este código)`,
    `Feito em ${dia(p.criadoEm, fuso)} às ${hhmm(p.criadoEm, fuso)} (Brasília)`,
    '',
    '*Itens*',
    ...p.itens.map((i) => `${i.qtd}x ${i.nome}${i.escolhas.length ? ` (${i.escolhas.join(', ')})` : ''}${i.obs ? ` - Obs.: ${i.obs}` : ''} - ${brl(i.precoUnitario * i.qtd)}`),
    '',
    `Subtotal: ${brl(p.totais.subtotal)}`,
    retirada ? 'Retirada: grátis' : `Entrega: ${taxaTxt(p.totais.taxa)}`,
    `*Total: ${brl(p.totais.total)}*`,
    '',
    `*Pagamento:* ${pg.nome}${pg.forma === 'pix' ? (pix ? ' (Pix pelo QR do site, conferir no app do banco)' : ' (enviar a chave)') : ''}${pg.trocoPara ? ` - troco para ${brl(pg.trocoPara)}` : ''}`,
    '',
    `*Cliente:* ${p.cliente.nome} - ${p.cliente.telefone}`,
    retirada
      ? `*Retirada no local*${p.recebimento.local ? `: ${p.recebimento.local}` : ''}${p.recebimento.tempo ? ` (previsão ${p.recebimento.tempo})` : ''}`
      : `*Entrega${p.recebimento?.tempo ? ` (previsão ${p.recebimento.tempo})` : ''}:*\n${e.endereco}, ${e.numero}${e.complemento ? ` - ${e.complemento}` : ''}\n${e.bairro}, ${e.cidade} - CEP ${e.cep}\nMapa: ${linkMapa(e)}`,
    p.obs ? `Obs. do pedido: ${p.obs}` : '',
  ];
  return linhas.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
}
