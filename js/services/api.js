// ============================================================
// CAMADA DE INTEGRAÇÃO (pedidos)
// Hoje: modo demonstração. O pedido fica só neste navegador e
// nenhum restaurante recebe nada. Nenhum pagamento é cobrado.
//
// Para ligar a um sistema real:
//   1. Defina CONFIG.api.url (ex.: 'https://api.seurestaurante.com.br')
//   2. Mude CONFIG.modoDemonstracao para false
//   3. O backend precisa responder:
//      POST {url}/pedidos            corpo: o objeto "pedido" abaixo
//        -> { codigo: 'XX-...', criadoEm: ISO, status: 'recebido' }
//      GET  {url}/pedidos/{codigo}?telefone=11999999999
//        -> { codigo, criadoEm, status, itens, totais, ... }
//   Pagamento online (Pix automático, cartão no site) exige um
//   provedor de pagamento; o site nunca deve receber dados de cartão.
// ============================================================

import { CONFIG } from '../config.js';
import { digitos, espera, salvo, CHAVES, prefixoPedido } from '../utils.js';

const CHAVE = CHAVES.pedidos;

export const ETAPAS = [
  { id: 'recebido', nome: 'Pedido recebido' },
  { id: 'preparo', nome: 'Em preparação' },
  { id: 'pronto', nome: 'Pronto para envio' },
  { id: 'saiu', nome: 'Saiu para entrega' },
  { id: 'entregue', nome: 'Entregue' },
];

const usarBackend = () => Boolean(CONFIG.api?.url) && !CONFIG.modoDemonstracao;

function gerarCodigo() {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const arr = new Uint32Array(5);
  crypto.getRandomValues(arr);
  return `${prefixoPedido()}-` + [...arr].map((n) => letras[n % letras.length]).join('');
}

// lembrar = caixa "Lembrar meus dados" marcada. Sem ela, o aparelho guarda só o mínimo
// para achar o pedido depois (código, horário e telefone), nunca nome nem endereço.
export async function criarPedido(pedido, { lembrar = false } = {}) {
  if (usarBackend()) {
    const r = await fetch(`${CONFIG.api.url}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido),
    });
    if (!r.ok) throw new Error('O restaurante não confirmou o pedido. Tente de novo em instantes.');
    return r.json();
  }
  await espera(700);
  const registro = {
    ...pedido,
    codigo: gerarCodigo(),
    criadoEm: new Date().toISOString(),
    demonstracao: CONFIG.modoDemonstracao,
  };
  const guardar = lembrar ? registro : {
    codigo: registro.codigo, criadoEm: registro.criadoEm, demonstracao: registro.demonstracao,
    cliente: { telefone: registro.cliente.telefone },
  };
  const lista = salvo.ler(CHAVE, []);
  lista.unshift(guardar);
  salvo.gravar(CHAVE, lista.slice(0, 20));
  return registro;
}

// Status simulado pelo tempo desde o pedido (só na demonstração)
export function statusDemo(pedido, agora = Date.now()) {
  const min = (agora - new Date(pedido.criadoEm).getTime()) / 60000;
  if (min < 1) return 'recebido';
  if (min < 3) return 'preparo';
  if (min < 4) return 'pronto';
  if (min < 7) return 'saiu';
  return 'entregue';
}

export async function consultarPedido(codigo, telefone) {
  const cod = String(codigo || '').trim().toUpperCase();
  const tel = digitos(telefone);
  if (usarBackend()) {
    const r = await fetch(`${CONFIG.api.url}/pedidos/${encodeURIComponent(cod)}?telefone=${tel}`);
    if (r.status === 404) return { erro: 'nao-encontrado' };
    if (!r.ok) throw new Error('Não foi possível consultar agora. Tente de novo em instantes.');
    return { pedido: await r.json() };
  }
  await espera(400);
  const p = salvo.ler(CHAVE, []).find((x) => x.codigo === cod);
  if (!p) return { erro: 'nao-encontrado' };
  if (digitos(p.cliente?.telefone) !== tel) return { erro: 'telefone' };
  return { pedido: { ...p, status: statusDemo(p) } };
}

export function pedidosNesteAparelho() {
  return salvo.ler(CHAVE, []).map((p) => ({ codigo: p.codigo, criadoEm: p.criadoEm }));
}

export const modoDemo = () => !usarBackend();
