import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_group_standings_logic.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_pool_standings_widgets.dart';

/// A tabela do grupo tem de mostrar os mesmos dados da tela de grupos do portal
/// do organizador (`frontend/.../chaveamento/grupos.component.ts`): V, D, sets,
/// pontos feitos, pontos tomados, saldo de pontos e pontos de classificação.
/// Aqui a largura é de celular, então além de existir a coluna precisa caber.
void main() {
  const longestName = 'Silvio Dionizio / Marcos Antônio';

  TournamentPoolStandingsRow row({
    required int rank,
    required String displayName,
    required int wins,
    required int losses,
    required int setsWon,
    required int setsLost,
    required int gamesWon,
    required int gamesLost,
    bool qualifies = true,
    bool isAthleteTeam = false,
  }) {
    return TournamentPoolStandingsRow(
      rank: rank,
      teamId: 'team-$rank',
      displayName: displayName,
      wins: wins,
      losses: losses,
      setsWon: setsWon,
      setsLost: setsLost,
      gamesWon: gamesWon,
      gamesLost: gamesLost,
      points: wins * 2,
      qualifies: qualifies,
      isAthleteTeam: isAthleteTeam,
    );
  }

  final group = TournamentPoolStandingsGroup(
    poolId: 'A',
    poolLabel: 'Grupo A',
    teamCount: 3,
    matchCount: 3,
    isComplete: true,
    // Nenhum V/D/PTS vale zero de proposito: assim o unico "0" da tabela e o
    // saldo da 2a dupla, e `find.text('0')` prova mesmo a coluna SP.
    rows: [
      row(
        rank: 1,
        displayName: longestName,
        wins: 2,
        losses: 1,
        setsWon: 4,
        setsLost: 2,
        gamesWon: 42,
        gamesLost: 31,
        isAthleteTeam: true,
      ),
      row(
        rank: 2,
        displayName: 'Dupla B',
        wins: 1,
        losses: 1,
        setsWon: 2,
        setsLost: 2,
        gamesWon: 30,
        gamesLost: 30,
      ),
      row(
        rank: 3,
        displayName: 'Dupla C',
        wins: 1,
        losses: 2,
        setsWon: 2,
        setsLost: 4,
        gamesWon: 25,
        gamesLost: 36,
        qualifies: false,
      ),
    ],
  );

  SingleChildScrollView horizontalScroll(WidgetTester tester) {
    return tester.widgetList<SingleChildScrollView>(
      find.byType(SingleChildScrollView),
    ).firstWhere((view) => view.scrollDirection == Axis.horizontal);
  }

  Future<void> pumpCard(WidgetTester tester, {required double width}) async {
    tester.view.physicalSize = Size(width, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: TournamentPoolStandingsCard(
              group: group,
              qualifiersPerGroup: 2,
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('mostra pontos feitos, tomados e saldo na classificação',
      (tester) async {
    await pumpCard(tester, width: 360);

    expect(find.text('PF'), findsOneWidget);
    expect(find.text('PT'), findsOneWidget);
    expect(find.text('SP'), findsOneWidget);

    expect(find.text('42'), findsOneWidget);
    expect(find.text('31'), findsOneWidget);
    expect(find.text('+11'), findsOneWidget);

    expect(find.text('0'), findsOneWidget);
    expect(find.text('-11'), findsOneWidget);
  });

  testWidgets('em 360dp rola na horizontal em vez de espremer o nome',
      (tester) async {
    await pumpCard(tester, width: 360);

    expect(tester.takeException(), isNull);
    // Nove colunas nao cabem num celular. Em vez de encolher o nome da dupla ate
    // virar reticencias, a tabela inteira anda de lado.
    // 128 e o piso: duas linhas de um par completo. Era 91 quando as nove
    // colunas ainda tinham de caber na largura da tela.
    expect(
      tester.getSize(find.text(longestName)).width,
      greaterThanOrEqualTo(128),
    );
    expect(find.byWidget(horizontalScroll(tester)), findsOneWidget);
  });

  testWidgets('o saldo existe na tabela; o scroll revela o que nao cabe em 360dp',
      (tester) async {
    await pumpCard(tester, width: 360);

    // Com fonte maior e gaps entre colunas, PTS (e as vezes SP) fica atras do
    // arrasto — o contrato e existir na tabela e o bloco inteiro rolar junto.
    expect(find.text('+11'), findsOneWidget);
    expect(find.text('SP'), findsOneWidget);
    expect(find.text('PTS'), findsOneWidget);
    expect(find.byWidget(horizontalScroll(tester)), findsOneWidget);
  });

  testWidgets('cabecalho e linhas rolam juntos', (tester) async {
    await pumpCard(tester, width: 360);

    // Um scroll so para o bloco inteiro: se o cabecalho rolasse separado das
    // linhas, os rotulos sairiam do prumo dos numeros no primeiro arrasto.
    final scroll = horizontalScroll(tester);
    final header = find.text('SP');
    final value = find.text('+11');

    final beforeHeader = tester.getTopLeft(header).dx;
    final beforeValue = tester.getTopLeft(value).dx;

    await tester.drag(find.byWidget(scroll), const Offset(-120, 0));
    await tester.pumpAndSettle();

    final headerShift = beforeHeader - tester.getTopLeft(header).dx;
    final valueShift = beforeValue - tester.getTopLeft(value).dx;

    expect(headerShift, greaterThan(0));
    expect(headerShift, closeTo(valueShift, 0.5));
  });

  testWidgets('cabe em 320dp sem overflow', (tester) async {
    await pumpCard(tester, width: 320);

    expect(tester.takeException(), isNull);
  });

  testWidgets('em tela larga o nome ganha a sobra em vez de sobrar vazio',
      (tester) async {
    await pumpCard(tester, width: 600);

    expect(tester.takeException(), isNull);
    expect(
      tester.getSize(find.text(longestName)).width,
      greaterThan(128),
    );
  });
}
