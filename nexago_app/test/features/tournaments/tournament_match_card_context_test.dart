import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_match_card.dart';

/// A linha de contexto existe para a lista do TORNEIO INTEIRO (seção Arena):
/// sem ela o atleta vê o jogo #14 sem saber de que categoria ele é. É opcional
/// de propósito — o card do resto do app não pode mudar, senão diverge do
/// desenho à mão do portal do atleta.

TournamentMatchCardViewModel _viewModel() {
  return TournamentMatchCardViewModel(
    match: TournamentMatch(
      id: 'm1',
      tournamentId: 't1',
      categoryId: 'c1',
      round: 1,
      matchType: 'group',
      poolId: 'B',
      teamAId: 'a',
      teamBId: 'b',
      status: TournamentMatchStatus.inProgress,
      resultA: '',
      resultB: '',
      isGroupMatch: true,
      matchNumber: 14,
      courtName: '3',
    ),
    teamA: const TournamentMatchCardTeamViewModel(
      displayName: 'Marcelo / Enzo',
      players: [],
    ),
    teamB: const TournamentMatchCardTeamViewModel(
      displayName: 'Sá / Toledo',
      players: [],
    ),
  );
}

Widget _host(Widget child) {
  return ProviderScope(
    child: MaterialApp(home: Scaffold(body: ListView(children: [child]))),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR', null);
  });

  testWidgets('mostra a linha de contexto quando ela é informada',
      (tester) async {
    await tester.pumpWidget(
      _host(
        TournamentMatchCard(
          viewModel: _viewModel(),
          contextLabel: 'Misto B · Grupo B',
        ),
      ),
    );

    expect(find.text('MISTO B · GRUPO B'), findsOneWidget);
    // O que o card já trazia continua no lugar.
    expect(find.text('#14'), findsOneWidget);
    expect(find.textContaining('QUADRA 3'), findsOneWidget);
  });

  testWidgets('sem contexto informado, o card não ganha linha nenhuma',
      (tester) async {
    await tester.pumpWidget(_host(TournamentMatchCard(viewModel: _viewModel())));

    expect(find.text('MISTO B · GRUPO B'), findsNothing);
    expect(find.text('#14'), findsOneWidget);
  });
}
