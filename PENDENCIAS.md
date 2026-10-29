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

**Banco (Supabase) e painel prontos no repositório, ainda NÃO ligados**: `supabase/schema.sql`,
`supabase/cardapio.sql` (gerado por `supabase/gerar-cardapio.mjs`), `supabase/LEIAME.md` e o
painel do restaurante em `admin.html` (+ pasta `painel/`). `CONFIG.api` continua `null` até o dono
criar o projeto no Supabase e seguir o LEIAME; sem isso o `admin.html` só mostra o aviso
"O painel precisa do banco de pedidos ligado".

## Próximas etapas (na ordem)

1. Pequena: se o preço mudar no banco entre abrir a página e confirmar, o cliente vê o total
   novo só na confirmação (o banco cobra o preço dele, certo). Dá para mandar o total esperado
   em `paraServidor` e o banco recusar com "Os preços mudaram, confira o carrinho".
2. Painel, segunda parte (se o restaurante pedir): editar preço, horários e bairros pelo painel
   (hoje é no Table Editor do Supabase) e separar papéis na tabela `equipe` (ex.: coluna `papel`
   'dono' | 'cozinha'): hoje QUALQUER pessoa da equipe pode, pela API, mudar cardápio e loja
   inteiros, inclusive `loja.pix_chave`. Para a cozinha bastaria status, pagamento e esgotado.
3. Testar num celular real e abrindo pelo navegador do Instagram (só o dono pode fazer).
4. Ligar o Supabase de verdade (só o dono: criar conta/projeto; seguir `supabase/LEIAME.md`).
   Depois de ligar, conferir no Supabase real o que só foi testado com imitação: login do painel,
   tempo real (indicador "Ao vivo" e pedido novo aparecendo sozinho) e o PATCH com `Prefer: return=representation`.

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
- 2026-10-29: **Fase 2b (painel do restaurante)**. `admin.html` + `painel/` (`supabase.js`: login,
  renovação do token e REST por `fetch`, Realtime por WebSocket com batimento e religar; `logica.js`:
  regras sem tela; `painel.js`: telas; `painel.css`). Login por e-mail/senha do Supabase Auth, só quem
  está em `equipe` entra. Pedidos em tempo real com som e destaque (e consulta a cada 15 s se o tempo
  real cair), botão de próximo passo, seletor de status/cancelar, confirmar/desfazer pagamento,
  imprimir comanda, esgotado/disponível, fechar/reabrir a loja. CSP do admin.html: só `'self'`, sem
  script inline, `connect-src` com `wss://*.supabase.co`. Tirado do `config.js` o bloco `admin` e o
  `CONFIG_BASE` (desenho antigo que salvava no GitHub). Testes: `supabase/testes/testar-painel.mjs`
  (15, no navegador) com Auth, PATCH e Realtime imitados em `postgrest-falso.mjs` e `routeWebSocket`;
  servidor de teste comum em `supabase/testes/servidor.mjs`.

- 2026-10-29: fotos da abertura (8 camadas do lanche) só são baixadas quando a pessoa entra pelo
  início (`/`, `#inicio`). Os `<link rel="preload">` fixos saíram do `index.html`; agora o script do
  tema (o único inline) cria esses preloads só nessas rotas (hash da CSP atualizado). Testado no
  navegador: início e `#inicio` pedem as 8 e mostram as fotos; `#cardapio`, `#cardapio?...` e
  `#carrinho` pedem 0; de `#cardapio` para `#inicio` as fotos carregam normalmente; sem erro no
  console (CSP ok). Testes do banco/site/painel continuam passando (22 + 6 + 15).

## Cuidados

- Trocou as fotos das camadas (`CINE_LAYERS` em `js/art.js`)? Atualize a lista no script do tema do
  `index.html` (ele faz o preload) e rode `node conferir-modelo.mjs` para o hash novo da CSP.
- Mudou o script inline do `index.html`? Rode `node conferir-modelo.mjs`, que mostra o novo hash da CSP.
- Arquivo `.js` novo: adicionar no `sw.js` (lista BASE, subir VERSAO) e no `modulepreload` do `index.html`.
- Testar com `python3 -m http.server <porta livre>` + Playwright (já instalado na nuvem).
- Mudou `supabase/schema.sql`, `js/services/` ou `painel/`? Rode os testes do banco. Postgres 16 já vem na nuvem
  (`/usr/lib/postgresql/16/bin`), mas parado. Para subir:
  `mkdir -p /var/lib/postgresql && chown postgres /var/lib/postgresql && su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /var/lib/postgresql/teste -A trust -E UTF8 --locale=C.UTF-8 && /usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/teste -o '-p 5499 -k /tmp' -l /var/lib/postgresql/teste/log start"`
  e depois `export PGHOST=/tmp PGPORT=5499 PGUSER=postgres; node supabase/testes/testar-banco.mjs && node supabase/testes/testar-site.mjs && node supabase/testes/testar-painel.mjs`
  (o primeiro recria o banco `teste_supabase` do zero; os outros usam esse banco).
  Baixar o binário do PostgREST foi bloqueado na nuvem: `supabase/testes/postgrest-falso.mjs` imita as rotas usadas.
- Mudou o cardápio/loja do modelo? Gere de novo: `node supabase/gerar-cardapio.mjs > supabase/cardapio.sql`.
- `loja` é pública (o site lê com `select=*`): nunca pôr segredo nela. Segredo de pedido fica em `pedidos_acesso`.
- O painel fica FORA de `js/` de propósito: assim não entra no `sw.js` nem no `modulepreload` do site
  (o `conferir-modelo.mjs` exige isso só para `js/`). Consulta nova do painel ao `/rest/v1`? Imite a rota
  em `supabase/testes/postgrest-falso.mjs` (ele não interpreta o PostgREST, só reconhece as consultas usadas).
