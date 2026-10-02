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
    // O AppEmptyView entra com FadeSlideIn (timer de 0 ms); sem spinner na tela, dá pra assentar.
    await tester.pumpAndSettle();
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
    // O AppEmptyView entra com FadeSlideIn (timer de 0 ms); sem spinner na tela, dá pra assentar.
    await tester.pumpAndSettle();
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
