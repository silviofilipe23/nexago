import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_category_card.dart';

void main() {
  const offer = TournamentCategoryOffer(
    id: 'masc-b',
    name: 'Masculino B',
    entryFee: 90,
    genderType: 'Masculino',
    spotsLeft: 8,
    spotsTotal: 32,
    bracketFormat: 'Pool Play + SE',
    prizes: [
      TournamentCategoryPrize(position: '1', value: 1000),
    ],
  );

  Future<void> pumpCard(
    WidgetTester tester,
    TournamentListingStatus status,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: TournamentDetailCategoryCard(
              offer: offer,
              tournamentId: 't1',
              tournamentName: 'Etapa Garden',
              tournamentStatus: status,
              onRegister: () {},
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('mostra taxa e vagas com torneio em aberto', (tester) async {
    await pumpCard(tester, TournamentListingStatus.open);

    expect(find.text('VAGAS'), findsOneWidget);
    expect(find.text('TAXA'), findsOneWidget);
    expect(find.text('por equipe'), findsOneWidget);
    expect(find.text('8 vagas'), findsOneWidget);
  });

  testWidgets('esconde taxa e vagas com torneio finalizado', (tester) async {
    await pumpCard(tester, TournamentListingStatus.completed);

    expect(find.text('VAGAS'), findsNothing);
    expect(find.text('TAXA'), findsNothing);
    expect(find.text('por equipe'), findsNothing);
    expect(find.textContaining('vagas'), findsNothing);
    expect(find.textContaining('equipes'), findsNothing);
    // Identidade e premiação continuam de pé.
    expect(find.text('Masculino B'), findsOneWidget);
    expect(find.text('PREMIAÇÃO'), findsOneWidget);
    expect(find.text('ENCERRADA'), findsOneWidget);
  });

  testWidgets('esconde taxa e vagas com torneio encerrado', (tester) async {
    await pumpCard(tester, TournamentListingStatus.ended);

    expect(find.text('VAGAS'), findsNothing);
    expect(find.text('TAXA'), findsNothing);
  });
}
