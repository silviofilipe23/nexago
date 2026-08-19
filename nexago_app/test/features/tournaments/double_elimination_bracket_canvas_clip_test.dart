import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/double_elimination_bracket_layout.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/bracket/double_elimination_bracket_canvas.dart';

TournamentMatch _match({
  required String id,
  String matchType = 'WB',
  int round = 1,
  int matchNumber = 0,
  int? advanceTo,
  String? advanceSlot,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'cat-a',
    round: round,
    matchType: matchType,
    poolId: '',
    teamAId: 'a$id',
    teamBId: 'b$id',
    status: 'Scheduled',
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: matchNumber,
    winnerAdvanceMatchNumber: advanceTo,
    winnerAdvanceSlot: advanceSlot,
  );
}

TournamentMatchCardViewModel _card(TournamentMatch match) {
  const team = TournamentMatchCardTeamViewModel(
    displayName: 'Dupla',
    players: [
      TournamentMatchCardPlayerViewModel(
        initials: 'DP',
        avatarColor: Color(0xFF00FF88),
      ),
    ],
  );
  return TournamentMatchCardViewModel(match: match, teamA: team, teamB: team);
}

void main() {
  // Regressão: o canvas é bem maior que a viewport. Sem recorte, ele pinta
  // por cima do cabeçalho da categoria e do segmentado (Partidas/Grupos/Chave).
  testWidgets('canvas recorta o conteúdo na viewport', (tester) async {
    final matches = [
      _match(id: 'w1', round: 1, matchNumber: 1, advanceTo: 3, advanceSlot: 'A'),
      _match(id: 'w2', round: 1, matchNumber: 2, advanceTo: 3, advanceSlot: 'B'),
      _match(id: 'w3', round: 2, matchNumber: 3),
    ];
    final layout = buildDoubleEliminationBracketLayout(matches);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: DoubleEliminationBracketCanvas(
            layout: layout,
            cardsById: {for (final m in matches) m.id: _card(m)},
            athleteTeamIds: const {},
          ),
        ),
      ),
    );

    final viewer = tester.widget<InteractiveViewer>(
      find.byType(InteractiveViewer),
    );
    expect(viewer.clipBehavior, isNot(Clip.none));
  });
}
