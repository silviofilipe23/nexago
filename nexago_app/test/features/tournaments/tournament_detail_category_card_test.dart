import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_category_card.dart';

void main() {
  const offer = TournamentCategoryOffer(
    id: 'masc-b',
    name: 'Intermediário Masculino',
    entryFee: 90,
    genderType: 'Masculino',
    spotsLeft: 8,
    spotsTotal: 32,
    bracketFormat: 'Pool Play + SE',
    prizes: [TournamentCategoryPrize(position: '1', value: 1000)],
  );

  Future<void> pumpCard(
    WidgetTester tester,
    TournamentListingStatus status, {
    TournamentCategoryOffer category = offer,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: TournamentDetailCategoryCard(
              offer: category,
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

  testWidgets('identidade: nome e frase do nível', (tester) async {
    await pumpCard(tester, TournamentListingStatus.open);

    expect(find.text('Intermediário Masculino'), findsOneWidget);
    expect(find.text('Equilíbrio e grandes jogos'), findsOneWidget);
  });

  testWidgets('cada faixa de nível traz a própria frase', (tester) async {
    const iniciante = TournamentCategoryOffer(
      id: 'ini',
      name: 'Iniciante Feminino',
      entryFee: 60,
      spotsTotal: 16,
    );
    await pumpCard(
      tester,
      TournamentListingStatus.open,
      category: iniciante,
    );

    expect(find.text('Comece sua jornada'), findsOneWidget);
    expect(find.text('Equilíbrio e grandes jogos'), findsNothing);
  });

  testWidgets('linha de meta traz vagas, formato curto e taxa', (tester) async {
    await pumpCard(tester, TournamentListingStatus.open);

    expect(find.text('24/32'), findsOneWidget);
    expect(find.text('equipes'), findsOneWidget);
    expect(find.text('Grupos'), findsOneWidget);
    expect(find.text(formatBRL(90)), findsOneWidget);
    expect(find.text('por equipe'), findsOneWidget);
  });

  testWidgets('torneio finalizado esconde vagas e taxa', (tester) async {
    await pumpCard(tester, TournamentListingStatus.completed);

    expect(find.text('equipes'), findsNothing);
    expect(find.text('por equipe'), findsNothing);
    expect(find.text(formatBRL(90)), findsNothing);
    // Identidade e status continuam de pé.
    expect(find.text('Intermediário Masculino'), findsOneWidget);
    expect(find.text('ENCERRADA'), findsOneWidget);
  });

  // A premiação saiu do card (vive na página da categoria), mas o total é a
  // única informação viva de um torneio já encerrado — some tudo sem ele.
  testWidgets('torneio finalizado mantém o total em prêmios', (tester) async {
    await pumpCard(tester, TournamentListingStatus.completed);

    expect(find.text(formatBRL(1000)), findsOneWidget);
    expect(find.text('em prêmios'), findsOneWidget);
  });

  testWidgets('categoria lotada sem fila anuncia o esgotamento',
      (tester) async {
    const lotada = TournamentCategoryOffer(
      id: 'cheia',
      name: 'Open Masculino',
      entryFee: 120,
      spotsLeft: 0,
      spotsTotal: 16,
      waitlistEnabled: false,
    );
    await pumpCard(tester, TournamentListingStatus.open, category: lotada);

    // O selo do cabeçalho é o anúncio; um segundo aviso embaixo repetia a
    // mesma informação e espremia o CTA até truncar o rótulo.
    expect(find.text('LOTADA'), findsOneWidget);
    expect(find.text('Inscreva-se'), findsNothing);
  });

  testWidgets('categoria com vaga oferece a inscrição', (tester) async {
    await pumpCard(tester, TournamentListingStatus.open);

    expect(find.text('Inscreva-se'), findsOneWidget);
  });
}
