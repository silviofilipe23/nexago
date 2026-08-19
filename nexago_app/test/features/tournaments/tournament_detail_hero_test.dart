import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_hero.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  TournamentDetail buildTournament(TournamentListingStatus status) {
    return TournamentDetail(
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
      status: status,
      featured: false,
      enrolledCount: 60,
      liveMatchesNow: 0,
      leagueStageOrder: 1,
    );
  }

  const stats = TournamentDetailStats(
    categoryCount: 3,
    openCategories: 2,
    spotsTotal: 80,
    spotsEnrolled: 60,
    prizeTotalLabel: r'R$ 13.500',
  );

  Future<void> pumpHero(
    WidgetTester tester,
    TournamentListingStatus status,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: TournamentDetailHero(
              tournament: buildTournament(status),
              stats: stats,
              topInset: 0,
              toolbar: const SizedBox.shrink(),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('mostra inscrição com torneio em aberto', (tester) async {
    await pumpHero(tester, TournamentListingStatus.open);

    expect(find.text('INSCRIÇÃO'), findsOneWidget);
    expect(find.text('por dupla'), findsOneWidget);
    expect(find.text(r'R$ 90'), findsOneWidget);
  });

  testWidgets('esconde inscrição com torneio finalizado', (tester) async {
    await pumpHero(tester, TournamentListingStatus.completed);

    expect(find.text('INSCRIÇÃO'), findsNothing);
    expect(find.text('por dupla'), findsNothing);
    expect(find.text(r'R$ 90'), findsNothing);
    // Prêmio total segue no hero.
    expect(find.text('PRÊMIO TOTAL'), findsOneWidget);
  });

  testWidgets('esconde inscrição com torneio encerrado', (tester) async {
    await pumpHero(tester, TournamentListingStatus.ended);

    expect(find.text('INSCRIÇÃO'), findsNothing);
  });
}
