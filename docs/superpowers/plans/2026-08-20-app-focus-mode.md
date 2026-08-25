# Modo Focus no app + "todas as partidas do dia" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar o Modo Focus do portal do atleta para o app Flutter com paridade de quatro seções, e fazer partida sem horário aparecer na lista do dia nas duas superfícies.

**Architecture:** A regra do dia vira uma função pura com um parâmetro nomeado opcional, portada de forma idêntica em Dart e TypeScript. No app, o Focus é uma rota só (`/torneios/:tournamentId/focus`) com quatro seções num `IndexedStack`, domínio puro em `domain/focus/` e apresentação em `presentation/focus/`. Chave e Grupo embrulham widgets que já existem.

**Tech Stack:** Flutter/Dart, Riverpod, go_router, `flutter_test`; Angular 20 (signals, zoneless) + Karma no portal do atleta.

**Spec:** `docs/superpowers/specs/2026-08-20-app-focus-mode-design.md`

## Global Constraints

- Português nas strings de UI, inglês no código.
- Domínio é puro: nada em `lib/features/tournaments/domain/` importa `package:flutter/`.
- Retrocompatibilidade: assinaturas públicas existentes ganham parâmetro **nomeado opcional com
  default que preserva o comportamento atual**. Nenhum chamador existente é editado para compilar.
- Specs Angular exigem `provideZonelessChangeDetection()` no `TestBed`, senão NG0908.
- Status de partida no app usa `TournamentMatchStatus.isCompleted/isCanceled/...`, nunca
  comparação crua de string. Na web, `matchIsCompleted`/`matchIsCanceled` de
  `data/matches-repository`.
- `poolId` só é único DENTRO da categoria. Toda derivação de grupo filtra por categoria antes.
- Comando de teste Flutter: `flutter test <caminho>` a partir de `nexago_app/`.
- Comando de teste web: `npx ng test athlete --watch=false --browsers=ChromeHeadless` a partir de
  `frontend/`.
- Commits em português, no padrão do repo (`feat(app):`, `fix(athlete):`, `test(app):`).

## Mapa de arquivos

**Fase A — regra do dia**
- Modificar: `nexago_app/lib/features/tournaments/domain/tournament_detail_tabs_logic.dart`
- Modificar: `nexago_app/test/features/tournaments/tournament_detail_tabs_logic_test.dart`
- Modificar: `frontend/projects/athlete/src/app/tournaments/tournament-live.selectors.ts`
- Modificar: `frontend/projects/athlete/src/app/tournaments/tournament-live.selectors.spec.ts`
- Modificar: `frontend/projects/athlete/src/app/tournaments/tournament-live.store.ts`

**Fase B — domínio do Focus (app)**
- Criar: `domain/focus/focus_journey_logic.dart` + teste
- Criar: `domain/focus/focus_views_logic.dart` + teste
- Criar: `domain/focus/focus_now_state.dart` + teste
- Criar: `domain/focus/focus_providers.dart`

**Fase C — casca e seções (app)**
- Criar: `presentation/focus/focus_shell_page.dart`
- Criar: `presentation/focus/sections/focus_now_section.dart`
- Criar: `presentation/focus/sections/focus_journey_section.dart`
- Criar: `presentation/focus/sections/focus_group_section.dart`
- Criar: `presentation/focus/sections/focus_bracket_section.dart`
- Modificar: `lib/core/router/routes.dart`, `lib/core/router/app_router.dart`

**Fase D — entrada e aposentadoria**
- Criar: `domain/focus/focus_day_offer.dart` + teste
- Modificar: `lib/features/home/home_page.dart`
- Modificar: `presentation/tournament_detail_page.dart`, `domain/tournament_detail_tabs_logic.dart`
- Apagar: `presentation/tournament_today_page.dart`,
  `presentation/widgets/tournament_detail/tournament_detail_today_tab.dart`

---

## FASE A — A regra do dia

### Task 1: A regra do dia no app (domínio)

**Files:**
- Modify: `nexago_app/lib/features/tournaments/domain/tournament_detail_tabs_logic.dart:103-118`
- Test: `nexago_app/test/features/tournaments/tournament_detail_tabs_logic_test.dart:270-330`

**Interfaces:**
- Consumes: `TournamentMatch` (`scheduleTime`, `matchStartedAt`, `status`, `matchNumber`),
  `TournamentMatchStatus.isCompleted/isCanceled`.
- Produces:
  - `bool matchBelongsToDay(TournamentMatch match, DateTime reference, {required bool tournamentRunningToday})`
  - `List<TournamentMatch> myTournamentDayTimeline(List<TournamentMatch> matches, Set<String> myTeamIds, DateTime reference, {bool tournamentRunningToday = false})`

- [ ] **Step 1: Adicionar `matchStartedAt` ao helper de fixture do teste**

O helper `_match` (topo de `tournament_detail_tabs_logic_test.dart`) não expõe `matchStartedAt`.
Adicione o parâmetro e repasse:

```dart
TournamentMatch _match({
  String id = 'm1',
  String teamAId = 'a',
  String teamBId = 'b',
  String status = TournamentMatchStatus.scheduled,
  int matchNumber = 1,
  DateTime? scheduleTime,
  DateTime? matchStartedAt,
}) {
  return TournamentMatch(
    // ... campos existentes, inalterados ...
    scheduleTime: scheduleTime,
    matchStartedAt: matchStartedAt,
  );
}
```

- [ ] **Step 2: Escrever os testes que falham**

Adicione ao `group('myTournamentDayTimeline', ...)` existente, DEPOIS dos três testes atuais (que
seguem passando: o default do parâmetro novo é `false`):

```dart
    test('sem horário entra quando o torneio está rolando hoje', () {
      final matches = [
        _match(id: 'sem-horario', teamAId: 'meu', teamBId: 'y'),
      ];

      final timeline = myTournamentDayTimeline(
        matches,
        {'meu'},
        reference,
        tournamentRunningToday: true,
      );

      expect(timeline.map((m) => m.id), ['sem-horario']);
    });

    test('sem horário e encerrada fica fora — não há evidência de dia', () {
      final matches = [
        _match(
          id: 'encerrada',
          teamAId: 'meu',
          teamBId: 'y',
          status: TournamentMatchStatus.completed,
        ),
        _match(
          id: 'cancelada',
          teamAId: 'meu',
          teamBId: 'y',
          status: TournamentMatchStatus.canceled,
        ),
      ];

      expect(
        myTournamentDayTimeline(
          matches,
          {'meu'},
          reference,
          tournamentRunningToday: true,
        ),
        isEmpty,
      );
    });

    test('começou hoje entra mesmo agendada para ontem', () {
      final matches = [
        _match(
          id: 'atrasada',
          teamAId: 'meu',
          teamBId: 'y',
          status: TournamentMatchStatus.inProgress,
          scheduleTime: DateTime(2026, 8, 19, 18, 0),
          matchStartedAt: DateTime(2026, 8, 20, 9, 30),
        ),
      ];

      final timeline = myTournamentDayTimeline(matches, {'meu'}, reference);

      expect(timeline.map((m) => m.id), ['atrasada']);
    });

    test('âncora de outro dia não cai no caso do torneio rolando', () {
      final matches = [
        _match(
          id: 'ontem',
          teamAId: 'meu',
          teamBId: 'y',
          scheduleTime: DateTime(2026, 8, 19, 9, 0),
        ),
      ];

      expect(
        myTournamentDayTimeline(
          matches,
          {'meu'},
          reference,
          tournamentRunningToday: true,
        ),
        isEmpty,
      );
    });

    test('agendadas primeiro, sem horário no fim por matchNumber', () {
      final matches = [
        _match(id: 'sem-b', teamAId: 'meu', teamBId: 'y', matchNumber: 9),
        _match(
          id: 'com-horario',
          teamAId: 'meu',
          teamBId: 'y',
          scheduleTime: DateTime(2026, 8, 20, 15, 0),
        ),
        _match(id: 'sem-a', teamAId: 'meu', teamBId: 'y', matchNumber: 4),
      ];

      final timeline = myTournamentDayTimeline(
        matches,
        {'meu'},
        reference,
        tournamentRunningToday: true,
      );

      expect(timeline.map((m) => m.id), ['com-horario', 'sem-a', 'sem-b']);
    });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `flutter test test/features/tournaments/tournament_detail_tabs_logic_test.dart`
Expected: FAIL — `No named parameter with the name 'tournamentRunningToday'`.

- [ ] **Step 4: Implementar**

Em `tournament_detail_tabs_logic.dart`, adicione a função de predicado ANTES de
`myTournamentDayTimeline` e reescreva o filtro. Mantenha `_sameLocalDay` e `_byScheduleTime` como
estão:

```dart
/// Uma partida pertence ao dia de referência quando tem âncora de tempo nesse
/// dia — horário agendado OU início real —, ou quando não tem âncora nenhuma e
/// o torneio está rolando hoje.
///
/// As duas âncoras valem INDEPENDENTEMENTE, não em cascata: partida agendada
/// para ontem que só entrou em quadra hoje pertence a hoje também. Torneio que
/// atrasa e empurra jogo pro dia seguinte é rotina.
///
/// Ter âncora de outro dia é resposta definitiva: quem tem horário ou início
/// fora do dia NÃO cai no caso do torneio rolando. Sem isso, a partida de
/// ontem reapareceria hoje toda vez que o torneio ocupasse mais de um dia.
///
/// Sem âncora nenhuma exige partida em aberto: não existe evidência de que ela
/// pertence a hoje além da janela do torneio, e afirmar resultado de partida
/// sem dia conhecido é pior que omitir.
bool matchBelongsToDay(
  TournamentMatch match,
  DateTime reference, {
  required bool tournamentRunningToday,
}) {
  final scheduled = match.scheduleTime;
  final started = match.matchStartedAt;
  if (scheduled != null && _sameLocalDay(scheduled, reference)) return true;
  if (started != null && _sameLocalDay(started, reference)) return true;
  if (scheduled != null || started != null) return false;
  if (!tournamentRunningToday) return false;
  return !TournamentMatchStatus.isCompleted(match.status) &&
      !TournamentMatchStatus.isCanceled(match.status);
}

/// Minhas partidas do dia de referência, em ordem cronológica — a timeline
/// "Seu dia no torneio". As sem horário vão para o fim, por `matchNumber`.
///
/// `tournamentRunningToday` tem default `false` de propósito: preserva o
/// comportamento antigo para quem não sabe as datas do torneio.
List<TournamentMatch> myTournamentDayTimeline(
  List<TournamentMatch> matches,
  Set<String> myTeamIds,
  DateTime reference, {
  bool tournamentRunningToday = false,
}) {
  return matches
      .where(
        (m) =>
            (myTeamIds.contains(m.teamAId) || myTeamIds.contains(m.teamBId)) &&
            matchBelongsToDay(
              m,
              reference,
              tournamentRunningToday: tournamentRunningToday,
            ),
      )
      .toList()
    ..sort(_byScheduleTime);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `flutter test test/features/tournaments/tournament_detail_tabs_logic_test.dart`
Expected: PASS, incluindo os três testes antigos.

- [ ] **Step 6: Rodar a suíte de torneios inteira (nada mais pode ter quebrado)**

Run: `flutter test test/features/tournaments/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add nexago_app/lib/features/tournaments/domain/tournament_detail_tabs_logic.dart nexago_app/test/features/tournaments/tournament_detail_tabs_logic_test.dart
git commit -m "feat(app): partida sem horário entra na lista do dia quando o torneio está rolando"
```

---

### Task 2: A mesma regra na web

**Files:**
- Modify: `frontend/projects/athlete/src/app/tournaments/tournament-live.selectors.ts:99-103`
- Modify: `frontend/projects/athlete/src/app/tournaments/tournament-live.store.ts:99`
- Test: `frontend/projects/athlete/src/app/tournaments/tournament-live.selectors.spec.ts`

**Interfaces:**
- Consumes: `TournamentMatch` (`scheduleTime`, `matchStartedAt`, `status`), `matchIsCompleted`,
  `matchIsCanceled`, `isSameSaoPauloDay`, `byScheduleTime`, `eventDayOf`.
- Produces:
  - `matchBelongsToDay(m: TournamentMatch, reference: Date, tournamentRunningToday: boolean): boolean`
  - `myDayTimeline(matches, myTeamIds, reference, tournamentRunningToday = false): TournamentMatch[]`

- [ ] **Step 1: Escrever os testes que falham**

Adicione um `describe` novo em `tournament-live.selectors.spec.ts`. Use o helper de fixture que já
existe no arquivo (procure a função que monta `TournamentMatch` a partir de `Partial`); se ela não
aceitar `matchStartedAt`, acrescente o campo ao literal base dela.

```ts
describe('myDayTimeline — partidas sem horário', () => {
  const reference = new Date('2026-08-20T12:00:00-03:00');
  const mine = new Set(['meu']);

  it('sem horário entra quando o torneio está rolando hoje', () => {
    const matches = [match({ id: 'sem-horario', teamAId: 'meu', teamBId: 'y' })];
    expect(myDayTimeline(matches, mine, reference, true).map((m) => m.id)).toEqual(['sem-horario']);
  });

  it('sem horário fica fora quando o torneio não está rolando', () => {
    const matches = [match({ id: 'sem-horario', teamAId: 'meu', teamBId: 'y' })];
    expect(myDayTimeline(matches, mine, reference)).toEqual([]);
  });

  it('sem horário e encerrada ou cancelada fica fora', () => {
    const matches = [
      match({ id: 'fim', teamAId: 'meu', teamBId: 'y', status: 'completed' }),
      match({ id: 'cancel', teamAId: 'meu', teamBId: 'y', status: 'canceled' }),
    ];
    expect(myDayTimeline(matches, mine, reference, true)).toEqual([]);
  });

  it('começou hoje entra mesmo agendada para ontem', () => {
    const matches = [
      match({
        id: 'atrasada',
        teamAId: 'meu',
        teamBId: 'y',
        status: 'in progress',
        scheduleTime: new Date('2026-08-19T18:00:00-03:00'),
        matchStartedAt: new Date('2026-08-20T09:30:00-03:00'),
      }),
    ];
    expect(myDayTimeline(matches, mine, reference).map((m) => m.id)).toEqual(['atrasada']);
  });

  it('âncora de outro dia não cai no caso do torneio rolando', () => {
    const matches = [
      match({ id: 'ontem', teamAId: 'meu', teamBId: 'y', scheduleTime: new Date('2026-08-19T09:00:00-03:00') }),
    ];
    expect(myDayTimeline(matches, mine, reference, true)).toEqual([]);
  });

  it('agendadas primeiro, sem horário no fim por matchNumber', () => {
    const matches = [
      match({ id: 'sem-b', teamAId: 'meu', teamBId: 'y', matchNumber: 9 }),
      match({ id: 'com', teamAId: 'meu', teamBId: 'y', scheduleTime: new Date('2026-08-20T15:00:00-03:00') }),
      match({ id: 'sem-a', teamAId: 'meu', teamBId: 'y', matchNumber: 4 }),
    ];
    expect(myDayTimeline(matches, mine, reference, true).map((m) => m.id)).toEqual(['com', 'sem-a', 'sem-b']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (de `frontend/`): `npx ng test athlete --watch=false --browsers=ChromeHeadless`
Expected: FAIL — os casos novos retornam lista vazia ou o 4º parâmetro é rejeitado pelo TS.

- [ ] **Step 3: Implementar o selector**

Em `tournament-live.selectors.ts`, substitua `myDayTimeline` e adicione o predicado. Importe
`matchIsCanceled` de `../data/matches-repository` se ainda não estiver importado:

```ts
/**
 * Uma partida pertence ao dia de referência quando tem âncora de tempo nesse dia — horário
 * agendado OU início real —, ou quando não tem âncora nenhuma e o torneio está rolando hoje.
 *
 * As duas âncoras valem INDEPENDENTEMENTE, não em cascata: partida agendada pra ontem que só
 * entrou em quadra hoje pertence a hoje também. Ter âncora de outro dia, por outro lado, é
 * resposta definitiva — sem isso a partida de ontem reapareceria hoje em todo torneio de mais
 * de um dia.
 *
 * Sem âncora nenhuma exige partida em aberto: não há evidência de que ela é de hoje além da
 * janela do torneio, e afirmar resultado de partida sem dia conhecido é pior que omitir.
 */
export function matchBelongsToDay(m: TournamentMatch, reference: Date, tournamentRunningToday: boolean): boolean {
  if (m.scheduleTime != null && isSameSaoPauloDay(m.scheduleTime, reference)) return true;
  if (m.matchStartedAt != null && isSameSaoPauloDay(m.matchStartedAt, reference)) return true;
  if (m.scheduleTime != null || m.matchStartedAt != null) return false;
  if (!tournamentRunningToday) return false;
  return !matchIsCompleted(m) && !matchIsCanceled(m);
}

/** Minhas partidas do dia de referência, em ordem cronológica — a timeline "Seu dia no torneio".
 *  As sem horário vão pro fim, por `matchNumber` (ver `byScheduleTime`).
 *
 *  `tournamentRunningToday` tem default `false` de propósito: preserva o comportamento antigo
 *  pra quem não sabe as datas do torneio. */
export function myDayTimeline(
  matches: readonly TournamentMatch[],
  myTeamIds: ReadonlySet<string>,
  reference: Date,
  tournamentRunningToday = false,
): TournamentMatch[] {
  return myMatches(matches, myTeamIds)
    .filter((m) => matchBelongsToDay(m, reference, tournamentRunningToday))
    .sort(byScheduleTime);
}
```

- [ ] **Step 4: Ligar o store à janela do torneio**

Em `tournament-live.store.ts`, linha 99, o `dayTimeline` passa a informar se o torneio está
rolando. `eventDayOf` já é importado por `focus-shell.component.ts`; importe-o aqui de
`./tournament-days`:

```ts
  readonly dayTimeline = computed(() => {
    const t = this.tournament();
    // `eventDayOf` devolve null fora da janela do evento — e também quando o torneio não declara
    // as duas datas, caso em que a regra antiga (só agendadas) segue valendo.
    const running = eventDayOf(t?.startAt, t?.endAt, this.now()) != null;
    return myDayTimeline(this.matches(), this.myTeamIds(), this.now(), running);
  });
```

- [ ] **Step 5: Rodar e ver passar**

Run (de `frontend/`): `npx ng test athlete --watch=false --browsers=ChromeHeadless`
Expected: PASS.

- [ ] **Step 6: Verificar que o build do portal não quebrou**

Run (de `frontend/`): `npx ng build athlete --configuration production`
Expected: build conclui sem erro de tipo.

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/tournament-live.selectors.ts frontend/projects/athlete/src/app/tournaments/tournament-live.selectors.spec.ts frontend/projects/athlete/src/app/tournaments/tournament-live.store.ts
git commit -m "feat(athlete): partida sem horário entra na lista do dia quando o torneio está rolando"
```

---

### Task 3: O bloco "sem horário" na UI da web

**Files:**
- Modify: `frontend/projects/athlete/src/app/tournaments/focus/focus-views.ts` (`TimelineEntry`)
- Modify: `frontend/projects/athlete/src/app/tournaments/focus/now/focus-now.component.html`
- Test: `frontend/projects/athlete/src/app/tournaments/focus/focus-views.spec.ts`

**Interfaces:**
- Consumes: `TimelineEntry` da Task 2.
- Produces: `TimelineEntry.time` passa a ser `string | null` — `null` quando não há horário. O
  template desenha "—" no lugar do relógio e agrupa sob um cabeçalho.

- [ ] **Step 1: Escrever o teste que falha**

Em `focus-views.spec.ts`, no describe de `timelineOf`:

```ts
  it('partida sem horário entra com time nulo, no fim da lista', () => {
    const ctx = context({ matches, nextMatch: null });
    const entries = timelineOf(ctx, [semHorario]);
    expect(entries[0].time).toBeNull();
  });
```

(`semHorario` = fixture de partida do atleta com `scheduleTime: null`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx ng test athlete --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `timeLabelOf(null)` devolve string vazia, não `null`.

- [ ] **Step 3: Implementar**

Em `focus-views.ts`, mude a interface e o mapeamento:

```ts
export interface TimelineEntry {
  matchId: string;
  /** `null` quando a partida ainda não tem horário — o template desenha "—", nunca um relógio
   *  vazio, que na coluna do horário lê como bug. */
  time: string | null;
  // ... resto inalterado
}
```

e dentro de `timelineOf`, no literal do `map`:

```ts
      time: m.scheduleTime != null ? timeLabelOf(m.scheduleTime) : null,
```

- [ ] **Step 4: Ajustar o template**

Em `focus-now.component.html`, na linha do horário da timeline, troque a interpolação direta por:

```html
<span class="time">{{ entry.time ?? '—' }}</span>
```

E, acima do primeiro item sem horário, um cabeçalho de bloco. Localize o `@for` da timeline e
envolva com:

```html
@for (entry of timeline(); track entry.matchId; let i = $index) {
  @if (entry.time === null && (i === 0 || timeline()[i - 1].time !== null)) {
    <p class="timeline-divider">Sem horário definido</p>
  }
  <!-- item existente, inalterado -->
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx ng test athlete --watch=false --browsers=ChromeHeadless`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/focus/
git commit -m "feat(athlete): timeline do Agora mostra o bloco sem horário definido"
```

---

### Task 4: O bloco "sem horário" na UI do app e o empty state honesto

**Files:**
- Modify: `nexago_app/lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_today_tab.dart:56-120`
- Modify: `nexago_app/lib/features/tournaments/presentation/tournament_detail_page.dart:243`

**Interfaces:**
- Consumes: `myTournamentDayTimeline(..., tournamentRunningToday:)` da Task 1,
  `tournamentIsEventToday(tournament, now)` (já existe em `tournament_detail_tabs_logic.dart`).
- Produces: nada novo. Esta task é o consumo da regra na tela que existe hoje — a seção "Agora" da
  Fase C a substitui, mas até lá o comportamento tem que estar correto e visível.

- [ ] **Step 1: Passar a janela do torneio nos dois chamadores**

`TournamentDetailTodayTab` não recebe o `TournamentDetail` hoje. Adicione o parâmetro
`required bool tournamentRunningToday` ao construtor do widget e repasse:

```dart
        final mine = myTournamentDayTimeline(
          matches,
          athleteTeamIds,
          DateTime.now(),
          tournamentRunningToday: tournamentRunningToday,
        ).where((m) => !liveIds.contains(m.id)).toList();
```

Em `tournament_today_page.dart`, onde o widget é construído, calcule o valor a partir do detalhe do
torneio que a página já observa; se ela não observa, leia
`ref.watch(tournamentDetailProvider(tournamentId))` e passe
`tournamentIsEventToday(detail, DateTime.now())`, com `false` enquanto o provider carrega.

Em `tournament_detail_page.dart:243`, o mesmo valor entra na chamada que decide a aba:

```dart
        myTournamentDayTimeline(
          matches,
          athleteTeamIds,
          now,
          tournamentRunningToday: tournamentIsEventToday(tournament, now),
        ).isNotEmpty ||
```

- [ ] **Step 2: Separar as sem horário em bloco próprio**

Em `tournament_detail_today_tab.dart`, depois de montar `mine`:

```dart
        final scheduled = mine.where((m) => m.scheduleTime != null).toList();
        final unscheduled = mine.where((m) => m.scheduleTime == null).toList();
```

e no `ListView`, troque o bloco único de `mine` por:

```dart
            if (scheduled.isNotEmpty) ...[
              if (live.isNotEmpty) const SizedBox(height: AppSpacing.md),
              _TodaySectionHeader(
                label: 'SEU DIA NO TORNEIO',
                color: colors.onSurfaceMuted,
              ),
              for (final m in scheduled) cardOf(byId[m.id]!),
            ],
            if (unscheduled.isNotEmpty) ...[
              if (live.isNotEmpty || scheduled.isNotEmpty)
                const SizedBox(height: AppSpacing.md),
              _TodaySectionHeader(
                label: 'SEM HORÁRIO DEFINIDO',
                color: colors.onSurfaceMuted,
              ),
              for (final m in unscheduled) cardOf(byId[m.id]!),
            ],
```

- [ ] **Step 3: Reescrever o empty state**

O texto atual promete a regra antiga. Substitua:

```dart
            child: Text(
              'Nada acontecendo agora — seus jogos de hoje aparecem aqui, '
              'com ou sem horário definido.',
```

- [ ] **Step 4: Rodar análise e testes**

Run: `flutter analyze lib/features/tournaments/` e `flutter test test/features/tournaments/`
Expected: sem issues novos; testes passam.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments/
git commit -m "feat(app): Hoje separa o bloco sem horário definido e para de prometer agendamento"
```

---

## FASE B — Domínio do Focus no app

### Task 5: Porte de `focus-journey.ts` (a Trajetória)

**Files:**
- Create: `nexago_app/lib/features/tournaments/domain/focus/focus_journey_logic.dart`
- Test: `nexago_app/test/features/tournaments/focus/focus_journey_logic_test.dart`

**Interfaces:**
- Consumes: `TournamentMatch` (`round`, `matchNumber`, `matchType`, `poolId`, `isGroupMatch`,
  `winnerAdvanceMatchNumber`, `winnerId`, `sets`, `categoryId`), `TournamentMatchStatus`.
- Produces:
  - `List<int> knockoutRounds(List<TournamentMatch> matches, String categoryId)`
  - `double wonRoundsFloorOf(List<TournamentMatch> myKnockouts, Set<String> myTeamIds)` — usa
    `double.negativeInfinity` como piso vazio, espelhando o `-Infinity` do TS
  - `List<TournamentMatch> pendingKnockoutsOf(List<TournamentMatch> myKnockouts, Set<String> myTeamIds)`
  - `bool isFinalMatchTypeOf(TournamentMatch m)`
  - `List<TournamentMatch>? happyPathOf(List<TournamentMatch> matches, String categoryId, Set<String> myTeamIds)`
  - `int? winsToTitleOf(List<TournamentMatch> matches, String categoryId, Set<String> myTeamIds, {required bool isDoubleElimination})`

**Nota de assinatura:** o TS decide o formato inspecionando as partidas (`isDoubleElimination(matches)`
em `bracket-tree.ts`). O app não precisa dessa heurística — ele já tem
`isDoubleEliminationBracketFormat(String raw)` (`tournament_detail_logic.dart:252`), que lê o
`bracketFormat` declarado da categoria, que é a fonte autoritativa. Por isso o Dart recebe o
booleano pronto em vez de adivinhar: quem chama já sabe.
  - `TournamentNumbers tournamentNumbersOf(List<TournamentMatch> matches, Set<String> myTeamIds)`
  - classes `SetBar { String label; int mine; int theirs; }` e
    `TournamentNumbers { int matches, setsWon, setsLost, points, pointsAgainst; double pointsPerSet; List<SetBar> sets; }`

**ANTES DE COMEÇAR:** leia `frontend/projects/athlete/src/app/tournaments/focus/focus-journey.ts`
inteiro. Os comentários dele registram cinco rounds de review e quatro bugs distintos. O porte
copia **a lógica e os comentários**. Não "simplifique" nada: cada guarda existe porque um bug
passou por ela.

- [ ] **Step 1: Verificar que o app tem os campos de fiação**

Run: `grep -n "winnerAdvanceMatchNumber\|winnerAdvanceSlot\|matchType\|isGroupMatch" nexago_app/lib/features/tournaments/domain/tournament_match.dart`
Expected: os quatro campos existem. Se `winnerAdvanceMatchNumber` for `int?`, o porte usa
`int?` direto; se não existir, PARE e reporte — sem fiação não há caminho feliz e a Task muda.

- [ ] **Step 2: Escrever os testes que falham (bloco 1 — eliminação simples)**

Crie `test/features/tournaments/focus/focus_journey_logic_test.dart`. O helper de fixture precisa
espelhar o que `functions/src/category-bracket-builders.ts` grava — em especial: bye é partida
real com `teamBId: ''` e status `Scheduled`; a disputa de 3º lugar tem o MESMO `round` da final.

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_journey_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _ko({
  required String id,
  required int round,
  required int matchNumber,
  String teamAId = '',
  String teamBId = '',
  String status = TournamentMatchStatus.scheduled,
  String matchType = 'knockout',
  String? winnerId,
  int? winnerAdvanceMatchNumber,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'c1',
    round: round,
    matchType: matchType,
    poolId: '',
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: matchNumber,
    winnerId: winnerId,
    winnerAdvanceMatchNumber: winnerAdvanceMatchNumber,
  );
}

void main() {
  const meu = {'meu'};

  group('winsToTitleOf — eliminação simples', () {
    test('bye já consumido não ancora o caminho na 1ª rodada', () {
      // Chave de 6 duplas: o atleta tem bye na rodada 1 e está na FINAL.
      final matches = [
        _ko(id: 'bye', round: 1, matchNumber: 1, teamAId: 'meu', teamBId: ''),
        _ko(id: 'semi', round: 2, matchNumber: 5, teamAId: 'meu', teamBId: 'x',
            status: TournamentMatchStatus.completed, winnerId: 'meu'),
        _ko(id: 'final', round: 3, matchNumber: 7, teamAId: 'meu', teamBId: 'y',
            matchType: 'Final'),
      ];

      expect(winsToTitleOf(matches, 'c1', meu), 1);
    });

    test('3º lugar vencido não coroa campeão', () {
      // O gerador dá à disputa de 3º o MESMO round da final.
      final matches = [
        _ko(id: 'semi', round: 2, matchNumber: 5, teamAId: 'meu', teamBId: 'x',
            status: TournamentMatchStatus.completed, winnerId: 'x'),
        _ko(id: 'final', round: 3, matchNumber: 7, teamAId: 'x', teamBId: 'y',
            matchType: 'Final'),
        _ko(id: 'terceiro', round: 3, matchNumber: 8, teamAId: 'meu', teamBId: 'z',
            matchType: 'Third Place', status: TournamentMatchStatus.completed,
            winnerId: 'meu'),
      ];

      // Eliminado na semi: sem caminho pro título.
      expect(winsToTitleOf(matches, 'c1', meu), isNull);
    });

    test('campeão responde 0, não null', () {
      final matches = [
        _ko(id: 'final', round: 3, matchNumber: 7, teamAId: 'meu', teamBId: 'y',
            matchType: 'Final', status: TournamentMatchStatus.completed,
            winnerId: 'meu'),
      ];

      expect(winsToTitleOf(matches, 'c1', meu), 0);
    });

    test('chave não sorteada devolve null', () {
      expect(winsToTitleOf(const [], 'c1', meu), isNull);
    });
  });

  group('happyPathOf', () {
    test('caminha a fiação até a final', () {
      final matches = [
        _ko(id: 'quartas', round: 1, matchNumber: 1, teamAId: 'meu', teamBId: 'x',
            winnerAdvanceMatchNumber: 5),
        _ko(id: 'semi', round: 2, matchNumber: 5, winnerAdvanceMatchNumber: 7),
        _ko(id: 'final', round: 3, matchNumber: 7, matchType: 'Final'),
      ];

      final path = happyPathOf(matches, 'c1', meu);

      expect(path?.map((m) => m.id), ['quartas', 'semi', 'final']);
    });

    test('fiação que não desemboca na final devolve null', () {
      final matches = [
        _ko(id: 'quartas', round: 1, matchNumber: 1, teamAId: 'meu', teamBId: 'x',
            winnerAdvanceMatchNumber: 5),
        _ko(id: 'semi', round: 2, matchNumber: 5),
      ];

      expect(happyPathOf(matches, 'c1', meu), isNull);
    });

    test('fiação circular para em vez de girar pra sempre', () {
      final matches = [
        _ko(id: 'a', round: 1, matchNumber: 1, teamAId: 'meu', teamBId: 'x',
            winnerAdvanceMatchNumber: 2),
        _ko(id: 'b', round: 2, matchNumber: 2, winnerAdvanceMatchNumber: 1),
      ];

      expect(happyPathOf(matches, 'c1', meu), isNull);
    });
  });
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `flutter test test/features/tournaments/focus/focus_journey_logic_test.dart`
Expected: FAIL — arquivo `focus_journey_logic.dart` não existe.

- [ ] **Step 4: Portar o módulo**

Crie `lib/features/tournaments/domain/focus/focus_journey_logic.dart` traduzindo
`focus-journey.ts` função a função, **na mesma ordem e com os comentários traduzidos**. Notas de
tradução que não são óbvias:

- `-Infinity` → `double.negativeInfinity`; `wonRoundsFloorOf` devolve `double` e a comparação
  vira `m.round >= floor`.
- `sideOf(m, myTeamIds)` e `outcomeOf(m, myTeamIds)` e `isPending(m)` não existem em Dart ainda.
  Porte-os como privados neste arquivo **se** não existirem em
  `tournament_matches_logic.dart` — verifique primeiro com
  `grep -n "matchInvolvesAnyTeam\|winnerId" lib/features/tournaments/domain/tournament_matches_logic.dart`.
  `matchInvolvesAnyTeam` já cobre `sideOf != null`.
- `isPending` = nem `Completed` nem `Canceled` (usa `TournamentMatchStatus`).
- `[...new Set(rounds)].sort()` → `rounds.toSet().toList()..sort()`.
- `Math.max(...wonRounds)` → `wonRounds.reduce(max)` com guarda de lista vazia.
- `matchClosedSets(m)` → o equivalente do app é `m.sets` filtrando os sets fechados; confirme com
  `grep -n "class TournamentMatchSet" -A 10 lib/features/tournaments/domain/tournament_match_set.dart`.

- [ ] **Step 5: Rodar e ver passar**

Run: `flutter test test/features/tournaments/focus/focus_journey_logic_test.dart`
Expected: PASS.

- [ ] **Step 6: Escrever os testes de dupla eliminação e fazer passar**

```dart
  group('winsToTitleOf — dupla eliminação', () {
    test('quem caiu pra LB tem mais partidas pela frente que o invicto', () {
      // WB e LB numeram rodadas independentes: contar fases mentiria.
      final matches = [
        _ko(id: 'wb1', round: 1, matchNumber: 1, teamAId: 'meu', teamBId: 'x',
            status: TournamentMatchStatus.completed, winnerId: 'x',
            matchType: 'winners', winnerAdvanceMatchNumber: 5),
        _ko(id: 'lb1', round: 1, matchNumber: 3, teamAId: 'meu', teamBId: 'z',
            matchType: 'losers', winnerAdvanceMatchNumber: 6),
        _ko(id: 'lb2', round: 2, matchNumber: 6, matchType: 'losers',
            winnerAdvanceMatchNumber: 9),
        _ko(id: 'wbfinal', round: 2, matchNumber: 5, matchType: 'winners',
            winnerAdvanceMatchNumber: 9),
        _ko(id: 'grand', round: 3, matchNumber: 9, matchType: 'Grand Final'),
      ];

      expect(winsToTitleOf(matches, 'c1', meu), 3);
    });

    test('campeão com uma derrota no currículo responde 0', () {
      final matches = [
        _ko(id: 'wb1', round: 1, matchNumber: 1, teamAId: 'meu', teamBId: 'x',
            status: TournamentMatchStatus.completed, winnerId: 'x',
            matchType: 'winners'),
        _ko(id: 'grand', round: 3, matchNumber: 9, teamAId: 'meu', teamBId: 'x',
            matchType: 'Grand Final', status: TournamentMatchStatus.completed,
            winnerId: 'meu'),
      ];

      expect(winsToTitleOf(matches, 'c1', meu), 0);
    });
  });
```

Os testes deste bloco passam `isDoubleElimination: true`. Não porte a heurística de
`bracket-tree.ts`: quem chama em produção usa
`isDoubleEliminationBracketFormat(offer.bracketFormat)`, que já existe e lê o formato declarado da
categoria.

Run: `flutter test test/features/tournaments/focus/focus_journey_logic_test.dart`
Expected: PASS.

- [ ] **Step 7: Escrever os testes de `tournamentNumbersOf` e fazer passar**

```dart
  group('tournamentNumbersOf', () {
    test('conta só partidas encerradas e monta uma barra por set', () {
      // fixture com 1 partida encerrada de 2 sets, lado A do atleta
      final numbers = tournamentNumbersOf(matches, meu);
      expect(numbers.matches, 1);
      expect(numbers.sets.map((s) => s.label), ['P1 · S1', 'P1 · S2']);
    });
  });
```

Complete a fixture com sets reais do modelo do app. `pointsPerSet` arredonda a uma casa:
`(points / bars.length * 10).round() / 10`.

Run: `flutter test test/features/tournaments/focus/focus_journey_logic_test.dart`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add nexago_app/lib/features/tournaments/domain/focus/focus_journey_logic.dart nexago_app/test/features/tournaments/focus/focus_journey_logic_test.dart
git commit -m "feat(app): porta a Trajetória do Focus — caminho feliz e vitórias até o título"
```

---

### Task 6: Porte de `focus-views.ts` (as views do Agora e do Grupo)

**Files:**
- Create: `nexago_app/lib/features/tournaments/domain/focus/focus_views_logic.dart`
- Test: `nexago_app/test/features/tournaments/focus/focus_views_logic_test.dart`

**Interfaces:**
- Consumes: `focus_journey_logic.dart` (`knockoutRounds`), `tournament_group_standings_logic.dart`
  (`TournamentPoolStandingsRow`, `TournamentPoolStandingsGroup`).
- Produces:
  - classe `FocusViewContext` com: `List<TournamentMatch> matches` (**da categoria**, nunca do
    torneio), `Set<String> myTeamIds`, `String Function(String teamId, [String? fallback]) duoNameOf`,
    `bool Function(String teamId) isMyTeam`,
    `List<TournamentPoolStandingsRow> Function(String poolId) standingsOf`,
    `TournamentMatch? nextMatch`
  - `NextMatchView? nextMatchViewOf(FocusViewContext ctx, DateTime now)`
  - `List<TimelineEntry> timelineOf(FocusViewContext ctx, List<TournamentMatch> dayTimeline)`
  - `List<LiveRowView> liveRowsOf(FocusViewContext ctx, String? categoryId)`
  - `String? standingLineOf(FocusViewContext ctx, String teamId, String poolId)`
  - `QualificationNote? qualificationNoteOf(FocusViewContext ctx, String poolId, int qualifiersPerGroup, String? myTeamId)`
  - `TimelineEntry.time` é `String?` — `null` sem horário, igual à Task 3.

**NÃO porte `standingsViewOf` nem `lossesOf`.** O app já tem os dois:
`TournamentPoolStandingsRow` (`tournament_group_standings_logic.dart:26`) carrega exatamente os
mesmos campos que o `StandingRow` do TS — `rank`, `teamId`, `displayName`, `wins`, `losses`,
`setsWon`, `setsLost`, `points`, `qualifies`, `isAthleteTeam` — e `computePoolStandings` já os
monta. Portar seria uma segunda definição de classificação convivendo com a que as outras telas
usam, que é a classe de bug que este projeto já cometeu com "cancelada" e com o piso de rodadas.

- [ ] **Step 1: Escrever os testes que falham**

Cubra o que a doc do TS destaca como armadilha:

```dart
  group('timelineOf', () {
    test('devolve time nulo sem horário e marca a próxima', () {
      final proxima = _match(id: 'prox', teamAId: 'meu', teamBId: 'x',
          scheduleTime: DateTime(2026, 8, 20, 15, 0));
      final semHorario = _match(id: 'sem', teamAId: 'meu', teamBId: 'y');
      final ctx = _ctx(matches: [proxima, semHorario], nextMatch: proxima);

      final entries = timelineOf(ctx, [proxima, semHorario]);

      expect(entries[0].time, isNotNull);
      expect(entries[0].state, TimelineState.next);
      expect(entries[1].time, isNull);
    });
  });

  group('standingLineOf', () {
    test('devolve "1º do grupo · 2V 0D"', () {
      final ctx = _ctx(
        matches: const [],
        standings: {
          'A': [
            const TournamentPoolStandingsRow(
              rank: 1, teamId: 'meu', displayName: 'Eu e Fulano',
              wins: 2, losses: 0, setsWon: 4, setsLost: 1,
              points: 6, qualifies: true, isAthleteTeam: true,
            ),
          ],
        },
      );

      expect(standingLineOf(ctx, 'meu', 'A'), '1º do grupo · 2V 0D');
    });

    test('devolve null para time fora do grupo', () {
      final ctx = _ctx(matches: const [], standings: const {'A': []});
      expect(standingLineOf(ctx, 'ninguem', 'A'), isNull);
    });
  });

  group('qualificationNoteOf', () {
    test('com grupo em aberto, informa posição e o que falta — não afirma classificação', () {
      // 1 partida pendente no grupo: a nota fala de "faltam", nunca de "avançou".
      final ctx = _ctx(matches: _grupoComUmaPendente(), standings: _standings());

      final note = qualificationNoteOf(ctx, 'A', 2, 'meu');

      expect(note!.text, contains('Falta 1 partida no grupo'));
      expect(note.text, isNot(contains('avançou')));
      expect(note.tone, QualificationTone.neutral);
    });

    test('com grupo encerrado e classificado, afirma o avanço', () {
      final ctx = _ctx(matches: _grupoEncerrado(), standings: _standings());

      final note = qualificationNoteOf(ctx, 'A', 2, 'meu');

      expect(note!.text, contains('avançou'));
      expect(note.tone, QualificationTone.win);
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `flutter test test/features/tournaments/focus/focus_views_logic_test.dart`
Expected: FAIL — arquivo não existe.

- [ ] **Step 3: Portar**

Traduza `focus-views.ts` mantendo os comentários. O comentário mais importante de preservar é o de
`FocusViewContext.matches`: são as partidas **da categoria em foco**, porque `poolId` só é único
dentro dela e a versão com a lista do torneio fundia o Grupo A de categorias diferentes.

`DuoPlayer`/`duoPlayersOf` do TS servem ao avatar da dupla. Se o app não tiver equivalente pronto,
**omita `players` do `DuoView` nesta task** e anote no código — a seção Agora (Task 9) desenha o
nome, não os rostos, e portar o avatar é escopo separado.

- [ ] **Step 4: Rodar e ver passar**

Run: `flutter test test/features/tournaments/focus/focus_views_logic_test.dart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments/domain/focus/focus_views_logic.dart nexago_app/test/features/tournaments/focus/focus_views_logic_test.dart
git commit -m "feat(app): porta as views do Focus — próxima partida, timeline, grupo"
```

---

### Task 7: Os cinco estados do "Agora" e os providers da casca

**Files:**
- Create: `nexago_app/lib/features/tournaments/domain/focus/focus_now_state.dart`
- Create: `nexago_app/lib/features/tournaments/domain/focus/focus_providers.dart`
- Test: `nexago_app/test/features/tournaments/focus/focus_now_state_test.dart`

**Interfaces:**
- Consumes: `TournamentMatchesRepository.watchByTournament`, `athleteNextMatchProvider`,
  `tournamentDetailProvider`, `focus_views_logic.dart`.
- Produces:
  - `enum FocusNowState { called, live, next, pendingKnockout, idle }`
  - `FocusNowState focusNowStateOf(TournamentMatch? match, String? acknowledgedMatchId, {bool categoryHasPendingKnockout = false})`
  - `focusMatchesProvider(String tournamentId)` — `StreamProvider.family<List<TournamentMatch>, String>`
  - `focusCategoryIdProvider(String tournamentId)` — `Provider.family<String?, String>`
  - `focusAcknowledgedCallProvider` — `NotifierProvider<FocusAcknowledgedCall, String?>`

- [ ] **Step 1: Escrever os testes que falham**

```dart
void main() {
  group('focusNowStateOf', () {
    test('chamada vence "em quadra" — as duas coexistem no mesmo dado', () {
      // callMatchToCourt grava queueStatus on_court E status In Progress na MESMA escrita.
      final m = _match(
        id: 'm1',
        queueStatus: 'on_court',
        status: TournamentMatchStatus.inProgress,
      );

      expect(focusNowStateOf(m, null), FocusNowState.called);
    });

    test('reconhecida, a mesma partida passa a ser "em quadra"', () {
      final m = _match(
        id: 'm1',
        queueStatus: 'on_court',
        status: TournamentMatchStatus.inProgress,
      );

      expect(focusNowStateOf(m, 'm1'), FocusNowState.live);
    });

    test('sem partida, mata-mata pendente na categoria não é idle', () {
      expect(
        focusNowStateOf(null, null, categoryHasPendingKnockout: true),
        FocusNowState.pendingKnockout,
      );
    });

    test('sem partida e sem mata-mata pendente é idle', () {
      expect(focusNowStateOf(null, null), FocusNowState.idle);
    });
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `flutter test test/features/tournaments/focus/focus_now_state_test.dart`
Expected: FAIL — arquivo não existe.

- [ ] **Step 3: Implementar o estado**

```dart
/// Precedência do bloco principal do Agora.
///
/// "chamado" e "em quadra" COEXISTEM no dado: `callMatchToCourt` grava
/// `queueStatus: 'on_court'` e `status: In Progress` na MESMA escrita. Sem esta
/// ordem explícita, ou o alerta de chamada nunca aparece, ou nunca sai da tela.
/// O que o tira é o reconhecimento — que é só local: não existe callable para
/// avisar a mesa, e o rótulo ("Ok, estou indo") diz exatamente isso.
///
/// `idle` NÃO é "sem partida": a categoria pode ter mata-mata pendente cujo
/// slot ainda não tem o `teamId` do atleta até o `winnerAdvance` preencher.
FocusNowState focusNowStateOf(
  TournamentMatch? match,
  String? acknowledgedMatchId, {
  bool categoryHasPendingKnockout = false,
}) {
  if (match == null) {
    return categoryHasPendingKnockout
        ? FocusNowState.pendingKnockout
        : FocusNowState.idle;
  }
  if (match.queueStatus == 'on_court' && acknowledgedMatchId != match.id) {
    return FocusNowState.called;
  }
  if (TournamentMatchStatus.isInProgress(match.status)) {
    return FocusNowState.live;
  }
  return FocusNowState.next;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `flutter test test/features/tournaments/focus/focus_now_state_test.dart`
Expected: PASS.

- [ ] **Step 5: Escrever os providers**

Em `focus_providers.dart`. O reconhecimento mora aqui, e não no widget da seção, porque precisa
sobreviver à troca de seção dentro da casca:

```dart
/// Partidas do torneio em tempo real. `family` por torneio: as quatro seções
/// leem o MESMO provider, então o Riverpod mantém um listener só — é o que a
/// casca web precisou fazer à mão com `acquireLive`.
final focusMatchesProvider =
    StreamProvider.family<List<TournamentMatch>, String>((ref, tournamentId) {
  final repo = TournamentMatchesRepository(FirebaseFirestore.instance);
  return repo.watchByTournament(tournamentId);
});

/// A categoria em foco — a da próxima partida do atleta. Toda derivação de
/// grupo depende dela: `poolId` só é único DENTRO da categoria.
final focusCategoryIdProvider =
    Provider.family<String?, String>((ref, tournamentId) {
  final next = ref.watch(athleteNextMatchProvider).valueOrNull;
  if (next != null && next.tournamentId == tournamentId) {
    return next.match.categoryId;
  }
  return null;
});

/// Chamada de quadra já reconhecida. Sobrevive à troca de seção porque mora
/// na casca, não no estado do widget.
class FocusAcknowledgedCall extends Notifier<String?> {
  @override
  String? build() => null;

  void acknowledge(String matchId) => state = matchId;
}

final focusAcknowledgedCallProvider =
    NotifierProvider<FocusAcknowledgedCall, String?>(FocusAcknowledgedCall.new);
```

- [ ] **Step 6: Analisar**

Run: `flutter analyze lib/features/tournaments/domain/focus/`
Expected: sem issues.

- [ ] **Step 7: Commit**

```bash
git add nexago_app/lib/features/tournaments/domain/focus/ nexago_app/test/features/tournaments/focus/
git commit -m "feat(app): estados do Agora e providers da casca do Focus"
```

---

## FASE C — Casca e seções

### Task 8: A casca e a rota

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/focus/focus_shell_page.dart`
- Modify: `nexago_app/lib/core/router/routes.dart:390` (região das rotas de torneio)
- Modify: `nexago_app/lib/core/router/app_router.dart:1154` (irmã da rota `hoje`)
- Test: `nexago_app/test/features/tournaments/focus/focus_shell_page_test.dart`

**Interfaces:**
- Consumes: `focusMatchesProvider`, `focusCategoryIdProvider`, `tournamentDetailProvider`.
- Produces:
  - `AppRoutes.tournamentFocus = '/torneios/:tournamentId/focus'`
  - `AppRouteNames.tournamentFocus = 'tournamentFocus'`
  - `FocusShellPage({required String tournamentId, required FocusSection initialSection})`
  - `enum FocusSection { agora, trajetoria, grupo, chave }` com `label` e `slug`

- [ ] **Step 1: Escrever o widget test que falha**

```dart
  testWidgets('troca de seção mantém a casca e o × volta pra home',
      (tester) async {
    await tester.pumpWidget(_app(const FocusShellPage(
      tournamentId: 't1',
      initialSection: FocusSection.agora,
    )));
    await tester.pumpAndSettle();

    expect(find.text('Agora'), findsOneWidget);
    await tester.tap(find.text('Trajetória'));
    await tester.pumpAndSettle();

    expect(find.text('Trajetória'), findsOneWidget);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `flutter test test/features/tournaments/focus/focus_shell_page_test.dart`
Expected: FAIL — `FocusShellPage` não existe.

- [ ] **Step 3: Declarar rota e nome**

Em `routes.dart`, junto das outras rotas de torneio:

```dart
  /// Modo Focus: `/torneios/:tournamentId/focus?secao=agora|trajetoria|grupo|chave`
  static const String tournamentFocus = '/torneios/:tournamentId/focus';
```

e em `AppRouteNames`: `static const String tournamentFocus = 'tournamentFocus';`

- [ ] **Step 4: Implementar a casca**

`Scaffold` de tela cheia. Cabeçalho com nome do torneio, `Dia N de M` quando houver, categoria e
local; um `×` que faz `context.go(AppRoutes.home)`; uma barra das quatro seções; corpo em
`IndexedStack` para o estado de cada seção sobreviver à troca.

A seção vem de `?secao=`; valor desconhecido cai em `agora`.

- [ ] **Step 5: Registrar a rota**

Em `app_router.dart`, como irmã da rota `hoje`:

```dart
          GoRoute(
            path: 'focus',
            name: AppRouteNames.tournamentFocus,
            builder: (context, state) {
              final id = state.pathParameters['tournamentId']?.trim() ?? '';
              return FocusShellPage(
                tournamentId: id,
                initialSection: focusSectionFromSlug(
                  state.uri.queryParameters['secao'],
                ),
              );
            },
          ),
```

- [ ] **Step 6: Rodar e ver passar**

Run: `flutter test test/features/tournaments/focus/focus_shell_page_test.dart`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add nexago_app/lib/core/router/ nexago_app/lib/features/tournaments/presentation/focus/ nexago_app/test/features/tournaments/focus/
git commit -m "feat(app): casca do Modo Focus com as quatro seções numa rota só"
```

---

### Task 9: Seção "Agora"

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/focus/sections/focus_now_section.dart`
- Test: `nexago_app/test/features/tournaments/focus/focus_now_section_test.dart`

**Interfaces:**
- Consumes: `focusNowStateOf`, `nextMatchViewOf`, `timelineOf`, `liveRowsOf`,
  `myTournamentDayTimeline(..., tournamentRunningToday:)`, `focusAcknowledgedCallProvider`.
- Produces: `FocusNowSection({required String tournamentId})`.

- [ ] **Step 1: Escrever os testes que falham**

Monte o widget com `ProviderScope(overrides: [...])` sobrescrevendo `focusMatchesProvider` com um
`Stream.value(...)` de fixtures — não toque no Firestore.

```dart
  testWidgets('chamada de quadra mostra o alerta e o botão de reconhecer',
      (tester) async {
    final chamada = _match(
      id: 'm1',
      teamAId: 'meu',
      queueStatus: 'on_court',
      status: TournamentMatchStatus.inProgress,
    );

    await tester.pumpWidget(_scope(matches: [chamada]));
    await tester.pumpAndSettle();

    expect(find.text('Ok, estou indo'), findsOneWidget);
  });

  testWidgets('reconhecer recolhe o alerta e mostra a partida em quadra',
      (tester) async {
    final chamada = _match(
      id: 'm1',
      teamAId: 'meu',
      queueStatus: 'on_court',
      status: TournamentMatchStatus.inProgress,
    );

    await tester.pumpWidget(_scope(matches: [chamada]));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ok, estou indo'));
    await tester.pumpAndSettle();

    expect(find.text('Ok, estou indo'), findsNothing);
  });

  testWidgets('sem partida mas com mata-mata pendente não diz que acabou',
      (tester) async {
    // Slot da chave existe, mas ainda sem o teamId do atleta.
    final slot = _match(id: 'k1', teamAId: '', teamBId: '', isGroupMatch: false);

    await tester.pumpWidget(_scope(matches: [slot]));
    await tester.pumpAndSettle();

    expect(find.textContaining('chave'), findsWidgets);
  });

  testWidgets('timeline separa o bloco sem horário', (tester) async {
    final comHorario = _match(
      id: 'com',
      teamAId: 'meu',
      scheduleTime: DateTime.now().add(const Duration(hours: 2)),
    );
    final semHorario = _match(id: 'sem', teamAId: 'meu');

    await tester.pumpWidget(
      _scope(matches: [comHorario, semHorario], tournamentRunningToday: true),
    );
    await tester.pumpAndSettle();

    expect(find.text('SEM HORÁRIO DEFINIDO'), findsOneWidget);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `flutter test test/features/tournaments/focus/focus_now_section_test.dart`
Expected: FAIL — arquivo não existe.

- [ ] **Step 3: Implementar**

Ordem da tela: bloco principal (pelo estado) → "Seu dia no torneio" (timeline, com o divisor **SEM
HORÁRIO DEFINIDO** da Task 4) → "Ao vivo na sua categoria". Reuse `TournamentMatchCard` para os
itens; não desenhe um card novo.

O `pendingKnockout` sai de `hasPendingKnockout(matches, categoryId) &&
!eliminatedFromKnockout(matches, categoryId, myTeamIds)` — porte as duas de
`tournament-live.selectors.ts` para `focus_views_logic.dart` se ainda não existirem, com o
comentário sobre o atleta eliminado nas quartas.

- [ ] **Step 4: Rodar e ver passar**

Run: `flutter test test/features/tournaments/focus/focus_now_section_test.dart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments/presentation/focus/sections/focus_now_section.dart nexago_app/test/features/tournaments/focus/focus_now_section_test.dart
git commit -m "feat(app): seção Agora do Focus com os cinco estados"
```

---

### Task 10: Seção "Trajetória"

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/focus/sections/focus_journey_section.dart`
- Test: `nexago_app/test/features/tournaments/focus/focus_journey_section_test.dart`

**Interfaces:**
- Consumes: `winsToTitleOf`, `happyPathOf`, `tournamentNumbersOf`.
- Produces: `FocusJourneySection({required String tournamentId})`.

- [ ] **Step 1: Escrever os testes que falham**

```dart
  testWidgets('sem resposta do motor, a manchete some — não chuta',
      (tester) async {
    // Chave não sorteada: winsToTitleOf devolve null.
    await tester.pumpWidget(_scope(matches: const []));
    await tester.pumpAndSettle();

    expect(find.textContaining('do título'), findsNothing);
    expect(find.text('Caminho até a final'), findsNothing);
  });

  testWidgets('campeão mostra o título conquistado, não a manchete vazia',
      (tester) async {
    final finalVencida = _ko(
      id: 'final',
      round: 3,
      matchNumber: 7,
      teamAId: 'meu',
      teamBId: 'y',
      matchType: 'Final',
      status: TournamentMatchStatus.completed,
      winnerId: 'meu',
    );

    await tester.pumpWidget(_scope(matches: [finalVencida]));
    await tester.pumpAndSettle();

    expect(find.textContaining('Campeã'), findsOneWidget);
  });

  testWidgets('caminho até a final lista as partidas na ordem da fiação',
      (tester) async {
    final matches = [
      _ko(id: 'quartas', round: 1, matchNumber: 1, teamAId: 'meu',
          teamBId: 'x', winnerAdvanceMatchNumber: 5),
      _ko(id: 'semi', round: 2, matchNumber: 5, winnerAdvanceMatchNumber: 7),
      _ko(id: 'final', round: 3, matchNumber: 7, matchType: 'Final'),
    ];

    await tester.pumpWidget(_scope(matches: matches));
    await tester.pumpAndSettle();

    expect(find.text('Caminho até a final'), findsOneWidget);
    expect(find.textContaining('3 vitórias'), findsOneWidget);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `flutter test test/features/tournaments/focus/focus_journey_section_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Manchete (vitórias até o título) → "Caminho até a final" (a lista de `happyPathOf`) → números do
torneio (`tournamentNumbersOf`, com as barras por set).

**Quando o motor devolve `null`, a manchete e o caminho SOMEM.** Não desenhe placeholder, não
escreva "a definir", não chute contagem de fases. É a regra que a web já segue e o motivo está em
`focus_journey_logic.dart`.

- [ ] **Step 4: Rodar e ver passar**

Run: `flutter test test/features/tournaments/focus/focus_journey_section_test.dart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments/presentation/focus/sections/focus_journey_section.dart nexago_app/test/features/tournaments/focus/focus_journey_section_test.dart
git commit -m "feat(app): seção Trajetória do Focus"
```

---

### Task 11: Seção "Grupo"

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/focus/sections/focus_group_section.dart`
- Test: `nexago_app/test/features/tournaments/focus/focus_group_section_test.dart`

**Interfaces:**
- Consumes: `computePoolStandings`/`TournamentPoolStandingsGroup`
  (`tournament_group_standings_logic.dart`, já existentes — a seção **não** monta classificação
  própria), `qualificationNoteOf` (Task 6), `focusCategoryIdProvider`.
- Produces: `FocusGroupSection({required String tournamentId})`.

- [ ] **Step 1: Escrever o teste que falha**

O teste que trava o bug real da web:

```dart
  testWidgets('Grupo A da minha categoria não funde com o Grupo A das outras',
      (tester) async {
    // Duas categorias, as duas com poolId 'A' — é assim que o gerador grava:
    // os grupos são 'A', 'B', 'C'… em TODAS as categorias.
    final minhaCategoria = [
      _pool(id: 'c1-1', categoryId: 'c1', poolId: 'A', teamAId: 'meu', teamBId: 't2'),
      _pool(id: 'c1-2', categoryId: 'c1', poolId: 'A', teamAId: 't3', teamBId: 't4'),
    ];
    final outraCategoria = [
      _pool(id: 'c2-1', categoryId: 'c2', poolId: 'A', teamAId: 't5', teamBId: 't6'),
      _pool(id: 'c2-2', categoryId: 'c2', poolId: 'A', teamAId: 't7', teamBId: 't8'),
    ];

    await tester.pumpWidget(_scope(
      matches: [...minhaCategoria, ...outraCategoria],
      focusCategoryId: 'c1',
      myTeamIds: {'meu'},
    ));
    await tester.pumpAndSettle();

    // 4 duplas na minha chave de grupo, não 8.
    expect(find.byType(FocusStandingRow), findsNWidgets(4));
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `flutter test test/features/tournaments/focus/focus_group_section_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Tabela de classificação com a linha do atleta destacada, faixa de classificados até
`qualifiersPerGroup`, e a nota de qualificação abaixo. Filtre por categoria ANTES de agrupar por
`poolId`.

- [ ] **Step 4: Rodar e ver passar**

Run: `flutter test test/features/tournaments/focus/focus_group_section_test.dart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments/presentation/focus/sections/focus_group_section.dart nexago_app/test/features/tournaments/focus/focus_group_section_test.dart
git commit -m "feat(app): seção Grupo do Focus, filtrada pela categoria em foco"
```

---

### Task 12: Seção "Chave"

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/focus/sections/focus_bracket_section.dart`

**Interfaces:**
- Consumes: os widgets de chave que já existem (`tournament_bracket_page.dart`,
  `double_elimination_bracket_page.dart`) e `focusCategoryIdProvider`.
- Produces: `FocusBracketSection({required String tournamentId})`.

- [ ] **Step 1: Achar o widget reutilizável**

Run: `grep -n "class .*Bracket.*extends" nexago_app/lib/features/tournaments/presentation/*.dart nexago_app/lib/features/tournaments/presentation/widgets/**/*.dart`

Se o desenho da chave estiver acoplado à `Page` (com `Scaffold` próprio), extraia o corpo para um
widget sem `Scaffold` no MESMO commit e faça a página passar a usá-lo. Não duplique o desenho — é
a armadilha registrada no repo sobre arte compartilhada que precisa mudar junto.

- [ ] **Step 2: Implementar o wrapper**

A seção alimenta o widget extraído com a categoria em foco. Sem categoria resolvida, mostra a
mesma mensagem de "chave ainda não sorteada" que a tela solta já usa.

- [ ] **Step 3: Analisar e rodar a suíte**

Run: `flutter analyze lib/features/tournaments/` e `flutter test test/features/tournaments/`
Expected: sem issues; testes passam.

- [ ] **Step 4: Commit**

```bash
git add nexago_app/lib/features/tournaments/presentation/
git commit -m "feat(app): seção Chave do Focus reaproveitando o desenho existente"
```

---

## FASE D — Entrada automática e aposentadoria do "Hoje"

### Task 13: Entrada automática no dia de jogo

**Files:**
- Create: `nexago_app/lib/features/tournaments/domain/focus/focus_day_offer.dart`
- Modify: `nexago_app/lib/features/home/home_page.dart`
- Test: `nexago_app/test/features/tournaments/focus/focus_day_offer_test.dart`

**Interfaces:**
- Consumes: `athleteNextMatchProvider`, `nexagoEventDayKey` (`core/time/nexago_event_timezone.dart`).
- Produces:
  - `String focusOfferKey(String uid, DateTime now)` — `"$uid:${nexagoEventDayKey(now)}"`
  - `class FocusDayOffer extends Notifier<String?>` com
    `bool shouldOffer(String uid, DateTime now)` e `void markOffered(String uid, DateTime now)`
  - `focusDayOfferProvider`

- [ ] **Step 1: Escrever os testes que falham**

```dart
    test('oferece uma vez por dia por uid', () {
      final offer = FocusDayOffer();
      final now = DateTime(2026, 8, 20, 9);

      expect(offer.shouldOffer('u1', now), isTrue);
      offer.markOffered('u1', now);
      expect(offer.shouldOffer('u1', now), isFalse);
    });

    test('dia seguinte reoferece', () {
      final offer = FocusDayOffer();
      offer.markOffered('u1', DateTime(2026, 8, 20, 22));

      expect(offer.shouldOffer('u1', DateTime(2026, 8, 21, 8)), isTrue);
    });

    test('outro uid reoferece — troca de conta sem matar o app', () {
      final offer = FocusDayOffer();
      final now = DateTime(2026, 8, 20, 9);
      offer.markOffered('u1', now);

      expect(offer.shouldOffer('u2', now), isTrue);
    });

    test('a chave usa o dia do fuso do evento, não o do aparelho', () {
      // 23h em São Paulo ainda é o mesmo dia de evento; UTC já virou.
      final offer = FocusDayOffer();
      final noite = DateTime.utc(2026, 8, 21, 2); // 23h de 20/08 em SP
      offer.markOffered('u1', DateTime.utc(2026, 8, 20, 15));

      expect(offer.shouldOffer('u1', noite), isFalse);
    });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `flutter test test/features/tournaments/focus/focus_day_offer_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```dart
/// Trava da entrada automática, EM MEMÓRIA — nunca em disco.
///
/// Sem ela o atleta fica preso: o `×` devolve pra home, a home resolve o alvo
/// de novo e empurra o Focus outra vez, sem saída dentro do app.
///
/// Fica só em memória de propósito: matar e reabrir o app é gesto deliberado e
/// DEVE reoferecer — é o que "sempre abrir no dia de jogo" quer dizer.
/// Persistir isso mataria justamente esse caminho.
```

- [ ] **Step 4: Rodar e ver passar**

Run: `flutter test test/features/tournaments/focus/focus_day_offer_test.dart`
Expected: PASS.

- [ ] **Step 5: Engatar na home**

Em `home_page.dart`, num `ref.listen` sobre `athleteNextMatchProvider` (NÃO no `redirect` global do
router — ele é `async`, roda em toda navegação e brigaria com deep link e push):

```dart
    ref.listen(athleteNextMatchProvider, (_, next) {
      final target = next.valueOrNull;
      final uid = ref.read(authProvider).valueOrNull?.uid;
      if (target == null || uid == null) return;
      final offer = ref.read(focusDayOfferProvider.notifier);
      final now = DateTime.now();
      if (!offer.shouldOffer(uid, now)) return;
      offer.markOffered(uid, now);
      context.pushNamed(
        AppRouteNames.tournamentFocus,
        pathParameters: {'tournamentId': target.tournamentId},
      );
    });
```

- [ ] **Step 6: Verificar no app rodando**

Run: `flutter run` com uma conta que tenha inscrição paga em torneio do dia.
Expected: a home abre e empurra o Focus uma vez; o `×` volta pra home e NÃO reabre.

- [ ] **Step 7: Commit**

```bash
git add nexago_app/lib/features/tournaments/domain/focus/focus_day_offer.dart nexago_app/lib/features/home/home_page.dart nexago_app/test/features/tournaments/focus/focus_day_offer_test.dart
git commit -m "feat(app): Focus abre sozinho no dia de jogo, uma vez por processo"
```

---

### Task 14: Aposentar o "Hoje"

**Files:**
- Modify: `nexago_app/lib/features/tournaments/domain/tournament_detail_tabs_logic.dart:15-46`
- Modify: `nexago_app/lib/features/tournaments/presentation/tournament_detail_page.dart:320`
- Modify: `nexago_app/lib/core/router/app_router.dart:1154`
- Delete: `nexago_app/lib/features/tournaments/presentation/tournament_today_page.dart`
- Delete: `nexago_app/lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_today_tab.dart`
- Test: `nexago_app/test/features/tournaments/tournament_detail_tabs_logic_test.dart`

**Interfaces:**
- Produces: `visibleTournamentDetailTabs` perde o parâmetro `hasMyMatchToday`;
  `TournamentDetailTab.hoje` é removido do enum; `defaultTournamentDetailTab` passa a devolver
  sempre `visaoGeral` quando não há aba melhor.

- [ ] **Step 1: Atualizar os testes de abas**

Os testes que hoje afirmam a presença da aba "Hoje" passam a afirmar a ausência dela. Ajuste o
`group('visibleTournamentDetailTabs', ...)` inteiro.

- [ ] **Step 2: Rodar e ver falhar**

Run: `flutter test test/features/tournaments/tournament_detail_tabs_logic_test.dart`
Expected: FAIL.

- [ ] **Step 3: Remover a aba do domínio**

Tire `hoje` do enum `TournamentDetailTab`, o parâmetro `hasMyMatchToday` de
`visibleTournamentDetailTabs` e o ramo correspondente de `defaultTournamentDetailTab`.

- [ ] **Step 4: Trocar o card por um CTA de Focus**

Em `tournament_detail_page.dart:320`, o card que abria `/hoje` passa a abrir o Focus, e só aparece
quando o atleta tem partida hoje:

```dart
                    AppRouteNames.tournamentFocus,
```

com o rótulo **"Você joga hoje — entrar no Modo Focus"**.

- [ ] **Step 5: Transformar `/hoje` em redirect**

Em `app_router.dart`, a rota `hoje` perde o `builder` e ganha:

```dart
          GoRoute(
            path: 'hoje',
            name: AppRouteNames.tournamentToday,
            // Aposentada em favor do Modo Focus. A rota fica como redirect
            // porque o app é distribuído por loja e uma versão já instalada
            // continua resolvendo este caminho.
            redirect: (context, state) {
              final id = state.pathParameters['tournamentId']?.trim() ?? '';
              return '/torneios/$id/focus?secao=agora';
            },
          ),
```

- [ ] **Step 6: Apagar os arquivos mortos**

```bash
git rm nexago_app/lib/features/tournaments/presentation/tournament_today_page.dart nexago_app/lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_today_tab.dart
```

Remova os imports órfãos em `app_router.dart` e onde mais o analyzer apontar.

- [ ] **Step 7: Rodar tudo**

Run: `flutter analyze` e `flutter test`
Expected: sem issues; suíte inteira verde.

- [ ] **Step 8: Commit**

```bash
git add -A nexago_app/
git commit -m "refactor(app): aposenta a aba Hoje em favor do Modo Focus"
```

---

## Verificação final

- [ ] `flutter analyze` limpo em `nexago_app/`
- [ ] `flutter test` inteiro verde
- [ ] `npx ng test athlete --watch=false --browsers=ChromeHeadless` verde
- [ ] `npx ng build athlete --configuration production` conclui
- [ ] App rodando: dia de jogo empurra o Focus; `×` volta pra home e não reabre; as quatro seções
      trocam sem recarregar o listener; partida sem horário aparece no bloco próprio
