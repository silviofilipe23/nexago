// nexago_app/test/features/tournaments/bracket_plants_fixture.dart
import 'dart:convert';
import 'dart:io';

import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';

/// As 25 plantas materializadas, geradas por
/// `functions/scripts/export-bracket-fixtures.js`. Regerar depois de mexer em
/// qualquer `bracket-N-teams.ts`.
Map<int, List<TournamentMatch>> loadBracketPlants() {
  final raw = File('test/fixtures/bracket_plants.json').readAsStringSync();
  final decoded = jsonDecode(raw) as Map<String, dynamic>;
  return {
    for (final entry in decoded.entries)
      int.parse(entry.key): [
        for (final m in entry.value as List<dynamic>)
          TournamentMatch(
            id: 'm${(m as Map<String, dynamic>)['matchNumber']}',
            tournamentId: 't1',
            categoryId: 'cat-a',
            round: m['round'] as int,
            matchType: m['matchType'] as String,
            poolId: '',
            teamAId: '',
            teamBId: '',
            status: 'Scheduled',
            resultA: '',
            resultB: '',
            isGroupMatch: false,
            matchNumber: m['matchNumber'] as int,
            winnerAdvanceMatchNumber: m['winnerAdvanceMatchNumber'] as int?,
            winnerAdvanceSlot: m['winnerAdvanceSlot'] as String?,
            loserAdvanceMatchNumber: m['loserAdvanceMatchNumber'] as int?,
            loserAdvanceSlot: m['loserAdvanceSlot'] as String?,
          ),
      ],
  };
}
