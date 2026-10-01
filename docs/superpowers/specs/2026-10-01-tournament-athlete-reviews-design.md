# Avaliação do torneio pelos atletas (pós-evento)

Data: 2026-10-01

## Contexto

Hoje não existe avaliação de torneio nem de organizador. O atleta avalia a **arena** depois de
uma reserva (`arena_reviews`). Esse fluxo tem gravação pelo cliente, agregados por trigger, XP,
aviso ao gestor, card de "avaliação pendente" no app e no portal, e uma página "Avaliações" no
painel da arena. Ele é o molde mais próximo, mas não serve como está: aqui a avaliação é
**anônima para o organizador**, e isso muda o caminho da escrita (ver "Abordagem").

O que precisa ser levado em conta:

- **Não existe status "finalizado" manual.** O servidor só marca
  `listingStatus/status: 'completed'` + `completedAt` sozinho. Isso acontece quando a última
  final de categoria é concluída (`tryCompleteTournamentAfterFinal`,
  `functions/src/organizer-match-ops.ts:332`). O app e o portal também tratam o torneio como
  encerrado quando o `endAt` passa, mesmo sem a flag.
- **Quem jogou** = inscrição confirmada: `isPaid && !waitlist && !partnerPending && teamId`.
  É o mesmo filtro que monta `paidTeamIds` para a chave
  (`frontend/projects/organizer/src/app/painel/data/bracket-eligibility.ts`). Os uids saem de
  `registrationAthleteUids(registration, team)`
  (`functions/src/tournament-registration-pix-helpers.ts:108`), que cobre dupla, trio e quinteto.
  Quem foi substituído sai de `participantUids`, e a troca só vale até as chaves, então essa
  pessoa não jogou.
- **O organizador grava no doc do torneio** (`firestore.rules:2117`). Uma nota guardada ali
  poderia ser editada por ele. Congelar o campo por rule traz outro risco: se algum save
  reenviar o campo, a rule recusa a gravação inteira.
- **O organizador não tem perfil público.** O app mostra só o nome dele no detalhe do torneio
  (`tournamentOrganizerDisplayProvider`).
- **`category_feedbacks` é um esqueleto órfão.** Tem rules em `firestore.rules:2438` e 3 índices
  em `firestore.indexes.json`, mas nenhum código usa.

## Decisões já validadas com o dono

- **Objetivo:** feedback completo para o organizador e reputação pública para os atletas.
- **Nota do torneio e do organizador:** cada avaliação pertence a um torneio. O torneio
  encerrado mostra a própria nota. O organizador acumula a média de todos os eventos dele, e
  essa média aparece ao lado do nome em torneios futuros.
- **Formulário:**
  - Nota geral de 1–5 ★, obrigatória. É ela que vira a nota pública.
  - 5 aspectos opcionais, também de 1–5 ★.
  - Comentário opcional.
- **Anonimato:**
  - O organizador vê notas e comentários **sem nome**.
  - O público vê só agregados (média, contagem, distribuição, aspectos), **sem texto**.
  - O backoffice vê tudo, com nome.
- **Publicação ao vivo.** Média e comentários atualizam a cada avaliação, a partir de 3. O
  dono aceitou o risco do delta: com a média ao vivo, o organizador consegue deduzir a nota de
  cada avaliação nova.
- **Janela:**
  - Abre no que vier primeiro: `completed` ou `endAt` + 12h.
  - Push às 10h e lembrete no 3º dia.
  - Fecha em 14 dias. Depois disso a nota congela.
- **Quem avalia:** atleta de inscrição confirmada. Uma avaliação por atleta por torneio,
  editável até a janela fechar.
- **Limite mínimo de 3 avaliações** para a nota pública e para o organizador ler comentários.
- **A parte anônima não guarda uid, data nem categoria,** e a ordem é embaralhada.
- **+10 XP por avaliar,** igual à arena.
- **O organizador não responde** comentários (não faz sentido com anonimato).
- **A nota do torneio não entra na nota da arena.**
- **Sem modal automático** no app. A avaliação aparece como card na Home, botão no detalhe e push.
- **Meta de sucesso:** ≥ 30% dos atletas elegíveis avaliando.
- **A v1 cobre todas as superfícies:**
  - O atleta responde no app e no portal.
  - O organizador vê no painel web e no app.
  - A nota pública aparece no app, no portal e no site (`torneios/:id`).
  - O backoffice tem tela própria.

## Abordagem

**Convites materializados pelo servidor e gravação por callable.**

1. **Job diário** decide quem pode avaliar e até quando. Ele grava um convite por atleta.
2. **Callable** confere o convite e grava a avaliação privada.
3. **Trigger** gera a cópia anônima e recalcula os agregados.
4. **Os clientes** só leem os próprios convites e os agregados públicos. Nenhuma superfície
   decide sozinha quem pode avaliar.

Alternativas descartadas:

- **Gravação direta pelo cliente, como em `arena_reviews`.** A validação dos aspectos, do
  comentário e do prazo ficaria nas rules, mais difícil de testar. O ganho (funcionar offline)
  não compensa.
- **Cada superfície calcular o que está pendente.** App, portal e painel já divergem sobre o
  status do torneio (o caso `closed ≠ em andamento`). Push e lembrete precisam do servidor de
  qualquer jeito.

## 1. Dados e rules

Nenhuma das coleções abaixo aceita escrita do cliente (`allow write: if false`). Só o
servidor grava.

### `users/{uid}/tournamentReviewInvites/{tournamentId}`

Convite do atleta. É a única fonte de "posso avaliar este torneio, e até quando".

| Campo | Tipo | Nota |
|---|---|---|
| `tournamentId` | string | |
| `tournamentName` | string | denormalizado, para o card renderizar sem ler o torneio |
| `coverUrl` | string \| null | idem |
| `organizerId` | string | `managerId` do torneio |
| `opensAt` / `closesAt` | Timestamp | `closesAt = opensAt + 14 dias` |
| `status` | `'pending' \| 'submitted' \| 'expired'` | |
| `submittedAt` | Timestamp \| null | |
| `createdAt` | Timestamp | |

Leitura: `request.auth.uid == uid`.

### `tournamentReviews/{tournamentId}_{uid}` (privado)

| Campo | Tipo | Nota |
|---|---|---|
| `tournamentId`, `organizerId`, `uid` | string | |
| `overall` | int 1–5 | obrigatório |
| `aspects` | map | chaves opcionais da lista fechada abaixo, cada uma int 1–5 |
| `comment` | string \| null | sem espaços nas pontas, ≤ 1000 caracteres, vazio vira null |
| `anonId` | string | id da cópia anônima, gerado na 1ª gravação e preservado nas edições |
| `createdAt` / `updatedAt` | Timestamp | |

Leitura: o autor (`resource.data.uid == request.auth.uid`), `isAdmin()` e `isSuperAdmin()`.

Em doc inexistente, `resource` é null e essa rule nega. Por isso o cliente **só lê o doc
privado quando o convite está `submitted`**, e nunca usa a leitura para descobrir se já
avaliou. Quem diz isso é o convite.

### `tournaments/{tournamentId}/anonymousReviews/{anonId}`

| Campo | Tipo | Nota |
|---|---|---|
| `overall` | int 1–5 | |
| `aspects` | map | |
| `comment` | string \| null | |
| `shuffleKey` | number | aleatório, gerado uma vez. A tela ordena por ele |

**Não guarda** uid, datas nem categoria.

Leitura:

```
isAdmin() || isSuperAdmin() ||
(canManageTournament(tournamentId) &&
 exists(/databases/$(database)/documents/tournamentReviewSummaries/$(tournamentId)) &&
 get(/databases/$(database)/documents/tournamentReviewSummaries/$(tournamentId)).data.count >= 3)
```

Quem garante o limite de 3 é a rule. A tela não precisa "lembrar" de esconder.

### `tournamentReviewSummaries/{tournamentId}` (público)

| Campo | Tipo | Nota |
|---|---|---|
| `tournamentId`, `organizerId` | string | |
| `status` | `'open' \| 'closed'` | |
| `eligibleCount` | int | atletas convidados |
| `count` | int | avaliações recebidas (ao vivo) |
| `average` | number \| null | **null enquanto `count < 3`** |
| `distribution` | map `{"1".."5": int}` \| null | null enquanto `count < 3` |
| `aspects` | map `{chave: {count, average}}` \| null | null enquanto `count < 3`. Só aparecem os aspectos com pelo menos 1 nota |
| `opensAt` / `closesAt` | Timestamp | |
| `reminderSentAt` / `closedAt` | Timestamp \| null | |
| `updatedAt` | Timestamp | |

Leitura: `if true` (o site lê sem login).

### `organizerReputation/{organizerId}` (público)

| Campo | Tipo | Nota |
|---|---|---|
| `reviewsCount` | int | todas as avaliações de todos os torneios do organizador |
| `tournamentsRated` | int | torneios com ≥ 1 avaliação |
| `average` | number \| null | null enquanto `reviewsCount < 3` |
| `distribution`, `aspects` | map \| null | mesmo formato do resumo, null enquanto `reviewsCount < 3` |
| `updatedAt` | Timestamp | |

Leitura: `if true`.

Torneios que ficaram com menos de 3 avaliações **também entram** na reputação do organizador.

### Aspectos (lista fechada)

| Chave | Rótulo |
|---|---|
| `organization` | Organização geral |
| `schedule` | Cumprimento dos horários |
| `refereeing` | Arbitragem / mesa |
| `venue` | Estrutura do local |
| `prizes` | Premiação e kit |

A lista fica numa constante compartilhada por functions, app e portais. Os testes conferem a
paridade dessas cópias.

### Flag

`appConfig/tournamentReviews { enabled: boolean }` segue o padrão de
`functions/src/friendly-match-config.ts`. Com a flag desligada, o job não faz nada.

### Índices

- `tournaments (listingStatus ASC, completedAt ASC)`.
- Collection group `tournamentReviewInvites (tournamentId ASC, status ASC)`.

As consultas por campo único (`tournamentReviews.tournamentId`, `tournamentReviews.organizerId`,
`tournaments.endAt`) usam os índices automáticos.

### Remoção

Saem as rules de `category_feedbacks` (`firestore.rules:2438-2452`) e os 3 índices dela
(`firestore.indexes.json:96-155`).

## 2. Backend (Cloud Functions)

As callables usam a mesma convenção de região das vizinhas (`CLIENT_FACING_REGIONS`). Os
triggers e o job usam a região global (`southamerica-east1`). Os arquivos novos importam depois
de `global-options`.

### 2.1 Job `tournamentReviewDailySweep`

`onSchedule("0 10 * * *", timeZone: "America/Sao_Paulo")`. Cada torneio roda no seu próprio
try/catch, como em `revealFriendlyMatchReviews`. Se `appConfig/tournamentReviews.enabled !== true`,
o job sai sem fazer nada.

**a) Abrir janelas**

1. **Candidatos:** a união de duas consultas.
   - `listingStatus == 'completed' && completedAt >= now − 3d`
   - `endAt >= now − 3d && endAt <= now − 12h`
2. **Descarta** `cancelled` e `draft`, e qualquer torneio que já tenha
   `tournamentReviewSummaries/{id}`. O corte de 3 dias impede que o deploy, ou o momento em que a
   flag é ligada, dispare push para torneios antigos.
3. **Elegíveis:**
   - Inscrições do torneio que passam pelo filtro de confirmação.
   - Uids resolvidos por `registrationAthleteUids`.
   - **Sem repetição:** atleta em 2 categorias recebe 1 convite.
   - **Sem quem gerencia:** sai o `managerId` e os gestores de `tournamentManagerUids`.
4. **Grava em lotes:** os convites (`pending`) e o resumo
   `{status:'open', eligibleCount, count:0, opensAt, closesAt: opensAt + 14d}`. O `opensAt` é o
   **horário agendado** da execução (`event.scheduleTime`, 10:00 em ponto), não o relógio do
   momento. Se fosse o relógio, `opensAt` ficaria alguns segundos depois das 10:00 e o
   lembrete e o fechamento escorregariam um dia.
5. **Push** `tournament_review_request` para cada convidado.
6. **Torneio sem elegíveis** ganha resumo com `eligibleCount: 0` e nenhum push. Isso também marca
   que ele já foi processado.

**b) Lembrete**

Para cada resumo `open` sem `reminderSentAt` e com `opensAt <= now − 3d`:
- Push `tournament_review_reminder` para os convites `pending` daquele torneio (collection group
  `tournamentReviewInvites where tournamentId == X && status == 'pending'`).
- Grava `reminderSentAt`.

**c) Fechar**

Para cada resumo `open` com `closesAt <= now`:
- Grava `status: 'closed'` e `closedAt`.
- Convites `pending` viram `expired`.
- Push `tournament_review_closed` ao organizador (2.4).

As funções que decidem candidatura, elegibilidade e a ação da janela
(`reviewWindowAction(tournament, summary, now)`) são puras e testadas. O handler só faz I/O.

### 2.2 Callable `submitTournamentReview`

Entrada: `{ tournamentId, overall, aspects?, comment? }`.

**Validação** (função pura `parseTournamentReviewInput`):
- `overall` e cada aspecto: inteiros de 1 a 5.
- Chave de aspecto fora da lista: `invalid-argument`.
- Comentário: sem espaços nas pontas e com no máximo 1000 caracteres. Mais que isso dá
  `invalid-argument`.

**Erros que chegam ao atleta:**

| Situação | Código | Mensagem |
|---|---|---|
| sem login | `unauthenticated` | (fluxo padrão de sessão expirada) |
| sem convite | `permission-denied` | "Você não participou deste torneio." |
| `closesAt <= now` ou convite `expired` | `failed-precondition` | "A avaliação deste torneio foi encerrada." |

**Transação:**
1. Lê o convite e o doc privado.
2. Grava o doc privado. Numa edição, preserva `anonId` e `createdAt`. Na criação, gera `anonId`
   com `randomUUID()`.
3. Marca o convite como `submitted` e grava `submittedAt`.

Retorno: `{ ok: true, created: boolean }`. Os clientes traduzem `not-found` cru (callable
ainda não deployada) para uma mensagem amigável.

### 2.3 Triggers

**`onTournamentReviewWritten`** (`onDocumentWritten("tournamentReviews/{reviewId}")`), no molde
de `arena-review-aggregates.ts`:

1. **Cópia anônima:** faz upsert de `tournaments/{tid}/anonymousReviews/{anonId}` com `overall`,
   `aspects` e `comment`. O `shuffleKey` é gerado só se o doc ainda não existir.
2. **Resumo do torneio:** recalcula a partir de `tournamentReviews where tournamentId == tid`
   (`count`, e `average`/`distribution`/`aspects` com o limite de 3).
3. **Reputação do organizador:** recalcula `organizerReputation/{organizerId}` a partir de
   `tournamentReviews where organizerId == X`, lendo só `overall` e `aspects`.

Recalcular do zero é idempotente, então não sofre com o at-least-once dos triggers. O custo é
uma leitura por avaliação do organizador, aceitável na escala atual. Se algum organizador passar
de ~10 mil avaliações, troca-se por um acumulador.

**`onTournamentReviewCreatedAwardXp`** (`onDocumentCreated`): +10 XP, idempotente via
`users/{uid}/gamification_events/tournament_review_{tournamentId}`, igual a
`arena-review-gamification.ts`.

### 2.4 Notificações

Todas vão por `deliverNotificationToUser`, que grava no inbox e manda FCM e Web Push. Os valores
de `data` são strings.

| Tipo | Para | Título / corpo | `data` |
|---|---|---|---|
| `tournament_review_request` | atleta | "Como foi o {torneio}?" / "Avalie em 10 segundos e ganhe 10 XP." | `tournamentId`, `url: /torneios/{id}` |
| `tournament_review_reminder` | atleta (pendente) | "Ainda dá tempo de avaliar o {torneio}" / "A avaliação fecha em {dd/mm}." | `tournamentId`, `url: /torneios/{id}` |
| `tournament_review_closed` | `managerId` + `tournamentManagerUids` | "Avaliações do {torneio} encerradas" / "{média} ★ com {n} avaliações." Com `count < 3`: "Recebeu {n} avaliações, poucas para exibir." | `tournamentId`, `url: /organizer/tournaments/{id}`, `webUrl: /painel/eventos/{id}/avaliacoes` |

**Compatibilidade com builds antigos:**

- **`url` sempre aponta para uma rota que já existe no app antigo.** O
  `resolveNotificationRoute` (`nexago_app/lib/core/notifications/notification_navigation.dart:111`)
  usa a `url` antes do `type`, e o router não tem `errorBuilder`. O build antigo cai no detalhe
  do torneio (atleta) ou no torneio do organizador.
- **Build novo:** checa estes 3 tipos **antes** da `url`.
  - `request` e `reminder` vão para `/torneios/{id}/avaliar`.
  - `closed` vai para `/organizer/tournaments/{id}/reviews`.
- **`push-sw.js` do portal do organizador** passa a abrir `data.webUrl ?? data.url`. As
  notificações existentes não têm `webUrl` e continuam iguais.

## 3. Experiência do atleta (app e portal)

### Por onde o atleta chega no formulário

1. **Push** (pedido e lembrete).
2. **Card na Home**, perto de "convites recebidos": "Como foi o {torneio}? Avalie em 10
   segundos". Fica até o atleta enviar ou a janela fechar. Com vários pendentes, os cards
   aparecem empilhados. Fonte: os convites `pending` do usuário.
3. **Detalhe do torneio encerrado** (`tournament_detail_page.dart`, `overview-tab` no portal) e
   **campanha do atleta** (`/athlete/history/tournament/:id`):
   - Botão "Avaliar torneio" enquanto o convite está pendente.
   - "Você avaliou ★ {n} · Editar" depois de enviar, até a janela fechar.
   - "Avaliação encerrada em {dd/mm}" depois de fechar, para quem tinha convite.
   - Nada para quem não tem convite.
4. **Inbox:** os 2 tipos novos entram no switch de `athlete_notifications_logic.dart` e no inbox
   do portal (`notificacoes`).

O estado do botão (`none | pending | submitted | closed`) vem de uma **função pura**, com uma
cópia no app e outra no portal. Ela recebe o convite e `now`.

### Formulário

- **App:** página em `/torneios/:tournamentId/avaliar`.
- **Portal:** diálogo no shell do torneio, aberto pela rota `torneios/:id/avaliar`, no padrão do
  `arena-review-dialog`.

Conteúdo:

- **Cabeçalho:** capa, nome e data do torneio.
- **Nota geral** (obrigatória): 5 estrelas grandes com rótulo (Péssimo / Ruim / Ok / Bom /
  Excelente). Sem ela, "Enviar" fica desabilitado.
- **"Quer detalhar? (opcional)":** os 5 aspectos com estrelas menores. Tocar de novo na mesma
  estrela limpa a nota.
- **Comentário** (opcional, contador de 1000): placeholder "O que o organizador deveria manter
  ou mudar?". Aviso fixo abaixo: **"O organizador lê sem o seu nome. Evite se identificar no
  texto."**
- **Enviar:** chama a callable e mostra "Obrigado! +10 XP" (o XP só na criação).
- **Edição:** o formulário vem preenchido com o doc privado (o autor pode ler).
- **Janela fechada:** "Avaliação encerrada em {dd/mm}", sem formulário.

### Código

- **App** (`nexago_app/lib/features/tournaments/`, nas pastas `data/`, `domain/` e
  `presentation/` que a feature já usa):
  - Modelo `TournamentReviewInvite`.
  - `pendingTournamentReviewsProvider` (stream dos convites `pending`).
  - `tournamentReviewInviteProvider(tid)` e `myTournamentReviewProvider(tid)`.
  - `TournamentReviewService.submit`.
  - Função pura `tournamentReviewCtaState`.
- **Portal** (`frontend/projects/athlete/src/app/`):
  - `data/tournament-reviews-repository.ts`.
  - `data/pending-tournament-review.service.ts`.
  - Regra pura do estado.
  - Componente do diálogo.

## 4. Organizador (painel web e app) e backoffice

### Painel web: torneio

Item novo **"Avaliações"** na sidebar do nível torneio
(`frontend/projects/organizer/src/app/painel/shell/panel-shell.component.ts:418`), com rota
`painel/eventos/:id/avaliacoes` (`painel/avaliacoes/avaliacoes-torneio.component.ts`). Os dados
chegam ao vivo por `onSnapshot` no resumo e nos comentários.

| Estado | O que mostra |
|---|---|
| sem resumo, torneio não terminou | "A avaliação abre quando o torneio terminar." |
| sem resumo, torneio já encerrado | "Este torneio terminou antes de as avaliações existirem." (é o caso de todo torneio anterior à feature ou à flag) |
| `count < 3` | "{count} de {eligibleCount} atletas avaliaram. As notas aparecem a partir de 3 avaliações." |
| `count >= 3` | conteúdo completo (abaixo) |

Conteúdo completo:
- **Topo:** média grande, número de avaliações, **taxa de resposta** ("23 de 42 atletas") e
  status ("Aberta até {dd/mm}" / "Encerrada").
- **Distribuição:** barras de 5★ a 1★.
- **Aspectos:** média e contagem de cada um ("Horários 3,4 · 18 notas"), do mais fraco para o
  mais forte.
- **Comentários anônimos:** cards ordenados por `shuffleKey`, com a nota geral, os aspectos
  marcados e o texto, mais um filtro por estrelas ("só 1–2★"). Avaliações sem texto entram nos
  números, mas não viram card.

Na visão geral do torneio (`torneio-detalhe.component.ts`), um KPI a mais: "Avaliação 4,6 ★",
com link para a aba. Com `count < 3`, mostra "—".

### Painel web: reputação do organizador

Item **"Reputação"** no nível global da sidebar, com rota `painel/reputacao`:
- Média geral e total de avaliações (de `organizerReputation`).
- Médias dos aspectos somando todos os eventos.
- Tabela por torneio: data, média, avaliações, taxa de resposta e aspecto mais fraco. Vem de
  `tournamentReviewSummaries where organizerId == uid`.

### App do organizador

- Card "Avaliações · 4,6 ★ (23)" na visão geral do torneio
  (`organizer_tournament_overview_page.dart`).
- O card abre `/organizer/tournaments/:tournamentId/reviews`, com o mesmo conteúdo e os mesmos
  estados da aba web.
- A reputação consolidada fica só no web na v1.

### Backoffice

Tela **"Avaliações de torneios"** em `frontend/projects/backoffice`, somente leitura:
- Lista de torneios com resumo (data, organizador, média, avaliações, taxa de resposta),
  ordenável por mais recente ou pior média.
- O detalhe de um torneio mostra cada avaliação **com o nome do atleta** (doc privado, liberado
  ao admin pela rule) e a data.

## 5. Exibição pública (app, portal e site)

As leituras usam os docs públicos `tournamentReviewSummaries/{tid}` e
`organizerReputation/{managerId}`. No site, a leitura vem do firestore-lite no cliente.

**Torneio encerrado com `count >= 3`** (app `tournament_detail_page.dart`, portal
`overview-tab`, site `torneio-detail.page.ts`):
- **Selo no topo:** "★ 4,6 · 23 avaliações". Uma casa decimal, vírgula, uma estrela e o número,
  sem meia-estrela.
- **Seção "Como os atletas avaliaram":** barras com a média de cada aspecto que tem nota.
- Com a janela aberta, os números atualizam ao vivo.

**Qualquer torneio**, na linha do organizador que já existe, quando `reviewsCount >= 3`:
"Organizado por {nome} · ★ 4,7 (86 avaliações em 5 torneios)". Abaixo de 3 não mostra nada.
Selo de "estreante" seria injusto com quem organizou antes da feature existir.

## 6. Testes

**Functions** (`node:test`, arquivos `*.test.ts` ao lado do código):
- Candidatura e elegibilidade:
  - Corte de 3 dias e de `endAt + 12h`.
  - `cancelled` fica de fora.
  - Torneio com resumo não é reprocessado.
  - Sem repetição entre categorias.
  - Exclusão de quem gerencia.
  - Filtro de confirmação (waitlist, `partnerPending`, sem `teamId`).
- `reviewWindowAction`: abrir, lembrar só uma vez no 3º dia, fechar no 14º.
- `parseTournamentReviewInput`: limites de nota, chave de aspecto fora da lista, comentário
  vazio vira null, mais de 1000 caracteres é recusado.
- Agregação: limite de 3 (campos null), aspectos sem nota ficam de fora, e a reputação inclui
  torneios com menos de 3.

**Fiação** (teste de função pura não pega fiação):
- **Handler da callable no emulador:**
  - Sem convite dá `permission-denied`.
  - Prazo vencido dá `failed-precondition`.
  - A edição preserva `anonId` e `createdAt`.
  - O convite vira `submitted`.
- **Rules** (`functions/test/tournament-reviews.rules.test.mjs`, rodando via `npm run test:rules`):
  - O cliente não grava em nenhuma das 5 coleções.
  - O organizador não lê `tournamentReviews`.
  - O atleta lê o próprio doc privado e não lê o de outro.
  - `anonymousReviews` fica bloqueado com `count < 3` e liberado com `>= 3` para quem gerencia.
    Fica bloqueado para outro organizador.
  - O público lê os resumos e a reputação.
  - Convites só são lidos pelo dono.

**App:**
- Testes da função pura `tournamentReviewCtaState`.
- Teste de `resolveNotificationRoute` para os 3 tipos novos e para o payload antigo.
- Widget test do formulário: sem nota geral, "Enviar" fica desabilitado. Enviar chama o
  serviço. O modo edição vem preenchido. A janela fechada mostra a mensagem.

**Portais:** specs das regras puras, do diálogo do atleta, da aba "Avaliações" (os 3 estados) e
da tela de reputação.

**Paridade:** a lista de aspectos é igual em functions, app e portais.

## 7. Entrega em fases

Cada fase vira um PR.

1. **Backend:**
   - Rules, índices e functions.
   - Remoção de `category_feedbacks`.
   - Seed de `appConfig/tournamentReviews { enabled: false }`.
   - `webUrl` no `push-sw.js` do organizador.
   - Sobe **com a flag desligada.**
2. **Atleta:** app e portal respondem (Home, detalhe, campanha, formulário, inbox, roteamento
   de push).
3. **Organizador:** aba e KPI no painel, reputação, app do organizador.
4. **Exibição pública:** app, portal e site.
5. **Backoffice.**
6. **Ligar a flag** quando o build com a fase 2 estiver live na loja, de preferência junto com
   subir o `minBuildNumber` (ver `docs/forced-app-update.md`). Assim ninguém recebe "avalie o
   torneio" num app sem botão de avaliar.

## Riscos aceitos

- **Delta ao vivo.** Com média e contagem atualizando a cada avaliação, um organizador atento
  deduz a nota de cada avaliação nova e, se souber quem acabou de avaliar, liga as duas coisas.
  O dono escolheu publicar ao vivo mesmo assim.
- **O comentário pode identificar o autor** ("eu e minha parceira da dupla 3…"). O aviso no
  formulário mitiga, mas não impede.
- **App Links em `/torneios`.** No Android, um link web para `/torneios/{id}/avaliar` aberto fora
  do navegador vai para o app. Em build antigo, essa rota não existe. O fluxo normal não gera
  esse link (o push leva `/torneios/{id}`), então o risco fica restrito a links copiados à mão.

## Fora de escopo (v1)

- O organizador responder ou denunciar comentário.
- Admin ocultar comentário pela tela (se precisar, sai por script).
- Reputação consolidada no app do organizador.
- Nota nos cards da listagem de torneios e na página `o/:slug`.
- Avaliação de parceiro ou adversário, e avaliação da arena a partir do torneio.
- Selo de "organizador estreante".
