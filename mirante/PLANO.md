# Mirante — planejamento completo (versão 2)

> App **só para o Instagram**: acompanhar os perfis de que você gosta, ver posts e stories, ler os comentários, pesquisar tudo muito rápido e entender o que fez cada post dar certo.
> Funciona no **celular sem o PC**, no navegador e como programa de computador. O YouTube continua no Garimpo, separado.

**Decisões (30/out/2026)**

| Tema | Decisão |
|---|---|
| Escopo | Só Instagram. O Garimpo (YouTube) fica como está. |
| Fonte de dados | A que entrega mais: sessão de uma **conta secundária** (stories, comentários completos, views) + API oficial como reserva. |
| Celular sem o PC | Obrigatório. O PC deixa de ser necessário: **a coleta roda na nuvem**, 24 h por dia. |
| Velocidade | Prioridade. Cada aparelho tem uma **cópia local** com índice de pesquisa. |
| IA | **Sem Claude dentro do app** (decidido em 30/out). Temas por palavras-chave e hashtags. |
| Escala | Até ~50 perfis. |
| Banco na nuvem | **Supabase** (comparado com as alternativas na seção 3.3: nenhuma é melhor para este caso). |

---

## 0. Resumo em 1 minuto

- **Um "trabalhador" na nuvem** (um servidorzinho sempre ligado) faz o que o Garimpo fazia no seu PC: busca posts, stories e comentários e guarda tudo no **Supabase**. Depois: transcrever os vídeos e ler o texto das imagens.
- **O app** (celular, navegador ou computador) baixa só o que mudou e guarda uma cópia no próprio aparelho. **Abrir o feed e pesquisar não espera a internet:** o feed abre na hora e a pesquisa responde em < 50 ms no PC e < 150 ms no celular.
- **O PC vira só mais uma tela.** Pode ficar desligado para sempre.
- **Custo mensal estimado:** **~R$ 45–60** com a nuvem (escolhida). Detalhes na seção 2.4.

---

## 1. A verdade sobre o Instagram

O Instagram não é aberto como o YouTube. Isso decide a arquitetura.

| Fonte | Entrega | Não entrega | Risco |
|---|---|---|---|
| **A. Sessão própria** (instaloader + API web interna, logado com uma **conta secundária**) | Posts, reels, carrosséis, **stories e destaques**, **comentários com curtidas e nº de respostas**, views dos reels, vídeo/áudio para transcrever | Perfis privados que a conta não segue | Fere os Termos do Instagram. Coleta rápida demais ou de um IP "estranho" pode pedir verificação ou bloquear a conta. Por isso: conta secundária, ritmo calmo e **IP residencial fixo** (seção 2.2). |
| **B. API oficial** (Graph API, "Business Discovery") | Posts de perfis **Criador/Empresa**: legenda, data, tipo, curtidas, nº de comentários | Stories, texto dos comentários, perfis pessoais, views | Nenhum. Exige uma conta Criador ligada a uma Página do Facebook e um app gratuito na Meta. |
| **C. vidIQ** (já conectado) | Perfil, até 12 reels com plays, busca de "outliers" (posts muito acima do normal) | Stories, comentários, histórico | Nenhum; custa créditos. Só na aba Análise. |

**Como fica:** A é a fonte principal. Quando A estiver pausada (o Instagram pediu calma), B mantém o feed andando para os perfis comerciais. C só serve para comparar com o resto do Instagram.

**Viabilidade dos pedidos**

| Pedido | Viável? |
|---|---|
| Últimos posts dos perfis | ✅ |
| Stories | ✅ (A). Guardados assim que aparecem, porque somem em 24 h. |
| Post completo + comentários | ✅ |
| Ordenar por recente / visualizado / relevância, o inverso, e combinações | ✅ Seção 5 |
| Pesquisar na legenda | ✅ |
| Pesquisar no que é **falado/escrito** dentro do post | ✅ Transcrição + leitura do texto das imagens |
| Aba de perfis, colar vários links ou arquivo | ✅ Inclusive o arquivo "quem você segue" do Instagram |
| Playlists de perfis (tags) | ✅ |
| Comentários mais curtidos / mais respondidos / mais recentes | ✅ |
| Análise de sucesso | ✅ Seção 7 |
| Integração com outro app | ✅ vidIQ, Planilhas/CSV |
| Filtrar por tema | ✅ Temas por palavras-chave e hashtags |

---

## 2. Arquitetura

```
                         ┌──────────────────────────────────────────┐
                         │        TRABALHADOR (sempre ligado)        │
   Instagram  ◄─────────►│  Python                                   │
   (via IP residencial   │  • Coletor: fonte A, fonte B, fila e pausas│
    fixo)                │  • Transcrição (faster-whisper)           │
                         │  • Leitura de imagem (OCR)                │
                         │  • Temas por palavras-chave               │
                         │  • Calcula métricas e "acima do normal"   │
                         └───────────────────┬──────────────────────┘
                                             │ grava
                                             ▼
                         ┌──────────────────────────────────────────┐
                         │                SUPABASE                   │
                         │  Postgres · Login · Arquivos (miniaturas, │
                         │  stories) · Tempo real · Funções          │
                         └───────┬───────────────┬──────────────┬────┘
                    só o que mudou│               │              │
                                  ▼               ▼              ▼
                       ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                       │   Celular    │ │  Navegador   │ │  Computador  │
                       │ SQLite local │ │ SQLite local │ │ SQLite local │
                       │ + FTS5       │ │ (OPFS)+FTS5  │ │ + FTS5       │
                       └──────────────┘ └──────────────┘ └──────────────┘
                              mesma interface nos três (Svelte)
```

### 2.1 Por que assim

- **A coleta não pode depender de um aparelho seu ligado.** Por isso ela sai do PC e vai para um trabalhador sempre ligado.
- **A velocidade vem da cópia local.** O app nunca espera o servidor para mostrar o feed ou pesquisar. Ele mostra o que já tem na hora e atualiza por trás.
- **Uma interface só**, empacotada de três jeitos: PWA (instala pelo navegador), Tauri 2 para Windows e Tauri 2 para Android/iOS.

### 2.2 Onde roda o trabalhador (o ponto delicado)

O Instagram desconfia de contas logadas a partir de IPs de servidor (datacenter). Existem três jeitos de resolver:

| Opção | Como | Custo/mês | Estabilidade | Recomendação |
|---|---|---|---|---|
| **1. Nuvem + IP residencial fixo** | Servidor pequeno (Hetzner CX22 ou Fly.io) + um "proxy ISP" brasileiro **fixo** (um único IP de provedor residencial, que não fica trocando) | ~€4 + ~US$ 3–6 ≈ **R$ 45–60** | Alta. Não depende de nada na sua casa. | ✅ **Recomendada** |
| **2. Aparelho em casa** | Um celular Android velho (Termux) ou um Raspberry Pi ligado na tomada e no Wi-Fi, rodando o mesmo trabalhador | **R$ 0** | Média. Se a luz ou a internet de casa cair, a coleta para. Os dados já coletados continuam no celular. | Alternativa gratuita |
| **3. Nuvem gratuita (Oracle Always Free) + proxy** | Igual à 1, servidor grátis | ~US$ 3–6 | Média. A Oracle às vezes recolhe máquinas gratuitas. | Se quiser economizar |

> O código do trabalhador é **o mesmo** nas três opções. Dá para começar numa e trocar depois sem perder nada.

### 2.3 Tecnologias

| Camada | Escolha | Motivo |
|---|---|---|
| Trabalhador | **Python 3.12**, `instaloader`, `httpx`, `Pillow` (depois: `faster-whisper`, `RapidOCR`) | O instaloader é o "yt-dlp do Instagram". O jeito de trabalhar (pools, cache, pausa no 429, atualizar a biblioteca sozinho) vem do `garimpo.py`. |
| Nuvem | **Supabase**: Postgres, Auth, Storage, Realtime, Edge Functions | Tudo num lugar, com backup e plano gratuito. Ver 3.3. |
| Banco no aparelho | **SQLite + FTS5** (nativo no Tauri; `wa-sqlite` + OPFS no navegador) | Pesquisa instantânea e offline, sem acento, por prefixo. |
| Interface | **Svelte 5 + Vite + TypeScript** | Próximo de HTML/CSS puro, como o Garimpo, e leve. |
| Listas grandes | Lista virtualizada | Rolagem lisa com milhares de posts. |
| Empacotar | **PWA** primeiro; depois **Tauri 2** (Windows, Android, iOS) | Mesma interface; a PWA chega no celular já na Fase 1. |
| Testes | `pytest` + **Playwright** | Igual ao espírito do `teste.py`. |

### 2.4 Custos estimados (50 perfis)

| Item | Recomendada | Gratuita |
|---|---|---|
| Supabase (plano Free: 500 MB de banco, 1 GB de arquivos) | R$ 0 | R$ 0 |
| Servidor | ~R$ 25 | R$ 0 (aparelho em casa) |
| Proxy ISP fixo | ~R$ 20–35 | R$ 0 |
| **Total** | **~R$ 45–60/mês** | **R$ 0** |

Os valores mudam com câmbio e fornecedor; servem para ter ideia da ordem de grandeza.

---

## 3. Dados e sincronização

### 3.1 Tabelas (Postgres na nuvem; o app espelha em SQLite)

```sql
profiles (
  id text primary key,            -- id numérico do Instagram
  handle text unique not null,    -- sem @, minúsculo
  name text, bio text, avatar_url text,
  followers int, following int, posts_count int,
  is_business bool, is_private bool,
  status text default 'pending',  -- pending | ok | error | private
  on_feed bool default true, priority smallint default 1,
  last_post_at timestamptz, last_checked_at timestamptz,
  added_at timestamptz default now(), updated_at timestamptz
);

tags (id serial primary key, name text unique, color text, emoji text, position int, sort_pref jsonb, updated_at timestamptz);
profile_tags (profile_id text, tag_id int, primary key (profile_id, tag_id));

posts (
  id text primary key,            -- shortcode
  profile_id text not null references profiles,
  kind text,                      -- image | carousel | reel | video
  taken_at timestamptz not null,
  caption text, hashtags text[], mentions text[], location text, duration real,
  likes int, comments int, views int,
  is_pinned bool, is_collab bool,
  thumb_path text,                -- no Storage do Supabase (.webp ~15 KB)
  transcript jsonb,               -- [{t: 12.4, text: "..."}]
  ocr_text text, ai_description text,
  outlier real,                   -- quantas vezes acima do normal do perfil
  engagement real,
  updated_at timestamptz
);

media (post_id text, idx int, kind text, path text, w int, h int, primary key (post_id, idx));
metrics (post_id text, at timestamptz, likes int, comments int, views int, primary key (post_id, at)); -- "fotografias"
stories (id text primary key, profile_id text, taken_at timestamptz, expires_at timestamptz,
         kind text, path text, thumb_path text, transcript jsonb, ocr_text text, links text[],
         highlight text, updated_at timestamptz);
comments (id text primary key, post_id text, parent_id text, author text, text text,
          created_at timestamptz, likes int, replies int, by_owner bool, updated_at timestamptz);
themes (id serial primary key, name text unique, description text, auto bool);
post_themes (post_id text, theme_id int, confidence real, primary key (post_id, theme_id));

-- o que é seu (por usuário, protegido por RLS)
user_state (post_id text, seen_at timestamptz, saved bool, hidden bool, note text, updated_at timestamptz);
saved_searches (id serial primary key, q text, filters jsonb, seen text[], at timestamptz);
jobs (id bigserial, kind text, payload jsonb, status text, run_after timestamptz); -- fila do trabalhador
```

No aparelho, além das mesmas tabelas:

```sql
CREATE VIRTUAL TABLE posts_fts USING fts5(
  caption, transcript, ocr_text, hashtags, comments_text, profile_name,
  tokenize="unicode61 remove_diacritics 2", prefix='2 3 4'
);
```

### 3.2 Sincronização (simples, porque o volume é pequeno)

- Todas as tabelas têm `updated_at`. O app guarda "a última vez que sincronizei" e pede **só o que mudou** desde então. Com 50 perfis, a primeira carga é de poucos MB e as seguintes, de poucos KB.
- **Tempo real**: o Supabase avisa o app aberto quando chega post ou story novo, e ele aparece sem recarregar.
- O que **você** muda (salvar, ocultar, visto, playlists, perfis) é gravado primeiro no aparelho e enviado depois. Funciona offline e reenvia quando a internet volta. Em conflito, vale a mudança mais recente.
- **Mídia**:
  - miniaturas de tudo ficam no Storage e em cache no aparelho;
  - stories (imagem e vídeo em 480p) ficam no Storage por **7 dias**, que cabem no plano Free com 50 perfis; depois, só a miniatura;
  - os vídeos dos posts tocam pelo link do Instagram, que o trabalhador renova quando expira.
- Se um dia a sincronização caseira ficar complicada, dá para trocar por **PowerSync** (sincronização Postgres → SQLite pronta, com plano gratuito) sem mudar a interface.

### 3.3 Supabase ou algo melhor?

| Opção | Bom | Ruim para este caso | Veredito |
|---|---|---|---|
| **Supabase** | Banco, login, arquivos, tempo real, funções e agendamento juntos; backups; plano grátis; você já usa; conector disponível aqui | A pesquisa no celular não pode ser direto no Postgres (seria lenta pela rede), mas isso já está resolvido pela cópia local | ✅ **Fica** |
| Turso (SQLite na nuvem com réplicas locais) | Mesmo SQLite em todo lugar | Não tem login, arquivos nem agendamento; seriam mais 3 serviços | Não compensa |
| Firebase | Offline bom no celular | Sem pesquisa de texto; banco NoSQL complica ordenações e análises | Pior |
| PocketBase no próprio servidor | Barato, tudo num binário | Backup e manutenção ficam com você; não serve para a opção gratuita em casa | Pior para quem não quer cuidar de servidor |
| Convex | Tempo real excelente | Pesquisa limitada, sem modo offline | Pior |

**Conclusão:** não há opção claramente melhor. Supabase + cópia local no aparelho é a melhor combinação de velocidade, custo e simplicidade.

---

## 4. Coleta (no trabalhador)

| Tarefa | Frequência (50 perfis) | Detalhe |
|---|---|---|
| Posts novos | a cada 1–2 h, em rodízio | Para no primeiro post já conhecido. Perfis com prioridade alta vão primeiro. |
| Stories | a cada 2–3 h | Baixa na hora e grava no Storage. |
| Métricas ("fotografias") | 1 h, 6 h, 24 h, 3 d, 7 d, 30 d após o post | Curva de crescimento de cada post. |
| Comentários | 6 h e 48 h após o post; e na hora, quando você abre um post | Até 300 por post, com curtidas e nº de respostas; respostas dos mais curtidos. |
| Transcrição e OCR | assim que o post chega | ~1–2 min de CPU por reel de 1 min. Com 50 perfis, cabe folgado. |

- **Ritmo seguro:** 1 pedido a cada 4–8 s, com variação aleatória, nunca dois ao mesmo tempo, e silêncio de madrugada (como uma pessoa). Cerca de 300–500 pedidos por dia.
- **Pausas automáticas:** no 429 ou em "checkpoint", pausa de 30 min a 6 h (igual ao `DATES_BLOCKED` do Garimpo, só que mais longa). Durante a pausa, a fonte B cobre os perfis comerciais.
- **Login da conta secundária:** você faz pela tela de Ajustes do app (inclusive código de verificação em 2 etapas). A sessão fica **criptografada** no trabalhador e a senha não é guardada.
- **instaloader atualizado sozinho** a cada 3 dias (ideia do `update_ytdlp_later`).
- No app, um cartão de estado fala com calma: *"Última atualização há 12 min. O Instagram pediu uma pausa; volto às 14:40."*

---

## 5. Ordenação

### 5.1 O clique

```
Ordenar:  [ Data ]  [ Visualizações ]  [ Curtidas ]  [ Comentários ]  [ Engajamento ]  [ Relevância ]
```

Cada chip gira entre três estados:

```
desligado → ↓ mais (mais recente / mais visto …) → ↑ menos (mais antigo / menos visto …) → desligado
```

- 1º clique em **Data** = mais recentes; 2º clique = mais antigos; 3º desliga.
- O texto do chip muda junto ("Mais recentes" → "Mais antigos").
- Vários chips ligados **combinam**. Uma bolinha mostra a ordem em que foram ligados (①, ②).

### 5.2 "Mais recente e mais visto ao mesmo tempo"

Seletor discreto ao lado dos chips:

1. **Equilibrado** (padrão): cada post recebe uma nota de 0 a 100 em cada critério ligado (percentil entre os posts na tela, invertido quando o chip está em "menos"), e a ordem é pela média. Um post de ontem com muitas views passa à frente de um de hoje com poucas e de um viral de 2 anos atrás. Dá para dar mais peso a um critério (1×, 2×, 3×).
2. **Em sequência**: ordena pelo ① e desempata pelo ②. Com Data em ①, agrupa por dia, semana ou mês.

```
nota(post) = Σ peso_i × percentil_i(post) / Σ peso_i
```

O cálculo é feito no aparelho, em milissegundos.

### 5.3 Critérios

| Critério | ↓ Mais | ↑ Menos | Observação |
|---|---|---|---|
| Data | mais recente | mais antigo | Sempre disponível. |
| Visualizações | mais visto | menos visto | Só reels e vídeos têm. Fotos vão para o fim com a etiqueta "sem contagem". |
| Curtidas | mais curtido | menos curtido | Alguns perfis escondem as curtidas. |
| Comentários | mais comentado | menos comentado | |
| Engajamento | (curtidas + comentários) ÷ seguidores | inverso | Compara perfil pequeno com grande. |
| Relevância | mais relevante | menos relevante | Ver abaixo. |

**Relevância**
- **Com texto na busca**: pontuação BM25 do FTS5 com pesos (legenda 3, fala 2, texto da imagem 1,5, hashtags 1,5, comentários 0,5), mais um bônus leve para posts recentes e para os perfis prioritários.
- **Sem texto**: quanto o post foi **acima do normal do perfil** × decaimento suave com o tempo × bônus para perfis que você abre mais.

A ordem escolhida fica guardada **por playlist**.

---

## 6. Pesquisa e temas

### 6.1 Por que é rápida

- A pesquisa roda **no aparelho**, na cópia local, e nunca espera a internet.
- FTS5 sem acento ("revolucao" acha "revolução") e por prefixo, enquanto você digita (com 80 ms de folga entre teclas e cancelando a pesquisa anterior).
- Resultados em páginas de 60, lista virtualizada e miniaturas em cache.
- Meta medida em teste automático com 100 mil posts falsos: **< 50 ms no PC, < 150 ms no celular**. Com 50 perfis você terá uns 10–30 mil posts em poucos anos, ou seja, bem abaixo disso.

### 6.2 Sintaxe (opcional)

`"frase exata"` · `-palavra` (exclui) · `@perfil` · `#hashtag` · `tema:ansiedade` · `em:fala` / `em:legenda` / `em:comentarios` / `em:imagem` · `tipo:reel`

Cada resultado mostra **onde achou**: "na legenda", "no vídeo, aos 1:42", "num comentário de @fulano", "escrito na imagem 3 do carrossel".

**Buscas recentes** e **"Acompanhar esta busca"**: os posts novos que baterem com ela aparecem marcados e podem gerar notificação (opcional).

### 6.3 O que é falado e escrito dentro do post

1. Reel ou vídeo → **faster-whisper** em português → texto com marcação de tempo. Clicar num trecho leva o vídeo até ele.
2. Foto ou carrossel → **OCR** do texto da arte (muito comum em carrosséis educativos).

### 6.4 Temas

- **Seus temas:** você cria "Ansiedade", "Receitas veganas"… com algumas palavras-chave. Todo post cuja legenda, fala ou texto da imagem tiver essas palavras entra no tema.
- **Temas sugeridos:** o trabalhador agrupa posts parecidos e propõe: *"Achei 140 posts que parecem falar de produtividade. Criar um tema?"*
- **Busca pelo sentido** (opcional): "medo de falar em público" acha posts que não usam essas palavras.
- Temas viram pílulas de filtro, combináveis com playlists e ordenação.

---

## 7. Análise de sucesso

### 7.1 Em cada post (aba Desempenho)

```
Desempenho
  3,4× acima do normal de @fulano          (mediana dos últimos 30 posts dele)
  Engajamento 6,2% (média do perfil: 2,1%)
  ▁▂▅█▇▅▃▂  views nas primeiras 72 h       (das "fotografias")
  Melhor que 92% dos posts desta playlist
  Por que pode ter ido bem: reel curto (18 s), sábado às 19h,
  tema "rotina", gancho falado nos 2 primeiros segundos.
```

O "por que pode ter ido bem" sai de regras simples (formato, duração, dia e horário comparados com os melhores posts do perfil), sempre como hipótese.

### 7.2 Aba Análise

- **Por perfil:** frequência, melhor dia/horário, formato que mais funciona, temas fortes, top 10.
- **Por playlist:** quem está subindo ou caindo, posts acima do normal da semana.
- **Comparações:** reel × carrossel × foto; duração × views; hashtags e temas dos melhores posts.
- **vidIQ:** comparar um post com outliers do Instagram/TikTok sobre o mesmo assunto.
- **Exportar:** CSV, Planilhas Google, JSON.

---

## 8. Telas e funcionalidades

### 8.1 Início (feed)
- Faixa de stories no topo (anel dourado = não visto).
- Lateral (PC) ou seletor no topo (celular) com as **playlists** e o número de novidades em cada uma.
- Barra de ordenação (seção 5) + filtros: tipo, período, tema, "só não vistos", "só salvos", views mínimas.
- Marca **Novo** desde a última visita. No fim: *"Pronto, você está em dia."*
- Modos **Lista** (miniatura + texto, para ler e comparar) e **Grade**.
- Em cada post: Salvar, Ocultar, Abrir no Instagram, Copiar link. No celular: deslizar para salvar ou ocultar, com "desfazer".

### 8.2 Post completo
- Carrossel, vídeo com velocidade, legenda com hashtags e menções clicáveis.
- Abas: **O que é dito** (transcrição com tempos, palavras pesquisadas grifadas) · **Comentários** · **Desempenho**.
- Atalhos no PC: `←` `→`, `Esc`, `S`.

### 8.3 Comentários
- Ordenar: **Mais curtidos · Mais respondidos · Mais recentes · Mais antigos** (2º clique inverte).
- Pesquisar dentro dos comentários; selo "respondido pelo perfil"; respostas recolhidas.

### 8.4 Stories
- Tela cheia, barra de progresso fina; tocar à esquerda volta, à direita avança, segurar pausa; setas no PC.
- Guardados por 7 dias com mídia e para sempre como miniatura + texto falado/escrito (dá para pesquisar story antigo).
- Destaques de cada perfil na página do perfil.

### 8.5 Perfis
- Caixa **"Cole um ou vários perfis"**. Aceita:
  - `instagram.com/fulano`, `@fulano`, `instagram.com/fulano/reels`;
  - link de post ou reel (o app descobre o dono);
  - arquivos `.txt` `.csv` `.json` `.html`, arrastando para qualquer lugar;
  - o **`following.json`** de "Baixar suas informações" do Instagram, para importar todos que você segue e depois escolher quais acompanhar (limite de ~50).
- Leitura robusta, herdada do `extract_sources` do Garimpo: ignora e-mails, tira pontuação, junta duplicados, aceita `link<TAB>nome<TAB>playlist`.
- "Verificando…" → avatar, nome, seguidores; **Tentar de novo**; aviso para perfil privado ("a conta secundária precisa seguir esse perfil").
- Por perfil: playlists (várias), no feed sim/não, prioridade, remover. Exportar a lista.

### 8.6 Playlists
- Nome, cor, emoji. Um perfil em várias. Reordenar arrastando.
- Feed por playlist ou combinando várias.
- Cada playlist lembra a sua ordenação preferida.

### 8.7 Ajustes
- Conta secundária (entrar, sair, estado da sessão).
- Ritmo da coleta (Calmo / Normal) e horário de silêncio.
- Notificações (story novo de quem você escolher, busca acompanhada).
- Espaço usado; quanto tempo guardar stories.
- Exportar tudo; sair deste aparelho.

---

## 9. Estética "humanizada"

### 9.1 Princípios
1. **Calma, não vício.** Sem números vermelhos, sem rolagem infinita, sem autoplay com som. O feed termina.
2. **Papel e tinta.** Fundo de papel, tinta azul-petróleo, cartões como fichas de leitura.
3. **Fala como gente.** Primeira pessoa e português de conversa: *"Achei 3 perfis no arquivo. Um já estava na lista."*
4. **O conteúdo é a cor.** A interface fica quieta em volta das fotos.
5. **Feita para ler.** Texto 17 px, contraste AA, foco visível, tudo no teclado e no leitor de tela.

### 9.2 Família visual (a mesma do Garimpo, com acento próprio)

```css
:root{
  --paper:#EEF1EC; --surface:#F8FAF7; --ink:#1D2B36; --soft:#56656D; --line:#CBD4CE;
  --green:#2F5D50; --green-wash:#DCE7E1;    /* ações principais */
  --gold:#E3B23C;  --gold-wash:#F6E7BF;     /* novo, story não visto, foco */
  --clay:#B5603F;  --clay-wash:#F3DED4;     /* acento do Mirante (terracota) */
  --serif:"Literata",Georgia,serif;
  --sans:"Atkinson Hyperlegible",system-ui,sans-serif;
  --radius:14px; --shadow:0 1px 0 rgba(29,43,54,.06),0 8px 24px rgba(29,43,54,.06);
}
@media (prefers-color-scheme:dark){ :root:not([data-theme=light]){
  --paper:#10191D; --surface:#172328; --ink:#E3E9E5; --soft:#9AABA5; --line:#2C3B40;
  --green:#86C3AC; --gold:#E8BE52; --clay:#E39274;
}}
```

- Títulos em **Literata**, texto em **Atkinson Hyperlegible**, fontes guardadas no app (funciona offline).
- Ícones de traço arredondado (1,75 px). Logo: um mirante com sol dourado, no traço da pepita do Garimpo.
- Movimento de 150–200 ms; respeita "reduzir movimento".

### 9.3 Layout

**Computador (≥ 1100 px)**

```
┌──────────────┬──────────────────────────────────┬───────────────────────┐
│ Mirante      │ ◯ ◯ ◯ ◯ ◯ ◯   (stories)          │                       │
│              │ Ordenar: [Mais recentes①][Mais   │   POST ABERTO         │
│ Início    12 │  vistos②]  · Equilibrado ▾       │   mídia               │
│ Buscar       │ ──────────────────────────────── │   legenda             │
│ Perfis    48 │ ┌────┐ @fulano · há 2 h  Novo    │   [O que é dito]      │
│ Análise      │ │foto│ Legenda em duas linhas…   │   [Comentários]       │
│              │ └────┘ 12 mil views · 3,4× acima │   [Desempenho]        │
│ PLAYLISTS    │ ┌────┐ @beltrano · ontem         │                       │
│ ● Filosofia 5│ │foto│ …                         │                       │
│ ● Receitas  2│ └────┘                           │                       │
│ + Nova       │                                  │                       │
└──────────────┴──────────────────────────────────┴───────────────────────┘
```

**Celular**

```
┌──────────────────────────┐
│ Mirante       Filosofia ▾│
│ ◯ ◯ ◯ ◯ ◯  →             │
│ [Recentes①][Vistos②]  ⚙  │
│ ┌──────────────────────┐ │
│ │        foto          │ │
│ └──────────────────────┘ │
│ @fulano · há 2 h · Novo  │
│ Legenda…                 │
│ 12 mil views · 3,4×      │
├──────────────────────────┤
│ Início Buscar Perfis Análise │
└──────────────────────────┘
```

### 9.4 Textos da interface

| Situação | Texto |
|---|---|
| Sem perfis | **Comece pelos perfis de que você gosta.** Cole os links aqui, um por linha, ou envie o arquivo de quem você segue. |
| Coleta pausada | O Instagram pediu uma pausa. Volto às 14:40; enquanto isso, o que já chegou está todo aqui. |
| Sem internet | Sem internet agora. Você continua vendo e pesquisando tudo o que já chegou. |
| Fim do feed | Pronto, você está em dia. |
| Busca vazia | Nada com essas palavras. Experimente uma palavra só, ou pesquise também nos comentários. |
| Perfil privado | Esse perfil é privado. Ele só aparece se a conta secundária seguir ele. |
| Story antigo | Esse story já saiu do ar, mas eu guardei uma cópia. |

---

## 10. Estrutura do código

```
mirante/
├─ app/                        # interface (Svelte) — PWA, Tauri desktop e mobile
│  ├─ src/lib/db/              # SQLite local, FTS5, sincronização
│  ├─ src/lib/sort.ts          # chips, percentis, equilibrado/sequência
│  ├─ src/lib/search.ts        # sintaxe → consulta FTS
│  ├─ src/components/          # PostCard, PostPanel, StoryViewer, CommentList, SortBar, TagSidebar…
│  ├─ src/routes/              # Inicio, Buscar, Perfis, Analise, Ajustes
│  └─ src/styles/tokens.css
├─ worker/                     # trabalhador (Python)
│  ├─ collector/               # queue.py, source_session.py (A), source_graph.py (B)
│  ├─ enrich/                  # transcribe.py, ocr.py, themes.py, describe.py
│  ├─ analytics.py             # outlier, engajamento, curvas
│  ├─ importers.py             # perfis a partir de qualquer texto/arquivo
│  └─ Dockerfile               # o mesmo para nuvem, Raspberry ou Android
├─ supabase/
│  ├─ migrations/              # tabelas, índices, RLS
│  └─ functions/               # login da conta secundária, pedidos "atualizar agora"
├─ desktop/  mobile/           # empacotamento Tauri
└─ tests/                      # pytest + Playwright + teste de velocidade
```

---

## 11. O que reaproveitar do Garimpo (só o jeito, não a parte de YouTube)

| No Garimpo | No Mirante |
|---|---|
| `extract_sources` | `importers.py` com as regras do Instagram e o `following.json` |
| `resolve` em segundo plano + "Verificando…" + "Tentar de novo" | Verificação de perfis |
| `DATES_BLOCKED` (pausa no 429) | Pausas do coletor |
| `update_ytdlp_later` | Atualização do instaloader |
| Escrita atômica, cópia do arquivo corrompido | Transações no banco + backup do Supabase |
| `local_host()` + cabeçalho próprio | Login do Supabase + RLS + chamadas assinadas |
| Streaming aos poucos + `requestAnimationFrame` | Posts entrando em tempo real sem travar a tela |
| Reaproveitar as linhas (`rows`) para não piscar | Lista virtualizada com chave estável |
| "Acompanhar esta busca" e marca "Novo" | Igual |
| Paleta, fontes, tom dos textos, `teste.py` | Base do visual e dos testes |

---

## 12. Fases de entrega

| Fase | Entrega | Pronto quando |
|---|---|---|
| **1. Funciona no celular** | Supabase (tabelas, login, RLS, Storage); trabalhador com fonte A (posts, stories, comentários, métricas); perfis (colar, arquivo, `following.json`); playlists; feed com a ordenação completa; post completo; comentários ordenáveis; stories; pesquisa na legenda e nos comentários; **PWA instalável no celular** com cópia local. | Com o PC desligado, o celular mostra posts e stories novos, ordena e pesquisa em < 150 ms, inclusive sem internet. |
| **2. Entender o conteúdo** | Transcrição, OCR, pesquisa "no que é dito" com pulo para o tempo, temas por palavras-chave, temas sugeridos. | Pesquisar uma frase dita num reel e cair no segundo exato. |
| **3. Análise** | Aba Desempenho, aba Análise, vidIQ, exportações; fonte B como reserva. | Ver os posts "acima do normal" da semana de cada playlist. |
| **4. Apps instalados** | Tauri para Windows e Android (iOS se precisar), notificações, ícone. | Instalar sem navegador. |

---

## 13. Qualidade, segurança e privacidade

- **Testes:** leitura de perfis em todos os formatos, cada combinação de ordenação, pesquisa sem acento, fila respeitando pausas, sincronização com e sem internet. Respostas do Instagram gravadas em arquivo, para os testes não dependerem dele.
- **Playwright:** colar perfis, ordenar, pesquisar, abrir post e story, modo offline; fotos de tela em celular e PC, claro e escuro.
- **Velocidade:** teste automático com 100 mil posts falsos.
- **Segredos:**
  - a sessão da conta secundária fica criptografada no trabalhador;
  - nada sensível fica no aparelho.
- **Acesso:** login do Supabase só para você; RLS em todas as tabelas; o trabalhador usa uma chave própria que fica só no servidor.
- **Uso pessoal:** o conteúdo de terceiros é guardado só para você ler. Não é republicado nem compartilhado.

---

## 14. Riscos

| Risco | Chance | Resposta |
|---|---|---|
| Instagram bloquear a conta secundária | Média | Ritmo humano, IP residencial fixo, pausas longas, fonte B de reserva. A sua conta principal nunca é usada. |
| Instagram mudar o site e quebrar a coleta | Alta, de vez em quando | Atualização automática do instaloader, fontes plugáveis, aviso claro no app. O que já foi coletado continua disponível. |
| Espaço do Supabase Free acabar | Baixa com 50 perfis | Stories com mídia só por 7 dias; miniaturas pequenas; aviso aos 80%. |
| Trabalhador cair | Baixa (nuvem) / média (em casa) | Reinício automático; o app mostra "última atualização há X" e um aviso se passar de 6 h. |

---

## 15. O que preciso de você para começar

> **Atualização (30/out):** a Fase 1 já foi programada (app, trabalhador e banco). Falta só criar as contas: o passo a passo está em `INSTALAR.md`.

1. **Onde roda o trabalhador:** nuvem com IP residencial fixo (recomendado, ~R$ 50–75/mês no total) ou aparelho em casa (grátis).
2. **Uma conta secundária do Instagram** que siga os perfis privados que você quiser ver. O login é feito por você, no app.
3. **Um projeto novo no Supabase** (separado do da hamburgueria). As tabelas eu crio pelo conector.
5. **Um repositório novo, `mirante`**, para o código, em vez desta pasta dentro da hamburgueria.
6. *(Fase 3)* Uma conta Criador ligada a uma Página do Facebook, para a fonte B. Eu guio o passo a passo.

---

## 16. Ferramentas

- **Lidos do Garimpo:** `garimpo.py`, `index.html`, `teste.py`, `iniciar.bat`, `dados.json`, `datas.json`, como referência de arquitetura, visual e textos.
- **vidIQ** (conectado): conferido o que entrega para Instagram; entra na aba Análise.
- **Supabase** (conectado): banco, login, arquivos e funções.
- **Context7:** documentação atual de Svelte, Tauri, Supabase e instaloader na hora de programar.
- **Playwright** (instalado): testes e capturas.
- **Refero e Figma:** não conectaram nesta sessão (bloqueio de rede). Se quiser protótipos visuais lá, é preciso reconectá-los.
