# Avaliação da experiência na arena — portal do atleta

**Data:** 2026-07-31
**Branch:** `claude/portal-atleta-avaliacao-experiencia-cf7cfe`
**Projeto:** `frontend/projects/athlete` (Angular)

## Problema

Depois de uma reserva concluída, o app Flutter pede que o atleta avalie a experiência
na arena. O portal web não pede nada: `arena_reviews` não é lido nem escrito em
`frontend/projects/athlete`. Atleta que reserva pelo portal nunca avalia, e a arena
perde reputação que já teria coletado se o mesmo atleta usasse o app.

## O que já existe

### App Flutter (referência de paridade)

| Peça | Arquivo |
| --- | --- |
| Escrita em `arena_reviews` | `nexago_app/lib/features/athlete/data/arena_review_service.dart` |
| Seleção da reserva pendente | `nexago_app/lib/features/athlete/domain/arena_review_providers.dart` (`pendingReviewProvider`) |
| Modal | `nexago_app/lib/features/athlete/presentation/widgets/rating_dialog.dart` |
| Gatilho | `nexago_app/lib/features/athlete/presentation/athlete_bookings_page.dart:143` |

Comportamento atual do app:

1. `pendingReviewProvider` filtra as reservas do atleta que estão concluídas — status
   `completed`/`finalizado` explícito, ou fim + 5 minutos já passados —, descarta as
   canceladas, remove as que já têm doc em `arena_reviews` (busca por `userId` +
   `bookingId whereIn`, em blocos de 10) e devolve a **primeira** que sobrar.
2. A página de reservas abre `showRatingDialog` num post-frame callback, uma única vez
   por `bookingId` por sessão (`_promptedReviewBookingIds`).
3. O modal grava direto no Firestore. O XP é creditado server-side.

### Backend (nada muda nesta entrega)

- **Rules** — `firestore.rules:1462-1483` já permitem `create` em `arena_reviews` quando
  `request.resource.data.userId == request.auth.uid` e `rating` é int entre 1 e 5, com
  `likesCount == 0` e `reported == false`. A escrita do portal passa sem alteração.
- **XP** — `functions/src/arena-review-gamification.ts:75` (`onArenaReviewCreatedAwardXp`,
  exportado em `functions/src/index.ts:172`) dispara no `onCreate` de
  `arena_reviews/{reviewId}` e credita `XP_ARENA_REVIEW = 10` de forma idempotente por
  `reviewId`. O trigger é agnóstico à origem do write: uma avaliação criada pelo portal
  rende os mesmos +10 XP que uma criada pelo app. Nenhuma function nova é necessária.
- **Agregados** — `functions/src/arena-review-aggregates.ts` recalcula
  `arena_reputation/{arenaId}`; também dispara sozinho.

### Portal Angular (o que será tocado)

| Tela | Rota | Arquivo |
| --- | --- | --- |
| Agenda | `/agenda` | `src/app/agenda/athlete-agenda.component.{ts,html,scss}` |
| Detalhe da reserva | `/agenda/reserva/:bookingId` | `src/app/agenda/booking-detail/athlete-booking-detail.component.{ts,html,scss}` |
| Histórico | `/historico` | `src/app/history/athlete-history.component.{ts,html,scss}` |

Padrões do projeto a seguir: repositórios em `src/app/data/*-repository.ts` com funções
puras exportadas (não classes); lógica testável em arquivo próprio com `.spec.ts` ao lado
(ex.: `my-bookings-selectors.spec.ts`); componentes standalone, `ChangeDetectionStrategy.OnPush`,
`signal()`/`computed()`, `inject()`; modal no formato de
`src/app/tournaments/registration/invite-partner-dialog.component` (backdrop + `role="dialog"`).

## Escopo

**Dentro:** criar a avaliação (nota + destaques + comentário) a partir do portal, com os
três pontos de entrada descritos abaixo.

**Fora:** editar ou excluir avaliação; curtir/denunciar; listar as avaliações da arena na
página de detalhe da arena; resposta do gestor. Todos já existem no app e/ou no painel da
arena e ficam para outra fatia.

## Arquitetura

### 1. `src/app/data/arena-reviews-repository.ts`

Espelha `ArenaReviewService`. Duas funções exportadas:

```ts
submitArenaReview(db: Firestore, input: {
  arenaId: string; bookingId: string; userId: string;
  rating: number; comment: string | null;
}): Promise<void>
```

Validações, na mesma ordem do Dart, cada uma com a mensagem em português que o usuário verá:

1. `arenaId`, `bookingId`, `userId` não vazios → `Dados inválidos para avaliação.`
2. `rating` inteiro entre 1 e 5 → `A nota deve estar entre 1 e 5.`
3. Nenhum doc em `arena_reviews` com esse `bookingId` → `Esta reserva já foi avaliada.`
4. `arenaBookings/{bookingId}` existe → `Reserva não encontrada para avaliação.`
5. `arenaId` e dono da reserva batem (aceitando os nomes legados `athleteId` /
   `bookingAthleteId` / `userId`), reserva não cancelada e concluída →
   `Avaliação permitida apenas após a reserva concluída.` / `Avaliação não permitida para reserva cancelada.`

Como no Dart, quando a data/hora do doc não é utilizável a escrita é **liberada** — a
checagem anterior já decidiu, e travar aqui bloquearia reserva legítima com doc malformado.

Grava exatamente os mesmos campos do app: `arenaId`, `userId`, `bookingId`, `rating`,
`comment`, `likesCount: 0`, `reported: false`, `createdAt: serverTimestamp()`.

```ts
fetchReviewedBookingIds(db: Firestore, userId: string, bookingIds: readonly string[]): Promise<Set<string>>
```

`where('userId','==',uid)` + `where('bookingId','in',chunk)` em blocos de 10 — mesmo limite
do Firestore que o provider Dart já respeita.

### 2. `src/app/data/pending-arena-review.ts` (+ `.spec.ts`)

Lógica pura, sem Firestore, sobre o tipo `MyBooking` que `my-bookings-repository.ts` já
produz. Reutiliza `bookingEndsAt` / `bookingIsActive` do mesmo módulo.

```ts
const REVIEW_PROMPT_DELAY_MS = 5 * 60_000;   // espelha _reviewPromptDelayAfterEnd (Dart)
const AUTO_PROMPT_WINDOW_DAYS = 30;

bookingIsReviewable(booking: MyBooking, now: Date): boolean
pickPendingReview(bookings, reviewedIds: ReadonlySet<string>, now: Date): MyBooking | null
```

`bookingIsReviewable` devolve `true` quando o status é `completed`/`finalizado`, ou quando
o fim da reserva + 5 minutos já passou. Cancelada devolve `false` sempre.

A reserva que cruza a meia-noite (22:00→01:00) precisa de tratamento local: o
`bookingEndsAt` de `my-bookings-repository.ts` **não** soma um dia quando o fim é menor
que o início — só o `_parseDateTime` do Dart faz isso. Um helper `reviewEndsAt` neste
módulo aplica o ajuste. Corrigir `bookingEndsAt` na origem mudaria `bookingIsUpcoming`, que
a Agenda inteira usa, e isso está fora do escopo desta entrega.

`pickPendingReview` filtra por `bookingIsReviewable`, remove as que estão em `reviewedIds`
e devolve a de **fim mais recente**. Divergência deliberada do app: lá a escolha é a
primeira da ordem do stream, que é arbitrária (duas queries mescladas por id); ordenar por
fim decrescente é determinístico e pergunta sobre o jogo que o atleta lembra.

`pickPendingReview` respeita `AUTO_PROMPT_WINDOW_DAYS`: reservas concluídas há mais de 30
dias não viram candidata. A janela existe só para não jogar um modal sobre um jogo
esquecido no primeiro acesso de quem tem histórico antigo.

Quem aplica a janela é `pickPendingReview`; `bookingIsReviewable` não a conhece. Isso
divide as superfícies em duas famílias:

| Superfície | Fonte | Janela de 30 dias |
| --- | --- | --- |
| Modal automático da Agenda | `pickPendingReview` | sim |
| Item no card "Precisa de você" | `pickPendingReview` (mesma candidata) | sim |
| Botão no detalhe da reserva | `bookingIsReviewable` da reserva aberta | não |
| CTA na linha do histórico | `bookingIsReviewable` da linha | não |

O card "Precisa de você" é superfície de cobrança e segue a janela — senão uma reserva de
seis meses atrás ficaria cobrando para sempre. Detalhe e histórico são contextos que o
atleta abriu de propósito sobre uma reserva específica, então avaliar continua disponível
sem limite de tempo.

### 3. `src/app/data/pending-arena-review.service.ts`

Serviço `providedIn: 'root'` com signals. Existe porque o mesmo estado alimenta três telas
e o "já avaliei" precisa sumir das três sem reload — um store só evita três buscas
divergentes ao Firestore.

Estado:

- `pending: Signal<MyBooking | null>` — candidata ao modal automático.
- `reviewedBookingIds: Signal<ReadonlySet<string>>` — alimenta os CTAs ("Avaliar" vs. "Avaliação enviada").
- `dismissedThisSession: Set<string>` — memória in-process, equivalente a
  `_promptedReviewBookingIds` do app. Não persiste: recarregar a página reabre o modal, igual
  a reabrir o app.

Métodos: `refresh()` (carrega reservas + ids já avaliados), `markReviewed(bookingId)`,
`dismiss(bookingId)`, `isReviewed(bookingId)`.

### 4. `src/app/agenda/review/arena-review-dialog.component.{ts,html,scss}`

Standalone, `OnPush`. Input `booking: MyBooking`; outputs `submitted` e `dismissed`.

Conteúdo, espelhando `rating_dialog.dart`:

- Eyebrow `RESERVA · CONCLUÍDA` à esquerda, badge `+10 XP` à direita.
- Título "Como foi o jogo na **{arenaName}**?" — nome da arena na cor de destaque.
- Subtítulo `HOJE · 19:00-20:00 · QUADRA 1` (`HOJE`/`ONTEM`/`dd/MM`, igual ao Dart).
- Cinco estrelas, valor inicial 5, com label acima: 1 `Péssimo`, 2 `Ruim`, 3 `Regular`,
  4 `Bom`, 5 `Excelente`.
- Seção `O QUE DESTACOU? OPCIONAL` com os mesmos seis chips — `Quadra impecável`,
  `Atendimento bom`, `Iluminação`, `Vestiário`, `Pontualidade`, `Estacionamento` —, os dois
  primeiros pré-selecionados, mais o chip `+ comentário` que revela um textarea.
- Ações: `Agora não` (ghost) e `Enviar e ganhar +10 XP` (primário, com spinner
  `NxSpinnerComponent` enquanto envia).

Comentário composto igual ao app: `Destaques: a, b` na primeira linha, texto livre na
segunda; `null` quando não há nem tag nem texto.

Ajustes de web sobre o comportamento do app:

- Esc e clique no backdrop equivalem a "Agora não". O app usa `barrierDismissible: false`,
  que no desktop seria hostil.
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` no título, foco inicial na
  primeira estrela, foco preso no diálogo enquanto aberto e devolvido ao gatilho ao fechar.
- Estrelas como `radiogroup` — setas navegam, Espaço/Enter selecionam.
- Erro de envio aparece inline no diálogo (`role="alert"`), com o diálogo aberto para nova
  tentativa. O app usa snackbar e fecha; manter aberto evita perder o texto digitado.

### 5. Pontos de entrada

**Agenda (`/agenda`)** — depois do carregamento, se `pending()` não for null e o
`bookingId` não estiver em `dismissedThisSession`, abre o modal uma vez. Independente
disso, o card lateral "Precisa de você" ganha um item "Avaliar experiência" com o nome da
arena e a data, e um botão "Avaliar" que abre o mesmo modal. É **um item só** — a mesma
candidata de `pending()` —, não a lista de todas as reservas não avaliadas: o app também
pergunta uma de cada vez, e o card já divide espaço com os convites. O item fica **separado** dos
convites: `AgendaPendingRequest` modela convite com aceitar/recusar, e enfiar avaliação
nesse tipo misturaria duas semânticas. Entra como bloco próprio dentro do card, acima da
lista de convites, e conta em `pendingActionCount()`.

**Detalhe da reserva (`/agenda/reserva/:bookingId`)** — quando `lifecycle() === 'past'`,
botão "Avaliar experiência" nas ações. Se a reserva já tem avaliação, mostra o estado
"Avaliação enviada" desabilitado.

**Histórico (`/historico`)** — nas linhas de kind `aluguel` já concluídas e ainda não
avaliadas, um CTA "Avaliar" na linha, abrindo o mesmo modal.

Nos três casos, o sucesso chama `markReviewed(bookingId)` e o CTA vira "Avaliação enviada"
na hora, sem reload.

## Fluxo de dados

```
AthleteAgendaComponent (ou detalhe / histórico)
  └─ PendingArenaReviewService.refresh()
       ├─ fetchMyBookings(db, uid)                     [my-bookings-repository]
       ├─ fetchReviewedBookingIds(db, uid, ids)        [arena-reviews-repository]
       └─ pickPendingReview(bookings, reviewed, now)   [pending-arena-review, puro]
  └─ <app-arena-review-dialog [booking]="…" (submitted)="…" (dismissed)="…">
       └─ submitArenaReview(db, {...})                 [arena-reviews-repository]
            └─ create arena_reviews/{id}
                 ├─ onArenaReviewCreatedAwardXp   → +10 XP  (já deployado no código)
                 └─ arena-review-aggregates       → arena_reputation/{arenaId}
```

## Tratamento de erro

| Situação | Comportamento |
| --- | --- |
| Firestore indisponível no `refresh()` | Sem modal, sem CTA. Silencioso: é enriquecimento, não bloqueia a Agenda. |
| `submitArenaReview` rejeitado pelas rules | Erro inline no diálogo: `Não foi possível enviar sua avaliação. Tente de novo.` Diálogo continua aberto com o texto preservado. |
| Reserva já avaliada (corrida entre app e portal) | Mensagem `Esta reserva já foi avaliada.`, `markReviewed` local e diálogo fecha. |
| Usuário sem sessão | Nem modal nem CTA — `refresh()` sai cedo sem `uid`. |

## Testes

`pending-arena-review.spec.ts`, no padrão dos specs existentes (`my-bookings-selectors.spec.ts`):

- `bookingIsReviewable`: cancelada → false; futura → false; terminou há 3 min → false;
  terminou há 10 min → true; status `completed` mesmo antes do horário → true;
  status `finalizado` → true; reserva que cruza a meia-noite → usa o fim correto.
- `pickPendingReview`: escolhe a de fim mais recente; ignora as que estão em `reviewedIds`;
  devolve `null` com lista vazia; devolve `null` quando a única candidata terminou há mais
  de 30 dias; a mesma candidata de 40 dias continua passando em `bookingIsReviewable`.

Verificação final: `ng build athlete` limpo e teste manual no navegador com login real —
reserva concluída deve abrir o modal, enviar, creditar e sumir dos três pontos de entrada.

## Pendências fora desta entrega

- O trigger de XP e o de agregados existem no código, mas o deploy das functions é
  pendência conhecida do projeto. Enquanto não houver deploy no ambiente, a avaliação é
  gravada e aparece para a arena, mas os +10 XP prometidos no botão não caem. Isso já vale
  para o app hoje — não é regressão introduzida aqui.
- A validação de "reserva concluída" é client-side nas duas plataformas: as rules checam
  autoria e faixa da nota, não o estado da reserva. Apertar as rules mudaria o
  comportamento do app e está fora do escopo desta entrega.
