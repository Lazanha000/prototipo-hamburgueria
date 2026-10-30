# Avançado: servidor + Supabase (opcional, não é necessário para o app do Android)

O código está pronto. Faltam as contas, que só você pode criar. São 5 etapas, cerca de 1 hora no total, e cada uma pode ser feita num dia diferente.

Enquanto isso, o app já funciona com **dados de demonstração** (Ajustes → "Ver com dados de demonstração").

| Etapa | Onde | Tempo | Custo |
|---|---|---|---|
| 1. Conta secundária do Instagram | Celular | 10 min (e alguns dias de "aquecimento") | grátis |
| 2. Banco na nuvem | supabase.com | 10 min | grátis |
| 3. Publicar o app | Cloudflare Pages ou Netlify | 10 min | grátis |
| 4. Servidor + proxy | Hetzner (ou parecido) + um proxy residencial fixo | 30 min | ~R$ 45–60/mês |
| 5. Ligar tudo | No próprio app | 5 min | — |

---

## 1. Conta secundária do Instagram

1. Crie uma conta nova no Instagram, **separada da sua principal**. É ela que o Mirante usa para ler posts, stories e comentários.
2. Siga com ela os perfis que você quer acompanhar, principalmente os **privados**: sem isso eles não aparecem.
3. Use a conta normalmente pelo celular por **3 a 7 dias** antes de ligar o Mirante: ver alguns stories, curtir algo. Conta recém-criada que já começa a ler muita coisa chama atenção.
4. Se puder, ative a verificação em 2 etapas por app autenticador. O Mirante pede o código na hora do login.

> O Instagram não permite esse tipo de leitura automática. O Mirante vai devagar, usa um IP de casa e pausa sozinho quando o Instagram reclama. Mesmo assim, a conta secundária pode ser bloqueada um dia. Por isso **nunca** use a sua conta principal.

## 2. Banco na nuvem (Supabase)

1. Em [supabase.com](https://supabase.com), crie um **projeto novo**, separado do da hamburgueria. Nome: `mirante`. Região: **South America (São Paulo)**. Guarde a senha do banco.
2. Abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/migrations/0001_mirante.sql` e clique em **Run**. Deve aparecer "Success".
3. Em **Project Settings → API** (ou **Data API / API Keys**), anote:
   - a **Project URL** (`https://xxxx.supabase.co`);
   - a chave **anon / publishable**, que vai no app;
   - a chave **service_role / secret**, que vai **só** no servidor. Nunca coloque essa chave no app nem no GitHub.
4. Em **Authentication → URL Configuration**, ponha em **Site URL** o endereço do app (etapa 3). Pode fazer isso depois.

> Se você me der acesso a esse projeto pelo conector do Supabase, eu mesmo aplico o SQL e confiro tudo.

## 3. Publicar o app (para abrir no celular)

O app é um site estático: qualquer hospedagem grátis serve. Exemplo com **Cloudflare Pages**:

1. Primeiro, ponha a pasta `mirante/` num repositório próprio do GitHub (por exemplo, `mirante`). Hoje ela está dentro do repositório da hamburgueria.
2. No Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**, escolha o repositório.
3. Configure:
   - **Root directory:** `app`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - (opcional) variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Com elas, o app já abre conectado. Sem elas, você cola os dois valores em Ajustes.
4. Ao terminar, você recebe um endereço como `https://mirante.pages.dev`.

**No celular:** abra o endereço no Chrome (Android) ou no Safari (iPhone) e use **"Adicionar à tela inicial"**. O app passa a abrir em tela cheia e funciona sem internet com o que já chegou.

## 4. Servidor + proxy (o "trabalhador")

### 4.1 Proxy residencial fixo
O Instagram desconfia de contas logadas a partir de servidores. O proxy faz os pedidos saírem de um IP de provedor de internet comum, **sempre o mesmo**.

- Procure por **"static residential proxy"** ou **"ISP proxy"** com IP no **Brasil**, plano de **1 IP** (costuma custar entre US$ 3 e US$ 6 por mês).
- Evite proxies "rotativos" (que trocam de IP a cada pedido): com conta logada, isso é pior.
- Anote no formato `http://usuario:senha@ip:porta`.

### 4.2 Servidor
Qualquer servidor Linux pequeno serve (1–2 GB de RAM). Exemplo: **Hetzner Cloud CX22** com Ubuntu, cerca de €4/mês.

No terminal do servidor:

```bash
# Docker
curl -fsSL https://get.docker.com | sh

# código
git clone https://github.com/SEU_USUARIO/mirante.git
cd mirante/worker
cp .env.exemplo .env

# chave que criptografa a sessão da conta secundária
docker compose run --rm mirante python -m mirante_worker secret
```

Abra o `.env` (`nano .env`) e preencha `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `MIRANTE_SECRET` (a chave gerada acima) e `IG_PROXY`. Depois:

```bash
docker compose run --rm mirante python -m mirante_worker check   # deve dizer "Supabase ok"
docker compose up -d                                              # liga e fica ligado
docker compose logs -f                                            # ver o que está acontecendo (Ctrl+C para sair)
```

Para atualizar (o Instagram muda e a biblioteca de coleta acompanha), de vez em quando:

```bash
git pull && docker compose build --pull --no-cache && docker compose up -d
```

## 5. Ligar tudo

1. Abra o app → **Ajustes** → cole a **Project URL** e a chave **anon/publishable** → **Salvar**.
2. Digite seu e-mail → **Mandar link de entrada** → abra o link **no mesmo aparelho**. O primeiro e-mail que entrar vira o dono.
3. No Supabase, desligue novos cadastros: **Authentication → Sign In / Providers → Allow new users to sign up: desligado**. Assim ninguém mais entra.
4. Ainda em Ajustes, em **Conta secundária do Instagram**: usuário e senha → **Conectar conta**. Se pedir código, ele aparece ali.
5. Vá em **Perfis** e cole os links (ou solte o `following.json`). Em alguns minutos os perfis são verificados e os posts começam a chegar.

Nos outros aparelhos, repita só os passos 1 e 2.

---

## Se algo der errado

| O que aparece | O que fazer |
|---|---|
| "O trabalhador ainda não deu sinal de vida" | No servidor: `docker compose logs -f`. Confira o `.env`. |
| "O Instagram pediu uma pausa" | Normal de vez em quando. Ele volta sozinho em 1–2 h. |
| "O Instagram pediu uma verificação na conta secundária" | Abra o Instagram com a conta secundária no celular e confirme que foi você. O Mirante tenta de novo em 6 h. |
| "A sessão da conta secundária caiu" | Ajustes → Conectar conta de novo. |
| Perfil "privado" | A conta secundária precisa seguir esse perfil (e ele aceitar). |
| "O Mirante já está aberto em outra aba" | O banco do aparelho abre em uma aba por vez. Feche a outra. |
| Foto ou vídeo antigo não abre | O link do Instagram expira; a miniatura continua e o botão abre o post no Instagram. |

## Para quem for mexer no código

```bash
cd app && npm install
npm run dev          # abre em http://localhost:5173 (use a demonstração)
npm test             # ordenação, pesquisa, leitura de perfis, banco local
npm run test:sql     # confere o SQL do Supabase num Postgres embutido
npm run build && npx vite preview --port 4173 &
NODE_PATH=$(npm root -g) node e2e/smoke.cjs   # passa por todas as telas no Chromium

cd ../worker && python -m venv .venv && .venv/bin/pip install -r requirements.txt pytest
.venv/bin/python -m pytest   # coletor com um Instagram falso (sem internet)
```
