import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_logic.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/widgets/organizer_category_scoring_section.dart';

Future<TournamentCategoryDraft?> _pump(
  WidgetTester tester,
  TournamentCategoryDraft category,
  TournamentSport sport,
) async {
  TournamentCategoryDraft? changed;
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(
        body: SingleChildScrollView(
          child: OrganizerCategoryScoringSection(
            category: category,
            sport: sport,
            onChanged: (c) => changed = c,
          ),
        ),
      ),
    ),
  );
  return changed;
}

void main() {
  testWidgets(
    'vôlei de quadra: melhor de, set até 25 e decisivo; + sobe o alvo',
    (tester) async {
      final category = TournamentCategoryDraft(
        id: 'c1',
        bestOf: TournamentBestOf.bestOf3,
        scoringProfileRaw: suggestedScoringProfile(
          TournamentSport.indoorVolleyball,
          TournamentBestOf.bestOf3,
        ),
      );
      TournamentCategoryDraft? changed;
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: SingleChildScrollView(
              child: OrganizerCategoryScoringSection(
                category: category,
                sport: TournamentSport.indoorVolleyball,
                onChanged: (c) => changed = c,
              ),
            ),
          ),
        ),
      );
      expect(find.text('MD3'), findsOneWidget);
      expect(find.text('SET ATÉ'), findsOneWidget);
      expect(find.text('25'), findsOneWidget);
      expect(find.text('SET DECISIVO ATÉ'), findsOneWidget);
      await tester.tap(
        find.descendant(
          of: find.byKey(const ValueKey('scoring-setTarget')),
          matching: find.byIcon(Icons.add_rounded),
        ),
      );
      expect(changed!.scoringProfileRaw!['setTarget'], 26);
    },
  );

  testWidgets('set único esconde o decisivo', (tester) async {
    await _pump(
      tester,
      const TournamentCategoryDraft(
        id: 'c1',
        bestOf: TournamentBestOf.singleSet,
      ),
      TournamentSport.beachVolleyball,
    );
    expect(find.text('SET ATÉ'), findsOneWidget);
    expect(find.text('SET DECISIVO ATÉ'), findsNothing);
  });

  testWidgets('beach tennis: sem vantagem e set decisivo', (tester) async {
    await _pump(
      tester,
      TournamentCategoryDraft(
        id: 'c1',
        bestOf: TournamentBestOf.bestOf3,
        scoringProfileRaw: suggestedScoringProfile(
          TournamentSport.beachTennis,
          TournamentBestOf.bestOf3,
        ),
      ),
      TournamentSport.beachTennis,
    );
    expect(find.text('Sem vantagem'), findsOneWidget);
    expect(find.text('Super tie-break'), findsOneWidget);
    expect(find.text('SET ATÉ'), findsNothing);
  });
}
