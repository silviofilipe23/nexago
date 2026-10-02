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
