import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_models.dart';
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
}) {
  return tester.pumpWidget(
    ProviderScope(
      overrides: [
        // Sempre observado, independente do papel — sem override a tela
        // tentaria acessar o Firestore de verdade.
        organizerTournamentMatchesProvider.overrideWith(
          (ref, tournamentId) => const Stream.empty(),
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
  });
}
