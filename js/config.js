// ============================================================
// CONFIGURAÇÃO DO SITE — edite só este arquivo para adaptar
// a outro restaurante (nome, cores, WhatsApp, taxa, textos).
// ============================================================

export const CONFIG = {
  marca: {
    nome: 'Sua Marca',
    nomeCurto: 'SUA',
    sufixo: 'MARCA',
    slogan: 'Feito na hora, do seu jeito.',
  },

  // Cores principais (também usadas no CSS via variáveis)
  cores: {
    branco: '#FFFFFF',
    preto: '#111111',
    laranja: '#F15A24',
    dourado: '#E8A33D',
    cinza: '#6B6B6B',
  },

  // WhatsApp do restaurante: só números, com DDD (ex.: '33999999999').
  // O DDI 55 é acrescentado sozinho se faltar. null = botão mostra aviso de demonstração.
  whatsapp: {
    numero: '5533999785853',
    mensagemPadrao: 'Olá! Vim pelo site e quero fazer um pedido.',
  },

  // ----------------------------------------------------------
  // DELIVERY — configure por empresa contratante.
  // Valores em centavos (ex.: 790 = R$ 7,90).
  // ativo: false desliga o modo (o cliente não vê a opção).
  // Se os dois estiverem ativos, o cliente escolhe ao finalizar.
  // ----------------------------------------------------------
  entrega: {
    ativo: true,
    tempo: '45 min',
    pedidoMinimo: 2000,
    // Taxa fixa:   { tipo: 'fixa', valor: 790 }
    // Por bairro:  { tipo: 'bairro', bairros: [{ nome: 'Centro', valor: 500 }, ...] }
    // (com taxa por bairro o cliente escolhe o bairro numa lista; bairro fora
    //  da lista não recebe entrega pelo site e é orientado a falar no WhatsApp)
    taxa: { tipo: 'fixa', valor: 500 },
    // Bairros onde NÃO entregamos (taxa fixa/grátis não distingue bairro). Basta o trecho do nome,
    // sem acento/maiúscula: 'centro' pega 'Centro Histórico'. Vale só para o bairro digitado.
    bairrosSemEntrega: [],
  },
  retirada: {
    ativo: true,
    tempo: '30 min',
    pedidoMinimo: 0,
    local: 'Rua Exemplo, 100, Centro, Sua Cidade',   // troque pelo endereço real
  },

  // ----------------------------------------------------------
  // HORÁRIO DE FUNCIONAMENTO — vale o horário de Brasília,
  // não o do celular do cliente. Cada dia: lista de faixas
  // ['abre', 'fecha'] ou null (fechado). Faixa que passa da meia-noite
  // é aceita (ex.: ['18:00', '02:00']). Dias: seg ter qua qui sex sab dom.
  // O rodapé e o aviso "aberto/fechado" saem daqui.
  // ----------------------------------------------------------
  horario: {
    fuso: 'America/Sao_Paulo',
    semana: {
      seg: [['11:00', '23:00']],
      ter: [['11:00', '23:00']],
      qua: [['11:00', '23:00']],
      qui: [['11:00', '23:00']],
      sex: [['11:00', '23:00']],
      sab: [['11:00', '23:00']],
      dom: [['11:00', '23:00']],
    },
    // true = com a loja fechada o cliente monta o carrinho, mas não finaliza.
    // false = só mostra o aviso "fechado" (bom para demonstrar o site).
    bloquearPedidoFechado: false,
  },

  // Pix estático: QR e "copia e cola" gerados no site com o valor do pedido.
  // Nome (até 25 letras) e cidade (até 15) são obrigatórios no BR Code e devem
  // ser os do titular da chave. Os abaixo são PROVISÓRIOS: troque antes de usar.
  // tipo: telefone | cpf | cnpj | email | aleatoria. Sem chave/nome/cidade, o site
  // não mostra QR e o pedido segue só pelo WhatsApp.
  pix: {
    chave: '33999785853',
    tipo: 'telefone',
    nome: 'SUA MARCA',   // troque: tem de ser o nome do titular da chave
    cidade: 'SUA CIDADE',
  },

  // Formas de pagamento oferecidas. Todas são pagas NA ENTREGA nesta versão
  // (nenhum dado de cartão é pedido no site). Para pagar online, conecte
  // um provedor de pagamento em js/services/api.js.
  pagamentos: [
    { id: 'pix', nome: 'Pix', detalhe: 'QR Code e copia e cola após o pedido' },
    { id: 'credito', nome: 'Cartão de crédito', detalhe: 'Na maquininha, na entrega' },
    { id: 'debito', nome: 'Cartão de débito', detalhe: 'Na maquininha, na entrega' },
    { id: 'dinheiro', nome: 'Dinheiro', detalhe: 'Informe se precisa de troco' },
  ],

  // Fotos da cena de abertura. As camadas do lanche já vêm recortadas da foto real
  // (assets/cena/camadas/*.webp, lista em js/art.js > CINE_LAYERS).
  // Para trocar uma camada sem mexer no código, ponha o caminho aqui.
  // Ex.: carne: 'assets/cena/carne-nova.webp'
  // batatas e pote: fotos reais (se faltar o arquivo, volta para a ilustração).
  fotosCena: {
    paoTopo: null,
    picles: null,
    cebola: null,
    bacon: null,
    queijo: null,
    carne: null,
    salada: null,
    paoBase: null,
    batatas: 'assets/cena/batatas.webp',
    pote: 'assets/cena/pote.webp',
  },

  // Arte da embalagem (fotos fornecidas pela marca). null = arte desenhada.
  // frente: foto da frente da caixa, já sem perspectiva; proporcaoFrente = largura / altura.
  // selo: selo redondo com fundo transparente, usado na tampa.
  embalagem: {
    frente: null,   // era a arte da marca-modelo; ponha a arte da marca aqui
    proporcaoFrente: 1200 / 336,
    selo: null,
  },

  // Política de privacidade (LGPD): quem responde pelos dados e como falar com essa pessoa.
  // Valores abaixo são PROVISÓRIOS (marca fictícia): troque pelos do comércio e peça
  // revisão de quem entende de LGPD antes de publicar para clientes reais.
  privacidade: {
    controlador: 'Sua Marca',
    cnpj: 'xx.xxx.xxx/0001-xx',   // trocar pelo CNPJ real antes de publicar
    contato: 'WhatsApp (33) 9 9978-5853 ou e-mail contato@suamarca.com.br',   // trocar pelos reais
    atualizadoEm: '2026-10-26',
  },

  // Endereço do sistema de pedidos (backend). null = sem backend ainda.
  api: { url: null },

  // Modo demonstração: pedidos não são enviados a nenhum restaurante.
  // Mude para false só quando js/services/api.js estiver ligado a um backend real.
  modoDemonstracao: false,

  textos: {
    cena1Titulo: 'FEITO PARA SER LENDÁRIO.',
    cena1Sub: 'Ingredientes de verdade. Sabor sem limites.',
    cena2Olho: 'Hambúrguer',
    cena2Titulo: 'Camada por camada.',
    cena3Titulo: 'Montado na hora. Embalado com cuidado.',
    cena4Titulo: 'SEU PRÓXIMO FAVORITO ESTÁ AQUI.',
    ctaCardapio: 'EXPLORAR CARDÁPIO',
    avisoDemo: '',
  },
};
