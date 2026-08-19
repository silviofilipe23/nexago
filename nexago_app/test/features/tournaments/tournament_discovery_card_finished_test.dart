// Torneio concluído no card do Competir: inscrição fechada não anuncia mais vaga livre nem
// valor de inscrição — os dois viram convite para algo que não existe. Fica só a contagem de
// inscritos, que é o número que continua valendo depois do evento.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_discovery_card.dart';

void main() {
  setUpAll(() async {
    // O card aberto formata a data curta com locale pt_BR.
    await initializeDateFormatting('pt_BR');
  });

  DiscoveryTournament buildTournament(TournamentListingStatus status) {
    return DiscoveryTournament(
      id: 't1',
      name: 'Copa Teste',
      location: 'Arena Teste',
      city: 'Goiânia',
      dateLabel: '16/08',
      startDate: DateTime(2026, 8, 16),
      categories: const [TournamentGenderCat.m],
      format: TournamentFormat.dupla,
      priceLabel: 'R\$ 140,00',
      priceValue: 140,
      spotsLeft: 2,
      spotsTotal: 8,
      status: status,
      featured: false,
      enrolledCount: 6,
      liveMatchesNow: 0,
      categoryOffers: const [
        TournamentCategoryOffer(
          id: 'Masc',
          name: 'Masculino C',
          entryFee: 140,
          maxTeams: 8,
          spotsLeft: 2,
        ),
      ],
    );
  }

  Future<void> pumpCard(
    WidgetTester tester,
    TournamentListingStatus status,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tournamentCategoryEnrollmentCountsProvider.overrideWith(
            (ref, tournamentId) => Stream.value(const {'Masc': 6}),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: SingleChildScrollView(
              child: TournamentDiscoveryCard(
                tournament: buildTournament(status),
                onTap: () {},
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  group('TournamentDiscoveryCard — torneio concluído', () {
    testWidgets('esconde o valor da inscrição', (tester) async {
      await pumpCard(tester, TournamentListingStatus.completed);

      expect(find.text('A PARTIR DE'), findsNothing);
      expect(find.text('R\$ 140,00'), findsNothing);
    });

    testWidgets('esconde as vagas livres', (tester) async {
      await pumpCard(tester, TournamentListingStatus.completed);

      expect(find.text('VAGAS POR CATEGORIA'), findsNothing);
      expect(find.text('2 livres'), findsNothing);
      expect(find.text('6/8 inscritas'), findsNothing);
    });

    testWidgets('mostra a contagem de duplas inscritas', (tester) async {
      await pumpCard(tester, TournamentListingStatus.completed);

      expect(find.text('6 duplas inscritas'), findsOneWidget);
    });

    testWidgets('vale também para o status encerrado', (tester) async {
      await pumpCard(tester, TournamentListingStatus.ended);

      expect(find.text('A PARTIR DE'), findsNothing);
      expect(find.text('6 duplas inscritas'), findsOneWidget);
    });

    testWidgets('mantém o CTA de ver detalhes', (tester) async {
      await pumpCard(tester, TournamentListingStatus.completed);

      expect(find.text('Ver detalhes →'), findsOneWidget);
    });
  });

  group('TournamentDiscoveryCard — torneio aberto', () {
    testWidgets('segue mostrando vagas e valor', (tester) async {
      await pumpCard(tester, TournamentListingStatus.open);

      expect(find.text('A PARTIR DE'), findsOneWidget);
      expect(find.text('R\$ 140,00'), findsOneWidget);
      expect(find.text('VAGAS POR CATEGORIA'), findsOneWidget);
      expect(find.text('2 livres'), findsOneWidget);
      expect(find.text('6 duplas inscritas'), findsNothing);
    });
  });
}
