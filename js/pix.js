// Pix estático (BR Code "copia e cola" + QR). Sem backend: o dono confere
// o recebimento no app do banco. Dados do recebedor vêm de CONFIG.pix.

import qrcode from './vendor/qrcode.js';
import { digitos } from './utils.js';

const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;

// nome e cidade do BR Code: maiúsculas, sem acento, só A-Z 0-9 e espaço
const limpo = (s, max) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export function crc16(texto) {
  let c = 0xFFFF;
  for (let i = 0; i < texto.length; i++) {
    c ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}

// formato da chave dentro do BR Code (telefone precisa de +55)
export function formatarChave(chave, tipo) {
  const c = String(chave || '').trim();
  if (tipo === 'telefone') {
    const d = digitos(c);
    return `+${d.length === 10 || d.length === 11 ? '55' : ''}${d}`;
  }
  if (tipo === 'cpf' || tipo === 'cnpj') return digitos(c);
  if (tipo === 'email') return c.toLowerCase();
  return c;
}

export const pixConfigurado = (p) => Boolean(p?.chave && p.nome && p.cidade);

// centavos > 0 inclui o valor; txid só letras/números (até 25), senão '***'
export function brCode({ chave, tipo, nome, cidade, centavos = 0, txid = '' }) {
  const id = String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const corpo = tlv('00', '01')
    + tlv('01', '11')
    + tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', formatarChave(chave, tipo)))
    + tlv('52', '0000')
    + tlv('53', '986')
    + (centavos > 0 ? tlv('54', (centavos / 100).toFixed(2)) : '')
    + tlv('58', 'BR')
    + tlv('59', limpo(nome, 25))
    + tlv('60', limpo(cidade, 15))
    + tlv('62', tlv('05', id))
    + '6304';
  return corpo + crc16(corpo);
}

// QR em SVG (nível M); mostrado com fundo branco para leitura em qualquer tema
export function qrSvg(texto, rotulo = 'QR Code do Pix') {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, alt: rotulo, title: rotulo });
}
