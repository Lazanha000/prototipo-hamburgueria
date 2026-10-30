// Termos de uso e política de cancelamento e reembolso. Textos-modelo (CDC, Lei 8.078/1990; Decreto
// 7.962/2013; Marco Civil, Lei 12.965/2014; LGPD, Lei 13.709/2018): os dados da empresa vêm de
// CONFIG.privacidade e CONFIG.politicas. Revisar com advogado antes de usar com cliente real.

import { CONFIG } from '../config.js';
import { esc, el } from '../utils.js';

const contato = () => {
  const c = CONFIG.privacidade;
  const email = String(c.email || '').trim();
  const meios = [
    email ? `e-mail <a href="mailto:${esc(email)}">${esc(email)}</a>` : '',
    c.telefone ? `telefone ${esc(c.telefone)}` : '',
  ].filter(Boolean);
  return meios.length ? meios.join(' ou ') : 'o WhatsApp do restaurante';
};

const dataBr = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');

function pagina(main, { olho, titulo, atualizadoEm, corpo }) {
  const demo = CONFIG.modoDemonstracao
    ? '<p class="aviso aviso--demo"><strong>Modo demonstração.</strong> Este site é um exemplo: o texto abaixo é um modelo.</p>' : '';
  const sec = el(`<section class="pagina pagina-texto" aria-labelledby="pg-h"><div class="wrap wrap--estreito">
    <header class="pagina-cab"><p class="olho">${olho}</p><h1 id="pg-h" tabindex="-1">${titulo}</h1></header>
    <p class="campo-dica">Atualizados em ${esc(dataBr(atualizadoEm))}.</p>
    ${demo}
    ${corpo}
    <p><a class="btn btn-primario" href="#cardapio">Voltar ao cardápio</a></p>
  </div></section>`);
  main.append(sec);
  return null;
}

export function paginaTermos(main) {
  const c = CONFIG.privacidade;
  const p = CONFIG.politicas;
  return pagina(main, {
    olho: 'Regras do site', titulo: 'Termos de uso', atualizadoEm: p.atualizadoEm,
    corpo: `
    <h2>1. Quem somos</h2>
    <p>Este site é do ${esc(c.controlador)}, CNPJ ${esc(c.cnpj)}${c.endereco ? `, ${esc(c.endereco)}` : ''}. Falar com a gente: ${contato()}.</p>
    <h2>2. O que o site faz</h2>
    <p>Mostra o cardápio e permite montar e enviar pedidos de comida para entrega ou retirada, pagar por Pix e acompanhar o andamento do pedido. Ao usar o site você concorda com estes termos, com a <a href="#privacidade">política de privacidade</a> e com a <a href="#reembolso">política de cancelamento e reembolso</a>.</p>
    <h2>3. Como o pedido funciona</h2>
    <ul>
      <li>O pedido enviado pelo site é uma proposta de compra. Ele só vale como contrato quando o restaurante o aceita (o andamento aparece em “Acompanhar pedido”).</li>
      <li>Os preços, a taxa de entrega e o total aparecem antes de você confirmar. O total é conferido pelo sistema da loja na hora do envio; se algum preço mudou, o site avisa e você confirma de novo.</li>
      <li>Itens esgotados, loja fechada ou endereço fora da área de entrega impedem o pedido. O prazo de entrega informado é uma estimativa.</li>
      <li>As fotos do cardápio são ilustrativas; a apresentação final do prato pode variar.</li>
      <li><strong>Alergias e restrições alimentares:</strong> escreva nas observações do pedido e confirme com a loja pelo WhatsApp. Os pratos podem ter contato com glúten, leite, ovos, soja, gergelim e outros alérgenos.</li>
    </ul>
    <h2>4. Pagamento</h2>
    <p>As formas de pagamento disponíveis aparecem ao finalizar. No Pix, o pagamento é feito no aplicativo do seu banco e confirmado pela loja; o site não recebe nem guarda dados de cartão ou de conta. Valor, troco e forma de pagamento escolhidos ficam registrados no pedido.</p>
    <h2>5. Suas responsabilidades</h2>
    <ul>
      <li>Informar nome, telefone e endereço verdadeiros e corretos, e estar disponível para receber.</li>
      <li>Fazer pedidos apenas para uso pessoal e de boa-fé. Pedidos falsos ou repetidos para atrapalhar a loja podem ser recusados e bloqueados.</li>
      <li>Não tentar acessar áreas restritas (como o painel da loja), burlar a segurança ou sobrecarregar o site.</li>
      <li>O site é para maiores de 18 anos; menores devem pedir com ajuda de um responsável.</li>
    </ul>
    <h2>6. Nossa responsabilidade</h2>
    <p>Cuidamos para que preços, descrições e horários estejam corretos, mas podem ocorrer erros ou instabilidade (internet, sistema de pedidos, WhatsApp). Se o sistema de pedidos ficar fora do ar, o site oferece enviar o pedido pelo WhatsApp e a loja confirma o valor por lá. Nada neste termo diminui os seus direitos como consumidor.</p>
    <h2>7. Propriedade intelectual</h2>
    <p>O nome, a marca, os textos, as fotos e o visual do site pertencem ao ${esc(c.controlador)} ou são usados com autorização, e não podem ser copiados para outros fins sem permissão. Marcas de terceiros que aparecem nas fotos (como as de refrigerantes) pertencem aos seus donos.</p>
    <h2>8. Mudanças</h2>
    <p>Podemos mudar estes termos; a data no topo muda junto. O que vale para o seu pedido é a versão vigente no momento em que você o fez.</p>
    <h2>9. Lei e foro</h2>
    <p>Valem as leis do Brasil, em especial o Código de Defesa do Consumidor. Qualquer disputa pode ser levada ao foro do domicílio do consumidor.</p>
    <h2>10. Contato</h2>
    <p>Dúvidas, reclamações e pedidos sobre o seu pedido ou os seus dados: ${contato()}.</p>`,
  });
}

export function paginaReembolso(main) {
  const p = CONFIG.politicas;
  return pagina(main, {
    olho: 'Seus direitos', titulo: 'Cancelamento e reembolso', atualizadoEm: p.atualizadoEm,
    corpo: `
    <h2>1. Cancelar antes do preparo</h2>
    <p>Enquanto o pedido ainda está como “recebido”, você pode cancelar sem custo: fale com a loja pelo WhatsApp, informando o código do pedido. Se já pagou por Pix, devolvemos o valor total, ${esc(p.prazoEstorno)}, pelo mesmo Pix, na conta de origem.</p>
    <h2>2. Pedido já em preparo ou a caminho</h2>
    <p>Como o alimento é preparado na hora, depois que o preparo começa o cancelamento depende de a loja ainda conseguir aproveitar o pedido. Fale com a loja o quanto antes; se ela aceitar, o reembolso segue a regra do item 1 (total ou parcial, conforme combinado com você).</p>
    <h2>3. Problema com o pedido</h2>
    <p>Se o pedido chegar errado, incompleto, em condição imprópria ou muito atrasado em relação ao prazo informado, avise a loja logo que receber (de preferência com uma foto). Você pode escolher entre refazer o pedido, receber abatimento proporcional no preço ou o reembolso do valor pago, conforme o Código de Defesa do Consumidor.</p>
    <h2>4. Direito de arrependimento</h2>
    <p>Em compras feitas pela internet, o Código de Defesa do Consumidor (art. 49) e o Decreto 7.962/2013 dão 7 dias para desistir. Como se trata de alimento perecível, preparado sob pedido e que não pode ser devolvido nem revendido, a loja analisa cada caso e explica a decisão. O direito a reembolso por defeito ou erro (item 3) não depende disso.</p>
    <h2>5. Como pedir</h2>
    <ol>
      <li>Chame a loja no WhatsApp ou pelo contato da <a href="#privacidade">política de privacidade</a>, com o código do pedido.</li>
      <li>Explique o que aconteceu.</li>
      <li>A loja responde e, se houver reembolso, faz o Pix de volta ${esc(p.prazoEstorno)}.</li>
    </ol>
    <h2>6. Pagamento na entrega</h2>
    <p>Quando o pagamento é feito na entrega (dinheiro, cartão), nada foi cobrado antes; se houver devolução, ela é feita pelo meio combinado com a loja.</p>`,
  });
}
