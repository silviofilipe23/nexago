import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/sections/focus_arena_section.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_match_card.dart';

const _team = TournamentMatchCardTeamViewModel(
  displayName: 'Dupla',
  players: [],
);

TournamentDetail _tournament() {
  final today = DateTime.now();
  return TournamentDetail(
    id: 't1',
    name: 'Copa Teste',
    location: 'Arena X',
    city: 'Goiânia',
    dateLabel: '',
    startDate: today,
    endDate: today,
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 90',
    priceValue: 90,
    spotsLeft: 10,
    spotsTotal: 32,
    status: TournamentListingStatus.live,
    featured: false,
    enrolledCount: 0,
    liveMatchesNow: 0,
    categoryOffers: const [
      TournamentCategoryOffer(id: 'cat-a', name: 'Misto B', entryFee: 90),
      TournamentCategoryOffer(id: 'cat-b', name: 'Masculina A', entryFee: 90),
    ],
  );
}

TournamentMatchCardViewModel _card({
  required String id,
  required String status,
  String categoryId = 'cat-a',
  String poolId = 'B',
  int matchNumber = 14,
  String courtName = '3',
  DateTime? scheduleTime,
}) {
  return TournamentMatchCardViewModel(
    match: TournamentMatch(
      id: id,
      tournamentId: 't1',
      categoryId: categoryId,
      round: 1,
      matchType: 'group',
      poolId: poolId,
      teamAId: 'a',
      teamBId: 'b',
      status: status,
      resultA: '',
      resultB: '',
      isGroupMatch: true,
      matchNumber: matchNumber,
      courtName: courtName,
      scheduleTime: scheduleTime ?? DateTime.now(),
    ),
    teamA: _team,
    teamB: _team,
  );
}

Widget _app(List<TournamentMatchCardViewModel> cards) {
  return ProviderScope(
    overrides: [
      tournamentMatchCardsProvider('t1')
          .overrideWith((ref) => Stream.value(cards)),
    ],
    child: MaterialApp(
      // O ponto do "ao vivo" pulsa em laço infinito, e `pumpAndSettle` nunca
      // assentaria. `disableAnimations` é o mesmo caminho que o aparelho com
      // "reduzir movimento" percorre — não é um atalho só de teste.
      home: MediaQuery(
        data: const MediaQueryData(disableAnimations: true),
        child: Scaffold(
          body: FocusArenaSection(
            tournament: _tournament(),
            athleteTeamIds: const {},
          ),
        ),
      ),
    ),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR', null);
  });

  testWidgets('manchete e chips contam ao vivo e fila separadamente',
      (tester) async {
    await tester.pumpWidget(
      _app([
        _card(id: 'v1', status: TournamentMatchStatus.inProgress),
        _card(id: 'v2', status: TournamentMatchStatus.inProgress),
        _card(id: 's1', status: TournamentMatchStatus.scheduled),
      ]),
    );
    await tester.pumpAndSettle();

    expect(find.text('AO VIVO NA ARENA'), findsOneWidget);
    expect(find.text('2 partidas em quadra agora.'), findsOneWidget);
    expect(find.text('2 EM QUADRA'), findsOneWidget);
    expect(find.text('1 A SEGUIR'), findsOneWidget);
  });

  testWidgets('o card ao vivo traz número, quadra e a categoria da partida',
      (tester) async {
    await tester.pumpWidget(
      _app([
        _card(
          id: 'v1',
          status: TournamentMatchStatus.inProgress,
          matchNumber: 14,
          courtName: '3',
        ),
      ]),
    );
    await tester.pumpAndSettle();

    expect(find.text('#14'), findsOneWidget);
    expect(find.textContaining('QUADRA 3'), findsOneWidget);
    // A lista é do torneio inteiro: sem a categoria o "#14" não diz de que
    // jogo se trata.
    expect(find.text('MISTO B · GRUPO B'), findsOneWidget);
  });

  testWidgets('tocar em A SEGUIR troca a lista', (tester) async {
    await tester.pumpWidget(
      _app([
        _card(id: 'v1', status: TournamentMatchStatus.inProgress),
        _card(
          id: 's1',
          status: TournamentMatchStatus.scheduled,
          categoryId: 'cat-b',
          poolId: 'A',
          matchNumber: 21,
        ),
      ]),
    );
    await tester.pumpAndSettle();

    expect(find.text('AO VIVO AGORA'), findsOneWidget);
    expect(find.byType(TournamentMatchCard), findsOneWidget);
    expect(find.text('#14'), findsOneWidget);

    await tester.tap(find.text('1 A SEGUIR'));
    await tester.pumpAndSettle();

    expect(find.text('A SEGUIR'), findsOneWidget);
    expect(find.text('#21'), findsOneWidget);
    expect(find.text('#14'), findsNothing);
    expect(find.text('MASCULINA A · GRUPO A'), findsOneWidget);
  });

  testWidgets('nada em quadra: abre já na fila, sem esconder o conteúdo',
      (tester) async {
    await tester.pumpWidget(
      _app([_card(id: 's1', status: TournamentMatchStatus.scheduled)]),
    );
    await tester.pumpAndSettle();

    expect(find.text('Nenhuma partida em quadra agora.'), findsOneWidget);
    expect(find.text('A SEGUIR'), findsOneWidget);
    expect(find.byType(TournamentMatchCard), findsOneWidget);
  });

  // O padrão do teste de widget é 800x600 — largo demais para provar qualquer
  // coisa sobre o topo desta seção, que empilha manchete de 32px e dois chips
  // lado a lado. `tester.view` é o que mexe no MediaQuery de verdade;
  // `setSurfaceSize` não mexe.
  testWidgets('o topo cabe num aparelho estreito, sem estourar',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      _app([
        for (var i = 0; i < 12; i++)
          _card(
            id: 'v$i',
            status: TournamentMatchStatus.inProgress,
            matchNumber: 10 + i,
          ),
      ]),
    );
    await tester.pumpAndSettle();

    expect(find.text('12 EM QUADRA'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('arena vazia explica em vez de mostrar lista em branco',
      (tester) async {
    await tester.pumpWidget(_app(const []));
    await tester.pumpAndSettle();

    expect(find.text('Nenhuma partida em quadra agora.'), findsOneWidget);
    expect(find.byType(TournamentMatchCard), findsNothing);
    expect(find.textContaining('Nada em quadra'), findsOneWidget);
  });
}
