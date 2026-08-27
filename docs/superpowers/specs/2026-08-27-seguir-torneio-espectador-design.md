# Seguir torneio — atalho anônimo no site

Site público (Angular, `nexago.com.br`). Fecha o gancho de engajamento pra quem chega pelo
site e não tem conta: um botão "Seguir" na página do torneio, e uma lista de acesso rápido
na home — tudo local ao navegador, sem backend novo.

## Problema

A página pública de acompanhamento ao vivo já existe — `organizador.nexago.app/t/:id`
(design/plano `2026-08-18-telao-no-torneio-e-rota-publica`), com realtime de verdade
(`onSnapshot`) e hidratação de nome de dupla via `public_profiles`. Mas ninguém acha essa
página pelo site: a página do torneio em `nexago.com.br/torneios/:id`
(`torneio-detail.page.ts`) não tem nenhum link pra lá — o CTA nos status `closed`/`live` já
diz "Acompanhe os jogos ao vivo pelo app", mas só oferece baixar o app, nunca a URL que já
resolve isso no navegador. E quem quer acompanhar sem se cadastrar não tem como "guardar"
um torneio pra achar de novo depois.

Site e página ao vivo são origens diferentes (`nexago.com.br` vs `organizador.nexago.app`)
e o site não tem auth nenhuma (nem Firebase Auth, nem sessão) — qualquer estado de "seguir"
só pode viver no `localStorage` do navegador do espectador, escopado à origem do site.

## Decisões

1. **"Seguir" vive só no site**, nunca na página `organizador.nexago.app/t/:id` — decisão
   consciente, mesmo sabendo que quem entra pelo QR do telão (na arena) não vê a opção ali.
   Cobre o caminho principal (descoberta via site/busca/redes) sem duplicar estado entre
   origens que nunca se encontram.
2. **Sem conta, sem push, sem e-mail.** MVP é um bookmark local: grava o id do torneio,
   mostra numa lista de acesso rápido. Nada de notificação — isso fica pra quando houver
   infra (fase 2, fora de escopo aqui).
3. **O link pra `organizador.nexago.app/t/:id` substitui "Baixar o app" como ação primária
   só nos status `closed` e `live`** — os dois únicos onde o CTA atual já promete
   "acompanhe ao vivo" sem cumprir. Nos demais status (`open`, `almost_full`, `ended`,
   `cancelled`) o CTA não muda.
4. **Zero mudança em `organizer`, `functions` ou `firestore.rules`.** Tudo isolado no
   projeto `site`.

## Peça 1 — Atalho local (`follow-storage.ts`)

Novo `src/lib/follow-storage.ts`, sem dependência de Firestore:

```ts
export function getFollowedTournamentIds(): string[]
export function isFollowing(id: string): boolean
export function toggleFollow(id: string): boolean // retorna o novo estado
```

- Persiste em `localStorage['nx:torneios-seguidos']`, lista de ids, mais recente primeiro,
  teto de 20 (o 21º entrando derruba o mais antigo).
- `localStorage` indisponível (modo privado, cota estourada) — qualquer chamada cai num
  catch e vira no-op: `getFollowedTournamentIds` retorna `[]`, `toggleFollow` retorna o
  estado que já tinha (não muda nada), nunca lança.

## Peça 2 — Botão "Seguir" e link ao vivo (`torneio-detail.page.ts`)

- Botão "Seguir"/"Seguindo" (ícone preenche) ao lado do título, visível sempre que `t()`
  existe. `protected readonly following = signal(false)`, inicializado de
  `isFollowing(t.id)` quando o torneio carrega; `toggleFollow` no clique.
- `CTA_COPY` ganha um `liveUrl?: (id: string) => string` opcional nas entradas `closed` e
  `live`; o botão primário do rodapé vira `<a [href]="liveUrl(t.id)">Acompanhar ao vivo</a>`
  nesses dois status, e "Baixar o app" desce a ação secundária. Nos demais status, nada
  muda. URL montada como template string inline (`` `https://organizador.nexago.app/t/${t.id}` ``),
  mesmo padrão já usado duas linhas abaixo pro link de inscrição
  (`'https://atleta.nexago.com.br/torneios/' + t.id + '/inscricao'`) — o site não tem (nem
  precisa ganhar aqui) um arquivo central de URLs externas.

## Peça 3 — "Torneios que você acompanha" (home)

Nova seção `src/app/pages/home/sections/acompanhando.ts`, entre `cinematic-hero` e
`features` (primeiro conteúdo depois do hero, pra quem já tem torneio seguido bater o olho
antes da vitrine genérica):

- No `constructor`: lê `getFollowedTournamentIds()`; se vazio, a seção não renderiza nada
  (`@if (tournaments().length > 0)`) — sem caixa vazia pra quem nunca seguiu.
- Hidrata cada id com `getTournamentById` (já existe, já trata torneio apagado/não-público
  retornando `null` — ids assim são filtrados da lista pra exibição, sem removê-los do
  `localStorage`: podem voltar a existir, ex. reabertura).
- Ordena com `byRelevance` de `tournaments.ts` (ativos primeiro) — hoje essa função é
  privada do módulo; precisa ganhar `export`.
- Reaproveita `<app-tournament-card>` (`pages/torneios/tournament-card.ts`, mesmo
  componente do `/torneios`), não a marcação duplicada de `torneios-destaque.ts`.

## Fora de escopo, com motivo

- **Seguir atleta específico** (entre torneios) — descartado no brainstorming: MVP é só a
  etapa/torneio, não o atleta.
- **Notificação (push ou e-mail) de início da etapa** — exige infra que o site não tem
  hoje (zero FCM web, zero auth). Fica pra quando isso existir.
- **"Seguir" na página `organizador.nexago.app/t/:id`** — decisão 1: quem entra pelo QR do
  telão não vê a opção. Aceito conscientemente.
- **Sincronizar o seguir entre as duas origens** — não há ponte técnica simples
  (`localStorage` é por origem); resolver isso é reabrir a decisão 1, não um detalhe de
  implementação.

## Arquivos

Novos:
- `frontend/projects/site/src/lib/follow-storage.ts` (+ `.spec.ts`)
- `frontend/projects/site/src/app/pages/home/sections/acompanhando.ts` (+ `.spec.ts`)

Alterados:
- `frontend/projects/site/src/app/pages/torneios/torneio-detail.page.ts` — botão Seguir,
  `CTA_COPY.liveUrl`.
- `frontend/projects/site/src/lib/firestore/tournaments.ts` — exporta `byRelevance`.
- `frontend/projects/site/src/app/pages/home/home.page.ts` — importa e insere
  `AcompanhandoSection`.

## Testes

- `follow-storage.spec.ts`: toggle liga/desliga, ordem (mais recente primeiro), teto de 20
  descartando o mais antigo, `localStorage` indisponível (mock lançando) não quebra e
  retorna vazio/no-op.
- Specs de `torneio-detail.page.ts`: botão reflete `isFollowing` no load, toggle chama
  `toggleFollow` e atualiza o ícone, link "Acompanhar ao vivo" só aparece em
  `closed`/`live` e aponta pra `organizador.nexago.app/t/{id}`.
- `acompanhando.spec.ts`: some quando não há seguidos, aparece ordenado por relevância
  quando há, filtra id que `getTournamentById` devolve `null` sem quebrar os outros.
- TestBed zoneless (`provideZonelessChangeDetection()`), mesmo padrão do resto do projeto.

## Riscos

- **Domínio hard-coded** (`organizador.nexago.app`) no link "Acompanhar ao vivo" — se o
  domínio mudar (custom domain futuro), esse link quebra silenciosamente até alguém notar.
  Mesmo risco que já existe hoje pro link de inscrição (`atleta.nexago.com.br`) e pro
  `linktr.ee/nexago` espalhado em 6 arquivos — não é regressão introduzida por esta feature,
  é o padrão já aceito no projeto.
- **`localStorage` não sincroniza entre abas do mesmo navegador em tempo real** — seguir
  numa aba não atualiza a home já aberta em outra; aceito, é atalho de conveniência, não
  estado crítico.
- **Sem telemetria de uso** — MVP não grava nenhum evento de analytics no seguir; se isso
  for medir sucesso da feature, é uma adição posterior, não bloqueante aqui.
