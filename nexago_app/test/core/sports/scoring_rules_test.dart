import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/sports/sport_catalog.dart';

import 'sport_vectors_data.dart';

ScoreSetValue _set(Map<String, dynamic> m) {
  final tb = m['tb'] as Map<String, dynamic>?;
  return ScoreSetValue(
    m['a'] as int,
    m['b'] as int,
    tb: tb == null ? null : ScoreSetValue(tb['a'] as int, tb['b'] as int),
  );
}

void main() {
  final vectors = jsonDecode(kScoringVectorsJson) as Map<String, dynamic>;
  final profiles = vectors['profiles'] as Map<String, dynamic>;
  final cases = vectors['cases'] as List<dynamic>;

  group('vetores de placar compartilhados com functions e portais', () {
    for (var i = 0; i < cases.length; i++) {
      final c = cases[i] as Map<String, dynamic>;
      test('caso $i (${c['profile']})', () {
        final profile = ScoringRules.profileFromRaw(profiles[c['profile']]);
        expect(profile, isNotNull);
        final sets = [
          for (final s in c['sets'] as List<dynamic>)
            _set(s as Map<String, dynamic>),
        ];
        expect([
          for (var idx = 0; idx < sets.length; idx++)
            ScoringRules.setWinnerSide(sets, idx, profile!),
        ], c['setWinners']);
        expect(ScoringRules.matchWinnerSide(sets, profile!), c['matchWinner']);
        expect(
          ScoringRules.validate(sets, profile).map((x) => x.message).toList(),
          c['issues'],
        );
      });
    }
  });

  test('carimbo malformado cai no histórico', () {
    final legacy = ScoringRules.legacyProfile(3);
    final p = ScoringRules.profileOfMatch(
      raw: {'kind': 'sets_points', 'bestOf': 2},
      bestOf: 3,
    );
    expect(p, isA<SetsPointsProfile>());
    expect(
      (p as SetsPointsProfile).decidingSetTarget,
      legacy.decidingSetTarget,
    );
    expect(p.bestOf, 3);
  });
}
