# Telão dentro do torneio + rota pública de acompanhamento

Portal do organizador (Angular). Duas mudanças que andam juntas: o telão deixa de ser uma
tela global e passa a viver dentro do torneio, e nasce uma página pública, sem login, para
o público acompanhar os jogos pelo celular.

## Problema

O telão nasceu (PR #113) como item global da sidebar, com um `<select>` de evento na
própria tela. Isso só funciona enquanto o organizador tem um torneio por vez: **na mesma
data pode haver vários torneios**, e escolher "o evento exibido" num seletor global é
ambíguo — a config vive em `tournaments/{id}.bigScreen`, ou seja, o dado sempre foi por
torneio; só a navegação não era.

Em paralelo, quem está na arena (ou em casa) não tem para onde olhar: o telão só existe na
TV, e todas as telas que mostram jogos ao vivo — portal do atleta e painel do organizador —
exigem login. A página do torneio no site (Next) é de divulgação: não mostra quadra, placar
nem resultado.

## Decisões

1. **A página pública mora no portal do organizador**, em `/t/:tournamentId`, fora do shell
   e sem guard. Motivo: é o único app que já sabe ler e desenhar partidas ao vivo (telão,
   mesa, chaveamento). Tirar o login do portal do atleta mexeria em guards, shell e
   `TournamentLiveStore`, com risco de vazar tela que assume "meu atleta"; refazer no site
   significaria reescrever chave e placar em React, num host estático.
2. **O telão vira aba do torneio** (`/painel/eventos/:id/telao`) e some da sidebar global.
   `/painel/telao` passa a redirecionar para a lista de eventos, como as outras rotas
   pré-cascata.
3. **A TV continua exigindo login** (`/telao/:tournamentId`, `authGuard`) — decisão do dono
   no PR #113, e agora com mais razão: quem só quer assistir tem a rota pública.
4. **Escopo da página pública v1: ao vivo + resultados.** Sem chave, sem grupos, sem
   classificação. É o "telão no bolso".
5. **A ponte entre as duas coisas é um QR no telão**, ligável por toggle, mais o link com
   botão de copiar na aba Telão.

## Peça 1 — Telão como aba do torneio

Rota nova dentro de `eventos/:id`, servindo o MESMO `TelaoConfigComponent`:

```ts
{ path: 'telao', title: 'Telão ao vivo — NexaGO Organizador', loadComponent: … }
```

O componente muda de fonte de verdade:

- Ganha `readonly id = input.required<string>()` (a rota já usa `withComponentInputBinding`)
  e alimenta `svc.tournamentId` com ele.
- Perde: `listMyTournaments`, `AuthService`, `tournaments`/`tournamentOptions`, o
  `selectedId` derivado do query param `?evento=`, o `selectEvento()` e o `<select>` do card
  "Evento exibido". O card passa a se chamar **Quadras no telão** e mostra só a lista de
  quadras.
- Perde também o estado `loading` que existia só para esperar a lista de torneios; o
  carregamento passa a ser o do doc (`svc.tournament()` nulo = esqueleto).

Navegação (`panel-shell.component.ts`):

- Sai `{ label: 'Telão', icon: 'tv', link: '/painel/telao' }` da nav global.
- Entra ``{ label: 'Telão', icon: 'tv', link: `${base}/telao` }`` na nav do nível torneio,
  entre *Agendamento* e *Comunicação*.
- `{ path: 'telao', redirectTo: 'eventos' }` no bloco de rotas antigas.

Nada muda em `/telao/:tournamentId`, em `TelaoDataService`, na arte ou nos seletores.

## Peça 2 — Página pública `/t/:tournamentId`

Rota de topo, irmã de `telao/:tournamentId`, **sem `canActivate`**:

```ts
{ path: 't/:tournamentId', title: 'Acompanhe ao vivo — NexaGO', loadComponent: … }
```

Pasta nova `src/app/publico/`, isolada do painel.

### Store (`public-tournament.store.ts`)

Dois listeners, os mesmos do telão: `watchTournament(id)` e `watchMatches(id)`. Ambos leem
coleções com `allow read: if true` (`tournaments`, `artifacts/{appId}/public/data/matches`),
então funcionam deslogado.

**Não hidrata perfis.** `public_profiles` exige `request.auth != null`: deslogado, cada
snapshot dispararia uma rajada de leituras negadas. Os nomes das duplas vêm de
`team1Label`/`team2Label`, que já chegam no doc da partida. Consequência aceita: **sem fotos
e sem iniciais de atleta** na página pública.

Estado exposto: `tournament`, `matches`, `loading`, `notFound` (doc inexistente) e `error`.

### Tela (`public-tournament-page.component.ts`)

Mobile-first (é o celular de quem está na areia), legível no desktop, tema do portal.

1. **Cabeçalho** — nome do torneio, arena/cidade, data, pílula de status (`Ao vivo`,
   `Inscrições abertas`, `Encerrado`) e a marca nexaGO.
2. **Agora nas quadras** — um card por quadra do torneio, com `courtNowOf`: ao vivo (placar
   por set via `live-set-display.ts`, com destaque de quem lidera por `leadingSideOf`),
   próxima partida agendada, ou quadra livre.
3. **Próximos jogos** — `upcomingQueue` com horário (`spTimeLabel`), quadra e categoria.
4. **Resultados** — as últimas partidas encerradas, com placar em sets e fase.

**Usa todas as quadras do torneio, ignorando `bigScreen.courtIds`**: aquele recorte é a
escolha da TV da arena, não do público.

Estados: carregando (esqueleto), torneio inexistente ("Torneio não encontrado"), sem jogos
lançados ainda ("Os jogos aparecem aqui assim que o organizador começar"), e erro de leitura.

### Seletor novo (`public-selectors.ts`)

```ts
export function recentResults(matches: readonly TournamentMatch[], limit = 12): TournamentMatch[]
```

Partidas `completed`, mais recentes primeiro — ordena por `matchEndedAt`, caindo para
`scheduledAt` e depois `matchNumber` quando o fim não foi gravado (partida lançada pelo
placar rápido pode não ter `matchEndedAt`). Puro, testável sem Firestore.

### O que a página NÃO mostra

O doc do torneio é legível por qualquer um e traz campos de operação — `collected`,
`paymentMode`, `managerId`. Nada disso vai para a tela. A página exibe o mesmo conjunto de
informações que o telão já projeta numa arena aberta ao público.

## Peça 3 — QR no telão e link na aba

- `TelaoConfig` ganha `showPublicQr: boolean`. Em `telaoConfigFromRaw`, `o['showPublicQr']
  !== false` — doc antigo, sem o campo, assume **ligado** (mesmo padrão de `showStreak`);
  em `effectiveTelaoConfig`, default `true`.
- Toggle novo na aba Telão: **QR de acompanhamento** — "O público aponta a câmera e vê os
  jogos ao vivo no celular".
- No telão (`telao-screen.component.ts`): QR no **rodapé, à direita, ao lado da chamada de
  atletas** — fora da grade das quadras, sem cobrir placar. Legenda curta ("Acompanhe no
  celular"). Gerado por ``shareQrSvgDataUrl(`${location.origin}/t/${id}`)`` de `share-qr.ts`
  (`qrcode` já é dependência do portal), resolvido uma vez por torneio e guardado em signal.
  No **modo Grande Final** e na **tela de campeões** o QR não aparece: aquelas tomam a tela.
- Na aba Telão, card **Acompanhamento público** com a URL, botão *Copiar link* (mesmo padrão
  do link da TV) e o QR em miniatura.

## Fora de escopo, com motivo

- **Chave, grupos e classificação na página pública** — v2. A chave do organizador vive
  dentro do shell e assume permissões; portá-la é trabalho próprio.
- **Preview de link (OG image) no WhatsApp/Instagram** — o portal é SPA sem SSR; o link
  compartilhado abre certo, mas sem cartão rico. Se virar prioridade, o lugar é a página do
  torneio no site (Next).
- **Tirar o login da TV** — continua como está.
- **Fotos dos atletas na página pública** — travadas pela regra de `public_profiles`; abrir
  leitura pública de perfil é decisão de privacidade, não de tela.
- **Página pública de liga** — só torneio nesta rodada.

## Arquivos

Novos:
- `frontend/projects/organizer/src/app/publico/public-tournament.store.ts`
- `frontend/projects/organizer/src/app/publico/public-tournament-page.component.ts`
- `frontend/projects/organizer/src/app/publico/public-court-card.component.ts`
- `frontend/projects/organizer/src/app/publico/public-selectors.ts` (+ `.spec.ts`)

Alterados:
- `app.routes.ts` — `t/:tournamentId` (pública), `eventos/:id/telao`, `telao` → redirect.
- `painel/shell/panel-shell.component.ts` — item Telão sai da nav global, entra na do torneio.
- `painel/telao/telao-config.component.ts` — torneio vem da rota; sem seletor; card do link
  público.
- `painel/telao/telao-screen.component.ts` — QR no rodapé.
- `painel/data/tournament.model.ts` e `painel/data/tournaments-repository.ts` —
  `showPublicQr`.

## Testes

- `public-selectors.spec.ts`: ordem dos resultados, queda para `scheduledAt` sem
  `matchEndedAt`, limite, e partida não encerrada fora da lista.
- Spec do store: com `watchTournament`/`watchMatches` dublados — doc inexistente vira
  `notFound`; snapshot alimenta `matches`; **nenhuma leitura de perfil é disparada**.
- Spec da página: renderiza quadra ao vivo, fila e resultados a partir de fixtures; estados
  vazio e não encontrado.
- Spec da aba Telão: sem seletor de evento, e o torneio vem do input da rota.
- `telaoConfigFromRaw`: doc sem `showPublicQr` resulta em `true`.
- TestBed **zoneless** (`provideZonelessChangeDetection()`) em todos — sem isso, NG0908.

## Riscos

- **Leitura deslogada**: qualquer chamada que escape para `public_profiles`, `users` ou
  `inscriptions` (list) quebra a página com permission-denied. Por isso o store é próprio e
  mínimo, em vez de reusar `TelaoDataService`.
- **Rota pública sem guard num app de painel**: o `**` do router hoje manda tudo para
  `entrar`; `t/:tournamentId` precisa vir antes e ficar fora do bloco `painel`.
- **Link vazado de torneio `linkOnly`**: a página pública responde para qualquer id válido,
  como já acontece com `tournaments` (leitura pública) e com a página do site. Não é
  regressão, mas é bom saber: `visibility` não esconde jogos.
- **Deploy**: rota nova em SPA exige o rewrite para `index.html` já configurado no Hosting do
  portal — confirmar antes de anunciar o link.
