import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_row.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_live_score.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String teamAId = 'team-a',
  String teamBId = 'team-b',
  String status = TournamentMatchStatus.scheduled,
  String matchType = 'Group',
  String poolId = 'A',
  List<TournamentMatchSet> sets = const [],
  String? winnerId,
  int matchNumber = 12,
  String? courtName = '1',
  DateTime? scheduleTime,
  int? currentSetIndex,
  MatchLiveScore? liveScore,
}) {
  return TournamentMatch(
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat-a',
    round: 1,
    matchType: matchType,
    poolId: poolId,
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: poolId.isNotEmpty,
    matchNumber: matchNumber,
    sets: sets,
    winnerId: winnerId,
    courtName: courtName,
    scheduleTime: scheduleTime,
    currentSetIndex: currentSetIndex,
    liveScore: liveScore,
  );
}

TournamentMatchCardViewModel _viewModel(
  TournamentMatch match, {
  String teamAName = 'Ana / Bruno',
  String teamBName = 'Carla / Diego',
}) {
  const player = TournamentMatchCardPlayerViewModel(
    initials: 'AB',
    avatarColor: Color(0xFF5B8DEF),
  );
  return TournamentMatchCardViewModel(
    match: match,
    teamA: TournamentMatchCardTeamViewModel(
      displayName: teamAName,
      players: const [player, player],
    ),
    teamB: TournamentMatchCardTeamViewModel(
      displayName: teamBName,
      players: const [player, player],
    ),
  );
}

/// Data fixa para o rótulo de horário não depender do dia em que roda.
final _today = DateTime(2026, 8, 7, 12);

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('estado e cabeçalho', () {
    test('agendada leva o horário para o selo e o tira do contexto', () {
      final row = buildTournamentMatchRow(
        viewModel: _viewModel(
          _match(scheduleTime: DateTime(2026, 8, 7, 17, 30)),
        ),
        reference: _today,
      );

      expect(row.state, TournamentMatchRowState.scheduled);
      expect(row.stateLabel, '17:30');
      expect(row.head, 'Quadra 1');
      expect(row.number, '#12');
    });

    test('sem horário marcado o estado é "a definir"', () {
      final row = buildTournamentMatchRow(
        viewModel: _viewModel(_match()),
        reference: _today,
      );

      expect(row.state, TournamentMatchRowState.tbd);
      expect(row.stateLabel, 'A definir');
    });

    test('encerrada mantém horário e quadra no contexto', () {
      final row = buildTournamentMatchRow(
        viewModel: _viewModel(
          _match(
            status: TournamentMatchStatus.completed,
            winnerId: 'team-a',
            scheduleTime: DateTime(2026, 8, 7, 17, 30),
            sets: const [
              TournamentMatchSet(a: 21, b: 15),
              TournamentMatchSet(a: 21, b: 18),
            ],
          ),
        ),
        reference: _today,
      );

      expect(row.stateLabel, 'Encerrada');
      expect(row.head, '17:30 · Quadra 1');
    });
  });

  group('placar por lado', () {
    test('encerrada mostra sets vencidos e marca vencedor e perdedor', () {
      final row = buildTournamentMatchRow(
        viewModel: _viewModel(
          _match(
            status: TournamentMatchStatus.completed,
            winnerId: 'team-a',
            sets: const [
              TournamentMatchSet(a: 21, b: 15),
              TournamentMatchSet(a: 18, b: 21),
              TournamentMatchSet(a: 15, b: 12),
            ],
          ),
        ),
        reference: _today,
      );

      expect(row.sideA.score, '2');
      expect(row.sideA.won, isTrue);
      expect(row.sideA.lost, isFalse);
      expect(row.sideB.score, '1');
      expect(row.sideB.won, isFalse);
      expect(row.sideB.lost, isTrue);
    });

    test('ao vivo mostra os pontos do set em andamento e quem lidera', () {
      final row = buildTournamentMatchRow(
        viewModel: _viewModel(
          _match(
            status: TournamentMatchStatus.inProgress,
            currentSetIndex: 1,
            sets: const [
              TournamentMatchSet(a: 21, b: 15),
              TournamentMatchSet(a: 11, b: 14),
            ],
          ),
        ),
        reference: _today,
      );

      expect(row.state, TournamentMatchRowState.live);
      expect(row.sideA.score, '11');
      expect(row.sideB.score, '14');
      expect(row.sideB.leading, isTrue);
      expect(row.sideA.leading, isFalse);
    });

    test('ao vivo sem mesa cai no placar agregado do lançamento rápido', () {
      final row = buildTournamentMatchRow(
        viewModel: _viewModel(
          _match(
            status: TournamentMatchStatus.inProgress,
            liveScore: const MatchLiveScore(
              setsA: 1,
              setsB: 0,
              currentGamesA: 9,
              currentGamesB: 7,
            ),
          ),
        ),
        reference: _today,
      );

      expect(row.sideA.score, '9');
      expect(row.sideB.score, '7');
      expect(row.sideA.leading, isTrue);
    });

    test('sem placar os dois lados mostram traço', () {
      final row = buildTournamentMatchRow(
        viewModel: _viewModel(
          _match(scheduleTime: DateTime(2026, 8, 7, 17, 30)),
        ),
        reference: _today,
      );

      expect(row.sideA.score, '—');
      expect(row.sideB.score, '—');
      expect(row.pills, isEmpty);
    });
  });

  group('pílulas de parcial', () {
    test('encerrada não cria pílula para set não jogado', () {
      final row = buildTournamentMatchRow(
        viewModel: _viewModel(
          _match(
            status: TournamentMatchStatus.completed,
            winnerId: 'team-a',
            sets: const [
              TournamentMatchSet(a: 21, b: 15),
              TournamentMatchSet(a: 21, b: 18),
              TournamentMatchSet(a: 0, b: 0),
            ],
          ),
        ),
        reference: _today,
      );

      expect(row.pills.map((p) => p.label), ['21·15', '21·18']);
      expect(row.pills.every((p) => !p.current), isTrue);
    });

    test('ao vivo marca o set em andamento como corrente', () {
      final row = buildTournamentMatchRow(
        viewModel: _viewModel(
          _match(
            status: TournamentMatchStatus.inProgress,
            currentSetIndex: 1,
            sets: const [
              TournamentMatchSet(a: 21, b: 15),
              TournamentMatchSet(a: 11, b: 14),
            ],
          ),
        ),
        reference: _today,
      );

      expect(row.pills.map((p) => p.label), ['21·15', '11·14']);
      expect(row.pills.last.current, isTrue);
      expect(row.pills.first.current, isFalse);
    });
  });

  group('dupla do atleta e slot indefinido', () {
    test('marca o lado do atleta e o card', () {
      final row = buildTournamentMatchRow(
        viewModel: _viewModel(_match()),
        athleteTeamIds: const {'team-b'},
        reference: _today,
      );

      expect(row.sideA.mine, isFalse);
      expect(row.sideB.mine, isTrue);
      expect(row.isMine, isTrue);
    });

    test('slot sem dupla definida é tbd e nunca é do atleta', () {
      final row = buildTournamentMatchRow(
        viewModel: _viewModel(
          _match(teamBId: ''),
          teamBName: 'Vencedor do jogo 3',
        ),
        athleteTeamIds: const {''},
        reference: _today,
      );

      expect(row.sideB.tbd, isTrue);
      expect(row.sideB.mine, isFalse);
      expect(row.sideB.name, 'Vencedor do jogo 3');
    });
  });

  group('final e 3º lugar', () {
    test('final do mata-mata ganha o tratamento premium', () {
      final row = buildTournamentMatchRow(
        viewModel: _viewModel(
          _match(matchType: 'Final', poolId: ''),
        ),
        reference: _today,
      );

      expect(row.stage, TournamentMatchRowStage.grandFinal);
    });

    test('disputa de 3º lugar ganha o bronze', () {
      final row = buildTournamentMatchRow(
        viewModel: _viewModel(
          _match(matchType: 'Third Place', poolId: ''),
        ),
        reference: _today,
      );

      expect(row.stage, TournamentMatchRowStage.thirdPlace);
    });

    test('partida de grupo nunca é premium', () {
      final row = buildTournamentMatchRow(
        viewModel: _viewModel(_match(matchType: 'Final')),
        reference: _today,
      );

      expect(row.stage, isNull);
    });
  });
}
