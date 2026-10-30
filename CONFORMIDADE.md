# Conformidade legal, privacidade e direitos (revisão de 2026-10-30)

Revisão técnica feita no código. **Não substitui advogado**: textos legais do site são modelos e precisam de
revisão profissional antes de vender para um cliente real. O que depende de dados do cliente ou do site
publicado está em `PENDENCIAS.md` ("Conformidade e LGPD").

## 1. Leis brasileiras aplicáveis e onde o site cobre

| Lei | O que exige | Situação |
|---|---|---|
| LGPD, Lei 13.709/2018 | base legal, transparência, direitos do titular, minimização, segurança, encarregado | Política de privacidade (`js/pages/privacy.js`); coleta mínima; exclusão pelo titular (`excluir_dados_pedido`); falta CNPJ/contato reais e encarregado |
| CDC, Lei 8.078/1990 | informação clara, oferta, vício do produto, arrependimento (art. 49), foro do consumidor | Termos e política de reembolso (`js/pages/legal.js`); fotos "ilustrativas" avisadas; revisar texto do arrependimento com advogado |
| Decreto 7.962/2013 (e-commerce) | razão social, CNPJ, endereço físico e de e-mail, preço total claro, política de cancelamento, confirmação do pedido | Rodapé mostra razão social/CNPJ/endereço (`CONFIG.privacidade`); total com taxa antes de confirmar; falta preencher dados reais |
| Marco Civil, Lei 12.965/2014 | privacidade, guarda de logs só por quem é provedor de aplicação | O restaurante não precisa guardar logs de acesso; o provedor de hospedagem tem os dele |
| Lei 10.962/2004 | preço visível e claro | Preços em R$ no cardápio e no carrinho |
| Lei 13.146/2015 (LBI, art. 63) | acessibilidade em sites de empresas | Axe/WCAG 2.1 AA sem falhas nas 8 telas (claro/escuro, celular/desktop); teclado conferido |
| Lei 12.741/2012 | tributos na nota fiscal | Não é do site: vale para a nota que o restaurante emite |
| Lei 8.137/1990 e normas fiscais | nota fiscal da venda | Fora do site; o restaurante emite NFC-e/NF-e conforme o município |
| Anvisa (RDC 216/2004, RDC 26/2015) | boas práticas e rotulagem de alérgenos | Site pede para informar alergias nas observações e avisa dos alérgenos; rotulagem é do restaurante |
| Lei 9.610/1998 (direitos autorais) e Lei 9.279/1996 (marcas) | uso de fotos e marcas com licença | Ver item 5: há risco nas fotos atuais |

## 2. Dados coletados (minimização)

Coletado só para o pedido: nome, telefone (obrigatórios), e-mail (opcional), endereço (só em entrega), observações (opcional), forma de pagamento/troco.
Não pede CPF, data de nascimento, cartão nem senha. Retirada não pede endereço. "Lembrar meus dados" começa desmarcado.
Também fica no banco um código irreversível do IP (`pedidos_acesso.ip_hash`) só contra pedidos falsos; apagar com
`supabase/migracoes/2026-10-30-limpeza-ip.sql` (opcional, precisa de pg_cron).

## 3. Exclusão de dados (direito do titular) com integridade

Botão "Excluir meus dados deste pedido" em Acompanhar pedido (`excluirDadosDoPedido` em `js/services/api.js`).
Só quem tem **código + token secreto** (link do pedido) consegue; só vale para pedido entregue/cancelado; apaga nome, telefone,
e-mail, endereço e observações (pedido e itens), troca o token e esquece o pedido no aparelho. Ficam itens e valores sem
identificar a pessoa (obrigação fiscal/contábil, LGPD art. 16, I). Testado no banco e no navegador. Pedido de quem perdeu o link:
pelo contato da política (o dono confere a identidade e apaga no painel/SQL). **Precisa aplicar a migração no banco real**.

## 4. Rastreadores, cookies e terceiros

Nenhum script de rastreamento, nenhum cookie, nenhuma fonte externa (fontes são locais; não usa Google Fonts).
Chamadas de rede do site: o próprio domínio e o Supabase. Links abertos pelo usuário: WhatsApp (wa.me) e Google Maps.
Google Analytics: **desligado** (`CONFIG.analytics.id` vazio). Se ligar: `js/consentimento.js` pergunta antes (Aceitar e Recusar com o mesmo destaque),
carrega só após aceite, sem sinais de anúncio, IP anonimizado, page_view só com a rota (nunca o `?c=...&t=...` do pedido); o botão do
rodapé muda a escolha; a política de privacidade passa a citar o Google. Falta: liberar o Google na CSP e criar o ID (ver `PENDENCIAS.md`).

| Terceiro | Para quê | Dados | Observação |
|---|---|---|---|
| Supabase (AWS us-east-1) | banco de pedidos, login do painel, fotos | dados do pedido | **transferência internacional** (LGPD art. 33): citada na política; preferir região São Paulo (sa-east-1) para cliente real |
| WhatsApp / Meta | resumo do pedido (opcional com banco) | nome, telefone, endereço | a mensagem só sai quando o cliente envia |
| Google Maps | link do endereço na mensagem | endereço | só quando alguém toca no link |
| Hospedagem (GitHub Pages hoje; Cloudflare/Hostinger depois) | servir o site | IP nos logs | **GitHub Pages proíbe uso comercial**; trocar antes de vender |
| Google Analytics | (desligado) | — | ver acima |

## 5. Direitos autorais e marcas

- **Código e fontes:** Big Shoulders Display, Archivo e IBM Plex Mono são SIL Open Font License (uso comercial livre, manter a licença);
  `js/vendor/qrcode.js` é MIT (qrcode-generator, Kazuhiko Arase). Ilustrações/arte em SVG foram feitas no projeto.
- **Fotos de produtos (`assets/produtos/*.webp`) e da abertura (`assets/cena/`): origem e licença NÃO documentadas** (entraram como
  "Add files via upload"). Conferidas a olho: **`combo-x-bacon`, `combo-x-salada` e `combo-x-tudo` têm marca d'água de banco de imagens**
  (sinal de foto sem licença) e `x-tudo` tem aparência de banco de imagens/IA. Fotos de **Coca-Cola, Coca-Cola Zero e Guaraná Antarctica**
  mostram marcas registradas de terceiros (uso para identificar o produto vendido costuma ser tolerado, mas a foto precisa ser licenciada ou própria).
- **Recomendação:** para cliente real, substituir TODAS as fotos por fotos do próprio restaurante (celular, com o botão de foto do painel)
  ou por imagens com licença comprovada (guardar o comprovante). Enquanto isso, o site é só demonstração.
- Marca "Modelo Burguer": nome fictício, não pesquisado no INPI. O cliente deve conferir a marca dele em busca.inpi.gov.br.

## 6. Textos e promessas (revisão)

- Não existem depoimentos, avaliações, notas, selos ou números de clientes no site (conferido em `js/`, `index.html`, `supabase/cardapio.sql`).
- Removidas promessas sem comprovação: selo "Mais pedido" virou "Destaque" (não há dado de vendas por trás); "artesanal" saiu do título,
  descrição e dados estruturados; "Ingredientes de verdade. Sabor sem limites." virou "Escolha, monte e peça pelo site."
- **O cliente precisa confirmar** antes de publicar: "Feito na hora"/"Montado na hora", gramaturas do cardápio (ex.: "hambúrguer 150 g"),
  tempo de entrega ("45 min", só estimativa) e "FEITO PARA SER LENDÁRIO" (exagero publicitário comum, mas é decisão da marca).
