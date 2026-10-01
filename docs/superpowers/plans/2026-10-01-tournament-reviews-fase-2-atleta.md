# Avaliação do torneio — Fase 2 (atleta: app e portal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O atleta consegue avaliar o torneio que jogou, no app Flutter e no portal web. Isso inclui:
- receber o pedido;
- achar o formulário pelo push, pela Home/painel, pelo detalhe do torneio ou pela campanha;
- enviar ou editar a avaliação até a janela fechar.

**Architecture:** O backend da fase 1 (PR #533) é o contrato.
- **O que o cliente lê:** o próprio convite (`users/{uid}/tournamentReviewInvites/{tid}`) e, só depois de o convite dizer `submitted`, a própria avaliação (`tournamentReviews/{tid}_{uid}`).
- **Como envia:** pela callable `submitTournamentReview`.
- **Quem decide o estado:** o estado do botão (`none | pending | submitted | closed`) sai de uma função pura em cada superfície.
- **Duas partes independentes:**
  - **Parte A (app):** tasks A1–A8.
  - **Parte B (portal):** tasks B1–B8.
  
  As duas só se encontram na verificação final (F).

**Tech Stack:**
- **App:** Flutter 3.47 / Dart 3.11, flutter_riverpod 2.6 com providers manuais (sem codegen), go_router 14.8, cloud_functions 5.6, cloud_firestore e `flutter_test`.
- **Portal:** Angular 20.3 zoneless, firebase 12 web SDK, Karma + Jasmine.

**Spec:** `docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md` (seção 3), mais o plano da fase 1 `docs/superpowers/plans/2026-10-01-tournament-reviews-fase-1-backend.md` (contrato do backend).

## Global Constraints

**Branch**
- Crie `claude/tournament-reviews-fase-2` a partir de `claude/tournament-athlete-rating-361422`, que é o PR #533 ainda não mergeado.
- Se o #533 já estiver mergeado, crie a partir da `origin/main` atualizada.
- O PR vai contra a `main`, ou contra a branch da fase 1 se ela ainda estiver aberta.

**Worktree**
- Edite sempre `<worktree> + <caminho relativo do repo>`.
- Antes de cada commit, rode `pwd && git branch --show-current` e confira a branch.
- Rode `git -C /Users/silviodionizio/Documents/projects/volley/nexago status --short` depois da primeira edição de cada parte: o checkout principal tem que continuar limpo.

**Dependências do portal no worktree**
- Antes de testar o portal: `ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/frontend/node_modules <worktree>/frontend/node_modules`.
- Rode sempre com `cd <worktree>/frontend && …` no mesmo comando. Rodar da raiz do worktree acaba testando a árvore do checkout principal.

**Subagentes:** não use `haiku`. O piso é `sonnet`.

**Flutter**
- **Não rode `dart format`** em arquivo existente: ele reformata o arquivo inteiro.
- `flutter analyze <arquivos tocados>` tem que sair limpo.
- Todo teste que use `DateFormat(..., 'pt_BR')` precisa de `initializeDateFormatting('pt_BR')` no `setUpAll`.
- Nada de `pumpAndSettle` com `NexaSkeleton` ou `CircularProgressIndicator` na tela. Os testes só usam `pumpAndSettle` depois de os streams fakes emitirem.

**Sem deploy** nem escrita em projeto Firebase. A flag `appConfig/tournamentReviews` continua desligada.

**Textos exatos** (português na UI, inglês no código):

| Onde | Texto |
|---|---|
| pergunta (card, diálogo e título do formulário) | `Como foi o torneio {nome}?`. Nome vazio vira `Como foi o torneio?`. Nome que já começa com "Torneio" vai sem prefixo: `Como foi o Torneio de Verão?` (mesma regra do push da fase 1) |
| notas | 1 `Péssimo`, 2 `Ruim`, 3 `Ok`, 4 `Bom`, 5 `Excelente` |
| aspectos, nesta ordem | `organization` Organização geral, `schedule` Cumprimento dos horários, `refereeing` Arbitragem / mesa, `venue` Estrutura do local, `prizes` Premiação e kit |
| placeholder do comentário | `O que o organizador deveria manter ou mudar?` |
| aviso fixo | `O organizador lê sem o seu nome. Evite se identificar no texto.` |
| botão | `Enviar avaliação` (app) e `Enviar e ganhar +10 XP` (portal); na edição, `Salvar alterações` |
| sucesso | criação: `Obrigado! +10 XP`; edição: `Avaliação atualizada.` |
| janela fechada | `Avaliação encerrada em {dd/MM}` |
| botão pendente | `Avaliar torneio`, com a linha `Leva 10 segundos · fecha em {dd/MM} · +10 XP` |
| botão enviado | `Você avaliou ★ {n} · Editar`, ou `Você avaliou este torneio` se a nota não carregou, com `Dá pra editar até {dd/MM}` |

**Regras**
- **Comentário:** até 1000 caracteres (contagem do `length`). Vazio ou só espaços vai como `null`.
- **Convite aberto** = `status != expired` **e** `closesAt > agora`. O status sozinho não basta, porque o job pode atrasar.
- **Avaliação própria:** só é lida quando o convite está `submitted`.

**Rotas**
- **App:** `/torneios/:tournamentId/avaliar`, com nome `tournamentReview`.
- **Portal:** `torneios/:id/avaliar` redireciona para `/torneios/:id/minha-inscricao?avaliar=1`. O diálogo abre na casca do torneio sempre que houver `?avaliar=1` e o convite estiver aberto.

**Push (app)**
- `tournament_review_request` e `tournament_review_reminder` com `tournamentId` vão para `/torneios/{id}/avaliar` **antes** de olhar a `url`.
- `tournament_review_closed` não muda nesta fase; é da fase 3.

## Review Focus

1. **Convite `pending` com `closesAt` vencido** (o job do dia não rodou ou a flag foi desligada). Tem que aparecer como encerrado, nunca o formulário nem o card da Home. Testes: A2, A4, A5, B1.
2. **Callable não deployada.** O SDK traz "NOT FOUND" ou "not-found" cru, e o atleta tem que ver uma mensagem legível. Testes: A3, B2.
3. **Edição.** O formulário chega preenchido com a avaliação salva, e tirar a nota de um aspecto faz ele sumir do payload. Testes: A5, B4.
4. **Push de avaliação sem `tournamentId`.** Tem que cair na `url` e não pode ir para uma rota quebrada. Teste: A8.
5. **Nome de torneio vazio ou começando com "Torneio".** A pergunta tem que sair gramatical. Testes: A2, B1.

---

## Mapa de arquivos

**Parte A: app (`nexago_app/`)**

| Arquivo | Responsabilidade |
|---|---|
| `lib/features/tournaments/domain/tournament_review_models.dart` (criar) | `TournamentReviewAspect`, `TournamentReviewInvite`, `MyTournamentReview` e o parse do Firestore |
| `lib/features/tournaments/domain/tournament_review_logic.dart` (criar) | estado do botão, convites abertos, pergunta, rótulos, `dd/MM` |
| `lib/features/tournaments/data/tournament_review_service.dart` (criar) | streams do convite, leitura da própria avaliação, callable, `tournamentReviewServiceProvider` |
| `lib/features/tournaments/domain/tournament_review_providers.dart` (criar) | `pendingTournamentReviewsProvider`, `tournamentReviewInviteProvider`, `myTournamentReviewProvider` |
| `lib/features/tournaments/presentation/widgets/tournament_review/review_star_row.dart` (criar) | fileira de 5 estrelas |
| `lib/features/tournaments/presentation/tournament_review_page.dart` (criar) | formulário |
| `lib/features/tournaments/presentation/widgets/tournament_review/tournament_review_cta.dart` (criar) | botão no detalhe e na campanha |
| `lib/features/tournaments/presentation/widgets/pending_tournament_reviews_section.dart` (criar) | card da Home |
| `lib/core/router/routes.dart`, `lib/core/router/app_router.dart` (modificar) | rota `avaliar` |
| `lib/features/tournaments/presentation/tournament_detail_page.dart` (modificar) | insere o botão |
| `lib/features/athlete/presentation/athlete_tournament_detail_page.dart` (modificar) | insere o botão na campanha |
| `lib/features/athlete/presentation/athlete_home_page.dart` (modificar) | insere o card |
| `lib/core/notifications/notification_navigation.dart` (modificar) | push vai para `/avaliar` |
| `lib/features/athlete/domain/athlete_notifications_logic.dart` (modificar) | inbox |
| `test/features/tournaments/tournament_review_*_test.dart` (criar) | testes |
| `test/core/notifications/notification_navigation_test.dart`, `test/features/athlete/athlete_notifications_logic_test.dart` (modificar) | testes |

**Parte B: portal (`frontend/projects/athlete/src/app/`)**

| Arquivo | Responsabilidade |
|---|---|
| `data/tournament-reviews.ts` (criar) | regras puras: aspectos, parse, estado, pergunta, rótulos, `dd/MM`, itens do card |
| `data/tournament-reviews-repository.ts` (criar) | streams, leitura da própria avaliação, callable, mensagens de erro |
| `data/tournament-review-submitter.ts` (criar) | camada injetável sobre a callable, para os specs |
| `data/pending-tournament-reviews.service.ts` (criar) | store raiz dos convites pendentes (painel) |
| `tournaments/tournament-live.store.ts` (modificar) | `reviewInvite`, `myReview`, `reloadMyReview()` |
| `tournaments/review/tournament-review-dialog.component.{ts,html,scss}` (criar) | diálogo |
| `tournaments/review/tournament-review-cta.component.ts` (criar) | botão nas abas |
| `tournaments/review/review-redirect.ts` (criar) | redirect de `torneios/:id/avaliar` |
| `tournaments/tournament-shell.component.{ts,html}` (modificar) | hospeda o diálogo (`?avaliar=1`) |
| `tournaments/tabs/overview-tab.component.{ts,html}`, `tournaments/tabs/registration-tab.component.{ts,html}` (modificar) | inserem o botão |
| `app.routes.ts` (modificar) | rota `avaliar` |
| `athlete-painel.component.{ts,html}` (modificar) | card "Avalie seus torneios" |
| `data/notifications-repository.ts`, `notificacoes/notification-target.ts` (criar), `notificacoes/athlete-notifications.component.ts` (modificar) | inbox leva para a avaliação |
| `*.spec.ts` correspondentes | specs |

**Comandos**
- **App, um teste:** `cd <worktree>/nexago_app && flutter test test/features/tournaments/<arquivo>_test.dart`
- **App, análise:** `cd <worktree>/nexago_app && flutter analyze <arquivos>`
- **Portal, um spec:** `cd <worktree>/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/<caminho>.spec.ts'`
- **Portal, build:** `cd <worktree>/frontend && npx ng build athlete --configuration production`

---

# Parte A — App (Flutter)

### Task A1: Modelos do convite e da avaliação

**Files:**
- Create: `nexago_app/lib/features/tournaments/domain/tournament_review_models.dart`
- Test: `nexago_app/test/features/tournaments/tournament_review_models_test.dart`

**Interfaces:**
- Produces:
  - `enum TournamentReviewAspect { organization, schedule, refereeing, venue, prizes }`, com `.key`, `.label` e `static fromKey(String)`.
  - `enum TournamentReviewInviteStatus { pending, submitted, expired }`.
  - `class TournamentReviewInvite { tournamentId, tournamentName, closesAt (DateTime), status, coverUrl? }`, com `static TournamentReviewInvite? fromMap(String id, Map<String, dynamic>? data)`.
  - `class MyTournamentReview { overall (int), aspects (Map<TournamentReviewAspect, int>), comment? }`, com `static MyTournamentReview? fromMap(Map<String, dynamic>? data)`.

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/tournaments/tournament_review_models_test.dart`:

```dart
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

void main() {
  group('TournamentReviewAspect', () {
    test('mesma lista e ordem do backend (functions/src/tournament-review-constants.ts)', () {
      final source =
          File('../functions/src/tournament-review-constants.ts').readAsStringSync();
      final block = RegExp(r'TOURNAMENT_REVIEW_ASPECTS = \[([^\]]*)\]')
          .firstMatch(source)!
          .group(1)!;
      final keys =
          RegExp(r'"([a-z]+)"').allMatches(block).map((m) => m.group(1)).toList();
      expect(TournamentReviewAspect.values.map((a) => a.key).toList(), keys);
    });

    test('fromKey devolve null para chave desconhecida', () {
      expect(TournamentReviewAspect.fromKey('venue'), TournamentReviewAspect.venue);
      expect(TournamentReviewAspect.fromKey('food'), isNull);
    });
  });

  group('TournamentReviewInvite.fromMap', () {
    final closes = DateTime(2026, 10, 15, 10);

    test('lê o convite gravado pelo job', () {
      final invite = TournamentReviewInvite.fromMap('t1', {
        'tournamentId': 't1',
        'tournamentName': ' Copa Areia ',
        'coverUrl': 'https://img/capa.jpg',
        'closesAt': Timestamp.fromDate(closes),
        'status': 'pending',
      })!;
      expect(invite.tournamentId, 't1');
      expect(invite.tournamentName, 'Copa Areia');
      expect(invite.coverUrl, 'https://img/capa.jpg');
      expect(invite.closesAt, closes);
      expect(invite.status, TournamentReviewInviteStatus.pending);
    });

    test('lê submitted e expired; status desconhecido conta como pendente', () {
      Map<String, dynamic> data(Object? status) =>
          {'closesAt': Timestamp.fromDate(closes), 'status': status};
      expect(TournamentReviewInvite.fromMap('t1', data('submitted'))!.status,
          TournamentReviewInviteStatus.submitted);
      expect(TournamentReviewInvite.fromMap('t1', data('expired'))!.status,
          TournamentReviewInviteStatus.expired);
      expect(TournamentReviewInvite.fromMap('t1', data('???'))!.status,
          TournamentReviewInviteStatus.pending);
    });

    test('sem closesAt não há convite; sem tournamentId usa o id do doc', () {
      expect(TournamentReviewInvite.fromMap('t1', {'status': 'pending'}), isNull);
      expect(TournamentReviewInvite.fromMap('t1', null), isNull);
      expect(
        TournamentReviewInvite.fromMap('t9', {'closesAt': Timestamp.fromDate(closes)})!
            .tournamentId,
        't9',
      );
    });
  });

  group('MyTournamentReview.fromMap', () {
    test('lê nota, aspectos válidos e comentário', () {
      final review = MyTournamentReview.fromMap({
        'overall': 4,
        'aspects': {'schedule': 2, 'venue': 5},
        'comment': 'Atrasou',
      })!;
      expect(review.overall, 4);
      expect(review.aspects, {
        TournamentReviewAspect.schedule: 2,
        TournamentReviewAspect.venue: 5,
      });
      expect(review.comment, 'Atrasou');
    });

    test('ignora aspecto desconhecido ou fora de 1..5 e trata comentário vazio como null', () {
      final review = MyTournamentReview.fromMap({
        'overall': 3,
        'aspects': {'food': 5, 'schedule': 9, 'venue': 1},
        'comment': '   ',
      })!;
      expect(review.aspects, {TournamentReviewAspect.venue: 1});
      expect(review.comment, isNull);
    });

    test('sem nota geral válida não há avaliação', () {
      expect(MyTournamentReview.fromMap({'overall': 0}), isNull);
      expect(MyTournamentReview.fromMap({'overall': '5'}), isNull);
      expect(MyTournamentReview.fromMap(null), isNull);
    });
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_review_models_test.dart`

Expected: falha de compilação, `Target of URI doesn't exist: 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart'`.

- [ ] **Step 3: Implementar**

`nexago_app/lib/features/tournaments/domain/tournament_review_models.dart`:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';

/// Avaliação do torneio pelos atletas — spec
/// `docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md`.
///
/// Aspectos opcionais: MESMA lista e ordem de `functions/src/tournament-review-constants.ts`
/// (o teste de paridade lê aquele arquivo).
enum TournamentReviewAspect {
  organization('organization', 'Organização geral'),
  schedule('schedule', 'Cumprimento dos horários'),
  refereeing('refereeing', 'Arbitragem / mesa'),
  venue('venue', 'Estrutura do local'),
  prizes('prizes', 'Premiação e kit');

  const TournamentReviewAspect(this.key, this.label);

  final String key;
  final String label;

  static TournamentReviewAspect? fromKey(String key) {
    for (final aspect in values) {
      if (aspect.key == key) return aspect;
    }
    return null;
  }
}

enum TournamentReviewInviteStatus { pending, submitted, expired }

/// `users/{uid}/tournamentReviewInvites/{tournamentId}` — só o servidor grava. É a única prova
/// de "posso avaliar este torneio, e até quando".
class TournamentReviewInvite {
  const TournamentReviewInvite({
    required this.tournamentId,
    required this.tournamentName,
    required this.closesAt,
    required this.status,
    this.coverUrl,
  });

  final String tournamentId;
  final String tournamentName;
  final DateTime closesAt;
  final TournamentReviewInviteStatus status;
  final String? coverUrl;

  /// Sem `closesAt` o prazo é desconhecido — o convite é tratado como ausente.
  static TournamentReviewInvite? fromMap(String id, Map<String, dynamic>? data) {
    if (data == null) return null;
    final closesAt = _dateOf(data['closesAt']);
    if (closesAt == null) return null;
    final tournamentId = _textOf(data['tournamentId']);
    final coverUrl = _textOf(data['coverUrl']);
    return TournamentReviewInvite(
      tournamentId: tournamentId.isEmpty ? id : tournamentId,
      tournamentName: _textOf(data['tournamentName']),
      closesAt: closesAt,
      status: switch (data['status']) {
        'submitted' => TournamentReviewInviteStatus.submitted,
        'expired' => TournamentReviewInviteStatus.expired,
        _ => TournamentReviewInviteStatus.pending,
      },
      coverUrl: coverUrl.isEmpty ? null : coverUrl,
    );
  }
}

/// `tournamentReviews/{tournamentId}_{uid}`, lido pelo próprio autor para pré-preencher a
/// edição e mostrar "Você avaliou ★ N".
class MyTournamentReview {
  const MyTournamentReview({
    required this.overall,
    required this.aspects,
    this.comment,
  });

  final int overall;
  final Map<TournamentReviewAspect, int> aspects;
  final String? comment;

  static MyTournamentReview? fromMap(Map<String, dynamic>? data) {
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
    return MyTournamentReview(
      overall: overall,
      aspects: aspects,
      comment: comment.isEmpty ? null : comment,
    );
  }
}

DateTime? _dateOf(Object? value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  return null;
}

String _textOf(Object? value) => value is String ? value.trim() : '';

int? _starOf(Object? value) {
  if (value is int && value >= 1 && value <= 5) return value;
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_review_models_test.dart`

Expected: `All tests passed!` (8 testes).

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add nexago_app/lib/features/tournaments/domain/tournament_review_models.dart nexago_app/test/features/tournaments/tournament_review_models_test.dart
git commit -m "feat(app): modelos do convite e da avaliação de torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A2: Regras puras (estado do botão, convites abertos, textos)

**Files:**
- Create: `nexago_app/lib/features/tournaments/domain/tournament_review_logic.dart`
- Test: `nexago_app/test/features/tournaments/tournament_review_logic_test.dart`

**Interfaces:**
- Consumes: os modelos da A1.
- Produces:
  - `const int kTournamentReviewXp = 10`.
  - `const int kTournamentReviewCommentMax = 1000`.
  - `enum TournamentReviewCtaState { none, pending, submitted, closed }`.
  - `bool isTournamentReviewOpen(TournamentReviewInvite invite, DateTime now)`.
  - `TournamentReviewCtaState tournamentReviewCtaState(TournamentReviewInvite? invite, DateTime now)`.
  - `List<TournamentReviewInvite> openPendingTournamentReviews(Iterable<TournamentReviewInvite> invites, DateTime now)`.
  - `String tournamentReviewLabel(String name)`.
  - `String tournamentReviewQuestion(String name)`.
  - `String tournamentReviewRatingLabel(int? rating)`.
  - `String tournamentReviewDayMonth(DateTime at)`.

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/tournaments/tournament_review_logic_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  final now = DateTime(2026, 10, 6, 12);

  TournamentReviewInvite invite({
    String id = 't1',
    TournamentReviewInviteStatus status = TournamentReviewInviteStatus.pending,
    DateTime? closesAt,
  }) =>
      TournamentReviewInvite(
        tournamentId: id,
        tournamentName: 'Copa',
        closesAt: closesAt ?? now.add(const Duration(days: 5)),
        status: status,
      );

  group('tournamentReviewCtaState', () {
    test('sem convite não mostra nada', () {
      expect(tournamentReviewCtaState(null, now), TournamentReviewCtaState.none);
    });

    test('pendente e aberto pede a avaliação; enviado e aberto permite editar', () {
      expect(tournamentReviewCtaState(invite(), now), TournamentReviewCtaState.pending);
      expect(
        tournamentReviewCtaState(
            invite(status: TournamentReviewInviteStatus.submitted), now),
        TournamentReviewCtaState.submitted,
      );
    });

    test('closesAt vencido fecha mesmo com o convite ainda pending (job atrasado)', () {
      expect(tournamentReviewCtaState(invite(closesAt: now), now),
          TournamentReviewCtaState.closed);
      expect(
        tournamentReviewCtaState(
            invite(status: TournamentReviewInviteStatus.expired), now),
        TournamentReviewCtaState.closed,
      );
    });
  });

  test('openPendingTournamentReviews: só pendentes abertos, o que fecha antes primeiro', () {
    final list = openPendingTournamentReviews([
      invite(id: 'late', closesAt: now.add(const Duration(days: 9))),
      invite(id: 'vencido', closesAt: now.subtract(const Duration(minutes: 1))),
      invite(id: 'feito', status: TournamentReviewInviteStatus.submitted),
      invite(id: 'soon', closesAt: now.add(const Duration(days: 1))),
    ], now);
    expect(list.map((i) => i.tournamentId), ['soon', 'late']);
  });

  group('tournamentReviewQuestion', () {
    test('o artigo concorda com "torneio", não com o nome', () {
      expect(tournamentReviewQuestion('Liga nexaGO – 1ª etapa'),
          'Como foi o torneio Liga nexaGO – 1ª etapa?');
      expect(tournamentReviewQuestion('Copa VH'), 'Como foi o torneio Copa VH?');
    });

    test('nome vazio e nome que já começa com Torneio', () {
      expect(tournamentReviewQuestion('  '), 'Como foi o torneio?');
      expect(tournamentReviewQuestion('Torneio de Verão'), 'Como foi o Torneio de Verão?');
    });
  });

  test('tournamentReviewRatingLabel', () {
    expect(
      [1, 2, 3, 4, 5].map(tournamentReviewRatingLabel).toList(),
      ['Péssimo', 'Ruim', 'Ok', 'Bom', 'Excelente'],
    );
    expect(tournamentReviewRatingLabel(null), '');
  });

  test('tournamentReviewDayMonth formata dd/MM', () {
    expect(tournamentReviewDayMonth(DateTime(2026, 10, 15, 10)), '15/10');
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_review_logic_test.dart`

Expected: falha de compilação, `Target of URI doesn't exist: '...tournament_review_logic.dart'`.

- [ ] **Step 3: Implementar**

`nexago_app/lib/features/tournaments/domain/tournament_review_logic.dart`:

```dart
import 'package:intl/intl.dart';

import 'tournament_review_models.dart';

const int kTournamentReviewXp = 10;
const int kTournamentReviewCommentMax = 1000;

enum TournamentReviewCtaState { none, pending, submitted, closed }

/// Aberto = não expirou E o prazo não passou. O status sozinho não basta: o job que marca
/// `expired` roda uma vez por dia (e para inteiro com a flag desligada).
bool isTournamentReviewOpen(TournamentReviewInvite invite, DateTime now) =>
    invite.status != TournamentReviewInviteStatus.expired &&
    invite.closesAt.isAfter(now);

TournamentReviewCtaState tournamentReviewCtaState(
  TournamentReviewInvite? invite,
  DateTime now,
) {
  if (invite == null) return TournamentReviewCtaState.none;
  if (!isTournamentReviewOpen(invite, now)) return TournamentReviewCtaState.closed;
  return invite.status == TournamentReviewInviteStatus.submitted
      ? TournamentReviewCtaState.submitted
      : TournamentReviewCtaState.pending;
}

/// Convites para o card da Home: pendentes e abertos, o que fecha antes primeiro.
List<TournamentReviewInvite> openPendingTournamentReviews(
  Iterable<TournamentReviewInvite> invites,
  DateTime now,
) {
  final open = invites
      .where((i) =>
          i.status == TournamentReviewInviteStatus.pending &&
          isTournamentReviewOpen(i, now))
      .toList()
    ..sort((a, b) => a.closesAt.compareTo(b.closesAt));
  return open;
}

/// Mesma regra do push (`functions/src/tournament-review-notifications.ts`): o artigo concorda
/// com a palavra "torneio" — "o Liga nexaGO" e "o Copa VH" saíam errados.
String tournamentReviewLabel(String name) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) return 'torneio';
  return RegExp(r'^torneio\b', caseSensitive: false).hasMatch(trimmed)
      ? trimmed
      : 'torneio $trimmed';
}

String tournamentReviewQuestion(String name) =>
    'Como foi o ${tournamentReviewLabel(name)}?';

String tournamentReviewRatingLabel(int? rating) => switch (rating) {
      1 => 'Péssimo',
      2 => 'Ruim',
      3 => 'Ok',
      4 => 'Bom',
      5 => 'Excelente',
      _ => '',
    };

final _dayMonth = DateFormat('dd/MM', 'pt_BR');

String tournamentReviewDayMonth(DateTime at) => _dayMonth.format(at.toLocal());
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_review_logic_test.dart`

Expected: `All tests passed!` (9 testes).

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add nexago_app/lib/features/tournaments/domain/tournament_review_logic.dart nexago_app/test/features/tournaments/tournament_review_logic_test.dart
git commit -m "feat(app): regras puras da avaliação de torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A3: Serviço (streams, leitura própria, callable)

**Files:**
- Create: `nexago_app/lib/features/tournaments/data/tournament_review_service.dart`
- Test: `nexago_app/test/features/tournaments/tournament_review_service_test.dart`

**Interfaces:**
- Consumes:
  - Modelos da A1.
  - `nexagoFunctions` de `lib/core/firebase/functions_region.dart`.
  - `callableErrorMessage(String code, String? message, String fallback)` de `lib/features/tournaments/data/tournament_partner_invite_service.dart`.
- Produces:
  - `class TournamentReviewException implements Exception { final String message; }`.
  - `class TournamentReviewService({FirebaseFirestore? firestore, FirebaseFunctions? functions})`, com:
    - `Stream<List<TournamentReviewInvite>> watchPendingInvites(String uid)`
    - `Stream<TournamentReviewInvite?> watchInvite(String uid, String tournamentId)`
    - `Future<MyTournamentReview?> fetchMyReview(String uid, String tournamentId)`
    - `Future<bool> submit({required String tournamentId, required int overall, required Map<TournamentReviewAspect, int> aspects, String? comment})`, que devolve `created`.
  - `final tournamentReviewServiceProvider = Provider<TournamentReviewService>(...)`.

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/tournaments/tournament_review_service_test.dart`:

```dart
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_review_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

void main() {
  group('TournamentReviewService.submit', () {
    test('manda nota, aspectos pelas chaves do backend e comentário recortado', () async {
      final functions = _FakeFunctions();
      final service = TournamentReviewService(functions: functions);

      final created = await service.submit(
        tournamentId: 't1',
        overall: 4,
        aspects: {
          TournamentReviewAspect.schedule: 2,
          TournamentReviewAspect.venue: 5,
        },
        comment: '  Atrasou  ',
      );

      expect(created, isTrue);
      expect(functions.calls.single.name, 'submitTournamentReview');
      expect(functions.calls.single.payload, {
        'tournamentId': 't1',
        'overall': 4,
        'aspects': {'schedule': 2, 'venue': 5},
        'comment': 'Atrasou',
      });
    });

    test('comentário só com espaços vai como null e sem aspectos vai mapa vazio', () async {
      final functions = _FakeFunctions();
      await TournamentReviewService(functions: functions).submit(
        tournamentId: 't1',
        overall: 5,
        aspects: const {},
        comment: ' \n ',
      );
      expect(functions.calls.single.payload!['comment'], isNull);
      expect(functions.calls.single.payload!['aspects'], <String, int>{});
    });

    test('edição: created=false devolve false', () async {
      final functions = _FakeFunctions()..result = const {'ok': true, 'created': false};
      final created = await TournamentReviewService(functions: functions)
          .submit(tournamentId: 't1', overall: 3, aspects: const {});
      expect(created, isFalse);
    });

    test('a mensagem do servidor chega ao atleta', () async {
      final functions = _FakeFunctions()
        ..error = _TestFunctionsException(
          code: 'failed-precondition',
          message: 'A avaliação deste torneio foi encerrada.',
        );
      await expectLater(
        TournamentReviewService(functions: functions)
            .submit(tournamentId: 't1', overall: 3, aspects: const {}),
        throwsA(isA<TournamentReviewException>().having(
            (e) => e.message, 'message', 'A avaliação deste torneio foi encerrada.')),
      );
    });

    test('callable não deployada ("NOT FOUND") vira mensagem legível', () async {
      final functions = _FakeFunctions()
        ..error = _TestFunctionsException(code: 'not-found', message: 'NOT FOUND');
      await expectLater(
        TournamentReviewService(functions: functions)
            .submit(tournamentId: 't1', overall: 3, aspects: const {}),
        throwsA(isA<TournamentReviewException>().having(
          (e) => e.message,
          'message',
          'Não foi possível enviar sua avaliação. Tente de novo em instantes.',
        )),
      );
    });
  });
}

class _TestFunctionsException extends FirebaseFunctionsException {
  _TestFunctionsException({required super.code, required super.message});
}

/// Fake mínimo de [FirebaseFunctions] — padrão de
/// `test/features/organizer/organizer_category_ops_service_payment_test.dart`, com retorno
/// configurável (`created` decide o XP).
class _FakeFunctions implements FirebaseFunctions {
  final calls = <({String name, Map<String, dynamic>? payload})>[];
  Object? result = const {'ok': true, 'created': true};
  Object? error;

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeCallable((parameters) {
      calls.add((
        name: name,
        payload: parameters is Map ? Map<String, dynamic>.from(parameters) : null,
      ));
      final failure = error;
      if (failure != null) throw failure;
      return result;
    });
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeCallable implements HttpsCallable {
  _FakeCallable(this.onCall);

  final Object? Function(dynamic parameters) onCall;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async =>
      _FakeResult<T>(onCall(parameters));

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeResult<T> implements HttpsCallableResult<T> {
  _FakeResult(this._data);

  final Object? _data;

  @override
  T get data => _data as T;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_review_service_test.dart`

Expected: falha de compilação, `Target of URI doesn't exist: '...tournament_review_service.dart'`.

- [ ] **Step 3: Implementar**

`nexago_app/lib/features/tournaments/data/tournament_review_service.dart`:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../domain/tournament_review_models.dart';
import 'tournament_partner_invite_service.dart' show callableErrorMessage;

class TournamentReviewException implements Exception {
  const TournamentReviewException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Leitura do convite e da própria avaliação + envio pela callable `submitTournamentReview`.
/// O cliente nunca grava nas coleções da avaliação (rules: `write: false`).
class TournamentReviewService {
  TournamentReviewService({
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
  })  : _firestoreOverride = firestore,
        _functionsOverride = functions;

  final FirebaseFirestore? _firestoreOverride;
  final FirebaseFunctions? _functionsOverride;

  // Preguiçosos: o teste do envio injeta só o fake de functions e nunca toca no Firestore.
  FirebaseFirestore get _firestore =>
      _firestoreOverride ?? FirebaseFirestore.instance;
  FirebaseFunctions get _functions => _functionsOverride ?? nexagoFunctions;

  static const _submitFallback =
      'Não foi possível enviar sua avaliação. Tente de novo em instantes.';

  CollectionReference<Map<String, dynamic>> _invites(String uid) => _firestore
      .collection('users')
      .doc(uid)
      .collection('tournamentReviewInvites');

  Stream<List<TournamentReviewInvite>> watchPendingInvites(String uid) =>
      _invites(uid).where('status', isEqualTo: 'pending').snapshots().map(
            (snap) => snap.docs
                .map((d) => TournamentReviewInvite.fromMap(d.id, d.data()))
                .whereType<TournamentReviewInvite>()
                .toList(),
          );

  Stream<TournamentReviewInvite?> watchInvite(String uid, String tournamentId) =>
      _invites(uid).doc(tournamentId).snapshots().map(
            (snap) => TournamentReviewInvite.fromMap(snap.id, snap.data()),
          );

  /// Só depois de o convite dizer `submitted`: a rule nega leitura de doc inexistente.
  Future<MyTournamentReview?> fetchMyReview(String uid, String tournamentId) async {
    final snap = await _firestore
        .collection('tournamentReviews')
        .doc('${tournamentId}_$uid')
        .get();
    return MyTournamentReview.fromMap(snap.data());
  }

  /// `true` na 1ª avaliação (é quando o XP é pago), `false` numa edição.
  Future<bool> submit({
    required String tournamentId,
    required int overall,
    required Map<TournamentReviewAspect, int> aspects,
    String? comment,
  }) async {
    final trimmed = comment?.trim() ?? '';
    try {
      final result = await _functions
          .httpsCallable('submitTournamentReview')
          .call<Object?>({
        'tournamentId': tournamentId,
        'overall': overall,
        'aspects': {for (final e in aspects.entries) e.key.key: e.value},
        'comment': trimmed.isEmpty ? null : trimmed,
      });
      final data = result.data;
      return data is Map && data['created'] == true;
    } on FirebaseFunctionsException catch (e) {
      throw TournamentReviewException(
        callableErrorMessage(e.code, e.message, _submitFallback),
      );
    }
  }
}

final tournamentReviewServiceProvider = Provider<TournamentReviewService>((ref) {
  return TournamentReviewService();
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_review_service_test.dart`

Expected: `All tests passed!` (5 testes).

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add nexago_app/lib/features/tournaments/data/tournament_review_service.dart nexago_app/test/features/tournaments/tournament_review_service_test.dart
git commit -m "feat(app): serviço da avaliação de torneio (convite, leitura própria, callable)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A4: Providers

**Files:**
- Create: `nexago_app/lib/features/tournaments/domain/tournament_review_providers.dart`
- Test: `nexago_app/test/features/tournaments/tournament_review_providers_test.dart`

**Interfaces:**
- Consumes:
  - `authProvider` de `lib/core/auth/auth_providers.dart`.
  - `tournamentReviewServiceProvider` (A3).
  - `openPendingTournamentReviews` (A2).
- Produces:
  - `pendingTournamentReviewsProvider`: `StreamProvider.autoDispose<List<TournamentReviewInvite>>`.
  - `tournamentReviewInviteProvider`: `StreamProvider.autoDispose.family<TournamentReviewInvite?, String>`.
  - `myTournamentReviewProvider`: `FutureProvider.autoDispose.family<MyTournamentReview?, String>`.

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/tournaments/tournament_review_providers_test.dart`:

```dart
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/features/tournaments/data/tournament_review_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_providers.dart';

void main() {
  final future = DateTime.now().add(const Duration(days: 5));
  final past = DateTime.now().subtract(const Duration(days: 1));

  TournamentReviewInvite invite(String id, DateTime closesAt,
          [TournamentReviewInviteStatus status = TournamentReviewInviteStatus.pending]) =>
      TournamentReviewInvite(
          tournamentId: id, tournamentName: 'Copa', closesAt: closesAt, status: status);

  ProviderContainer container(_FakeReviewService service) {
    final c = ProviderContainer(overrides: [
      authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
      tournamentReviewServiceProvider.overrideWithValue(service),
    ]);
    addTearDown(c.dispose);
    return c;
  }

  test('pendentes: descarta convite com prazo vencido mesmo marcado pending', () async {
    final c = container(_FakeReviewService(
        pending: [invite('vencido', past), invite('aberto', future)]));
    final sub = c.listen(pendingTournamentReviewsProvider, (_, __) {});
    addTearDown(sub.close);
    await c.read(authProvider.future);

    final list = await c.read(pendingTournamentReviewsProvider.future);

    expect(list.map((i) => i.tournamentId), ['aberto']);
  });

  test('avaliação própria: só lê depois de o convite dizer submitted', () async {
    final pendingService = _FakeReviewService(invite: invite('t1', future));
    final c1 = container(pendingService);
    final s1 = c1.listen(tournamentReviewInviteProvider('t1'), (_, __) {});
    addTearDown(s1.close);
    await c1.read(authProvider.future);
    await c1.read(tournamentReviewInviteProvider('t1').future);
    expect(await c1.read(myTournamentReviewProvider('t1').future), isNull);
    expect(pendingService.fetchCalls, isEmpty);

    final submittedService = _FakeReviewService(
        invite: invite('t1', future, TournamentReviewInviteStatus.submitted));
    final c2 = container(submittedService);
    final s2 = c2.listen(tournamentReviewInviteProvider('t1'), (_, __) {});
    addTearDown(s2.close);
    await c2.read(authProvider.future);
    await c2.read(tournamentReviewInviteProvider('t1').future);
    expect((await c2.read(myTournamentReviewProvider('t1').future))!.overall, 4);
    expect(submittedService.fetchCalls, ['u1/t1']);
  });
}

class _FakeReviewService implements TournamentReviewService {
  _FakeReviewService({this.pending = const [], this.invite});

  final List<TournamentReviewInvite> pending;
  final TournamentReviewInvite? invite;
  final fetchCalls = <String>[];

  @override
  Stream<List<TournamentReviewInvite>> watchPendingInvites(String uid) =>
      Stream.value(pending);

  @override
  Stream<TournamentReviewInvite?> watchInvite(String uid, String tournamentId) =>
      Stream.value(invite);

  @override
  Future<MyTournamentReview?> fetchMyReview(String uid, String tournamentId) async {
    fetchCalls.add('$uid/$tournamentId');
    return const MyTournamentReview(overall: 4, aspects: {});
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('O dublê não implementa ${invocation.memberName}.');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_review_providers_test.dart`

Expected: falha de compilação, `Target of URI doesn't exist: '...tournament_review_providers.dart'`.

- [ ] **Step 3: Implementar**

`nexago_app/lib/features/tournaments/domain/tournament_review_providers.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../data/tournament_review_service.dart';
import 'tournament_review_logic.dart';
import 'tournament_review_models.dart';

/// Convites pendentes E ainda abertos (card da Home). Quem decide é o `closesAt`, não só o
/// status — o job que marca `expired` roda uma vez por dia.
final pendingTournamentReviewsProvider =
    StreamProvider.autoDispose<List<TournamentReviewInvite>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(tournamentReviewServiceProvider)
      .watchPendingInvites(uid)
      .map((invites) => openPendingTournamentReviews(invites, DateTime.now()));
});

final tournamentReviewInviteProvider = StreamProvider.autoDispose
    .family<TournamentReviewInvite?, String>((ref, tournamentId) {
  final uid = ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
  final id = tournamentId.trim();
  if (uid.isEmpty || id.isEmpty) return Stream.value(null);
  return ref.watch(tournamentReviewServiceProvider).watchInvite(uid, id);
});

/// A avaliação do próprio atleta — "Você avaliou ★ N" e o pré-preenchimento da edição. Só lê
/// depois de o convite dizer `submitted`: antes disso o doc não existe e a rule nega.
final myTournamentReviewProvider = FutureProvider.autoDispose
    .family<MyTournamentReview?, String>((ref, tournamentId) async {
  final uid = ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
  final invite = ref.watch(tournamentReviewInviteProvider(tournamentId)).valueOrNull;
  if (uid.isEmpty ||
      invite == null ||
      invite.status != TournamentReviewInviteStatus.submitted) {
    return null;
  }
  return ref
      .watch(tournamentReviewServiceProvider)
      .fetchMyReview(uid, tournamentId.trim());
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_review_providers_test.dart`

Expected: `All tests passed!` (2 testes).

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add nexago_app/lib/features/tournaments/domain/tournament_review_providers.dart nexago_app/test/features/tournaments/tournament_review_providers_test.dart
git commit -m "feat(app): providers da avaliação de torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A5: Formulário (página `/torneios/:id/avaliar`)

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/widgets/tournament_review/review_star_row.dart`
- Create: `nexago_app/lib/features/tournaments/presentation/tournament_review_page.dart`
- Modify: `nexago_app/lib/core/router/routes.dart`, depois de `tournamentPodium` (~linha 431) e do nome `tournamentPodium` (~linha 724).
- Modify: `nexago_app/lib/core/router/app_router.dart`: import perto da linha 182 e `GoRoute` depois de `path: 'podio'` (~linha 1259-1266).
- Test: `nexago_app/test/features/tournaments/tournament_review_page_test.dart`

**Interfaces:**
- Consumes: A1–A4; `TournamentDetailSubpageScaffold`; `showAppSnackBar`; `AppEmptyView`, `AppInlineErrorView` (`lib/core/ui/app_status_views.dart`).
- Produces:
  - `TournamentReviewPage({required String tournamentId})`.
  - `ReviewStarRow({required int? value, required ValueChanged<int?> onChanged, required String keyPrefix, double size, bool allowClear, bool enabled})`, com as chaves `ValueKey('$keyPrefix-$estrela')`.
  - `AppRoutes.tournamentReview = '/torneios/:tournamentId/avaliar'` e `AppRouteNames.tournamentReview = 'tournamentReview'`.
  - Botão de enviar com `ValueKey('review-submit')`.

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/tournaments/tournament_review_page_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/data/tournament_review_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_review_page.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  TournamentReviewInvite invite({
    TournamentReviewInviteStatus status = TournamentReviewInviteStatus.pending,
    DateTime? closesAt,
  }) =>
      TournamentReviewInvite(
        tournamentId: 't1',
        tournamentName: 'Copa Areia',
        closesAt: closesAt ?? DateTime.now().add(const Duration(days: 5)),
        status: status,
      );

  Future<void> pumpPage(
    WidgetTester tester, {
    required TournamentReviewInvite? invite,
    MyTournamentReview? existing,
    required _FakeReviewService service,
  }) async {
    final router = GoRouter(
      initialLocation: '/torneios/t1/avaliar',
      routes: [
        GoRoute(
          path: '/torneios/:tournamentId',
          name: AppRouteNames.tournamentDetail,
          builder: (_, __) => const Scaffold(body: Text('detalhe do torneio')),
          routes: [
            GoRoute(
              path: 'avaliar',
              name: AppRouteNames.tournamentReview,
              builder: (_, state) => TournamentReviewPage(
                tournamentId: state.pathParameters['tournamentId']!,
              ),
            ),
          ],
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        tournamentReviewInviteProvider('t1').overrideWith((ref) => Stream.value(invite)),
        myTournamentReviewProvider('t1').overrideWith((ref) async => existing),
        tournamentReviewServiceProvider.overrideWithValue(service),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ));
    await tester.pumpAndSettle();
  }

  Future<void> tapKey(WidgetTester tester, String key) async {
    final finder = find.byKey(ValueKey(key));
    await tester.ensureVisible(finder);
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  testWidgets('sem nota geral o botão não envia', (tester) async {
    await pumpPage(tester, invite: invite(), service: _FakeReviewService());
    expect(find.text('Como foi o torneio Copa Areia?'), findsOneWidget);
    final button = tester.widget<FilledButton>(find.byKey(const ValueKey('review-submit')));
    expect(button.onPressed, isNull);
  });

  testWidgets('envia nota, aspecto e comentário e volta pro torneio com o XP', (tester) async {
    final service = _FakeReviewService();
    await pumpPage(tester, invite: invite(), service: service);

    await tapKey(tester, 'overall-4');
    expect(find.text('Bom'), findsOneWidget);
    await tapKey(tester, 'schedule-2');
    await tester.ensureVisible(find.byType(TextField));
    await tester.enterText(find.byType(TextField), 'Atrasou');
    await tapKey(tester, 'review-submit');

    expect(service.submits.single.overall, 4);
    expect(service.submits.single.aspects, {TournamentReviewAspect.schedule: 2});
    expect(service.submits.single.comment, 'Atrasou');
    expect(find.text('Obrigado! +10 XP'), findsOneWidget);
    expect(find.text('detalhe do torneio'), findsOneWidget);
  });

  testWidgets('tocar de novo na mesma estrela do aspecto limpa a nota', (tester) async {
    final service = _FakeReviewService();
    await pumpPage(tester, invite: invite(), service: service);

    await tapKey(tester, 'overall-5');
    await tapKey(tester, 'venue-3');
    await tapKey(tester, 'venue-3');
    await tapKey(tester, 'review-submit');

    expect(service.submits.single.aspects, isEmpty);
  });

  testWidgets('edição chega preenchida e o sucesso diz Avaliação atualizada.', (tester) async {
    final service = _FakeReviewService()..created = false;
    await pumpPage(
      tester,
      invite: invite(status: TournamentReviewInviteStatus.submitted),
      existing: const MyTournamentReview(
        overall: 3,
        aspects: {TournamentReviewAspect.venue: 2},
        comment: 'Bom torneio',
      ),
      service: service,
    );

    expect(find.text('Salvar alterações'), findsOneWidget);
    expect(find.text('Ok'), findsOneWidget);
    expect(find.text('Bom torneio'), findsOneWidget);
    await tapKey(tester, 'review-submit');

    expect(service.submits.single.overall, 3);
    expect(service.submits.single.aspects, {TournamentReviewAspect.venue: 2});
    expect(find.text('Avaliação atualizada.'), findsOneWidget);
  });

  testWidgets('convite vencido (ainda pending) mostra encerrada e nenhum formulário', (tester) async {
    await pumpPage(
      tester,
      invite: invite(closesAt: DateTime(2025, 10, 15, 10)),
      service: _FakeReviewService(),
    );
    expect(find.text('Avaliação encerrada em 15/10'), findsOneWidget);
    expect(find.byKey(const ValueKey('review-submit')), findsNothing);
  });

  testWidgets('sem convite explica que só quem jogou avalia', (tester) async {
    await pumpPage(tester, invite: null, service: _FakeReviewService());
    expect(find.text('Nada para avaliar aqui'), findsOneWidget);
  });

  testWidgets('erro do servidor aparece e o formulário continua', (tester) async {
    final service = _FakeReviewService()
      ..error = const TournamentReviewException('A avaliação deste torneio foi encerrada.');
    await pumpPage(tester, invite: invite(), service: service);

    await tapKey(tester, 'overall-2');
    await tapKey(tester, 'review-submit');

    expect(find.text('A avaliação deste torneio foi encerrada.'), findsOneWidget);
    expect(find.byKey(const ValueKey('review-submit')), findsOneWidget);
  });
}

class _FakeReviewService implements TournamentReviewService {
  final submits = <({int overall, Map<TournamentReviewAspect, int> aspects, String? comment})>[];
  bool created = true;
  Object? error;

  @override
  Future<bool> submit({
    required String tournamentId,
    required int overall,
    required Map<TournamentReviewAspect, int> aspects,
    String? comment,
  }) async {
    submits.add((overall: overall, aspects: aspects, comment: comment));
    final failure = error;
    if (failure != null) throw failure;
    return created;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('O dublê não implementa ${invocation.memberName}.');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_review_page_test.dart`

Expected: falha de compilação. A página e `AppRouteNames.tournamentReview` não existem.

- [ ] **Step 3: Implementar a rota**

Em `nexago_app/lib/core/router/routes.dart`, logo depois de `static const String tournamentPodium = '/torneios/:tournamentId/podio';`:

```dart

  /// Avaliação do torneio pelo atleta: `/torneios/:tournamentId/avaliar`
  static const String tournamentReview = '/torneios/:tournamentId/avaliar';
```

E logo depois de `static const String tournamentPodium = 'tournamentPodium';`:

```dart
  static const String tournamentReview = 'tournamentReview';
```

Em `nexago_app/lib/core/router/app_router.dart`, ao lado do import de `tournament_podium_page.dart`:

```dart
import '../../features/tournaments/presentation/tournament_review_page.dart';
```

E logo depois do `GoRoute(path: 'podio', ...)`, dentro das `routes:` do detalhe:

```dart
          GoRoute(
            path: 'avaliar',
            name: AppRouteNames.tournamentReview,
            builder: (context, state) {
              final id = state.pathParameters['tournamentId']?.trim() ?? '';
              return TournamentReviewPage(tournamentId: id);
            },
          ),
```

- [ ] **Step 4: Implementar a fileira de estrelas**

`nexago_app/lib/features/tournaments/presentation/widgets/tournament_review/review_star_row.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Cinco estrelas tocáveis. Com [allowClear], tocar de novo na estrela marcada limpa a nota —
/// é como o atleta desfaz um aspecto opcional.
class ReviewStarRow extends StatelessWidget {
  const ReviewStarRow({
    super.key,
    required this.value,
    required this.onChanged,
    required this.keyPrefix,
    this.size = 40,
    this.allowClear = false,
    this.enabled = true,
  });

  final int? value;
  final ValueChanged<int?> onChanged;

  /// Prefixo das chaves das estrelas (`overall-4`, `schedule-2`): a tela tem várias fileiras.
  final String keyPrefix;
  final double size;
  final bool allowClear;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (index) {
        final star = index + 1;
        final filled = (value ?? 0) >= star;
        return Semantics(
          button: true,
          selected: value == star,
          label: '$star de 5',
          child: IconButton(
            key: ValueKey('$keyPrefix-$star'),
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
            constraints: BoxConstraints.tightFor(width: size + 8, height: size + 8),
            onPressed: enabled
                ? () => onChanged(allowClear && value == star ? null : star)
                : null,
            icon: Icon(
              filled ? Icons.star_rounded : Icons.star_outline_rounded,
              size: size,
              color: filled ? AppColors.brand : muted,
            ),
          ),
        );
      }),
    );
  }
}
```

- [ ] **Step 5: Implementar a página**

`nexago_app/lib/features/tournaments/presentation/tournament_review_page.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../core/router/routes.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../data/tournament_review_service.dart';
import '../domain/tournament_review_logic.dart';
import '../domain/tournament_review_models.dart';
import '../domain/tournament_review_providers.dart';
import 'widgets/tournament_detail/tournament_detail_subpage_scaffold.dart';
import 'widgets/tournament_review/review_star_row.dart';

/// Formulário da avaliação do torneio (`/torneios/:tournamentId/avaliar`). Nota geral
/// obrigatória, 5 aspectos opcionais e comentário opcional; anônimo para o organizador.
class TournamentReviewPage extends ConsumerStatefulWidget {
  const TournamentReviewPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  ConsumerState<TournamentReviewPage> createState() => _TournamentReviewPageState();
}

class _TournamentReviewPageState extends ConsumerState<TournamentReviewPage> {
  final _comment = TextEditingController();
  int? _overall;
  final _aspects = <TournamentReviewAspect, int>{};
  bool _sending = false;
  bool _prefilled = false;

  @override
  void initState() {
    super.initState();
    // Edição: pré-preenche UMA vez com a avaliação salva, sem atropelar o que o atleta já mexeu.
    ref.listenManual<AsyncValue<MyTournamentReview?>>(
      myTournamentReviewProvider(widget.tournamentId),
      (_, next) {
        final review = next.valueOrNull;
        if (review == null || _prefilled || !mounted) return;
        setState(() {
          _prefilled = true;
          _overall = review.overall;
          _aspects
            ..clear()
            ..addAll(review.aspects);
          _comment.text = review.comment ?? '';
        });
      },
      fireImmediately: true,
    );
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inviteAsync = ref.watch(tournamentReviewInviteProvider(widget.tournamentId));
    return TournamentDetailSubpageScaffold(
      title: 'Avaliar torneio',
      body: inviteAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) =>
            const AppInlineErrorView(message: 'Não foi possível carregar a avaliação.'),
        data: (invite) => _content(context, invite),
      ),
    );
  }

  Widget _content(BuildContext context, TournamentReviewInvite? invite) {
    final state = tournamentReviewCtaState(invite, DateTime.now());
    if (invite == null || state == TournamentReviewCtaState.none) {
      return const AppEmptyView(
        icon: Icons.star_outline_rounded,
        title: 'Nada para avaliar aqui',
        subtitle: 'Só quem jogou o torneio recebe o convite para avaliar.',
      );
    }
    if (state == TournamentReviewCtaState.closed) {
      return AppEmptyView(
        icon: Icons.lock_clock_outlined,
        title: 'Avaliação encerrada em ${tournamentReviewDayMonth(invite.closesAt)}',
        subtitle: 'A nota deste torneio já fechou. Obrigado por jogar!',
      );
    }

    final theme = Theme.of(context);
    final muted = context.themeColors.onSurfaceMuted;
    final isEdit = state == TournamentReviewCtaState.submitted;
    final eyebrow = theme.textTheme.labelSmall?.copyWith(
      color: muted,
      fontWeight: FontWeight.w800,
      letterSpacing: 0.8,
    );

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        Text(
          tournamentReviewQuestion(invite.tournamentName),
          style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 6),
        Text(
          isEdit
              ? 'Dá pra editar até ${tournamentReviewDayMonth(invite.closesAt)}.'
              : 'Sua nota ajuda o organizador a melhorar o próximo evento.',
          style: theme.textTheme.bodyMedium?.copyWith(color: muted),
        ),
        const SizedBox(height: 24),
        Text('NOTA GERAL', style: eyebrow),
        const SizedBox(height: 8),
        Center(
          child: ReviewStarRow(
            keyPrefix: 'overall',
            value: _overall,
            size: 40,
            enabled: !_sending,
            onChanged: (value) => setState(() => _overall = value),
          ),
        ),
        const SizedBox(height: 4),
        Center(
          child: Text(
            tournamentReviewRatingLabel(_overall),
            style: theme.textTheme.titleSmall?.copyWith(
              color: AppColors.brand,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(height: 24),
        Text('QUER DETALHAR? (OPCIONAL)', style: eyebrow),
        const SizedBox(height: 8),
        for (final aspect in TournamentReviewAspect.values)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(aspect.label, style: theme.textTheme.bodyMedium),
                ReviewStarRow(
                  keyPrefix: aspect.key,
                  value: _aspects[aspect],
                  size: 26,
                  allowClear: true,
                  enabled: !_sending,
                  onChanged: (value) => setState(() {
                    if (value == null) {
                      _aspects.remove(aspect);
                    } else {
                      _aspects[aspect] = value;
                    }
                  }),
                ),
              ],
            ),
          ),
        const SizedBox(height: 14),
        Text('COMENTÁRIO (OPCIONAL)', style: eyebrow),
        const SizedBox(height: 8),
        TextField(
          controller: _comment,
          enabled: !_sending,
          minLines: 3,
          maxLines: 6,
          maxLength: kTournamentReviewCommentMax,
          decoration: const InputDecoration(
            hintText: 'O que o organizador deveria manter ou mudar?',
          ),
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.lock_outline_rounded, size: 16, color: muted),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                'O organizador lê sem o seu nome. Evite se identificar no texto.',
                style: theme.textTheme.bodySmall?.copyWith(color: muted),
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        SizedBox(
          height: 48,
          child: FilledButton(
            key: const ValueKey('review-submit'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            onPressed: _overall == null || _sending ? null : () => _submit(invite),
            child: Text(
              _sending
                  ? 'Enviando…'
                  : isEdit
                      ? 'Salvar alterações'
                      : 'Enviar avaliação',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _submit(TournamentReviewInvite invite) async {
    final overall = _overall;
    if (overall == null || _sending) return;
    setState(() => _sending = true);
    try {
      final created = await ref.read(tournamentReviewServiceProvider).submit(
            tournamentId: invite.tournamentId,
            overall: overall,
            aspects: Map.of(_aspects),
            comment: _comment.text,
          );
      if (!mounted) return;
      ref.invalidate(myTournamentReviewProvider(widget.tournamentId));
      showAppSnackBar(
        context,
        created ? 'Obrigado! +$kTournamentReviewXp XP' : 'Avaliação atualizada.',
      );
      if (context.canPop()) {
        context.pop();
      } else {
        context.goNamed(
          AppRouteNames.tournamentDetail,
          pathParameters: {'tournamentId': widget.tournamentId},
        );
      }
    } on TournamentReviewException catch (e) {
      if (mounted) showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(
          context,
          'Não foi possível enviar sua avaliação. Tente de novo em instantes.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }
}
```

- [ ] **Step 6: Rodar o teste e a análise**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_review_page_test.dart && flutter analyze lib/features/tournaments/presentation/tournament_review_page.dart lib/features/tournaments/presentation/widgets/tournament_review/review_star_row.dart lib/core/router/routes.dart lib/core/router/app_router.dart`

Expected: `All tests passed!` (7 testes) e `No issues found!`.

- [ ] **Step 7: Commit**

```bash
pwd && git branch --show-current
git add nexago_app/lib/features/tournaments/presentation/tournament_review_page.dart nexago_app/lib/features/tournaments/presentation/widgets/tournament_review/review_star_row.dart nexago_app/lib/core/router/routes.dart nexago_app/lib/core/router/app_router.dart nexago_app/test/features/tournaments/tournament_review_page_test.dart
git commit -m "feat(app): formulário de avaliação do torneio em /torneios/:id/avaliar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A6: Botão no detalhe do torneio e na campanha

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/widgets/tournament_review/tournament_review_cta.dart`
- Modify: `nexago_app/lib/features/tournaments/presentation/tournament_detail_page.dart`: import e um `SliverToBoxAdapter` depois do sliver de `TournamentDetailExploreSection` (~linha 380-416).
- Modify: `nexago_app/lib/features/athlete/presentation/athlete_tournament_detail_page.dart`: import e o botão em `_DetailBody` (~linha 114-125).
- Test: `nexago_app/test/features/tournaments/tournament_review_cta_test.dart`

**Interfaces:**
- Consumes: A2 e A4; `ExploreCard` (`lib/core/ui/explore_card.dart`).
- Produces: `TournamentReviewCta({required String tournamentId, EdgeInsetsGeometry padding = EdgeInsets.zero})`.

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/tournaments/tournament_review_cta_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/explore_card.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_review/tournament_review_cta.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  TournamentReviewInvite invite(TournamentReviewInviteStatus status, DateTime closesAt) =>
      TournamentReviewInvite(
          tournamentId: 't1', tournamentName: 'Copa', closesAt: closesAt, status: status);

  Future<void> pumpCta(WidgetTester tester, TournamentReviewInvite? invite,
      {MyTournamentReview? mine}) async {
    final router = GoRouter(routes: [
      GoRoute(
        path: '/',
        builder: (_, __) =>
            const Scaffold(body: TournamentReviewCta(tournamentId: 't1')),
      ),
      GoRoute(
        path: '/torneios/:tournamentId/avaliar',
        name: AppRouteNames.tournamentReview,
        builder: (_, __) => const Scaffold(body: Text('formulário')),
      ),
    ]);
    addTearDown(router.dispose);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        tournamentReviewInviteProvider('t1').overrideWith((ref) => Stream.value(invite)),
        myTournamentReviewProvider('t1').overrideWith((ref) async => mine),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ));
    await tester.pumpAndSettle();
  }

  final open = DateTime.now().add(const Duration(days: 5));

  testWidgets('sem convite não mostra nada', (tester) async {
    await pumpCta(tester, null);
    expect(find.byType(ExploreCard), findsNothing);
  });

  testWidgets('pendente pede a avaliação e abre o formulário', (tester) async {
    await pumpCta(tester, invite(TournamentReviewInviteStatus.pending, open));
    expect(find.text('Avaliar torneio'), findsOneWidget);
    await tester.tap(find.text('Avaliar torneio'));
    await tester.pumpAndSettle();
    expect(find.text('formulário'), findsOneWidget);
  });

  testWidgets('enviado mostra a nota e permite editar', (tester) async {
    await pumpCta(
      tester,
      invite(TournamentReviewInviteStatus.submitted, open),
      mine: const MyTournamentReview(overall: 4, aspects: {}),
    );
    expect(find.text('Você avaliou ★ 4 · Editar'), findsOneWidget);
  });

  testWidgets('encerrado mostra a data e não navega', (tester) async {
    await pumpCta(
        tester, invite(TournamentReviewInviteStatus.pending, DateTime(2025, 10, 15, 10)));
    expect(find.text('Avaliação encerrada em 15/10'), findsOneWidget);
    await tester.tap(find.text('Avaliação encerrada em 15/10'));
    await tester.pumpAndSettle();
    expect(find.text('formulário'), findsNothing);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_review_cta_test.dart`

Expected: falha de compilação, `Target of URI doesn't exist: '...tournament_review_cta.dart'`.

- [ ] **Step 3: Implementar o botão**

`nexago_app/lib/features/tournaments/presentation/widgets/tournament_review/tournament_review_cta.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/ui/explore_card.dart';
import '../../../domain/tournament_review_logic.dart';
import '../../../domain/tournament_review_providers.dart';

/// Botão da avaliação no detalhe do torneio e na campanha do atleta. Some para quem não tem
/// convite; pede, deixa editar ou avisa que encerrou conforme [tournamentReviewCtaState].
class TournamentReviewCta extends ConsumerWidget {
  const TournamentReviewCta({
    super.key,
    required this.tournamentId,
    this.padding = EdgeInsets.zero,
  });

  final String tournamentId;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invite = ref.watch(tournamentReviewInviteProvider(tournamentId)).valueOrNull;
    final state = tournamentReviewCtaState(invite, DateTime.now());
    if (invite == null || state == TournamentReviewCtaState.none) {
      return const SizedBox.shrink();
    }
    final closes = tournamentReviewDayMonth(invite.closesAt);
    void open() => context.pushNamed(
          AppRouteNames.tournamentReview,
          pathParameters: {'tournamentId': tournamentId},
        );

    final Widget card;
    switch (state) {
      case TournamentReviewCtaState.pending:
        card = ExploreCard(
          icon: Icons.star_outline_rounded,
          title: 'Avaliar torneio',
          subtitle: 'Leva 10 segundos · fecha em $closes · +$kTournamentReviewXp XP',
          onTap: open,
        );
      case TournamentReviewCtaState.submitted:
        final overall = ref.watch(myTournamentReviewProvider(tournamentId)).valueOrNull?.overall;
        card = ExploreCard(
          icon: Icons.star_rounded,
          title: overall == null ? 'Você avaliou este torneio' : 'Você avaliou ★ $overall · Editar',
          subtitle: 'Dá pra editar até $closes',
          onTap: open,
        );
      case TournamentReviewCtaState.closed:
      case TournamentReviewCtaState.none:
        card = ExploreCard(
          icon: Icons.star_outline_rounded,
          title: 'Avaliação encerrada em $closes',
          subtitle: 'A nota deste torneio já fechou.',
          enabled: false,
          onTap: () {},
        );
    }
    return Padding(padding: padding, child: card);
  }
}
```

- [ ] **Step 4: Inserir no detalhe do torneio**

Em `tournament_detail_page.dart`, ao lado dos outros imports de `widgets/`:

```dart
import 'widgets/tournament_review/tournament_review_cta.dart';
```

Logo depois do `SliverToBoxAdapter` que contém `TournamentDetailExploreSection(...)` (antes do sliver de `TournamentDetailTournamentInfoSection`):

```dart
              SliverToBoxAdapter(
                child: TournamentReviewCta(
                  tournamentId: widget.tournament.id,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                ),
              ),
```

- [ ] **Step 5: Inserir na campanha do atleta**

Em `athlete_tournament_detail_page.dart`, depois do import de `tournament_detail_summary_card.dart`:

```dart
import '../../tournaments/presentation/widgets/tournament_review/tournament_review_cta.dart';
```

Em `_DetailBody.build`, troque:

```dart
        TournamentDetailSummaryCard(detail: detail),
        SizedBox(height: 12),
```

por:

```dart
        TournamentDetailSummaryCard(detail: detail),
        SizedBox(height: 12),
        TournamentReviewCta(tournamentId: detail.tournamentId),
```

- [ ] **Step 6: Rodar o teste e a análise**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/tournament_review_cta_test.dart && flutter analyze lib/features/tournaments/presentation/widgets/tournament_review/tournament_review_cta.dart lib/features/tournaments/presentation/tournament_detail_page.dart lib/features/athlete/presentation/athlete_tournament_detail_page.dart`

Expected: `All tests passed!` (4 testes) e `No issues found!`.

- [ ] **Step 7: Commit**

```bash
pwd && git branch --show-current
git add nexago_app/lib/features/tournaments/presentation/widgets/tournament_review/tournament_review_cta.dart nexago_app/lib/features/tournaments/presentation/tournament_detail_page.dart nexago_app/lib/features/athlete/presentation/athlete_tournament_detail_page.dart nexago_app/test/features/tournaments/tournament_review_cta_test.dart
git commit -m "feat(app): botão de avaliar no detalhe do torneio e na campanha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A7: Card "Avalie seus torneios" na Home

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/widgets/pending_tournament_reviews_section.dart`
- Modify: `nexago_app/lib/features/athlete/presentation/athlete_home_page.dart`: import e um `Consumer` logo depois do `Consumer` dos convites recebidos (~linha 162-185).
- Test: `nexago_app/test/features/tournaments/pending_tournament_reviews_section_test.dart`

**Interfaces:**
- Consumes: `pendingTournamentReviewsProvider` (A4); `tournamentReviewQuestion`, `tournamentReviewDayMonth`, `kTournamentReviewXp` (A2).
- Produces: `PendingTournamentReviewsSection()`.

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/tournaments/pending_tournament_reviews_section_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/pending_tournament_reviews_section.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  Future<List<String>> pumpSection(
      WidgetTester tester, List<TournamentReviewInvite> pending) async {
    final opened = <String>[];
    final router = GoRouter(routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => const Scaffold(body: PendingTournamentReviewsSection()),
      ),
      GoRoute(
        path: '/torneios/:tournamentId/avaliar',
        name: AppRouteNames.tournamentReview,
        builder: (_, state) {
          opened.add(state.pathParameters['tournamentId']!);
          return const Scaffold(body: Text('formulário'));
        },
      ),
    ]);
    addTearDown(router.dispose);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        pendingTournamentReviewsProvider.overrideWith((ref) => Stream.value(pending)),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ));
    await tester.pumpAndSettle();
    return opened;
  }

  testWidgets('sem pendentes não ocupa espaço', (tester) async {
    await pumpSection(tester, const []);
    expect(find.text('Avalie seus torneios'), findsNothing);
  });

  testWidgets('mostra a pergunta e abre o formulário do torneio', (tester) async {
    final opened = await pumpSection(tester, [
      TournamentReviewInvite(
        tournamentId: 't1',
        tournamentName: 'Copa Areia',
        closesAt: DateTime(2030, 10, 15, 10),
        status: TournamentReviewInviteStatus.pending,
      ),
    ]);

    expect(find.text('Avalie seus torneios'), findsOneWidget);
    expect(find.text('Como foi o torneio Copa Areia?'), findsOneWidget);
    expect(find.text('Leva 10 segundos · fecha em 15/10 · +10 XP'), findsOneWidget);

    await tester.tap(find.text('Como foi o torneio Copa Areia?'));
    await tester.pumpAndSettle();
    expect(opened, ['t1']);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/pending_tournament_reviews_section_test.dart`

Expected: falha de compilação, `Target of URI doesn't exist: '...pending_tournament_reviews_section.dart'`.

- [ ] **Step 3: Implementar a seção**

`nexago_app/lib/features/tournaments/presentation/widgets/pending_tournament_reviews_section.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../core/router/routes.dart';
import '../../domain/tournament_review_logic.dart';
import '../../domain/tournament_review_models.dart';
import '../../domain/tournament_review_providers.dart';

/// "Avalie seus torneios" na Home — um card por convite pendente e aberto, logo abaixo dos
/// convites de dupla recebidos. Some sozinho quando o atleta envia (o convite vira
/// `submitted`) ou quando a janela fecha.
class PendingTournamentReviewsSection extends ConsumerWidget {
  const PendingTournamentReviewsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending =
        ref.watch(pendingTournamentReviewsProvider).valueOrNull ?? const [];
    if (pending.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Avalie seus torneios',
          style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 10),
        for (final invite in pending) ...[
          _ReviewInviteCard(invite: invite),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _ReviewInviteCard extends StatelessWidget {
  const _ReviewInviteCard({required this.invite});

  final TournamentReviewInvite invite;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => context.pushNamed(
          AppRouteNames.tournamentReview,
          pathParameters: {'tournamentId': invite.tournamentId},
        ),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.brand.withValues(alpha: 0.45)),
          ),
          child: Row(
            children: [
              const Icon(Icons.star_rounded, color: AppColors.brand),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tournamentReviewQuestion(invite.tournamentName),
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Leva 10 segundos · fecha em '
                      '${tournamentReviewDayMonth(invite.closesAt)} · +$kTournamentReviewXp XP',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: colors.onSurfaceMuted),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: colors.onSurfaceMuted),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Inserir na Home**

Em `athlete_home_page.dart`, junto dos imports de `tournaments/presentation/widgets/`:

```dart
import '../../tournaments/domain/tournament_review_providers.dart';
import '../../tournaments/presentation/widgets/pending_tournament_reviews_section.dart';
```

Logo depois do `Consumer` que devolve `PendingTournamentInviteeInvitesSection()` (e antes do `Consumer` dos convites enviados):

```dart
                      // Torneios esperando avaliação — perto dos convites recebidos: é a
                      // outra coisa que só o atleta pode responder.
                      Consumer(
                        builder: (context, ref, _) {
                          final hasPendingReviews =
                              (ref.watch(pendingTournamentReviewsProvider).valueOrNull ??
                                      const [])
                                  .isNotEmpty;
                          if (!hasPendingReviews) return const SizedBox.shrink();
                          return const Padding(
                            padding: EdgeInsets.fromLTRB(
                              AppSpacing.screenH,
                              0,
                              AppSpacing.screenH,
                              AppSpacing.sectionGap,
                            ),
                            child: PendingTournamentReviewsSection(),
                          );
                        },
                      ),
```

- [ ] **Step 5: Rodar o teste, o teste da Home e a análise**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/features/tournaments/pending_tournament_reviews_section_test.dart test/features/athlete/athlete_home_page_test.dart && flutter analyze lib/features/tournaments/presentation/widgets/pending_tournament_reviews_section.dart lib/features/athlete/presentation/athlete_home_page.dart`

Expected: `All tests passed!` e `No issues found!`.

- [ ] **Step 6: Commit**

```bash
pwd && git branch --show-current
git add nexago_app/lib/features/tournaments/presentation/widgets/pending_tournament_reviews_section.dart nexago_app/lib/features/athlete/presentation/athlete_home_page.dart nexago_app/test/features/tournaments/pending_tournament_reviews_section_test.dart
git commit -m "feat(app): card Avalie seus torneios na Home

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A8: Push e inbox abrem a avaliação

**Files:**
- Modify: `nexago_app/lib/core/notifications/notification_navigation.dart`: `resolveNotificationRoute`, antes do bloco `final url = ...` (~linha 114).
- Modify: `nexago_app/lib/features/athlete/domain/athlete_notifications_logic.dart`: import de `routes.dart` e um `case` no `switch (type)` de `notificationPresentation` (~linha 160).
- Test: `nexago_app/test/core/notifications/notification_navigation_test.dart` e `nexago_app/test/features/athlete/athlete_notifications_logic_test.dart` (acrescentar testes).

**Interfaces:**
- Consumes: `AppRoutes.tournamentReview` (A5).

- [ ] **Step 1: Escrever os testes que falham**

Em `test/core/notifications/notification_navigation_test.dart`, dentro de `group('resolveNotificationRoute', () { ... })`, acrescente:

```dart
    test('pedido de avaliação abre o formulário, mesmo com a url do app antigo', () {
      expect(
        resolveNotificationRoute({
          'type': 'tournament_review_request',
          'tournamentId': 't1',
          'url': '/torneios/t1',
        }),
        '/torneios/t1/avaliar',
      );
      expect(
        resolveNotificationRoute({
          'type': 'tournament_review_reminder',
          'tournamentId': 't1',
          'url': '/torneios/t1',
        }),
        '/torneios/t1/avaliar',
      );
    });

    test('avaliação sem tournamentId cai na url do payload', () {
      expect(
        resolveNotificationRoute(
            {'type': 'tournament_review_request', 'url': '/torneios/t1'}),
        '/torneios/t1',
      );
    });

    test('fechamento das avaliações (organizador) continua na url, nesta fase', () {
      expect(
        resolveNotificationRoute({
          'type': 'tournament_review_closed',
          'tournamentId': 't1',
          'url': '/organizer/tournaments/t1',
        }),
        '/organizer/tournaments/t1',
      );
    });
```

Em `test/features/athlete/athlete_notifications_logic_test.dart`, dentro do `main()` (no mesmo nível dos outros `test(...)` de tipo), acrescente. O arquivo já define `final now = DateTime(2026, 5, 26, 14, 0);` na linha 27:

```dart
  test('tournament_review_request abre a avaliação com ação Avaliar', () {
    final n = AthleteInboxNotification(
      id: 'r1',
      title: 'Como foi o torneio Copa?',
      body: 'Avalie em 10 segundos e ganhe 10 XP.',
      type: 'tournament_review_request',
      data: const {'tournamentId': 't1', 'url': '/torneios/t1'},
      read: false,
      dismissed: false,
      createdAt: now,
    );
    final p = notificationPresentation(n);
    expect(p.routePath, '/torneios/t1/avaliar');
    expect(p.icon, Icons.star_rounded);
    expect(p.actions.single.label, 'Avaliar');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/core/notifications/notification_navigation_test.dart test/features/athlete/athlete_notifications_logic_test.dart`

Expected:
- O teste do pedido falha com `Expected: '/torneios/t1/avaliar' Actual: '/torneios/t1'`.
- O do inbox falha no `routePath`.
- Os outros dois novos passam: eles fixam o comportamento que não pode mudar.

- [ ] **Step 3: Implementar**

Em `notification_navigation.dart`, dentro de `resolveNotificationRoute`, logo depois de `final type = ...;` e **antes** de `final url = ...`:

```dart
  // Avaliação do torneio: o payload leva `url: /torneios/{id}` para o app ANTIGO, que não tem o
  // formulário. Este build abre a avaliação direto — por isso o tipo vem antes da url.
  if (type == 'tournament_review_request' || type == 'tournament_review_reminder') {
    final reviewTournamentId = (data['tournamentId'] as String?)?.trim() ?? '';
    if (reviewTournamentId.isNotEmpty) {
      return AppRoutes.tournamentReview.replaceAll(':tournamentId', reviewTournamentId);
    }
  }
```

Em `athlete_notifications_logic.dart`, acrescente o import (o arquivo está em `lib/features/athlete/domain/`):

```dart
import '../../../core/router/routes.dart';
```

E no `switch (type)` de `notificationPresentation`, antes do `default`:

```dart
    case 'tournament_review_request':
    case 'tournament_review_reminder':
      final reviewTournamentId = data['tournamentId'] ?? '';
      final reviewUrl = data['url'] ?? '';
      final reviewRoutePath = reviewTournamentId.isNotEmpty
          ? AppRoutes.tournamentReview.replaceAll(':tournamentId', reviewTournamentId)
          : reviewUrl.startsWith('/')
              ? reviewUrl
              : null;
      return AthleteNotificationPresentation(
        icon: Icons.star_rounded,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.15),
        actions: reviewRoutePath == null
            ? const []
            : const [
                AthleteNotificationAction(
                  label: 'Avaliar',
                  kind: AthleteNotificationActionKind.primary,
                ),
              ],
        routePath: reviewRoutePath,
      );
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter test test/core/notifications/notification_navigation_test.dart test/features/athlete/athlete_notifications_logic_test.dart && flutter analyze lib/core/notifications/notification_navigation.dart lib/features/athlete/domain/athlete_notifications_logic.dart`

Expected: `All tests passed!` e `No issues found!`.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add nexago_app/lib/core/notifications/notification_navigation.dart nexago_app/lib/features/athlete/domain/athlete_notifications_logic.dart nexago_app/test/core/notifications/notification_navigation_test.dart nexago_app/test/features/athlete/athlete_notifications_logic_test.dart
git commit -m "feat(app): push e inbox de avaliação abrem o formulário

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Parte B — Portal do atleta (Angular)

Antes da B1, crie o symlink de `node_modules` descrito nas Global Constraints.

### Task B1: Regras puras

**Files:**
- Create: `frontend/projects/athlete/src/app/data/tournament-reviews.ts`
- Test: `frontend/projects/athlete/src/app/data/tournament-reviews.spec.ts`

**Interfaces:**
- Produces:
  - Constantes: `TOURNAMENT_REVIEW_ASPECTS` (`{key,label}[]`), `TOURNAMENT_REVIEW_XP = 10`, `TOURNAMENT_REVIEW_COMMENT_MAX = 1000`.
  - Tipos: `TournamentReviewAspectKey`, `TournamentReviewAspects`, `TournamentReviewInviteStatus`, `TournamentReviewInvite`, `MyTournamentReview`, `TournamentReviewCtaState`.
  - Funções:
    - `inviteFromData(id, data)` e `myReviewFromData(data)`
    - `isReviewOpen(invite, now)`, `reviewCtaState(invite, now)`
    - `openPendingReviews(invites, now)`, `reviewDialogInviteOf(requested, invite, now)`
    - `reviewLabel(name)`, `reviewQuestion(name)`, `reviewRatingLabel(n)`, `reviewDayMonth(date)`
  - Itens do card: `ReviewCardItem { tournamentId; question; closesLabel }` e `reviewCardItems(invites, now)`.

- [ ] **Step 1: Escrever o spec que falha**

`frontend/projects/athlete/src/app/data/tournament-reviews.spec.ts`:

```ts
import {
  TOURNAMENT_REVIEW_ASPECTS,
  inviteFromData,
  myReviewFromData,
  openPendingReviews,
  reviewCardItems,
  reviewCtaState,
  reviewDayMonth,
  reviewDialogInviteOf,
  reviewQuestion,
  reviewRatingLabel,
  type TournamentReviewInvite,
} from './tournament-reviews';

const NOW = new Date('2026-10-06T15:00:00Z');
const FUTURE = new Date('2026-10-11T13:00:00Z');

function invite(overrides: Partial<TournamentReviewInvite> = {}): TournamentReviewInvite {
  return { tournamentId: 't1', tournamentName: 'Copa', coverUrl: null, closesAt: FUTURE, status: 'pending', ...overrides };
}

describe('tournament-reviews (regras puras)', () => {
  it('aspectos: mesma lista e ordem do backend (functions/src/tournament-review-constants.ts)', () => {
    expect(TOURNAMENT_REVIEW_ASPECTS.map((a) => a.key)).toEqual(['organization', 'schedule', 'refereeing', 'venue', 'prizes']);
  });

  it('inviteFromData lê o convite do job; sem closesAt não há convite', () => {
    const parsed = inviteFromData('t1', { tournamentName: ' Copa ', closesAt: { toDate: () => FUTURE }, status: 'submitted' });
    expect(parsed).toEqual({ tournamentId: 't1', tournamentName: 'Copa', coverUrl: null, closesAt: FUTURE, status: 'submitted' });
    expect(inviteFromData('t1', { status: 'pending' })).toBeNull();
    expect(inviteFromData('t1', { closesAt: FUTURE, status: '???' })!.status).toBe('pending');
  });

  it('myReviewFromData ignora aspecto inválido e trata comentário vazio como null', () => {
    expect(myReviewFromData({ overall: 4, aspects: { schedule: 2, food: 5, venue: 9 }, comment: '  ' })).toEqual({ overall: 4, aspects: { schedule: 2 }, comment: null });
    expect(myReviewFromData({ overall: 0 })).toBeNull();
  });

  it('reviewCtaState: closesAt vencido fecha mesmo com convite pending (job atrasado)', () => {
    expect(reviewCtaState(null, NOW)).toBe('none');
    expect(reviewCtaState(invite(), NOW)).toBe('pending');
    expect(reviewCtaState(invite({ status: 'submitted' }), NOW)).toBe('submitted');
    expect(reviewCtaState(invite({ closesAt: NOW }), NOW)).toBe('closed');
    expect(reviewCtaState(invite({ status: 'expired' }), NOW)).toBe('closed');
  });

  it('openPendingReviews: só pendentes abertos, o que fecha antes primeiro', () => {
    const list = openPendingReviews([
      invite({ tournamentId: 'late', closesAt: new Date('2026-10-15T13:00:00Z') }),
      invite({ tournamentId: 'vencido', closesAt: new Date('2026-10-01T13:00:00Z') }),
      invite({ tournamentId: 'feito', status: 'submitted' }),
      invite({ tournamentId: 'soon', closesAt: new Date('2026-10-07T13:00:00Z') }),
    ], NOW);
    expect(list.map((i) => i.tournamentId)).toEqual(['soon', 'late']);
  });

  it('reviewDialogInviteOf: só abre com ?avaliar=1 e convite aberto', () => {
    expect(reviewDialogInviteOf(false, invite(), NOW)).toBeNull();
    expect(reviewDialogInviteOf(true, null, NOW)).toBeNull();
    expect(reviewDialogInviteOf(true, invite({ closesAt: NOW }), NOW)).toBeNull();
    expect(reviewDialogInviteOf(true, invite(), NOW)?.tournamentId).toBe('t1');
  });

  it('reviewQuestion: o artigo concorda com "torneio"', () => {
    expect(reviewQuestion('Liga nexaGO – 1ª etapa')).toBe('Como foi o torneio Liga nexaGO – 1ª etapa?');
    expect(reviewQuestion('  ')).toBe('Como foi o torneio?');
    expect(reviewQuestion('Torneio de Verão')).toBe('Como foi o Torneio de Verão?');
  });

  it('reviewRatingLabel e reviewDayMonth (fuso de São Paulo)', () => {
    expect([1, 2, 3, 4, 5].map((n) => reviewRatingLabel(n))).toEqual(['Péssimo', 'Ruim', 'Ok', 'Bom', 'Excelente']);
    expect(reviewRatingLabel(null)).toBe('');
    expect(reviewDayMonth(new Date('2026-10-15T13:00:00Z'))).toBe('15/10');
  });

  it('reviewCardItems monta o card do painel', () => {
    expect(reviewCardItems([invite({ tournamentName: 'Copa Areia' })], NOW)).toEqual([
      { tournamentId: 't1', question: 'Como foi o torneio Copa Areia?', closesLabel: '11/10' },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/data/tournament-reviews.spec.ts'`

Expected: `TS2307: Cannot find module './tournament-reviews'`.

- [ ] **Step 3: Implementar**

`frontend/projects/athlete/src/app/data/tournament-reviews.ts`:

```ts
/**
 * Avaliação do torneio pelos atletas — regras puras do portal.
 * Spec: docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md
 */

/** Mesma lista e ordem de `functions/src/tournament-review-constants.ts`. */
export const TOURNAMENT_REVIEW_ASPECTS = [
  { key: 'organization', label: 'Organização geral' },
  { key: 'schedule', label: 'Cumprimento dos horários' },
  { key: 'refereeing', label: 'Arbitragem / mesa' },
  { key: 'venue', label: 'Estrutura do local' },
  { key: 'prizes', label: 'Premiação e kit' },
] as const;

export type TournamentReviewAspectKey = (typeof TOURNAMENT_REVIEW_ASPECTS)[number]['key'];
export type TournamentReviewAspects = Partial<Record<TournamentReviewAspectKey, number>>;

export const TOURNAMENT_REVIEW_XP = 10;
export const TOURNAMENT_REVIEW_COMMENT_MAX = 1000;

export type TournamentReviewInviteStatus = 'pending' | 'submitted' | 'expired';

/** `users/{uid}/tournamentReviewInvites/{tournamentId}` — só o servidor grava. */
export interface TournamentReviewInvite {
  readonly tournamentId: string;
  readonly tournamentName: string;
  readonly coverUrl: string | null;
  readonly closesAt: Date;
  readonly status: TournamentReviewInviteStatus;
}

/** `tournamentReviews/{tournamentId}_{uid}`, lido pelo próprio autor. */
export interface MyTournamentReview {
  readonly overall: number;
  readonly aspects: TournamentReviewAspects;
  readonly comment: string | null;
}

export type TournamentReviewCtaState = 'none' | 'pending' | 'submitted' | 'closed';

const ASPECT_KEYS: readonly string[] = TOURNAMENT_REVIEW_ASPECTS.map((a) => a.key);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function dateOf(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const t = value as { toDate?: () => Date } | null | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function star(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

/** Sem `closesAt` o prazo é desconhecido — o convite é tratado como ausente. */
export function inviteFromData(id: string, data: Record<string, unknown> | undefined): TournamentReviewInvite | null {
  if (!data) return null;
  const closesAt = dateOf(data['closesAt']);
  if (!closesAt) return null;
  const raw = data['status'];
  const status: TournamentReviewInviteStatus = raw === 'submitted' ? 'submitted' : raw === 'expired' ? 'expired' : 'pending';
  return {
    tournamentId: text(data['tournamentId']) || id,
    tournamentName: text(data['tournamentName']),
    coverUrl: text(data['coverUrl']) || null,
    closesAt,
    status,
  };
}

export function myReviewFromData(data: Record<string, unknown> | undefined): MyTournamentReview | null {
  if (!data) return null;
  const overall = star(data['overall']);
  if (overall == null) return null;
  const aspects: TournamentReviewAspects = {};
  const raw = data['aspects'];
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const s = star(value);
      if (ASPECT_KEYS.includes(key) && s != null) aspects[key as TournamentReviewAspectKey] = s;
    }
  }
  const comment = text(data['comment']);
  return { overall, aspects, comment: comment || null };
}

/** Aberto = não expirou E o prazo não passou. O status sozinho não basta: o job que marca
 *  `expired` roda uma vez por dia (e para inteiro com a flag desligada). */
export function isReviewOpen(invite: TournamentReviewInvite, now: Date): boolean {
  return invite.status !== 'expired' && invite.closesAt.getTime() > now.getTime();
}

export function reviewCtaState(invite: TournamentReviewInvite | null, now: Date): TournamentReviewCtaState {
  if (!invite) return 'none';
  if (!isReviewOpen(invite, now)) return 'closed';
  return invite.status === 'submitted' ? 'submitted' : 'pending';
}

export function openPendingReviews(invites: readonly TournamentReviewInvite[], now: Date): TournamentReviewInvite[] {
  return invites
    .filter((i) => i.status === 'pending' && isReviewOpen(i, now))
    .sort((a, b) => a.closesAt.getTime() - b.closesAt.getTime());
}

/** O diálogo abre só com `?avaliar=1` E convite aberto — link velho não abre formulário morto. */
export function reviewDialogInviteOf(
  requested: boolean,
  invite: TournamentReviewInvite | null,
  now: Date,
): TournamentReviewInvite | null {
  return requested && invite && isReviewOpen(invite, now) ? invite : null;
}

/** Mesma regra do push (`functions/src/tournament-review-notifications.ts`). */
export function reviewLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'torneio';
  return /^torneio\b/i.test(trimmed) ? trimmed : `torneio ${trimmed}`;
}

export function reviewQuestion(name: string): string {
  return `Como foi o ${reviewLabel(name)}?`;
}

const RATING_LABELS: Record<number, string> = { 1: 'Péssimo', 2: 'Ruim', 3: 'Ok', 4: 'Bom', 5: 'Excelente' };

export function reviewRatingLabel(rating: number | null): string {
  return rating == null ? '' : (RATING_LABELS[rating] ?? '');
}

const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

export function reviewDayMonth(date: Date): string {
  return DAY_MONTH.format(date);
}

export interface ReviewCardItem {
  readonly tournamentId: string;
  readonly question: string;
  readonly closesLabel: string;
}

export function reviewCardItems(invites: readonly TournamentReviewInvite[], now: Date): ReviewCardItem[] {
  return openPendingReviews(invites, now).map((i) => ({
    tournamentId: i.tournamentId,
    question: reviewQuestion(i.tournamentName),
    closesLabel: reviewDayMonth(i.closesAt),
  }));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/data/tournament-reviews.spec.ts'`

Expected: `Executed 9 of 9 SUCCESS`. Se a contagem não bater, a árvore errada está sendo testada (armadilha do worktree aninhado).

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add frontend/projects/athlete/src/app/data/tournament-reviews.ts frontend/projects/athlete/src/app/data/tournament-reviews.spec.ts
git commit -m "feat(atleta-web): regras puras da avaliação de torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B2: Repositório, mensagens de erro e camada injetável da callable

**Files:**
- Create: `frontend/projects/athlete/src/app/data/tournament-reviews-repository.ts`
- Create: `frontend/projects/athlete/src/app/data/tournament-review-submitter.ts`
- Test: `frontend/projects/athlete/src/app/data/tournament-reviews-repository.spec.ts`

**Interfaces:**
- Consumes: B1; `athleteFunctions()` de `data/functions.ts`.
- Produces:
  - Leitura:
    - `watchPendingTournamentReviewInvites(db, uid, onChange, onError?)`
    - `watchTournamentReviewInvite(db, uid, tournamentId, onChange, onError?)`
    - `fetchMyTournamentReview(db, uid, tournamentId)`
  - Erros: `class TournamentReviewError extends Error` e `tournamentReviewErrorMessage(err: unknown): string`.
  - Envio:
    - `interface SubmitTournamentReviewInput { tournamentId; overall; aspects; comment: string }`
    - `submitTournamentReview(functions, input): Promise<{ created: boolean }>`
  - `@Injectable({providedIn:'root'}) class TournamentReviewSubmitter { submit(input) }`.

- [ ] **Step 1: Escrever o spec que falha**

`frontend/projects/athlete/src/app/data/tournament-reviews-repository.spec.ts`:

```ts
import { TournamentReviewError, tournamentReviewErrorMessage } from './tournament-reviews-repository';

describe('tournamentReviewErrorMessage', () => {
  it('repassa a mensagem do servidor sem o envelope do Firebase', () => {
    expect(tournamentReviewErrorMessage({
      code: 'functions/permission-denied',
      message: 'Firebase: Você não participou deste torneio. (functions/permission-denied).',
    })).toBe('Você não participou deste torneio.');
    expect(tournamentReviewErrorMessage({ code: 'functions/failed-precondition', message: 'A avaliação deste torneio foi encerrada.' }))
      .toBe('A avaliação deste torneio foi encerrada.');
  });

  it('callable não deployada (not-found) vira mensagem legível', () => {
    expect(tournamentReviewErrorMessage({ code: 'functions/not-found', message: 'not-found' }))
      .toBe('A avaliação ainda não está disponível. Tente de novo em instantes.');
  });

  it('sessão expirada e falha desconhecida', () => {
    expect(tournamentReviewErrorMessage({ code: 'functions/unauthenticated', message: 'x' }))
      .toBe('Sua sessão expirou. Entre de novo para avaliar.');
    expect(tournamentReviewErrorMessage(new Error('boom'))).toBe('O serviço não respondeu. Sua avaliação continua aqui.');
  });

  it('TournamentReviewError já vem pronto', () => {
    expect(tournamentReviewErrorMessage(new TournamentReviewError('Pronto.'))).toBe('Pronto.');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/data/tournament-reviews-repository.spec.ts'`

Expected: `TS2307: Cannot find module './tournament-reviews-repository'`.

- [ ] **Step 3: Implementar**

`frontend/projects/athlete/src/app/data/tournament-reviews-repository.ts`:

```ts
import { collection, doc, getDoc, onSnapshot, query, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  inviteFromData,
  myReviewFromData,
  type MyTournamentReview,
  type TournamentReviewAspects,
  type TournamentReviewInvite,
} from './tournament-reviews';

export function watchPendingTournamentReviewInvites(
  db: Firestore,
  uid: string,
  onChange: (invites: TournamentReviewInvite[]) => void,
  onError?: () => void,
): Unsubscribe {
  const q = query(collection(db, 'users', uid, 'tournamentReviewInvites'), where('status', '==', 'pending'));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => inviteFromData(d.id, d.data())).filter((i): i is TournamentReviewInvite => i != null)),
    () => onError?.(),
  );
}

export function watchTournamentReviewInvite(
  db: Firestore,
  uid: string,
  tournamentId: string,
  onChange: (invite: TournamentReviewInvite | null) => void,
  onError?: () => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid, 'tournamentReviewInvites', tournamentId),
    (snap) => onChange(snap.exists() ? inviteFromData(snap.id, snap.data()) : null),
    () => onError?.(),
  );
}

/** Só depois de o convite dizer `submitted`: a rule nega a leitura de doc inexistente. */
export async function fetchMyTournamentReview(db: Firestore, uid: string, tournamentId: string): Promise<MyTournamentReview | null> {
  const snap = await getDoc(doc(db, 'tournamentReviews', `${tournamentId}_${uid}`));
  return snap.exists() ? myReviewFromData(snap.data()) : null;
}

/** Só a `message` deste erro vai para a tela. */
export class TournamentReviewError extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message);
    this.name = 'TournamentReviewError';
  }
}

function stripFirebaseMessage(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw.trim().replace(/^Firebase:\s*/i, '').replace(/\s*\(functions\/[^)]+\)\.?\s*$/i, '').trim() || null;
}

export function tournamentReviewErrorMessage(err: unknown): string {
  if (err instanceof TournamentReviewError) return err.message;
  const fb = err as { code?: unknown; message?: unknown } | null;
  const code = typeof fb?.code === 'string' ? fb.code.replace(/^functions\//, '') : '';
  const detail = stripFirebaseMessage(typeof fb?.message === 'string' ? fb.message : null);
  switch (code) {
    case 'unauthenticated':
      return 'Sua sessão expirou. Entre de novo para avaliar.';
    // Callable ainda não deployada: o SDK devolve "not-found" cru, que não diz nada ao atleta.
    case 'not-found':
      return 'A avaliação ainda não está disponível. Tente de novo em instantes.';
    case 'permission-denied':
      return detail ?? 'Você não participou deste torneio.';
    case 'failed-precondition':
      return detail ?? 'A avaliação deste torneio foi encerrada.';
    case 'invalid-argument':
      return detail ?? 'Revise a nota e o comentário.';
    default:
      return 'O serviço não respondeu. Sua avaliação continua aqui.';
  }
}

export interface SubmitTournamentReviewInput {
  readonly tournamentId: string;
  readonly overall: number;
  readonly aspects: TournamentReviewAspects;
  readonly comment: string;
}

/** `created` só é `true` na 1ª avaliação — é quando o XP é pago. */
export async function submitTournamentReview(functions: Functions, input: SubmitTournamentReviewInput): Promise<{ created: boolean }> {
  const comment = input.comment.trim();
  try {
    const result = await httpsCallable<Record<string, unknown>, { ok?: boolean; created?: boolean }>(functions, 'submitTournamentReview')({
      tournamentId: input.tournamentId,
      overall: input.overall,
      aspects: input.aspects,
      comment: comment.length > 0 ? comment : null,
    });
    return { created: result.data?.created === true };
  } catch (err) {
    const code = typeof (err as { code?: unknown })?.code === 'string' ? (err as { code: string }).code : null;
    throw new TournamentReviewError(tournamentReviewErrorMessage(err), code);
  }
}
```

`frontend/projects/athlete/src/app/data/tournament-review-submitter.ts`:

```ts
import { Injectable } from '@angular/core';
import { athleteFunctions } from './functions';
import { submitTournamentReview, type SubmitTournamentReviewInput } from './tournament-reviews-repository';

/** Camada injetável sobre a callable — os specs do diálogo trocam por um spy, como em
 *  `shared/partner-invite/partner-invite-responder.ts`. */
@Injectable({ providedIn: 'root' })
export class TournamentReviewSubmitter {
  submit(input: SubmitTournamentReviewInput): Promise<{ created: boolean }> {
    return submitTournamentReview(athleteFunctions(), input);
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/data/tournament-reviews-repository.spec.ts'`

Expected: `Executed 4 of 4 SUCCESS`.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add frontend/projects/athlete/src/app/data/tournament-reviews-repository.ts frontend/projects/athlete/src/app/data/tournament-review-submitter.ts frontend/projects/athlete/src/app/data/tournament-reviews-repository.spec.ts
git commit -m "feat(atleta-web): repositório e callable da avaliação de torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B3: Convite e avaliação própria no `TournamentLiveStore`

**Files:**
- Modify: `frontend/projects/athlete/src/app/tournaments/tournament-live.store.ts`: imports, dois signals depois de `isLiveConnected` (~linha 70) e dois `effect` no `constructor` depois do de `myRegistrations` (~linha 189-207), mais o método `reloadMyReview()`.
- Test: `frontend/projects/athlete/src/app/tournaments/tournament-live.store.spec.ts` (acrescentar um `describe`).

**Interfaces:**
- Consumes: `watchTournamentReviewInvite`, `fetchMyTournamentReview` (B2); tipos de B1.
- Produces:
  - `store.reviewInvite: WritableSignal<TournamentReviewInvite | null>`.
  - `store.myReview: WritableSignal<MyTournamentReview | null>`.
  - `store.reloadMyReview(): Promise<void>`.

- [ ] **Step 1: Escrever o teste que falha**

No fim de `tournament-live.store.spec.ts`, acrescente:

```ts
describe('TournamentLiveStore — avaliação do torneio', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('sem usuário não há convite nem avaliação própria', () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), TournamentLiveStore, { provide: AuthService, useValue: { user: signal(null) } }],
    });
    const store = TestBed.inject(TournamentLiveStore);
    store.tournamentId.set('t1');
    TestBed.tick();
    expect(store.reviewInvite()).toBeNull();
    expect(store.myReview()).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/tournaments/tournament-live.store.spec.ts'`

Expected: `TS2339: Property 'reviewInvite' does not exist on type 'TournamentLiveStore'`.

- [ ] **Step 3: Implementar**

Nos imports de `tournament-live.store.ts`:

```ts
import { fetchMyTournamentReview, watchTournamentReviewInvite } from '../data/tournament-reviews-repository';
import type { MyTournamentReview, TournamentReviewInvite } from '../data/tournament-reviews';
```

Depois de `readonly isLiveConnected = signal(false);`:

```ts
  /** Convite do atleta para avaliar ESTE torneio (`users/{uid}/tournamentReviewInvites/{id}`). */
  readonly reviewInvite = signal<TournamentReviewInvite | null>(null);
  /** A avaliação do próprio atleta — só é lida depois de o convite dizer `submitted`. */
  readonly myReview = signal<MyTournamentReview | null>(null);
```

No `constructor`, logo depois do `effect` de `myRegistrations`:

```ts
    // Convite de avaliação ao vivo: quando o atleta envia, o servidor vira o convite para
    // `submitted` e o botão das abas troca de "Avaliar" para "Você avaliou" sem refresh.
    effect((onCleanup) => {
      const tournamentId = this.tournamentId();
      const uid = this.auth.user()?.uid;
      const db = this.db;
      if (!db || !uid || !tournamentId) {
        this.reviewInvite.set(null);
        return;
      }
      onCleanup(
        watchTournamentReviewInvite(
          db,
          uid,
          tournamentId,
          (invite) => this.reviewInvite.set(invite),
          () => this.reviewInvite.set(null),
        ),
      );
    });

    effect(() => {
      if (this.reviewInvite()?.status === 'submitted') void this.reloadMyReview();
      else this.myReview.set(null);
    });
```

E um método público na classe (perto de `load`):

```ts
  /** Relê a avaliação própria — também chamado pela casca depois de uma edição, quando o
   *  convite não muda (continua `submitted`) e o effect não dispararia sozinho. */
  async reloadMyReview(): Promise<void> {
    const tournamentId = this.tournamentId();
    const uid = this.auth.user()?.uid;
    const db = this.db;
    if (!db || !uid || !tournamentId) {
      this.myReview.set(null);
      return;
    }
    try {
      this.myReview.set(await fetchMyTournamentReview(db, uid, tournamentId));
    } catch {
      // A avaliação própria é enriquecimento ("Você avaliou ★ N"): falha mantém o último estado.
    }
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/tournaments/tournament-live.store.spec.ts'`

Expected: `SUCCESS` em todos os specs do arquivo (os que já existiam mais o novo).

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add frontend/projects/athlete/src/app/tournaments/tournament-live.store.ts frontend/projects/athlete/src/app/tournaments/tournament-live.store.spec.ts
git commit -m "feat(atleta-web): convite e avaliação própria no store do torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B4: Diálogo de avaliação

**Files:**
- Create: `frontend/projects/athlete/src/app/tournaments/review/tournament-review-dialog.component.ts`
- Create: `frontend/projects/athlete/src/app/tournaments/review/tournament-review-dialog.component.html`
- Create: `frontend/projects/athlete/src/app/tournaments/review/tournament-review-dialog.component.scss`
- Test: `frontend/projects/athlete/src/app/tournaments/review/tournament-review-dialog.component.spec.ts`

**Interfaces:**
- Consumes: B1; `TournamentReviewSubmitter`, `tournamentReviewErrorMessage` (B2); `NxSpinnerComponent`, `NxInlineMessageComponent`.
- Produces:
  - `<app-tournament-review-dialog [invite] [existing] (submitted) (dismissed)>`, com `submitted: { created: boolean }`.
  - Seletores de teste:
    - `button[data-overall="N"]` (nota geral);
    - `button[data-aspect="KEY"][data-star="N"]` (aspecto);
    - `.trv-comment` (comentário);
    - `.trv-btn-primary` (enviar).

- [ ] **Step 1: Escrever o spec que falha**

`frontend/projects/athlete/src/app/tournaments/review/tournament-review-dialog.component.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TournamentReviewSubmitter } from '../../data/tournament-review-submitter';
import { TournamentReviewError } from '../../data/tournament-reviews-repository';
import type { MyTournamentReview, TournamentReviewInvite } from '../../data/tournament-reviews';
import { TournamentReviewDialogComponent } from './tournament-review-dialog.component';

const INVITE: TournamentReviewInvite = {
  tournamentId: 't1',
  tournamentName: 'Copa Areia',
  coverUrl: null,
  closesAt: new Date('2030-10-15T13:00:00Z'),
  status: 'pending',
};

describe('TournamentReviewDialogComponent', () => {
  let submitter: jasmine.SpyObj<TournamentReviewSubmitter>;

  function setup(invite: TournamentReviewInvite = INVITE, existing: MyTournamentReview | null = null) {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: TournamentReviewSubmitter, useValue: submitter }],
    });
    const fixture = TestBed.createComponent(TournamentReviewDialogComponent);
    fixture.componentRef.setInput('invite', invite);
    fixture.componentRef.setInput('existing', existing);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const click = (selector: string) => {
      (el.querySelector(selector) as HTMLElement).click();
      fixture.detectChanges();
    };
    return { fixture, el, click };
  }

  beforeEach(() => {
    submitter = jasmine.createSpyObj<TournamentReviewSubmitter>('TournamentReviewSubmitter', ['submit']);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('pergunta pelo torneio e não envia sem nota geral', () => {
    const { el } = setup();
    expect(el.textContent).toContain('Como foi o torneio Copa Areia?');
    expect((el.querySelector('.trv-btn-primary') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('envia nota, aspecto e comentário e avisa o host', async () => {
    submitter.submit.and.resolveTo({ created: true });
    const { fixture, el, click } = setup();
    const emitted: { created: boolean }[] = [];
    fixture.componentInstance.submitted.subscribe((v) => emitted.push(v));

    click('button[data-overall="4"]');
    expect(el.textContent).toContain('Bom');
    click('button[data-aspect="schedule"][data-star="2"]');
    const textarea = el.querySelector('.trv-comment') as HTMLTextAreaElement;
    textarea.value = 'Atrasou';
    textarea.dispatchEvent(new Event('input'));
    click('.trv-btn-primary');
    await fixture.whenStable();

    expect(submitter.submit).toHaveBeenCalledOnceWith({ tournamentId: 't1', overall: 4, aspects: { schedule: 2 }, comment: 'Atrasou' });
    expect(emitted).toEqual([{ created: true }]);
  });

  it('tocar de novo na mesma estrela do aspecto limpa a nota', async () => {
    submitter.submit.and.resolveTo({ created: true });
    const { fixture, click } = setup();
    click('button[data-overall="5"]');
    click('button[data-aspect="venue"][data-star="3"]');
    click('button[data-aspect="venue"][data-star="3"]');
    click('.trv-btn-primary');
    await fixture.whenStable();
    expect(submitter.submit.calls.mostRecent().args[0].aspects).toEqual({});
  });

  it('edição chega preenchida e o botão vira Salvar alterações', () => {
    const { el } = setup({ ...INVITE, status: 'submitted' }, { overall: 3, aspects: { venue: 2 }, comment: 'Bom torneio' });
    expect(el.querySelector('button[data-overall="3"]')!.getAttribute('aria-checked')).toBe('true');
    expect(el.querySelector('button[data-aspect="venue"][data-star="2"]')!.getAttribute('aria-pressed')).toBe('true');
    expect((el.querySelector('.trv-comment') as HTMLTextAreaElement).value).toBe('Bom torneio');
    expect(el.querySelector('.trv-btn-primary')!.textContent).toContain('Salvar alterações');
  });

  it('erro do servidor fica no diálogo e nada é emitido', async () => {
    submitter.submit.and.rejectWith(new TournamentReviewError('A avaliação deste torneio foi encerrada.'));
    const { fixture, el, click } = setup();
    const emitted: unknown[] = [];
    fixture.componentInstance.submitted.subscribe((v) => emitted.push(v));

    click('button[data-overall="2"]');
    click('.trv-btn-primary');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain('A avaliação deste torneio foi encerrada.');
    expect(emitted).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/tournaments/review/tournament-review-dialog.component.spec.ts'`

Expected: `TS2307: Cannot find module './tournament-review-dialog.component'`.

- [ ] **Step 3: Implementar o componente**

`frontend/projects/athlete/src/app/tournaments/review/tournament-review-dialog.component.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { TournamentReviewSubmitter } from '../../data/tournament-review-submitter';
import { tournamentReviewErrorMessage } from '../../data/tournament-reviews-repository';
import {
  TOURNAMENT_REVIEW_ASPECTS,
  TOURNAMENT_REVIEW_COMMENT_MAX,
  TOURNAMENT_REVIEW_XP,
  reviewDayMonth,
  reviewQuestion,
  reviewRatingLabel,
  type MyTournamentReview,
  type TournamentReviewAspectKey,
  type TournamentReviewAspects,
  type TournamentReviewInvite,
} from '../../data/tournament-reviews';
import { NxInlineMessageComponent } from '../../shared/feedback';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';

/**
 * Avaliação do torneio — modal declarativo (o host renderiza dentro de `@if`), no molde do
 * `ArenaReviewDialogComponent`: foco preso à mão, Esc/backdrop = "Agora não", erro inline para
 * não perder o comentário digitado. O toast de sucesso é do host.
 */
@Component({
  selector: 'app-tournament-review-dialog',
  imports: [NxSpinnerComponent, NxInlineMessageComponent],
  templateUrl: './tournament-review-dialog.component.html',
  styleUrl: './tournament-review-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'dismiss()',
    '(keydown.tab)': 'onTabKey($event, false)',
    '(keydown.shift.tab)': 'onTabKey($event, true)',
  },
})
export class TournamentReviewDialogComponent {
  private readonly submitter = inject(TournamentReviewSubmitter);
  private readonly hostElement: ElementRef<HTMLElement> = inject(ElementRef);

  readonly invite = input.required<TournamentReviewInvite>();
  /** Avaliação já enviada (edição) — pré-preenche o formulário. */
  readonly existing = input<MyTournamentReview | null>(null);
  readonly submitted = output<{ created: boolean }>();
  readonly dismissed = output<void>();

  protected readonly stars: readonly number[] = [1, 2, 3, 4, 5];
  protected readonly aspectList = TOURNAMENT_REVIEW_ASPECTS;
  protected readonly xpReward = TOURNAMENT_REVIEW_XP;
  protected readonly commentMax = TOURNAMENT_REVIEW_COMMENT_MAX;

  // `linkedSignal`: começa no que veio de `existing` (edição) e segue editável pelo atleta.
  protected readonly overall = linkedSignal<number | null>(() => this.existing()?.overall ?? null);
  protected readonly aspectRatings = linkedSignal<TournamentReviewAspects>(() => ({ ...(this.existing()?.aspects ?? {}) }));
  protected readonly comment = linkedSignal<string>(() => this.existing()?.comment ?? '');
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly starButtons = viewChildren<ElementRef<HTMLButtonElement>>('starBtn');
  private readonly triggerElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor() {
    afterNextRender(() => this.starButtons()[(this.overall() ?? 1) - 1]?.nativeElement.focus());
    inject(DestroyRef).onDestroy(() => this.triggerElement?.focus());
  }

  protected readonly isEdit = computed(() => this.invite().status === 'submitted');
  protected readonly question = computed(() => reviewQuestion(this.invite().tournamentName));
  protected readonly closesLabel = computed(() => reviewDayMonth(this.invite().closesAt));
  protected readonly ratingText = computed(() => reviewRatingLabel(this.overall()));
  protected readonly commentLength = computed(() => this.comment().length);
  protected readonly canSubmit = computed(() => this.overall() != null && !this.sending());
  protected readonly submitLabel = computed(() => {
    if (this.sending()) return 'Enviando…';
    return this.isEdit() ? 'Salvar alterações' : `Enviar e ganhar +${TOURNAMENT_REVIEW_XP} XP`;
  });

  protected aspectValue(key: TournamentReviewAspectKey): number {
    return this.aspectRatings()[key] ?? 0;
  }

  protected setOverall(value: number): void {
    if (this.sending()) return;
    this.overall.set(value);
  }

  protected onStarKeydown(event: KeyboardEvent, star: number): void {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = Math.min(5, Math.max(1, star + delta));
    this.setOverall(next);
    this.starButtons()[next - 1]?.nativeElement.focus();
  }

  /** Tocar de novo na mesma estrela limpa a nota do aspecto — todos são opcionais. */
  protected setAspect(key: TournamentReviewAspectKey, value: number): void {
    if (this.sending()) return;
    this.aspectRatings.update((current) => {
      const next: TournamentReviewAspects = { ...current };
      if (next[key] === value) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  protected onCommentInput(value: string): void {
    this.comment.set(value);
  }

  protected dismiss(): void {
    if (this.sending()) return;
    this.dismissed.emit();
  }

  protected onTabKey(event: Event, backward: boolean): void {
    const focusable = this.focusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (backward && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!backward && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusableElements(): HTMLElement[] {
    const root = this.hostElement.nativeElement;
    return Array.from(root.querySelectorAll<HTMLElement>('button, textarea, [tabindex]')).filter((el) => {
      if (el.hasAttribute('disabled')) return false;
      const tabindex = el.getAttribute('tabindex');
      return tabindex === null || Number(tabindex) >= 0;
    });
  }

  protected async submit(): Promise<void> {
    const overall = this.overall();
    if (this.sending() || overall == null) return;
    this.sending.set(true);
    this.error.set(null);
    try {
      const { created } = await this.submitter.submit({
        tournamentId: this.invite().tournamentId,
        overall,
        aspects: this.aspectRatings(),
        comment: this.comment(),
      });
      this.submitted.emit({ created });
    } catch (err) {
      this.error.set(tournamentReviewErrorMessage(err));
    } finally {
      this.sending.set(false);
    }
  }
}
```

- [ ] **Step 4: Implementar o template**

`frontend/projects/athlete/src/app/tournaments/review/tournament-review-dialog.component.html`:

```html
<div class="trv-backdrop" (click)="dismiss()" aria-hidden="true"></div>

<div class="trv-dialog" role="dialog" aria-modal="true" aria-labelledby="trv-title">
  <div class="trv-eyebrow-row">
    <span class="trv-eyebrow">TORNEIO · AVALIAÇÃO</span>
    @if (!isEdit()) {
      <span class="trv-xp-badge">+{{ xpReward }} XP</span>
    }
  </div>

  <h2 id="trv-title" class="trv-title">{{ question() }}</h2>
  <p class="trv-subtitle">
    {{ isEdit() ? 'Dá pra editar até ' + closesLabel() : 'Sua nota ajuda o organizador a melhorar o próximo evento.' }}
  </p>

  <p class="trv-section-label">NOTA GERAL</p>
  <div class="trv-stars" role="radiogroup" aria-label="Nota geral do torneio">
    @for (star of stars; track star) {
      <button
        #starBtn
        type="button"
        class="trv-star"
        [class.trv-star--filled]="(overall() ?? 0) >= star"
        role="radio"
        [attr.data-overall]="star"
        [attr.aria-checked]="overall() === star"
        [attr.aria-label]="star + ' de 5'"
        [attr.tabindex]="(overall() ?? 1) === star ? 0 : -1"
        [disabled]="sending()"
        (click)="setOverall(star)"
        (keydown)="onStarKeydown($event, star)"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" [attr.fill]="(overall() ?? 0) >= star ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />
        </svg>
      </button>
    }
  </div>
  @if (ratingText(); as label) {
    <p class="trv-rating-label">{{ label }}</p>
  }

  <p class="trv-section-label">QUER DETALHAR? OPCIONAL</p>
  <div class="trv-aspects">
    @for (aspect of aspectList; track aspect.key) {
      <div class="trv-aspect-row">
        <span class="trv-aspect-label">{{ aspect.label }}</span>
        <div class="trv-aspect-stars" role="group" [attr.aria-label]="aspect.label">
          @for (star of stars; track star) {
            <button
              type="button"
              class="trv-mini-star"
              [class.trv-mini-star--filled]="aspectValue(aspect.key) >= star"
              [attr.data-aspect]="aspect.key"
              [attr.data-star]="star"
              [attr.aria-pressed]="aspectValue(aspect.key) === star"
              [attr.aria-label]="aspect.label + ': ' + star + ' de 5'"
              [disabled]="sending()"
              (click)="setAspect(aspect.key, star)"
            >★</button>
          }
        </div>
      </div>
    }
  </div>

  <p class="trv-section-label">COMENTÁRIO · OPCIONAL</p>
  <textarea
    class="trv-comment"
    rows="3"
    [attr.maxlength]="commentMax"
    placeholder="O que o organizador deveria manter ou mudar?"
    aria-label="Comentário para o organizador"
    [value]="comment()"
    [disabled]="sending()"
    (input)="onCommentInput($any($event.target).value)"
  ></textarea>
  <div class="trv-comment-foot">
    <span class="trv-warning">O organizador lê sem o seu nome. Evite se identificar no texto.</span>
    <span class="trv-counter">{{ commentLength() }}/{{ commentMax }}</span>
  </div>

  @if (error(); as message) {
    <app-nx-inline-message class="trv-error" heading="Não foi possível enviar sua avaliação" [body]="message" actionLabel="Tentar novamente" (action)="submit()" />
  }

  <div class="trv-actions">
    <button type="button" class="trv-btn-ghost" [disabled]="sending()" (click)="dismiss()">Agora não</button>
    <button type="button" class="trv-btn-primary" [disabled]="!canSubmit()" (click)="submit()">
      @if (sending()) {
        <app-nx-spinner [size]="16" tone="dark" />
      }
      {{ submitLabel() }}
    </button>
  </div>
</div>
```

- [ ] **Step 5: Implementar o SCSS** (mesmo molde de `agenda/review/arena-review-dialog.component.scss`, com prefixo `trv-`)

`frontend/projects/athlete/src/app/tournaments/review/tournament-review-dialog.component.scss`:

```scss
:host { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; }
.trv-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.72); backdrop-filter: blur(8px); }
.trv-dialog {
  position: relative; width: min(480px, 100%); max-height: calc(100dvh - 32px); overflow: auto;
  background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-5);
  padding: 22px; display: flex; flex-direction: column; gap: 10px;
  @media (max-width: 640px) { padding: 18px 16px; }
}
.trv-eyebrow-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.trv-eyebrow { font-family: var(--nx-font-mono); font-size: 12px; font-weight: 700; letter-spacing: 0.04em; color: var(--nx-orange-500); }
.trv-xp-badge {
  font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; color: var(--nx-orange-500);
  background: var(--nx-surface-1); border: 1px solid rgba(255, 106, 26, 0.4); border-radius: var(--nx-r-1); padding: 4px 8px;
}
.trv-title { margin: 4px 0 0; font-family: var(--nx-font-display); font-size: 22px; font-weight: 900; line-height: 1.2; letter-spacing: -0.01em; color: var(--nx-text); }
.trv-subtitle { margin: 0; font-family: var(--nx-font-mono); font-size: 12px; color: var(--nx-text-mute); }
.trv-section-label { margin: 8px 0 0; font-family: var(--nx-font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: var(--nx-text-mute); }
.trv-stars { display: flex; justify-content: center; gap: 6px; }
.trv-star {
  width: 48px; height: 48px; display: grid; place-items: center; background: var(--nx-surface-1); border: 1px solid transparent;
  border-radius: var(--nx-r-2); color: var(--nx-text-mute); cursor: pointer; transition: color var(--nx-d-fast), border-color var(--nx-d-fast);
  &:disabled { cursor: default; }
}
.trv-star--filled { color: var(--nx-orange-500); border-color: rgba(255, 106, 26, 0.55); }
.trv-rating-label { margin: 0; text-align: center; font-size: 15px; font-weight: 800; color: var(--nx-win); }
.trv-aspects { display: flex; flex-direction: column; gap: 6px; }
.trv-aspect-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.trv-aspect-label { font-size: 14px; color: var(--nx-text); }
.trv-aspect-stars { display: flex; gap: 2px; }
.trv-mini-star {
  width: 32px; height: 32px; display: grid; place-items: center; font-size: 18px; line-height: 1;
  background: transparent; border: none; border-radius: var(--nx-r-1); color: var(--nx-text-mute); cursor: pointer;
  &:disabled { cursor: default; }
  @media (max-width: 640px) { width: 40px; height: 40px; }
}
.trv-mini-star--filled { color: var(--nx-orange-500); }
.trv-comment {
  width: 100%; resize: vertical; padding: 12px; font: inherit; font-size: 14px; color: var(--nx-text);
  background: var(--nx-surface-1); border: 1px solid var(--nx-line); border-radius: var(--nx-r-3);
  &::placeholder { color: var(--nx-text-mute); }
  &:focus-visible { outline: none; border-color: rgba(255, 106, 26, 0.6); }
}
.trv-comment-foot { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.trv-warning { font-size: 12px; color: var(--nx-text-mute); }
.trv-counter { flex: none; font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-mute); }
.trv-error { display: flex; margin: 4px 0 2px; }
.trv-actions { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.trv-btn-ghost {
  flex: none; padding: 12px 14px; font-size: 14px; font-weight: 700; background: transparent; border: none;
  border-radius: var(--nx-r-2); color: var(--nx-text-mute); cursor: pointer;
  &:disabled { cursor: default; opacity: 0.6; }
}
.trv-btn-primary {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 14px;
  font-size: 14px; font-weight: 900; color: #0a0a0a; background: var(--nx-orange-500); border: none;
  border-radius: var(--nx-r-2); cursor: pointer;
  &:disabled { cursor: default; opacity: 0.6; }
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/tournaments/review/tournament-review-dialog.component.spec.ts'`

Expected: `Executed 5 of 5 SUCCESS`.

- [ ] **Step 7: Commit**

```bash
pwd && git branch --show-current
git add frontend/projects/athlete/src/app/tournaments/review/tournament-review-dialog.component.ts frontend/projects/athlete/src/app/tournaments/review/tournament-review-dialog.component.html frontend/projects/athlete/src/app/tournaments/review/tournament-review-dialog.component.scss frontend/projects/athlete/src/app/tournaments/review/tournament-review-dialog.component.spec.ts
git commit -m "feat(atleta-web): diálogo de avaliação do torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B5: Botão nas abas (Visão geral e Minha inscrição)

**Files:**
- Create: `frontend/projects/athlete/src/app/tournaments/review/tournament-review-cta.component.ts`
- Modify: `frontend/projects/athlete/src/app/tournaments/tabs/overview-tab.component.ts` (`imports: [RouterLink]`, ~linha 47) e `.html` (topo de `.tdv-col--side`, ~linha 95).
- Modify: `frontend/projects/athlete/src/app/tournaments/tabs/registration-tab.component.ts` (`imports`, ~linha 169) e `.html` (topo de `.reg`, linha 1).
- Test: `frontend/projects/athlete/src/app/tournaments/review/tournament-review-cta.component.spec.ts`

**Interfaces:**
- Consumes: B1; `store.reviewInvite`, `store.myReview`, `store.now` (B3).
- Produces: `<app-tournament-review-cta [invite] [myOverall] [now]>`. O link põe `?avaliar=1` na URL atual (`[routerLink]="[]"`, com `queryParamsHandling="merge"`).

- [ ] **Step 1: Escrever o spec que falha**

`frontend/projects/athlete/src/app/tournaments/review/tournament-review-cta.component.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { TournamentReviewInvite } from '../../data/tournament-reviews';
import { TournamentReviewCtaComponent } from './tournament-review-cta.component';

const NOW = new Date('2026-10-06T15:00:00Z');

function invite(overrides: Partial<TournamentReviewInvite> = {}): TournamentReviewInvite {
  return { tournamentId: 't1', tournamentName: 'Copa', coverUrl: null, closesAt: new Date('2026-10-11T13:00:00Z'), status: 'pending', ...overrides };
}

describe('TournamentReviewCtaComponent', () => {
  function render(value: TournamentReviewInvite | null, myOverall: number | null = null): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    const fixture = TestBed.createComponent(TournamentReviewCtaComponent);
    fixture.componentRef.setInput('invite', value);
    fixture.componentRef.setInput('myOverall', myOverall);
    fixture.componentRef.setInput('now', NOW);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('sem convite não mostra nada', () => {
    expect(render(null).textContent?.trim()).toBe('');
  });

  it('pendente pede a avaliação com link ?avaliar=1', () => {
    const el = render(invite());
    expect(el.textContent).toContain('Como foi o torneio Copa?');
    expect(el.textContent).toContain('fecha em 11/10');
    expect(el.querySelector('a')!.getAttribute('href')).toContain('avaliar=1');
  });

  it('enviado mostra a nota e permite editar', () => {
    const el = render(invite({ status: 'submitted' }), 4);
    expect(el.textContent).toContain('Você avaliou ★ 4');
    expect(el.textContent).toContain('Editar');
  });

  it('encerrado só informa a data', () => {
    const el = render(invite({ closesAt: NOW }));
    expect(el.textContent).toContain('Avaliação encerrada em');
    expect(el.querySelector('a')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/tournaments/review/tournament-review-cta.component.spec.ts'`

Expected: `TS2307: Cannot find module './tournament-review-cta.component'`.

- [ ] **Step 3: Implementar o componente**

`frontend/projects/athlete/src/app/tournaments/review/tournament-review-cta.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  TOURNAMENT_REVIEW_XP,
  reviewCtaState,
  reviewDayMonth,
  reviewQuestion,
  type TournamentReviewInvite,
} from '../../data/tournament-reviews';

/** Botão da avaliação nas abas do torneio. Não abre o diálogo sozinho: põe `?avaliar=1` na URL
 *  e a casca (`TournamentShellComponent`) abre — um host só, para o painel, as abas e o link
 *  `torneios/:id/avaliar`. */
@Component({
  selector: 'app-tournament-review-cta',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('pending') {
        <section class="trc trc--accent" aria-label="Avaliação do torneio">
          <div class="trc-copy">
            <span class="trc-kicker">AVALIAÇÃO · +{{ xp }} XP</span>
            <p class="trc-title">{{ question() }}</p>
            <p class="trc-sub">Leva 10 segundos · fecha em {{ closesLabel() }}</p>
          </div>
          <a class="trc-btn trc-btn--primary" [routerLink]="[]" [queryParams]="{ avaliar: 1 }" queryParamsHandling="merge">Avaliar torneio</a>
        </section>
      }
      @case ('submitted') {
        <section class="trc" aria-label="Avaliação do torneio">
          <div class="trc-copy">
            <span class="trc-kicker">AVALIAÇÃO ENVIADA</span>
            <p class="trc-title">{{ submittedTitle() }}</p>
            <p class="trc-sub">Dá pra editar até {{ closesLabel() }}</p>
          </div>
          <a class="trc-btn" [routerLink]="[]" [queryParams]="{ avaliar: 1 }" queryParamsHandling="merge">Editar</a>
        </section>
      }
      @case ('closed') {
        <section class="trc trc--muted" aria-label="Avaliação do torneio">
          <p class="trc-sub">Avaliação encerrada em {{ closesLabel() }}</p>
        </section>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .trc {
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
      padding: 14px 16px; margin-bottom: 12px; background: var(--nx-surface-1); border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
    }
    .trc--accent { border-color: rgba(255, 106, 26, 0.45); }
    .trc--muted { opacity: 0.8; }
    .trc-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .trc-kicker { font-family: var(--nx-font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.05em; color: var(--nx-orange-500); }
    .trc-title { margin: 0; font-size: 15px; font-weight: 800; color: var(--nx-text); }
    .trc-sub { margin: 0; font-size: 12px; color: var(--nx-text-mute); }
    .trc-btn {
      flex: none; display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 14px;
      font-size: 14px; font-weight: 800; text-decoration: none; color: var(--nx-text); background: transparent;
      border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-2);
      @media (max-width: 640px) { min-height: 44px; }
    }
    .trc-btn--primary { color: #0a0a0a; background: var(--nx-orange-500); border-color: transparent; }
  `,
})
export class TournamentReviewCtaComponent {
  readonly invite = input<TournamentReviewInvite | null>(null);
  readonly myOverall = input<number | null>(null);
  readonly now = input<Date>(new Date());

  protected readonly xp = TOURNAMENT_REVIEW_XP;
  protected readonly state = computed(() => reviewCtaState(this.invite(), this.now()));
  protected readonly question = computed(() => reviewQuestion(this.invite()?.tournamentName ?? ''));
  protected readonly closesLabel = computed(() => {
    const invite = this.invite();
    return invite ? reviewDayMonth(invite.closesAt) : '';
  });
  protected readonly submittedTitle = computed(() => {
    const overall = this.myOverall();
    return overall == null ? 'Você avaliou este torneio' : `Você avaliou ★ ${overall}`;
  });
}
```

- [ ] **Step 4: Inserir nas abas**

`overview-tab.component.ts`: acrescente o import e troque `imports: [RouterLink],` por `imports: [RouterLink, TournamentReviewCtaComponent],`:

```ts
import { TournamentReviewCtaComponent } from '../review/tournament-review-cta.component';
```

`overview-tab.component.html`: logo depois de `<div class="tdv-col tdv-col--side">`:

```html
        <app-tournament-review-cta [invite]="store.reviewInvite()" [myOverall]="store.myReview()?.overall ?? null" [now]="store.now()" />
```

`registration-tab.component.ts`: acrescente o import e `TournamentReviewCtaComponent` ao array `imports: [...]` do `@Component`:

```ts
import { TournamentReviewCtaComponent } from '../review/tournament-review-cta.component';
```

`registration-tab.component.html`: logo depois de `<div class="reg">` (linha 1):

```html
  <app-tournament-review-cta [invite]="store.reviewInvite()" [myOverall]="store.myReview()?.overall ?? null" [now]="store.now()" />
```

- [ ] **Step 5: Rodar o spec novo e os specs das abas**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/tournaments/review/*.spec.ts' --include='projects/athlete/src/app/tournaments/tabs/*.spec.ts'`

Expected: `SUCCESS`, sem falhas.

- [ ] **Step 6: Commit**

```bash
pwd && git branch --show-current
git add frontend/projects/athlete/src/app/tournaments/review/tournament-review-cta.component.ts frontend/projects/athlete/src/app/tournaments/review/tournament-review-cta.component.spec.ts frontend/projects/athlete/src/app/tournaments/tabs/overview-tab.component.ts frontend/projects/athlete/src/app/tournaments/tabs/overview-tab.component.html frontend/projects/athlete/src/app/tournaments/tabs/registration-tab.component.ts frontend/projects/athlete/src/app/tournaments/tabs/registration-tab.component.html
git commit -m "feat(atleta-web): botão de avaliar nas abas do torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B6: A casca abre o diálogo por `?avaliar=1`, e `torneios/:id/avaliar` redireciona

**Files:**
- Create: `frontend/projects/athlete/src/app/tournaments/review/review-redirect.ts`
- Modify: `frontend/projects/athlete/src/app/app.routes.ts`: uma rota irmã de `hoje`, dentro dos `children` de `torneios/:id` (~linha 382-385).
- Modify: `frontend/projects/athlete/src/app/tournaments/tournament-shell.component.ts` e `.html`.
- Test: `frontend/projects/athlete/src/app/tournaments/review/review-redirect.spec.ts`

**Interfaces:**
- Consumes: B1 (`reviewDialogInviteOf`, `TOURNAMENT_REVIEW_XP`), B3 (`store.reviewInvite`, `store.myReview`, `store.reloadMyReview`), B4 (diálogo).
- Produces: `reviewRedirect: RedirectFunction`.

- [ ] **Step 1: Escrever o spec que falha**

`frontend/projects/athlete/src/app/tournaments/review/review-redirect.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type UrlTree } from '@angular/router';
import { reviewRedirect } from './review-redirect';

describe('reviewRedirect (torneios/:id/avaliar)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('leva para Minha inscrição com o diálogo aberto', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    const tree = TestBed.runInInjectionContext(() =>
      reviewRedirect({ params: { id: 't1' } } as unknown as Parameters<typeof reviewRedirect>[0]),
    ) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(tree)).toBe('/torneios/t1/minha-inscricao?avaliar=1');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/tournaments/review/review-redirect.spec.ts'`

Expected: `TS2307: Cannot find module './review-redirect'`.

- [ ] **Step 3: Implementar o redirect e a rota**

`frontend/projects/athlete/src/app/tournaments/review/review-redirect.ts`:

```ts
import { inject } from '@angular/core';
import { Router, type RedirectFunction } from '@angular/router';

/**
 * `torneios/:id/avaliar` → `torneios/:id/minha-inscricao?avaliar=1`. A casca do torneio abre o
 * diálogo pelo `?avaliar=1`. Destino "Minha inscrição": só quem jogou tem convite, e essa é a aba
 * padrão de inscrito. Precisa ser UrlTree — a casca, ao cair em `/torneios/:id` sem aba,
 * navegaria para a aba padrão e perderia a query.
 */
export const reviewRedirect: RedirectFunction = ({ params }) =>
  inject(Router).createUrlTree(['/torneios', params['id'], 'minha-inscricao'], { queryParams: { avaliar: '1' } });
```

Em `app.routes.ts`, acrescente o import:

```ts
import { reviewRedirect } from './tournaments/review/review-redirect';
```

E, logo depois do objeto da rota `hoje` (`{ path: 'hoje', pathMatch: 'full', redirectTo: ... }`), dentro dos mesmos `children` de `torneios/:id`:

```ts
      {
        // Link da avaliação (spec 2026-10-01). Irmã de `hoje` pelo mesmo motivo documentado
        // acima: aqui o `id` chega na função; dentro da casca de abas chegaria `undefined`.
        path: 'avaliar',
        pathMatch: 'full',
        redirectTo: reviewRedirect,
      },
```

- [ ] **Step 4: Implementar a casca**

Em `tournament-shell.component.ts`:

1. Acrescente os imports:

```ts
import { TOURNAMENT_REVIEW_XP, reviewDialogInviteOf } from '../data/tournament-reviews';
import { TournamentReviewDialogComponent } from './review/tournament-review-dialog.component';
```

2. Troque `imports: [RouterLink, RouterOutlet, AtPanelShellComponent, NxPageLoadingComponent],` por:

```ts
  imports: [RouterLink, RouterOutlet, AtPanelShellComponent, NxPageLoadingComponent, TournamentReviewDialogComponent],
```

3. Depois de `protected readonly isEnded = computed(...)`, acrescente:

```ts
  private readonly reviewRequested = toSignal(this.route.queryParamMap.pipe(map((q) => q.get('avaliar') === '1')), {
    initialValue: false,
  });

  /** O diálogo de avaliação abre por `?avaliar=1` (card do painel, botão das abas, link
   *  `torneios/:id/avaliar`, inbox) e só com convite aberto. */
  protected readonly reviewDialogInvite = computed(() =>
    reviewDialogInviteOf(this.reviewRequested(), this.store.reviewInvite(), this.store.now()),
  );

  protected onReviewSubmitted(result: { created: boolean }): void {
    if (result.created) this.toast.success(`Obrigado! +${TOURNAMENT_REVIEW_XP} XP`, 'Sua avaliação foi enviada sem o seu nome.');
    else this.toast.success('Avaliação atualizada.');
    void this.store.reloadMyReview();
    this.closeReview();
  }

  /** Tira só o `avaliar` da URL atual, mantendo a aba e as outras queries. */
  protected closeReview(): void {
    const tree = this.router.parseUrl(this.router.url);
    const queryParams = { ...tree.queryParams };
    delete queryParams['avaliar'];
    tree.queryParams = queryParams;
    void this.router.navigateByUrl(tree, { replaceUrl: true });
  }
```

Em `tournament-shell.component.html`, logo depois de `<router-outlet />` (ainda dentro de `.tsh`):

```html
      @if (reviewDialogInvite(); as reviewInvite) {
        <app-tournament-review-dialog
          [invite]="reviewInvite"
          [existing]="store.myReview()"
          (submitted)="onReviewSubmitted($event)"
          (dismissed)="closeReview()"
        />
      }
```

- [ ] **Step 5: Rodar o spec novo, o spec das rotas e o build**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/tournaments/review/review-redirect.spec.ts' --include='projects/athlete/src/app/app.routes.spec.ts' && npx ng build athlete --configuration production`

Expected:
- `SUCCESS`.
- Build sem erro: nenhum `exceeded maximum budget` como **erro**. Os avisos de budget que já existiam não importam.
- O `Output location:` aponta para dentro de `worktrees/`.

- [ ] **Step 6: Commit**

```bash
pwd && git branch --show-current
git add frontend/projects/athlete/src/app/tournaments/review/review-redirect.ts frontend/projects/athlete/src/app/tournaments/review/review-redirect.spec.ts frontend/projects/athlete/src/app/app.routes.ts frontend/projects/athlete/src/app/tournaments/tournament-shell.component.ts frontend/projects/athlete/src/app/tournaments/tournament-shell.component.html
git commit -m "feat(atleta-web): casca do torneio abre a avaliação por ?avaliar=1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B7: Card "Avalie seus torneios" no painel

**Files:**
- Create: `frontend/projects/athlete/src/app/data/pending-tournament-reviews.service.ts`
- Modify: `frontend/projects/athlete/src/app/athlete-painel.component.ts`: import, um `inject` perto de `partnerInvites` (~linha 441) e um `computed` perto de `pendingInvites` (~linha 690).
- Modify: `frontend/projects/athlete/src/app/athlete-painel.component.html`: um card no início de `.at-col` (~linha 226), antes de "Convites de dupla".

O card usa só classes que o painel já tem (`at-card`, `at-card--accent`, `at-card-head`, `at-card-title`, `at-invite-list`, `at-invite-row`, `at-invite-info`, `at-invite-actions`, `at-mini-btn`). **Não acrescente SCSS no painel**: ele está a ~4kB do limite de erro de 24kB.

**Interfaces:**
- Consumes: B1 (`reviewCardItems`) e B2 (`watchPendingTournamentReviewInvites`); `athleteFirestore()` de `data/firestore.ts`.
- Produces: `PendingTournamentReviewsService { pending: Signal<TournamentReviewInvite[]> }`.

- [ ] **Step 1: Teste**

A regra que monta o card (`reviewCardItems`) já está coberta na B1. O painel não tem spec de componente. A fiação desta task é conferida no build de produção (Step 4) e na checagem visual (Task F).

- [ ] **Step 2: Implementar o serviço**

`frontend/projects/athlete/src/app/data/pending-tournament-reviews.service.ts`:

```ts
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { athleteFirestore } from './firestore';
import { watchPendingTournamentReviewInvites } from './tournament-reviews-repository';
import { openPendingReviews, type TournamentReviewInvite } from './tournament-reviews';

/** Convites de avaliação pendentes do atleta, ao vivo — o card do painel some sozinho quando o
 *  servidor vira o convite para `submitted`. */
@Injectable({ providedIn: 'root' })
export class PendingTournamentReviewsService {
  private readonly auth = inject(AuthService);
  private readonly firestore = athleteFirestore();
  private readonly invites = signal<readonly TournamentReviewInvite[]>([]);

  readonly pending = computed(() => openPendingReviews(this.invites(), new Date()));

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      const db = this.firestore;
      if (!uid || !db) {
        this.invites.set([]);
        return;
      }
      onCleanup(
        watchPendingTournamentReviewInvites(
          db,
          uid,
          (items) => this.invites.set(items),
          () => this.invites.set([]),
        ),
      );
    });
  }
}
```

- [ ] **Step 3: Ligar no painel**

Em `athlete-painel.component.ts`, ao lado do import de `PartnerInvitesService`:

```ts
import { PendingTournamentReviewsService } from './data/pending-tournament-reviews.service';
import { reviewCardItems } from './data/tournament-reviews';
```

Logo depois de `private readonly partnerInvites = inject(PartnerInvitesService);`:

```ts
  private readonly tournamentReviews = inject(PendingTournamentReviewsService);
```

Logo antes de `protected readonly pendingInvites = computed<PendingInviteItem[]>(() =>`:

```ts
  /** "Avalie seus torneios" — um por torneio jogado com a janela de avaliação aberta. */
  protected readonly pendingReviewCards = computed(() => reviewCardItems(this.tournamentReviews.pending(), new Date()));
```

Em `athlete-painel.component.html`, logo depois de `<div class="at-col">` e antes de `@if (pendingInvites().length > 0) {`:

```html
        @if (pendingReviewCards().length > 0) {
          <div class="at-card at-card--accent">
            <div class="at-card-head">
              <div class="at-card-title">Avalie seus torneios</div>
            </div>
            <div class="at-invite-list">
              @for (review of pendingReviewCards(); track review.tournamentId) {
                <div class="at-invite-row">
                  <div class="at-invite-info">
                    <strong>{{ review.question }}</strong> Leva 10 segundos · fecha em {{ review.closesLabel }} · +10 XP
                  </div>
                  <div class="at-invite-actions">
                    <a class="at-mini-btn at-mini-btn--primary" [routerLink]="['/torneios', review.tournamentId, 'minha-inscricao']" [queryParams]="{ avaliar: 1 }">Avaliar</a>
                  </div>
                </div>
              }
            </div>
          </div>
        }
```

- [ ] **Step 4: Build de produção (budget do painel)**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng build athlete --configuration production`

Expected:
- Build sem erro.
- O aviso de `athlete-painel.component.scss` continua só **aviso**, com o mesmo tamanho de antes, porque não houve mudança de SCSS.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add frontend/projects/athlete/src/app/data/pending-tournament-reviews.service.ts frontend/projects/athlete/src/app/athlete-painel.component.ts frontend/projects/athlete/src/app/athlete-painel.component.html
git commit -m "feat(atleta-web): card Avalie seus torneios no painel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B8: O inbox leva para a avaliação

**Files:**
- Create: `frontend/projects/athlete/src/app/notificacoes/notification-target.ts`
- Modify: `frontend/projects/athlete/src/app/data/notifications-repository.ts`: campo `tournamentId` em `AthleteNotification` e no `fromDoc`.
- Modify: `frontend/projects/athlete/src/app/notificacoes/athlete-notifications.component.ts`: `Router`, `open(n)` e o `(click)` do item.
- Test: `frontend/projects/athlete/src/app/notificacoes/notification-target.spec.ts`

**Interfaces:**
- Produces:
  - `AthleteNotification.tournamentId: string | null`.
  - `notificationTarget(n: Pick<AthleteNotification, 'type' | 'tournamentId'>): { commands: string[]; queryParams?: Record<string, string> } | null`.

- [ ] **Step 1: Escrever o spec que falha**

`frontend/projects/athlete/src/app/notificacoes/notification-target.spec.ts`:

```ts
import { notificationTarget } from './notification-target';

describe('notificationTarget', () => {
  it('pedido e lembrete de avaliação abrem o diálogo do torneio', () => {
    for (const type of ['tournament_review_request', 'tournament_review_reminder']) {
      expect(notificationTarget({ type, tournamentId: 't1' })).toEqual({
        commands: ['/torneios', 't1', 'minha-inscricao'],
        queryParams: { avaliar: '1' },
      });
    }
  });

  it('sem tournamentId ou outro tipo: não navega (comportamento de hoje)', () => {
    expect(notificationTarget({ type: 'tournament_review_request', tournamentId: null })).toBeNull();
    expect(notificationTarget({ type: 'tournament_cancelled', tournamentId: 't1' })).toBeNull();
    expect(notificationTarget({ type: null, tournamentId: 't1' })).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/notificacoes/notification-target.spec.ts'`

Expected: `TS2307: Cannot find module './notification-target'`.

- [ ] **Step 3: Implementar**

`frontend/projects/athlete/src/app/notificacoes/notification-target.ts`:

```ts
import type { AthleteNotification } from '../data/notifications-repository';

export interface NotificationTarget {
  readonly commands: string[];
  readonly queryParams?: Record<string, string>;
}

/** Para onde o toque no item do inbox leva. Hoje só a avaliação do torneio navega; o resto
 *  continua só marcando como lido. */
export function notificationTarget(n: Pick<AthleteNotification, 'type' | 'tournamentId'>): NotificationTarget | null {
  const type = n.type?.toLowerCase() ?? '';
  if ((type === 'tournament_review_request' || type === 'tournament_review_reminder') && n.tournamentId) {
    return { commands: ['/torneios', n.tournamentId, 'minha-inscricao'], queryParams: { avaliar: '1' } };
  }
  return null;
}
```

Em `data/notifications-repository.ts`:
- Na interface `AthleteNotification`, depois de `unread: boolean;`, acrescente:

```ts
  /** `data.tournamentId` do payload — o inbox usa para abrir a avaliação do torneio. */
  tournamentId: string | null;
```

- Em `fromDoc`, depois de `const dismissed = ...;`, acrescente `const notifData = data['data'] as Record<string, unknown> | undefined;`.
- No objeto devolvido, depois de `unread: !read && !dismissed,`, acrescente:

```ts
    tournamentId: str(notifData?.['tournamentId']),
```

Em `notificacoes/athlete-notifications.component.ts`:
- Acrescente os imports (`inject` já vem de `@angular/core`):

```ts
import { Router } from '@angular/router';
import { notificationTarget } from './notification-target';
```

- Depois de `private readonly firestore = createFirestore();`, acrescente `private readonly router = inject(Router);`.
- Depois do método `markRead`, acrescente:

```ts
  protected open(n: AthleteNotification): void {
    this.markRead(n);
    const target = notificationTarget(n);
    if (target) void this.router.navigate(target.commands, { queryParams: target.queryParams });
  }
```

- No template inline, troque `(click)="markRead(n)"` por `(click)="open(n)"`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='projects/athlete/src/app/notificacoes/notification-target.spec.ts'`

Expected: `Executed 2 of 2 SUCCESS`.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add frontend/projects/athlete/src/app/notificacoes/notification-target.ts frontend/projects/athlete/src/app/notificacoes/notification-target.spec.ts frontend/projects/athlete/src/app/data/notifications-repository.ts frontend/projects/athlete/src/app/notificacoes/athlete-notifications.component.ts
git commit -m "feat(atleta-web): inbox leva para a avaliação do torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task F: Verificação final, checagem visual do portal e PR

- [ ] **Step 1: App — suíte e análise**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/nexago_app && flutter analyze lib/features/tournaments lib/features/athlete lib/core/notifications lib/core/router && flutter test`

Expected:
- Nenhum issue nos arquivos tocados por esta fase. Issue em arquivo que esta fase não tocou já existia na base: anote no PR e não corrija aqui.
- Suíte inteira verde. Falha que já acontecia na base vai para o PR com o nome do teste.

- [ ] **Step 2: Portal — suíte completa e build**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless && npx ng build athlete --configuration production`

Expected: `TOTAL: N SUCCESS` sem `FAILED`; build sem erro.

- [ ] **Step 3: Checagem visual do portal com rota temporária (NÃO commitar)**

Siga o padrão de QA do projeto: dados fictícios numa rota pública temporária, apagada antes do commit.
- **Criar** `frontend/projects/athlete/src/app/qa-review/qa-review.component.ts`. Ele renderiza:
  - `<app-tournament-review-cta>` nos três estados, com convites fictícios;
  - um botão que abre `<app-tournament-review-dialog>` com um convite fictício.
  
  No `providers` do próprio componente, o `TournamentReviewSubmitter` é trocado por `{ provide: TournamentReviewSubmitter, useValue: { submit: async () => ({ created: true }) } }`.
- **Registrar a rota:** `{ path: 'qa-avaliacao', loadComponent: () => import('./qa-review/qa-review.component').then((m) => m.QaReviewComponent) }` **no topo** de `app.routes.ts`, sem guard.
- **Subir:** `preview_start` com `name: "athlete"` e abrir `http://localhost:4211/qa-avaliacao`.
- **Conferir em 375px e em desktop:**
  - estrelas tocáveis;
  - aspectos sem estourar a largura;
  - contador do comentário;
  - aviso de anonimato visível;
  - botões do diálogo alcançáveis sem rolar a página por trás.
  
  Tire um screenshot de cada.
- **Apagar** a pasta `qa-review/` e a rota. `git status` não pode mostrar nenhum dos dois.

- [ ] **Step 4: Nada fora do worktree e branch limpa**

Run:

```bash
git -C /Users/silviodionizio/Documents/projects/volley/nexago status --short | head
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && git status --short && git log --oneline origin/main..HEAD | head -30
```

Expected: o checkout principal não ganhou nenhum arquivo desta fase, o worktree está limpo e os commits de A1–A8 e B1–B8 aparecem.

- [ ] **Step 5: PR**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422
git push -u origin claude/tournament-reviews-fase-2
gh pr create --title "Avaliação do torneio pelos atletas — fase 2 (app e portal do atleta)" --body "$(cat <<'EOF'
## O que entra

**App**
- Formulário em `/torneios/:id/avaliar`: nota geral, 5 aspectos opcionais e comentário anônimo.
- Botão no detalhe do torneio e na campanha.
- Card "Avalie seus torneios" na Home.
- O push e o inbox abrem o formulário.

**Portal do atleta**
- Diálogo aberto pela casca do torneio com `?avaliar=1`.
- Botão nas abas Visão geral e Minha inscrição.
- Card no painel.
- `torneios/:id/avaliar` redireciona para Minha inscrição com o diálogo aberto.
- O inbox leva para a avaliação.

Depende do backend da fase 1 (#533). Sem a flag ligada, ninguém recebe convite e nada disso aparece.

## Testes
- App: modelos (com paridade de aspectos contra `functions/`), regras, serviço (callable não deployada vira mensagem legível), providers, formulário, botão, card e roteamento de push.
- Portal: regras, mensagens de erro, store, diálogo, botão e redirect. Suíte completa e build de produção passam.
- Checagem visual do portal em 375px e desktop, com rota temporária que não foi commitada.

## Fica para depois
- Checagem visual no app com dados reais: precisa de um convite no projeto DEV.
- Fase 3 (organizador), fase 4 (exibição pública) e fase 5 (backoffice).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Se o #533 ainda estiver aberto, acrescente `--base claude/tournament-athlete-rating-361422` ao `gh pr create`.
