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
painel do restaurante em `admin.html` (+ pasta `painel/`), com papéis `dono` e `cozinha`.
`CONFIG.api` continua `null` até o dono criar o projeto no Supabase e seguir o LEIAME; sem isso o
`admin.html` só mostra o aviso "O painel precisa do banco de pedidos ligado".

## Próximas etapas (na ordem)

1. Testar num celular real e abrindo pelo navegador do Instagram (só o dono pode fazer).
2. Ligar o Supabase de verdade (só o dono: criar conta/projeto; seguir `supabase/LEIAME.md`;
   cadastrar a si mesmo na `equipe` com `papel = 'dono'`).
   Depois de ligar, conferir no Supabase real o que só foi testado com imitação: login do painel,
   tempo real (indicador "Ao vivo" e pedido novo aparecendo sozinho), o PATCH com
   `Prefer: return=representation`, a consulta do cardápio do painel com `grupos_opcao(...opcoes(...))`
   embutido, as chamadas `rpc/salvar_horarios` e `rpc/salvar_entrega`, e se o `hint` 'precos' chega
   no JSON de erro do PostgREST (o site depende dele para buscar o cardápio de novo).
3. Painel, terceira parte (só se o restaurante pedir): criar/renomear produto, trocar foto, editar
   WhatsApp/Pix/local de retirada pelo painel (hoje: Table Editor, só o dono pela RLS) e gerenciar
   a equipe pelo painel (hoje: SQL Editor). Ideia: Pix pelo painel com confirmação dupla, já que
   é o dado mais sensível.

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

- 2026-10-29: **Total esperado + papéis + painel do dono**.
  - Site manda `totalEsperado` em `paraServidor`; `criar_pedido` recusa se o total dele for outro
    ("Os preços mudaram…", `hint = 'precos'`). `rpc()` põe o hint em `erro.motivo`; o checkout então
    busca o cardápio de novo (`carregarDoBanco`), atualiza comanda, total e botão e o cliente confirma
    de novo (mesma chave de envio), com a lista de bairros refeita se a taxa mudou. Ninguém paga
    diferente do que viu.
  - `equipe.papel` ('dono' | 'cozinha', padrão 'cozinha', `alter table ... add column if not exists`
    para quem já rodou o schema antigo) + `eh_dono()`. Cozinha: pedidos, pagamento, `produtos.disponivel`
    e `loja.aberta_manual` (gatilho `_so_dono(colunas livres)` em produtos e loja dá 42501 para o resto).
    Criar/apagar no cardápio e alterar categorias/opções/bairros/horários: só dono (RLS).
  - Funções do dono `salvar_horarios(faixas)` e `salvar_entrega(dados)` (tudo ou nada, mensagens P0001
    prontas, 42501 para quem não é dono). Helpers `_inteiro`, `_sim_nao`.
  - Painel: consulta da equipe traz `papel`; dono vê campo de preço por produto e por opção ("Preços das
    opções de …", Enter ou Tab salva por PATCH) e a aba **Loja** (horários por dia com várias faixas;
    entrega/retirada, mínimo, tempo, taxa única ou por bairro com lista). Cozinha vê o preço só como texto.
    `mensagemDoErro` repassa mensagens P0001. Campos com `aria-label` (com `<label>` em volta o nome
    acessível incluía o valor). Celular: nome do produto numa linha, preço e chave na de baixo.
  - Testes: banco 29 (novos: schema roda 2 vezes, total esperado, cozinha não muda preço/Pix/horário/papel,
    dono muda preço/opção/Pix, `salvar_horarios` e `salvar_entrega` com validações), site 6 (o de preço
    agora passa pela recusa e confirma o total novo), painel 25 (novos: regras sem tela, cozinha sem aba
    Loja, dono muda preço/opção, horários, entrega com bairros, erro do banco na tela, cozinha recusada
    pela API direta). `conferir-modelo.mjs` igual ao de antes (só dados do cliente). Telas conferidas em
    1100 px e 390 px, sem rolagem lateral.

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
- Coluna nova que a cozinha pode mexer em `produtos` ou `loja`? Acrescente o nome no gatilho
  (`_so_dono('disponivel')` / `_so_dono('aberta_manual')`); senão ela leva "sem permissão".
- Mudou a conta do total no site (`js/store.js`, `js/delivery.js`)? Tem de bater com `criar_pedido`,
  senão TODO pedido cai em "Os preços mudaram". O teste do site pega isso.
