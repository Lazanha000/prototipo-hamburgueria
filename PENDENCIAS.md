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

## Próximas etapas (na ordem)

1. **Fase 2a: banco (Supabase).** A pasta `supabase/` não existe: escrever `supabase/schema.sql`
   com tabelas (produtos, pedidos, itens, loja), RLS, e as funções `criar_pedido(dados, chave)`
   (recalcula preço no servidor, devolve `codigo` + `token` de 32 caracteres) e
   `acompanhar_pedido(codigo, token)`. O formato esperado está em `js/services/api.js`
   (`paraServidor`, `doServidor`) e `js/services/cardapio.js`. Mais `supabase/LEIAME.md` com o passo a passo.
   Deixar `CONFIG.api` em null até o dono criar o projeto no Supabase.
2. **Fase 2b: painel do restaurante (`admin.html`)** com login (Supabase Auth): pedidos em
   tempo real, mudar status, item esgotado, abrir/fechar loja. Gravar no banco, NÃO no GitHub
   (o desenho antigo com token do GitHub no navegador é inseguro: quem tem o token troca a chave Pix).
3. Pequenas: não baixar as fotos da abertura quando a pessoa entra direto em `#cardapio`.
4. Testar num celular real e abrindo pelo navegador do Instagram (só o dono pode fazer).

## Depende do cliente (não fazer sem os dados)

Lista completa em `COMO-CONFIGURAR.md`: WhatsApp e Pix reais, `marca.id`, nome/local,
endereço de retirada, horário, CNPJ e e-mail da privacidade, cardápio e fotos, ícones.

## Feito

- 2026-10-29: auditoria; WhatsApp/Pix de teste; `bloquearPedidoFechado: true`; trava sem canal;
  `sw.js` e `conferir-modelo.mjs` restaurados do histórico; marca do rodapé via config;
  hora em Brasília no acompanhamento; `og:url` real; `COMO-CONFIGURAR.md`; publicado no main (PR #1).

## Cuidados

- Mudou o script inline do `index.html`? Rode `node conferir-modelo.mjs`, que mostra o novo hash da CSP.
- Arquivo `.js` novo: adicionar no `sw.js` (lista BASE, subir VERSAO) e no `modulepreload` do `index.html`.
- Testar com `python3 -m http.server <porta livre>` + Playwright (já instalado na nuvem).
