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
