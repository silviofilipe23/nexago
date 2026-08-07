import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/features/athlete/domain/match_history/match_share_poster_builder.dart';
import 'package:nexago_app/features/athlete/domain/match_history/match_share_poster_data.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_live_score.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';

/// O pôster do app tem de sair igual ao do portal do atleta — estes casos
/// cobrem os campos que o `cardData()` de lá calcula.
void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  TournamentMatch match({
    String matchType = 'Group',
    String poolId = 'A',
    int round = 1,
    String status = TournamentMatchStatus.completed,
    List<TournamentMatchSet> sets = const [],
    String? winnerId,
    int bestOf = 3,
    DateTime? scheduleTime,
    String? courtName,
    int? currentSetIndex,
    MatchLiveScore? liveScore,
  }) {
    return TournamentMatch(
      id: 'm1',
      tournamentId: 't1',
      categoryId: 'cat-a',
      round: round,
      matchType: matchType,
      poolId: poolId,
      teamAId: 'team-a',
      teamBId: 'team-b',
      status: status,
      resultA: '',
      resultB: '',
      isGroupMatch: poolId.isNotEmpty,
      matchNumber: 1,
      sets: sets,
      winnerId: winnerId,
      bestOf: bestOf,
      scheduleTime: scheduleTime,
      courtName: courtName,
      currentSetIndex: currentSetIndex,
      liveScore: liveScore,
    );
  }

  final teams = {
    'team-a': const TournamentTeam(
      id: 'team-a',
      player1Id: 'u1',
      player2Id: 'u2',
    ),
    'team-b': const TournamentTeam(
      id: 'team-b',
      player1Id: 'u3',
      player2Id: 'u4',
    ),
  };
  const profiles = {
    'u1': AppUserProfile(uid: 'u1', fullName: 'Ana Souza'),
    'u2': AppUserProfile(
      uid: 'u2',
      fullName: 'Bruno Lima',
      profilePhotoUrl: 'https://cdn/b.jpg',
    ),
    'u3': AppUserProfile(uid: 'u3', fullName: 'Carla Dias'),
    'u4': AppUserProfile(uid: 'u4', fullName: 'Davi Nunes'),
  };

  MatchSharePosterData build(
    TournamentMatch m, {
    List<TournamentMatch> tournamentMatches = const [],
  }) {
    return buildMatchSharePosterData(
      match: m,
      tournamentMatches: tournamentMatches,
      tournamentName: 'Torneio Seed',
      categoryName: 'Iniciante 1 Masculino',
      teams: teams,
      profiles: profiles,
    );
  }

  group('duplas', () {
    test('usa primeiro nome de cada atleta, como o portal', () {
      final poster = build(match());

      expect(poster.teamA.name, 'Ana / Bruno');
      expect(poster.teamB.name, 'Carla / Davi');
    });

    test('iniciais e foto vêm na ordem player1/player2', () {
      final poster = build(match());

      expect(poster.teamA.players.map((p) => p.initial), ['AS', 'BL']);
      expect(poster.teamA.players.first.photoUrl, isNull);
      expect(poster.teamA.players[1].photoUrl, 'https://cdn/b.jpg');
      expect(poster.photoUrls, ['https://cdn/b.jpg']);
    });

    test('dupla desconhecida cai na descrição da partida', () {
      final poster = buildMatchSharePosterData(
        match: match(),
        tournamentMatches: const [],
      );

      expect(poster.teamA.name, 'Dupla');
      expect(poster.teamA.players.map((p) => p.initial), ['—', '—']);
    });
  });

  group('fase', () {
    test('grupo vira "Grupo A · rodada N" pela posição no torneio', () {
      final target = match(poolId: 'pool-2', round: 5);
      final poster = build(
        target,
        tournamentMatches: [
          match(poolId: 'pool-1', round: 3),
          match(poolId: 'pool-2', round: 3),
          target,
        ],
      );

      // pool-2 é o segundo grupo do torneio; a rodada 5 é a segunda do grupo.
      expect(poster.phaseLabel, 'Grupo B · rodada 2');
      expect(poster.stage, MatchSharePosterStage.game);
    });

    test('sem a lista de partidas ainda nomeia o grupo', () {
      final poster = build(match(poolId: 'A', round: 0));

      expect(poster.phaseLabel, 'Grupo · rodada 1');
    });

    test('final e 3º lugar ganham paleta própria', () {
      expect(
        build(match(matchType: 'Final', poolId: '')).stage,
        MatchSharePosterStage.finalMatch,
      );
      expect(
        build(match(matchType: 'Third Place', poolId: '')).stage,
        MatchSharePosterStage.thirdPlace,
      );
      expect(
        build(match(matchType: 'Semi-Final', poolId: '')).phaseLabel,
        'Semifinal',
      );
      expect(
        build(match(matchType: 'Semi-Final', poolId: '')).stage,
        MatchSharePosterStage.game,
      );
    });
  });

  group('placar', () {
    test('encerrada: conta todos os sets e aponta o vencedor', () {
      final poster = build(
        match(
          sets: const [
            TournamentMatchSet(a: 21, b: 18),
            TournamentMatchSet(a: 19, b: 21),
            TournamentMatchSet(a: 15, b: 11),
          ],
          winnerId: 'team-a',
        ),
      );

      expect(poster.finished, isTrue);
      expect(poster.winner, MatchSharePosterSide.teamA);
      expect(poster.setWinsA, 2);
      expect(poster.setWinsB, 1);
      expect(poster.sets.length, 3);
      expect(poster.formatLine, 'Melhor de 3');
    });

    test('set único descreve o formato', () {
      final poster = build(
        match(
          bestOf: 1,
          sets: const [TournamentMatchSet(a: 21, b: 4)],
          winnerId: 'team-a',
        ),
      );

      expect(poster.formatLine, 'Set único');
      expect(poster.sets.single.a, 21);
    });

    test('ao vivo: set em andamento fica fora dos fechados e vira a linha', () {
      final poster = build(
        match(
          status: TournamentMatchStatus.inProgress,
          sets: const [
            TournamentMatchSet(a: 21, b: 18),
            TournamentMatchSet(a: 14, b: 11),
          ],
          currentSetIndex: 1,
        ),
      );

      expect(poster.live, isTrue);
      expect(poster.finished, isFalse);
      expect(poster.winner, isNull);
      expect(poster.sets.length, 1, reason: 'o set aberto não é um set fechado');
      expect(poster.setWinsA, 1);
      expect(poster.liveLine, '1–0 · 2º set 14-11');
    });

    test('ao vivo pelo placar agregado usa liveScore', () {
      final poster = build(
        match(
          status: TournamentMatchStatus.inProgress,
          liveScore: const MatchLiveScore(
            setsA: 1,
            setsB: 0,
            currentGamesA: 7,
            currentGamesB: 9,
          ),
        ),
      );

      expect(poster.setWinsA, 1);
      expect(poster.liveLine, '1–0 · 2º set 7-9');
    });

    test('agendada não tem vencedor nem linha ao vivo', () {
      final poster = build(match(status: TournamentMatchStatus.scheduled));

      expect(poster.live, isFalse);
      expect(poster.finished, isFalse);
      expect(poster.winner, isNull);
      expect(poster.liveLine, isNull);
    });
  });

  group('rodapé', () {
    test('junta dia, hora e quadra', () {
      final poster = build(
        match(scheduleTime: DateTime(2026, 8, 2, 17, 30), courtName: '1'),
      );

      expect(poster.dateLine, 'Dom 02/08 · 17:30 · Quadra 1');
    });

    test('sem horário e sem quadra não inventa rodapé', () {
      expect(build(match()).dateLine, isNull);
    });

    test('sem horário, mostra só a quadra', () {
      expect(build(match(courtName: 'Quadra central')).dateLine, 'Quadra central');
    });
  });
}
