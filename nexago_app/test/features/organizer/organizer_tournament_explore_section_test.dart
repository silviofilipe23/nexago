import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/tournament_staff_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_uniforms/tournament_uniforms_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_uniforms/tournament_uniforms_providers.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/widgets/organizer_tournament_explore_section.dart';

const _tournamentId = 't1';
const _summary = OrganizerTournamentSummary(
  tournamentId: _tournamentId,
  name: 'Open Goiânia',
  categoryCount: 3,
);

Future<void> _pump(
  WidgetTester tester, {
  required bool isOwner,
  required bool showFinancial,
  required bool matchesOnly,
  required bool showUniforms,
  TournamentReviewSummary? reviewSummary,
}) {
  return tester.pumpWidget(
    ProviderScope(
      overrides: [
        // Sempre observado, independente do papel — sem override a tela
        // tentaria acessar o Firestore de verdade.
        organizerTournamentMatchesProvider.overrideWith(
          (ref, tournamentId) => const Stream.empty(),
        ),
        // O card de avaliações observa o resumo para todo papel menos o mesário.
        tournamentReviewSummaryProvider.overrideWith(
          (ref, tournamentId) => Stream.value(reviewSummary),
        ),
        if (isOwner)
          tournamentStaffProvider.overrideWith(
            (ref, tournamentId) => const Stream.empty(),
          ),
        if (showUniforms)
          organizerTournamentUniformsDisplaySummaryProvider.overrideWith(
            (ref, tournamentId) => const OrganizerUniformsSummary(),
          ),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: OrganizerTournamentExploreSection(
            tournamentId: _tournamentId,
            summary: _summary,
            showUniforms: showUniforms,
            isOwner: isOwner,
            showFinancial: showFinancial,
            matchesOnly: matchesOnly,
          ),
        ),
      ),
    ),
  );
}

void main() {
  group('OrganizerTournamentExploreSection — visibilidade por papel', () {
    testWidgets(
      'dono vê Categorias, Financeiro, Partidas, Equipe e Uniformes',
      (tester) async {
        await _pump(
          tester,
          isOwner: true,
          showFinancial: true,
          matchesOnly: false,
          showUniforms: true,
        );
        await tester.pump();

        expect(find.text('Categorias'), findsOneWidget);
        expect(find.text('Financeiro'), findsOneWidget);
        expect(find.text('Partidas'), findsOneWidget);
        expect(find.text('Equipe'), findsOneWidget);
        expect(find.text('Uniformes'), findsOneWidget);
      },
    );

    testWidgets(
      'mesário (scorer, matchesOnly) vê só o card de Partidas',
      (tester) async {
        await _pump(
          tester,
          isOwner: false,
          showFinancial: false,
          matchesOnly: true,
          showUniforms: true,
        );
        await tester.pump();

        expect(find.text('Categorias'), findsNothing);
        expect(find.text('Financeiro'), findsNothing);
        expect(find.text('Partidas'), findsOneWidget);
        expect(find.text('Equipe'), findsNothing);
        expect(find.text('Uniformes'), findsNothing);
      },
    );

    testWidgets(
      'gestor de staff (não-dono, sem matchesOnly) vê Categorias, '
      'Financeiro, Partidas e Uniformes, mas não Equipe',
      (tester) async {
        await _pump(
          tester,
          isOwner: false,
          showFinancial: true,
          matchesOnly: false,
          showUniforms: true,
        );
        await tester.pump();

        expect(find.text('Categorias'), findsOneWidget);
        expect(find.text('Financeiro'), findsOneWidget);
        expect(find.text('Partidas'), findsOneWidget);
        expect(find.text('Equipe'), findsNothing);
        expect(find.text('Uniformes'), findsOneWidget);
      },
    );

    testWidgets(
      'torneio sem uniforme obrigatório não mostra o card mesmo pro dono',
      (tester) async {
        await _pump(
          tester,
          isOwner: true,
          showFinancial: true,
          matchesOnly: false,
          showUniforms: false,
        );
        await tester.pump();

        expect(find.text('Uniformes'), findsNothing);
      },
    );

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
  });

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
}
