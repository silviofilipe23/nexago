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
