# Banco de pedidos (Supabase) — passo a passo

Com o banco ligado, o site:

- lê **cardápio, preços, esgotados, horário, taxas e Pix** do banco (sem publicar o site de novo);
- **registra cada pedido no banco antes** de abrir o WhatsApp, com o preço recalculado lá
  (o navegador manda só o que foi pedido, nunca o valor);
- dá ao cliente um **link de acompanhamento** (código + token secreto) que mostra o andamento.

Sem o banco (`CONFIG.api` em `null`), tudo continua como hoje: cardápio do `js/products.js` e pedido pelo WhatsApp.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `schema.sql` | Tabelas, regras de acesso (RLS) e as funções `criar_pedido` e `acompanhar_pedido`. Pode rodar de novo para atualizar: não apaga dados. |
| `gerar-cardapio.mjs` | Gera o `cardapio.sql` a partir de `js/products.js` e `js/config.js`. |
| `cardapio.sql` | Cardápio, horários, taxa e dados da loja para colocar no banco (o deste repositório é o do modelo). |
| `testes/` | Testes locais (Postgres comum imitando o Supabase, inclusive login e tempo real). Não rode nada desta pasta no Supabase. |

## 1. Criar o projeto

1. Entre em <https://supabase.com> com a conta **do restaurante** (ou a sua, se você administra) e clique em **New project**.
2. Região: **South America (São Paulo)**. Anote a senha do banco num lugar seguro (não vai para o site).
3. Espere o projeto ficar pronto (1 a 2 minutos).

## 2. Criar as tabelas

1. **SQL Editor > New query**, cole o conteúdo inteiro de `supabase/schema.sql` e clique em **Run**.
2. Deve terminar com "Success. No rows returned".

## 3. Colocar o cardápio e os dados da loja

1. Confira `js/config.js` e `js/products.js` do cliente (WhatsApp, Pix, horário, taxa, cardápio).
2. No computador, na pasta do site: `node supabase/gerar-cardapio.mjs > supabase/cardapio.sql`
3. **SQL Editor > New query**, cole `supabase/cardapio.sql` e **Run**.

> O `cardapio.sql` **substitui** cardápio, bairros e horários do banco. Rode só na implantação:
> depois que o restaurante passar a mexer pelo painel, o banco é o dono do cardápio.

## 4. Ligar o site ao banco

1. **Project Settings > API Keys**: copie a **Project URL** e a chave **publishable** (`sb_publishable_...`).
   **Nunca** use a chave *secret* / *service_role* no site.
2. Em `js/config.js`:
   ```js
   api: { supabaseUrl: 'https://xxxxxxxx.supabase.co', chavePublica: 'sb_publishable_...' },
   ```
3. Publique e teste: faça um pedido e veja em **Table Editor > pedidos** se ele apareceu com o total certo.

O `index.html` já libera `https://*.supabase.co` na CSP (fotos e conexões): nada a mudar lá.

## 5. Dar acesso à equipe (painel do restaurante)

O painel fica em `<endereço do site>/admin.html` (ex.: `https://lazanha000.github.io/prototipo-hamburgueria/admin.html`).

1. **Authentication > Users > Add user**: e-mail e senha da pessoa (marque *Auto Confirm User*).
   Use uma senha forte e diferente para cada pessoa.
2. Copie o **UID** do usuário criado e rode no SQL Editor:
   ```sql
   insert into public.equipe (user_id, nome) values ('<UID>', 'Nome da pessoa');
   ```
3. Em **Authentication > Sign In / Providers**, desligue **Allow new users to sign up**
   (só quem você cadastrar entra; quem se cadastrar sozinho não vê nada mesmo assim, mas é melhor fechar).
4. Tirar o acesso de alguém: apague a linha da pessoa em `equipe` (ou o usuário em Authentication > Users).

### O que o painel faz

- **Pedidos em tempo real**: chegam sozinhos, com destaque e som (botão "Som" no topo; o navegador só
  toca depois de um toque na tela). O indicador "Ao vivo" mostra a conexão; se cair, o painel avisa e
  confere os pedidos a cada 15 segundos até voltar.
- **Andamento**: um botão leva ao próximo passo (preparo, pronto, saiu para entrega, entregue). O seletor
  "Status" corrige ou cancela (pede confirmação). O cliente vê a mudança no link de acompanhamento.
- **Pagamento**: "Confirmar pagamento" depois de conferir o Pix no app do banco (ou ao receber na entrega).
- **Cardápio**: marcar item **esgotado** e de volta **disponível**.
- **Loja**: "Fechar agora" para de aceitar pedidos na hora, até "Reabrir" (o horário continua valendo).
- **Imprimir comanda** de cada pedido.

O painel grava no banco com o login da pessoa, e quem decide o que pode é a RLS: no pedido, a equipe
muda **só status e pagamento** (total e dados do cliente não mudam). Cardápio, horários, bairros e loja a
equipe pode editar por inteiro (o painel mexe só em esgotado e aberta/fechada), então **cadastre na
equipe só gente de confiança**: com o login, dá para mudar até a chave Pix pela API.
Preço, opções, horários e bairros ainda se mudam no Table Editor (abaixo).

## Como funciona a segurança

- O visitante (chave publishable) **lê** só cardápio e dados públicos da loja. Não lê pedido nenhum,
  não muda preço, não troca a chave Pix: as tabelas têm RLS e as permissões foram fechadas.
- Pedido só entra pela função `criar_pedido`, que confere tudo de novo no banco: produto ativo e não
  esgotado, opções válidas, ingredientes removíveis, pedido mínimo, bairro/cidade atendidos, loja aberta
  (botão "fechada agora" + horário no fuso da loja), forma de pagamento, troco maior que o total.
- Mesma chave de envio = mesmo pedido: clique duplo ou nova tentativa não duplica.
- Limite contra pedido falso em massa: 3 pedidos por telefone e 10 por rede (IP) a cada 10 minutos.
- O link de acompanhamento usa um token aleatório de 32 caracteres. Ele mostra itens e andamento,
  **não** mostra nome, telefone nem endereço.
- A equipe (tabela `equipe`) lê pedidos e muda **só** status e situação do pagamento; total e dados
  do cliente não podem ser alterados. Ela também edita cardápio, horários, bairros e a loja.
- Cupom ainda não existe: o banco recusa pedido com cupom.

## Mudar coisas direto no banco (o que o painel ainda não faz)

No **Table Editor**:

- **Preço**: `produtos` > `preco` em centavos (2890 = R$ 28,90). Opções: tabela `opcoes`.
- **Horário**: tabela `horarios` (dia 1 = segunda ... 7 = domingo).
- **Taxa e bairros**: `loja` (`taxa_tipo`, `taxa_fixa`) e tabela `bairros`.
- Esgotado, abrir/fechar a loja e andamento do pedido: use o painel (também dá pelo Table Editor:
  `produtos.disponivel`, `loja.aberta_manual`, `pedidos.status`).

## LGPD

Os pedidos guardam nome, telefone e endereço do cliente. Só a equipe vê. Combine com o restaurante
por quanto tempo guardar e apague os antigos de tempos em tempos, por exemplo:

```sql
delete from public.pedidos where criado_em < now() - interval '1 year';
```
