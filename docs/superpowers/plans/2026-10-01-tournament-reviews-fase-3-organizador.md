# Avaliação do torneio — Fase 3 (organizador: painel web e app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O organizador vê o que os atletas acharam do torneio dele:
- **Painel web:** aba "Avaliações" no torneio, KPI na visão geral e página "Reputação" no nível global.
- **App:** card "Avaliações" no hub do torneio e tela `/organizer/tournaments/:tournamentId/reviews`.
- **Push de fechamento:** abre a tela de avaliações no app novo.

**Architecture:** O backend da fase 1 (PR #533, na `main`) é o contrato. O cliente só lê, nada grava:
- **Resumo do torneio:** `tournamentReviewSummaries/{tid}`, público.
- **Comentários anônimos:** `tournaments/{tid}/anonymousReviews`. A rule só libera para dono, gestor e administrador do evento, e só com `count >= 3`.
- **Reputação:** `organizerReputation/{uid}`, pública.

Os estados da tela saem de funções puras, uma cópia em cada superfície. Elas decidem:
- qual estado vazio mostrar;
- se há números públicos;
- se a janela está aberta;
- a ordem dos aspectos;
- quais comentários viram card.

As duas partes não dependem uma da outra:
- **Parte A (painel web):** tasks A1–A4.
- **Parte B (app):** tasks B1–B5.

Elas só se encontram na verificação final (F).

**Tech Stack:**
- **Painel:** Angular 20.3 zoneless (signals, `effect` com `onCleanup`), firebase 12 web SDK, Karma + Jasmine.
- **App:** Flutter 3.47 / Dart 3.11, flutter_riverpod 2.6 com providers manuais (sem codegen), go_router 14.8, cloud_firestore e `flutter_test`.

**Spec:** `docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md` (seção 4, "Organizador"). O contrato dos docs está na seção 2. Também vale o plano da fase 1 `docs/superpowers/plans/2026-10-01-tournament-reviews-fase-1-backend.md`.

## Global Constraints

**Branch**
- `claude/tournament-reviews-fase-3` sai de `claude/tournament-reviews-fase-2` (PR #536, ainda aberto).
- O PR vai contra a `main` se o #536 já estiver mergeado. Se não, vai contra `claude/tournament-reviews-fase-2`.

**Worktree**
- Edite sempre `<worktree> + <caminho relativo do repo>`.
- Antes de cada commit, rode `pwd && git branch --show-current` e confira a branch.
- Depois da primeira edição de cada parte, rode `git -C /Users/silviodionizio/Documents/projects/volley/nexago status --short`. O checkout principal tem que continuar limpo.

**Dependências do painel no worktree**
- Antes de testar o painel: `ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/frontend/node_modules <worktree>/frontend/node_modules`.
- Rode sempre com `cd <worktree>/frontend && …` no mesmo comando. Rodar da raiz do worktree acaba testando a árvore do checkout principal.
- Se a contagem de specs não subir depois de um spec novo, você está testando a árvore errada.

**Subagentes:** não use `haiku`. O piso é `sonnet`.

**Flutter**
- **Não rode `dart format`** em arquivo existente: ele reformata o arquivo inteiro. Em arquivo novo, pode.
- `flutter analyze <arquivos tocados>` tem que sair limpo.
- Todo teste que renderize `tournamentReviewDayMonth` (um `DateFormat` pt_BR) precisa de `initializeDateFormatting('pt_BR')` no `setUpAll`.
- Nada de `pumpAndSettle` com `CircularProgressIndicator` na tela. Use dois `pump()` depois de os streams fakes emitirem.

**Angular**
- Componente de página não define `display` no `:host`: a cadeia de altura do painel depende disso.
- Spec de componente precisa de `provideZonelessChangeDetection()`, e de `provideRouter([])` quando o template usa `routerLink`.
- Os repositórios são funções de módulo, sem DI. Nos specs, deixe o `id` vazio (os efeitos saem cedo) e semeie os signals privados depois do primeiro `whenStable`.
- O `og-bell` dentro do `og-page-header` abre `onSnapshot` real. Troque-o por um stub nos specs que fornecem um `AuthService` falso.
- Lista em tabela usa um `grid-template-columns` só, numa custom property compartilhada pelo cabeçalho e pelas linhas. A responsividade vem de `@container`, não de `@media`.

**Sem deploy** nem escrita em projeto Firebase. A flag `appConfig/tournamentReviews` continua desligada.

**Sem índice novo.** As consultas são:
- o doc do resumo;
- a subcoleção inteira de comentários;
- `tournamentReviewSummaries where organizerId == uid`, que é igualdade num campo só.

A ordenação é feita em memória.

**Textos exatos** (português na UI, inglês no código):

| Onde | Texto |
|---|---|
| sem resumo, torneio não terminou (spec) | `A avaliação abre quando o torneio terminar.` |
| sem resumo, terminou há até 3 dias (o job das 10h ainda vai abrir) | `O torneio terminou. O pedido de avaliação sai para os atletas às 10h.` |
| sem resumo, terminou há mais de 3 dias (spec) | `Este torneio terminou antes de as avaliações existirem.` |
| sem resumo, cancelado | `Torneio cancelado não recebe avaliações.` |
| sem resumo e sem torneio | web `Torneio não encontrado.`; app título `Torneio não encontrado`, subtítulo `Volte e abra o torneio de novo.` |
| `count < 3` (spec) | `{count} de {eligibleCount} atletas avaliaram. As notas aparecem a partir de 3 avaliações.` |
| `count < 3` com `eligibleCount == 0` | `Nenhum atleta ficou apto a avaliar este torneio.` |
| janela | `Aberta até {dd/MM}` / `Encerrada` |
| contagem | `1 avaliação` / `{n} avaliações` |
| taxa de resposta (spec) | `{count} de {eligibleCount} atletas` |
| aspecto (spec) | `{rótulo}` com `{média} · {n} notas` (`1 nota` no singular), do mais fraco para o mais forte |
| aspectos, nesta ordem | `organization` Organização geral, `schedule` Cumprimento dos horários, `refereeing` Arbitragem / mesa, `venue` Estrutura do local, `prizes` Premiação e kit |
| distribuição | `5★` … `1★` |
| filtro dos comentários | `Todos` / `Só 1–2★` |
| comentários vazios | `Nenhum atleta escreveu comentário.` / com o filtro: `Nenhum comentário com 1 ou 2 estrelas.` |
| falhas | `Não foi possível carregar as avaliações.` (web acrescenta ` Recarregue a página.`); `Não foi possível carregar os comentários.` |
| KPI (spec) | rótulo `Avaliação`, valor `4,6 ★` ou `—` |
| card do app (spec) | título `Avaliações`, subtítulo `4,6 ★ (23)`; com menos de 3, `{count} de {eligibleCount} atletas avaliaram`; sem elegíveis, `Nenhum atleta apto a avaliar`; sem resumo, `Notas dos atletas depois do torneio` |
| reputação | KPIs `Média geral`, `Avaliações`, `Torneios avaliados`; aviso `As notas aparecem a partir de 3 avaliações.`; tabela vazia `Nenhum torneio seu passou pela avaliação dos atletas ainda.` |
| média | uma casa decimal, com vírgula: `toFixed(1)` / `toStringAsFixed(1)` e troca `.` por `,` (a mesma regra do push da fase 1) |

**Regras**
- **Números públicos** = `count >= 3` **e** `average != null`. Abaixo disso, a tela não mostra média, distribuição, aspectos nem comentários, e **nem pede** os comentários: a rule negaria.
- **Janela aberta** = `status == 'open'` **e** `closesAt > agora`. O status sozinho não basta, porque o job pode atrasar.
- **Comentário** que vira card tem texto depois do `trim`. A ordem é crescente por `shuffleKey`. O filtro `Só 1–2★` olha a nota geral.
- **Aspectos** vão da menor média para a maior. No empate, vale a ordem da lista.
- **Estado vazio** espelha `reviewCandidateReason` (`functions/src/tournament-review-window.ts`):
  - cancelado → `cancelled`;
  - concluído ou `endAt` já passado → terminou;
  - terminou há até 3 dias → `opening`;
  - terminou há mais de 3 dias → `endedBefore`;
  - o resto → `notEnded`.
  
  O app conhece o `completedAt`. O painel não tem esse campo no modelo e usa `endAt`, ou "agora" se o torneio foi concluído sem `endAt` passado.

**Rotas**
- **Painel:**
  - `painel/eventos/:id/avaliacoes` (`AvaliacoesTorneioComponent`);
  - `painel/reputacao` (`ReputacaoComponent`);
  - os dois sem guard próprio: o `painel` já tem `authGuard` e `organizerGuard`.
- **App:** `/organizer/tournaments/:tournamentId/reviews`, com nome `organizerTournamentReviews`.

**Push (app):** `tournament_review_closed` com `tournamentId` vai para `/organizer/tournaments/{id}/reviews` **antes** de olhar a `url`. Sem `tournamentId`, cai na `url` (`/organizer/tournaments/{id}`). O portal já abre o `webUrl` desde a fase 1, e nada muda lá.

**Desvios da spec (decididos aqui)**
- **O card do app vai no hub do torneio** (`organizer_tournament_explore_section.dart`, seção "GERENCIAR TORNEIO"), e não na visão geral. A spec cita `organizer_tournament_overview_page.dart`, mas essa tela não tem entrada: o card dela está comentado no hub. O card de avaliações aparece para todos menos o mesário (`!matchesOnly`).
- **Estados que a spec não previu**, com os textos da tabela acima: `opening`, `cancelled`, sem elegíveis e torneio não encontrado.

**Ordem de lançamento:** a aba, o KPI e o card aparecem mesmo com a flag desligada. Enquanto a flag estiver desligada, o texto `opening` promete um pedido que não sai. Vá para o PR em "Fica para depois".

## Review Focus

1. **`count < 3` nunca mostra média, distribuição, aspectos nem comentários, e nunca abre o listener dos comentários** (a rule negaria e a tela viraria erro). Testes:
   - A1: `hasPublicNumbers`.
   - A2: estado `collecting`, sem `.og-rv-comment`.
   - B3: o provider de comentários não é lido.
2. **Resumo `open` com `closesAt` vencido** (o job do dia não rodou). Tem que aparecer `Encerrada`, nunca `Aberta até` uma data passada. Testes: A1, B2.
3. **Sem resumo.** As quatro situações têm textos diferentes:
   - torneio por vir;
   - terminou ontem (o job das 10h ainda abre);
   - terminou há mais de 3 dias;
   - cancelado.
   
   Só o primeiro e o terceiro estão na spec. Testes: A1, A2, B2, B3.
4. **`eligibleCount == 0`** (o resumo nasce `closed`). Nunca mostrar "0 de 0 atletas". Testes: A1, B2.
5. **Push `tournament_review_closed` sem `tournamentId`** tem que cair na `url` do payload, sem rota quebrada. O inbox tem que levar ao mesmo lugar do push. Teste: B5.

---

## Mapa de arquivos

**Parte A: painel web (`frontend/projects/organizer/src/app/`)**

| Arquivo | Responsabilidade |
|---|---|
| `painel/data/tournament-reviews.ts` (criar) | regras puras: aspectos, parse, formatação, estado vazio, janela, linhas de aspecto e distribuição, cards de comentário, KPI e linhas da reputação |
| `painel/data/tournament-reviews-repository.ts` (criar) | listeners `onSnapshot` do resumo, dos comentários, da reputação e dos resumos do organizador |
| `painel/avaliacoes/avaliacoes-torneio.component.ts` (criar) | aba "Avaliações" do torneio |
| `painel/reputacao/reputacao.component.ts` (criar) | página "Reputação" |
| `app.routes.ts` (modificar) | rotas `eventos/:id/avaliacoes` e `reputacao` |
| `painel/ui/icon.component.ts` (modificar) | ícone `star` |
| `painel/shell/panel-shell.component.ts` (modificar) | itens "Avaliações" (nível torneio) e "Reputação" (nível global) |
| `painel/eventos/torneio-detalhe.component.ts` (modificar) | KPI "Avaliação" e atalho no telefone |
| `*.spec.ts` correspondentes, mais `app.routes.spec.ts`, `painel/shell/panel-shell.spec.ts` e `painel/eventos/torneio-detalhe.avaliacao.spec.ts` (criar) | specs |

**Parte B: app (`nexago_app/`)**

| Arquivo | Responsabilidade |
|---|---|
| `lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart` (criar) | `TournamentReviewSummary`, `TournamentReviewAspectStat`, `AnonymousTournamentReview` e o parse do Firestore |
| `lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_logic.dart` (criar) | números públicos, textos, estado vazio, janela, linhas e cards |
| `lib/features/organizer/data/organizer_tournament_reviews_repository.dart` (criar) | streams do resumo e dos comentários |
| `lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart` (criar) | `tournamentReviewSummaryProvider`, `tournamentAnonymousReviewsProvider` |
| `lib/features/organizer/presentation/category_ops/organizer_tournament_reviews_page.dart` (criar) | tela de avaliações |
| `lib/core/router/routes.dart`, `lib/core/router/app_router.dart` (modificar) | rota `reviews` |
| `lib/features/organizer/presentation/category_ops/organizer_tournament_navigation.dart` (modificar) | `pushOrganizerTournamentReviews` |
| `lib/features/organizer/presentation/category_ops/widgets/organizer_tournament_explore_section.dart` (modificar) | card "Avaliações" |
| `lib/core/notifications/notification_navigation.dart`, `lib/features/athlete/domain/athlete_notifications_logic.dart` (modificar) | push e inbox abrem a tela de avaliações |
| `test/features/organizer/organizer_tournament_review_{models,logic}_test.dart`, `test/features/organizer/organizer_tournament_reviews_page_test.dart` (criar) | testes |
| `test/features/organizer/organizer_tournament_explore_section_test.dart`, `test/core/notifications/notification_navigation_test.dart`, `test/features/athlete/athlete_notifications_logic_test.dart` (modificar) | testes |

**Comandos** (`<worktree>` = `/Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422`)
- **Painel, um spec:** `cd <worktree>/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='projects/organizer/src/app/<caminho>.spec.ts'`
- **Painel, build:** `cd <worktree>/frontend && npx ng build organizer --configuration production`
- **App, um teste:** `cd <worktree>/nexago_app && flutter test test/<caminho>_test.dart`
- **App, análise:** `cd <worktree>/nexago_app && flutter analyze <arquivos>`

---

# Parte A — Painel web do organizador (Angular)

### Task A1: Regras puras e repositório

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/data/tournament-reviews.ts`
- Create: `frontend/projects/organizer/src/app/painel/data/tournament-reviews-repository.ts`
- Test: `frontend/projects/organizer/src/app/painel/data/tournament-reviews.spec.ts`

**Interfaces:**
- Consumes: `OrganizerTournament` (`painel/data/tournament.model.ts`), só os campos `status` e `endAt`.
- Produces (em `tournament-reviews.ts`):
  - `MIN_PUBLIC_REVIEWS = 3`.
  - `TOURNAMENT_REVIEW_ASPECTS` (`{ key, label }[]`, `as const`).
  - Tipos `ReviewAspectKey`, `StarValue`, `AspectStat`, `AspectStats`, `StarDistribution`, `TournamentReviewSummary`, `AnonymousReview`, `OrganizerReputation`, `ReviewsEmptyState`, `CommentFilter`, `AspectRow`, `DistributionRow`.
  - Parse: `summaryFromData(id, data)`, `anonymousReviewFromData(id, data)`, `reputationFromData(data)`.
  - `hasPublicNumbers(s)`, que é type guard: `s is TournamentReviewSummary & { average: number }`.
  - Formatação: `formatRating(n)`, `reviewsCountLabel(n)`, `responseRateLabel(s)`.
  - Janela: `isReviewWindowOpen(s, now)`, `reviewWindowLabel(s, now)`.
  - Textos de estado: `collectingText(s)`, `reviewsEmptyState(t, now)`, `REVIEWS_EMPTY_TEXT`.
  - Linhas: `aspectRows(aspects)`, `weakestAspectLabel(aspects)`, `distributionRows(d)`.
  - Comentários: `commentCards(reviews, filter)`, `starsText(n)`, `reviewAspectChips(r)`.
  - KPI: `reviewKpiLabel(s)`.
- Produces (em `tournament-reviews-repository.ts`), todos devolvendo `Unsubscribe`:
  - `watchTournamentReviewSummary(tid, onChange, onError)`;
  - `watchAnonymousReviews(tid, onChange, onError)`;
  - `watchOrganizerReputation(uid, onChange, onError)`;
  - `watchOrganizerReviewSummaries(uid, onChange, onError)`.

- [ ] **Step 1: Escrever o spec que falha**

`frontend/projects/organizer/src/app/painel/data/tournament-reviews.spec.ts`:

```ts
import {
  REVIEWS_EMPTY_TEXT,
  TOURNAMENT_REVIEW_ASPECTS,
  anonymousReviewFromData,
  aspectRows,
  collectingText,
  commentCards,
  distributionRows,
  formatRating,
  hasPublicNumbers,
  isReviewWindowOpen,
  reputationFromData,
  responseRateLabel,
  reviewAspectChips,
  reviewKpiLabel,
  reviewWindowLabel,
  reviewsCountLabel,
  reviewsEmptyState,
  starsText,
  summaryFromData,
  weakestAspectLabel,
  type AnonymousReview,
  type TournamentReviewSummary,
} from './tournament-reviews';

/** Timestamp do SDK de mentira: o parse só usa `toDate()`. */
const ts = (d: Date) => ({ toDate: () => d });
const NOW = new Date('2026-10-06T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function summary(over: Partial<TournamentReviewSummary> = {}): TournamentReviewSummary {
  return {
    tournamentId: 't1',
    tournamentName: 'Copa Aurora',
    tournamentStartAt: null,
    status: 'open',
    eligibleCount: 42,
    count: 23,
    average: 4.62,
    distribution: { 1: 1, 2: 1, 3: 2, 4: 7, 5: 12 },
    aspects: { organization: { count: 20, average: 4.8 }, schedule: { count: 18, average: 3.4 } },
    opensAt: null,
    closesAt: new Date(NOW.getTime() + 5 * DAY),
    ...over,
  };
}

function review(id: string, overall: 1 | 2 | 3 | 4 | 5, comment: string | null, shuffleKey: number): AnonymousReview {
  return { id, overall, aspects: {}, comment, shuffleKey };
}

describe('tournament-reviews (organizador)', () => {
  it('aspectos na mesma ordem de functions/src/tournament-review-constants.ts', () => {
    expect(TOURNAMENT_REVIEW_ASPECTS.map((a) => a.key)).toEqual(['organization', 'schedule', 'refereeing', 'venue', 'prizes']);
    expect(TOURNAMENT_REVIEW_ASPECTS.map((a) => a.label)).toEqual([
      'Organização geral',
      'Cumprimento dos horários',
      'Arbitragem / mesa',
      'Estrutura do local',
      'Premiação e kit',
    ]);
  });

  describe('summaryFromData', () => {
    it('lê o resumo gravado pelo servidor', () => {
      const closesAt = new Date('2026-10-15T13:00:00Z');
      const s = summaryFromData('t1', {
        tournamentId: 't1',
        organizerId: 'o1',
        tournamentName: ' Copa Aurora ',
        tournamentStartAt: ts(new Date('2026-10-04T12:00:00Z')),
        status: 'open',
        eligibleCount: 42,
        count: 23,
        average: 4.62,
        distribution: { '1': 1, '2': 1, '3': 2, '4': 7, '5': 12 },
        aspects: { schedule: { count: 18, average: 3.4 }, bogus: { count: 1, average: 1 } },
        closesAt: ts(closesAt),
      })!;
      expect(s.tournamentName).toBe('Copa Aurora');
      expect(s.status).toBe('open');
      expect(s.distribution).toEqual({ 1: 1, 2: 1, 3: 2, 4: 7, 5: 12 });
      expect(s.aspects).toEqual({ schedule: { count: 18, average: 3.4 } });
      expect(s.closesAt).toEqual(closesAt);
      expect(s.tournamentStartAt).toEqual(new Date('2026-10-04T12:00:00Z'));
    });

    it('com menos de 3 avaliações só a contagem vem preenchida', () => {
      const s = summaryFromData('t9', { status: 'open', eligibleCount: 42, count: 2, average: null, distribution: null, aspects: null })!;
      expect(s.tournamentId).toBe('t9');
      expect(s.count).toBe(2);
      expect(s.average).toBeNull();
      expect(s.distribution).toBeNull();
      expect(s.aspects).toBeNull();
      expect(hasPublicNumbers(s)).toBeFalse();
    });

    it('doc ausente vira null; status diferente de open é closed', () => {
      expect(summaryFromData('t1', undefined)).toBeNull();
      expect(summaryFromData('t1', { status: 'closed' })!.status).toBe('closed');
    });
  });

  describe('anonymousReviewFromData', () => {
    it('comentário só com espaços vira null; aspecto desconhecido e nota fora de 1–5 somem', () => {
      const r = anonymousReviewFromData('a1', {
        overall: 4,
        aspects: { schedule: 2, venue: 7, bogus: 3 },
        comment: '   ',
        shuffleKey: 0.42,
      })!;
      expect(r.overall).toBe(4);
      expect(r.aspects).toEqual({ schedule: 2 });
      expect(r.comment).toBeNull();
      expect(r.shuffleKey).toBe(0.42);
    });

    it('sem nota geral válida não vira avaliação', () => {
      expect(anonymousReviewFromData('a1', { overall: 0 })).toBeNull();
      expect(anonymousReviewFromData('a1', undefined)).toBeNull();
    });
  });

  it('reputationFromData', () => {
    expect(
      reputationFromData({ organizerId: 'o1', reviewsCount: 86, tournamentsRated: 5, average: 4.71, aspects: { venue: { count: 40, average: 3.9 } } }),
    ).toEqual({ reviewsCount: 86, tournamentsRated: 5, average: 4.71, aspects: { venue: { count: 40, average: 3.9 } } });
    expect(reputationFromData(undefined)).toBeNull();
  });

  it('formatação: uma casa com vírgula, contagem e taxa de resposta', () => {
    expect(formatRating(4.62)).toBe('4,6');
    expect(formatRating(4)).toBe('4,0');
    expect(reviewsCountLabel(1)).toBe('1 avaliação');
    expect(reviewsCountLabel(23)).toBe('23 avaliações');
    expect(responseRateLabel(summary())).toBe('23 de 42 atletas');
  });

  describe('janela', () => {
    it('aberta até dd/MM (São Paulo) enquanto closesAt está no futuro', () => {
      const s = summary({ closesAt: new Date('2026-10-15T13:00:00Z') });
      expect(isReviewWindowOpen(s, NOW)).toBeTrue();
      expect(reviewWindowLabel(s, NOW)).toBe('Aberta até 15/10');
    });

    it('status open com closesAt vencido (job atrasado) já é Encerrada', () => {
      const s = summary({ closesAt: new Date(NOW.getTime() - 60_000) });
      expect(isReviewWindowOpen(s, NOW)).toBeFalse();
      expect(reviewWindowLabel(s, NOW)).toBe('Encerrada');
    });

    it('closed é Encerrada', () => {
      expect(reviewWindowLabel(summary({ status: 'closed' }), NOW)).toBe('Encerrada');
    });
  });

  it('texto de quem ainda não tem 3 avaliações, inclusive sem elegíveis', () => {
    expect(collectingText(summary({ count: 2, average: null }))).toBe(
      '2 de 42 atletas avaliaram. As notas aparecem a partir de 3 avaliações.',
    );
    expect(collectingText(summary({ count: 0, eligibleCount: 0, average: null }))).toBe(
      'Nenhum atleta ficou apto a avaliar este torneio.',
    );
  });

  describe('reviewsEmptyState', () => {
    const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

    it('torneio por vir ou rolando', () => {
      expect(reviewsEmptyState({ status: 'inscricoes', endAt: at(2 * DAY) }, NOW)).toBe('notEnded');
      expect(reviewsEmptyState({ status: 'andamento', endAt: null }, NOW)).toBe('notEnded');
    });

    it('terminou há até 3 dias: o job das 10h ainda abre', () => {
      expect(reviewsEmptyState({ status: 'andamento', endAt: at(-20 * 60 * 60 * 1000) }, NOW)).toBe('opening');
      expect(reviewsEmptyState({ status: 'concluido', endAt: null }, NOW)).toBe('opening');
      expect(reviewsEmptyState({ status: 'concluido', endAt: at(2 * DAY) }, NOW)).toBe('opening');
    });

    it('terminou há mais de 3 dias sem resumo', () => {
      expect(reviewsEmptyState({ status: 'concluido', endAt: at(-30 * DAY) }, NOW)).toBe('endedBefore');
      expect(reviewsEmptyState({ status: 'encerradas', endAt: at(-4 * DAY) }, NOW)).toBe('endedBefore');
    });

    it('cancelado nunca recebe avaliação', () => {
      expect(reviewsEmptyState({ status: 'cancelado', endAt: at(-DAY) }, NOW)).toBe('cancelled');
    });

    it('textos', () => {
      expect(REVIEWS_EMPTY_TEXT).toEqual({
        notEnded: 'A avaliação abre quando o torneio terminar.',
        opening: 'O torneio terminou. O pedido de avaliação sai para os atletas às 10h.',
        endedBefore: 'Este torneio terminou antes de as avaliações existirem.',
        cancelled: 'Torneio cancelado não recebe avaliações.',
      });
    });
  });

  it('aspectRows: do mais fraco ao mais forte, empate na ordem da lista', () => {
    const rows = aspectRows({
      prizes: { count: 5, average: 3.4 },
      organization: { count: 20, average: 4.8 },
      schedule: { count: 18, average: 3.4 },
      venue: { count: 1, average: 4 },
    });
    expect(rows.map((r) => r.key)).toEqual(['schedule', 'prizes', 'venue', 'organization']);
    expect(rows[0].label).toBe('Cumprimento dos horários');
    expect(rows[0].text).toBe('3,4 · 18 notas');
    expect(rows[2].text).toBe('4,0 · 1 nota');
    expect(rows[3].pct).toBe(96);
    expect(aspectRows(null)).toEqual([]);
    expect(weakestAspectLabel({ venue: { count: 2, average: 3 }, organization: { count: 9, average: 4 } })).toBe('Estrutura do local');
    expect(weakestAspectLabel(null)).toBeNull();
  });

  it('distributionRows: de 5★ a 1★ com porcentagem inteira', () => {
    expect(distributionRows({ 1: 1, 2: 1, 3: 2, 4: 7, 5: 12 }).map((r) => [r.label, r.count, r.pct])).toEqual([
      ['5★', 12, 52],
      ['4★', 7, 30],
      ['3★', 2, 9],
      ['2★', 1, 4],
      ['1★', 1, 4],
    ]);
    expect(distributionRows(null)).toEqual([]);
  });

  it('commentCards: só com texto, por shuffleKey; filtro low = 1–2★', () => {
    const reviews = [
      review('a', 5, 'Tudo pontual', 0.9),
      review('b', 1, 'Atrasou duas horas', 0.1),
      review('c', 4, null, 0.5),
      review('d', 2, 'Quadra ruim', 0.3),
    ];
    expect(commentCards(reviews, 'all').map((r) => r.id)).toEqual(['b', 'd', 'a']);
    expect(commentCards(reviews, 'low').map((r) => r.id)).toEqual(['b', 'd']);
  });

  it('estrelas e aspectos marcados no card, na ordem da lista', () => {
    expect(starsText(4)).toBe('★★★★☆');
    const r: AnonymousReview = { id: 'a', overall: 4, aspects: { schedule: 2, organization: 5 }, comment: 'x', shuffleKey: 0 };
    expect(reviewAspectChips(r)).toEqual(['Organização geral 5★', 'Cumprimento dos horários 2★']);
  });

  it('KPI: média com estrela ou —', () => {
    expect(reviewKpiLabel(summary())).toBe('4,6 ★');
    expect(reviewKpiLabel(summary({ count: 2, average: null }))).toBe('—');
    expect(reviewKpiLabel(null)).toBe('—');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='projects/organizer/src/app/painel/data/tournament-reviews.spec.ts'`

Expected: erro de compilação, `Cannot find module './tournament-reviews'`.

- [ ] **Step 3: Implementar as regras puras**

`frontend/projects/organizer/src/app/painel/data/tournament-reviews.ts`:

```ts
import type { OrganizerTournament } from './tournament.model';

/** Avaliação do torneio pelos atletas, lado do organizador — spec
 *  `docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md` §4. Os docs são
 *  gravados só pelo servidor (`functions/src/tournament-review-derived.ts`); aqui só se lê. */

/** Abaixo disso o resumo não tem média nem distribuição, e a rule nega os comentários. */
export const MIN_PUBLIC_REVIEWS = 3;

/** Depois disso o job diário (10h) não abre mais a janela de um torneio encerrado
 *  (`REVIEW_LOOKBACK_DAYS` em functions). */
const REVIEW_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

/** MESMA lista e ordem de `functions/src/tournament-review-constants.ts`. */
export const TOURNAMENT_REVIEW_ASPECTS = [
  { key: 'organization', label: 'Organização geral' },
  { key: 'schedule', label: 'Cumprimento dos horários' },
  { key: 'refereeing', label: 'Arbitragem / mesa' },
  { key: 'venue', label: 'Estrutura do local' },
  { key: 'prizes', label: 'Premiação e kit' },
] as const;

export type ReviewAspectKey = (typeof TOURNAMENT_REVIEW_ASPECTS)[number]['key'];
export type StarValue = 1 | 2 | 3 | 4 | 5;

export interface AspectStat {
  count: number;
  average: number;
}
export type AspectStats = Partial<Record<ReviewAspectKey, AspectStat>>;
export type StarDistribution = Record<StarValue, number>;

/** `tournamentReviewSummaries/{tournamentId}` — público. Com `count < 3`, `average`,
 *  `distribution` e `aspects` vêm nulos: só a contagem é real. */
export interface TournamentReviewSummary {
  tournamentId: string;
  tournamentName: string;
  tournamentStartAt: Date | null;
  status: 'open' | 'closed';
  eligibleCount: number;
  count: number;
  average: number | null;
  distribution: StarDistribution | null;
  aspects: AspectStats | null;
  opensAt: Date | null;
  closesAt: Date | null;
}

/** `tournaments/{tid}/anonymousReviews/{anonId}` — sem uid, data nem categoria. */
export interface AnonymousReview {
  id: string;
  overall: StarValue;
  aspects: Partial<Record<ReviewAspectKey, StarValue>>;
  comment: string | null;
  /** Ordem embaralhada fixa: a ordem de chegada não pode denunciar quem escreveu. */
  shuffleKey: number;
}

/** `organizerReputation/{uid}` — público. `average` nulo enquanto `reviewsCount < 3`. */
export interface OrganizerReputation {
  reviewsCount: number;
  tournamentsRated: number;
  average: number | null;
  aspects: AspectStats | null;
}

type Data = Record<string, unknown> | undefined;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function decimal(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function star(value: unknown): StarValue | null {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null;
}

function dateOf(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const maybe = value as { toDate?: unknown } | null;
  return maybe && typeof maybe.toDate === 'function' ? (maybe as { toDate(): Date }).toDate() : null;
}

function isAspectKey(key: string): key is ReviewAspectKey {
  return TOURNAMENT_REVIEW_ASPECTS.some((a) => a.key === key);
}

function aspectStatsOf(value: unknown): AspectStats | null {
  if (!value || typeof value !== 'object') return null;
  const out: AspectStats = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isAspectKey(key) || !raw || typeof raw !== 'object') continue;
    const stat = raw as Record<string, unknown>;
    const average = decimal(stat['average']);
    const n = count(stat['count']);
    if (average != null && n > 0) out[key] = { count: n, average };
  }
  return out;
}

function distributionOf(value: unknown): StarDistribution | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return { 1: count(raw['1']), 2: count(raw['2']), 3: count(raw['3']), 4: count(raw['4']), 5: count(raw['5']) };
}

export function summaryFromData(id: string, data: Data): TournamentReviewSummary | null {
  if (!data) return null;
  return {
    tournamentId: text(data['tournamentId']) || id,
    tournamentName: text(data['tournamentName']),
    tournamentStartAt: dateOf(data['tournamentStartAt']),
    status: data['status'] === 'open' ? 'open' : 'closed',
    eligibleCount: count(data['eligibleCount']),
    count: count(data['count']),
    average: decimal(data['average']),
    distribution: distributionOf(data['distribution']),
    aspects: aspectStatsOf(data['aspects']),
    opensAt: dateOf(data['opensAt']),
    closesAt: dateOf(data['closesAt']),
  };
}

export function anonymousReviewFromData(id: string, data: Data): AnonymousReview | null {
  const overall = star(data?.['overall']);
  if (!data || overall == null) return null;
  const aspects: AnonymousReview['aspects'] = {};
  const raw = data['aspects'];
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const stars = star(value);
      if (isAspectKey(key) && stars != null) aspects[key] = stars;
    }
  }
  const comment = text(data['comment']);
  return { id, overall, aspects, comment: comment || null, shuffleKey: decimal(data['shuffleKey']) ?? 0 };
}

export function reputationFromData(data: Data): OrganizerReputation | null {
  if (!data) return null;
  return {
    reviewsCount: count(data['reviewsCount']),
    tournamentsRated: count(data['tournamentsRated']),
    average: decimal(data['average']),
    aspects: aspectStatsOf(data['aspects']),
  };
}

/** Média, distribuição e aspectos só existem (e os comentários só são liberados) a partir de 3. */
export function hasPublicNumbers(s: TournamentReviewSummary): s is TournamentReviewSummary & { average: number } {
  return s.count >= MIN_PUBLIC_REVIEWS && s.average != null;
}

const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Uma casa, vírgula — a mesma regra do push de fechamento (fase 1). */
export function formatRating(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

export function reviewsCountLabel(n: number): string {
  return n === 1 ? '1 avaliação' : `${n} avaliações`;
}

export function responseRateLabel(s: TournamentReviewSummary): string {
  return `${s.count} de ${s.eligibleCount} atletas`;
}

/** `status` sozinho não basta: o job que fecha pode atrasar. */
export function isReviewWindowOpen(s: TournamentReviewSummary, now: Date): boolean {
  return s.status === 'open' && s.closesAt != null && s.closesAt.getTime() > now.getTime();
}

export function reviewWindowLabel(s: TournamentReviewSummary, now: Date): string {
  return isReviewWindowOpen(s, now) ? `Aberta até ${DAY_MONTH.format(s.closesAt!)}` : 'Encerrada';
}

export function collectingText(s: TournamentReviewSummary): string {
  if (s.eligibleCount === 0) return 'Nenhum atleta ficou apto a avaliar este torneio.';
  return `${s.count} de ${s.eligibleCount} atletas avaliaram. As notas aparecem a partir de ${MIN_PUBLIC_REVIEWS} avaliações.`;
}

export type ReviewsEmptyState = 'notEnded' | 'opening' | 'endedBefore' | 'cancelled';

/** Sem resumo: o que dizer. Espelha `reviewCandidateReason` (functions): concluído ou `endAt`
 *  passado entram no job das 10h por até 3 dias. Este modelo não tem `completedAt`; concluído
 *  sem `endAt` passado conta como "acabou agora". */
export function reviewsEmptyState(t: Pick<OrganizerTournament, 'status' | 'endAt'>, now: Date): ReviewsEmptyState {
  if (t.status === 'cancelado') return 'cancelled';
  const endAtPassed = t.endAt != null && t.endAt.getTime() <= now.getTime();
  if (t.status !== 'concluido' && !endAtPassed) return 'notEnded';
  const endedAt = endAtPassed ? t.endAt!.getTime() : now.getTime();
  return now.getTime() - endedAt <= REVIEW_LOOKBACK_MS ? 'opening' : 'endedBefore';
}

export const REVIEWS_EMPTY_TEXT: Record<ReviewsEmptyState, string> = {
  notEnded: 'A avaliação abre quando o torneio terminar.',
  opening: 'O torneio terminou. O pedido de avaliação sai para os atletas às 10h.',
  endedBefore: 'Este torneio terminou antes de as avaliações existirem.',
  cancelled: 'Torneio cancelado não recebe avaliações.',
};

export interface AspectRow {
  key: ReviewAspectKey;
  label: string;
  average: number;
  count: number;
  /** "3,4 · 18 notas". */
  text: string;
  /** Largura da barra: média sobre 5, em %. */
  pct: number;
}

/** Do mais fraco ao mais forte; no empate, a ordem da lista (o `sort` do JS é estável). */
export function aspectRows(aspects: AspectStats | null): AspectRow[] {
  if (!aspects) return [];
  const rows: AspectRow[] = [];
  for (const aspect of TOURNAMENT_REVIEW_ASPECTS) {
    const stat = aspects[aspect.key];
    if (!stat) continue;
    rows.push({
      key: aspect.key,
      label: aspect.label,
      average: stat.average,
      count: stat.count,
      text: `${formatRating(stat.average)} · ${stat.count === 1 ? '1 nota' : `${stat.count} notas`}`,
      pct: Math.round((stat.average / 5) * 100),
    });
  }
  return rows.sort((a, b) => a.average - b.average);
}

export function weakestAspectLabel(aspects: AspectStats | null): string | null {
  return aspectRows(aspects)[0]?.label ?? null;
}

export interface DistributionRow {
  stars: StarValue;
  label: string;
  count: number;
  pct: number;
}

export function distributionRows(d: StarDistribution | null): DistributionRow[] {
  if (!d) return [];
  const total = d[1] + d[2] + d[3] + d[4] + d[5];
  return ([5, 4, 3, 2, 1] as const).map((stars) => ({
    stars,
    label: `${stars}★`,
    count: d[stars],
    pct: total > 0 ? Math.round((d[stars] / total) * 100) : 0,
  }));
}

export type CommentFilter = 'all' | 'low';

/** Avaliação sem texto entra nos números, mas não vira card. */
export function commentCards(reviews: readonly AnonymousReview[], filter: CommentFilter): AnonymousReview[] {
  return reviews
    .filter((r) => r.comment != null && (filter === 'all' || r.overall <= 2))
    .sort((a, b) => a.shuffleKey - b.shuffleKey);
}

export function starsText(n: StarValue): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

export function reviewAspectChips(r: AnonymousReview): string[] {
  return TOURNAMENT_REVIEW_ASPECTS.flatMap((a) => {
    const value = r.aspects[a.key];
    return value ? [`${a.label} ${value}★`] : [];
  });
}

export function reviewKpiLabel(s: TournamentReviewSummary | null): string {
  return s && hasPublicNumbers(s) ? `${formatRating(s.average)} ★` : '—';
}
```

- [ ] **Step 4: Escrever o repositório**

O repositório não tem spec próprio: são quatro `onSnapshot` sem lógica. O parse já está coberto. A A2 e a A4 importam o repositório, e o build de produção (F) compila tudo.

`frontend/projects/organizer/src/app/painel/data/tournament-reviews-repository.ts`:

```ts
import { collection, doc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { organizerFirestore } from './firestore';
import {
  anonymousReviewFromData,
  reputationFromData,
  summaryFromData,
  type AnonymousReview,
  type OrganizerReputation,
  type TournamentReviewSummary,
} from './tournament-reviews';

/** Resumo ao vivo — `null` até o job abrir a janela do torneio. */
export function watchTournamentReviewSummary(
  tournamentId: string,
  onChange: (summary: TournamentReviewSummary | null) => void,
  onError: () => void,
): Unsubscribe {
  return onSnapshot(
    doc(organizerFirestore(), 'tournamentReviewSummaries', tournamentId),
    (snap) => onChange(snap.exists() ? summaryFromData(snap.id, snap.data()) : null),
    () => onError(),
  );
}

/** Só com `count >= 3` no resumo: abaixo disso a rule nega a leitura. A ordem (`shuffleKey`)
 *  é aplicada em `commentCards`, sem `orderBy` — nada de índice. */
export function watchAnonymousReviews(
  tournamentId: string,
  onChange: (reviews: AnonymousReview[]) => void,
  onError: () => void,
): Unsubscribe {
  return onSnapshot(
    collection(organizerFirestore(), 'tournaments', tournamentId, 'anonymousReviews'),
    (snap) =>
      onChange(
        snap.docs.flatMap((d) => {
          const review = anonymousReviewFromData(d.id, d.data());
          return review ? [review] : [];
        }),
      ),
    () => onError(),
  );
}

export function watchOrganizerReputation(
  uid: string,
  onChange: (reputation: OrganizerReputation | null) => void,
  onError: () => void,
): Unsubscribe {
  return onSnapshot(
    doc(organizerFirestore(), 'organizerReputation', uid),
    (snap) => onChange(snap.exists() ? reputationFromData(snap.data()) : null),
    () => onError(),
  );
}

/** Os resumos dos torneios em que `uid` é o dono. Igualdade num campo só: sem índice composto. */
export function watchOrganizerReviewSummaries(
  uid: string,
  onChange: (summaries: TournamentReviewSummary[]) => void,
  onError: () => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(organizerFirestore(), 'tournamentReviewSummaries'), where('organizerId', '==', uid)),
    (snap) =>
      onChange(
        snap.docs.flatMap((d) => {
          const summary = summaryFromData(d.id, d.data());
          return summary ? [summary] : [];
        }),
      ),
    () => onError(),
  );
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: o mesmo comando do Step 2.

Expected: `TOTAL: N SUCCESS`, sem `FAILED`.

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add frontend/projects/organizer/src/app/painel/data/tournament-reviews.ts frontend/projects/organizer/src/app/painel/data/tournament-reviews.spec.ts frontend/projects/organizer/src/app/painel/data/tournament-reviews-repository.ts
git commit -m "feat(organizer): regras e leitura das avaliações do torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A2: Aba "Avaliações" do torneio

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/avaliacoes/avaliacoes-torneio.component.ts`
- Modify: `frontend/projects/organizer/src/app/app.routes.ts` (filhos de `eventos/:id`, depois de `equipe`)
- Test: `frontend/projects/organizer/src/app/painel/avaliacoes/avaliacoes-torneio.component.spec.ts`
- Test: `frontend/projects/organizer/src/app/app.routes.spec.ts`

**Interfaces:**
- Consumes:
  - tudo de `tournament-reviews.ts` (A1);
  - `watchTournamentReviewSummary` e `watchAnonymousReviews` (A1);
  - `getTournament(id): Promise<OrganizerTournament | null>` (`painel/data/tournaments-repository.ts`);
  - `OgPageHeaderComponent`, `OgCardComponent`, `OgBarRowComponent` e `NxPageLoadingComponent`.
- Produces:
  - `AvaliacoesTorneioComponent` (seletor `og-avaliacoes-torneio`), com `readonly id = input<string>('')`.
  - Signals protegidos que os specs semeiam: `now`, `tournament`, `summary`, `reviews`, `reviewsFailed`.
  - Rota `painel/eventos/:id/avaliacoes`.

- [ ] **Step 1: Escrever os specs que falham**

`frontend/projects/organizer/src/app/painel/avaliacoes/avaliacoes-torneio.component.spec.ts`:

```ts
import { Component, provideZonelessChangeDetection, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AnonymousReview, TournamentReviewSummary } from '../data/tournament-reviews';
import type { OrganizerTournament } from '../data/tournament.model';
import { OgBellComponent } from '../shell/og-bell.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { AvaliacoesTorneioComponent } from './avaliacoes-torneio.component';

/** `og-bell` de verdade abre `onSnapshot` contra o Firestore — sem sentido aqui. */
@Component({ selector: 'og-bell', template: '' })
class OgBellStub {}

type ReviewTournament = Pick<OrganizerTournament, 'name' | 'status' | 'endAt'>;

interface Internals {
  now: WritableSignal<Date>;
  tournament: WritableSignal<ReviewTournament | null>;
  summary: WritableSignal<TournamentReviewSummary | null>;
  reviews: WritableSignal<AnonymousReview[]>;
  reviewsFailed: WritableSignal<boolean>;
}

const NOW = new Date('2026-10-06T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const COPA: ReviewTournament = { name: 'Copa Aurora', status: 'concluido', endAt: new Date(NOW.getTime() - 2 * DAY) };

function summary(over: Partial<TournamentReviewSummary> = {}): TournamentReviewSummary {
  return {
    tournamentId: 't1',
    tournamentName: 'Copa Aurora',
    tournamentStartAt: null,
    status: 'open',
    eligibleCount: 42,
    count: 23,
    average: 4.62,
    distribution: { 1: 1, 2: 1, 3: 2, 4: 7, 5: 12 },
    aspects: { organization: { count: 20, average: 4.8 }, schedule: { count: 18, average: 3.4 } },
    opensAt: null,
    closesAt: new Date('2026-10-15T13:00:00Z'),
    ...over,
  };
}

function review(id: string, overall: 1 | 2 | 3 | 4 | 5, comment: string | null, shuffleKey: number, aspects: AnonymousReview['aspects'] = {}): AnonymousReview {
  return { id, overall, aspects, comment, shuffleKey };
}

describe('AvaliacoesTorneioComponent', () => {
  let fixture: ComponentFixture<AvaliacoesTorneioComponent>;

  async function mount(seed: {
    tournament: ReviewTournament | null;
    summary?: TournamentReviewSummary | null;
    reviews?: AnonymousReview[];
    reviewsFailed?: boolean;
  }): Promise<HTMLElement> {
    TestBed.overrideComponent(OgPageHeaderComponent, { remove: { imports: [OgBellComponent] }, add: { imports: [OgBellStub] } });
    await TestBed.configureTestingModule({
      imports: [AvaliacoesTorneioComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(AvaliacoesTorneioComponent);
    // `id` vazio: o efeito zera tudo e não abre listener nenhum. Semeia depois.
    await fixture.whenStable();
    const internals = fixture.componentInstance as unknown as Internals;
    internals.now.set(NOW);
    internals.tournament.set(seed.tournament);
    internals.summary.set(seed.summary ?? null);
    internals.reviews.set(seed.reviews ?? []);
    internals.reviewsFailed.set(seed.reviewsFailed ?? false);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const textOf = (host: HTMLElement) => host.textContent!.replace(/\s+/g, ' ');
  const commentTexts = (host: HTMLElement) => [...host.querySelectorAll('.og-rv-comment-text')].map((e) => e.textContent!.trim());

  it('sem resumo e torneio por vir', async () => {
    const host = await mount({ tournament: { name: 'Copa Aurora', status: 'inscricoes', endAt: new Date(NOW.getTime() + 3 * DAY) } });
    expect(textOf(host)).toContain('A avaliação abre quando o torneio terminar.');
  });

  it('sem resumo e torneio encerrado há um mês', async () => {
    const host = await mount({ tournament: { name: 'Copa Aurora', status: 'concluido', endAt: new Date(NOW.getTime() - 30 * DAY) } });
    expect(textOf(host)).toContain('Este torneio terminou antes de as avaliações existirem.');
  });

  it('sem resumo e sem torneio', async () => {
    const host = await mount({ tournament: null });
    expect(textOf(host)).toContain('Torneio não encontrado.');
  });

  it('menos de 3: só a contagem, sem média nem comentários', async () => {
    const host = await mount({ tournament: COPA, summary: summary({ count: 2, average: null, distribution: null, aspects: null }) });
    expect(textOf(host)).toContain('2 de 42 atletas avaliaram. As notas aparecem a partir de 3 avaliações.');
    expect(textOf(host)).toContain('Aberta até 15/10');
    expect(host.querySelector('.og-rv-average')).toBeNull();
    expect(host.querySelector('.og-rv-comment')).toBeNull();
  });

  it('completo: média, taxa de resposta, janela, distribuição e aspectos do mais fraco ao mais forte', async () => {
    const host = await mount({ tournament: COPA, summary: summary() });
    expect(host.querySelector('.og-rv-average')!.textContent).toContain('4,6');
    const text = textOf(host);
    expect(text).toContain('23 avaliações');
    expect(text).toContain('23 de 42 atletas');
    expect(text).toContain('Aberta até 15/10');
    expect(host.querySelectorAll('og-bar-row').length).toBe(5);
    expect([...host.querySelectorAll('.og-rv-aspect-name')].map((e) => e.textContent!.trim())).toEqual([
      'Cumprimento dos horários',
      'Organização geral',
    ]);
  });

  it('janela vencida aparece como Encerrada mesmo com status open', async () => {
    const host = await mount({ tournament: COPA, summary: summary({ closesAt: new Date(NOW.getTime() - 60_000) }) });
    expect(textOf(host)).toContain('Encerrada');
    expect(textOf(host)).not.toContain('Aberta até');
  });

  it('comentários: só com texto, por shuffleKey, e o filtro 1–2★', async () => {
    const host = await mount({
      tournament: COPA,
      summary: summary(),
      reviews: [
        review('a', 5, 'Tudo pontual', 0.9, { schedule: 5 }),
        review('b', 1, 'Atrasou duas horas', 0.1),
        review('c', 4, null, 0.5),
      ],
    });
    expect(commentTexts(host)).toEqual(['Atrasou duas horas', 'Tudo pontual']);
    expect(textOf(host)).toContain('Cumprimento dos horários 5★');

    const low = [...host.querySelectorAll<HTMLButtonElement>('.og-rv-filter button')].find((b) => b.textContent!.includes('1–2'))!;
    low.click();
    await fixture.whenStable();
    expect(commentTexts(host)).toEqual(['Atrasou duas horas']);
  });

  it('filtro 1–2★ sem resultado tem texto próprio', async () => {
    const host = await mount({ tournament: COPA, summary: summary(), reviews: [review('a', 5, 'Tudo pontual', 0.9)] });
    const low = [...host.querySelectorAll<HTMLButtonElement>('.og-rv-filter button')].find((b) => b.textContent!.includes('1–2'))!;
    low.click();
    await fixture.whenStable();
    expect(textOf(host)).toContain('Nenhum comentário com 1 ou 2 estrelas.');
  });

  it('falha nos comentários não derruba os números', async () => {
    const host = await mount({ tournament: COPA, summary: summary(), reviewsFailed: true });
    expect(textOf(host)).toContain('Não foi possível carregar os comentários.');
    expect(host.querySelector('.og-rv-average')!.textContent).toContain('4,6');
  });
});
```

Acrescente em `frontend/projects/organizer/src/app/app.routes.spec.ts`, dentro do `describe('app.routes', …)`:

```ts
  it('serve as avaliações como aba do torneio', () => {
    expect(findRoute(routes, ['painel', 'eventos/:id', 'avaliacoes'])).not.toBeNull();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='projects/organizer/src/app/painel/avaliacoes/avaliacoes-torneio.component.spec.ts' --include='projects/organizer/src/app/app.routes.spec.ts'`

Expected: erro de compilação, `Cannot find module './avaliacoes-torneio.component'`.

- [ ] **Step 3: Implementar o componente**

`frontend/projects/organizer/src/app/painel/avaliacoes/avaliacoes-torneio.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import type { OrganizerTournament } from '../data/tournament.model';
import { getTournament } from '../data/tournaments-repository';
import {
  REVIEWS_EMPTY_TEXT,
  aspectRows,
  collectingText,
  commentCards,
  distributionRows,
  formatRating,
  hasPublicNumbers,
  isReviewWindowOpen,
  responseRateLabel,
  reviewAspectChips,
  reviewWindowLabel,
  reviewsCountLabel,
  reviewsEmptyState,
  starsText,
  type AnonymousReview,
  type CommentFilter,
  type TournamentReviewSummary,
} from '../data/tournament-reviews';
import { watchAnonymousReviews, watchTournamentReviewSummary } from '../data/tournament-reviews-repository';
import { OgBarRowComponent } from '../ui/bar-row.component';
import { OgCardComponent } from '../ui/card.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';

type ReviewTournament = Pick<OrganizerTournament, 'name' | 'status' | 'endAt'>;
type View = 'loading' | 'failed' | 'notFound' | 'empty' | 'collecting' | 'full';

/** Avaliações dos atletas sobre o torneio — spec §4. Anônimas: nada aqui identifica o atleta.
 *  Resumo e comentários chegam ao vivo; os comentários só são pedidos com 3+ avaliações (a rule
 *  negaria antes disso). */
@Component({
  selector: 'og-avaliacoes-torneio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgBarRowComponent, NxPageLoadingComponent],
  template: `
    <og-page-header title="Avaliações" [subtitle]="headerSubtitle()" />

    <div class="og-content">
      @switch (view()) {
        @case ('loading') {
          <app-nx-page-loading title="Carregando avaliações…" />
        }
        @case ('failed') {
          <p class="og-rv-empty">Não foi possível carregar as avaliações. Recarregue a página.</p>
        }
        @case ('notFound') {
          <p class="og-rv-empty">Torneio não encontrado.</p>
        }
        @case ('empty') {
          <og-card kicker="Avaliação dos atletas">
            <p class="og-rv-collecting">{{ emptyText() }}</p>
          </og-card>
        }
        @case ('collecting') {
          <og-card kicker="Avaliação dos atletas" [title]="windowLabel()">
            <p class="og-rv-collecting">{{ collecting() }}</p>
          </og-card>
        }
        @case ('full') {
          <div class="og-rv">
            <og-card pad="sm">
              <div class="og-rv-top">
                <div class="og-rv-average">{{ average() }}<span class="og-rv-star" aria-hidden="true">★</span></div>
                <div class="og-rv-top-meta">
                  <div class="og-rv-count">{{ countLabel() }}</div>
                  <div>{{ responseRate() }}</div>
                  <span class="og-rv-window" [class.open]="windowOpen()">{{ windowLabel() }}</span>
                </div>
              </div>
            </og-card>

            <div class="og-rv-grid">
              <og-card kicker="Distribuição" title="Notas gerais">
                @for (row of distribution(); track row.stars; let last = $last) {
                  <og-bar-row [label]="row.label" [sub]="countOf(row.count)" [pct]="row.pct" [last]="last" />
                }
              </og-card>
              <og-card kicker="Aspectos" title="Do mais fraco ao mais forte">
                @for (a of aspects(); track a.key) {
                  <div class="og-rv-aspect">
                    <span class="og-rv-aspect-name">{{ a.label }}</span>
                    <span class="og-rv-aspect-val">{{ a.text }}</span>
                    <div class="og-rv-aspect-track"><span [style.width.%]="a.pct"></span></div>
                  </div>
                } @empty {
                  <p class="og-rv-empty">Nenhum aspecto recebeu nota.</p>
                }
              </og-card>
            </div>

            <og-card kicker="Comentários anônimos" [title]="commentsTitle()">
              <div card-action class="og-rv-filter" role="group" aria-label="Filtrar comentários">
                <button type="button" class="og-chip" [class.active]="filter() === 'all'" (click)="filter.set('all')">Todos</button>
                <button type="button" class="og-chip" [class.active]="filter() === 'low'" (click)="filter.set('low')">Só 1–2★</button>
              </div>
              @if (reviewsFailed()) {
                <p class="og-rv-empty">Não foi possível carregar os comentários.</p>
              } @else {
                @for (r of comments(); track r.id) {
                  <article class="og-rv-comment">
                    <div class="og-rv-comment-head">
                      <span class="og-rv-comment-stars" [attr.aria-label]="r.overall + ' de 5 estrelas'">{{ stars(r.overall) }}</span>
                      @for (chip of chips(r); track chip) {
                        <span class="og-rv-chip">{{ chip }}</span>
                      }
                    </div>
                    <p class="og-rv-comment-text">{{ r.comment }}</p>
                  </article>
                } @empty {
                  <p class="og-rv-empty">
                    {{ filter() === 'low' ? 'Nenhum comentário com 1 ou 2 estrelas.' : 'Nenhum atleta escreveu comentário.' }}
                  </p>
                }
              }
            </og-card>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .og-rv {
      container-type: inline-size;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .og-rv-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
    .og-rv-collecting {
      font-family: var(--nx-font-ui);
      font-size: 14px;
      line-height: 1.5;
      color: var(--nx-text);
      margin: 0;
    }
    .og-rv-top {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 20px;
    }
    .og-rv-average {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 48px;
      line-height: 1;
      color: var(--nx-text);
    }
    .og-rv-star {
      color: var(--nx-orange-500);
      font-size: 32px;
      margin-left: 6px;
    }
    .og-rv-top-meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
    }
    .og-rv-count {
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }
    .og-rv-window {
      align-self: flex-start;
      margin-top: 4px;
      padding: 3px 10px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-surface-1);
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-mute);
    }
    .og-rv-window.open {
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
    }
    .og-rv-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      align-items: start;
    }
    .og-rv-aspect {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 12px;
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-rv-aspect:last-child {
      border-bottom: none;
    }
    .og-rv-aspect-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-rv-aspect-val {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .og-rv-aspect-track {
      grid-column: 1 / -1;
      height: 6px;
      border-radius: 3px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }
    .og-rv-aspect-track span {
      display: block;
      height: 100%;
      background: var(--nx-orange-500);
    }
    .og-rv-filter {
      display: flex;
      gap: 8px;
    }
    .og-rv-comment {
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-rv-comment:last-child {
      border-bottom: none;
    }
    .og-rv-comment-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }
    .og-rv-comment-stars {
      color: var(--nx-orange-500);
      letter-spacing: 1px;
      font-size: 14px;
    }
    .og-rv-chip {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-mute);
      background: var(--nx-surface-1);
      border-radius: var(--nx-r-pill);
      padding: 2px 8px;
    }
    .og-rv-comment-text {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 14px;
      line-height: 1.5;
      color: var(--nx-text);
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    @container (max-width: 720px) {
      .og-rv-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class AvaliacoesTorneioComponent {
  readonly id = input<string>('');

  /** Relógio da tela: decide se a janela está aberta e qual estado vazio mostrar. */
  protected readonly now = signal(new Date());
  protected readonly tournamentLoading = signal(true);
  protected readonly summaryLoading = signal(true);
  protected readonly summaryFailed = signal(false);
  protected readonly tournament = signal<ReviewTournament | null>(null);
  protected readonly summary = signal<TournamentReviewSummary | null>(null);
  protected readonly reviews = signal<AnonymousReview[]>([]);
  protected readonly reviewsFailed = signal(false);
  protected readonly filter = signal<CommentFilter>('all');

  /** A rule só libera os comentários com 3+ avaliações; abaixo disso nem se pede. */
  private readonly canReadComments = computed(() => {
    const s = this.summary();
    return s != null && hasPublicNumbers(s);
  });

  protected readonly view = computed<View>(() => {
    if (this.summaryLoading() || this.tournamentLoading()) return 'loading';
    if (this.summaryFailed()) return 'failed';
    const s = this.summary();
    if (!s) return this.tournament() ? 'empty' : 'notFound';
    return hasPublicNumbers(s) ? 'full' : 'collecting';
  });

  protected readonly headerSubtitle = computed(() => this.tournament()?.name ?? this.summary()?.tournamentName ?? '');
  protected readonly emptyText = computed(() => {
    const t = this.tournament();
    return t ? REVIEWS_EMPTY_TEXT[reviewsEmptyState(t, this.now())] : '';
  });
  protected readonly collecting = computed(() => {
    const s = this.summary();
    return s ? collectingText(s) : '';
  });
  protected readonly windowOpen = computed(() => {
    const s = this.summary();
    return s != null && isReviewWindowOpen(s, this.now());
  });
  protected readonly windowLabel = computed(() => {
    const s = this.summary();
    return s ? reviewWindowLabel(s, this.now()) : '';
  });
  protected readonly average = computed(() => {
    const s = this.summary();
    return s?.average != null ? formatRating(s.average) : '—';
  });
  protected readonly countLabel = computed(() => reviewsCountLabel(this.summary()?.count ?? 0));
  protected readonly responseRate = computed(() => {
    const s = this.summary();
    return s ? responseRateLabel(s) : '';
  });
  protected readonly distribution = computed(() => distributionRows(this.summary()?.distribution ?? null));
  protected readonly aspects = computed(() => aspectRows(this.summary()?.aspects ?? null));
  protected readonly comments = computed(() => commentCards(this.reviews(), this.filter()));
  protected readonly commentsTitle = computed(() => {
    const n = commentCards(this.reviews(), 'all').length;
    return n === 1 ? '1 comentário' : `${n} comentários`;
  });

  protected readonly countOf = reviewsCountLabel;
  protected readonly stars = starsText;
  protected readonly chips = reviewAspectChips;

  constructor() {
    effect((onCleanup) => {
      const tid = this.id();
      this.tournament.set(null);
      this.summary.set(null);
      this.summaryFailed.set(false);
      this.filter.set('all');
      this.now.set(new Date());
      if (!tid) {
        this.tournamentLoading.set(false);
        this.summaryLoading.set(false);
        return;
      }
      this.tournamentLoading.set(true);
      this.summaryLoading.set(true);
      let active = true;
      getTournament(tid)
        .then((t) => {
          if (active) this.tournament.set(t ? { name: t.name, status: t.status, endAt: t.endAt } : null);
        })
        // Sem o torneio a tela ainda mostra o resumo; sem os dois, "Torneio não encontrado".
        .catch(() => undefined)
        .finally(() => {
          if (active) this.tournamentLoading.set(false);
        });
      const stop = watchTournamentReviewSummary(
        tid,
        (s) => {
          this.summary.set(s);
          this.summaryFailed.set(false);
          this.summaryLoading.set(false);
        },
        () => {
          this.summaryFailed.set(true);
          this.summaryLoading.set(false);
        },
      );
      onCleanup(() => {
        active = false;
        stop();
      });
    });

    // Limpa no `onCleanup`, não no começo: trocar de torneio ou cair abaixo de 3 desmonta o
    // listener e zera a lista; sem listener aberto, nada é tocado.
    effect((onCleanup) => {
      const tid = this.id();
      if (!tid || !this.canReadComments()) return;
      const stop = watchAnonymousReviews(
        tid,
        (list) => {
          this.reviews.set(list);
          this.reviewsFailed.set(false);
        },
        () => this.reviewsFailed.set(true),
      );
      onCleanup(() => {
        stop();
        this.reviews.set([]);
        this.reviewsFailed.set(false);
      });
    });
  }
}
```

- [ ] **Step 4: Registrar a rota**

Em `frontend/projects/organizer/src/app/app.routes.ts`, nos filhos de `path: 'eventos/:id'`, logo depois do objeto de `path: 'equipe'`:

```ts
          {
            path: 'avaliacoes',
            title: 'Avaliações — NexaGO Organizador',
            loadComponent: () => import('./painel/avaliacoes/avaliacoes-torneio.component').then((m) => m.AvaliacoesTorneioComponent),
          },
```

- [ ] **Step 5: Rodar e ver passar**

Run: o mesmo comando do Step 2.

Expected: `TOTAL: N SUCCESS`, sem `FAILED`.

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add frontend/projects/organizer/src/app/painel/avaliacoes frontend/projects/organizer/src/app/app.routes.ts frontend/projects/organizer/src/app/app.routes.spec.ts
git commit -m "feat(organizer): aba Avaliações do torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A3: No torneio — sidebar, atalho no telefone e KPI

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/ui/icon.component.ts` (união `OgIconName` e `@switch`)
- Modify: `frontend/projects/organizer/src/app/painel/shell/panel-shell.component.ts` (ramo `level === 'torneio'` do `nav`)
- Modify: `frontend/projects/organizer/src/app/painel/eventos/torneio-detalhe.component.ts`, em quatro pontos:
  - imports;
  - template dos KPIs;
  - `tools`;
  - campos e construtor.
- Test: `frontend/projects/organizer/src/app/painel/shell/panel-shell.spec.ts`
- Test: `frontend/projects/organizer/src/app/painel/eventos/torneio-detalhe.avaliacao.spec.ts` (criar)

**Interfaces:**
- Consumes: `reviewKpiLabel` e `TournamentReviewSummary` (A1), `watchTournamentReviewSummary` (A1) e a rota da A2.
- Produces:
  - ícone `star` em `OgIconName`;
  - item `Avaliações` no menu do torneio;
  - em `TorneioDetalheComponent`, o signal protegido `reviewSummary` e o computed `reviewKpi`.

- [ ] **Step 1: Escrever os specs que falham**

Em `frontend/projects/organizer/src/app/painel/shell/panel-shell.spec.ts`, troque o import do `@angular/core` por:

```ts
import { Component, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
```

e acrescente no fim do arquivo:

```ts
describe('PanelShellComponent — avaliações no menu', () => {
  function labels(fixture: ComponentFixture<PanelShellComponent>): string[] {
    const host = fixture.nativeElement as HTMLElement;
    return [...host.querySelectorAll('.og-sidebar .og-nav-item-label')].map((el) => el.textContent!.trim());
  }

  it('nível torneio tem Avaliações', async () => {
    const { fixture } = await mountShell(false, reachStub([]));
    const ctx = TestBed.inject(PanelContextService) as unknown as {
      level: WritableSignal<string>;
      tournamentBase: WritableSignal<string | null>;
    };
    ctx.tournamentBase.set('/painel/eventos/t1');
    ctx.level.set('torneio');
    await fixture.whenStable();
    expect(labels(fixture)).toContain('Avaliações');
  });
});
```

`frontend/projects/organizer/src/app/painel/eventos/torneio-detalhe.avaliacao.spec.ts`:

```ts
import { provideZonelessChangeDetection, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EMPTY_TOURNAMENT_COLLECTED } from '../data/tournament-collected';
import type { TournamentReviewSummary } from '../data/tournament-reviews';
import type { OrganizerTournament } from '../data/tournament.model';
import { TorneioDetalheComponent } from './torneio-detalhe.component';

function tournament(): OrganizerTournament {
  return {
    id: 't1',
    name: 'Circuito Verão 2026',
    managerId: 'u1',
    sportLabel: 'Beach Tennis',
    sportId: 'beachTennis',
    coverUrl: null,
    status: 'concluido',
    visibility: 'publicListing',
    paymentMode: 'appPixCard',
    collected: EMPTY_TOURNAMENT_COLLECTED,
    startAt: null,
    endAt: null,
    city: null,
    location: null,
    categories: [],
    capacity: null,
    waitlistEnabled: true,
    leagueId: null,
    courts: [],
    courtsCount: 0,
    matchOps: { dayStart: '08:00', dayEnd: '22:00', defaultMatchDurationMin: 30, minRestBetweenMatchesMin: 30, dynamicRescheduleEnabled: false },
    bigScreen: null,
    uniformRequired: false,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
    sponsors: [],
    myRole: null,
  };
}

function summary(over: Partial<TournamentReviewSummary> = {}): TournamentReviewSummary {
  return {
    tournamentId: 't1',
    tournamentName: 'Circuito Verão 2026',
    tournamentStartAt: null,
    status: 'open',
    eligibleCount: 42,
    count: 23,
    average: 4.62,
    distribution: { 1: 1, 2: 1, 3: 2, 4: 7, 5: 12 },
    aspects: null,
    opensAt: null,
    closesAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    ...over,
  };
}

interface Internals {
  tournament: WritableSignal<OrganizerTournament | null>;
  reviewSummary: WritableSignal<TournamentReviewSummary | null>;
}

describe('TorneioDetalheComponent — avaliação dos atletas', () => {
  let fixture: ComponentFixture<TorneioDetalheComponent>;

  async function mount(s: TournamentReviewSummary | null): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [TorneioDetalheComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(TorneioDetalheComponent);
    // `id` vazio: nenhum `getTournament` nem listener de verdade. Semeia depois.
    await fixture.whenStable();
    const internals = fixture.componentInstance as unknown as Internals;
    internals.tournament.set(tournament());
    internals.reviewSummary.set(s);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function reviewKpi(host: HTMLElement): HTMLAnchorElement | undefined {
    return [...host.querySelectorAll<HTMLAnchorElement>('a.og-torneio-kpi')].find(
      (a) => a.querySelector('.og-kpi-label')?.textContent?.trim() === 'Avaliação',
    );
  }

  it('com 3+ avaliações mostra a média e leva para a aba', async () => {
    const kpi = reviewKpi(await mount(summary()));
    expect(kpi?.querySelector('.og-kpi-value')?.textContent?.trim()).toBe('4,6 ★');
    expect(kpi?.getAttribute('href')).toContain('avaliacoes');
  });

  it('com menos de 3 avaliações mostra —', async () => {
    const kpi = reviewKpi(await mount(summary({ count: 2, average: null, distribution: null })));
    expect(kpi?.querySelector('.og-kpi-value')?.textContent?.trim()).toBe('—');
  });

  it('sem resumo também mostra —, e o atalho do telefone tem Avaliações', async () => {
    const host = await mount(null);
    expect(reviewKpi(host)?.querySelector('.og-kpi-value')?.textContent?.trim()).toBe('—');
    const tools = [...host.querySelectorAll('.og-torneio-tool span')].map((el) => el.textContent!.trim());
    expect(tools).toContain('Avaliações');
  });
});
```

O fixture `tournament()` acima é o mesmo de `categoria-detalhe.component.spec.ts`, com `categories: []`. Se o tipo `OrganizerTournament` tiver ganhado campo novo, copie o fixture atualizado de lá.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='projects/organizer/src/app/painel/shell/panel-shell.spec.ts' --include='projects/organizer/src/app/painel/eventos/torneio-detalhe.avaliacao.spec.ts'`

Expected: os testes novos falham. No shell: `Expected [...] to contain 'Avaliações'`. No detalhe: não acha o KPI (`kpi` é `undefined`), ou erro de compilação por `reviewSummary` inexistente.

- [ ] **Step 3: Ícone `star`**

Em `frontend/projects/organizer/src/app/painel/ui/icon.component.ts`:
- acrescente `| 'star'` ao fim da união `OgIconName`, depois de `| 'play'`;
- acrescente dentro do `@switch (name())`, depois do `@case ('play') { … }`:

```html
        @case ('star') {
          <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.95 6.75 19.7l1-5.85L3.5 9.7l5.9-.9z" />
        }
```

- [ ] **Step 4: Item na sidebar do torneio**

Em `frontend/projects/organizer/src/app/painel/shell/panel-shell.component.ts`, no ramo `if (level === 'torneio')` do `nav`, logo depois de `{ label: 'Equipe', icon: 'team', link: \`${base}/equipe\` },`:

```ts
        { label: 'Avaliações', icon: 'star', link: `${base}/avaliacoes` },
```

- [ ] **Step 5: Atalho no telefone e KPI na visão geral**

Em `frontend/projects/organizer/src/app/painel/eventos/torneio-detalhe.component.ts`:

1. **Imports**, junto dos outros de `../data/…`:

```ts
import { reviewKpiLabel, type TournamentReviewSummary } from '../data/tournament-reviews';
import { watchTournamentReviewSummary } from '../data/tournament-reviews-repository';
```

2. **Template dos KPIs.** Dentro de `<div class="og-kpi-row og-torneio-kpis" …>`, depois do card "Arrecadado", ainda dentro da div:

```html
          <a class="og-card og-card-pad-sm og-torneio-kpi og-torneio-kpi-link" [routerLink]="['/painel/eventos', id(), 'avaliacoes']">
            <div class="og-kpi-label">Avaliação</div>
            <div class="og-kpi-value sm">{{ reviewKpi() }}</div>
          </a>
```

3. **`tools`:** acrescente o último item da lista, depois de `Equipe`:

```ts
      { label: 'Avaliações', icon: 'star', path: 'avaliacoes', badge: null },
```

4. **Campos**, junto dos outros signals, depois de `coverFailed`:

```ts
  /** Resumo das avaliações dos atletas, ao vivo — `null` até a janela abrir. */
  protected readonly reviewSummary = signal<TournamentReviewSummary | null>(null);
  protected readonly reviewKpi = computed(() => reviewKpiLabel(this.reviewSummary()));
```

5. **Construtor:** acrescente um segundo `effect`, depois do que já existe:

```ts
    effect((onCleanup) => {
      const tid = this.id();
      if (!tid) return;
      const stop = watchTournamentReviewSummary(
        tid,
        (s) => this.reviewSummary.set(s),
        () => this.reviewSummary.set(null),
      );
      onCleanup(() => {
        stop();
        this.reviewSummary.set(null);
      });
    });
```

- [ ] **Step 6: Rodar e ver passar**

Run: o mesmo comando do Step 2.

Expected: `TOTAL: N SUCCESS`, sem `FAILED`. Os testes antigos do shell continuam verdes.

Se o shell quebrar no nível torneio por ler um campo de `ctx.tournament()` que o stub deixa `null`, a culpa é do teste, e não do item novo. Ajuste o stub do teste novo para dar um `tournament` mínimo e registre um `Ruling:`.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add frontend/projects/organizer/src/app/painel/ui/icon.component.ts frontend/projects/organizer/src/app/painel/shell/panel-shell.component.ts frontend/projects/organizer/src/app/painel/shell/panel-shell.spec.ts frontend/projects/organizer/src/app/painel/eventos/torneio-detalhe.component.ts frontend/projects/organizer/src/app/painel/eventos/torneio-detalhe.avaliacao.spec.ts
git commit -m "feat(organizer): Avaliações na sidebar, no atalho do telefone e KPI do torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A4: Página "Reputação"

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament-reviews.ts` (acrescentar `ReputationRow` e `reputationRows`)
- Test: `frontend/projects/organizer/src/app/painel/data/tournament-reviews.spec.ts` (acrescentar)
- Create: `frontend/projects/organizer/src/app/painel/reputacao/reputacao.component.ts`
- Test: `frontend/projects/organizer/src/app/painel/reputacao/reputacao.component.spec.ts`
- Modify: `frontend/projects/organizer/src/app/app.routes.ts` (filho global, depois de `financeiro`)
- Modify: `frontend/projects/organizer/src/app/painel/shell/panel-shell.component.ts` (ramo global do `nav`)
- Test: `frontend/projects/organizer/src/app/app.routes.spec.ts`, `frontend/projects/organizer/src/app/painel/shell/panel-shell.spec.ts`

**Interfaces:**
- Consumes:
  - `formatRating`, `hasPublicNumbers`, `aspectRows`, `weakestAspectLabel`, `MIN_PUBLIC_REVIEWS` e os tipos da A1;
  - `watchOrganizerReputation` e `watchOrganizerReviewSummaries` (A1);
  - `AuthService.user()` (`auth/auth.service.ts`);
  - o ícone `star` (A3).
- Produces:
  - `ReputationRow` e `reputationRows(summaries)`;
  - `ReputacaoComponent` (seletor `og-reputacao`), com os signals protegidos `reputationReady`, `summariesReady`, `reputation` e `summaries`;
  - rota `painel/reputacao`;
  - item `Reputação` no menu global.

- [ ] **Step 1: Escrever os specs que falham**

Em `frontend/projects/organizer/src/app/painel/data/tournament-reviews.spec.ts`:
- acrescente `reputationRows` ao import de `./tournament-reviews`;
- acrescente dentro do `describe` principal:

```ts
  it('reputationRows: mais recente primeiro, — abaixo de 3, aspecto mais fraco', () => {
    const rows = reputationRows([
      summary({
        tournamentId: 't1',
        tournamentName: 'Copa Agosto',
        tournamentStartAt: new Date('2026-08-02T12:00:00Z'),
        aspects: { organization: { count: 20, average: 4.8 }, schedule: { count: 18, average: 3.4 } },
      }),
      summary({
        tournamentId: 't2',
        tournamentName: 'Etapa Setembro',
        tournamentStartAt: new Date('2026-09-20T12:00:00Z'),
        count: 2,
        eligibleCount: 30,
        average: null,
        distribution: null,
        aspects: null,
      }),
    ]);
    expect(rows).toEqual([
      { tournamentId: 't2', name: 'Etapa Setembro', date: '20/09/2026', average: '—', reviews: '2', response: '2 de 30', weakest: '—' },
      { tournamentId: 't1', name: 'Copa Agosto', date: '02/08/2026', average: '4,6', reviews: '23', response: '23 de 42', weakest: 'Cumprimento dos horários' },
    ]);
  });
```

`frontend/projects/organizer/src/app/painel/reputacao/reputacao.component.spec.ts`:

```ts
import { Component, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import type { OrganizerReputation, TournamentReviewSummary } from '../data/tournament-reviews';
import { OgBellComponent } from '../shell/og-bell.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { ReputacaoComponent } from './reputacao.component';

/** `og-bell` de verdade abre `onSnapshot` contra o Firestore — sem sentido aqui. */
@Component({ selector: 'og-bell', template: '' })
class OgBellStub {}

interface Internals {
  reputationReady: WritableSignal<boolean>;
  summariesReady: WritableSignal<boolean>;
  reputation: WritableSignal<OrganizerReputation | null>;
  summaries: WritableSignal<TournamentReviewSummary[]>;
}

function summary(over: Partial<TournamentReviewSummary> = {}): TournamentReviewSummary {
  return {
    tournamentId: 't1',
    tournamentName: 'Copa Agosto',
    tournamentStartAt: new Date('2026-08-02T12:00:00Z'),
    status: 'closed',
    eligibleCount: 42,
    count: 23,
    average: 4.62,
    distribution: { 1: 1, 2: 1, 3: 2, 4: 7, 5: 12 },
    aspects: { organization: { count: 20, average: 4.8 }, schedule: { count: 18, average: 3.4 } },
    opensAt: null,
    closesAt: null,
    ...over,
  };
}

describe('ReputacaoComponent', () => {
  let fixture: ComponentFixture<ReputacaoComponent>;

  async function mount(seed: { reputation: OrganizerReputation | null; summaries: TournamentReviewSummary[] }): Promise<HTMLElement> {
    TestBed.overrideComponent(OgPageHeaderComponent, { remove: { imports: [OgBellComponent] }, add: { imports: [OgBellStub] } });
    await TestBed.configureTestingModule({
      imports: [ReputacaoComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        // Sem usuário o efeito não abre listener. Os dados são semeados à mão.
        { provide: AuthService, useValue: { user: signal(null) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ReputacaoComponent);
    await fixture.whenStable();
    const internals = fixture.componentInstance as unknown as Internals;
    internals.reputation.set(seed.reputation);
    internals.summaries.set(seed.summaries);
    internals.reputationReady.set(true);
    internals.summariesReady.set(true);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const textOf = (host: HTMLElement) => host.textContent!.replace(/\s+/g, ' ');

  it('média geral, total e torneios; aspectos; tabela do mais recente para o mais antigo', async () => {
    const host = await mount({
      reputation: {
        reviewsCount: 86,
        tournamentsRated: 5,
        average: 4.71,
        aspects: { organization: { count: 80, average: 4.8 }, venue: { count: 40, average: 3.9 } },
      },
      summaries: [
        summary(),
        summary({ tournamentId: 't2', tournamentName: 'Etapa Setembro', tournamentStartAt: new Date('2026-09-20T12:00:00Z'), count: 2, average: null, aspects: null }),
      ],
    });
    expect([...host.querySelectorAll('.og-rep-kpis .og-kpi-value')].map((e) => e.textContent!.trim())).toEqual(['4,7 ★', '86', '5']);
    expect([...host.querySelectorAll('.og-rep-aspect-name')].map((e) => e.textContent!.trim())).toEqual([
      'Estrutura do local',
      'Organização geral',
    ]);
    const rows = [...host.querySelectorAll<HTMLAnchorElement>('a.og-rep-row')];
    expect(rows.map((r) => r.querySelector('.og-rep-title')!.textContent!.trim())).toEqual(['Etapa Setembro', 'Copa Agosto']);
    expect(rows[0].getAttribute('href')).toBe('/painel/eventos/t2/avaliacoes');
    expect(rows[0].querySelector('.og-rep-avg')!.textContent!.trim()).toBe('—');
    expect(rows[1].querySelector('.og-rep-avg')!.textContent!.trim()).toBe('4,6');
    expect(rows[1].querySelector('.c-weak')!.textContent!.trim()).toBe('Cumprimento dos horários');
    expect(textOf(host)).not.toContain('As notas aparecem a partir de 3 avaliações.');
  });

  it('abaixo de 3 avaliações no total: — e o aviso, sem aspectos', async () => {
    const host = await mount({ reputation: { reviewsCount: 2, tournamentsRated: 1, average: null, aspects: null }, summaries: [] });
    expect(host.querySelector('.og-rep-kpis .og-kpi-value')!.textContent!.trim()).toBe('—');
    expect(textOf(host)).toContain('As notas aparecem a partir de 3 avaliações.');
    expect(host.querySelector('.og-rep-aspect-name')).toBeNull();
  });

  it('sem nenhum torneio avaliado', async () => {
    const host = await mount({ reputation: null, summaries: [] });
    expect(textOf(host)).toContain('Nenhum torneio seu passou pela avaliação dos atletas ainda.');
  });
});
```

Em `frontend/projects/organizer/src/app/app.routes.spec.ts`, acrescente:

```ts
  it('serve a reputação no nível global do painel', () => {
    expect(findRoute(routes, ['painel', 'reputacao'])).not.toBeNull();
  });
```

Em `frontend/projects/organizer/src/app/painel/shell/panel-shell.spec.ts`, dentro do `describe('PanelShellComponent — avaliações no menu', …)` criado na A3, acrescente:

```ts
  it('nível global tem Reputação', async () => {
    const { fixture } = await mountShell(false, reachStub([]));
    expect(labels(fixture)).toContain('Reputação');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='projects/organizer/src/app/painel/data/tournament-reviews.spec.ts' --include='projects/organizer/src/app/painel/reputacao/reputacao.component.spec.ts' --include='projects/organizer/src/app/app.routes.spec.ts' --include='projects/organizer/src/app/painel/shell/panel-shell.spec.ts'`

Expected: erro de compilação, `'reputationRows'` não exportado e `Cannot find module './reputacao.component'`.

- [ ] **Step 3: `reputationRows`**

Acrescente no fim de `frontend/projects/organizer/src/app/painel/data/tournament-reviews.ts`:

```ts
const FULL_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

export interface ReputationRow {
  tournamentId: string;
  name: string;
  date: string;
  average: string;
  reviews: string;
  response: string;
  weakest: string;
}

/** Tabela "Por torneio" da Reputação: do mais recente para o mais antigo. */
export function reputationRows(summaries: readonly TournamentReviewSummary[]): ReputationRow[] {
  const when = (s: TournamentReviewSummary) => s.tournamentStartAt ?? s.opensAt;
  return [...summaries]
    .sort((a, b) => (when(b)?.getTime() ?? 0) - (when(a)?.getTime() ?? 0))
    .map((s) => {
      const date = when(s);
      return {
        tournamentId: s.tournamentId,
        name: s.tournamentName || 'Torneio sem nome',
        date: date ? FULL_DATE.format(date) : '—',
        average: hasPublicNumbers(s) ? formatRating(s.average) : '—',
        reviews: String(s.count),
        response: `${s.count} de ${s.eligibleCount}`,
        weakest: weakestAspectLabel(s.aspects) ?? '—',
      };
    });
}
```

- [ ] **Step 4: Componente**

`frontend/projects/organizer/src/app/painel/reputacao/reputacao.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import {
  MIN_PUBLIC_REVIEWS,
  aspectRows,
  formatRating,
  reputationRows,
  type OrganizerReputation,
  type TournamentReviewSummary,
} from '../data/tournament-reviews';
import { watchOrganizerReputation, watchOrganizerReviewSummaries } from '../data/tournament-reviews-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';

/** Reputação do organizador — spec §4. Soma de `organizerReputation/{uid}` mais a tabela por
 *  torneio de `tournamentReviewSummaries where organizerId == uid`. Só os torneios de que ele
 *  é dono: a reputação é de quem organiza, não de quem ajuda. */
@Component({
  selector: 'og-reputacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgCardComponent, NxPageLoadingComponent],
  template: `
    <og-page-header title="Reputação" subtitle="Como os atletas avaliam os seus torneios" />

    <div class="og-content og-rep">
      @if (failed()) {
        <p class="og-rep-empty">Não foi possível carregar a reputação. Recarregue a página.</p>
      } @else if (loading()) {
        <app-nx-page-loading title="Carregando reputação…" />
      } @else {
        <div class="og-kpi-row og-rep-kpis">
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Média geral</div>
            <div class="og-kpi-value">{{ average() }}</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Avaliações</div>
            <div class="og-kpi-value">{{ reputation()?.reviewsCount ?? 0 }}</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Torneios avaliados</div>
            <div class="og-kpi-value">{{ reputation()?.tournamentsRated ?? 0 }}</div>
          </og-card>
        </div>

        @if (!hasAverage()) {
          <p class="og-rep-note">As notas aparecem a partir de {{ minReviews }} avaliações.</p>
        }

        @if (aspects().length) {
          <og-card kicker="Aspectos" title="Somando todos os torneios">
            @for (a of aspects(); track a.key) {
              <div class="og-rep-aspect">
                <span class="og-rep-aspect-name">{{ a.label }}</span>
                <span class="og-rep-aspect-val">{{ a.text }}</span>
              </div>
            }
          </og-card>
        }

        <og-card kicker="Por torneio" title="Avaliações de cada evento" pad="0">
          <div class="og-rep-table">
            <div class="og-rep-head">
              <span>Torneio</span>
              <span class="c-date">Data</span>
              <span>Média</span>
              <span>Avaliações</span>
              <span class="c-resp">Resposta</span>
              <span class="c-weak">Mais fraco</span>
            </div>
            @for (row of rows(); track row.tournamentId) {
              <a class="og-rep-row" [routerLink]="['/painel/eventos', row.tournamentId, 'avaliacoes']">
                <span class="og-rep-name">
                  <span class="og-rep-title">{{ row.name }}</span>
                  <span class="og-rep-meta">{{ row.date }} · {{ row.response }} · {{ row.weakest }}</span>
                </span>
                <span class="c-date">{{ row.date }}</span>
                <span class="og-rep-avg">{{ row.average }}</span>
                <span>{{ row.reviews }}</span>
                <span class="c-resp">{{ row.response }}</span>
                <span class="c-weak">{{ row.weakest }}</span>
              </a>
            } @empty {
              <p class="og-rep-empty og-rep-empty-pad">Nenhum torneio seu passou pela avaliação dos atletas ainda.</p>
            }
          </div>
        </og-card>
      }
    </div>
  `,
  styles: `
    .og-rep {
      container-type: inline-size;
    }
    .og-rep-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
    .og-rep-empty-pad {
      padding: 16px 18px;
    }
    .og-rep-note {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
    }
    .og-rep-aspect {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-rep-aspect:last-child {
      border-bottom: none;
    }
    .og-rep-aspect-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-rep-aspect-val {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    /* Uma grade só, pro cabeçalho e as linhas alinharem (ver memória organizer-list-fake-table-grid). */
    .og-rep-table {
      --rep-cols: minmax(0, 2fr) 96px 64px 88px 80px minmax(0, 1.3fr);
    }
    .og-rep-head,
    .og-rep-row {
      display: grid;
      grid-template-columns: var(--rep-cols);
      gap: 12px;
      align-items: center;
      padding: 10px 18px;
    }
    .og-rep-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-rep-row {
      border-top: 1px solid var(--nx-line);
      color: var(--nx-text);
      text-decoration: none;
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
    .og-rep-row:hover {
      background: var(--nx-surface-1);
    }
    .og-rep-name {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .og-rep-title {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .og-rep-meta {
      display: none;
      font-size: 11px;
      color: var(--nx-text-mute);
    }
    .og-rep-avg {
      font-family: var(--nx-font-mono);
      font-weight: 700;
    }
    @container (max-width: 720px) {
      .og-rep-table {
        --rep-cols: minmax(0, 1fr) 56px 80px;
      }
      .c-date,
      .c-resp,
      .c-weak {
        display: none;
      }
      .og-rep-meta {
        display: block;
      }
    }
  `,
})
export class ReputacaoComponent {
  private readonly auth = inject(AuthService);

  protected readonly minReviews = MIN_PUBLIC_REVIEWS;
  protected readonly reputationReady = signal(false);
  protected readonly summariesReady = signal(false);
  protected readonly failed = signal(false);
  protected readonly reputation = signal<OrganizerReputation | null>(null);
  protected readonly summaries = signal<TournamentReviewSummary[]>([]);

  protected readonly loading = computed(() => !this.reputationReady() || !this.summariesReady());
  protected readonly hasAverage = computed(() => {
    const r = this.reputation();
    return r != null && r.reviewsCount >= MIN_PUBLIC_REVIEWS && r.average != null;
  });
  protected readonly average = computed(() => {
    const r = this.reputation();
    return this.hasAverage() && r?.average != null ? `${formatRating(r.average)} ★` : '—';
  });
  protected readonly aspects = computed(() => (this.hasAverage() ? aspectRows(this.reputation()?.aspects ?? null) : []));
  protected readonly rows = computed(() => reputationRows(this.summaries()));

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? '';
      // O `painel` já exige login; sem usuário (só nos specs) não há o que ouvir.
      if (!uid) return;
      this.reputationReady.set(false);
      this.summariesReady.set(false);
      this.failed.set(false);
      const fail = () => this.failed.set(true);
      const stopReputation = watchOrganizerReputation(
        uid,
        (r) => {
          this.reputation.set(r);
          this.reputationReady.set(true);
        },
        fail,
      );
      const stopSummaries = watchOrganizerReviewSummaries(
        uid,
        (list) => {
          this.summaries.set(list);
          this.summariesReady.set(true);
        },
        fail,
      );
      onCleanup(() => {
        stopReputation();
        stopSummaries();
      });
    });
  }
}
```

- [ ] **Step 5: Rota e item no menu global**

Em `frontend/projects/organizer/src/app/app.routes.ts`, nos filhos de `painel`, logo depois do objeto de `path: 'financeiro'`:

```ts
      {
        path: 'reputacao',
        title: 'Reputação — NexaGO Organizador',
        loadComponent: () => import('./painel/reputacao/reputacao.component').then((m) => m.ReputacaoComponent),
      },
```

Em `frontend/projects/organizer/src/app/painel/shell/panel-shell.component.ts`, no `return [...]` final do `nav` (nível global), logo antes de `{ label: 'Links', icon: 'share', link: '/painel/links' },`:

```ts
      { label: 'Reputação', icon: 'star', link: '/painel/reputacao' },
```

- [ ] **Step 6: Rodar e ver passar**

Run: o mesmo comando do Step 2.

Expected: `TOTAL: N SUCCESS`, sem `FAILED`.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add frontend/projects/organizer/src/app/painel/data/tournament-reviews.ts frontend/projects/organizer/src/app/painel/data/tournament-reviews.spec.ts frontend/projects/organizer/src/app/painel/reputacao frontend/projects/organizer/src/app/app.routes.ts frontend/projects/organizer/src/app/app.routes.spec.ts frontend/projects/organizer/src/app/painel/shell/panel-shell.component.ts frontend/projects/organizer/src/app/painel/shell/panel-shell.spec.ts
git commit -m "feat(organizer): página Reputação com a média e a tabela por torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Parte B — App do organizador (Flutter)

### Task B1: Modelos do resumo e do comentário anônimo

**Files:**
- Create: `nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart`
- Test: `nexago_app/test/features/organizer/organizer_tournament_review_models_test.dart`

**Interfaces:**
- Consumes: `TournamentReviewAspect` (`lib/features/tournaments/domain/tournament_review_models.dart`, fase 2), com `.key`, `.label` e `fromKey`.
- Produces:
  - `TournamentReviewAspectStat({required int count, required double average})`.
  - `TournamentReviewSummary`, com os campos `tournamentId`, `tournamentName`, `isOpen`, `eligibleCount`, `count`, `average` (`double?`), `distribution` (`Map<int, int>?`), `aspects` (`Map<TournamentReviewAspect, TournamentReviewAspectStat>?`) e `closesAt` (`DateTime?`), e o parse `static TournamentReviewSummary? fromMap(String id, Map<String, dynamic>? data)`.
  - `AnonymousTournamentReview`, com os campos `id`, `overall`, `aspects` (`Map<TournamentReviewAspect, int>`), `comment` (`String?`) e `shuffleKey` (`double`), e o parse `static AnonymousTournamentReview? fromMap(String id, Map<String, dynamic>? data)`.

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/organizer/organizer_tournament_review_models_test.dart`:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

void main() {
  group('TournamentReviewSummary.fromMap', () {
    test('lê o resumo gravado pelo servidor', () {
      final closesAt = DateTime(2026, 10, 15, 10);
      final s = TournamentReviewSummary.fromMap('t1', {
        'tournamentId': 't1',
        'organizerId': 'o1',
        'tournamentName': ' Copa Aurora ',
        'status': 'open',
        'eligibleCount': 42,
        'count': 23,
        'average': 4.62,
        'distribution': {'1': 1, '2': 1, '3': 2, '4': 7, '5': 12},
        'aspects': {
          'schedule': {'count': 18, 'average': 3.4},
          'organization': {'count': 20, 'average': 5},
          'bogus': {'count': 1, 'average': 1},
        },
        'closesAt': Timestamp.fromDate(closesAt),
      })!;
      expect(s.tournamentName, 'Copa Aurora');
      expect(s.isOpen, isTrue);
      expect(s.eligibleCount, 42);
      expect(s.count, 23);
      expect(s.average, 4.62);
      expect(s.distribution, {1: 1, 2: 1, 3: 2, 4: 7, 5: 12});
      expect(
        s.aspects!.keys,
        unorderedEquals([TournamentReviewAspect.schedule, TournamentReviewAspect.organization]),
      );
      // Média inteira chega do Firestore como int.
      expect(s.aspects![TournamentReviewAspect.organization]!.average, 5.0);
      expect(s.closesAt, closesAt);
    });

    test('com menos de 3 avaliações só a contagem vem preenchida', () {
      final s = TournamentReviewSummary.fromMap('t9', {
        'status': 'open',
        'eligibleCount': 42,
        'count': 2,
        'average': null,
        'distribution': null,
        'aspects': null,
      })!;
      expect(s.tournamentId, 't9');
      expect(s.count, 2);
      expect(s.average, isNull);
      expect(s.distribution, isNull);
      expect(s.aspects, isNull);
    });

    test('doc ausente vira null; status diferente de open é fechado', () {
      expect(TournamentReviewSummary.fromMap('t1', null), isNull);
      expect(TournamentReviewSummary.fromMap('t1', {'status': 'closed'})!.isOpen, isFalse);
    });
  });

  group('AnonymousTournamentReview.fromMap', () {
    test('comentário só com espaços vira null; aspecto desconhecido e nota fora de 1–5 somem', () {
      final r = AnonymousTournamentReview.fromMap('a1', {
        'overall': 4,
        'aspects': {'schedule': 2, 'venue': 7, 'bogus': 3},
        'comment': '   ',
        'shuffleKey': 0.42,
      })!;
      expect(r.overall, 4);
      expect(r.aspects, {TournamentReviewAspect.schedule: 2});
      expect(r.comment, isNull);
      expect(r.shuffleKey, 0.42);
    });

    test('sem nota geral válida não vira avaliação', () {
      expect(AnonymousTournamentReview.fromMap('a1', {'overall': 0}), isNull);
      expect(AnonymousTournamentReview.fromMap('a1', null), isNull);
    });
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/organizer/organizer_tournament_review_models_test.dart`

Expected: falha de compilação, `Target of URI doesn't exist: '...organizer_tournament_review_models.dart'`.

- [ ] **Step 3: Implementar**

`nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart`:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

/// Lado do organizador da avaliação do torneio — spec
/// `docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md` §4. Os docs são
/// gravados só pelo servidor (`functions/src/tournament-review-derived.ts`); aqui só se lê.

/// Média e contagem de um aspecto.
class TournamentReviewAspectStat {
  const TournamentReviewAspectStat({required this.count, required this.average});

  final int count;
  final double average;
}

/// `tournamentReviewSummaries/{tournamentId}` — público. Com `count < 3`, `average`,
/// `distribution` e `aspects` vêm nulos: só a contagem é real.
class TournamentReviewSummary {
  const TournamentReviewSummary({
    required this.tournamentId,
    required this.tournamentName,
    required this.isOpen,
    required this.eligibleCount,
    required this.count,
    this.average,
    this.distribution,
    this.aspects,
    this.closesAt,
  });

  final String tournamentId;
  final String tournamentName;

  /// `status == 'open'` no doc. A janela só está aberta de fato com `closesAt` no futuro.
  final bool isOpen;
  final int eligibleCount;
  final int count;
  final double? average;

  /// Estrelas (1–5) → quantidade de notas gerais.
  final Map<int, int>? distribution;
  final Map<TournamentReviewAspect, TournamentReviewAspectStat>? aspects;
  final DateTime? closesAt;

  static TournamentReviewSummary? fromMap(String id, Map<String, dynamic>? data) {
    if (data == null) return null;
    final tournamentId = _textOf(data['tournamentId']);
    return TournamentReviewSummary(
      tournamentId: tournamentId.isEmpty ? id : tournamentId,
      tournamentName: _textOf(data['tournamentName']),
      isOpen: data['status'] == 'open',
      eligibleCount: _countOf(data['eligibleCount']),
      count: _countOf(data['count']),
      average: _numOf(data['average']),
      distribution: _distributionOf(data['distribution']),
      aspects: _aspectStatsOf(data['aspects']),
      closesAt: _dateOf(data['closesAt']),
    );
  }
}

/// `tournaments/{tid}/anonymousReviews/{anonId}` — cópia sem uid, data nem categoria. A rule só
/// libera a leitura para quem gerencia o torneio, e só com 3+ avaliações no resumo.
class AnonymousTournamentReview {
  const AnonymousTournamentReview({
    required this.id,
    required this.overall,
    required this.aspects,
    required this.shuffleKey,
    this.comment,
  });

  final String id;
  final int overall;
  final Map<TournamentReviewAspect, int> aspects;
  final String? comment;

  /// Ordem embaralhada fixa: a ordem de chegada não pode denunciar quem escreveu.
  final double shuffleKey;

  static AnonymousTournamentReview? fromMap(String id, Map<String, dynamic>? data) {
    if (data == null) return null;
    final overall = _starOf(data['overall']);
    if (overall == null) return null;
    final aspects = <TournamentReviewAspect, int>{};
    final rawAspects = data['aspects'];
    if (rawAspects is Map) {
      for (final entry in rawAspects.entries) {
        final aspect = TournamentReviewAspect.fromKey('${entry.key}');
        final value = _starOf(entry.value);
        if (aspect != null && value != null) aspects[aspect] = value;
      }
    }
    final comment = _textOf(data['comment']);
    return AnonymousTournamentReview(
      id: id,
      overall: overall,
      aspects: aspects,
      comment: comment.isEmpty ? null : comment,
      shuffleKey: _numOf(data['shuffleKey']) ?? 0,
    );
  }
}

DateTime? _dateOf(Object? value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  return null;
}

String _textOf(Object? value) => value is String ? value.trim() : '';

int _countOf(Object? value) => value is num && value.isFinite && value > 0 ? value.toInt() : 0;

double? _numOf(Object? value) => value is num && value.isFinite ? value.toDouble() : null;

int? _starOf(Object? value) {
  if (value is num && value == value.roundToDouble() && value >= 1 && value <= 5) {
    return value.toInt();
  }
  return null;
}

Map<int, int>? _distributionOf(Object? value) {
  if (value is! Map) return null;
  return {for (var stars = 1; stars <= 5; stars++) stars: _countOf(value['$stars'])};
}

Map<TournamentReviewAspect, TournamentReviewAspectStat>? _aspectStatsOf(Object? value) {
  if (value is! Map) return null;
  final out = <TournamentReviewAspect, TournamentReviewAspectStat>{};
  for (final entry in value.entries) {
    final aspect = TournamentReviewAspect.fromKey('${entry.key}');
    final raw = entry.value;
    if (aspect == null || raw is! Map) continue;
    final average = _numOf(raw['average']);
    final count = _countOf(raw['count']);
    if (average != null && count > 0) {
      out[aspect] = TournamentReviewAspectStat(count: count, average: average);
    }
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar; analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/organizer/organizer_tournament_review_models_test.dart && flutter analyze lib/features/organizer/domain/tournament_reviews test/features/organizer/organizer_tournament_review_models_test.dart`

Expected: `All tests passed!` e `No issues found!`.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart nexago_app/test/features/organizer/organizer_tournament_review_models_test.dart
git commit -m "feat(app): modelos do resumo e do comentário anônimo da avaliação (organizador)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B2: Regras puras (estados, textos, linhas e cards)

**Files:**
- Create: `nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_logic.dart`
- Test: `nexago_app/test/features/organizer/organizer_tournament_review_logic_test.dart`

**Interfaces:**
- Consumes:
  - os modelos da B1;
  - `tournamentReviewDayMonth(DateTime)` (`lib/features/tournaments/domain/tournament_review_logic.dart`, fase 2);
  - `TournamentReviewAspect`.
- Produces:
  - Constantes: `const int kTournamentReviewMinPublic = 3`, `const Duration kTournamentReviewLookback = Duration(days: 3)`.
  - `bool tournamentReviewHasPublicNumbers(TournamentReviewSummary s)`.
  - Formatação: `String formatTournamentReviewAverage(double value)`, `String tournamentReviewsCountLabel(int count)`, `String tournamentReviewsResponseRate(TournamentReviewSummary s)`.
  - Janela: `bool isTournamentReviewWindowOpen(TournamentReviewSummary s, DateTime now)`, `String tournamentReviewsWindowLabel(TournamentReviewSummary s, DateTime now)`.
  - Textos de estado: `String tournamentReviewsCollectingText(TournamentReviewSummary s)`, `String organizerReviewsCardSubtitle(TournamentReviewSummary? s)`.
  - Estado vazio: `enum TournamentReviewsEmptyState { notEnded, opening, endedBefore, cancelled }`, `TournamentReviewsEmptyState tournamentReviewsEmptyState(Map<String, dynamic> tournament, DateTime now)`, `String tournamentReviewsEmptyText(TournamentReviewsEmptyState state)`.
  - Aspectos: `class TournamentReviewAspectRow { aspect, average, count; label; valueText; fraction }` e `List<TournamentReviewAspectRow> tournamentReviewAspectRows(Map<TournamentReviewAspect, TournamentReviewAspectStat>? aspects)`.
  - Distribuição: `class TournamentReviewDistributionRow { stars, count, fraction; label }` e `List<TournamentReviewDistributionRow> tournamentReviewDistributionRows(Map<int, int>? distribution)`.
  - Comentários: `List<AnonymousTournamentReview> tournamentReviewCommentCards(Iterable<AnonymousTournamentReview> reviews, {required bool lowOnly})`, `String tournamentReviewStars(int overall)`, `List<String> tournamentReviewAspectChips(AnonymousTournamentReview review)`.

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/organizer/organizer_tournament_review_logic_test.dart`:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_logic.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  final now = DateTime(2026, 10, 6, 12);

  TournamentReviewSummary summary({
    int count = 23,
    int eligible = 42,
    double? average = 4.62,
    bool open = true,
    DateTime? closesAt,
  }) =>
      TournamentReviewSummary(
        tournamentId: 't1',
        tournamentName: 'Copa Aurora',
        isOpen: open,
        eligibleCount: eligible,
        count: count,
        average: average,
        closesAt: closesAt ?? DateTime(2026, 10, 15, 10),
      );

  test('números públicos só com 3+ e média presente', () {
    expect(tournamentReviewHasPublicNumbers(summary()), isTrue);
    expect(tournamentReviewHasPublicNumbers(summary(count: 2, average: null)), isFalse);
    expect(tournamentReviewHasPublicNumbers(summary(average: null)), isFalse);
  });

  test('média com uma casa e vírgula; contagem e taxa de resposta', () {
    expect(formatTournamentReviewAverage(4.62), '4,6');
    expect(formatTournamentReviewAverage(4), '4,0');
    expect(tournamentReviewsCountLabel(1), '1 avaliação');
    expect(tournamentReviewsCountLabel(23), '23 avaliações');
    expect(tournamentReviewsResponseRate(summary()), '23 de 42 atletas');
  });

  group('janela', () {
    test('aberta até dd/MM enquanto closesAt está no futuro', () {
      expect(isTournamentReviewWindowOpen(summary(), now), isTrue);
      expect(tournamentReviewsWindowLabel(summary(), now), 'Aberta até 15/10');
    });

    test('status open com closesAt vencido (job atrasado) já é Encerrada', () {
      final late = summary(closesAt: now.subtract(const Duration(minutes: 1)));
      expect(isTournamentReviewWindowOpen(late, now), isFalse);
      expect(tournamentReviewsWindowLabel(late, now), 'Encerrada');
    });

    test('fechada é Encerrada', () {
      expect(tournamentReviewsWindowLabel(summary(open: false), now), 'Encerrada');
    });
  });

  test('texto de quem ainda não tem 3 avaliações, inclusive sem elegíveis', () {
    expect(
      tournamentReviewsCollectingText(summary(count: 2, average: null)),
      '2 de 42 atletas avaliaram. As notas aparecem a partir de 3 avaliações.',
    );
    expect(
      tournamentReviewsCollectingText(summary(count: 0, eligible: 0, average: null)),
      'Nenhum atleta ficou apto a avaliar este torneio.',
    );
  });

  test('subtítulo do card no hub', () {
    expect(organizerReviewsCardSubtitle(null), 'Notas dos atletas depois do torneio');
    expect(organizerReviewsCardSubtitle(summary(count: 2, average: null)), '2 de 42 atletas avaliaram');
    expect(
      organizerReviewsCardSubtitle(summary(count: 0, eligible: 0, average: null)),
      'Nenhum atleta apto a avaliar',
    );
    expect(organizerReviewsCardSubtitle(summary()), '4,6 ★ (23)');
  });

  group('tournamentReviewsEmptyState', () {
    Timestamp at(Duration offset) => Timestamp.fromDate(now.add(offset));

    test('torneio por vir ou rascunho', () {
      expect(
        tournamentReviewsEmptyState({'listingStatus': 'open', 'endAt': at(const Duration(days: 2))}, now),
        TournamentReviewsEmptyState.notEnded,
      );
      expect(tournamentReviewsEmptyState({'status': 'draft'}, now), TournamentReviewsEmptyState.notEnded);
    });

    test('terminou há até 3 dias: o job das 10h ainda abre', () {
      expect(
        tournamentReviewsEmptyState({'listingStatus': 'closed', 'endAt': at(const Duration(hours: -20))}, now),
        TournamentReviewsEmptyState.opening,
      );
      expect(
        tournamentReviewsEmptyState({
          'listingStatus': 'completed',
          'completedAt': at(const Duration(days: -1)),
          'endAt': at(const Duration(days: -40)),
        }, now),
        TournamentReviewsEmptyState.opening,
      );
      expect(tournamentReviewsEmptyState({'listingStatus': 'completed'}, now), TournamentReviewsEmptyState.opening);
    });

    test('terminou há mais de 3 dias sem resumo', () {
      expect(
        tournamentReviewsEmptyState({'listingStatus': 'completed', 'completedAt': at(const Duration(days: -30))}, now),
        TournamentReviewsEmptyState.endedBefore,
      );
      expect(
        tournamentReviewsEmptyState({'listingStatus': 'closed', 'endAt': at(const Duration(days: -4))}, now),
        TournamentReviewsEmptyState.endedBefore,
      );
    });

    test('cancelado nunca recebe avaliação', () {
      expect(
        tournamentReviewsEmptyState({'listingStatus': 'cancelled', 'endAt': at(const Duration(days: -1))}, now),
        TournamentReviewsEmptyState.cancelled,
      );
    });

    test('textos, na ordem do enum', () {
      expect(TournamentReviewsEmptyState.values.map(tournamentReviewsEmptyText).toList(), [
        'A avaliação abre quando o torneio terminar.',
        'O torneio terminou. O pedido de avaliação sai para os atletas às 10h.',
        'Este torneio terminou antes de as avaliações existirem.',
        'Torneio cancelado não recebe avaliações.',
      ]);
    });
  });

  test('aspectos do mais fraco ao mais forte; empate na ordem da lista', () {
    final rows = tournamentReviewAspectRows({
      TournamentReviewAspect.prizes: const TournamentReviewAspectStat(count: 5, average: 3.4),
      TournamentReviewAspect.organization: const TournamentReviewAspectStat(count: 20, average: 4.8),
      TournamentReviewAspect.schedule: const TournamentReviewAspectStat(count: 18, average: 3.4),
      TournamentReviewAspect.venue: const TournamentReviewAspectStat(count: 1, average: 4),
    });
    expect(rows.map((r) => r.aspect), [
      TournamentReviewAspect.schedule,
      TournamentReviewAspect.prizes,
      TournamentReviewAspect.venue,
      TournamentReviewAspect.organization,
    ]);
    expect(rows.first.label, 'Cumprimento dos horários');
    expect(rows.first.valueText, '3,4 · 18 notas');
    expect(rows[2].valueText, '4,0 · 1 nota');
    expect(rows.last.fraction, closeTo(0.96, 1e-9));
    expect(tournamentReviewAspectRows(null), isEmpty);
  });

  test('distribuição de 5★ a 1★', () {
    final rows = tournamentReviewDistributionRows({1: 1, 2: 1, 3: 2, 4: 7, 5: 12});
    expect(rows.map((r) => r.label), ['5★', '4★', '3★', '2★', '1★']);
    expect(rows.map((r) => r.count), [12, 7, 2, 1, 1]);
    expect(rows.first.fraction, closeTo(12 / 23, 1e-9));
    expect(tournamentReviewDistributionRows(null), isEmpty);
  });

  test('comentários: só com texto, por shuffleKey; lowOnly = 1–2★', () {
    AnonymousTournamentReview r(String id, int overall, String? comment, double key) =>
        AnonymousTournamentReview(id: id, overall: overall, aspects: const {}, comment: comment, shuffleKey: key);
    final reviews = [
      r('a', 5, 'Tudo pontual', 0.9),
      r('b', 1, 'Atrasou duas horas', 0.1),
      r('c', 4, null, 0.5),
      r('d', 2, 'Quadra ruim', 0.3),
    ];
    expect(tournamentReviewCommentCards(reviews, lowOnly: false).map((x) => x.id), ['b', 'd', 'a']);
    expect(tournamentReviewCommentCards(reviews, lowOnly: true).map((x) => x.id), ['b', 'd']);
  });

  test('estrelas e aspectos marcados no card, na ordem da lista', () {
    expect(tournamentReviewStars(4), '★★★★☆');
    const review = AnonymousTournamentReview(
      id: 'a',
      overall: 4,
      aspects: {TournamentReviewAspect.schedule: 2, TournamentReviewAspect.organization: 5},
      comment: 'x',
      shuffleKey: 0,
    );
    expect(tournamentReviewAspectChips(review), ['Organização geral 5★', 'Cumprimento dos horários 2★']);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/organizer/organizer_tournament_review_logic_test.dart`

Expected: falha de compilação, `Target of URI doesn't exist: '...organizer_tournament_review_logic.dart'`.

- [ ] **Step 3: Implementar**

`nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_logic.dart`:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

import 'organizer_tournament_review_models.dart';

/// Abaixo disso o resumo não tem média e a rule nega os comentários (`MIN_PUBLIC_REVIEWS`).
const int kTournamentReviewMinPublic = 3;

/// Depois disso o job diário (10h) não abre mais a janela (`REVIEW_LOOKBACK_DAYS`).
const Duration kTournamentReviewLookback = Duration(days: 3);

bool tournamentReviewHasPublicNumbers(TournamentReviewSummary s) =>
    s.count >= kTournamentReviewMinPublic && s.average != null;

/// Uma casa, vírgula — a mesma regra do push de fechamento (fase 1).
String formatTournamentReviewAverage(double value) =>
    value.toStringAsFixed(1).replaceAll('.', ',');

String tournamentReviewsCountLabel(int count) => count == 1 ? '1 avaliação' : '$count avaliações';

String tournamentReviewsResponseRate(TournamentReviewSummary s) =>
    '${s.count} de ${s.eligibleCount} atletas';

/// `status` sozinho não basta: o job que fecha pode atrasar.
bool isTournamentReviewWindowOpen(TournamentReviewSummary s, DateTime now) {
  final closesAt = s.closesAt;
  return s.isOpen && closesAt != null && closesAt.isAfter(now);
}

String tournamentReviewsWindowLabel(TournamentReviewSummary s, DateTime now) =>
    isTournamentReviewWindowOpen(s, now)
        ? 'Aberta até ${tournamentReviewDayMonth(s.closesAt!)}'
        : 'Encerrada';

String tournamentReviewsCollectingText(TournamentReviewSummary s) {
  if (s.eligibleCount == 0) return 'Nenhum atleta ficou apto a avaliar este torneio.';
  return '${s.count} de ${s.eligibleCount} atletas avaliaram. '
      'As notas aparecem a partir de $kTournamentReviewMinPublic avaliações.';
}

/// Subtítulo do card "Avaliações" no hub do torneio.
String organizerReviewsCardSubtitle(TournamentReviewSummary? s) {
  if (s == null) return 'Notas dos atletas depois do torneio';
  if (tournamentReviewHasPublicNumbers(s)) {
    return '${formatTournamentReviewAverage(s.average!)} ★ (${s.count})';
  }
  if (s.eligibleCount == 0) return 'Nenhum atleta apto a avaliar';
  return '${s.count} de ${s.eligibleCount} atletas avaliaram';
}

enum TournamentReviewsEmptyState { notEnded, opening, endedBefore, cancelled }

const _cancelledStatuses = {'cancelled', 'canceled', 'cancelado'};
const _completedStatuses = {'completed', 'concluido', 'concluído'};

/// Sem resumo: o que dizer. Espelha `reviewCandidateReason` (functions): concluído ou `endAt`
/// passado entram no job das 10h por até 3 dias; cancelado nunca entra.
TournamentReviewsEmptyState tournamentReviewsEmptyState(
  Map<String, dynamic> tournament,
  DateTime now,
) {
  final status =
      '${tournament['listingStatus'] ?? tournament['status'] ?? ''}'.trim().toLowerCase();
  if (_cancelledStatuses.contains(status)) return TournamentReviewsEmptyState.cancelled;
  final endAt = _dateOf(tournament['endAt']);
  final endAtPassed = endAt != null && !endAt.isAfter(now);
  DateTime? endedAt;
  if (_completedStatuses.contains(status)) {
    endedAt = _dateOf(tournament['completedAt']) ?? (endAtPassed ? endAt : now);
  } else if (endAtPassed) {
    endedAt = endAt;
  }
  if (endedAt == null) return TournamentReviewsEmptyState.notEnded;
  return now.difference(endedAt) <= kTournamentReviewLookback
      ? TournamentReviewsEmptyState.opening
      : TournamentReviewsEmptyState.endedBefore;
}

String tournamentReviewsEmptyText(TournamentReviewsEmptyState state) => switch (state) {
      TournamentReviewsEmptyState.notEnded => 'A avaliação abre quando o torneio terminar.',
      TournamentReviewsEmptyState.opening =>
        'O torneio terminou. O pedido de avaliação sai para os atletas às 10h.',
      TournamentReviewsEmptyState.endedBefore =>
        'Este torneio terminou antes de as avaliações existirem.',
      TournamentReviewsEmptyState.cancelled => 'Torneio cancelado não recebe avaliações.',
    };

class TournamentReviewAspectRow {
  const TournamentReviewAspectRow({
    required this.aspect,
    required this.average,
    required this.count,
  });

  final TournamentReviewAspect aspect;
  final double average;
  final int count;

  String get label => aspect.label;

  /// "3,4 · 18 notas".
  String get valueText =>
      '${formatTournamentReviewAverage(average)} · ${count == 1 ? '1 nota' : '$count notas'}';

  /// Largura da barra: média sobre 5.
  double get fraction => (average / 5).clamp(0.0, 1.0);
}

/// Do mais fraco ao mais forte; no empate, a ordem da lista.
List<TournamentReviewAspectRow> tournamentReviewAspectRows(
  Map<TournamentReviewAspect, TournamentReviewAspectStat>? aspects,
) {
  if (aspects == null) return const [];
  final rows = [
    for (final aspect in TournamentReviewAspect.values)
      if (aspects[aspect] case final stat?)
        TournamentReviewAspectRow(aspect: aspect, average: stat.average, count: stat.count),
  ];
  rows.sort((a, b) {
    final byAverage = a.average.compareTo(b.average);
    return byAverage != 0 ? byAverage : a.aspect.index.compareTo(b.aspect.index);
  });
  return rows;
}

class TournamentReviewDistributionRow {
  const TournamentReviewDistributionRow({
    required this.stars,
    required this.count,
    required this.fraction,
  });

  final int stars;
  final int count;
  final double fraction;

  String get label => '$stars★';
}

List<TournamentReviewDistributionRow> tournamentReviewDistributionRows(
  Map<int, int>? distribution,
) {
  if (distribution == null) return const [];
  final total = distribution.values.fold<int>(0, (sum, n) => sum + n);
  return [
    for (var stars = 5; stars >= 1; stars--)
      TournamentReviewDistributionRow(
        stars: stars,
        count: distribution[stars] ?? 0,
        fraction: total == 0 ? 0 : (distribution[stars] ?? 0) / total,
      ),
  ];
}

/// Avaliação sem texto entra nos números, mas não vira card.
List<AnonymousTournamentReview> tournamentReviewCommentCards(
  Iterable<AnonymousTournamentReview> reviews, {
  required bool lowOnly,
}) {
  final cards = reviews
      .where((r) => r.comment != null && (!lowOnly || r.overall <= 2))
      .toList()
    ..sort((a, b) => a.shuffleKey.compareTo(b.shuffleKey));
  return cards;
}

String tournamentReviewStars(int overall) => '★' * overall + '☆' * (5 - overall);

List<String> tournamentReviewAspectChips(AnonymousTournamentReview review) => [
      for (final aspect in TournamentReviewAspect.values)
        if (review.aspects[aspect] case final value?) '${aspect.label} $value★',
    ];

DateTime? _dateOf(Object? value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar; analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/organizer/organizer_tournament_review_logic_test.dart && flutter analyze lib/features/organizer/domain/tournament_reviews test/features/organizer/organizer_tournament_review_logic_test.dart`

Expected: `All tests passed!` e `No issues found!`.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_logic.dart nexago_app/test/features/organizer/organizer_tournament_review_logic_test.dart
git commit -m "feat(app): regras da tela de avaliações do organizador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B3: Repositório, providers e tela `/organizer/tournaments/:tournamentId/reviews`

**Files:**
- Create: `nexago_app/lib/features/organizer/data/organizer_tournament_reviews_repository.dart`
- Create: `nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart`
- Create: `nexago_app/lib/features/organizer/presentation/category_ops/organizer_tournament_reviews_page.dart`
- Modify: `nexago_app/lib/core/router/routes.dart`:
  - `AppRoutes`, depois de `organizerTournamentAnnounce`;
  - `AppRouteNames`, depois de `organizerTournamentAnnounce`.
- Modify: `nexago_app/lib/core/router/app_router.dart`, em dois pontos:
  - import junto dos outros de `category_ops`;
  - rota filha `reviews` depois de `announce`.
- Modify: `nexago_app/lib/features/organizer/presentation/category_ops/organizer_tournament_navigation.dart`
- Test: `nexago_app/test/features/organizer/organizer_tournament_reviews_page_test.dart`

**Interfaces:**
- Consumes:
  - B1 e B2;
  - `firestoreProvider` (`lib/core/firebase/firebase_providers.dart`);
  - `organizerTournamentDetailProvider(tid)` e `OrganizerTournamentDetailState` (`lib/features/organizer/domain/tournament_ops/tournament_ops_providers.dart`), com `tournament` e `isLoading`;
  - `OrganizerTournamentSubpageScaffold`, `AppEmptyView` e `AppInlineErrorView`.
- Produces:
  - Repositório: `OrganizerTournamentReviewsRepository(FirebaseFirestore)`, com `watchSummary(String)` e `watchAnonymousReviews(String)`.
  - Providers: `organizerTournamentReviewsRepositoryProvider`, `tournamentReviewSummaryProvider` (`StreamProvider.autoDispose.family<TournamentReviewSummary?, String>`) e `tournamentAnonymousReviewsProvider` (`StreamProvider.autoDispose.family<List<AnonymousTournamentReview>, String>`).
  - Tela: `OrganizerTournamentReviewsPage({required String tournamentId})`.
  - Rota: `AppRoutes.organizerTournamentReviews = '/organizer/tournaments/:tournamentId/reviews'` e `AppRouteNames.organizerTournamentReviews = 'organizerTournamentReviews'`.
  - Navegação: `pushOrganizerTournamentReviews(GoRouter router, {required String tournamentId})`.

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/organizer/organizer_tournament_reviews_page_test.dart`:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/organizer_tournament_reviews_page.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

const _tid = 't1';

TournamentReviewSummary _summary({
  int count = 23,
  int eligible = 42,
  DateTime? closesAt,
}) {
  final public = count >= 3;
  return TournamentReviewSummary(
    tournamentId: _tid,
    tournamentName: 'Copa Aurora',
    isOpen: true,
    eligibleCount: eligible,
    count: count,
    average: public ? 4.62 : null,
    distribution: public ? const {1: 1, 2: 1, 3: 2, 4: 7, 5: 12} : null,
    aspects: public
        ? const {
            TournamentReviewAspect.organization: TournamentReviewAspectStat(count: 20, average: 4.8),
            TournamentReviewAspect.schedule: TournamentReviewAspectStat(count: 18, average: 3.4),
          }
        : null,
    closesAt: closesAt ?? DateTime.now().add(const Duration(days: 5)),
  );
}

AnonymousTournamentReview _review(String id, int overall, String? comment, double key) =>
    AnonymousTournamentReview(id: id, overall: overall, aspects: const {}, comment: comment, shuffleKey: key);

/// Devolve se a tela pediu os comentários — com menos de 3 ela não pode pedir (a rule nega).
Future<bool> _pump(
  WidgetTester tester, {
  required TournamentReviewSummary? summary,
  Map<String, dynamic>? tournament,
  Stream<List<AnonymousTournamentReview>>? comments,
}) async {
  var commentsWatched = false;
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        tournamentReviewSummaryProvider(_tid).overrideWith((ref) => Stream.value(summary)),
        organizerTournamentDetailProvider(_tid).overrideWith(
          (ref) => Stream.value(OrganizerTournamentDetailState(tournament: tournament, isLoading: false)),
        ),
        tournamentAnonymousReviewsProvider(_tid).overrideWith((ref) {
          commentsWatched = true;
          return comments ?? Stream.value(const []);
        }),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const OrganizerTournamentReviewsPage(tournamentId: _tid),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  return commentsWatched;
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('sem resumo e torneio por vir: a avaliação abre quando terminar', (tester) async {
    await _pump(
      tester,
      summary: null,
      tournament: {
        'listingStatus': 'open',
        'endAt': Timestamp.fromDate(DateTime.now().add(const Duration(days: 10))),
      },
    );
    expect(find.text('A avaliação abre quando o torneio terminar.'), findsOneWidget);
  });

  testWidgets('sem resumo e torneio encerrado há um mês', (tester) async {
    await _pump(
      tester,
      summary: null,
      tournament: {
        'listingStatus': 'completed',
        'completedAt': Timestamp.fromDate(DateTime.now().subtract(const Duration(days: 30))),
      },
    );
    expect(find.text('Este torneio terminou antes de as avaliações existirem.'), findsOneWidget);
  });

  testWidgets('menos de 3: só a contagem, sem média e sem pedir comentários', (tester) async {
    final watched = await _pump(tester, summary: _summary(count: 2), tournament: const {});
    expect(
      find.text('2 de 42 atletas avaliaram. As notas aparecem a partir de 3 avaliações.'),
      findsOneWidget,
    );
    expect(find.text('4,6'), findsNothing);
    expect(watched, isFalse);
  });

  testWidgets('completo: média, taxa de resposta, janela e aspectos do mais fraco ao mais forte',
      (tester) async {
    final closesAt = DateTime.now().add(const Duration(days: 5));
    await _pump(tester, summary: _summary(closesAt: closesAt), tournament: const {});
    expect(find.text('4,6'), findsOneWidget);
    expect(find.text('23 avaliações'), findsOneWidget);
    expect(find.text('23 de 42 atletas'), findsOneWidget);
    expect(find.text('Aberta até ${tournamentReviewDayMonth(closesAt)}'), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Cumprimento dos horários')).dy,
      lessThan(tester.getTopLeft(find.text('Organização geral')).dy),
    );
  });

  testWidgets('comentários: só com texto, por shuffleKey, e o filtro 1–2★', (tester) async {
    await _pump(
      tester,
      summary: _summary(),
      tournament: const {},
      comments: Stream.value([
        _review('a', 5, 'Tudo pontual', 0.9),
        _review('b', 1, 'Atrasou duas horas', 0.1),
        _review('c', 4, null, 0.5),
      ]),
    );
    expect(find.text('Tudo pontual'), findsOneWidget);
    expect(find.text('Atrasou duas horas'), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Atrasou duas horas')).dy,
      lessThan(tester.getTopLeft(find.text('Tudo pontual')).dy),
    );

    await tester.ensureVisible(find.text('Só 1–2★'));
    await tester.pump();
    await tester.tap(find.text('Só 1–2★'));
    await tester.pump();
    expect(find.text('Tudo pontual'), findsNothing);
    expect(find.text('Atrasou duas horas'), findsOneWidget);
  });

  testWidgets('falha nos comentários não derruba os números', (tester) async {
    await _pump(
      tester,
      summary: _summary(),
      tournament: const {},
      comments: Stream.error(Exception('permission-denied')),
    );
    expect(find.text('Não foi possível carregar os comentários.'), findsOneWidget);
    expect(find.text('4,6'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/organizer/organizer_tournament_reviews_page_test.dart`

Expected: falha de compilação, `Target of URI doesn't exist: '...organizer_tournament_review_providers.dart'`.

- [ ] **Step 3: Repositório e providers**

`nexago_app/lib/features/organizer/data/organizer_tournament_reviews_repository.dart`:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/tournament_reviews/organizer_tournament_review_models.dart';

/// Leitura das avaliações do torneio pelo organizador — só o servidor grava esses docs.
class OrganizerTournamentReviewsRepository {
  OrganizerTournamentReviewsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  /// Resumo ao vivo — `null` até o job abrir a janela do torneio.
  Stream<TournamentReviewSummary?> watchSummary(String tournamentId) {
    final id = tournamentId.trim();
    if (id.isEmpty) return Stream.value(null);
    return _firestore
        .collection('tournamentReviewSummaries')
        .doc(id)
        .snapshots()
        .map((snap) => TournamentReviewSummary.fromMap(snap.id, snap.data()));
  }

  /// Só com `count >= 3` no resumo: abaixo disso a rule nega a leitura. A ordem (`shuffleKey`)
  /// é aplicada em `tournamentReviewCommentCards`, sem `orderBy`.
  Stream<List<AnonymousTournamentReview>> watchAnonymousReviews(String tournamentId) {
    final id = tournamentId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection('tournaments')
        .doc(id)
        .collection('anonymousReviews')
        .snapshots()
        .map((snap) => [
              for (final doc in snap.docs)
                if (AnonymousTournamentReview.fromMap(doc.id, doc.data()) case final review?) review,
            ]);
  }
}
```

`nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';

import '../../data/organizer_tournament_reviews_repository.dart';
import 'organizer_tournament_review_models.dart';

final organizerTournamentReviewsRepositoryProvider =
    Provider<OrganizerTournamentReviewsRepository>((ref) {
  return OrganizerTournamentReviewsRepository(ref.watch(firestoreProvider));
});

final tournamentReviewSummaryProvider =
    StreamProvider.autoDispose.family<TournamentReviewSummary?, String>((ref, tournamentId) {
  return ref.watch(organizerTournamentReviewsRepositoryProvider).watchSummary(tournamentId);
});

/// Só deve ser observado com 3+ avaliações no resumo (a rule nega antes disso).
final tournamentAnonymousReviewsProvider = StreamProvider.autoDispose
    .family<List<AnonymousTournamentReview>, String>((ref, tournamentId) {
  return ref.watch(organizerTournamentReviewsRepositoryProvider).watchAnonymousReviews(tournamentId);
});
```

- [ ] **Step 4: Tela**

`nexago_app/lib/features/organizer/presentation/category_ops/organizer_tournament_reviews_page.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_status_views.dart';

import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../domain/tournament_reviews/organizer_tournament_review_logic.dart';
import '../../domain/tournament_reviews/organizer_tournament_review_models.dart';
import '../../domain/tournament_reviews/organizer_tournament_review_providers.dart';
import 'widgets/organizer_tournament_subpage_scaffold.dart';

/// Avaliações dos atletas sobre o torneio — o mesmo conteúdo e os mesmos estados da aba do
/// painel web (`painel/avaliacoes/avaliacoes-torneio.component.ts`). Anônimas: nada aqui
/// identifica o atleta.
class OrganizerTournamentReviewsPage extends ConsumerWidget {
  const OrganizerTournamentReviewsPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summaryAsync = ref.watch(tournamentReviewSummaryProvider(tournamentId));
    return OrganizerTournamentSubpageScaffold(
      title: 'Avaliações',
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
          sliver: summaryAsync.when(
            loading: () => const _LoadingSliver(),
            error: (_, _) => const SliverToBoxAdapter(
              child: AppInlineErrorView(message: 'Não foi possível carregar as avaliações.'),
            ),
            data: (summary) {
              if (summary == null) return _NoSummarySliver(tournamentId: tournamentId);
              if (!tournamentReviewHasPublicNumbers(summary)) {
                return SliverToBoxAdapter(child: _CollectingCard(summary: summary));
              }
              // Coluna, não lista preguiçosa: um torneio tem dezenas de avaliações, e assim os
              // comentários existem na árvore mesmo fora da tela.
              return SliverToBoxAdapter(
                child: _FullReviews(tournamentId: tournamentId, summary: summary),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _LoadingSliver extends StatelessWidget {
  const _LoadingSliver();

  @override
  Widget build(BuildContext context) {
    return const SliverFillRemaining(
      hasScrollBody: false,
      child: Center(child: CircularProgressIndicator()),
    );
  }
}

class _NoSummarySliver extends ConsumerWidget {
  const _NoSummarySliver({required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(organizerTournamentDetailProvider(tournamentId));
    return detailAsync.when(
      loading: () => const _LoadingSliver(),
      error: (e, _) => SliverToBoxAdapter(child: AppInlineErrorView(error: e)),
      data: (detail) {
        if (detail.isLoading) return const _LoadingSliver();
        final tournament = detail.tournament;
        return SliverFillRemaining(
          hasScrollBody: false,
          child: AppEmptyView(
            icon: Icons.star_outline_rounded,
            title: tournament == null ? 'Torneio não encontrado' : 'Avaliação dos atletas',
            subtitle: tournament == null
                ? 'Volte e abra o torneio de novo.'
                : tournamentReviewsEmptyText(
                    tournamentReviewsEmptyState(tournament, DateTime.now()),
                  ),
          ),
        );
      },
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
      ),
      child: child,
    );
  }
}

class _WindowChip extends StatelessWidget {
  const _WindowChip({required this.summary});

  final TournamentReviewSummary summary;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final open = isTournamentReviewWindowOpen(summary, now);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: open ? AppColors.brand.withValues(alpha: 0.15) : context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        tournamentReviewsWindowLabel(summary, now),
        style: AppTypography.mono(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: open ? AppColors.brand : context.themeColors.onSurfaceMuted,
        ),
      ),
    );
  }
}

class _CollectingCard extends StatelessWidget {
  const _CollectingCard({required this.summary});

  final TournamentReviewSummary summary;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _WindowChip(summary: summary),
          const SizedBox(height: 12),
          Text(
            tournamentReviewsCollectingText(summary),
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ],
      ),
    );
  }
}

class _FullReviews extends ConsumerStatefulWidget {
  const _FullReviews({required this.tournamentId, required this.summary});

  final String tournamentId;
  final TournamentReviewSummary summary;

  @override
  ConsumerState<_FullReviews> createState() => _FullReviewsState();
}

class _FullReviewsState extends ConsumerState<_FullReviews> {
  bool _lowOnly = false;

  @override
  Widget build(BuildContext context) {
    final summary = widget.summary;
    // Só aqui, com 3+ avaliações: abaixo disso a rule nega a leitura dos comentários.
    final commentsAsync = ref.watch(tournamentAnonymousReviewsProvider(widget.tournamentId));
    final aspects = tournamentReviewAspectRows(summary.aspects);
    final muted = context.themeColors.onSurfaceMuted;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Panel(
          child: Row(
            children: [
              Text(
                formatTournamentReviewAverage(summary.average!),
                style: AppTypography.soraRegular(fontSize: 44, fontWeight: FontWeight.w900),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.star_rounded, color: AppColors.brand, size: 32),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tournamentReviewsCountLabel(summary.count),
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(tournamentReviewsResponseRate(summary), style: TextStyle(color: muted)),
                    const SizedBox(height: 8),
                    _WindowChip(summary: summary),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        const _SectionLabel('DISTRIBUIÇÃO'),
        for (final row in tournamentReviewDistributionRows(summary.distribution))
          _BarRow(
            label: row.label,
            value: tournamentReviewsCountLabel(row.count),
            fraction: row.fraction,
          ),
        const SizedBox(height: 24),
        const _SectionLabel('ASPECTOS · DO MAIS FRACO AO MAIS FORTE'),
        if (aspects.isEmpty)
          const _Muted('Nenhum aspecto recebeu nota.')
        else
          for (final row in aspects)
            _BarRow(label: row.label, value: row.valueText, fraction: row.fraction),
        const SizedBox(height: 24),
        const _SectionLabel('COMENTÁRIOS ANÔNIMOS'),
        Wrap(
          spacing: 8,
          children: [
            ChoiceChip(
              label: const Text('Todos'),
              selected: !_lowOnly,
              onSelected: (_) => setState(() => _lowOnly = false),
            ),
            ChoiceChip(
              label: const Text('Só 1–2★'),
              selected: _lowOnly,
              onSelected: (_) => setState(() => _lowOnly = true),
            ),
          ],
        ),
        const SizedBox(height: 12),
        commentsAsync.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (_, _) => const _Muted('Não foi possível carregar os comentários.'),
          data: (reviews) {
            final cards = tournamentReviewCommentCards(reviews, lowOnly: _lowOnly);
            if (cards.isEmpty) {
              return _Muted(
                _lowOnly
                    ? 'Nenhum comentário com 1 ou 2 estrelas.'
                    : 'Nenhum atleta escreveu comentário.',
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [for (final review in cards) _CommentCard(review: review)],
            );
          },
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        text,
        style: AppTypography.mono(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: context.themeColors.onSurfaceMuted,
          letterSpacing: 1.2,
        ),
      ),
    );
  }
}

class _Muted extends StatelessWidget {
  const _Muted(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Text(text, style: TextStyle(color: context.themeColors.onSurfaceMuted)),
    );
  }
}

class _BarRow extends StatelessWidget {
  const _BarRow({required this.label, required this.value, required this.fraction});

  final String label;
  final String value;
  final double fraction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              Text(
                value,
                style: AppTypography.mono(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: fraction,
              minHeight: 6,
              color: AppColors.brand,
              backgroundColor: context.themeColors.surfaceRaised,
            ),
          ),
        ],
      ),
    );
  }
}

class _CommentCard extends StatelessWidget {
  const _CommentCard({required this.review});

  final AnonymousTournamentReview review;

  @override
  Widget build(BuildContext context) {
    final chips = tournamentReviewAspectChips(review);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: _Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              tournamentReviewStars(review.overall),
              semanticsLabel: '${review.overall} de 5 estrelas',
              style: const TextStyle(color: AppColors.brand, letterSpacing: 1),
            ),
            if (chips.isNotEmpty) ...[
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final chip in chips)
                    Text(
                      chip,
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 8),
            Text(review.comment ?? ''),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: Rota e navegação**

Em `nexago_app/lib/core/router/routes.dart`, no `AppRoutes`, logo depois de `organizerTournamentAnnounce`:

```dart
  /// Avaliações dos atletas sobre o torneio (anônimas).
  static const String organizerTournamentReviews =
      '/organizer/tournaments/:tournamentId/reviews';
```

e no `AppRouteNames`, logo depois de `organizerTournamentAnnounce`:

```dart
  static const String organizerTournamentReviews = 'organizerTournamentReviews';
```

Em `nexago_app/lib/core/router/app_router.dart`:
- **Import**, junto dos outros de `category_ops`:

```dart
import '../../features/organizer/presentation/category_ops/organizer_tournament_reviews_page.dart';
```

- **Rota filha**, logo depois do `GoRoute(path: 'announce', …)` dos filhos de `tournaments/:tournamentId`:

```dart
              GoRoute(
                path: 'reviews',
                name: AppRouteNames.organizerTournamentReviews,
                builder: (context, state) {
                  final tournamentId =
                      state.pathParameters['tournamentId']?.trim() ?? '';
                  return OrganizerTournamentReviewsPage(
                    tournamentId: tournamentId,
                  );
                },
              ),
```

Em `nexago_app/lib/features/organizer/presentation/category_ops/organizer_tournament_navigation.dart`, logo depois de `pushOrganizerTournamentAnnounce`:

```dart
void pushOrganizerTournamentReviews(
  GoRouter router, {
  required String tournamentId,
}) {
  router.pushNamed(
    AppRouteNames.organizerTournamentReviews,
    pathParameters: {'tournamentId': tournamentId.trim()},
  );
}
```

- [ ] **Step 6: Rodar e ver passar; analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/organizer/organizer_tournament_reviews_page_test.dart && flutter analyze lib/features/organizer lib/core/router test/features/organizer/organizer_tournament_reviews_page_test.dart`

Expected:
- `All tests passed!`.
- Nenhum issue nos arquivos desta task. Issue em arquivo que esta fase não tocou já existia na base: anote e siga.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add nexago_app/lib/features/organizer/data/organizer_tournament_reviews_repository.dart nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart nexago_app/lib/features/organizer/presentation/category_ops/organizer_tournament_reviews_page.dart nexago_app/lib/core/router/routes.dart nexago_app/lib/core/router/app_router.dart nexago_app/lib/features/organizer/presentation/category_ops/organizer_tournament_navigation.dart nexago_app/test/features/organizer/organizer_tournament_reviews_page_test.dart
git commit -m "feat(app): tela de avaliações do torneio para o organizador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B4: Card "Avaliações" no hub do torneio

**Files:**
- Modify: `nexago_app/lib/features/organizer/presentation/category_ops/widgets/organizer_tournament_explore_section.dart`
- Test: `nexago_app/test/features/organizer/organizer_tournament_explore_section_test.dart`

**Interfaces:**
- Consumes: `tournamentReviewSummaryProvider` e `pushOrganizerTournamentReviews` (B3), `organizerReviewsCardSubtitle` (B2), `AppRoutes`/`AppRouteNames.organizerTournamentReviews` (B3).
- Produces: card `ExploreCard(title: 'Avaliações')`, visível com `!matchesOnly`.

- [ ] **Step 1: Escrever o teste que falha**

Em `nexago_app/test/features/organizer/organizer_tournament_explore_section_test.dart`:

1. **Imports**, junto dos outros:

```dart
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart';
```

2. **`_pump`:** acrescente o parâmetro `TournamentReviewSummary? reviewSummary` (opcional, nomeado) e um override sempre presente na lista `overrides`, logo depois do de `organizerTournamentMatchesProvider`:

```dart
        // O card de avaliações observa o resumo para todo papel menos o mesário.
        tournamentReviewSummaryProvider.overrideWith(
          (ref, tournamentId) => Stream.value(reviewSummary),
        ),
```

3. **Testes novos:** acrescente dentro do `group` existente:

```dart
    testWidgets('dono vê Avaliações com a média e a contagem', (tester) async {
      await _pump(
        tester,
        isOwner: true,
        showFinancial: true,
        matchesOnly: false,
        showUniforms: false,
        reviewSummary: const TournamentReviewSummary(
          tournamentId: _tournamentId,
          tournamentName: 'Open Goiânia',
          isOpen: false,
          eligibleCount: 42,
          count: 23,
          average: 4.62,
        ),
      );
      await tester.pump();

      expect(find.text('Avaliações'), findsOneWidget);
      expect(find.text('4,6 ★ (23)'), findsOneWidget);
    });

    testWidgets('mesário não vê Avaliações', (tester) async {
      await _pump(
        tester,
        isOwner: false,
        showFinancial: false,
        matchesOnly: true,
        showUniforms: false,
      );
      await tester.pump();

      expect(find.text('Avaliações'), findsNothing);
    });
```

4. **Teste de navegação:** acrescente um `group` novo no fim do `main`. Ele monta a seção sob um `GoRouter` com a rota nomeada de verdade:

```dart
  group('OrganizerTournamentExploreSection — navegação', () {
    testWidgets('tocar em Avaliações abre a tela de avaliações do torneio', (tester) async {
      final router = GoRouter(
        initialLocation: '/hub',
        routes: [
          GoRoute(
            path: '/hub',
            builder: (_, _) => const Scaffold(
              body: SingleChildScrollView(
                child: OrganizerTournamentExploreSection(
                  tournamentId: _tournamentId,
                  summary: _summary,
                  showUniforms: false,
                ),
              ),
            ),
          ),
          GoRoute(
            path: AppRoutes.organizerTournamentReviews,
            name: AppRouteNames.organizerTournamentReviews,
            builder: (_, state) => Scaffold(
              body: Text('avaliações de ${state.pathParameters['tournamentId']}'),
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            organizerTournamentMatchesProvider.overrideWith(
              (ref, tournamentId) => const Stream.empty(),
            ),
            tournamentReviewSummaryProvider.overrideWith(
              (ref, tournamentId) => Stream.value(null),
            ),
          ],
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pump();

      await tester.ensureVisible(find.text('Avaliações'));
      await tester.tap(find.text('Avaliações'));
      await tester.pump();
      await tester.pump();

      expect(find.text('avaliações de $_tournamentId'), findsOneWidget);
    });
  });
```

O construtor da seção não é `const` hoje se algum parâmetro não for constante. Aqui todos são (`_tournamentId` e `_summary` são `const`). Se o analisador reclamar, tire o `const`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/organizer/organizer_tournament_explore_section_test.dart`

Expected: os três testes novos falham (`find.text('Avaliações')` acha 0). Os antigos continuam passando.

- [ ] **Step 3: Implementar o card**

Em `nexago_app/lib/features/organizer/presentation/category_ops/widgets/organizer_tournament_explore_section.dart`:

1. **Imports**, junto dos outros de `domain`:

```dart
import '../../../domain/tournament_reviews/organizer_tournament_review_logic.dart';
import '../../../domain/tournament_reviews/organizer_tournament_review_providers.dart';
```

2. **Card:** acrescente o último item da lista `children` da `Column`, depois do bloco `if (showUniforms && !matchesOnly) ExploreCard(… 'Uniformes' …)`:

```dart
          // Avaliações dos atletas (anônimas): todo mundo que gerencia, menos o mesário — a rule
          // dos comentários também deixa o mesário de fora.
          if (!matchesOnly)
            ExploreCard(
              icon: Icons.star_outline_rounded,
              title: 'Avaliações',
              subtitle: organizerReviewsCardSubtitle(
                ref.watch(tournamentReviewSummaryProvider(tournamentId)).valueOrNull,
              ),
              onTap: () => pushOrganizerTournamentReviews(
                GoRouter.of(context),
                tournamentId: tournamentId,
              ),
            ),
```

- [ ] **Step 4: Rodar e ver passar; analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/organizer/organizer_tournament_explore_section_test.dart && flutter analyze lib/features/organizer/presentation/category_ops/widgets/organizer_tournament_explore_section.dart test/features/organizer/organizer_tournament_explore_section_test.dart`

Expected: `All tests passed!` e `No issues found!`.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add nexago_app/lib/features/organizer/presentation/category_ops/widgets/organizer_tournament_explore_section.dart nexago_app/test/features/organizer/organizer_tournament_explore_section_test.dart
git commit -m "feat(app): card Avaliações no hub do torneio do organizador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B5: Push e inbox de fechamento abrem as avaliações

**Files:**
- Modify: `nexago_app/lib/core/notifications/notification_navigation.dart` (`resolveNotificationRoute`, antes da `url`)
- Modify: `nexago_app/lib/features/athlete/domain/athlete_notifications_logic.dart` (`notificationPresentation`, antes do `default`)
- Test: `nexago_app/test/core/notifications/notification_navigation_test.dart`
- Test: `nexago_app/test/features/athlete/athlete_notifications_logic_test.dart`

**Interfaces:**
- Consumes: `AppRoutes.organizerTournamentReviews` (B3) e `appRouteForNotificationUrl` (já existe).
- Produces: o tipo `tournament_review_closed` roteado no push e no inbox.

- [ ] **Step 1: Escrever os testes que falham**

Em `nexago_app/test/core/notifications/notification_navigation_test.dart`, **substitua** o teste `'fechamento das avaliações (organizador) continua na url, nesta fase'` por:

```dart
    test('fechamento das avaliações (organizador) abre a tela de avaliações', () {
      expect(
        resolveNotificationRoute({
          'type': 'tournament_review_closed',
          'tournamentId': 't1',
          'url': '/organizer/tournaments/t1',
          'webUrl': '/painel/eventos/t1/avaliacoes',
        }),
        '/organizer/tournaments/t1/reviews',
      );
    });

    test('fechamento sem tournamentId cai na url do payload', () {
      expect(
        resolveNotificationRoute(
            {'type': 'tournament_review_closed', 'url': '/organizer/tournaments/t1'}),
        '/organizer/tournaments/t1',
      );
    });
```

Em `nexago_app/test/features/athlete/athlete_notifications_logic_test.dart`, dentro do `group('notificationPresentation', …)`, logo depois do teste `'tournament_review_request abre a avaliação com ação Avaliar'`:

```dart
    test('tournament_review_closed: lista e push abrem as avaliações do organizador', () {
      final data = {
        'tournamentId': 't1',
        'url': '/organizer/tournaments/t1',
        'webUrl': '/painel/eventos/t1/avaliacoes',
      };
      final n = AthleteInboxNotification(
        id: 'c1',
        title: 'Avaliações do torneio Copa encerradas',
        body: '4,6 ★ com 23 avaliações.',
        type: 'tournament_review_closed',
        data: data,
        read: false,
        dismissed: false,
        createdAt: now,
      );
      final p = notificationPresentation(n);
      expect(p.routePath, '/organizer/tournaments/t1/reviews');
      expect(p.icon, Icons.star_rounded);
      expect(p.actions.single.label, 'Ver avaliações');
      expect(resolveNotificationRoute({...data, 'type': 'tournament_review_closed'}), p.routePath);
    });

    test('tournament_review_closed sem tournamentId: lista cai na url', () {
      final n = AthleteInboxNotification(
        id: 'c2',
        title: 'Avaliações encerradas',
        body: 'Body',
        type: 'tournament_review_closed',
        data: const {'url': '/organizer/tournaments/t1'},
        read: false,
        dismissed: false,
        createdAt: now,
      );
      expect(notificationPresentation(n).routePath, '/organizer/tournaments/t1');
    });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/core/notifications/notification_navigation_test.dart test/features/athlete/athlete_notifications_logic_test.dart`

Expected: duas falhas:
- `fechamento das avaliações (organizador) abre a tela de avaliações`: veio `/organizer/tournaments/t1`.
- O teste de lista e push do inbox: veio `/organizer/tournaments/t1`, com ícone de sino.

Os dois testes sem `tournamentId` (push e inbox) já **passam**, porque a `url` é traduzida hoje. Eles ficam como guarda de regressão do caso novo.

- [ ] **Step 3: Implementar**

Em `nexago_app/lib/core/notifications/notification_navigation.dart`, dentro de `resolveNotificationRoute`, logo depois do bloco `if (type == 'tournament_review_request' || type == 'tournament_review_reminder') { … }` e antes de `final url = appRouteForNotificationUrl(...)`:

```dart
  // Fechamento das avaliações (organizador): o `url` leva ao torneio no app ANTIGO, que não tem
  // a tela. Este build abre as avaliações direto — por isso o tipo vem antes da url.
  if (type == 'tournament_review_closed') {
    final closedTournamentId = (data['tournamentId'] as String?)?.trim() ?? '';
    if (closedTournamentId.isNotEmpty) {
      return AppRoutes.organizerTournamentReviews
          .replaceAll(':tournamentId', closedTournamentId);
    }
  }
```

Em `nexago_app/lib/features/athlete/domain/athlete_notifications_logic.dart`, dentro do `switch (type)` de `notificationPresentation`, logo antes de `default:`:

```dart
    case 'tournament_review_closed':
      // Mesmo destino do push: a tela de avaliações do organizador; sem id, a url do payload.
      final closedTournamentId = data['tournamentId'] ?? '';
      final closedRoutePath = closedTournamentId.isNotEmpty
          ? AppRoutes.organizerTournamentReviews
              .replaceAll(':tournamentId', closedTournamentId)
          : appRouteForNotificationUrl(data['url']);
      return AthleteNotificationPresentation(
        icon: Icons.star_rounded,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.15),
        actions: closedRoutePath == null
            ? const []
            : const [
                AthleteNotificationAction(
                  label: 'Ver avaliações',
                  kind: AthleteNotificationActionKind.primary,
                ),
              ],
        routePath: closedRoutePath,
      );
```

- [ ] **Step 4: Rodar e ver passar; analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/core/notifications/notification_navigation_test.dart test/features/athlete/athlete_notifications_logic_test.dart && flutter analyze lib/core/notifications/notification_navigation.dart lib/features/athlete/domain/athlete_notifications_logic.dart test/core/notifications/notification_navigation_test.dart test/features/athlete/athlete_notifications_logic_test.dart`

Expected: `All tests passed!` e `No issues found!`.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add nexago_app/lib/core/notifications/notification_navigation.dart nexago_app/lib/features/athlete/domain/athlete_notifications_logic.dart nexago_app/test/core/notifications/notification_navigation_test.dart nexago_app/test/features/athlete/athlete_notifications_logic_test.dart
git commit -m "feat(app): push e inbox de fechamento abrem as avaliações do torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task F: Verificação final, checagem visual do painel e PR

- [ ] **Step 1: App — suíte e análise**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter analyze lib/features/organizer lib/features/athlete lib/core/notifications lib/core/router && flutter test > /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/.superpowers/fase3-flutter.log 2>&1; tail -5 /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/.superpowers/fase3-flutter.log`

Expected:
- Nenhum issue nos arquivos tocados por esta fase. Issue em arquivo que esta fase não tocou já existia na base: anote no PR e não corrija aqui.
- Suíte inteira verde. Falha que já acontecia na base vai para o PR com o nome do teste.
- O log usa caminho absoluto, dentro de `.superpowers/` (ignorado pelo git). Com caminho relativo, o redirect cai em outra pasta.

Confira também que a rota foi registrada: `grep -n "AppRouteNames.organizerTournamentReviews" lib/core/router/app_router.dart` tem que achar uma linha.

- [ ] **Step 2: Painel — suíte completa e build de produção**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless && npx ng build organizer --configuration production`

Expected:
- `TOTAL: N SUCCESS`, sem `FAILED`.
- Build sem erro.
- Sem aviso de `anyComponentStyle` para `avaliacoes-torneio`, `reputacao` ou `torneio-detalhe` (orçamento de 24 kB de aviso). O `ng test` não aplica orçamento, então só o build prova.

- [ ] **Step 3: Checagem visual do painel com rota temporária (NÃO commitar)**

O painel não tem bypass de login. Siga o padrão de QA do projeto (memória `organizer-web-qa-harness-route`).

**Criar** `frontend/projects/organizer/src/app/painel/avaliacoes/__qa-avaliacoes.component.ts`. Ele monta as telas com dados fictícios, escolhidos por `?v=`:

```ts
import { ChangeDetectionStrategy, Component, effect, inject, viewChild, type WritableSignal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { EMPTY_TOURNAMENT_COLLECTED } from '../data/tournament-collected';
import type { AnonymousReview, OrganizerReputation, TournamentReviewSummary } from '../data/tournament-reviews';
import type { OrganizerTournament } from '../data/tournament.model';
import { TorneioDetalheComponent } from '../eventos/torneio-detalhe.component';
import { ReputacaoComponent } from '../reputacao/reputacao.component';
import { AvaliacoesTorneioComponent } from './avaliacoes-torneio.component';

type Seedable = Record<string, WritableSignal<unknown>>;

const SUMMARY: TournamentReviewSummary = {
  tournamentId: 't1',
  tournamentName: 'Copa Aurora de Beach Tennis',
  tournamentStartAt: new Date('2026-09-26T12:00:00Z'),
  status: 'open',
  eligibleCount: 42,
  count: 23,
  average: 4.62,
  distribution: { 1: 1, 2: 1, 3: 2, 4: 7, 5: 12 },
  aspects: {
    organization: { count: 20, average: 4.8 },
    schedule: { count: 18, average: 3.4 },
    refereeing: { count: 15, average: 4.1 },
    venue: { count: 19, average: 4.5 },
    prizes: { count: 12, average: 3.9 },
  },
  opensAt: new Date('2026-09-28T13:00:00Z'),
  closesAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
};

const REVIEWS: AnonymousReview[] = [
  { id: 'a', overall: 5, aspects: { organization: 5, venue: 5 }, comment: 'Organização impecável, quadras ótimas e tudo no horário que foi passado.', shuffleKey: 0.7 },
  { id: 'b', overall: 2, aspects: { schedule: 1 }, comment: 'Atrasou quase duas horas no sábado e ninguém avisou pelo app.', shuffleKey: 0.2 },
  { id: 'c', overall: 4, aspects: {}, comment: null, shuffleKey: 0.5 },
  { id: 'd', overall: 1, aspects: { prizes: 1, refereeing: 2 }, comment: 'Premiação prometida não foi entregue.\nArbitragem confusa na final.', shuffleKey: 0.1 },
];

@Component({
  selector: 'og-qa-avaliacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvaliacoesTorneioComponent, ReputacaoComponent, TorneioDetalheComponent],
  template: `
    @switch (v) {
      @case ('rep') {
        <og-reputacao />
      }
      @case ('kpi') {
        <og-torneio-detalhe />
      }
      @default {
        <og-avaliacoes-torneio />
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100dvh;
    }
  `,
})
export class QaAvaliacoesComponent {
  protected readonly v = inject(ActivatedRoute).snapshot.queryParamMap.get('v') ?? 'full';
  private readonly tab = viewChild(AvaliacoesTorneioComponent);
  private readonly rep = viewChild(ReputacaoComponent);
  private readonly detail = viewChild(TorneioDetalheComponent);

  constructor() {
    effect(() => {
      const tab = this.tab() as unknown as Seedable | undefined;
      if (!tab) return;
      // Depois dos efeitos da própria tela, que zeram tudo com `id` vazio.
      setTimeout(() => {
        tab['tournament'].set({ name: SUMMARY.tournamentName, status: 'concluido', endAt: new Date('2026-09-27T22:00:00Z') });
        if (this.v === 'empty') return;
        tab['summary'].set(this.v === 'collecting' ? { ...SUMMARY, count: 2, average: null, distribution: null, aspects: null } : SUMMARY);
        tab['reviews'].set(REVIEWS);
      });
    });
    effect(() => {
      const rep = this.rep() as unknown as Seedable | undefined;
      if (!rep) return;
      setTimeout(() => {
        const reputation: OrganizerReputation = { reviewsCount: 86, tournamentsRated: 5, average: 4.71, aspects: SUMMARY.aspects };
        rep['reputation'].set(reputation);
        rep['summaries'].set([
          SUMMARY,
          { ...SUMMARY, tournamentId: 't2', tournamentName: 'Etapa Setembro — Liga nexaGO com um nome bem comprido', tournamentStartAt: new Date('2026-09-12T12:00:00Z'), count: 2, eligibleCount: 30, average: null, aspects: null },
        ]);
        rep['reputationReady'].set(true);
        rep['summariesReady'].set(true);
      });
    });
    effect(() => {
      const detail = this.detail() as unknown as Seedable | undefined;
      if (!detail) return;
      setTimeout(() => {
        const t: OrganizerTournament = {
          id: 't1', name: SUMMARY.tournamentName, managerId: 'u1', sportLabel: 'Beach Tennis', sportId: 'beachTennis', coverUrl: null,
          status: 'concluido', visibility: 'publicListing', paymentMode: 'appPixCard', collected: EMPTY_TOURNAMENT_COLLECTED,
          startAt: null, endAt: null, city: 'Goiânia', location: null, categories: [], capacity: null, waitlistEnabled: true,
          leagueId: null, courts: [], courtsCount: 0,
          matchOps: { dayStart: '08:00', dayEnd: '22:00', defaultMatchDurationMin: 30, minRestBetweenMatchesMin: 30, dynamicRescheduleEnabled: false },
          bigScreen: null, uniformRequired: false, uniformNumberOnShirt: false, uniformNameOnShirt: false, sponsors: [], myRole: null,
        };
        detail['tournament'].set(t);
        detail['reviewSummary'].set(SUMMARY);
      });
    });
  }
}
```

**Registrar a rota** no **topo** do array de `frontend/projects/organizer/src/app/app.routes.ts`, sem guard:

```ts
  { path: '__qa-avaliacoes', loadComponent: () => import('./painel/avaliacoes/__qa-avaliacoes.component').then((m) => m.QaAvaliacoesComponent) },
```

**Subir:** `preview_start` com `name: "organizer-live"` (porta 4311, em `frontend/.claude/launch.json`).

**Conferir em 375px e em desktop:**
- `/__qa-avaliacoes?v=full`:
  - a média grande;
  - os dois cards lado a lado no desktop e empilhados no celular;
  - o filtro `Só 1–2★` funcionando;
  - comentário com quebra de linha;
  - os chips sem estourar a largura.
- `?v=collecting`: o texto da contagem e `Aberta até`.
- `?v=empty`: o texto de "terminou antes".
- `?v=rep`:
  - os KPIs;
  - a tabela alinhada no desktop;
  - abaixo de 720px, as colunas Data, Resposta e Mais fraco somem e viram a linha de meta debaixo do nome;
  - o nome comprido quebra sem empurrar as colunas.
- `?v=kpi`: cinco KPIs. No desktop, numa linha; abaixo de 1100px, em 2×2 + 1. O KPI `Avaliação 4,6 ★` fica legível.

Tire um screenshot de cada. Se o pane estiver escondido e o screenshot vier velho, meça pelo DOM com `javascript_tool` (memória `browser-pane-no-animation-frames`).

**Apagar** o componente e a rota. `git status` não pode mostrar nenhum dos dois, e `git diff --stat frontend/projects/organizer/src/app/app.routes.ts` tem que vir vazio em relação ao último commit.

- [ ] **Step 4: Nada fora do worktree e branch limpa**

Run:

```bash
git -C /Users/silviodionizio/Documents/projects/volley/nexago status --short | head
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && git status --short && git log --oneline claude/tournament-reviews-fase-2..HEAD
```

Expected:
- O checkout principal não ganhou nenhum arquivo desta fase.
- O worktree está limpo.
- Aparecem os commits do plano e de A1–A4 e B1–B5.

- [ ] **Step 5: PR**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422
git push -u origin claude/tournament-reviews-fase-3
gh pr create --title "Avaliação do torneio pelos atletas — fase 3 (organizador: painel e app)" --body "$(cat <<'EOF'
## O que entra

**Painel do organizador**
- Aba **Avaliações** no torneio (`/painel/eventos/:id/avaliacoes`), ao vivo:
  - média, taxa de resposta, janela e distribuição;
  - aspectos do mais fraco ao mais forte;
  - comentários anônimos com filtro `Só 1–2★`.
- Os estados sem resumo e com menos de 3 avaliações seguem a spec. Também entram dois estados que a spec não previa: "terminou, o pedido sai às 10h" e "cancelado".
- KPI **Avaliação** na visão geral do torneio (`4,6 ★` ou `—`) e atalho no telefone.
- Página **Reputação** (`/painel/reputacao`):
  - média geral, total e torneios avaliados;
  - aspectos somados;
  - tabela por torneio.

**App do organizador**
- Card **Avaliações** no hub do torneio, para todos menos o mesário. A visão geral citada na spec não tem entrada no app.
- Tela `/organizer/tournaments/:id/reviews` com o mesmo conteúdo e os mesmos estados da aba web.
- O push e o inbox `tournament_review_closed` abrem essa tela. Sem `tournamentId`, caem na `url`. O app antigo continua indo para o torneio.

Só leitura: nenhuma rule, índice ou function nova. Os comentários só são pedidos com 3+ avaliações, porque a rule nega antes disso.

## Testes
- **Painel:**
  - regras puras (parse, janela, estados vazios, ordem de aspectos, cards, KPI e tabela da reputação);
  - aba, KPI, menu, rotas e reputação.
  
  A suíte completa e o build de produção passam.
- **App:** modelos, regras, tela (estados e o provider de comentários não lido abaixo de 3), card no hub com navegação, push e inbox.
- Checagem visual do painel em 375px e desktop, com rota temporária que não foi commitada.

## Fica para depois
- **Ordem de lançamento.** A aba, o KPI e o card aparecem mesmo com a flag `appConfig/tournamentReviews` desligada. Nesse período, o texto "o pedido sai às 10h" promete algo que não acontece. O ideal é publicar o painel junto com a flag ou depois dela.
- Checagem visual no app com dados reais: precisa de um torneio com resumo no projeto DEV.
- Fase 4 (exibição pública) e fase 5 (backoffice).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Se o #536 ainda estiver aberto, acrescente `--base claude/tournament-reviews-fase-2` ao `gh pr create`.
