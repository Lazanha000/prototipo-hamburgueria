# PENDÊNCIAS — leia isto primeiro

Arquivo de passagem entre sessões. **Toda sessão deve:** ler este arquivo, fazer a próxima
etapa, testar, atualizar este arquivo (mover o feito para "Feito", anotar o que descobriu),
fazer commit e publicar no `main` (o GitHub Pages publica o `main`).

Site no ar: https://lazanha000.github.io/prototipo-hamburgueria/
Tipo: HTML/JS puro, sem build. Dados do restaurante em `js/config.js`, cardápio em `js/products.js`.
Guia para configurar um cliente: `COMO-CONFIGURAR.md`. Verificador: `node conferir-modelo.mjs`.

## Estado atual (2026-10-29)

Modo **pedido pelo WhatsApp** funcionando e publicado, com dados de TESTE:
WhatsApp e chave Pix = 33999785853 (do dono do projeto). Testado no navegador: pedido
completo, mensagem do WhatsApp, Pix com CRC conferido, loja fechada bloqueia, sem número
o checkout recusa o pedido.

**Banco (Supabase) pronto no repositório, ainda NÃO ligado**: `supabase/schema.sql`,
`supabase/cardapio.sql` (gerado por `supabase/gerar-cardapio.mjs`) e `supabase/LEIAME.md`.
`CONFIG.api` continua `null` até o dono criar o projeto no Supabase e seguir o LEIAME.

## Próximas etapas (na ordem)

1. **Fase 2b: painel do restaurante (`admin.html`)** com login (Supabase Auth, e-mail e senha):
   pedidos em tempo real (tabela `pedidos` já está na publicação `supabase_realtime`), mudar
   `status` e `pagamento_status` (a equipe só pode mudar essas duas colunas), item esgotado
   (`produtos.disponivel`), abrir/fechar loja (`loja.aberta_manual`). Quem entra: tabela `equipe`
   (ver LEIAME, passo 5). Gravar no banco, NÃO no GitHub. Ao terminar, tirar do `config.js` o
   bloco `admin: { repositorio, ramo }` e o comentário do painel que salva no GitHub (desenho
   antigo e inseguro). Evitar o supabase-js por CDN: a CSP só libera `'self'` para scripts;
   o mais simples é falar com `/auth/v1` e `/rest/v1` por `fetch` (como `js/services/api.js`)
   e a Realtime por WebSocket (`wss://*.supabase.co` precisa entrar no `connect-src` da CSP).
   Estender `supabase/testes/` com testes do painel.
2. Pequenas: não baixar as fotos da abertura quando a pessoa entra direto em `#cardapio`.
3. Pequena: se o preço mudar no banco entre abrir a página e confirmar, o cliente vê o total
   novo só na confirmação (o banco cobra o preço dele, certo). Dá para mandar o total esperado
   em `paraServidor` e o banco recusar com "Os preços mudaram, confira o carrinho".
4. Testar num celular real e abrindo pelo navegador do Instagram (só o dono pode fazer).
5. Ligar o Supabase de verdade (só o dono: criar conta/projeto; seguir `supabase/LEIAME.md`).

## Depende do cliente (não fazer sem os dados)

Lista completa em `COMO-CONFIGURAR.md`: WhatsApp e Pix reais, `marca.id`, nome/local,
endereço de retirada, horário, CNPJ e e-mail da privacidade, cardápio e fotos, ícones.

## Feito

- 2026-10-29: auditoria; WhatsApp/Pix de teste; `bloquearPedidoFechado: true`; trava sem canal;
  `sw.js` e `conferir-modelo.mjs` restaurados do histórico; marca do rodapé via config;
  hora em Brasília no acompanhamento; `og:url` real; `COMO-CONFIGURAR.md`; publicado no main (PR #1).
- 2026-10-29: **Fase 2a (banco)**. `supabase/schema.sql`: tabelas loja, categorias, produtos,
  grupos_opcao, opcoes, bairros, horarios, equipe, pedidos, pedido_itens, pedidos_acesso (token +
  chave do envio, sem acesso pela API); RLS em tudo; `criar_pedido(dados, chave)` recalcula preço,
  taxa e total, confere esgotado/opções/mínimo/bairro/cidade/horário no fuso/pagamento/troco,
  não duplica com a mesma chave, limita 3 pedidos por telefone e 10 por IP em 10 min, devolve
  `codigo` + `token` de 32; `acompanhar_pedido(codigo, token)` sem dados pessoais. Cupom: recusado
  (não existe ainda). `gerar-cardapio.mjs` + `cardapio.sql` + `LEIAME.md`. Testes em
  `supabase/testes/` (22 de banco/RLS + 6 de ponta a ponta no navegador), todos passando.

## Cuidados

- Mudou o script inline do `index.html`? Rode `node conferir-modelo.mjs`, que mostra o novo hash da CSP.
- Arquivo `.js` novo: adicionar no `sw.js` (lista BASE, subir VERSAO) e no `modulepreload` do `index.html`.
- Testar com `python3 -m http.server <porta livre>` + Playwright (já instalado na nuvem).
- Mudou `supabase/schema.sql` ou `js/services/`? Rode os testes do banco. Postgres 16 já vem na nuvem
  (`/usr/lib/postgresql/16/bin`), mas parado. Para subir:
  `mkdir -p /var/lib/postgresql && chown postgres /var/lib/postgresql && su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /var/lib/postgresql/teste -A trust -E UTF8 --locale=C.UTF-8 && /usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/teste -o '-p 5499 -k /tmp' -l /var/lib/postgresql/teste/log start"`
  e depois `export PGHOST=/tmp PGPORT=5499 PGUSER=postgres; node supabase/testes/testar-banco.mjs && node supabase/testes/testar-site.mjs`
  (o primeiro recria o banco `teste_supabase` do zero; o segundo usa esse banco).
  Baixar o binário do PostgREST foi bloqueado na nuvem: `supabase/testes/postgrest-falso.mjs` imita as rotas usadas.
- Mudou o cardápio/loja do modelo? Gere de novo: `node supabase/gerar-cardapio.mjs > supabase/cardapio.sql`.
- `loja` é pública (o site lê com `select=*`): nunca pôr segredo nela. Segredo de pedido fica em `pedidos_acesso`.
