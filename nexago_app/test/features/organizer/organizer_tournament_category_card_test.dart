import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_models.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/widgets/organizer_tournament_category_card.dart';

void main() {
  testWidgets('OrganizerTournamentCategoryCard shows lotado badge when full',
      (tester) async {
    const category = OrganizerTournamentCategorySummary(
      categoryId: 'open',
      name: 'Open',
      maxTeams: 4,
      enrolledCount: 4,
      paidCount: 4,
      pendingCount: 0,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: OrganizerTournamentCategoryCard(
            category: category,
            onTap: () {},
            onGenerateBracket: () {},
          ),
        ),
      ),
    );

    expect(find.text('LOTADO'), findsOneWidget);
    expect(find.text('Gerar chave'), findsOneWidget);
  });
}
