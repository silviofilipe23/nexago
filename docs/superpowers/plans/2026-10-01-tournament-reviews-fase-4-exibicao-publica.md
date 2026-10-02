# Avaliação do torneio — Fase 4 (exibição pública: app, portal e site) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quem abre a página de um torneio vê o que os atletas acharam dele, e quanto o organizador costuma ser bem avaliado:
- **Selo no topo:** "★ 4,6 · 23 avaliações", quando o torneio tem 3 ou mais avaliações.
- **Seção "Como os atletas avaliaram":** a média de cada aspecto que recebeu nota.
- **Nota do organizador:** "★ 4,7 (86 avaliações em 5 torneios)", na linha do organizador, em qualquer torneio cujo organizador tenha 3 ou mais avaliações no total.

**Architecture:** Tudo aqui só lê dados públicos:
- `tournamentReviewSummaries/{tid}`, com rule `read: if true`;
- `organizerReputation/{managerId}`, com rule `read: if true`;
- `public_profiles/{managerId}` (para o nome), com rule `read: if true`.

Nenhuma rule, índice ou function nova. Cada superfície tem sua cópia das regras puras de exibição (selo, nota do organizador, linhas de aspecto). Os textos são idênticos nas três.

As três partes não dependem umas das outras:
- **Parte A (app):** tasks A1–A3. Reaproveita o modelo e o provider do resumo criados na fase 3.
- **Parte B (portal do atleta):** tasks B1–B3.
- **Parte C (site):** tasks C1–C2.

Elas só se encontram na verificação final (F).

**Tech Stack:**
- **App:** Flutter 3.47 / Dart 3.11, flutter_riverpod 2.6 com providers manuais, cloud_firestore e `flutter_test`.
- **Portal do atleta:** Angular 20.3 zoneless, firebase 12 web SDK (`firebase/firestore`, com `onSnapshot`), Karma + Jasmine.
- **Site:** Angular 20 zoneless, só no navegador (sem SSR), Tailwind v4, `firebase/firestore/lite` (sem `onSnapshot`), Karma + Jasmine.

**Spec:** `docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md`, seção 5 ("Exibição pública"). Os docs estão descritos na seção 1. Os planos das fases 1 a 3 estão em `docs/superpowers/plans/2026-10-01-tournament-reviews-fase-{1,2,3}-*.md`.

## Global Constraints

**Branch**
- `claude/tournament-reviews-fase-4` sai de `claude/tournament-reviews-fase-3` (PR #537, ainda aberto).
- O PR vai contra a `main` se o #537 já estiver mergeado. Se não, vai contra `claude/tournament-reviews-fase-3`.

**Worktree**
- Edite sempre `<worktree> + <caminho relativo do repo>`.
- Antes de cada commit, rode `pwd && git branch --show-current` e confira a branch.
- Depois da primeira edição de cada parte, rode `git -C /Users/silviodionizio/Documents/projects/volley/nexago status --short`. O checkout principal tem que continuar limpo.

**Frontend no worktree**
- `frontend/node_modules` já é symlink para o checkout principal. Se sumir: `ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/frontend/node_modules <worktree>/frontend/node_modules`.
- Rode sempre com `cd <worktree>/frontend && …` no mesmo comando.
- Se a contagem de specs não subir depois de um spec novo, você está testando a árvore errada.

**Subagentes:** não use `haiku`. O piso é `sonnet`.

**Flutter**
- **Não rode `dart format`** em arquivo existente. Em arquivo novo, pode.
- `flutter analyze <arquivos tocados>` tem que sair limpo.
- Nada de `pumpAndSettle` com `CircularProgressIndicator` na tela. Use dois `pump()` depois de os streams fakes emitirem.

**Angular (portal e site)**
- Spec de componente precisa de `provideZonelessChangeDetection()`, e de `provideRouter([])` quando há `routerLink`.
- **Portal:** o `overview-tab.component.scss` já está perto do aviso de 12 kB. A seção nova é um componente próprio com estilo inline; o selo reaproveita a classe `.tdv-hero-tag`, sem CSS novo na aba.
- **Site:**
  - Só `firebase/firestore/lite`, via `liteDb` (`src/lib/firebase-lite.ts`). Nunca importe `firebase/firestore` completo.
  - Repositórios ficam em `src/lib/firestore/*.ts`; componentes não falam com o SDK.
  - Tailwind com tokens semânticos (`text-pending`, `bg-brand`…), nunca hex.

**Sem deploy** nem escrita em projeto Firebase. A flag `appConfig/tournamentReviews` continua desligada.

**Textos exatos**

| Onde | Texto |
|---|---|
| selo do torneio (spec) | `★ {média} · {count} avaliações` — ex.: `★ 4,6 · 23 avaliações` |
| seção (spec) | título `Como os atletas avaliaram`; no app o rótulo de seção é em caixa alta, `COMO OS ATLETAS AVALIARAM`, como os vizinhos `O TORNEIO` e `EXPLORAR O TORNEIO` |
| linha de aspecto | rótulo do aspecto + média (`4,8`) + barra com largura média ÷ 5 |
| aspectos, nesta ordem | `organization` Organização geral, `schedule` Cumprimento dos horários, `refereeing` Arbitragem / mesa, `venue` Estrutura do local, `prizes` Premiação e kit |
| nota do organizador (spec) | `★ {média} ({reviewsCount} avaliações em {n} torneios)`; com 1 torneio, `em 1 torneio` |
| linha do organizador, portal e site | `Organizado por {nome}`, com ` · ★ 4,7 (86 avaliações em 5 torneios)` quando há nota |
| linha do organizador, app | o card já tem o nome em destaque e `Organizador` embaixo; a nota entra nesse subtítulo: `Organizador · ★ 4,7 (86 avaliações em 5 torneios)` |
| média | uma casa decimal, com vírgula (`toFixed(1)` / `toStringAsFixed(1)` e troca `.` por `,`) |

**Regras**
- **Números públicos do torneio** = `count >= 3` **e** `average != null`. Abaixo disso: nem selo, nem seção.
- **A "torneio encerrado" da spec** vem do próprio resumo: ele só existe depois que a janela de avaliação abre. Não há checagem de status a mais.
- **A seção** só aparece com ao menos um aspecto com nota. Selo sem seção é válido.
- **Nota do organizador** = `reviewsCount >= 3` **e** `average != null`. Abaixo disso, a linha mostra só o nome.
- **Nome do organizador (portal e site):** de `public_profiles/{managerId}`, na ordem `fullName`, `name`, `nickname` (sem `@`). Sem nome, a linha inteira some.
- **Ao vivo:**
  - **App:** `StreamProvider` (atualiza sozinho).
  - **Portal:** `onSnapshot` no store do torneio.
  - **Site:** uma leitura por visita. O firestore-lite não tem `onSnapshot`, então recarregar a página traz os números novos.
- **Falha de leitura** nunca derruba a página. Selo, seção e linha simplesmente não aparecem.

**Desvios da spec (decididos aqui)**
- **Portal e site ganham uma linha "Organizado por {nome}"** que não existia. A spec supunha uma linha do organizador nas três superfícies, mas só o app tem uma. O dono decidiu criar a linha (01/10).
- **No app, a nota vai no subtítulo `Organizador`** do card que já existe, e não numa frase "Organizado por".
- **No site os números não atualizam ao vivo**, porque o firestore-lite não tem listener.

## Review Focus

1. **Resumo com `count < 3`, ou com `average` nulo.** Nada aparece: nem "★ —", nem seção vazia, nem "0 avaliações". Testes: A1, A2, B1, B3, C1, C2.
2. **Reputação abaixo de 3, organizador com 1 torneio avaliado e organizador sem perfil público:**
   - abaixo de 3, sem nota;
   - com 1 torneio, `em 1 torneio`;
   - no portal e no site, sem perfil público a linha some;
   - no app, sem reputação o subtítulo segue só `Organizador`.
   
   Testes: A1, A3, B1, C1.
3. **Troca de torneio no portal** (o store vive entre torneios). O selo, a nota e o nome do anterior não podem aparecer no seguinte, nem por um nome que chegue atrasado. Teste: B2.
4. **Leitura que falha no site** (rede, rule). A página do torneio segue normal, só sem selo, seção e linha. Os repositórios devolvem `null`; coberto pela regra pura e pela revisão do C1.
5. **Resumo com 3+ avaliações e nenhum aspecto avaliado.** O selo aparece e a seção não. Testes: A1, A2, B1, C1.

---

## Mapa de arquivos

**Parte A: app (`nexago_app/`)**

| Arquivo | Responsabilidade |
|---|---|
| `lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart` (modificar) | `OrganizerReputation` e o parse |
| `lib/features/organizer/data/organizer_tournament_reviews_repository.dart` (modificar) | `watchOrganizerReputation` |
| `lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart` (modificar) | `organizerReputationProvider` |
| `lib/features/tournaments/domain/tournament_review_public_logic.dart` (criar) | selo, nota do organizador, linhas de aspecto |
| `lib/features/tournaments/presentation/widgets/tournament_review/tournament_public_reviews_section.dart` (criar) | seção "Como os atletas avaliaram" |
| `lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_hero.dart` (modificar) | chip do selo |
| `lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_tournament_info_section.dart` (modificar) | nota no subtítulo do organizador |
| `lib/features/tournaments/presentation/tournament_detail_page.dart` (modificar) | liga tudo |
| testes em `test/features/organizer/` e `test/features/tournaments/` | |

**Parte B: portal do atleta (`frontend/projects/athlete/src/app/`)**

| Arquivo | Responsabilidade |
|---|---|
| `data/tournament-reviews.ts` (modificar) | regras puras da exibição pública |
| `data/tournament-reviews-repository.ts` (modificar) | leituras de resumo, reputação e nome |
| `data/public-tournament-reviews.source.ts` (criar) | camada injetável sobre as leituras, para o store ser testável |
| `tournaments/tournament-live.store.ts` (modificar) | `reviewSummary`, `organizerReputation`, `organizerName` |
| `tournaments/review/tournament-review-aspects.component.ts` (criar) | seção "Como os atletas avaliaram" |
| `tournaments/tabs/overview-tab.component.{ts,html}` (modificar) | selo no herói e seção na coluna lateral |
| `tournaments/tournament-shell.component.{ts,html,scss}` (modificar) | linha "Organizado por" no cabeçalho, visível em todas as abas |
| specs correspondentes | |

**Parte C: site (`frontend/projects/site/src/`)**

| Arquivo | Responsabilidade |
|---|---|
| `lib/tournament-reviews.ts` (criar) | regras puras (sem SDK) |
| `lib/firestore/tournament-reviews.ts` (criar) | leituras com firestore-lite |
| `lib/firestore/types.ts`, `lib/firestore/tournaments.ts` (modificar) | `managerId` no `TournamentDetail` |
| `app/pages/torneios/tournament-hero.ts` (modificar) | selo e linha do organizador no herói |
| `app/pages/torneios/tournament-review-aspects.ts` (criar) | seção "Como os atletas avaliaram" |
| `app/pages/torneios/torneio-detail.page.ts` (modificar) | leituras e ligação |
| specs correspondentes | |

**Comandos** (`<worktree>` = `/Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422`)
- **App, um teste:** `cd <worktree>/nexago_app && flutter test test/<caminho>_test.dart`
- **App, análise:** `cd <worktree>/nexago_app && flutter analyze <arquivos>`
- **Portal, um spec:** `cd <worktree>/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/<caminho>.spec.ts'`
- **Portal, build:** `cd <worktree>/frontend && npx ng build athlete --configuration production`
- **Site, um spec:** `cd <worktree>/frontend && npx ng test site --watch=false --browsers=ChromeHeadless --include='projects/site/src/<caminho>.spec.ts'`
- **Site, build:** `cd <worktree>/frontend && npx ng build site --configuration production`

---

# Parte A — App (Flutter)

### Task A1: Reputação do organizador e regras de exibição pública

**Files:**
- Modify: `nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart` (classe nova antes dos helpers privados)
- Modify: `nexago_app/lib/features/organizer/data/organizer_tournament_reviews_repository.dart`
- Modify: `nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart`
- Create: `nexago_app/lib/features/tournaments/domain/tournament_review_public_logic.dart`
- Test: `nexago_app/test/features/organizer/organizer_tournament_review_models_test.dart` (acrescentar)
- Test: `nexago_app/test/features/tournaments/tournament_review_public_logic_test.dart` (criar)

**Interfaces:**
- Consumes:
  - da fase 3: `TournamentReviewSummary` e `TournamentReviewAspectStat`;
  - também da fase 3: `kTournamentReviewMinPublic`, `tournamentReviewHasPublicNumbers`, `formatTournamentReviewAverage` e `tournamentReviewsCountLabel`;
  - da fase 2: `TournamentReviewAspect`.
- Produces:
  - **Modelo:** `OrganizerReputation({required int reviewsCount, required int tournamentsRated, double? average})`, com o parse `static OrganizerReputation? fromMap(Map<String, dynamic>? data)`.
  - **Repositório:** `Stream<OrganizerReputation?> OrganizerTournamentReviewsRepository.watchOrganizerReputation(String organizerId)`.
  - **Provider:** `organizerReputationProvider` (`StreamProvider.autoDispose.family<OrganizerReputation?, String>`).
  - **Rótulos:** `String? tournamentReviewBadgeLabel(TournamentReviewSummary? summary)` e `String? organizerReputationLabel(OrganizerReputation? reputation)`.
  - **Aspectos:** `class TournamentPublicAspectRow { aspect; average; label; valueText; fraction }` e `List<TournamentPublicAspectRow> tournamentPublicAspectRows(TournamentReviewSummary? summary)`.

- [ ] **Step 1: Escrever os testes que falham**

Em `nexago_app/test/features/organizer/organizer_tournament_review_models_test.dart`, acrescente um `group` no fim do `main`:

```dart
  group('OrganizerReputation.fromMap', () {
    test('lê a reputação gravada pelo servidor', () {
      final r = OrganizerReputation.fromMap({
        'organizerId': 'o1',
        'reviewsCount': 86,
        'tournamentsRated': 5,
        'average': 4.71,
      })!;
      expect(r.reviewsCount, 86);
      expect(r.tournamentsRated, 5);
      expect(r.average, 4.71);
    });

    test('abaixo de 3 a média vem nula; doc ausente vira null', () {
      final r = OrganizerReputation.fromMap({'reviewsCount': 2, 'tournamentsRated': 1, 'average': null})!;
      expect(r.average, isNull);
      expect(OrganizerReputation.fromMap(null), isNull);
    });
  });
```

`nexago_app/test/features/tournaments/tournament_review_public_logic_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_public_logic.dart';

void main() {
  TournamentReviewSummary summary({
    int count = 23,
    double? average = 4.62,
    Map<TournamentReviewAspect, TournamentReviewAspectStat>? aspects,
  }) =>
      TournamentReviewSummary(
        tournamentId: 't1',
        tournamentName: 'Copa Aurora',
        isOpen: false,
        eligibleCount: 42,
        count: count,
        average: average,
        aspects: aspects,
      );

  group('tournamentReviewBadgeLabel', () {
    test('com 3+ avaliações: estrela, uma casa com vírgula e a contagem', () {
      expect(tournamentReviewBadgeLabel(summary()), '★ 4,6 · 23 avaliações');
      expect(tournamentReviewBadgeLabel(summary(count: 3, average: 4)), '★ 4,0 · 3 avaliações');
    });

    test('abaixo de 3, sem média ou sem resumo: nada', () {
      expect(tournamentReviewBadgeLabel(summary(count: 2, average: null)), isNull);
      expect(tournamentReviewBadgeLabel(summary(average: null)), isNull);
      expect(tournamentReviewBadgeLabel(null), isNull);
    });
  });

  group('organizerReputationLabel', () {
    test('média, total e torneios', () {
      expect(
        organizerReputationLabel(
            const OrganizerReputation(reviewsCount: 86, tournamentsRated: 5, average: 4.71)),
        '★ 4,7 (86 avaliações em 5 torneios)',
      );
    });

    test('um torneio só fica no singular', () {
      expect(
        organizerReputationLabel(
            const OrganizerReputation(reviewsCount: 3, tournamentsRated: 1, average: 5)),
        '★ 5,0 (3 avaliações em 1 torneio)',
      );
    });

    test('abaixo de 3, sem média ou sem doc: nada', () {
      expect(
        organizerReputationLabel(
            const OrganizerReputation(reviewsCount: 2, tournamentsRated: 1, average: null)),
        isNull,
      );
      expect(
        organizerReputationLabel(
            const OrganizerReputation(reviewsCount: 9, tournamentsRated: 2, average: null)),
        isNull,
      );
      expect(organizerReputationLabel(null), isNull);
    });
  });

  group('tournamentPublicAspectRows', () {
    test('só aspectos com nota, na ordem da lista', () {
      final rows = tournamentPublicAspectRows(summary(aspects: const {
        TournamentReviewAspect.prizes: TournamentReviewAspectStat(count: 5, average: 3.4),
        TournamentReviewAspect.organization: TournamentReviewAspectStat(count: 20, average: 4.8),
      }));
      expect(rows.map((r) => r.aspect),
          [TournamentReviewAspect.organization, TournamentReviewAspect.prizes]);
      expect(rows.first.label, 'Organização geral');
      expect(rows.first.valueText, '4,8');
      expect(rows.first.fraction, closeTo(0.96, 1e-9));
    });

    test('sem números públicos ou sem aspecto avaliado: lista vazia', () {
      expect(
        tournamentPublicAspectRows(summary(count: 2, average: null, aspects: const {
          TournamentReviewAspect.venue: TournamentReviewAspectStat(count: 2, average: 4),
        })),
        isEmpty,
      );
      expect(tournamentPublicAspectRows(summary(aspects: const {})), isEmpty);
      expect(tournamentPublicAspectRows(summary()), isEmpty);
      expect(tournamentPublicAspectRows(null), isEmpty);
    });
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/organizer/organizer_tournament_review_models_test.dart test/features/tournaments/tournament_review_public_logic_test.dart`

Expected: falha de compilação. `OrganizerReputation` não está definido e `tournament_review_public_logic.dart` não existe.

- [ ] **Step 3: Implementar**

Em `nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart`, logo antes da linha `DateTime? _dateOf(Object? value) {`:

```dart
/// `organizerReputation/{organizerId}` — público. Soma todos os torneios do organizador, inclusive
/// os que ficaram com menos de 3. `average` vem nulo enquanto `reviewsCount < 3`.
class OrganizerReputation {
  const OrganizerReputation({
    required this.reviewsCount,
    required this.tournamentsRated,
    this.average,
  });

  final int reviewsCount;
  final int tournamentsRated;
  final double? average;

  static OrganizerReputation? fromMap(Map<String, dynamic>? data) {
    if (data == null) return null;
    return OrganizerReputation(
      reviewsCount: _countOf(data['reviewsCount']),
      tournamentsRated: _countOf(data['tournamentsRated']),
      average: _numOf(data['average']),
    );
  }
}

```

Em `nexago_app/lib/features/organizer/data/organizer_tournament_reviews_repository.dart`, dentro da classe, depois de `watchAnonymousReviews`:

```dart

  /// Reputação pública do organizador — `null` até a primeira avaliação de um torneio dele.
  Stream<OrganizerReputation?> watchOrganizerReputation(String organizerId) {
    final id = organizerId.trim();
    if (id.isEmpty) return Stream.value(null);
    return _firestore
        .collection('organizerReputation')
        .doc(id)
        .snapshots()
        .map((snap) => OrganizerReputation.fromMap(snap.data()));
  }
```

Em `nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart`, no fim:

```dart

/// Público: o detalhe do torneio (atleta) mostra a nota do organizador na linha dele.
final organizerReputationProvider =
    StreamProvider.autoDispose.family<OrganizerReputation?, String>((ref, organizerId) {
  return ref
      .watch(organizerTournamentReviewsRepositoryProvider)
      .watchOrganizerReputation(organizerId);
});
```

`nexago_app/lib/features/tournaments/domain/tournament_review_public_logic.dart`:

```dart
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_logic.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';

import 'tournament_review_models.dart';

/// Exibição pública da avaliação (spec §5): selo do torneio, seção por aspecto e a nota do
/// organizador. Tudo some abaixo de 3 avaliações — um selo de "estreante" seria injusto com quem
/// organizou antes de a feature existir.

/// "★ 4,6 · 23 avaliações", ou `null` sem números públicos.
String? tournamentReviewBadgeLabel(TournamentReviewSummary? summary) {
  if (summary == null || !tournamentReviewHasPublicNumbers(summary)) return null;
  return '★ ${formatTournamentReviewAverage(summary.average!)} · '
      '${tournamentReviewsCountLabel(summary.count)}';
}

/// "★ 4,7 (86 avaliações em 5 torneios)", ou `null` abaixo de 3 avaliações.
String? organizerReputationLabel(OrganizerReputation? reputation) {
  final average = reputation?.average;
  if (reputation == null ||
      average == null ||
      reputation.reviewsCount < kTournamentReviewMinPublic) {
    return null;
  }
  final tournaments = reputation.tournamentsRated == 1
      ? '1 torneio'
      : '${reputation.tournamentsRated} torneios';
  return '★ ${formatTournamentReviewAverage(average)} '
      '(${tournamentReviewsCountLabel(reputation.reviewsCount)} em $tournaments)';
}

class TournamentPublicAspectRow {
  const TournamentPublicAspectRow({required this.aspect, required this.average});

  final TournamentReviewAspect aspect;
  final double average;

  String get label => aspect.label;

  /// "4,8".
  String get valueText => formatTournamentReviewAverage(average);

  /// Largura da barra: média sobre 5.
  double get fraction => (average / 5).clamp(0.0, 1.0);
}

/// Barras da seção "Como os atletas avaliaram": só aspectos com nota, na ordem da lista.
List<TournamentPublicAspectRow> tournamentPublicAspectRows(TournamentReviewSummary? summary) {
  if (summary == null || !tournamentReviewHasPublicNumbers(summary)) return const [];
  final aspects = summary.aspects;
  if (aspects == null) return const [];
  return [
    for (final aspect in TournamentReviewAspect.values)
      if (aspects[aspect] case final stat?)
        TournamentPublicAspectRow(aspect: aspect, average: stat.average),
  ];
}
```

- [ ] **Step 4: Rodar e ver passar; analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/organizer/organizer_tournament_review_models_test.dart test/features/tournaments/tournament_review_public_logic_test.dart && flutter analyze lib/features/organizer/domain/tournament_reviews lib/features/organizer/data/organizer_tournament_reviews_repository.dart lib/features/tournaments/domain/tournament_review_public_logic.dart test/features/organizer/organizer_tournament_review_models_test.dart test/features/tournaments/tournament_review_public_logic_test.dart`

Expected: `All tests passed!` e `No issues found!`.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart nexago_app/lib/features/organizer/data/organizer_tournament_reviews_repository.dart nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart nexago_app/lib/features/tournaments/domain/tournament_review_public_logic.dart nexago_app/test/features/organizer/organizer_tournament_review_models_test.dart nexago_app/test/features/tournaments/tournament_review_public_logic_test.dart
git commit -m "feat(app): reputação do organizador e regras da avaliação pública

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A2: Seção "Como os atletas avaliaram"

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/widgets/tournament_review/tournament_public_reviews_section.dart`
- Test: `nexago_app/test/features/tournaments/tournament_public_reviews_section_test.dart`

**Interfaces:**
- Consumes: `tournamentReviewSummaryProvider` (fase 3) e `tournamentPublicAspectRows` (A1).
- Produces: `TournamentPublicReviewsSection({required String tournamentId})`, um `ConsumerWidget` que vira `SizedBox.shrink()` sem linhas.

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/tournaments/tournament_public_reviews_section_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_review/tournament_public_reviews_section.dart';

TournamentReviewSummary _summary({
  int count = 23,
  Map<TournamentReviewAspect, TournamentReviewAspectStat>? aspects = const {
    TournamentReviewAspect.organization: TournamentReviewAspectStat(count: 20, average: 4.8),
    TournamentReviewAspect.schedule: TournamentReviewAspectStat(count: 18, average: 3.4),
  },
}) =>
    TournamentReviewSummary(
      tournamentId: 't1',
      tournamentName: 'Copa Aurora',
      isOpen: false,
      eligibleCount: 42,
      count: count,
      average: count >= 3 ? 4.62 : null,
      aspects: count >= 3 ? aspects : null,
    );

Future<void> _pump(WidgetTester tester, TournamentReviewSummary? summary) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        tournamentReviewSummaryProvider('t1').overrideWith((ref) => Stream.value(summary)),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const Scaffold(
          body: SingleChildScrollView(child: TournamentPublicReviewsSection(tournamentId: 't1')),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('com 3+ avaliações mostra a média de cada aspecto, na ordem da lista', (tester) async {
    await _pump(tester, _summary());
    expect(find.text('COMO OS ATLETAS AVALIARAM'), findsOneWidget);
    expect(find.text('Organização geral'), findsOneWidget);
    expect(find.text('4,8'), findsOneWidget);
    expect(find.text('Cumprimento dos horários'), findsOneWidget);
    expect(find.text('3,4'), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Organização geral')).dy,
      lessThan(tester.getTopLeft(find.text('Cumprimento dos horários')).dy),
    );
  });

  testWidgets('abaixo de 3 avaliações não mostra nada', (tester) async {
    await _pump(tester, _summary(count: 2));
    expect(find.text('COMO OS ATLETAS AVALIARAM'), findsNothing);
  });

  testWidgets('3+ avaliações sem nenhum aspecto avaliado: sem seção', (tester) async {
    await _pump(tester, _summary(aspects: const {}));
    expect(find.text('COMO OS ATLETAS AVALIARAM'), findsNothing);
  });

  testWidgets('sem resumo (torneio por vir) não mostra nada', (tester) async {
    await _pump(tester, null);
    expect(find.text('COMO OS ATLETAS AVALIARAM'), findsNothing);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_public_reviews_section_test.dart`

Expected: falha de compilação, `Target of URI doesn't exist: '...tournament_public_reviews_section.dart'`.

- [ ] **Step 3: Implementar**

`nexago_app/lib/features/tournaments/presentation/widgets/tournament_review/tournament_public_reviews_section.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart';

import '../../../domain/tournament_review_public_logic.dart';

/// "Como os atletas avaliaram" no detalhe do torneio (spec §5): média de cada aspecto com nota.
/// Ao vivo enquanto a janela está aberta; some abaixo de 3 avaliações.
class TournamentPublicReviewsSection extends ConsumerWidget {
  const TournamentPublicReviewsSection({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(tournamentReviewSummaryProvider(tournamentId)).valueOrNull;
    final rows = tournamentPublicAspectRows(summary);
    if (rows.isEmpty) return const SizedBox.shrink();
    final muted = context.themeColors.onSurfaceMuted;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'COMO OS ATLETAS AVALIARAM',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: muted,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: muted.withValues(alpha: 0.12)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [for (final row in rows) _AspectBar(row: row)],
            ),
          ),
        ],
      ),
    );
  }
}

class _AspectBar extends StatelessWidget {
  const _AspectBar({required this.row});

  final TournamentPublicAspectRow row;

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
                child: Text(row.label, style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              Text(
                row.valueText,
                style: AppTypography.mono(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: row.fraction,
              minHeight: 6,
              color: AppColors.brand,
              backgroundColor: context.themeColors.surfaceCard,
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Rodar e ver passar; analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_public_reviews_section_test.dart && flutter analyze lib/features/tournaments/presentation/widgets/tournament_review/tournament_public_reviews_section.dart test/features/tournaments/tournament_public_reviews_section_test.dart`

Expected: `All tests passed!` e `No issues found!`.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add nexago_app/lib/features/tournaments/presentation/widgets/tournament_review/tournament_public_reviews_section.dart nexago_app/test/features/tournaments/tournament_public_reviews_section_test.dart
git commit -m "feat(app): seção Como os atletas avaliaram no detalhe do torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A3: Selo no herói, nota do organizador e ligação na página

**Files:**
- Modify: `nexago_app/lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_hero.dart` (construtor, campo e `Wrap` dos chips)
- Modify: `nexago_app/lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_tournament_info_section.dart` (construtor, campo e subtítulo `Organizador`)
- Modify: `nexago_app/lib/features/tournaments/presentation/tournament_detail_page.dart`, em três pontos:
  - imports;
  - `build` e `_buildContent` do `_TournamentDetailContentState`;
  - slivers.
- Test: `nexago_app/test/features/tournaments/tournament_detail_hero_test.dart` (acrescentar)
- Test: `nexago_app/test/features/tournaments/tournament_detail_tournament_info_section_test.dart` (criar)

**Interfaces:**
- Consumes:
  - de A1: `tournamentReviewBadgeLabel`, `organizerReputationLabel` e `organizerReputationProvider`;
  - de A2: `TournamentPublicReviewsSection`;
  - da fase 3: `tournamentReviewSummaryProvider`.
- Produces:
  - `TournamentDetailHero(..., String? reviewBadge)`;
  - `TournamentDetailTournamentInfoSection(..., String? organizerReputation)`.

- [ ] **Step 1: Escrever os testes que falham**

Em `nexago_app/test/features/tournaments/tournament_detail_hero_test.dart`, acrescente no fim do `main` (os helpers `buildTournament` e `stats` já existem no arquivo):

```dart
  testWidgets('selo de avaliação aparece junto dos chips quando há números públicos',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: TournamentDetailHero(
              tournament: buildTournament(TournamentListingStatus.completed),
              stats: stats,
              topInset: 0,
              toolbar: const SizedBox.shrink(),
              reviewBadge: '★ 4,6 · 23 avaliações',
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(find.text('★ 4,6 · 23 avaliações'), findsOneWidget);
  });

  testWidgets('sem selo não aparece nenhuma estrela no herói', (tester) async {
    await pumpHero(tester, TournamentListingStatus.completed);
    expect(find.textContaining('★'), findsNothing);
  });
```

`nexago_app/test/features/tournaments/tournament_detail_tournament_info_section_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_tournament_info_section.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  final tournament = TournamentDetail(
    id: 't1',
    name: 'Etapa Garden',
    location: 'Arena Garden',
    city: 'Goiânia, GO',
    dateLabel: '21/04',
    startDate: DateTime(2026, 4, 21),
    endDate: DateTime(2026, 4, 21),
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 90',
    priceValue: 90,
    spotsLeft: 20,
    spotsTotal: 80,
    status: TournamentListingStatus.completed,
    featured: false,
    enrolledCount: 60,
    liveMatchesNow: 0,
    leagueStageOrder: 1,
  );

  const stats = TournamentDetailStats(
    categoryCount: 3,
    openCategories: 2,
    spotsTotal: 80,
    spotsEnrolled: 60,
    prizeTotalLabel: r'R$ 13.500',
  );

  Future<void> pumpSection(WidgetTester tester, {String? organizerReputation}) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: SingleChildScrollView(
            child: TournamentDetailTournamentInfoSection(
              tournament: tournament,
              organizerName: 'Ana Organiza',
              stats: stats,
              organizerReputation: organizerReputation,
            ),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('com reputação, a nota entra no subtítulo do organizador', (tester) async {
    await pumpSection(tester, organizerReputation: '★ 4,7 (86 avaliações em 5 torneios)');
    expect(find.text('Ana Organiza'), findsOneWidget);
    expect(find.text('Organizador · ★ 4,7 (86 avaliações em 5 torneios)'), findsOneWidget);
  });

  testWidgets('sem reputação o subtítulo segue só "Organizador"', (tester) async {
    await pumpSection(tester);
    expect(find.text('Organizador'), findsOneWidget);
    expect(find.textContaining('★'), findsNothing);
  });
}
```

O `TournamentDetail` acima é o mesmo de `buildTournament` em `tournament_detail_hero_test.dart`. Se o construtor tiver ganhado campo obrigatório, copie de lá.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_detail_hero_test.dart test/features/tournaments/tournament_detail_tournament_info_section_test.dart`

Expected: falha de compilação. `No named parameter with the name 'reviewBadge'` e `'organizerReputation'`.

- [ ] **Step 3: Selo no herói**

Em `nexago_app/lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_hero.dart`:

1. **Construtor:** depois de `required this.toolbar,`, acrescente `this.reviewBadge,`.

2. **Campo:** depois de `final Widget toolbar;`:

```dart

  /// Selo "★ 4,6 · 23 avaliações" (spec §5) — `null` abaixo de 3 avaliações.
  final String? reviewBadge;
```

3. **`Wrap` dos chips:** depois do bloco `if (stageLabel.isNotEmpty) NexaStatusChip(…),` e antes do `],` que fecha o `children` do `Wrap`:

```dart
                                if (reviewBadge != null)
                                  NexaStatusChip(
                                    label: reviewBadge!,
                                    color: AppColors.brand,
                                    background: hasCover
                                        ? Colors.black.withValues(alpha: 0.42)
                                        : null,
                                    showDot: false,
                                  ),
```

- [ ] **Step 4: Nota no subtítulo do organizador**

Em `nexago_app/lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_tournament_info_section.dart`:

1. **Construtor:** depois de `required this.stats,`, acrescente `this.organizerReputation,`.

2. **Campo:** depois de `final TournamentDetailStats stats;`:

```dart

  /// "★ 4,7 (86 avaliações em 5 torneios)" (spec §5) — `null` abaixo de 3 avaliações.
  final String? organizerReputation;
```

3. **Subtítulo:** troque o `Text('Organizador', …)` do card do organizador por:

```dart
                      Text(
                        organizerReputation == null
                            ? 'Organizador'
                            : 'Organizador · $organizerReputation',
```

O `style:` que já estava no `Text` fica como está.

- [ ] **Step 5: Ligar na página**

Em `nexago_app/lib/features/tournaments/presentation/tournament_detail_page.dart`:

1. **Imports**, junto dos outros:

```dart
import '../../organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart';
import '../domain/tournament_review_public_logic.dart';
import 'widgets/tournament_review/tournament_public_reviews_section.dart';
```

2. **`build` do `_TournamentDetailContentState`:** os `watch` moram aqui, nunca no builder do `RebuildAt`. Logo depois do bloco que calcula `teamIdsByCategory`:

```dart
    // Avaliação pública (spec §5): selo no herói e nota do organizador na linha dele.
    final reviewSummary = ref
        .watch(tournamentReviewSummaryProvider(widget.tournament.id))
        .valueOrNull;
    final managerId = widget.tournament.managerId?.trim() ?? '';
    final organizerReputation = managerId.isEmpty
        ? null
        : ref.watch(organizerReputationProvider(managerId)).valueOrNull;
```

   Na chamada a `_buildContent(...)` dentro do `RebuildAt`, acrescente:

```dart
        reviewBadge: tournamentReviewBadgeLabel(reviewSummary),
        organizerReputation: organizerReputationLabel(organizerReputation),
```

3. **Assinatura de `_buildContent`:** depois de `required Set<String> athleteTeamIds,`, acrescente:

```dart
    required String? reviewBadge,
    required String? organizerReputation,
```

4. **Herói:** no `TournamentDetailHero(...)` dos slivers, depois de `toolbar: const SizedBox.shrink(),`, acrescente `reviewBadge: reviewBadge,`.

5. **Seção nova:** logo depois do `SliverToBoxAdapter` do `TournamentReviewCta` (antes do `TournamentDetailTournamentInfoSection`):

```dart
              SliverToBoxAdapter(
                child: TournamentPublicReviewsSection(
                  tournamentId: widget.tournament.id,
                ),
              ),
```

6. **Card do organizador:** no `TournamentDetailTournamentInfoSection(...)`, depois de `stats: widget.stats,`, acrescente `organizerReputation: organizerReputation,`.

- [ ] **Step 6: Rodar e ver passar; analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_detail_hero_test.dart test/features/tournaments/tournament_detail_tournament_info_section_test.dart test/features/tournaments/tournament_public_reviews_section_test.dart && flutter analyze lib/features/tournaments/presentation/tournament_detail_page.dart lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_hero.dart lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_tournament_info_section.dart test/features/tournaments/tournament_detail_hero_test.dart test/features/tournaments/tournament_detail_tournament_info_section_test.dart`

Expected: `All tests passed!` e `No issues found!`.

A ligação na página não tem teste de widget: nenhum teste do projeto monta a `TournamentDetailPage` inteira, que pede uma dezena de providers. O analisador garante os tipos. A revisão final confere os três pontos de ligação.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add nexago_app/lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_hero.dart nexago_app/lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_tournament_info_section.dart nexago_app/lib/features/tournaments/presentation/tournament_detail_page.dart nexago_app/test/features/tournaments/tournament_detail_hero_test.dart nexago_app/test/features/tournaments/tournament_detail_tournament_info_section_test.dart
git commit -m "feat(app): selo da avaliação e nota do organizador no detalhe do torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Parte B — Portal do atleta (Angular)

### Task B1: Regras puras da exibição pública

**Files:**
- Modify: `frontend/projects/athlete/src/app/data/tournament-reviews.ts` (acrescentar no fim)
- Test: `frontend/projects/athlete/src/app/data/tournament-reviews.spec.ts` (acrescentar)

**Interfaces:**
- Consumes: `TOURNAMENT_REVIEW_ASPECTS`, `TournamentReviewAspectKey`, `ASPECT_KEYS` e `text()`, todos do mesmo arquivo.
- Produces:
  - Constante: `MIN_PUBLIC_REVIEWS = 3`.
  - Tipos: `PublicReviewSummary { count; average; aspects }`, `OrganizerReputation { reviewsCount; tournamentsRated; average }`, `PublicAspectRow { key; label; value; pct }`.
  - Parse: `publicSummaryFromData(data)`, `organizerReputationFromData(data)`, `organizerNameFromData(data)`.
  - Formatação e rótulos: `formatRating(value)`, `reviewBadgeLabel(summary)`, `organizerReputationLabel(reputation)`, `organizerLine(name, reputation)`.
  - Aspectos: `publicAspectRows(summary)`.

- [ ] **Step 1: Escrever o spec que falha**

Em `frontend/projects/athlete/src/app/data/tournament-reviews.spec.ts`, acrescente no **fim do arquivo** (fora dos `describe` existentes):

```ts
describe('avaliação pública (resumo, reputação e organizador)', () => {
  it('lê o resumo público: média dos aspectos com nota, chave desconhecida fica de fora', () => {
    const s = publicSummaryFromData({
      count: 23,
      average: 4.62,
      aspects: { schedule: { count: 18, average: 3.4 }, bogus: { count: 1, average: 1 } },
    })!;
    expect(s).toEqual({ count: 23, average: 4.62, aspects: { schedule: 3.4 } });
    expect(publicSummaryFromData(undefined)).toBeNull();
    expect(publicSummaryFromData({ count: 2, average: null, aspects: null })).toEqual({ count: 2, average: null, aspects: {} });
  });

  it('lê a reputação do organizador', () => {
    expect(organizerReputationFromData({ reviewsCount: 86, tournamentsRated: 5, average: 4.71 })).toEqual({
      reviewsCount: 86,
      tournamentsRated: 5,
      average: 4.71,
    });
    expect(organizerReputationFromData(undefined)).toBeNull();
  });

  it('nome do organizador: nome completo, depois nome, depois apelido sem @', () => {
    expect(organizerNameFromData({ fullName: ' Ana Organiza ', nickname: '@ana' })).toBe('Ana Organiza');
    expect(organizerNameFromData({ name: 'Ana', nickname: '@ana' })).toBe('Ana');
    expect(organizerNameFromData({ nickname: '@ana' })).toBe('ana');
    expect(organizerNameFromData({})).toBeNull();
    expect(organizerNameFromData(undefined)).toBeNull();
  });

  it('selo: estrela, uma casa com vírgula e a contagem; nada abaixo de 3', () => {
    expect(reviewBadgeLabel({ count: 23, average: 4.62, aspects: {} })).toBe('★ 4,6 · 23 avaliações');
    expect(reviewBadgeLabel({ count: 3, average: 4, aspects: {} })).toBe('★ 4,0 · 3 avaliações');
    expect(reviewBadgeLabel({ count: 2, average: null, aspects: {} })).toBeNull();
    expect(reviewBadgeLabel({ count: 5, average: null, aspects: {} })).toBeNull();
    expect(reviewBadgeLabel(null)).toBeNull();
  });

  it('nota do organizador e a linha "Organizado por"', () => {
    const rep = { reviewsCount: 86, tournamentsRated: 5, average: 4.71 };
    expect(organizerReputationLabel(rep)).toBe('★ 4,7 (86 avaliações em 5 torneios)');
    expect(organizerReputationLabel({ reviewsCount: 3, tournamentsRated: 1, average: 5 })).toBe('★ 5,0 (3 avaliações em 1 torneio)');
    expect(organizerReputationLabel({ reviewsCount: 2, tournamentsRated: 1, average: null })).toBeNull();
    expect(organizerLine('Ana Organiza', rep)).toBe('Organizado por Ana Organiza · ★ 4,7 (86 avaliações em 5 torneios)');
    expect(organizerLine('Ana Organiza', null)).toBe('Organizado por Ana Organiza');
    expect(organizerLine(null, rep)).toBeNull();
  });

  it('aspectos: só os com nota, na ordem da lista; nada sem números públicos', () => {
    const rows = publicAspectRows({ count: 23, average: 4.62, aspects: { prizes: 3.4, organization: 4.8 } });
    expect(rows).toEqual([
      { key: 'organization', label: 'Organização geral', value: '4,8', pct: 96 },
      { key: 'prizes', label: 'Premiação e kit', value: '3,4', pct: 68 },
    ]);
    expect(publicAspectRows({ count: 2, average: null, aspects: { venue: 4 } })).toEqual([]);
    expect(publicAspectRows({ count: 23, average: 4.62, aspects: {} })).toEqual([]);
    expect(publicAspectRows(null)).toEqual([]);
  });

  it('formatRating usa vírgula', () => {
    expect(formatRating(4.62)).toBe('4,6');
  });
});
```

Acrescente ao `import` de `./tournament-reviews` no topo do spec:
- `formatRating`;
- `organizerLine`, `organizerNameFromData`, `organizerReputationFromData`, `organizerReputationLabel`;
- `publicAspectRows`, `publicSummaryFromData`;
- `reviewBadgeLabel`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/data/tournament-reviews.spec.ts'`

Expected: erro de compilação, `has no exported member 'publicSummaryFromData'` (e os outros).

- [ ] **Step 3: Implementar**

Acrescente no fim de `frontend/projects/athlete/src/app/data/tournament-reviews.ts`:

```ts

// ── Exibição pública (spec §5): selo do torneio, seção por aspecto e nota do organizador ─────

/** Abaixo disso nada é público: sem selo, sem seção, sem nota do organizador. */
export const MIN_PUBLIC_REVIEWS = 3;

/** `tournamentReviewSummaries/{id}`, só o que a exibição pública usa. */
export interface PublicReviewSummary {
  readonly count: number;
  readonly average: number | null;
  /** Média de cada aspecto que recebeu nota. */
  readonly aspects: Partial<Record<TournamentReviewAspectKey, number>>;
}

/** `organizerReputation/{uid}`. `average` vem nulo enquanto `reviewsCount < 3`. */
export interface OrganizerReputation {
  readonly reviewsCount: number;
  readonly tournamentsRated: number;
  readonly average: number | null;
}

export interface PublicAspectRow {
  readonly key: TournamentReviewAspectKey;
  readonly label: string;
  /** "4,8". */
  readonly value: string;
  /** Largura da barra: média sobre 5, em %. */
  readonly pct: number;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function decimal(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function publicSummaryFromData(data: Record<string, unknown> | undefined): PublicReviewSummary | null {
  if (!data) return null;
  const aspects: Partial<Record<TournamentReviewAspectKey, number>> = {};
  const raw = data['aspects'];
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const average = decimal((value as Record<string, unknown> | null)?.['average']);
      if (ASPECT_KEYS.includes(key) && average != null) aspects[key as TournamentReviewAspectKey] = average;
    }
  }
  return { count: count(data['count']), average: decimal(data['average']), aspects };
}

export function organizerReputationFromData(data: Record<string, unknown> | undefined): OrganizerReputation | null {
  if (!data) return null;
  return {
    reviewsCount: count(data['reviewsCount']),
    tournamentsRated: count(data['tournamentsRated']),
    average: decimal(data['average']),
  };
}

/** Nome do organizador em `public_profiles/{uid}`: nome completo antes do apelido. */
export function organizerNameFromData(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  return text(data['fullName']) || text(data['name']) || text(data['nickname']).replace(/^@/, '') || null;
}

/** Uma casa, vírgula — a mesma regra do push de fechamento e do painel do organizador. */
export function formatRating(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

function hasPublicNumbers(s: PublicReviewSummary): s is PublicReviewSummary & { average: number } {
  return s.count >= MIN_PUBLIC_REVIEWS && s.average != null;
}

/** "★ 4,6 · 23 avaliações", ou `null` sem números públicos. */
export function reviewBadgeLabel(s: PublicReviewSummary | null): string | null {
  return s && hasPublicNumbers(s) ? `★ ${formatRating(s.average)} · ${s.count} avaliações` : null;
}

/** "★ 4,7 (86 avaliações em 5 torneios)", ou `null` abaixo de 3 avaliações. */
export function organizerReputationLabel(r: OrganizerReputation | null): string | null {
  if (!r || r.average == null || r.reviewsCount < MIN_PUBLIC_REVIEWS) return null;
  const tournaments = r.tournamentsRated === 1 ? '1 torneio' : `${r.tournamentsRated} torneios`;
  return `★ ${formatRating(r.average)} (${r.reviewsCount} avaliações em ${tournaments})`;
}

/** Linha do cabeçalho do torneio. Sem nome não há linha — nota solta não diz de quem é. */
export function organizerLine(name: string | null, reputation: OrganizerReputation | null): string | null {
  if (!name) return null;
  const rating = organizerReputationLabel(reputation);
  return rating ? `Organizado por ${name} · ${rating}` : `Organizado por ${name}`;
}

/** Barras de "Como os atletas avaliaram": só aspectos com nota, na ordem da lista. */
export function publicAspectRows(s: PublicReviewSummary | null): PublicAspectRow[] {
  if (!s || !hasPublicNumbers(s)) return [];
  return TOURNAMENT_REVIEW_ASPECTS.flatMap((a) => {
    const average = s.aspects[a.key];
    return average == null ? [] : [{ key: a.key, label: a.label, value: formatRating(average), pct: Math.round((average / 5) * 100) }];
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo comando do Step 2.

Expected: `TOTAL: N SUCCESS`, sem `FAILED`.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add frontend/projects/athlete/src/app/data/tournament-reviews.ts frontend/projects/athlete/src/app/data/tournament-reviews.spec.ts
git commit -m "feat(atleta-web): regras da avaliação pública do torneio e do organizador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B2: Leituras públicas no store do torneio

**Files:**
- Modify: `frontend/projects/athlete/src/app/data/tournament-reviews-repository.ts` (acrescentar no fim)
- Create: `frontend/projects/athlete/src/app/data/public-tournament-reviews.source.ts`
- Modify: `frontend/projects/athlete/src/app/tournaments/tournament-live.store.ts`, em quatro pontos:
  - imports;
  - injeção;
  - signals;
  - dois `effect` no fim do construtor.
- Test: `frontend/projects/athlete/src/app/tournaments/tournament-live.store.spec.ts` (acrescentar e ajustar o teste existente)

**Interfaces:**
- Consumes: de B1, `publicSummaryFromData`, `organizerReputationFromData`, `organizerNameFromData`, `PublicReviewSummary` e `OrganizerReputation`; e `athleteFirestore()` (`data/firestore.ts`).
- Produces:
  - **Repositório:**
    - `watchPublicReviewSummary(db, tournamentId, onChange, onError?)`;
    - `watchOrganizerReputation(db, organizerId, onChange, onError?)`;
    - `fetchOrganizerName(db, organizerId): Promise<string | null>`.
  - **Serviço injetável:** `PublicTournamentReviewsSource` (`providedIn: 'root'`), com `watchSummary`, `watchReputation` e `fetchOrganizerName`.
  - **Store** (`TournamentLiveStore`): os signals `reviewSummary`, `organizerReputation` e `organizerName`.

- [ ] **Step 1: Escrever os specs que falham**

Em `frontend/projects/athlete/src/app/tournaments/tournament-live.store.spec.ts`:

1. **Imports:**

```ts
import type { TournamentSummary } from '../data/tournaments-repository';
import { PublicTournamentReviewsSource } from '../data/public-tournament-reviews.source';
import type { OrganizerReputation, PublicReviewSummary } from '../data/tournament-reviews';
```

2. **Teste existente** `'sem usuário não há convite nem avaliação própria'`: ele põe `tournamentId = 't1'`, e o resumo público agora abriria um listener de verdade. Acrescente aos `providers` dele:

```ts
      { provide: PublicTournamentReviewsSource, useValue: { watchSummary: () => () => undefined, watchReputation: () => () => undefined, fetchOrganizerName: () => Promise.resolve(null) } },
```

3. **`describe` novo**, no fim do arquivo:

```ts
describe('TournamentLiveStore — avaliação pública', () => {
  afterEach(() => TestBed.resetTestingModule());

  function torneio(id: string, managerId: string | null): TournamentSummary {
    return { id, name: 'Etapa', managerId, categories: [], startAt: null, endAt: null } as unknown as TournamentSummary;
  }

  /** Fonte falsa: guarda os callbacks para o teste emitir e registra cada `stop`. */
  function fakeSource() {
    const summaries = new Map<string, (s: PublicReviewSummary | null) => void>();
    const reputations = new Map<string, (r: OrganizerReputation | null) => void>();
    const stopped: string[] = [];
    const names = new Map<string, Promise<string | null>>();
    const value = {
      watchSummary: (id: string, cb: (s: PublicReviewSummary | null) => void) => {
        summaries.set(id, cb);
        return () => stopped.push(`summary:${id}`);
      },
      watchReputation: (id: string, cb: (r: OrganizerReputation | null) => void) => {
        reputations.set(id, cb);
        return () => stopped.push(`reputation:${id}`);
      },
      fetchOrganizerName: (id: string) => names.get(id) ?? Promise.resolve(null),
    };
    return { summaries, reputations, stopped, names, value };
  }

  function setup(source: ReturnType<typeof fakeSource>): TournamentLiveStore {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        TournamentLiveStore,
        { provide: AuthService, useValue: { user: signal(null) } },
        { provide: PublicTournamentReviewsSource, useValue: source.value },
      ],
    });
    return TestBed.inject(TournamentLiveStore);
  }

  const flush = () => new Promise<void>((resolve) => setTimeout(resolve));

  it('ouve o resumo do torneio e zera ao trocar de torneio', () => {
    const source = fakeSource();
    const store = setup(source);
    store.tournamentId.set('t1');
    TestBed.tick();
    source.summaries.get('t1')!({ count: 23, average: 4.62, aspects: {} });
    expect(store.reviewSummary()?.count).toBe(23);

    store.tournamentId.set('t2');
    TestBed.tick();
    expect(store.reviewSummary()).toBeNull();
    expect(source.stopped).toContain('summary:t1');
  });

  it('lê nome e reputação do organizador; outro organizador não herda os do anterior', async () => {
    const source = fakeSource();
    source.names.set('o1', Promise.resolve('Ana Organiza'));
    const store = setup(source);
    store.tournament.set(torneio('t1', 'o1'));
    TestBed.tick();
    await flush();
    source.reputations.get('o1')!({ reviewsCount: 86, tournamentsRated: 5, average: 4.71 });
    expect(store.organizerName()).toBe('Ana Organiza');
    expect(store.organizerReputation()?.reviewsCount).toBe(86);

    store.tournament.set(torneio('t2', 'o2'));
    TestBed.tick();
    expect(store.organizerName()).toBeNull();
    expect(store.organizerReputation()).toBeNull();
    expect(source.stopped).toContain('reputation:o1');
  });

  it('nome que chega depois da troca de organizador é descartado', async () => {
    const source = fakeSource();
    let resolveLate!: (name: string | null) => void;
    source.names.set('o1', new Promise((resolve) => (resolveLate = resolve)));
    const store = setup(source);
    store.tournament.set(torneio('t1', 'o1'));
    TestBed.tick();
    store.tournament.set(torneio('t2', 'o2'));
    TestBed.tick();
    resolveLate('Ana Organiza');
    await flush();
    expect(store.organizerName()).toBeNull();
  });

  it('mesmo organizador em outra leitura do torneio não reabre o listener', () => {
    const source = fakeSource();
    const store = setup(source);
    store.tournament.set(torneio('t1', 'o1'));
    TestBed.tick();
    store.tournament.set({ ...torneio('t1', 'o1'), name: 'Etapa renomeada' } as TournamentSummary);
    TestBed.tick();
    expect(source.stopped).not.toContain('reputation:o1');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/tournaments/tournament-live.store.spec.ts'`

Expected: erro de compilação, `Cannot find module '../data/public-tournament-reviews.source'`.

- [ ] **Step 3: Repositório**

Em `frontend/projects/athlete/src/app/data/tournament-reviews-repository.ts`:

1. **Import de `./tournament-reviews`:** acrescente `organizerNameFromData`, `organizerReputationFromData`, `publicSummaryFromData`, `type OrganizerReputation` e `type PublicReviewSummary`.

2. **No fim do arquivo:**

```ts

/** Resumo público do torneio, ao vivo — `null` até o job abrir a janela de avaliação. */
export function watchPublicReviewSummary(
  db: Firestore,
  tournamentId: string,
  onChange: (summary: PublicReviewSummary | null) => void,
  onError?: () => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'tournamentReviewSummaries', tournamentId),
    (snap) => onChange(snap.exists() ? publicSummaryFromData(snap.data()) : null),
    () => onError?.(),
  );
}

/** Reputação pública do organizador, ao vivo. */
export function watchOrganizerReputation(
  db: Firestore,
  organizerId: string,
  onChange: (reputation: OrganizerReputation | null) => void,
  onError?: () => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'organizerReputation', organizerId),
    (snap) => onChange(snap.exists() ? organizerReputationFromData(snap.data()) : null),
    () => onError?.(),
  );
}

/** Nome do organizador em `public_profiles` (leitura pública). Falha vira `null`: sem linha. */
export async function fetchOrganizerName(db: Firestore, organizerId: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'public_profiles', organizerId));
    return snap.exists() ? organizerNameFromData(snap.data()) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Camada injetável**

`frontend/projects/athlete/src/app/data/public-tournament-reviews.source.ts`:

```ts
import { Injectable } from '@angular/core';
import type { Unsubscribe } from 'firebase/firestore';
import { athleteFirestore } from './firestore';
import type { OrganizerReputation, PublicReviewSummary } from './tournament-reviews';
import { fetchOrganizerName, watchOrganizerReputation, watchPublicReviewSummary } from './tournament-reviews-repository';

/** Leituras públicas da avaliação: resumo do torneio, reputação e nome do organizador. Existe só
 *  para o `TournamentLiveStore` ser testável sem Firestore de verdade (mesmo papel do
 *  `TournamentReviewSubmitter`). Erro de leitura vira `null` — a página segue sem o selo. */
@Injectable({ providedIn: 'root' })
export class PublicTournamentReviewsSource {
  watchSummary(tournamentId: string, onChange: (summary: PublicReviewSummary | null) => void): Unsubscribe {
    const db = athleteFirestore();
    if (!db) return () => undefined;
    return watchPublicReviewSummary(db, tournamentId, onChange, () => onChange(null));
  }

  watchReputation(organizerId: string, onChange: (reputation: OrganizerReputation | null) => void): Unsubscribe {
    const db = athleteFirestore();
    if (!db) return () => undefined;
    return watchOrganizerReputation(db, organizerId, onChange, () => onChange(null));
  }

  fetchOrganizerName(organizerId: string): Promise<string | null> {
    const db = athleteFirestore();
    return db ? fetchOrganizerName(db, organizerId) : Promise.resolve(null);
  }
}
```

- [ ] **Step 5: Store**

Em `frontend/projects/athlete/src/app/tournaments/tournament-live.store.ts`:

1. **Imports:**
   - acrescente a linha nova `import { PublicTournamentReviewsSource } from '../data/public-tournament-reviews.source';`;
   - no import de `../data/tournament-reviews`, acrescente `type OrganizerReputation` e `type PublicReviewSummary`.

2. **Injeção:** depois de `private readonly destroyRef = inject(DestroyRef);`:

```ts
  private readonly publicReviews = inject(PublicTournamentReviewsSource);
```

3. **Signals:** depois de `readonly myReviewStatus = signal<MyReviewStatus>('idle');`:

```ts
  /** Resumo público da avaliação (`tournamentReviewSummaries/{id}`), ao vivo — selo e seção. */
  readonly reviewSummary = signal<PublicReviewSummary | null>(null);
  /** Reputação pública do organizador do torneio, ao vivo. */
  readonly organizerReputation = signal<OrganizerReputation | null>(null);
  /** Nome do organizador (`public_profiles/{managerId}`) — `null` esconde a linha. */
  readonly organizerName = signal<string | null>(null);
  /** Computed para o efeito do organizador não reabrir a cada `tournament.set` do mesmo dono. */
  private readonly managerId = computed(() => this.tournament()?.managerId ?? null);
```

4. **Efeitos:** no fim do construtor, depois do `effect` que chama `reloadMyReview`:

```ts

    // Avaliação pública (spec §5): resumo do torneio ao vivo. O doc é público — não depende de
    // login. Zera na troca de torneio para o selo do anterior não aparecer aqui.
    effect((onCleanup) => {
      const tournamentId = this.tournamentId();
      this.reviewSummary.set(null);
      if (!tournamentId) return;
      onCleanup(this.publicReviews.watchSummary(tournamentId, (summary) => this.reviewSummary.set(summary)));
    });

    // Organizador do torneio: nome (uma leitura) e reputação (ao vivo). O nome que chegar depois
    // de trocar de organizador é descartado.
    effect((onCleanup) => {
      const organizerId = this.managerId();
      this.organizerReputation.set(null);
      this.organizerName.set(null);
      if (!organizerId) return;
      let active = true;
      const stop = this.publicReviews.watchReputation(organizerId, (reputation) => this.organizerReputation.set(reputation));
      void this.publicReviews.fetchOrganizerName(organizerId).then((name) => {
        if (active) this.organizerName.set(name);
      });
      onCleanup(() => {
        active = false;
        stop();
      });
    });
```

- [ ] **Step 6: Rodar e ver passar**

Run: o mesmo comando do Step 2.

Expected: `TOTAL: N SUCCESS`, sem `FAILED`.

Depois rode também os specs que montam o store de verdade:

`cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/tournaments/tournament-default-cover.spec.ts'`

Expected: verde. Esses specs deixam `tournamentId` vazio e `managerId: null`, então a fonte real nunca é chamada.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add frontend/projects/athlete/src/app/data/tournament-reviews-repository.ts frontend/projects/athlete/src/app/data/public-tournament-reviews.source.ts frontend/projects/athlete/src/app/tournaments/tournament-live.store.ts frontend/projects/athlete/src/app/tournaments/tournament-live.store.spec.ts
git commit -m "feat(atleta-web): store do torneio lê a avaliação pública e o organizador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B3: Selo, seção e linha do organizador

**Files:**
- Create: `frontend/projects/athlete/src/app/tournaments/review/tournament-review-aspects.component.ts`
- Test: `frontend/projects/athlete/src/app/tournaments/review/tournament-review-aspects.component.spec.ts`
- Modify: `frontend/projects/athlete/src/app/tournaments/tabs/overview-tab.component.ts` (imports, `imports:` e computed `reviewBadge`)
- Modify: `frontend/projects/athlete/src/app/tournaments/tabs/overview-tab.component.html` (badges do herói e coluna lateral)
- Test: `frontend/projects/athlete/src/app/tournaments/tabs/overview-tab.reviews.spec.ts` (criar)
- Modify: `frontend/projects/athlete/src/app/tournaments/tournament-shell.component.{ts,html,scss}`

**Interfaces:**
- Consumes: de B1, `reviewBadgeLabel`, `organizerLine`, `publicAspectRows` e `PublicReviewSummary`; de B2, os signals do store e `PublicTournamentReviewsSource`.
- Produces:
  - `TournamentReviewAspectsComponent` (seletor `app-tournament-review-aspects`), com `summary = input<PublicReviewSummary | null>(null)`;
  - o computed `reviewBadge` na Visão geral;
  - o computed `organizerText` na casca.

- [ ] **Step 1: Escrever os specs que falham**

`frontend/projects/athlete/src/app/tournaments/review/tournament-review-aspects.component.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PublicReviewSummary } from '../../data/tournament-reviews';
import { TournamentReviewAspectsComponent } from './tournament-review-aspects.component';

describe('TournamentReviewAspectsComponent', () => {
  function render(summary: PublicReviewSummary | null): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(TournamentReviewAspectsComponent);
    fixture.componentRef.setInput('summary', summary);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('mostra a média de cada aspecto com nota, na ordem da lista', () => {
    const host = render({ count: 23, average: 4.62, aspects: { prizes: 3.4, organization: 4.8 } });
    expect(host.textContent).toContain('Como os atletas avaliaram');
    expect([...host.querySelectorAll('.tra-label')].map((e) => e.textContent!.trim())).toEqual(['Organização geral', 'Premiação e kit']);
    expect([...host.querySelectorAll('.tra-value')].map((e) => e.textContent!.trim())).toEqual(['4,8', '3,4']);
    expect((host.querySelector('.tra-track span') as HTMLElement).style.width).toBe('96%');
  });

  it('abaixo de 3 avaliações, sem aspectos ou sem resumo: nada', () => {
    expect(render({ count: 2, average: null, aspects: { venue: 4 } }).querySelector('section')).toBeNull();
    TestBed.resetTestingModule();
    expect(render({ count: 23, average: 4.62, aspects: {} }).querySelector('section')).toBeNull();
    TestBed.resetTestingModule();
    expect(render(null).querySelector('section')).toBeNull();
  });
});
```

`frontend/projects/athlete/src/app/tournaments/tabs/overview-tab.reviews.spec.ts`:

```ts
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { PublicTournamentReviewsSource } from '../../data/public-tournament-reviews.source';
import type { TournamentSummary } from '../../data/tournaments-repository';
import { TournamentLiveStore } from '../tournament-live.store';
import { OverviewTabComponent } from './overview-tab.component';

function resumo(over: Partial<TournamentSummary> = {}): TournamentSummary {
  return {
    id: 't1',
    name: 'Etapa Areia',
    location: 'Arena Sul',
    city: 'Goiânia',
    dateLabel: '21/04',
    startAt: null,
    endAt: null,
    categories: [],
    format: 'Dupla',
    capacity: null,
    enrolledCount: 0,
    liveMatchesNow: 0,
    featured: false,
    rawStatus: 'completed',
    isCancelled: false,
    isDraftOrCancelled: false,
    leagueId: null,
    leagueStageId: null,
    leagueStageOrder: null,
    leagueStageName: null,
    coverUrl: null,
    managerId: null,
    regulationsText: null,
    sport: 'beachVolleyball',
    paymentMode: 'appPixCard',
    organizerPix: null,
    waitlistEnabled: true,
    requireFormedPair: false,
    registrationHoldMinutes: 30,
    registrationOpensAt: null,
    registrationClosesAt: null,
    tournamentPrizes: [],
    ...over,
  } as TournamentSummary;
}

describe('Visão geral — avaliação pública', () => {
  afterEach(() => TestBed.resetTestingModule());

  function mount(): { host: HTMLElement; store: TournamentLiveStore; fixture: ComponentFixture<OverviewTabComponent> } {
    TestBed.configureTestingModule({
      imports: [OverviewTabComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        TournamentLiveStore,
        { provide: AuthService, useValue: { user: signal(null) } },
        {
          provide: PublicTournamentReviewsSource,
          useValue: { watchSummary: () => () => undefined, watchReputation: () => () => undefined, fetchOrganizerName: () => Promise.resolve(null) },
        },
      ],
    });
    const store = TestBed.inject(TournamentLiveStore);
    store.tournament.set(resumo());
    const fixture = TestBed.createComponent(OverviewTabComponent);
    fixture.detectChanges();
    return { host: fixture.nativeElement as HTMLElement, store, fixture };
  }

  it('com 3+ avaliações: selo no herói e seção na coluna lateral', () => {
    const { host, store, fixture } = mount();
    store.reviewSummary.set({ count: 23, average: 4.62, aspects: { organization: 4.8 } });
    fixture.detectChanges();
    const badges = [...host.querySelectorAll('.tdv-hero-badges span')].map((e) => e.textContent!.trim());
    expect(badges).toContain('★ 4,6 · 23 avaliações');
    expect(host.querySelector('app-tournament-review-aspects')?.textContent).toContain('Organização geral');
  });

  it('abaixo de 3 avaliações nada aparece', () => {
    const { host, store, fixture } = mount();
    store.reviewSummary.set({ count: 2, average: null, aspects: {} });
    fixture.detectChanges();
    expect(host.querySelector('.tdv-hero-badges')!.textContent).not.toContain('★');
    expect(host.querySelector('app-tournament-review-aspects section')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/tournaments/review/tournament-review-aspects.component.spec.ts' --include='projects/athlete/src/app/tournaments/tabs/overview-tab.reviews.spec.ts'`

Expected: erro de compilação, `Cannot find module './tournament-review-aspects.component'`.

- [ ] **Step 3: Componente da seção**

`frontend/projects/athlete/src/app/tournaments/review/tournament-review-aspects.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { publicAspectRows, type PublicReviewSummary } from '../../data/tournament-reviews';

/** "Como os atletas avaliaram" (spec §5): média de cada aspecto com nota. Some abaixo de 3
 *  avaliações e quando nenhum aspecto foi avaliado. Estilo próprio para não engordar a aba. */
@Component({
  selector: 'app-tournament-review-aspects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length) {
      <section class="tra-card" aria-labelledby="tra-title">
        <span class="tra-kicker">Avaliação dos atletas</span>
        <h2 class="tra-title" id="tra-title">Como os atletas avaliaram</h2>
        @for (row of rows(); track row.key) {
          <div class="tra-row">
            <span class="tra-label">{{ row.label }}</span>
            <span class="tra-value">{{ row.value }}</span>
            <div class="tra-track"><span [style.width.%]="row.pct"></span></div>
          </div>
        }
      </section>
    }
  `,
  styles: `
    .tra-card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-5);
      padding: 20px;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .tra-kicker {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .tra-title {
      margin: 4px 0 8px;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 17px;
      color: var(--nx-text);
    }
    .tra-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 12px;
      padding: 9px 0;
    }
    .tra-label {
      font-family: var(--nx-font-ui);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .tra-value {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .tra-track {
      grid-column: 1 / -1;
      height: 5px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-surface-2);
      overflow: hidden;
    }
    .tra-track span {
      display: block;
      height: 100%;
      background: var(--nx-orange-500);
    }
  `,
})
export class TournamentReviewAspectsComponent {
  readonly summary = input<PublicReviewSummary | null>(null);
  protected readonly rows = computed(() => publicAspectRows(this.summary()));
}
```

- [ ] **Step 4: Selo e seção na Visão geral**

Em `frontend/projects/athlete/src/app/tournaments/tabs/overview-tab.component.ts`:

1. **Imports:**

```ts
import { reviewBadgeLabel } from '../../data/tournament-reviews';
import { TournamentReviewAspectsComponent } from '../review/tournament-review-aspects.component';
```

2. **`imports:` do decorator:** `[RouterLink, TournamentReviewCtaComponent, TournamentReviewAspectsComponent]`.

3. **Computed**, depois de `protected readonly tournament = this.store.tournament;`:

```ts
  /** Selo "★ 4,6 · 23 avaliações" no herói (spec §5) — `null` abaixo de 3 avaliações. */
  protected readonly reviewBadge = computed(() => reviewBadgeLabel(this.store.reviewSummary()));
```

Em `frontend/projects/athlete/src/app/tournaments/tabs/overview-tab.component.html`:

1. **Badges do herói:** dentro de `<div class="tdv-hero-badges">`, depois de `<span class="tdv-hero-tag">Torneio · {{ t.format }}</span>`:

```html
          @if (reviewBadge(); as badge) {
            <span class="tdv-hero-tag">{{ badge }}</span>
          }
```

2. **Seção na coluna lateral:** logo depois da linha `<app-tournament-review-cta … />`:

```html
        <app-tournament-review-aspects [summary]="store.reviewSummary()" />
```

- [ ] **Step 5: Linha do organizador na casca**

Em `frontend/projects/athlete/src/app/tournaments/tournament-shell.component.ts`:

1. **Import de `../data/tournament-reviews`:** acrescente `organizerLine`. A linha fica `import { TOURNAMENT_REVIEW_XP, organizerLine, reviewDialogInviteOf } from '../data/tournament-reviews';`.

2. **Computed**, depois do `heroMeta`:

```ts
  /** "Organizado por {nome}", com a nota do organizador quando ele tem 3+ avaliações (spec §5).
   *  Fica na casca porque vale para qualquer torneio e qualquer aba. */
  protected readonly organizerText = computed(() => organizerLine(this.store.organizerName(), this.store.organizerReputation()));
```

Em `frontend/projects/athlete/src/app/tournaments/tournament-shell.component.html`, logo depois de `<p class="tsh-meta">{{ heroMeta() }}</p>`:

```html
          @if (organizerText(); as organizer) {
            <p class="tsh-organizer">{{ organizer }}</p>
          }
```

Em `frontend/projects/athlete/src/app/tournaments/tournament-shell.component.scss`, logo depois do bloco `.tsh-meta { … }`:

```scss

.tsh-organizer {
  margin: var(--nx-s-2) 0 0;
  font-family: var(--nx-font-ui);
  font-size: 13px;
  color: var(--nx-text-mute);
}
```

A casca não tem spec. O texto vem de `organizerLine`, testado na B1, e os signals vêm do store, testado na B2. A checagem visual (F) confere a linha.

- [ ] **Step 6: Rodar e ver passar**

Run: o mesmo comando do Step 2, mais o spec da capa padrão, que monta a Visão geral:

`cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/tournaments/review/tournament-review-aspects.component.spec.ts' --include='projects/athlete/src/app/tournaments/tabs/overview-tab.reviews.spec.ts' --include='projects/athlete/src/app/tournaments/tournament-default-cover.spec.ts'`

Expected: `TOTAL: N SUCCESS`, sem `FAILED`.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add frontend/projects/athlete/src/app/tournaments/review/tournament-review-aspects.component.ts frontend/projects/athlete/src/app/tournaments/review/tournament-review-aspects.component.spec.ts frontend/projects/athlete/src/app/tournaments/tabs/overview-tab.component.ts frontend/projects/athlete/src/app/tournaments/tabs/overview-tab.component.html frontend/projects/athlete/src/app/tournaments/tabs/overview-tab.reviews.spec.ts frontend/projects/athlete/src/app/tournaments/tournament-shell.component.ts frontend/projects/athlete/src/app/tournaments/tournament-shell.component.html frontend/projects/athlete/src/app/tournaments/tournament-shell.component.scss
git commit -m "feat(atleta-web): selo da avaliação, seção por aspecto e linha do organizador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Parte C — Site (Angular, firestore-lite)

### Task C1: Regras puras, repositório e `managerId`

**Files:**
- Create: `frontend/projects/site/src/lib/tournament-reviews.ts`
- Test: `frontend/projects/site/src/lib/tournament-reviews.spec.ts`
- Create: `frontend/projects/site/src/lib/firestore/tournament-reviews.ts`
- Modify: `frontend/projects/site/src/lib/firestore/types.ts` (`TournamentDetail`)
- Modify: `frontend/projects/site/src/lib/firestore/tournaments.ts` (`getTournamentById`)

**Interfaces:**
- Produces:
  - **Regras puras** (`lib/tournament-reviews.ts`, sem SDK): `MIN_PUBLIC_REVIEWS`, `TOURNAMENT_REVIEW_ASPECTS`, os tipos `PublicReviewSummary`, `OrganizerReputation` e `PublicAspectRow`, e as funções `publicSummaryFromData`, `organizerReputationFromData`, `organizerNameFromData`, `formatRating`, `reviewBadgeLabel`, `organizerReputationLabel`, `organizerLine` e `publicAspectRows`. Mesmas assinaturas e textos da B1.
  - **Repositório** (`lib/firestore/tournament-reviews.ts`), todos devolvendo `null` em erro:
    - `getPublicReviewSummary(tournamentId): Promise<PublicReviewSummary | null>`;
    - `getOrganizerReputation(organizerId): Promise<OrganizerReputation | null>`;
    - `getOrganizerName(organizerId): Promise<string | null>`.
  - **Modelo:** `TournamentDetail.managerId: string | null`.

- [ ] **Step 1: Escrever o spec que falha**

`frontend/projects/site/src/lib/tournament-reviews.spec.ts`:

```ts
import {
  TOURNAMENT_REVIEW_ASPECTS,
  formatRating,
  organizerLine,
  organizerNameFromData,
  organizerReputationFromData,
  organizerReputationLabel,
  publicAspectRows,
  publicSummaryFromData,
  reviewBadgeLabel,
} from './tournament-reviews';

describe('avaliação pública no site', () => {
  it('aspectos na mesma ordem de functions/src/tournament-review-constants.ts', () => {
    expect(TOURNAMENT_REVIEW_ASPECTS.map((a) => a.key)).toEqual(['organization', 'schedule', 'refereeing', 'venue', 'prizes']);
  });

  it('lê o resumo público: média dos aspectos com nota, chave desconhecida fica de fora', () => {
    expect(
      publicSummaryFromData({ count: 23, average: 4.62, aspects: { schedule: { count: 18, average: 3.4 }, bogus: { count: 1, average: 1 } } }),
    ).toEqual({ count: 23, average: 4.62, aspects: { schedule: 3.4 } });
    expect(publicSummaryFromData(undefined)).toBeNull();
  });

  it('lê a reputação e o nome do organizador', () => {
    expect(organizerReputationFromData({ reviewsCount: 86, tournamentsRated: 5, average: 4.71 })).toEqual({
      reviewsCount: 86,
      tournamentsRated: 5,
      average: 4.71,
    });
    expect(organizerNameFromData({ fullName: ' Ana Organiza ', nickname: '@ana' })).toBe('Ana Organiza');
    expect(organizerNameFromData({ nickname: '@ana' })).toBe('ana');
    expect(organizerNameFromData({})).toBeNull();
  });

  it('selo: estrela, uma casa com vírgula e a contagem; nada abaixo de 3', () => {
    expect(reviewBadgeLabel({ count: 23, average: 4.62, aspects: {} })).toBe('★ 4,6 · 23 avaliações');
    expect(reviewBadgeLabel({ count: 2, average: null, aspects: {} })).toBeNull();
    expect(reviewBadgeLabel(null)).toBeNull();
  });

  it('nota do organizador e a linha "Organizado por"', () => {
    const rep = { reviewsCount: 86, tournamentsRated: 5, average: 4.71 };
    expect(organizerReputationLabel(rep)).toBe('★ 4,7 (86 avaliações em 5 torneios)');
    expect(organizerReputationLabel({ reviewsCount: 3, tournamentsRated: 1, average: 5 })).toBe('★ 5,0 (3 avaliações em 1 torneio)');
    expect(organizerReputationLabel({ reviewsCount: 2, tournamentsRated: 1, average: null })).toBeNull();
    expect(organizerLine('Ana Organiza', rep)).toBe('Organizado por Ana Organiza · ★ 4,7 (86 avaliações em 5 torneios)');
    expect(organizerLine('Ana Organiza', null)).toBe('Organizado por Ana Organiza');
    expect(organizerLine(null, rep)).toBeNull();
  });

  it('aspectos: só os com nota, na ordem da lista; nada sem números públicos', () => {
    expect(publicAspectRows({ count: 23, average: 4.62, aspects: { prizes: 3.4, organization: 4.8 } })).toEqual([
      { key: 'organization', label: 'Organização geral', value: '4,8', pct: 96 },
      { key: 'prizes', label: 'Premiação e kit', value: '3,4', pct: 68 },
    ]);
    expect(publicAspectRows({ count: 2, average: null, aspects: { venue: 4 } })).toEqual([]);
    expect(publicAspectRows({ count: 23, average: 4.62, aspects: {} })).toEqual([]);
  });

  it('formatRating usa vírgula', () => {
    expect(formatRating(4.62)).toBe('4,6');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test site --watch=false --browsers=ChromeHeadless --include='projects/site/src/lib/tournament-reviews.spec.ts'`

Expected: erro de compilação, `Cannot find module './tournament-reviews'`.

- [ ] **Step 3: Regras puras**

`frontend/projects/site/src/lib/tournament-reviews.ts`:

```ts
/**
 * Avaliação do torneio pelos atletas — exibição pública no site (spec §5).
 * Spec: docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md
 * Sem SDK aqui: só regras puras, testáveis sem Firebase. As leituras moram em
 * `firestore/tournament-reviews.ts`.
 */

/** MESMA lista e ordem de `functions/src/tournament-review-constants.ts`. */
export const TOURNAMENT_REVIEW_ASPECTS = [
  { key: 'organization', label: 'Organização geral' },
  { key: 'schedule', label: 'Cumprimento dos horários' },
  { key: 'refereeing', label: 'Arbitragem / mesa' },
  { key: 'venue', label: 'Estrutura do local' },
  { key: 'prizes', label: 'Premiação e kit' },
] as const;

export type TournamentReviewAspectKey = (typeof TOURNAMENT_REVIEW_ASPECTS)[number]['key'];

/** Abaixo disso nada é público: sem selo, sem seção, sem nota do organizador. */
export const MIN_PUBLIC_REVIEWS = 3;

/** `tournamentReviewSummaries/{id}`, só o que a exibição pública usa. */
export interface PublicReviewSummary {
  readonly count: number;
  readonly average: number | null;
  /** Média de cada aspecto que recebeu nota. */
  readonly aspects: Partial<Record<TournamentReviewAspectKey, number>>;
}

/** `organizerReputation/{uid}`. `average` vem nulo enquanto `reviewsCount < 3`. */
export interface OrganizerReputation {
  readonly reviewsCount: number;
  readonly tournamentsRated: number;
  readonly average: number | null;
}

export interface PublicAspectRow {
  readonly key: TournamentReviewAspectKey;
  readonly label: string;
  /** "4,8". */
  readonly value: string;
  /** Largura da barra: média sobre 5, em %. */
  readonly pct: number;
}

type Data = Record<string, unknown> | undefined;

const ASPECT_KEYS: readonly string[] = TOURNAMENT_REVIEW_ASPECTS.map((a) => a.key);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function decimal(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function publicSummaryFromData(data: Data): PublicReviewSummary | null {
  if (!data) return null;
  const aspects: Partial<Record<TournamentReviewAspectKey, number>> = {};
  const raw = data['aspects'];
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const average = decimal((value as Record<string, unknown> | null)?.['average']);
      if (ASPECT_KEYS.includes(key) && average != null) aspects[key as TournamentReviewAspectKey] = average;
    }
  }
  return { count: count(data['count']), average: decimal(data['average']), aspects };
}

export function organizerReputationFromData(data: Data): OrganizerReputation | null {
  if (!data) return null;
  return {
    reviewsCount: count(data['reviewsCount']),
    tournamentsRated: count(data['tournamentsRated']),
    average: decimal(data['average']),
  };
}

/** Nome do organizador em `public_profiles/{uid}`: nome completo antes do apelido. */
export function organizerNameFromData(data: Data): string | null {
  if (!data) return null;
  return text(data['fullName']) || text(data['name']) || text(data['nickname']).replace(/^@/, '') || null;
}

/** Uma casa, vírgula — a mesma regra do app e dos portais. */
export function formatRating(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

function hasPublicNumbers(s: PublicReviewSummary): s is PublicReviewSummary & { average: number } {
  return s.count >= MIN_PUBLIC_REVIEWS && s.average != null;
}

/** "★ 4,6 · 23 avaliações", ou `null` sem números públicos. */
export function reviewBadgeLabel(s: PublicReviewSummary | null): string | null {
  return s && hasPublicNumbers(s) ? `★ ${formatRating(s.average)} · ${s.count} avaliações` : null;
}

/** "★ 4,7 (86 avaliações em 5 torneios)", ou `null` abaixo de 3 avaliações. */
export function organizerReputationLabel(r: OrganizerReputation | null): string | null {
  if (!r || r.average == null || r.reviewsCount < MIN_PUBLIC_REVIEWS) return null;
  const tournaments = r.tournamentsRated === 1 ? '1 torneio' : `${r.tournamentsRated} torneios`;
  return `★ ${formatRating(r.average)} (${r.reviewsCount} avaliações em ${tournaments})`;
}

/** Linha do herói. Sem nome não há linha — nota solta não diz de quem é. */
export function organizerLine(name: string | null, reputation: OrganizerReputation | null): string | null {
  if (!name) return null;
  const rating = organizerReputationLabel(reputation);
  return rating ? `Organizado por ${name} · ${rating}` : `Organizado por ${name}`;
}

/** Barras de "Como os atletas avaliaram": só aspectos com nota, na ordem da lista. */
export function publicAspectRows(s: PublicReviewSummary | null): PublicAspectRow[] {
  if (!s || !hasPublicNumbers(s)) return [];
  return TOURNAMENT_REVIEW_ASPECTS.flatMap((a) => {
    const average = s.aspects[a.key];
    return average == null ? [] : [{ key: a.key, label: a.label, value: formatRating(average), pct: Math.round((average / 5) * 100) }];
  });
}
```

- [ ] **Step 4: Repositório e `managerId`**

`frontend/projects/site/src/lib/firestore/tournament-reviews.ts`:

```ts
import { doc, getDoc } from 'firebase/firestore/lite';
import { liteDb } from '../firebase-lite';
import {
  organizerNameFromData,
  organizerReputationFromData,
  publicSummaryFromData,
  type OrganizerReputation,
  type PublicReviewSummary,
} from '../tournament-reviews';

/** Docs públicos (`read: if true`). Uma leitura por visita — o lite não tem listener. Falha
 *  vira `null`: a página do torneio segue normal, só sem selo, seção ou linha do organizador. */

export async function getPublicReviewSummary(tournamentId: string): Promise<PublicReviewSummary | null> {
  try {
    const snap = await getDoc(doc(liteDb, 'tournamentReviewSummaries', tournamentId));
    return snap.exists() ? publicSummaryFromData(snap.data()) : null;
  } catch (err) {
    console.error('[tournament-reviews] getPublicReviewSummary failed:', err);
    return null;
  }
}

export async function getOrganizerReputation(organizerId: string): Promise<OrganizerReputation | null> {
  try {
    const snap = await getDoc(doc(liteDb, 'organizerReputation', organizerId));
    return snap.exists() ? organizerReputationFromData(snap.data()) : null;
  } catch (err) {
    console.error('[tournament-reviews] getOrganizerReputation failed:', err);
    return null;
  }
}

export async function getOrganizerName(organizerId: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(liteDb, 'public_profiles', organizerId));
    return snap.exists() ? organizerNameFromData(snap.data()) : null;
  } catch (err) {
    console.error('[tournament-reviews] getOrganizerName failed:', err);
    return null;
  }
}
```

Em `frontend/projects/site/src/lib/firestore/types.ts`, no `interface TournamentDetail extends TournamentSummary {`, depois de `categories: TournamentCategory[];`:

```ts
  /** Dono do torneio: chave da reputação (`organizerReputation/{managerId}`) e do nome em
   *  `public_profiles`. `null` em torneio legado sem dono gravado. */
  managerId: string | null;
```

Em `frontend/projects/site/src/lib/firestore/tournaments.ts`, no objeto devolvido por `getTournamentById`, depois de `categories,`:

```ts
      managerId: typeof d['managerId'] === 'string' && d['managerId'].trim() ? d['managerId'].trim() : null,
```

- [ ] **Step 5: Rodar e ver passar; suíte do site**

Run: o mesmo comando do Step 2. Depois rode a suíte inteira do site, porque `managerId` é campo obrigatório novo e algum fixture pode montar um `TournamentDetail` literal:

`cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test site --watch=false --browsers=ChromeHeadless`

Expected: `TOTAL: N SUCCESS`, sem `FAILED`. Se algum fixture de `TournamentDetail` quebrar a compilação, acrescente `managerId: null` nele e registre um `Ruling:`.

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add frontend/projects/site/src/lib/tournament-reviews.ts frontend/projects/site/src/lib/tournament-reviews.spec.ts frontend/projects/site/src/lib/firestore/tournament-reviews.ts frontend/projects/site/src/lib/firestore/types.ts frontend/projects/site/src/lib/firestore/tournaments.ts
git commit -m "feat(site): regras e leitura da avaliação pública do torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task C2: Selo e organizador no herói, seção e ligação na página

**Files:**
- Modify: `frontend/projects/site/src/app/pages/torneios/tournament-hero.ts` (inputs, linha de badges e linha de meta)
- Create: `frontend/projects/site/src/app/pages/torneios/tournament-review-aspects.ts`
- Test: `frontend/projects/site/src/app/pages/torneios/tournament-review-aspects.spec.ts`
- Test: `frontend/projects/site/src/app/pages/torneios/tournament-hero.reviews.spec.ts` (criar)
- Modify: `frontend/projects/site/src/app/pages/torneios/torneio-detail.page.ts`, em cinco pontos:
  - imports;
  - `imports:` do componente;
  - template;
  - signals;
  - effect.

**Interfaces:**
- Consumes: de C1, `reviewBadgeLabel`, `organizerLine`, `publicAspectRows`, `getPublicReviewSummary`, `getOrganizerReputation`, `getOrganizerName` e `TournamentDetail.managerId`.
- Produces:
  - inputs opcionais no herói: `TournamentHero.reviewBadge = input<string | null>(null)` e `TournamentHero.organizerLine = input<string | null>(null)`;
  - componente `TournamentReviewAspects` (seletor `app-tournament-review-aspects`), com `summary = input<PublicReviewSummary | null>(null)`.

- [ ] **Step 1: Escrever os specs que falham**

`frontend/projects/site/src/app/pages/torneios/tournament-review-aspects.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PublicReviewSummary } from '../../../lib/tournament-reviews';
import { TournamentReviewAspects } from './tournament-review-aspects';

describe('TournamentReviewAspects (site)', () => {
  beforeEach(async () => {
    // O site roda zoneless: sem isso o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [TournamentReviewAspects],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  function render(summary: PublicReviewSummary | null): HTMLElement {
    const f = TestBed.createComponent(TournamentReviewAspects);
    f.componentRef.setInput('summary', summary);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('mostra a média de cada aspecto com nota, na ordem da lista', () => {
    const host = render({ count: 23, average: 4.62, aspects: { prizes: 3.4, organization: 4.8 } });
    expect(host.textContent).toContain('Como os atletas avaliaram');
    expect([...host.querySelectorAll('li [data-label]')].map((e) => e.textContent!.trim())).toEqual(['Organização geral', 'Premiação e kit']);
    expect([...host.querySelectorAll('li [data-value]')].map((e) => e.textContent!.trim())).toEqual(['4,8', '3,4']);
    expect((host.querySelector('li [data-bar]') as HTMLElement).style.width).toBe('96%');
  });

  it('abaixo de 3, sem aspectos ou sem resumo: nada', () => {
    expect(render({ count: 2, average: null, aspects: { venue: 4 } }).querySelector('section')).toBeNull();
    expect(render({ count: 23, average: 4.62, aspects: {} }).querySelector('section')).toBeNull();
    expect(render(null).querySelector('section')).toBeNull();
  });
});
```

`frontend/projects/site/src/app/pages/torneios/tournament-hero.reviews.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { TournamentSummary } from '../../../lib/firestore/types';
import { TournamentHero } from './tournament-hero';

function torneio(): TournamentSummary {
  return {
    id: 't1',
    name: 'Etapa Areia',
    sport: 'beachVolleyball',
    city: 'Goiânia',
    state: 'GO',
    locationName: 'Arena Sul',
    dateLabel: '21/04',
    startAt: null,
    endAt: null,
    listingStatus: 'ended',
    featured: false,
    enrolledCount: 0,
    capacity: null,
    liveMatchesNow: 0,
    categoriesCount: 0,
    leagueId: null,
    leagueStageName: null,
    coverUrl: null,
  };
}

describe('herói do torneio — avaliação e organizador', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TournamentHero],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  it('mostra o selo e a linha do organizador quando recebe os textos', () => {
    const f = TestBed.createComponent(TournamentHero);
    f.componentRef.setInput('t', torneio());
    f.componentRef.setInput('reviewBadge', '★ 4,6 · 23 avaliações');
    f.componentRef.setInput('organizerLine', 'Organizado por Ana Organiza · ★ 4,7 (86 avaliações em 5 torneios)');
    f.detectChanges();
    const text = (f.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('★ 4,6 · 23 avaliações');
    expect(text).toContain('Organizado por Ana Organiza · ★ 4,7 (86 avaliações em 5 torneios)');
  });

  it('sem os textos (padrão) não mostra estrela nem organizador', () => {
    const f = TestBed.createComponent(TournamentHero);
    f.componentRef.setInput('t', torneio());
    f.detectChanges();
    const text = (f.nativeElement as HTMLElement).textContent!;
    expect(text).not.toContain('★');
    expect(text).not.toContain('Organizado por');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test site --watch=false --browsers=ChromeHeadless --include='projects/site/src/app/pages/torneios/tournament-review-aspects.spec.ts' --include='projects/site/src/app/pages/torneios/tournament-hero.reviews.spec.ts'`

Expected:
- erro de compilação, `Cannot find module './tournament-review-aspects'`;
- ou, se esse arquivo já existir, o herói recusa o input: `NG0303: Can't set value of the 'reviewBadge' input`.

- [ ] **Step 3: Componente da seção**

`frontend/projects/site/src/app/pages/torneios/tournament-review-aspects.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { publicAspectRows, type PublicReviewSummary } from '../../../lib/tournament-reviews';

/** "Como os atletas avaliaram" (spec §5): média de cada aspecto com nota. Some abaixo de 3
 *  avaliações e quando nenhum aspecto foi avaliado. */
@Component({
  selector: 'app-tournament-review-aspects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length) {
      <section class="mt-12">
        <h2 class="font-display text-xl font-700 tracking-tight text-fg">Como os atletas avaliaram</h2>
        <ul class="mt-5 flex flex-col gap-4 rounded-5 border border-line bg-surface-1 p-6">
          @for (row of rows(); track row.key) {
            <li>
              <div class="flex items-baseline justify-between gap-4 text-sm">
                <span data-label class="font-600 text-fg">{{ row.label }}</span>
                <span data-value class="font-mono text-text-mute">{{ row.value }}</span>
              </div>
              <div class="mt-2 h-2 overflow-hidden rounded-pill bg-surface-2">
                <span data-bar class="block h-full rounded-pill bg-brand" [style.width.%]="row.pct"></span>
              </div>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class TournamentReviewAspects {
  readonly summary = input<PublicReviewSummary | null>(null);
  protected readonly rows = computed(() => publicAspectRows(this.summary()));
}
```

- [ ] **Step 4: Herói**

Em `frontend/projects/site/src/app/pages/torneios/tournament-hero.ts`:

1. **Inputs**, logo depois de `readonly t = input.required<TournamentDetail>();`:

```ts
  /** Selo "★ 4,6 · 23 avaliações" (spec §5) — `null` abaixo de 3 avaliações ou sem leitura. */
  readonly reviewBadge = input<string | null>(null);
  /** "Organizado por {nome}", com a nota do organizador quando ele tem 3+ avaliações. */
  readonly organizerLine = input<string | null>(null);
```

2. **Linha de badges**, dentro de `<div class="flex flex-wrap items-center gap-3">`, depois do bloco `@if (t().leagueStageName; as stageName) { … }`:

```html
          @if (reviewBadge(); as badge) {
            <span class="inline-flex items-center gap-1.5 rounded-pill border border-pending/30 bg-pending/10 px-2.5 py-1 text-xs font-600 text-pending">{{ badge }}</span>
          }
```

3. **Linha de meta**, dentro de `<div class="mt-5 flex flex-col gap-3 text-text-mute sm:flex-row sm:flex-wrap sm:gap-6">`, depois do `<span>` de `{{ t().enrolledCount }} inscritos`:

```html
          @if (organizerLine(); as line) {
            <span class="flex items-center gap-2">
              <svg class="size-4 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
              {{ line }}
            </span>
          }
```

- [ ] **Step 5: Página**

Em `frontend/projects/site/src/app/pages/torneios/torneio-detail.page.ts`:

1. **Imports:**
   - acrescente `computed` ao import de `@angular/core`;
   - acrescente as linhas:

```ts
import { TournamentReviewAspects } from './tournament-review-aspects';
import { getOrganizerName, getOrganizerReputation, getPublicReviewSummary } from '../../../lib/firestore/tournament-reviews';
import { organizerLine, reviewBadgeLabel, type OrganizerReputation, type PublicReviewSummary } from '../../../lib/tournament-reviews';
```

2. **`imports:` do componente:** acrescente `TournamentReviewAspects`.

3. **Template:**
   - **Herói:** troque `<app-tournament-hero [t]="t" />` por:

```html
        <app-tournament-hero [t]="t" [reviewBadge]="reviewBadge()" [organizerLine]="organizerText()" />
```

   - **Seção:** logo depois do bloco `@if (t.description; as description) { … }` e antes de `@if (t.categories.length > 0) {`:

```html
          <app-tournament-review-aspects [summary]="reviewSummary()" />
```

4. **Signals**, depois de `protected readonly loading = signal(true);`:

```ts
  /** Avaliação pública (spec §5). Uma leitura por visita — o firestore-lite não tem listener. */
  protected readonly reviewSummary = signal<PublicReviewSummary | null>(null);
  protected readonly organizerReputation = signal<OrganizerReputation | null>(null);
  protected readonly organizerName = signal<string | null>(null);
  protected readonly reviewBadge = computed(() => reviewBadgeLabel(this.reviewSummary()));
  protected readonly organizerText = computed(() => organizerLine(this.organizerName(), this.organizerReputation()));
```

5. **Effect do construtor:**
   - Depois de `this.tournament.set(null);`, acrescente:

```ts
      this.reviewSummary.set(null);
      this.organizerReputation.set(null);
      this.organizerName.set(null);
```

   - Dentro do `if (t) {`, depois de `this.appendJsonLd(t);`, acrescente:

```ts
          // Leituras extras não seguram a página: chegam depois e só acrescentam o selo, a
          // seção e a linha do organizador. `cancelled` descarta o que chegar após trocar de torneio.
          void getPublicReviewSummary(t.id).then((summary) => {
            if (!cancelled) this.reviewSummary.set(summary);
          });
          const managerId = t.managerId;
          if (managerId) {
            void Promise.all([getOrganizerName(managerId), getOrganizerReputation(managerId)]).then(([name, reputation]) => {
              if (cancelled) return;
              this.organizerName.set(name);
              this.organizerReputation.set(reputation);
            });
          }
```

- [ ] **Step 6: Rodar e ver passar; suíte do site**

Run: o mesmo comando do Step 2. Depois rode a suíte inteira: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test site --watch=false --browsers=ChromeHeadless`

Expected: `TOTAL: N SUCCESS`, sem `FAILED`.

A ligação na página não tem spec: as leituras são funções de módulo, sem DI, como as do `getTournamentById` que a página já usa. As regras vêm da C1, os componentes têm spec nesta task, e a checagem visual (F) confere a página com os componentes.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add frontend/projects/site/src/app/pages/torneios/tournament-hero.ts frontend/projects/site/src/app/pages/torneios/tournament-review-aspects.ts frontend/projects/site/src/app/pages/torneios/tournament-review-aspects.spec.ts frontend/projects/site/src/app/pages/torneios/tournament-hero.reviews.spec.ts frontend/projects/site/src/app/pages/torneios/torneio-detail.page.ts
git commit -m "feat(site): selo da avaliação, seção por aspecto e organizador na página do torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task F: Verificação final, checagem visual e PR

- [ ] **Step 1: App — suíte e análise**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter analyze lib/features/tournaments lib/features/organizer > /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/.superpowers/fase4-analyze.log 2>&1; flutter test > /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/.superpowers/fase4-flutter.log 2>&1; tail -3 /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/.superpowers/fase4-flutter.log`

Expected:
- Suíte inteira verde.
- Nenhum issue do analyze em arquivo desta fase. Confira com `grep` nos nomes dos arquivos tocados. Issue em arquivo que esta fase não tocou já existia na base: anote no PR e não corrija aqui.

- [ ] **Step 2: Portal e site — suítes completas e builds de produção**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless && npx ng test site --watch=false --browsers=ChromeHeadless && npx ng build athlete --configuration production && npx ng build site --configuration production`

Expected:
- As duas suítes com `TOTAL: N SUCCESS`, sem `FAILED`.
- Os dois builds sem erro.
- Nenhum aviso de orçamento para `overview-tab`, `tournament-shell`, `tournament-review-aspects` ou `torneio-detail`. O Karma não aplica orçamento, então só o build prova.

- [ ] **Step 3: Checagem visual com rotas temporárias (NÃO commitar)**

Nenhum torneio de verdade tem resumo ainda: a flag está desligada. Use dados fictícios em rotas temporárias e apague tudo antes do PR.

**Portal do atleta**
- **Criar** `frontend/projects/athlete/src/app/qa-reviews/qa-public-reviews.component.ts`. Ele:
  - provê `TournamentLiveStore`, com `PublicTournamentReviewsSource` trocado por uma fonte que não faz nada;
  - semeia `store.tournament` com o `resumo()` do `overview-tab.reviews.spec.ts`;
  - semeia `store.reviewSummary` com `{ count: 23, average: 4.62, aspects: { organization: 4.8, schedule: 3.4, refereeing: 4.1, venue: 4.5, prizes: 3.9 } }`, `store.organizerName` com `'Arena Garden Eventos'` e `store.organizerReputation` com `{ reviewsCount: 86, tournamentsRated: 5, average: 4.71 }`;
  - renderiza `<app-overview-tab />` e, em cima, uma cópia do cabeçalho da casca: `<h1 class="tsh-title">` e `<p class="tsh-organizer">{{ organizerLine(...) }}</p>`.
- **Registrar** `{ path: 'qa-avaliacao-publica', loadComponent: () => import('./qa-reviews/qa-public-reviews.component').then((m) => m.QaPublicReviewsComponent) }` no **topo** de `frontend/projects/athlete/src/app/app.routes.ts`, sem guard.
- **Subir** `preview_start` com `name: "athlete"` (porta 4211) e abrir `/qa-avaliacao-publica`.

**Site**
- **Criar** `frontend/projects/site/src/app/pages/__qa-avaliacao-publica.ts`. Ele renderiza:
  - `<app-tournament-hero>` com um `TournamentDetail` fictício encerrado, `reviewBadge="★ 4,6 · 23 avaliações"` e `organizerLine="Organizado por Arena Garden Eventos · ★ 4,7 (86 avaliações em 5 torneios)"`;
  - logo abaixo, `<app-tournament-review-aspects>` com o mesmo resumo.
- **Registrar** a rota no topo de `frontend/projects/site/src/app/app.routes.ts`.
- **Subir** `preview_start` com `name: "site"`. Se a configuração tiver outro nome, liste as de `.claude/launch.json`.

**Conferir nos dois, em 375px e em desktop:**
- o selo legível sobre a capa;
- a seção sem estourar a largura;
- a linha do organizador quebrando bem quando o nome é comprido;
- no site, os temas claro e escuro (a página respeita `data-theme`).

Tire um screenshot de cada. Se o pane estiver escondido e o screenshot vier velho, meça pelo DOM com `javascript_tool`.

**Apagar** os componentes e as rotas. `git status` não pode mostrar nenhum deles, e `git diff` dos dois `app.routes.ts` tem que vir vazio.

- [ ] **Step 4: Nada fora do worktree e branch limpa**

Run:

```bash
git -C /Users/silviodionizio/Documents/projects/volley/nexago status --short | head
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && git status --short && git log --oneline claude/tournament-reviews-fase-3..HEAD
```

Expected:
- O checkout principal não ganhou nenhum arquivo desta fase.
- O worktree está limpo.
- Aparecem os commits do plano e de A1–A3, B1–B3 e C1–C2.

- [ ] **Step 5: PR**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422
git push -u origin claude/tournament-reviews-fase-4
gh pr create --title "Avaliação do torneio pelos atletas — fase 4 (exibição pública: app, portal e site)" --body "$(cat <<'EOF'
## O que entra

**Em torneio com 3 ou mais avaliações** (app, portal do atleta e site):
- Selo **★ 4,6 · 23 avaliações** no topo.
- Seção **Como os atletas avaliaram**, com a média de cada aspecto avaliado.

**Em qualquer torneio**, a nota do organizador quando ele tem 3 ou mais avaliações no total: **★ 4,7 (86 avaliações em 5 torneios)**.
- **App:** no subtítulo "Organizador" do card que já existe.
- **Portal e site:** numa linha nova "Organizado por {nome}". A spec supunha uma linha do organizador nessas superfícies, mas ela não existia. O dono decidiu criá-la.

Tudo aqui só lê docs públicos: `tournamentReviewSummaries`, `organizerReputation` e `public_profiles`. Nenhuma rule, índice ou function nova. Abaixo de 3 avaliações, nada aparece.

No app e no portal os números atualizam ao vivo. No site, a cada visita: o firestore-lite não tem listener.

## Testes
- **App:** regras de exibição (selo, nota do organizador, aspectos), seção, herói e card do organizador.
- **Portal:**
  - regras puras;
  - store, inclusive a troca de torneio e um nome que chega atrasado;
  - seção e Visão geral.
- **Site:** regras puras, seção e herói.
- **Suítes e builds:** as três suítes e os builds de produção do portal e do site passam.
- **Checagem visual:** portal e site em 375px e desktop, com rotas temporárias que não foram commitadas.

## Fica para depois
- A ligação na página do app (`tournament_detail_page.dart`), na casca do portal e na página do site não tem teste de widget ou componente. As três dependem de providers ou funções sem DI. A revisão e a checagem visual cobrem.
- Fase 5 (backoffice) e a fase 6 (ligar a flag).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Se o #537 ainda estiver aberto, acrescente `--base claude/tournament-reviews-fase-3` ao `gh pr create`.
