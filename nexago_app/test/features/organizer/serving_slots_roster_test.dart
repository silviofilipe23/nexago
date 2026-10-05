import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/data/match_point_write.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_medical_timeout_logic.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_serving_player_logic.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_medical_timeout.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_serving_players.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

/// Saque e tempo médico por tamanho do elenco (multiesporte fase 4d2): individual (1), dupla
/// (2), equipe (3–5). Espelha `serving-slots-roster.spec.ts` das mesas web (4b2).
void main() {
  const ids = (teamAId: 'tA', teamBId: 'tB');

  TournamentMatch match({
    String servingTeamId = '',
    MatchServingPlayers servingPlayers = MatchServingPlayers.none,
  }) {
    return TournamentMatch(
      id: 'm1',
      tournamentId: 'T',
      categoryId: 'c1',
      round: 1,
      matchType: 'group',
      poolId: '',
      teamAId: ids.teamAId,
      teamBId: ids.teamBId,
      status: TournamentMatchStatus.inProgress,
      resultA: '0',
      resultB: '0',
      isGroupMatch: true,
      matchNumber: 1,
      sets: const [TournamentMatchSet(a: 3, b: 3)],
      currentSetIndex: 0,
      bestOf: 3,
      servingTeamId: servingTeamId,
      servingPlayers: servingPlayers,
      matchStartedAt: DateTime.utc(2026, 10, 5, 13),
    );
  }

  MatchServingPlayers after(
    MatchServingPlayers slots, {
    MatchRosterSizes rosterSizes = MatchRosterSizes.dupla,
  }) {
    return MatchServingPlayerLogic.slotsAfterScore(
      slots: slots,
      previousServingTeamId: 'tB',
      nextServingTeamId: 'tA',
      teamAId: ids.teamAId,
      teamBId: ids.teamBId,
      rosterSizes: rosterSizes,
    );
  }

  test(
    'saque volta para o lado: individual mantém o 1; dupla alterna; trio roda',
    () {
      expect(
        after(
          const MatchServingPlayers(a: 1, b: 1),
          rosterSizes: const MatchRosterSizes(a: 1, b: 1),
        ),
        const MatchServingPlayers(a: 1, b: 1),
      );
      expect(
        after(const MatchServingPlayers(a: 1, b: 1)),
        const MatchServingPlayers(a: 2, b: 1),
      );
      expect(
        after(
          const MatchServingPlayers(a: 2, b: 1),
          rosterSizes: const MatchRosterSizes(a: 3, b: 2),
        ),
        const MatchServingPlayers(a: 3, b: 1),
      );
      expect(
        after(
          const MatchServingPlayers(a: 3, b: 1),
          rosterSizes: const MatchRosterSizes(a: 3, b: 2),
        ),
        const MatchServingPlayers(a: 1, b: 1),
      );
    },
  );

  test(
    'individual: o atleta no saque é sempre o 1, e a mesa não pergunta quem saca',
    () {
      expect(
        MatchServingPlayerLogic.servingPlayerSlot(
          slots: MatchServingPlayers.none,
          servingTeamId: 'tA',
          teamAId: ids.teamAId,
          teamBId: ids.teamBId,
          rosterSizes: const MatchRosterSizes(a: 1, b: 2),
        ),
        1,
      );
      bool needs({int? roster}) => MatchServingPlayerLogic.needsServingPlayer(
        servingTeamId: 'tA',
        servingPlayerSlot: 0,
        status: TournamentMatchStatus.inProgress,
        teamAId: ids.teamAId,
        teamBId: ids.teamBId,
        servingRosterSize: roster ?? 2,
      );
      expect(needs(roster: 1), isFalse);
      expect(needs(), isTrue);
      expect(
        MatchServingPlayerLogic.swappedSlots(
          slots: const MatchServingPlayers(a: 1, b: 1),
          servingTeamId: 'tA',
          teamAId: ids.teamAId,
          teamBId: ids.teamBId,
          rosterSizes: const MatchRosterSizes(a: 1, b: 1),
        ),
        const MatchServingPlayers(a: 1, b: 1),
      );
    },
  );

  test('equipe: posição 3–5 declarada não volta a "não declarada"', () {
    expect(
      MatchServingPlayerLogic.needsServingPlayer(
        servingTeamId: 'tA',
        servingPlayerSlot: 4,
        status: TournamentMatchStatus.inProgress,
        teamAId: ids.teamAId,
        teamBId: ids.teamBId,
        servingRosterSize: 4,
      ),
      isFalse,
    );
    expect(
      MatchServingPlayers.fromMap(const {'A': 5, 'B': 3}),
      const MatchServingPlayers(a: 5, b: 3),
    );
    expect(
      MatchServingPlayers.fromMap(const {'A': 6, 'B': 0}),
      MatchServingPlayers.none,
    );
    final parsed = TournamentMatchMapper.fromMap('m1', const {
      'teamAId': 'tA',
      'teamBId': 'tB',
      'servingTeamId': 'tA',
      'servingPlayerSlot': 3,
      'servingPlayerSlots': {'A': 3, 'B': 0},
    });
    expect(parsed.servingPlayerSlot, 3);
    expect(parsed.servingPlayers, const MatchServingPlayers(a: 3, b: 0));
  });

  test('trocar sacador de um trio roda pelo elenco', () {
    expect(
      MatchServingPlayerLogic.swappedSlots(
        slots: const MatchServingPlayers(a: 3, b: 1),
        servingTeamId: 'tA',
        teamAId: ids.teamAId,
        teamBId: ids.teamBId,
        rosterSizes: const MatchRosterSizes(a: 3, b: 2),
      ),
      const MatchServingPlayers(a: 1, b: 1),
    );
  });

  test(
    'ponto gravado numa individual não aponta para o "atleta 2" inexistente',
    () {
      final write = buildPointWrite(
        match(
          servingTeamId: 'tB',
          servingPlayers: const MatchServingPlayers(a: 1, b: 1),
        ),
        'A',
        rosterSizes: const MatchRosterSizes(a: 1, b: 1),
      )!;
      expect(write.matchUpdate['servingPlayerSlots'], {'A': 1, 'B': 1});
      expect(write.matchUpdate['servingPlayerSlot'], 1);
    },
  );

  test(
    'individual: a escrita grava o titular na ordem do lado (doc coerente para as outras mesas)',
    () {
      final fields = servingTeamFields(
        match(),
        'tA',
        rosterSizes: const MatchRosterSizes(a: 1, b: 1),
      );
      expect(fields['servingPlayerSlots'], {'A': 1, 'B': 1});
      expect(fields['servingPlayerSlot'], 1);
      // Dupla não ganha `servingPlayerSlots` na troca de time: a ordem declarada não muda.
      expect(
        servingTeamFields(match(), 'tA').containsKey('servingPlayerSlots'),
        isFalse,
      );
    },
  );

  test('servingPlayerFields aceita a posição 3 de uma equipe', () {
    final fields = servingPlayerFields(
      match(servingTeamId: 'tA'),
      'A',
      3,
      rosterSizes: const MatchRosterSizes(a: 3, b: 3),
    );
    expect(fields['servingPlayerSlots'], {'A': 3, 'B': 0});
    expect(fields['servingPlayerSlot'], 3);
  });

  test('tempo médico aceita posições 1–5 (equipe) e recusa fora disso', () {
    expect(medicalTimeoutPlayerKeysFromRaw(['A1', 'B3', 'A5', 'B6', 'C1']), [
      'A1',
      'B3',
      'A5',
    ]);
    expect(
      MatchMedicalTimeout.fromMap(const {
        'side': 'B',
        'playerSlot': 4,
        'teamId': 'tB',
      })?.playerSlot,
      4,
    );
    expect(
      MatchMedicalTimeout.fromMap(const {
        'side': 'B',
        'playerSlot': 6,
        'teamId': 'tB',
      }),
      isNull,
    );
    expect(
      MatchMedicalTimeoutLogic.canRequest(
        usedKeys: const [],
        active: null,
        side: 'A',
        slot: 3,
      ),
      isTrue,
    );
    expect(
      MatchMedicalTimeoutLogic.canRequest(
        usedKeys: const [],
        active: null,
        side: 'A',
        slot: 6,
      ),
      isFalse,
    );
  });

  test('tempo médico do 3º atleta de uma equipe grava (não só 1 e 2)', () {
    final write = buildMedicalTimeoutStartWrite(
      match(),
      side: 'A',
      playerSlot: 3,
      playerName: 'Ana',
    );
    expect(write, isNotNull);
    expect(write!.matchUpdate['medicalTimeoutPlayers'], ['A3']);
  });

  test(
    'elenco pelo memberUids gravado: 1 só na individual; dupla legada/incompleta segue 2',
    () {
      expect(rosterSizeFromMemberUids(['a']), 1);
      expect(rosterSizeFromMemberUids(['a', 'b', 'c']), 3);
      expect(rosterSizeFromMemberUids(const []), 2);
      expect(rosterSizeFromMemberUids(null), 2);
      expect(rosterSizeFromMemberUids(['a', 'a']), 2);
      expect(rosterSizeFromMemberUids(['a', 'b', 'c', 'd', 'e', 'f']), 2);
    },
  );
}
