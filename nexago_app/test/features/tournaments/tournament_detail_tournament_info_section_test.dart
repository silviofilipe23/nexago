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
