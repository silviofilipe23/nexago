// Categoria já inscrita no passo de escolha: o selo conta o estado, mas o
// toque continua valendo — é por ele que quem reservou solo volta à inscrição
// para convidar o parceiro. Card sem toque era beco sem saída.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_category_card.dart';

void main() {
  const offer = TournamentCategoryOffer(
    id: 'masc-b',
    name: 'Masculino B',
    entryFee: 90,
    spotsLeft: 8,
    maxTeams: 32,
  );

  const fullOffer = TournamentCategoryOffer(
    id: 'masc-b',
    name: 'Masculino B',
    entryFee: 90,
    spotsLeft: 0,
    maxTeams: 32,
  );

  Future<int> pumpCard(
    WidgetTester tester, {
    required TournamentCategoryOffer offer,
    bool alreadyRegistered = false,
    bool registrationIncomplete = false,
    int? inscriptionCount,
  }) async {
    var taps = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: TournamentRegistrationCategoryCard(
            offer: offer,
            format: TournamentFormat.dupla,
            inscriptionCount: inscriptionCount,
            alreadyRegistered: alreadyRegistered,
            registrationIncomplete: registrationIncomplete,
            onTap: () => taps++,
          ),
        ),
      ),
    );
    await tester.tap(find.text('Masculino B'));
    await tester.pump();
    return taps;
  }

  testWidgets('inscrição pendente: selo de continuar e toque retoma',
      (tester) async {
    final taps = await pumpCard(
      tester,
      offer: offer,
      alreadyRegistered: true,
      registrationIncomplete: true,
    );

    expect(find.text('CONTINUAR INSCRIÇÃO'), findsOneWidget);
    expect(find.text('JÁ INSCRITO'), findsNothing);
    expect(taps, 1);
  });

  testWidgets('inscrição concluída: selo "JÁ INSCRITO" e toque continua valendo',
      (tester) async {
    final taps = await pumpCard(
      tester,
      offer: offer,
      alreadyRegistered: true,
    );

    expect(find.text('JÁ INSCRITO'), findsOneWidget);
    expect(taps, 1);
  });

  testWidgets('categoria lotada mas já inscrito: a vaga é dele, toque vale',
      (tester) async {
    final taps = await pumpCard(
      tester,
      offer: fullOffer,
      alreadyRegistered: true,
      registrationIncomplete: true,
      inscriptionCount: 32,
    );

    expect(find.text('CONTINUAR INSCRIÇÃO'), findsOneWidget);
    expect(taps, 1);
  });

  testWidgets('categoria lotada sem inscrição: segue bloqueada', (tester) async {
    final taps = await pumpCard(
      tester,
      offer: fullOffer,
      inscriptionCount: 32,
    );

    expect(taps, 0);
  });
}
