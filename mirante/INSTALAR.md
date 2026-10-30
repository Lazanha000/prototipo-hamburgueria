# Instalar o Mirante no Android (grátis, sem conta, sem servidor)

O celular faz tudo sozinho: confere os perfis que você adicionou, guarda os posts no próprio aparelho e pesquisa na hora. Não precisa de PC, de servidor, de Supabase nem de pagar nada.

## 1. Baixar o app

1. No celular, abra o repositório no GitHub (logado na sua conta) → **Releases** → **"Mirante para Android"**.
   - Se ainda não houver, abra **Actions → "Mirante: APK Android" → Run workflow** e espere uns 6 minutos.
2. Baixe o arquivo **`Mirante.apk`**.
3. Abra o arquivo. O Android vai avisar que a fonte é desconhecida: toque em **Configurações → Permitir desta fonte** e volte para **Instalar**.

Versões novas aparecem no mesmo lugar e **atualizam por cima**, sem apagar nada.

## 2. Usar

1. Abra o Mirante → **Perfis** → cole os links ou @nomes dos perfis (um por linha), ou solte o arquivo `following.json` do Instagram.
2. Em alguns segundos o app começa a verificar os perfis, um de cada vez, com pausa entre eles (5 a 9 s). Com 50 perfis, a primeira rodada leva uns 6 minutos. Os posts vão aparecendo no **Início** enquanto isso.
3. Crie **playlists** (em Perfis, "Pôr numa playlist") e filtre o feed por elas.
4. Daí em diante o app confere sozinho a cada 3 horas (mude em **Ajustes**) **enquanto está aberto**.

## O que ele faz e o que não faz (versão 0.1)

| Faz | Ainda não faz |
|---|---|
| Posts, reels e carrosséis de perfis **públicos**: legenda, data, curtidas, comentários (número), views | **Stories** e **texto dos comentários** (exigem uma conta do Instagram conectada) |
| Ordenar por data, views, curtidas…, combinar critérios | Perfis **privados** |
| Pesquisar nas legendas e hashtags, em milissegundos | Posts antigos: ele traz os **12 mais recentes** de cada perfil e vai acumulando |
| Desempenho: "x vezes acima do normal" e curva de crescimento | Atualizar com o app fechado (o Android não deixa) |
| Funcionar sem internet com o que já chegou | Dividir os dados entre celular e PC (cada aparelho guarda os seus) |

## Se o Instagram pedir calma

O app avisa ("O Instagram pediu uma pausa. Volto às 14:40") e para sozinho: 45 min na primeira vez, depois 1 h 30, 3 h e 6 h se insistir. O que já chegou continua no app. Isso não bloqueia nenhuma conta sua, porque o app **não usa login**: o Instagram enxerga só a internet do seu celular.

## Se algo der errado

| O que aparece | O que fazer |
|---|---|
| "O Instagram mudou o jeito de responder" | O Instagram mudou o site. Me avise: eu ajusto e o GitHub gera um APK novo. |
| Perfil com "Não encontrei esse perfil" | Confira o @nome; use **Tentar de novo** na lista. |
| Nenhum post chega | **Ajustes → Atualizar agora**; veja a mensagem logo abaixo. |

## Para quem for mexer no código

```bash
cd app && npm install
npm run dev            # no navegador, com a demonstração
npm test               # ordenação, pesquisa, leitura de perfis, coleta (com Instagram simulado)
npm run android:sync   # monta o app e copia para o projeto Android (app/android)
```

O APK é gerado pelo GitHub Actions (`.github/workflows/mirante-android.yml`), com uma chave de assinatura fixa para as atualizações não apagarem os dados.
