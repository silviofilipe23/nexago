import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_podium_logic.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_podium_tab.dart';

Widget _app(List<TournamentCategoryPodium> podiums) {
  return MaterialApp(
    home: Scaffold(
      body: CustomScrollView(
        slivers: TournamentDetailPodiumTab(podiums: podiums).buildSlivers(),
      ),
    ),
  );
}

const _decided = TournamentCategoryPodium(
  categoryId: 'c1',
  categoryName: 'Masculino B',
  places: [
    TournamentPodiumPlace(
      place: 1,
      teamId: 't1',
      teamName: 'Ana & Bia',
      prizeValue: 500,
    ),
    TournamentPodiumPlace(place: 2, teamId: 't2', teamName: 'Carla & Duda'),
    TournamentPodiumPlace(place: 3, teamId: 't3', teamName: 'Eva & Fran'),
  ],
);

const _undecided = TournamentCategoryPodium(
  categoryId: 'c2',
  categoryName: 'Feminino A',
  places: [],
);

void main() {
  testWidgets('mostra campeão, vice, 3º lugar e o prêmio da categoria',
      (tester) async {
    await tester.pumpWidget(_app(const [_decided]));

    expect(find.textContaining('MASCULINO B'), findsOneWidget);
    expect(find.text('Ana & Bia'), findsOneWidget);
    expect(find.text('Carla & Duda'), findsOneWidget);
    expect(find.text('Eva & Fran'), findsOneWidget);
    // `formatBRLWhole` separa símbolo e número com espaço NÃO SEPARÁVEL
    // (U+00A0), não com espaço comum — escrito aqui como escape para o
    // literal não depender de como o editor trata o caractere.
    expect(find.textContaining('R\$\u00A0500'), findsOneWidget);
  });

  testWidgets('categoria sem final decidida aparece com aviso, não some',
      (tester) async {
    await tester.pumpWidget(_app(const [_undecided]));

    expect(find.textContaining('FEMININO A'), findsOneWidget);
    expect(find.textContaining('não definido'), findsOneWidget);
  });

  testWidgets('sem categoria nenhuma mostra o estado vazio', (tester) async {
    await tester.pumpWidget(_app(const []));

    expect(find.textContaining('Nenhum pódio'), findsOneWidget);
  });
}
