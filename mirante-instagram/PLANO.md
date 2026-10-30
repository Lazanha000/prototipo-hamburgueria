# Mirante — planejamento completo

> Um "Garimpo" para o Instagram: acompanhar os perfis de que você gosta, ver os posts e os stories, ler os comentários, pesquisar tudo muito rápido e entender o que fez cada post dar certo.
> Funciona no navegador, como programa de computador e como aplicativo de celular.
>
> **Decidido em 30/out/2026:** um app só, o **Mirante**, com Instagram **e** YouTube juntos (o Garimpo vira uma parte dele). Até ~50 perfis do Instagram. Precisa funcionar no celular com o PC desligado. Pode usar o Claude. Fonte de dados: a que entregar mais do que foi pedido. **As decisões e o que elas mudam estão na seção 17**, que vale por cima de qualquer trecho anterior.

---

## 0. Resumo em 1 minuto

| Pergunta | Resposta curta |
|---|---|
| Dá para fazer tudo o que foi pedido? | Quase tudo. Posts, stories, comentários, ordenações combinadas, pesquisa na legenda e no que é falado no vídeo, playlists, análise de sucesso e filtro por tema: **sim**. O que trava é o Instagram, não o código. Veja a seção 1. |
| De onde vêm os dados? | De um **coletor** que roda no seu PC (igual ao Garimpo com o yt-dlp), usando o **instaloader** com a sua sessão, e a **API oficial da Meta** como plano B, mais seguro e mais limitado. |
| Como fica rápido? | Tudo é guardado num banco **SQLite com índice de texto (FTS5)** no aparelho. A pesquisa não vai à internet: responde em menos de 50 ms, mesmo com 100 mil posts. |
| Um código só para site, PC e celular? | Sim. A interface é um único app web (**Svelte + Vite**), empacotado com **Tauri 2** para Windows e celular. O celular sincroniza pelo **Supabase**, que você já usa na hamburgueria. |
| E o visual? | O DNA do Garimpo: papel, serifa Literata, Atkinson Hyperlegible, textos acolhedores, nada de "vício de rolagem". Ganha um acento próprio, cor de barro/terracota. |
| Por onde começar? | Fase 1 (seção 12): versão de computador com feed, perfis, playlists e pesquisa. É o Garimpo de novo, só que com fotos. |

---

## 1. A verdade sobre o Instagram (antes de tudo)

O YouTube deixa ler quase tudo sem login. O Instagram não. Isso decide a arquitetura.

### 1.1 Três jeitos de obter os dados

| Fonte | O que entrega | O que **não** entrega | Risco |
|---|---|---|---|
| **A. Sessão própria** (instaloader + API web interna, logado com uma conta sua) | Posts, reels, carrosséis, **stories e destaques**, **comentários com curtidas e respostas**, visualizações de reels, vídeo e áudio para transcrever | Perfis privados que você não segue | Fere os Termos do Instagram. Pode pedir verificação ou bloquear temporariamente a conta se for rápido demais. **Use uma conta secundária** e o coletor devagar, do seu PC. |
| **B. API oficial (Instagram Graph API, "Business Discovery")** | Posts de perfis **comerciais/criadores**: legenda, data, tipo, curtidas, nº de comentários, link | Stories de outros, **texto dos comentários de outros**, perfis pessoais e, na prática, visualizações | Nenhum. Exige uma conta Criador/Empresa ligada a uma Página do Facebook e um app na Meta (gratuito, uns 20 min de configuração). |
| **C. Serviços pagos** (Apify, vidIQ — o vidIQ já está conectado aqui) | Perfil, até 12 reels por perfil com plays/curtidas, **busca de "outliers"** (posts que foram muito melhor que a média do criador) | Stories, comentários completos, histórico longo | Nenhum, mas custa créditos por consulta. |

> O que o Instagram **não expõe para ninguém**: a "API Basic Display" foi desligada em dez/2024, e não existe forma oficial de ler stories de terceiros. Tudo que mostra stories de outros usa o caminho A.

### 1.2 Recomendação

- **Coletor com fontes plugáveis**, igual o Garimpo faz com `search_fast` → cai no yt-dlp:
  1. **Fonte A como principal**, com limites conservadores: no máximo ~1 pedido a cada 3–6 s, pausa longa ao receber 429 (como o `DATES_BLOCKED` do Garimpo), roda **no seu PC** (IP de casa; servidores em nuvem são bloqueados muito mais rápido).
  2. **Fonte B como plano B** automático para perfis comerciais quando a A estiver pausada.
  3. **Fonte C só na aba Análise**, para comparar com o "resto do Instagram".
- O coletor guarda **tudo localmente** assim que vê. Stories somem em 24 h: o Mirante baixa a mídia na hora e mantém por quanto tempo você quiser.
- O instaloader é atualizado sozinho a cada 3 dias (mesma ideia do `update_ytdlp_later`).

### 1.3 Pedidos e viabilidade

| Pedido | Viável? | Como |
|---|---|---|
| Últimos posts dos perfis que gosto | ✅ | Coleta incremental: só busca o que é mais novo que o último post guardado. |
| Ver stories | ✅ (fonte A) | Anel no avatar, visualizador em tela cheia, guardados localmente. |
| Post completo com comentários | ✅ (A) / parcial (B) | Painel do post com mídia, legenda, transcrição e comentários. |
| Ordenar por recente/visualizado/relevância e o inverso, combinando | ✅ | Seção 5. |
| Pesquisar na legenda | ✅ | FTS5, sem acento, com prefixo. |
| Pesquisar **no que é falado** dentro do post | ✅ | Transcrição local do áudio (faster-whisper) e leitura do texto das imagens (OCR). Seção 6. |
| Aba de perfis, colar vários links ou arquivo | ✅ | Inclusive o `following.json` do "Baixar suas informações" do Instagram, que traz **todos** os perfis que você segue. |
| Playlists de perfis (tags) | ✅ | Seção 4.4. |
| Comentários mais curtidos / mais respondidos / mais recentes | ✅ (A) | Seção 4.3. |
| Análise de sucesso de cada post | ✅ | Seção 7. Fica melhor com o tempo, porque o Mirante tira "fotografias" dos números. |
| Integração com outro app | ✅ | vidIQ (outliers), exportar para Planilhas/CSV, Notion opcional. |
| Filtrar por tema | ✅ | Classificação automática por IA (Claude Haiku) e busca por significado. Seção 6.3. |

---

## 2. Arquitetura

```
 ┌──────────────────────────── SEU PC (Windows) ────────────────────────────┐
 │                                                                          │
 │  Mirante.exe (Tauri 2)                                                   │
 │   ├─ Interface (Svelte)  ◄──── http://127.0.0.1:87xx ────┐               │
 │   └─ "sidecar" Python (FastAPI)                          │               │
 │        ├─ Coletor  ── fontes A / B / C ──► Instagram     │               │
 │        ├─ Fila de trabalho (perfis, stories, métricas)   │               │
 │        ├─ Transcrição (faster-whisper) e OCR             │               │
 │        ├─ Temas (Claude Haiku, opcional)                 │               │
 │        ├─ SQLite + FTS5   ◄──────────────────────────────┘               │
 │        └─ Pasta de mídia (miniaturas .webp, stories, vídeos)             │
 │                         │                                                │
 └─────────────────────────┼────────────────────────────────────────────────┘
                           │ sincroniza (só o que mudou)
                           ▼
                 ┌──────────────────┐        ┌──────────────────────────┐
                 │ Supabase         │◄──────►│ Celular (app Tauri/PWA)  │
                 │ Postgres + Auth  │        │ SQLite local + mesma UI  │
                 │ + Storage        │        │ pesquisa offline         │
                 └──────────────────┘        └──────────────────────────┘
                           ▲
                           └──── Site (mesma UI, navegador) ─ lê do Supabase
```

### 2.1 Por que assim

- **O coletor fica no PC** porque é o único lugar onde o Instagram tolera a coleta, e porque já é assim no Garimpo (que você conhece e funciona).
- **O celular não coleta.** Ele recebe o que o PC já guardou. Pesquisa em cópia local: rápido mesmo no 4G ou sem internet.
- **Supabase** é opcional na Fase 1. Sem ele, o celular ainda pode abrir o Mirante do PC pela mesma rede Wi-Fi (ou de qualquer lugar com Tailscale).
- **Uma interface só** para os três lugares; só muda o "endereço" dos dados (PC local, ou Supabase).

### 2.2 Tecnologias

| Camada | Escolha | Motivo |
|---|---|---|
| Coletor e servidor local | **Python 3.12 + FastAPI + uvicorn** | Reaproveita o jeito do `garimpo.py`: pools de threads, cache, NDJSON em streaming, escrita atômica, segurança por cabeçalho próprio. |
| Coleta | **instaloader** (fonte A), `httpx` para a Graph API (B), conector vidIQ / Apify (C) | O instaloader é o "yt-dlp do Instagram": mantido pela comunidade e acompanha as mudanças do site. |
| Banco | **SQLite (WAL) + FTS5** | Um arquivo, zero instalação, busca de texto instantânea. |
| Transcrição | **faster-whisper** modelo `small` em pt (CPU) | Grátis, local, ~1× tempo real num PC comum. Roda à noite/ociosamente. |
| OCR | **RapidOCR** (ONNX) | Lê o texto que vem escrito nas imagens e carrosséis. |
| Temas | **Claude Haiku** via API (opcional) + embeddings locais `multilingual-e5-small` | Haiku etiqueta; embeddings permitem "buscar pelo sentido". |
| Interface | **Svelte 5 + Vite + TypeScript** | Fica muito perto de HTML/CSS puro (como o Garimpo) e é leve. |
| Lista enorme | Lista virtualizada (só desenha o que está na tela) | Rolagem lisa com milhares de posts. |
| PC | **Tauri 2** + sidecar Python empacotado (PyInstaller) | Vira `Mirante.exe` com ícone, sem `.bat`, ~15 MB de interface. |
| Celular | **Tauri 2 mobile** (Android/iOS) ou PWA instalável | Mesma interface. A PWA vem primeiro (mais rápida de entregar). |
| Nuvem | **Supabase** (Postgres + Auth + Storage) | Já está nos seus conectores e você já usa. |
| Testes | `pytest` (como o `teste.py`) + **Playwright** | Playwright já vem instalado neste ambiente. |

---

## 3. Dados

### 3.1 Tabelas (SQLite; o Supabase espelha as mesmas)

```sql
-- perfis que você acompanha
CREATE TABLE profiles (
  id            TEXT PRIMARY KEY,          -- id numérico do Instagram
  handle        TEXT UNIQUE NOT NULL,      -- sem @, minúsculo
  name          TEXT, bio TEXT, avatar_path TEXT,
  followers     INTEGER, following INTEGER, posts_count INTEGER,
  is_business   INTEGER, is_private INTEGER,
  status        TEXT DEFAULT 'pending',    -- pending | ok | error | private
  on_feed       INTEGER DEFAULT 1,         -- "Nas buscas", como no Garimpo
  last_post_at  INTEGER, last_checked_at INTEGER,
  added_at      INTEGER
);

-- playlists = etiquetas; um perfil pode estar em várias
CREATE TABLE tags        (id INTEGER PRIMARY KEY, name TEXT UNIQUE, color TEXT, emoji TEXT, position INTEGER);
CREATE TABLE profile_tags(profile_id TEXT, tag_id INTEGER, PRIMARY KEY(profile_id, tag_id));

CREATE TABLE posts (
  id          TEXT PRIMARY KEY,            -- shortcode (o pedaço do link /p/XXXX)
  profile_id  TEXT NOT NULL,
  kind        TEXT,                        -- image | carousel | reel | video
  taken_at    INTEGER NOT NULL,            -- data exata, em segundos
  caption     TEXT, hashtags TEXT, mentions TEXT,
  location    TEXT, duration REAL,
  likes INTEGER, comments INTEGER, views INTEGER,   -- últimos números vistos
  is_pinned   INTEGER, is_collab INTEGER,
  thumb_path  TEXT,
  transcript  TEXT, ocr_text TEXT,         -- "o que se fala/escreve no post"
  lang        TEXT,
  score_outlier REAL,                      -- quantas vezes acima do normal do perfil
  seen_at     INTEGER, saved INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0
);
CREATE INDEX posts_profile_time ON posts(profile_id, taken_at DESC);
CREATE INDEX posts_time  ON posts(taken_at DESC);
CREATE INDEX posts_views ON posts(views DESC);

CREATE TABLE media   (post_id TEXT, idx INTEGER, kind TEXT, path TEXT, w INTEGER, h INTEGER, PRIMARY KEY(post_id, idx));

-- "fotografias" dos números ao longo do tempo: é o que permite medir sucesso
CREATE TABLE metrics (post_id TEXT, at INTEGER, likes INTEGER, comments INTEGER, views INTEGER, PRIMARY KEY(post_id, at));

CREATE TABLE stories (
  id TEXT PRIMARY KEY, profile_id TEXT, taken_at INTEGER, expires_at INTEGER,
  kind TEXT, path TEXT, thumb_path TEXT, transcript TEXT, ocr_text TEXT,
  links TEXT, seen_at INTEGER, in_highlight TEXT
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY, post_id TEXT, parent_id TEXT,   -- parent_id preenchido = resposta
  author TEXT, text TEXT, created_at INTEGER,
  likes INTEGER, replies INTEGER, by_owner INTEGER     -- o próprio perfil respondeu?
);
CREATE INDEX comments_post ON comments(post_id, likes DESC);

CREATE TABLE themes      (id INTEGER PRIMARY KEY, name TEXT UNIQUE, description TEXT, auto INTEGER);
CREATE TABLE post_themes (post_id TEXT, theme_id INTEGER, confidence REAL, PRIMARY KEY(post_id, theme_id));

CREATE TABLE saved_searches (id INTEGER PRIMARY KEY, q TEXT, filters TEXT, seen TEXT, at INTEGER); -- "Acompanhar esta busca"

-- índice de pesquisa: sem acento, com prefixo ("revolu" acha "revolução")
CREATE VIRTUAL TABLE posts_fts USING fts5(
  caption, transcript, ocr_text, hashtags, comments_text, profile_name,
  content='', tokenize="unicode61 remove_diacritics 2", prefix='2 3 4'
);
```

### 3.2 Coleta: o que roda e quando

| Tarefa | Frequência | Detalhe |
|---|---|---|
| Novos posts de cada perfil | a cada 1–3 h, em rodízio | Para no primeiro post que já está no banco. Perfis que postam muito vão primeiro. |
| Stories | a cada 2–4 h | Baixa a mídia na hora (ela some em 24 h). |
| Métricas (fotografias) | 1 h, 6 h, 24 h, 3 d, 7 d, 30 d depois do post | Dá a curva de crescimento de cada post. |
| Comentários | ao abrir o post + 24 h depois | Guarda os 200 primeiros de cada ordenação. |
| Transcrição e OCR | quando o PC estiver ocioso | Começa pelos perfis marcados como prioridade. |
| Temas | em lote, depois da transcrição | Um pedido ao Claude a cada 20–50 posts. |

Tudo passa por **uma fila única com ritmo controlado** (um "porteiro"): nunca dois pedidos ao mesmo tempo para o Instagram e pausa automática de 15–60 min ao receber 429 ou "checkpoint". A tela mostra o estado com calma: *"Dei uma pausa de 20 min para o Instagram não reclamar. Volto às 14:40."*

---

## 4. Funcionalidades, tela por tela

### 4.1 Início (feed)

- Posts de todos os perfis ativos, ou de uma **playlist** escolhida na lateral.
- Faixa de **stories** no topo: avatares com anel dourado quando há story não visto.
- **Barra de ordenação** (seção 5) e **filtros**: tipo (foto, carrossel, reel), período, tema, "só não vistos", "só salvos", mínimo de visualizações.
- Marca **"Novo"** no que chegou desde a última visita (como as "novidades" do Garimpo).
- No fim, um ponto final de verdade: *"Pronto, você está em dia. Os próximos chegam quando eles postarem."* Sem rolagem infinita.
- Ações em cada card: **Salvar**, **Ocultar**, **Abrir no Instagram**, **Copiar link**.

### 4.2 Post completo (painel lateral no PC, tela cheia no celular)

- Mídia: carrossel deslizável, vídeo com controles e velocidade.
- Legenda completa com hashtags e menções clicáveis (filtram o feed).
- Aba **"O que é dito"**: transcrição com marcação de tempo; clicar num trecho pula o vídeo até ele. As palavras pesquisadas aparecem grifadas.
- Aba **Comentários** (4.3).
- Aba **Desempenho** (seção 7).
- Atalhos: `←`/`→` post anterior/próximo, `Esc` fecha, `S` salva.

### 4.3 Comentários

- Ordenar: **Mais curtidos · Mais respondidos · Mais recentes · Mais antigos** (mesmo clique duplo inverte, igual à barra principal).
- Caixa para **pesquisar nos comentários**.
- Selo "respondido pelo perfil" e filtro "só onde o autor respondeu".
- Respostas recolhidas ("ver 12 respostas").

### 4.4 Perfis

- Caixa grande **"Cole um ou vários perfis"** (mesmo padrão do Garimpo):
  - `https://instagram.com/fulano`, `@fulano`, `instagram.com/fulano/reels`,
  - link de **post ou reel** (`/p/…`, `/reel/…`): o Mirante descobre o dono,
  - **arquivos** `.txt`, `.csv`, `.json`, `.html`, arrastando para qualquer lugar da janela,
  - **`following.json`** do "Baixar suas informações" do Instagram: importa todos que você segue de uma vez.
- Leitura robusta igual ao `extract_sources`: ignora e-mails, remove pontuação final, junta duplicados (`@Fulano` e o link dele viram um só), aceita `link<TAB>nome<TAB>playlist`.
- Cada perfil verificado em segundo plano ("Verificando…" → avatar, nome, seguidores), com **Tentar de novo** se falhar e aviso claro se for privado.
- Por perfil: playlists (várias), "No feed" liga/desliga, prioridade (coleta mais frequente), remover.
- **Baixar lista de perfis** (exporta no mesmo formato que importa).

### 4.5 Playlists (etiquetas)

- Nome, cor e emoji opcional. Exemplo: *Filosofia*, *Receitas*, *Amigos*, *Concorrentes*.
- Um perfil pode estar em várias playlists.
- Na lateral do feed: cada playlist com o número de posts novos. Clicar mostra só aquela.
- Dá para combinar: "Filosofia **+** História" (união) ou só uma.
- Arrastar para reordenar; arrastar um perfil para cima de uma playlist adiciona.

### 4.6 Buscar

- Uma caixa grande com placeholder em serifa itálica (identidade do Garimpo): *"O que você quer reencontrar?"*
- Pesquisa **enquanto digita** (resultado em < 50 ms), sem acento, com prefixo e frase exata entre aspas.
- Sintaxe simples e opcional: `-palavra` exclui, `@perfil` restringe, `#hashtag`, `tema:ansiedade`, `em:comentarios` / `em:fala` / `em:legenda`.
- Cada resultado mostra **onde achou**: "na legenda", "no vídeo, aos 1:42", "num comentário".
- **Buscas recentes** e **"Acompanhar esta busca"**: na próxima vez, o que for novo aparece marcado.
- Busca "pelo sentido" (opcional): "posts sobre medo de falar em público" acha posts que nunca usam essas palavras.

### 4.7 Análise

Seção 7.

### 4.8 Ajustes

- Fontes de dados: conta usada pela fonte A (login uma vez, sessão guardada no cofre do Windows), app da Meta para a B, vidIQ/Apify para a C.
- Ritmo de coleta (Calmo / Normal), horário de silêncio.
- Quanto tempo guardar stories e vídeos; espaço usado em disco.
- Transcrição: ligada/desligada, modelo, só para playlists escolhidas.
- Temas com IA: ligado/desligado, chave da API, gasto do mês.
- Sincronização com o celular (Supabase): ligar e parear com um QR code.
- Backup e exportar tudo (JSON/CSV).

---

## 5. Ordenação: o pedido mais importante, explicado

### 5.1 Como funciona o clique

Uma fileira de "chips":

```
Ordenar:  [ Data ]  [ Visualizações ]  [ Curtidas ]  [ Comentários ]  [ Engajamento ]  [ Relevância ]
```

Cada chip tem **três estados** e o clique gira entre eles:

```
desligado  →  ↓ mais (mais recente / mais visto…)  →  ↑ menos (mais antigo / menos visto…)  →  desligado
```

- 1 clique em **Data** = mais recentes. 2º clique = mais antigos. 3º clique = desliga.
- O rótulo muda junto, para não exigir decorar setas: "Mais recentes" → "Mais antigos".
- Ligar mais de um chip **combina** os critérios. Uma bolinha numerada mostra a ordem em que foram ligados (①, ②).

### 5.2 Combinar "mais recente **e** mais visto ao mesmo tempo"

Existem duas ideias diferentes de "ao mesmo tempo", e o Mirante oferece as duas num seletor discreto:

1. **Equilibrado** (padrão): cada post ganha uma nota de 0 a 100 em cada critério ligado (o **percentil** dentro do que está na tela) e a ordem é pela média. Um post de ontem com muitas views passa na frente de um de hoje com poucas e de um viral de 2 anos atrás. É o que quase sempre se quer dizer com "os dois ao mesmo tempo".
   - Peso por critério: arrastar a bolinha ① para "pesa mais" (1×, 2×, 3×).
2. **Em sequência** (desempate): ordena pelo ① e, quando empata, pelo ②. Útil para "por dia, e dentro do dia, o mais visto": nesse caso a Data agrupa por dia/semana/mês.

```text
nota(post) = Σ peso_i × P_i(post)  /  Σ peso_i
P_i = percentil do post no critério i (invertido quando o chip está em "menos")
```

Calcular percentis em até 50 mil posts leva poucos milissegundos no navegador. Não precisa de servidor.

### 5.3 O que é cada critério

| Critério | Mais (↓) | Menos (↑) | Observação honesta |
|---|---|---|---|
| Data | mais recente | mais antigo | Data exata, sempre disponível. |
| Visualizações | mais visto | menos visto | Só reels e vídeos têm views. Fotos ficam no fim, com a etiqueta "sem contagem". |
| Curtidas | mais curtido | menos curtido | Alguns perfis escondem as curtidas. |
| Comentários | mais comentado | menos comentado | |
| Engajamento | (curtidas + comentários) ÷ seguidores | o inverso | Deixa comparar perfil pequeno com perfil gigante. |
| Relevância | mais relevante | menos relevante | Ver abaixo. |

**Relevância** muda conforme o contexto:
- **Com texto na busca**: BM25 do FTS5 com pesos (legenda 3, fala 2, texto da imagem 1,5, hashtags 1,5, comentários 0,5), um pequeno bônus para posts recentes e outro para os seus perfis prioritários.
- **Sem texto**: "relevante para você" = quanto o post foi **acima do normal daquele perfil** (seção 7) × um decaimento suave com o tempo × um bônus para perfis que você abre muito.

A ordem escolhida fica guardada por playlist: a playlist *Concorrentes* pode abrir sempre em "Mais vistos", e *Amigos* em "Mais recentes".

---

## 6. Pesquisa e temas

### 6.1 Por que é rápida

- **Tudo local**: SQLite + FTS5 no PC e uma cópia no celular. Nenhuma pesquisa depende do Instagram.
- `remove_diacritics 2`: "revolucao" acha "revolução"; `prefix` acha enquanto digita.
- Pesquisa com atraso de 80 ms entre teclas (debounce) e cancelamento da anterior (como o `AbortController` do Garimpo).
- Resultados chegam paginados (60 por vez) e a lista é **virtualizada**.
- Miniaturas pequenas (`.webp`, ~15 KB) guardadas em disco: não pisca nem baixa de novo.
- Meta medida nos testes: **< 50 ms** para 100 mil posts num PC comum; **< 150 ms** num celular médio.

### 6.2 "O que fala dentro do post"

O Instagram não entrega a legenda automática dos vídeos de forma confiável, então o Mirante faz a sua:

1. Reel/vídeo baixado → áudio extraído (ffmpeg) → **faster-whisper** em português → texto com tempos.
2. Foto/carrossel → **OCR** do texto escrito na arte (muito comum em posts de "carrossel educativo").
3. Opcional: **descrição da imagem** pelo Claude (para achar "post com gráfico", "foto de comida").
4. Tudo entra no índice com o campo de origem, para mostrar "achei no vídeo, aos 1:42".

Custo: grátis (tudo local), só gasta tempo de CPU. Um PC comum transcreve ~60 reels de 1 min por hora em segundo plano.

### 6.3 Filtro por tema

Dá, e de três jeitos que se somam:

- **Temas seus**: você cria "Ansiedade", "Marxismo", "Receitas veganas" com uma frase de descrição. O Claude Haiku lê legenda + transcrição e marca os posts (com confiança). Custo estimado: centavos por mil posts. O pedido é feito em lote e o resultado fica guardado para sempre.
- **Temas sugeridos**: o Mirante agrupa os posts parecidos (embeddings locais + agrupamento) e propõe nomes: *"Encontrei 140 posts que parecem falar de produtividade. Quer um tema para eles?"*
- **Hashtags** viram filtros automáticos.

Na interface, temas são pílulas no filtro, combináveis com playlists e com a ordenação.

---

## 7. Análise de sucesso

### 7.1 No painel de cada post

```
Desempenho
  3,4× acima do normal de @fulano          ← comparado à mediana dos últimos 30 posts dele
  Engajamento 6,2% (média do perfil: 2,1%)
  ▁▂▅█▇▅▃▂  views nas primeiras 72 h       ← das fotografias de métricas
  Melhor que 92% dos posts desta playlist
  Por que pode ter ido bem: reel curto (18 s), postado sábado 19h,
  tema "rotina", gancho falado nos primeiros 2 s: "Ninguém te conta isso…"
```

- **Nota "acima do normal" (outlier)** = métrica do post ÷ mediana dos últimos 30 posts do mesmo perfil (mesma ideia do vidIQ). Ela é justa com perfis pequenos.
- **Curva de crescimento**: vem das fotografias de 1 h / 6 h / 24 h / 3 d / 7 d. Mostra se o post "explodiu" ou "cresceu devagar". Só existe para posts que o Mirante viu nascer, e a tela diz isso com franqueza.
- **"Por que pode ter ido bem"**: texto curto gerado pelo Claude a partir dos dados (formato, duração, horário, tema, primeira frase falada). Sempre com "pode", nunca como certeza.

### 7.2 Na aba Análise

- **Por perfil**: frequência de postagem, melhor dia/horário, formato que mais funciona, temas mais fortes, top 10 posts.
- **Por playlist**: quem está crescendo, quem está caindo, posts acima do normal da semana.
- **Comparações**: reels × carrossel × foto; duração do reel × views; com rosto × sem rosto (se a descrição de imagem estiver ligada); hashtags que aparecem nos melhores posts.
- Gráficos simples e legíveis (barras e linhas), sem painel poluído.

### 7.3 Integrações

- **vidIQ** (já conectado): `vidiq_ig_profile`, `vidiq_ig_profile_reels` e `vidiq_instagram_tiktok_outlier_search` para comparar um post com outliers do Instagram e do TikTok sobre o mesmo assunto.
- **Exportar**: CSV, Planilhas Google e JSON; botão "Copiar tabela".
- **Opcional depois**: Notion (enviar post salvo para uma página), Apify (histórico longo de perfis grandes).

---

## 8. Estética "humanizada"

### 8.1 Princípios

1. **Calma, não vício.** Sem números vermelhos, sem rolagem infinita, sem autoplay com som. O feed termina.
2. **Papel e tinta.** Fundo de papel levemente esverdeado, tinta azul-petróleo, cartões como fichas de leitura.
3. **Fala como gente.** Todo texto da interface em português de conversa, na primeira pessoa do app: *"Achei 3 perfis no arquivo. Um já estava na lista."*
4. **Conteúdo na frente.** As fotos dos perfis têm cor própria; a interface fica quieta em volta delas.
5. **Feito para ler.** Fonte grande (17 px), contraste AA, foco visível dourado, tudo funciona no teclado e no leitor de tela.

### 8.2 Família visual (herdada do Garimpo)

```css
:root{
  --paper:#EEF1EC; --surface:#F8FAF7; --ink:#1D2B36; --soft:#56656D; --line:#CBD4CE;
  --green:#2F5D50; --green-wash:#DCE7E1;           /* ações principais, igual ao Garimpo */
  --gold:#E3B23C;  --gold-wash:#F6E7BF;            /* "novo", story não visto, foco */
  --clay:#B5603F;  --clay-wash:#F3DED4;            /* acento próprio do Mirante (terracota) */
  --serif:"Literata",Georgia,serif;
  --sans:"Atkinson Hyperlegible",system-ui,sans-serif;
  --radius:14px; --shadow:0 1px 0 rgba(29,43,54,.06),0 8px 24px rgba(29,43,54,.06);
}
@media (prefers-color-scheme:dark){ :root:not([data-theme=light]){
  --paper:#10191D; --surface:#172328; --ink:#E3E9E5; --soft:#9AABA5; --line:#2C3B40;
  --green:#86C3AC; --gold:#E8BE52; --clay:#E39274;
}}
```

- **Títulos** em Literata (serifa de livro), **texto** em Atkinson Hyperlegible.
- **Fontes servidas localmente**, como no Garimpo (`/fonts/`): fica bonito mesmo sem internet.
- **Ícones** de traço arredondado de 1,75 px, desenhados à mão no mesmo estilo do logo do Garimpo.
- **Logo**: um pequeno mirante/torre com um sol dourado, mesmo traço do "pepita" do Garimpo.
- **Movimento**: transições de 150–200 ms, cartões entram com leve fade. Respeita "reduzir movimento".
- **Stories**: anel dourado (não visto) / cinza (visto). Barra de progresso fina no topo. Toque à esquerda volta, à direita avança, segurar pausa. No PC, setas.

### 8.3 Layout

**Computador (≥ 1100 px): três colunas**

```
┌──────────────┬──────────────────────────────────┬───────────────────────┐
│ Mirante      │ ◯ ◯ ◯ ◯ ◯ ◯   (stories)          │                       │
│              │ Ordenar: [Mais recentes①][Mais   │   POST ABERTO         │
│ Início    12 │  vistos②]  · Equilibrado ▾       │   mídia               │
│ Buscar       │ ──────────────────────────────── │   legenda             │
│ Perfis    86 │ ┌────┐ @fulano · há 2 h  Novo    │   [O que é dito]      │
│ Análise      │ │foto│ Legenda em duas linhas…   │   [Comentários]       │
│              │ └────┘ 12 mil views · 3,4× acima │   [Desempenho]        │
│ PLAYLISTS    │ ┌────┐ @beltrano · ontem         │                       │
│ ● Filosofia 5│ │foto│ …                         │                       │
│ ● Receitas  2│ └────┘                           │                       │
│ + Nova       │                                  │                       │
└──────────────┴──────────────────────────────────┴───────────────────────┘
```

- Entre 640 e 1100 px: duas colunas (o post abre por cima).
- O feed tem dois modos: **Lista** (padrão, como o Garimpo: miniatura + texto, ótimo para ler e comparar) e **Grade** (3 colunas de fotos, para ver o visual).

**Celular**

```
┌─────────────────────────┐
│ Mirante        Filosofia▾│
│ ◯ ◯ ◯ ◯ ◯  →            │
│ [Recentes①][Vistos②] ⚙  │
│ ┌─────────────────────┐ │
│ │       foto           │ │
│ └─────────────────────┘ │
│ @fulano · há 2 h · Novo  │
│ Legenda…                 │
│ 12 mil views · 3,4×      │
├─────────────────────────┤
│ Início Buscar Perfis Análise │
└─────────────────────────┘
```

- Barra de abas embaixo, ao alcance do polegar. Deslizar o post para a esquerda salva, para a direita oculta (com "desfazer").
- Margem de 16 px, sem rolagem horizontal.

### 8.4 Textos da interface (exemplos)

| Situação | Texto |
|---|---|
| Sem perfis | **Comece pelos perfis de que você gosta.** Cole os links aqui, um por linha, ou arraste o arquivo de quem você segue. |
| Coleta pausada | Dei uma pausa de 20 min para o Instagram não reclamar. Volto às 14:40. |
| Fim do feed | Pronto, você está em dia. |
| Busca vazia | Nada com essas palavras. Experimente uma palavra só, ou pesquise também nos comentários. |
| Perfil privado | Esse perfil é privado. Só aparece aqui se a conta usada pelo Mirante seguir ele. |
| Story expirado | Esse story já saiu do ar, mas eu guardei uma cópia. |

---

## 9. API local (servidor do PC)

Mesmo estilo do `garimpo.py`: só aceita `127.0.0.1`, POST exige o cabeçalho `X-Mirante: 1`, respostas longas em **NDJSON** (chegam aos poucos).

| Método | Caminho | Faz |
|---|---|---|
| GET | `/api/feed?tag=&sort=date:desc,views:desc&mode=balanced&kind=&from=&to=&theme=&cursor=` | Feed paginado. |
| GET | `/api/search?q=&in=caption,speech,comments&…` | Pesquisa (mesmos filtros e ordem). |
| GET | `/api/post/{id}` | Post completo + mídia + transcrição + desempenho. |
| GET | `/api/post/{id}/comments?sort=likes\|replies\|new\|old&q=` | Comentários. |
| GET | `/api/stories?tag=` | Stories ativos e guardados. |
| GET/POST | `/api/profiles` | Listar, adicionar (texto/arquivo), editar, remover. |
| GET/POST | `/api/tags` | Playlists. |
| GET/POST | `/api/themes` | Temas. |
| GET | `/api/analytics/profile/{id}` · `/api/analytics/tag/{id}` | Análise. |
| GET | `/api/collector/status` (NDJSON contínuo) | Fila, pausas, progresso. |
| POST | `/api/collector/refresh` | "Atualizar agora". |
| GET | `/api/export?what=profiles\|posts\|analytics&fmt=csv\|json` | Exportar. |
| GET | `/media/...` | Miniaturas e mídia (só nomes validados, como o `/fonts/`). |

---

## 10. Estrutura de pastas

```
mirante/
├─ app/                       # interface (Svelte)
│  ├─ src/
│  │  ├─ lib/data/            # "fonte de dados": local (PC) ou Supabase — mesma interface
│  │  ├─ lib/sort.ts          # chips, percentis, modo equilibrado/sequência
│  │  ├─ lib/search.ts        # sintaxe da busca → consulta
│  │  ├─ components/          # PostCard, PostPanel, StoryViewer, CommentList, SortBar, TagSidebar…
│  │  ├─ routes/              # Inicio, Buscar, Perfis, Analise, Ajustes
│  │  └─ styles/tokens.css    # tokens da seção 8.2
│  └─ public/fonts/
├─ core/                      # Python
│  ├─ server.py               # FastAPI
│  ├─ db.py                   # SQLite, migrações, FTS
│  ├─ collector/
│  │  ├─ queue.py             # fila com ritmo e pausas
│  │  ├─ source_session.py    # fonte A (instaloader)
│  │  ├─ source_graph.py      # fonte B (Meta Graph API)
│  │  └─ source_vidiq.py      # fonte C
│  ├─ enrich/                 # transcribe.py, ocr.py, themes.py, embeddings.py
│  ├─ analytics.py            # outlier, engajamento, curvas
│  ├─ importers.py            # extrair perfis de qualquer texto/arquivo (herdado do Garimpo)
│  └─ sync_supabase.py
├─ desktop/                   # Tauri (Windows/macOS/Linux)
├─ mobile/                    # Tauri mobile / manifesto da PWA
├─ supabase/migrations/
└─ tests/                     # pytest + Playwright
```

---

## 11. O que reaproveitar do Garimpo

| No Garimpo | No Mirante |
|---|---|
| `extract_sources` (links, @nomes, IDs, Takeout, lista exportada) | `importers.py`, com as regras do Instagram e o `following.json` |
| `resolve` em segundo plano com "Verificando…" e "Tentar de novo" | Verificação de perfis |
| `ThreadPoolExecutor` separado para busca e para resolver | Fila do coletor + pool para enriquecimento |
| `DATES_BLOCKED` (pausa no 429) | Pausa do coletor, mas mais longa e com aviso |
| `write_json` atômico, cópia de arquivo corrompido | SQLite em WAL + backup diário |
| `local_host()` + cabeçalho próprio no POST | Igual |
| `already_running()` / versão / desligar quando ocioso | Igual na versão sem Tauri |
| `update_ytdlp_later` | Atualiza o instaloader |
| Streaming NDJSON + `requestAnimationFrame` para pintar aos poucos | Status do coletor e "Atualizar agora" |
| `rows` (reaproveitar linhas para não piscar) | Lista virtualizada com chave estável |
| "Acompanhar esta busca" e marca "Novo" | Igual, e também por playlist |
| Grupos de canais + "Procurar em" | Playlists (agora várias por perfil) |
| Paleta, fontes, textos, `teste.py` | Base do visual e dos testes |

---

## 12. Fases de entrega

### Fase 1 — Mirante no PC (núcleo)
- Coletor fonte A com fila e pausas; perfis (colar, arquivo, `following.json`); playlists.
- Feed em lista e grade, post completo com comentários, stories com visualizador.
- Barra de ordenação completa (seção 5) e filtros.
- Pesquisa FTS5 em legenda, hashtags e comentários.
- Abre pelo navegador local (igual ao Garimpo, com atalho).
- **Pronto quando**: com 50 perfis, o feed abre em < 1 s, a busca responde em < 50 ms, nenhum bloqueio do Instagram em 7 dias de uso.

### Fase 2 — Entender o conteúdo
- Transcrição, OCR, busca "no que é dito" com pulo para o tempo.
- Temas (Claude Haiku) e temas sugeridos.
- Fotografias de métricas e a aba Desempenho do post.

### Fase 3 — Análise
- Aba Análise por perfil/playlist, outliers, exportações, integração vidIQ.
- Fonte B (API oficial) como plano B automático.

### Fase 4 — Em todo lugar
- `Mirante.exe` com Tauri (sem janela preta).
- Sincronização Supabase (com login só seu e regras de acesso RLS), PWA instalável no celular, pesquisa offline no celular.
- Depois: app de loja (Android primeiro) com Tauri mobile.

---

## 13. Qualidade, segurança e privacidade

- **Testes** no estilo do `teste.py`: leitura de perfis em qualquer formato, ordenação (cada combinação de chips), pesquisa sem acento, fila respeitando pausa, servidor recusando POST sem cabeçalho e caminhos de mídia maliciosos. Respostas do Instagram gravadas em arquivos para os testes não dependerem da internet.
- **Playwright**: abrir, colar perfis, ordenar, pesquisar, abrir post e story; fotos de tela em celular e PC, claro e escuro.
- **Medições** de velocidade automáticas com um banco falso de 100 mil posts.
- **Senhas e sessões** no cofre do sistema (Windows Credential Manager), nunca em texto.
- **Supabase** com RLS: só a sua conta lê os seus dados.
- **Uso pessoal**: o Mirante guarda conteúdo de terceiros só para você ler. Não republica nem compartilha.

---

## 14. Riscos e como lidar

| Risco | Probabilidade | Resposta |
|---|---|---|
| Instagram bloquear a conta da coleta | Média | Conta secundária, ritmo calmo, IP de casa, pausa automática, fonte B como reserva. |
| Instagram mudar o site e quebrar a coleta | Alta, de tempos em tempos | Atualização automática do instaloader + fontes plugáveis + aviso amigável. |
| Disco enchendo com vídeos | Média | Guardar vídeo só de playlists escolhidas; limite em GB; miniaturas sempre. |
| Transcrição lenta em PC fraco | Média | Roda ocioso, prioriza playlists, modelo `base` como opção. |
| Custo de IA | Baixa | Haiku em lote, resultado guardado, teto mensal nos Ajustes. |

---

## 15. Decisões que dependiam de você

Respondidas. Veja a seção 17.

---

## 16. Ferramentas usadas neste planejamento e nas próximas etapas

- **Lidos**: `garimpo.py`, `index.html`, `teste.py`, `iniciar.bat`, `dados.json`, `datas.json` do Garimpo (base da arquitetura, do visual e dos textos).
- **vidIQ** (conectado): conferi o que ele entrega para Instagram (perfil, até 12 reels com plays e curtidas, busca de outliers). Entra na análise (seção 7.3).
- **Supabase** (conectado): sincronização e versão web (Fase 4).
- **Context7**: documentação atual do Tauri, Svelte, FastAPI e instaloader na hora de programar.
- **Playwright** (instalado): testes de ponta a ponta e capturas.
- **Skills de design** (frontend-design / refero-design) na hora de desenhar as telas. O conector do Refero e o do Figma **não conectaram** nesta sessão (bloqueio de rede/proxy). Se quiser protótipos no Figma, é preciso reconectá-los.

---

## 17. Decisões tomadas e o que muda (30/out/2026)

| # | Pergunta | Resposta | Consequência |
|---|---|---|---|
| 1 | Fonte de dados | "A que entregar mais do que eu pedi" | **Fonte A (sessão própria, instaloader) como principal**: é a única que entrega stories, texto dos comentários, curtidas e respostas de cada comentário e visualizações. **Fonte B (API oficial) roda na nuvem** quando o PC está desligado. Detalhes em 17.1. |
| 2 | Celular com o PC desligado | Sim | Entra o **Supabase desde a Fase 1** (antes estava na Fase 4) e uma **coleta na nuvem** para os períodos em que o PC estiver desligado. |
| 3 | Usar o Claude | Sim | Temas automáticos, "por que esse post foi bem" e resumo de comentários entram no plano. |
| 4 | Nome / app | Um só: **Mirante** | Instagram **e** YouTube no mesmo app. O Garimpo vira a parte de YouTube do Mirante e os seus dados dele são importados. Detalhes em 17.3. |
| 5 | Quantos perfis | Até ~50 | Escala pequena: dá para coletar com folga, sem chamar atenção do Instagram, e tudo cabe no plano gratuito do Supabase (com uma ressalva para os vídeos de stories). |

### 17.1 Coleta híbrida: PC ligado × PC desligado

```
            PC LIGADO                                   PC DESLIGADO
  ┌─────────────────────────────┐           ┌──────────────────────────────────┐
  │ Coletor no PC (fonte A)     │           │ Supabase Edge Function (cron 2 h)│
  │ • posts, reels, carrosséis  │           │ • Instagram: API oficial (fonte B)│
  │ • STORIES e destaques       │           │   posts + curtidas + nº coment.   │
  │ • comentários completos     │           │   de perfis Criador/Empresa       │
  │ • views dos reels           │           │ • YouTube: feed RSS dos canais    │
  │ • transcrição e OCR         │           │   + YouTube Data API (views)      │
  │ • temas (Claude)            │           │ • temas pela legenda (Claude)     │
  └──────────────┬──────────────┘           └────────────────┬─────────────────┘
                 └──────────────►  Supabase (Postgres)  ◄────┘
                                        │
                        celular / site / PC leem daqui
```

- **Com o PC ligado**, o coletor faz tudo, e a nuvem fica parada para não repetir pedidos.
- **Com o PC desligado**, a nuvem mantém o feed vivo: os posts novos aparecem no celular com curtidas e número de comentários.
- **Quando o PC volta**, ele completa o que faltou: comentários, views, transcrição e as fotografias de métricas atrasadas.

O que fica faltando quando o PC passa muito tempo desligado (vale saber):

| Ausência do PC | Consequência |
|---|---|
| Menos de 24 h | Nada se perde. Os stories ainda estão no ar quando o PC volta. |
| Mais de 24 h | Os **stories** publicados nesse intervalo se perdem, porque somem do Instagram. |
| Perfis pessoais (não comerciais) | A API oficial não lê esses perfis. Eles só atualizam com o PC ligado. O Mirante marca esses perfis com "atualiza só com o PC ligado". |

**Melhoria opcional** para nunca perder stories: deixar o coletor num aparelho sempre ligado e barato, como um celular Android velho (Termux) ou um Raspberry Pi. É o mesmo código do PC. Fica para depois, se fizer falta.

**Ritmo com 50 perfis** (seguro):
- Ciclo de posts a cada 2 h e de stories a cada 3 h: são uns 50–100 pedidos por ciclo, um a cada 4–6 s, ou seja, uns 6 minutos de trabalho a cada 2 horas.
- Comentários só dos posts que você abrir e dos que estiverem bem acima do normal.
- **Conta secundária obrigatória** para a coleta. Ela precisa seguir os perfis privados que você quiser ver.

### 17.2 Celular sem o PC

- O celular guarda uma **cópia local** (SQLite) do que está no Supabase. Pesquisa instantânea, mesmo sem internet.
- Sincroniza só o que mudou desde a última vez (por data de alteração), e o Supabase avisa em tempo real quando chega coisa nova.
- **Mídia**:
  - miniaturas (`.webp`, ~15 KB) de tudo ficam no Supabase Storage;
  - vídeos dos stories ficam em 480p, guardados por 48 h. Com 50 perfis isso dá algo como 150–300 MB, que cabe no plano gratuito (1 GB). Quem quiser guardar mais tempo precisa do plano pago, ou deixa o arquivo completo só no PC;
  - posts em vídeo tocam direto do Instagram/YouTube, sem ocupar espaço.
- **Login**: só a sua conta (Supabase Auth com link mágico no e-mail). Regras de acesso (RLS) em todas as tabelas.
- **Segredos** (sessão da conta secundária, chave do Claude, token da Meta) **nunca** vão para o celular. Os do PC ficam no cofre do Windows e os da nuvem nos segredos das Edge Functions.

### 17.3 Instagram + YouTube num só lugar

O banco e a interface ficam "por fonte", com o mesmo tratamento para as duas redes:

- `profiles` ganha a coluna `platform` (`instagram` | `youtube`), e `posts` também. Vídeo do YouTube é só mais um "post" com duração e views.
- **Playlists misturam as duas redes**: a playlist *Filosofia* pode ter o Instagram e o canal do YouTube do mesmo professor.
- **Uma pesquisa para tudo**, com um filtro "Instagram / YouTube / os dois".
- A **ordenação da seção 5** vale igual para as duas redes. No YouTube há views em todos os vídeos e duração, então ganha o chip **Duração** (como no Garimpo).
- **O que vem do Garimpo, inteiro**:
  - **"Garimpar"**: a busca ao vivo no histórico inteiro dos canais (`search_fast`, com o yt-dlp como reserva), para vídeos antigos que não estão no índice local;
  - **Seleção/listas** (montar a sequência de estudo e abrir como playlist do YouTube), marcar como assistido;
  - **Acompanhar busca**, filtros de duração e "precisa ter / esconder se tiver".
- O **YouTube também ganha** o que foi pensado para o Instagram: análise de sucesso, temas e pesquisa na fala (legendas automáticas do YouTube, que o yt-dlp já baixa, sem precisar transcrever).
- **Importação do Garimpo**: no primeiro uso, o Mirante lê o `dados.json` (seus 52 canais, a seleção com 23 vídeos, buscas e ocultos) e o `datas.json` (datas já descobertas). Nada é perdido.

Abas principais (PC e celular):

```
Início   ·   Buscar   ·   Perfis e canais   ·   Seleção   ·   Análise
```

### 17.4 Uso do Claude

| Uso | Modelo | Quando | Custo esperado com ~50 perfis + 52 canais |
|---|---|---|---|
| Etiquetar temas | Claude Haiku 5.5, em lote | Cada post novo, uma vez | Centavos por dia |
| "Por que pode ter ido bem" | Claude Haiku 5.5 | Só quando você abre a aba Desempenho, e o texto fica guardado | Muito baixo |
| Resumo dos comentários ("o que o pessoal está dizendo") | Claude Haiku 5.5 | Ao abrir os comentários de um post com mais de 50 comentários | Baixo |
| Descrever imagens (busca "foto de comida") | Claude Haiku 5.5 com imagem | Opcional, desligado no começo | Moderado; liga se fizer falta |

- **Teto de gasto mensal** nos Ajustes (padrão: US$ 5). Ao chegar perto, o Mirante avisa e pausa as tarefas opcionais.
- A chave fica no PC e nos segredos da nuvem, nunca no celular.

### 17.5 Fases, revisadas

| Fase | Entrega | Pronto quando |
|---|---|---|
| **1. Base em todo lugar** | Supabase (tabelas, login, RLS); coletor do PC (Instagram fonte A + YouTube do Garimpo); importação do Garimpo; perfis e canais (colar, arquivo, `following.json`, Takeout); playlists; feed com ordenação completa; post completo com comentários; stories; pesquisa; **PWA no celular** lendo do Supabase. | No celular, com o PC desligado, você vê os posts e os stories coletados, ordena e pesquisa em < 150 ms. |
| **2. Nuvem quando o PC dorme** | Edge Functions: API oficial do Instagram, RSS e Data API do YouTube; app da Meta configurado (passo a passo guiado). | Desligar o PC por um dia e os posts novos continuam chegando no celular. |
| **3. Entender o conteúdo** | Transcrição, OCR, legendas do YouTube, temas com o Claude, temas sugeridos, busca pelo sentido. | Pesquisar uma frase dita num reel e cair no segundo exato. |
| **4. Análise** | Fotografias de métricas, painel de desempenho, aba Análise, vidIQ, exportações. | Ver os posts "acima do normal" da semana em cada playlist. |
| **5. Apps instalados** | `Mirante.exe` (Tauri), app Android (Tauri mobile), ícones, atualização automática. | Instalar sem `.bat` e sem navegador. |

### 17.6 O que preciso de você quando começar a programar

1. **Uma conta secundária do Instagram** que siga os perfis que você quer acompanhar. O login é feito por você, na tela do Mirante, e a senha não passa por mim.
2. **Um projeto no Supabase** para o Mirante. Pode ser na mesma conta da hamburgueria, mas num **projeto separado**. Eu crio as tabelas pelo conector.
3. **Uma chave da API do Claude** (console.anthropic.com), colada nos Ajustes do Mirante.
4. Para a Fase 2: uma conta do Instagram **Criador** (pode ser a secundária, é grátis mudar) ligada a uma Página do Facebook. Eu guio o passo a passo do app da Meta.
5. Onde o código vai morar: sugiro um **repositório novo**, `mirante`, em vez desta pasta dentro da hamburgueria.
