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
| `testes/` | Testes locais (Postgres comum imitando o Supabase). Não rode nada desta pasta no Supabase. |

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

## 5. Dar acesso à equipe (para o painel, Fase 2b)

1. **Authentication > Users > Add user**: e-mail e senha da pessoa (marque *Auto Confirm User*).
2. Copie o **UID** do usuário criado e rode no SQL Editor:
   ```sql
   insert into public.equipe (user_id, nome) values ('<UID>', 'Nome da pessoa');
   ```
3. Em **Authentication > Sign In / Providers**, desligue **Allow new users to sign up**
   (só quem você cadastrar entra; quem se cadastrar sozinho não vê nada mesmo assim, mas é melhor fechar).

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

## Mudar coisas direto no banco (até o painel ficar pronto)

No **Table Editor**:

- **Esgotado**: `produtos` > coluna `disponivel` = false.
- **Fechar agora**: `loja` > `aberta_manual` = false (volta com true).
- **Preço**: `produtos` > `preco` em centavos (2890 = R$ 28,90). Opções: tabela `opcoes`.
- **Andamento do pedido**: `pedidos` > `status` = recebido, preparo, pronto, saiu, entregue ou cancelado.

## LGPD

Os pedidos guardam nome, telefone e endereço do cliente. Só a equipe vê. Combine com o restaurante
por quanto tempo guardar e apague os antigos de tempos em tempos, por exemplo:

```sql
delete from public.pedidos where criado_em < now() - interval '1 year';
```
