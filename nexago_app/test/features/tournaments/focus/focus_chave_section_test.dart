import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/sections/focus_chave_section.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/bracket/double_elimination_bracket_canvas.dart';

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
  );
}

TournamentMatch _match({
  required String id,
  int round = 1,
  int matchNumber = 0,
  String matchType = 'WB',
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

Widget _app(List<TournamentMatch> matches) {
  return ProviderScope(
    overrides: [
      tournamentMatchCardsProvider('t1').overrideWith(
        (ref) => Stream.value([for (final m in matches) _card(m)]),
      ),
      tournamentUserTeamIdsByCategoryProvider('t1')
          .overrideWith((ref) => Stream.value(const {})),
    ],
    child: MaterialApp(
      home: Scaffold(
        body: FocusChaveSection(
          tournament: _tournament(),
          categoryId: 'cat-a',
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('desenha a chave navegável DENTRO da seção', (tester) async {
    // O ponto da seção: a chave é o conteúdo, não um card que empurra outra
    // rota e tira o atleta da casca imersiva do Focus.
    await tester.pumpWidget(
      _app([
        _match(id: 'w1', matchNumber: 1, advanceTo: 3, advanceSlot: 'A'),
        _match(id: 'w2', matchNumber: 2, advanceTo: 3, advanceSlot: 'B'),
        _match(id: 'w3', round: 2, matchNumber: 3),
      ]),
    );
    await tester.pumpAndSettle();

    expect(find.byType(DoubleEliminationBracketCanvas), findsOneWidget);
    expect(find.text('Ver chave interativa'), findsNothing);
  });

  testWidgets('sem chave gerada mostra o aviso, não um canvas vazio',
      (tester) async {
    await tester.pumpWidget(_app(const []));
    await tester.pumpAndSettle();

    expect(find.byType(DoubleEliminationBracketCanvas), findsNothing);
    expect(find.text('Chave ainda não publicada'), findsOneWidget);
  });
}
