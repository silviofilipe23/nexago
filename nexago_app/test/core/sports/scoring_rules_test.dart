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

  group('rótulos e lançamento rápido (vetores)', () {
    for (final raw in vectors['labelVectors'] as List<dynamic>) {
      final v = raw as Map<String, dynamic>;
      test('rótulos ${v['profile']}', () {
        final p = ScoringRules.profileFromRaw(profiles[v['profile']])!;
        expect(ScoringRules.rulesLabel(p), v['rulesLabel']);
        final labels = v['setLabels'] as List<dynamic>;
        expect([
          for (var i = 0; i < labels.length; i++)
            ScoringRules.setTargetLabel(p, i),
        ], labels);
      });
    }
    final texts = vectors['textVectors'] as List<dynamic>;
    for (var i = 0; i < texts.length; i++) {
      final v = texts[i] as Map<String, dynamic>;
      test('texto do set $i (${v['profile']})', () {
        final p = ScoringRules.profileFromRaw(profiles[v['profile']])!;
        expect(
          ScoringRules.setScoreText(
            p,
            v['index'] as int,
            _set(v['set'] as Map<String, dynamic>),
          ),
          v['text'],
        );
      });
    }
    final quick = vectors['quickVectors'] as List<dynamic>;
    for (var i = 0; i < quick.length; i++) {
      final v = quick[i] as Map<String, dynamic>;
      test('linha de set $i (${v['profile']})', () {
        final p = ScoringRules.profileFromRaw(profiles[v['profile']])!;
        final set = _set(v['set'] as Map<String, dynamic>);
        final index = v['index'] as int;
        expect(ScoringRules.quickSetKind(p, index, set).wire, v['kind']);
        final n = ScoringRules.normalizeQuickSet(p, index, set);
        final want = v['normalized'] as Map<String, dynamic>;
        final wantTb = want['tb'] as Map<String, dynamic>?;
        expect([n.a, n.b], [want['a'], want['b']]);
        expect(
          n.tb == null ? null : [n.tb!.a, n.tb!.b],
          wantTb == null ? null : [wantTb['a'], wantTb['b']],
        );
      });
    }
    test(
      'perfil efetivo: carimbo com o bestOf da tela; sem carimbo, histórico',
      () {
        final p = ScoringRules.effectiveProfile(profiles['bt3'], 1);
        expect(p, isA<SetsGamesProfile>());
        expect(p.bestOf, 1);
        final legacy =
            ScoringRules.effectiveProfile(null, 1) as SetsPointsProfile;
        expect(
          [legacy.bestOf, legacy.setTarget, legacy.decidingSetTarget],
          [1, 21, 21],
        );
        final fallback = ScoringRules.effectiveProfile({'kind': 'x'}, 'abc');
        expect(fallback.bestOf, 3);
      },
    );
  });

  group('tempo técnico automático no 21º ponto (espelho do web)', () {
    final beach3 = ScoringRules.legacyProfile(3);
    bool due(int idx, int a, int b) =>
        ScoringRules.isAutoTechnicalTimeoutDue(beach3, idx, ScoreSetValue(a, b));

    test('dispara com a soma do set em 21 nos sets de 21', () {
      expect(due(0, 11, 10), isTrue);
      expect(due(1, 4, 17), isTrue);
      expect(
        ScoringRules.isAutoTechnicalTimeoutDue(
          ScoringRules.legacyProfile(1),
          0,
          const ScoreSetValue(10, 11),
        ),
        isTrue,
      );
    });

    test('não dispara fora de 21 nem no decisivo de 15', () {
      expect(due(0, 10, 10), isFalse);
      expect(due(0, 12, 10), isFalse);
      expect(due(2, 11, 10), isFalse);
    });

    test('não dispara em vôlei de quadra (25)', () {
      final indoor = ScoringRules.profileFromRaw({
        'kind': 'sets_points',
        'bestOf': 3,
        'setTarget': 25,
        'decidingSetTarget': 15,
        'winBy': 2,
        'pointCap': null,
      })!;
      expect(
        ScoringRules.isAutoTechnicalTimeoutDue(
          indoor,
          0,
          const ScoreSetValue(11, 10),
        ),
        isFalse,
      );
    });
  });
}
