import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_podium_logic.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_podium_tab.dart';

TournamentPodiumPlace _place(int place, String team, List<String> players) {
  return TournamentPodiumPlace(
    place: place,
    teamId: 't$place',
    teamName: team,
    players: [
      for (final n in players)
        TournamentMatchCardPlayerViewModel(
          initials: n.substring(0, 1),
          avatarColor: const Color(0xFF00FF88),
          name: n,
        ),
    ],
  );
}

final _masculino = TournamentCategoryPodium(
  categoryId: 'c1',
  categoryName: 'Masculino Open',
  places: [
    _place(1, 'Bruno / Lucas', const ['Bruno', 'Lucas']),
    _place(2, 'Rafael / Diego', const ['Rafael', 'Diego']),
    _place(3, 'Matheus / Caio', const ['Matheus', 'Caio']),
  ],
);

const _feminino = TournamentCategoryPodium(
  categoryId: 'c2',
  categoryName: 'Feminino Open',
  places: [],
);

Widget _app({
  required List<TournamentCategoryPodium> podiums,
  required String selectedCategoryId,
  ValueChanged<String>? onSelectCategory,
  Map<String, int> teamCounts = const {},
}) {
  return MaterialApp(
    home: Scaffold(
      body: CustomScrollView(
        slivers: TournamentDetailPodiumTab(
          podiums: podiums,
          selectedCategoryId: selectedCategoryId,
          onSelectCategory: onSelectCategory ?? (_) {},
          teamCountByCategoryId: teamCounts,
        ).buildSlivers(),
      ),
    ),
  );
}

void main() {
  testWidgets('o pódio da categoria selecionada mostra os três degraus '
      'com o nome de cada atleta', (tester) async {
    await tester.pumpWidget(
      _app(
        podiums: [_masculino, _feminino],
        selectedCategoryId: 'c1',
        teamCounts: const {'c1': 16},
      ),
    );

    expect(find.text('1º'), findsOneWidget);
    expect(find.text('2º'), findsOneWidget);
    expect(find.text('3º'), findsOneWidget);

    expect(find.text('Bruno'), findsOneWidget);
    expect(find.text('Lucas'), findsOneWidget);
    expect(find.text('Rafael'), findsOneWidget);
    expect(find.text('Diego'), findsOneWidget);
    expect(find.text('Matheus'), findsOneWidget);
    expect(find.text('Caio'), findsOneWidget);
  });

  testWidgets('o cabeçalho traz a categoria, o subtítulo e o total de duplas',
      (tester) async {
    await tester.pumpWidget(
      _app(
        podiums: [_masculino, _feminino],
        selectedCategoryId: 'c1',
        teamCounts: const {'c1': 16},
      ),
    );

    expect(find.text('Pódio da categoria'), findsOneWidget);
    expect(find.text('16 duplas'), findsOneWidget);
    // Uma vez no chip, uma vez no cabeçalho.
    expect(find.text('Masculino Open'), findsNWidgets(2));
  });

  testWidgets('sem contagem conhecida o selo de duplas não aparece',
      (tester) async {
    await tester.pumpWidget(
      _app(podiums: [_masculino], selectedCategoryId: 'c1'),
    );

    expect(find.textContaining('duplas'), findsNothing);
  });

  testWidgets('tocar no chip de outra categoria avisa quem controla a tela',
      (tester) async {
    final selected = <String>[];
    await tester.pumpWidget(
      _app(
        podiums: [_masculino, _feminino],
        selectedCategoryId: 'c1',
        onSelectCategory: selected.add,
      ),
    );

    await tester.tap(find.text('Feminino Open'));
    await tester.pump();

    expect(selected, ['c2']);
  });

  testWidgets('categoria sem final decidida mostra o aviso, e os chips ficam',
      (tester) async {
    await tester.pumpWidget(
      _app(podiums: [_masculino, _feminino], selectedCategoryId: 'c2'),
    );

    expect(find.textContaining('não definido'), findsOneWidget);
    expect(find.text('1º'), findsNothing);
    // Os chips continuam: é por eles que se volta para a categoria decidida.
    expect(find.text('Masculino Open'), findsOneWidget);
  });

  testWidgets('sem categoria nenhuma mostra o estado vazio', (tester) async {
    await tester.pumpWidget(_app(podiums: const [], selectedCategoryId: ''));

    expect(find.textContaining('Nenhum pódio'), findsOneWidget);
  });
}
