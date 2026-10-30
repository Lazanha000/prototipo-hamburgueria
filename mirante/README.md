# Mirante

Acompanhe com calma os perfis do Instagram de que você gosta: posts, stories e comentários, com pesquisa instantânea, playlists de perfis e análise de desempenho. Funciona no celular sem depender do PC.

- **`app/`**: o app (Svelte + SQLite no aparelho). Vira o app do **Android** (Capacitor), que coleta sozinho; também roda no navegador (PWA).
- **`worker/`**: o trabalhador (Python + instaloader). Roda num servidor, coleta do Instagram com uma conta secundária e grava no Supabase.
- **`supabase/`**: o banco na nuvem (tabelas, regras de acesso, tempo real).
- **`PLANO.md`**: o planejamento completo (a parte de servidor virou opcional).
- **`INSTALAR.md`**: como instalar o app no Android (grátis, sem conta). **`INSTALAR-SERVIDOR.md`**: o caminho avançado com servidor e Supabase.

## O que já funciona

- Feed de todos os perfis ou por playlist, em lista ou grade, com marca "Novo" e fim do feed ("você está em dia").
- **Ordenação combinada**: cada critério (data, visualizações, curtidas, comentários, engajamento, relevância) gira entre mais → menos → desligado. Vários ao mesmo tempo, em modo **Equilibrado** (média dos percentis, com pesos) ou **Em sequência** (desempate, com agrupamento por dia/semana/mês).
- **Pesquisa no aparelho** (SQLite FTS5): sem acento, por prefixo, enquanto digita, em menos de 50 ms. Mostra onde achou e grifa as palavras. Aceita `"frase"`, `-palavra`, `@perfil`, `#hashtag`, `tipo:reel`, `em:comentarios`.
- **Stories** com anel de não visto e visualizador em tela cheia (tocar, segurar para pausar, setas); ficam guardados depois de sair do ar.
- **Post completo**: carrossel, vídeo, legenda com hashtags e menções clicáveis, setas para o anterior e o próximo.
- **Comentários**: mais curtidos, mais respondidos, mais recentes e mais antigos; pesquisa nos comentários; respostas; "onde o perfil respondeu".
- **Desempenho**: quantas vezes acima do normal do perfil, engajamento, comparação com a mediana e curva de crescimento.
- **Perfis**: colar vários links, @nomes, links de posts, arquivos e o `following.json` do Instagram; playlists (um perfil em várias); prioridade; exportar a lista.
- **Sincronização** com o Supabase: só o que mudou, tempo real e envio do que você mudou mesmo offline.
- **Trabalhador**: ritmo humano, silêncio de madrugada, pausa automática no 429 e no checkpoint, sessão criptografada, miniaturas WebP, "fotografias" de métricas, limpeza de stories antigos.
- Tema claro e escuro e acessibilidade (teclado, leitor de tela, foco visível).

## Depois (Fase 2 em diante)

Transcrição dos reels e leitura do texto das imagens para pesquisar "no que é falado", temas por palavras-chave, aba de análise por perfil e playlist, e apps instalados (Tauri).
