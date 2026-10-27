import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/rating_ladder.dart';

void main() {
  test('régua do app é a mesma de VOLLEYBALL_LEVELS (rating-config.ts)', () {
    final source = File(
      '../functions/src/rating-config.ts',
    ).readAsStringSync();
    final row = RegExp(
      r'\{code: "(\w+)", rank: (\d+), label: "([^"]+)", '
      r'initialRating: (\d+), promoteAt: (\d+|null), demoteAt: (\d+|null)\}',
    );
    final backend = [
      for (final m in row.allMatches(source))
        [m[1], m[2], m[3], m[4], m[5], m[6]].join('|'),
    ];
    String n(int? v) => v == null ? 'null' : '$v';
    final app = [
      for (final l in kDefaultRatingLadderLevels)
        [
          l.code,
          l.rank,
          l.label,
          l.initialRating,
          n(l.promoteAt),
          n(l.demoteAt),
        ].join('|'),
    ];
    expect(backend, hasLength(7));
    expect(app, backend);
  });

  group('parseRatingLadder', () {
    test('doc ausente: régua padrão, sem subida automática', () {
      final ladder = parseRatingLadder(null);
      expect(ladder.levels, same(kDefaultRatingLadderLevels));
      expect(ladder.autoPromotes, isFalse);
      expect(ladder.minRatedMatches, 10);
    });

    test('subida automática exige sair do modo sombra e ligar a flag', () {
      expect(
        parseRatingLadder({
          'flags': {'autoPromotionEnabled': true},
        }).autoPromotes,
        isFalse,
      );
      expect(
        parseRatingLadder({
          'flags': {'shadowMode': false, 'autoPromotionEnabled': true},
          'ladder': {'minRatedMatches': 12},
        }),
        isA<RatingLadder>()
            .having((l) => l.autoPromotes, 'autoPromotes', isTrue)
            .having((l) => l.minRatedMatches, 'minRatedMatches', 12),
      );
    });

    test('levels do doc sobrescrevem; linha inválida descarta a lista', () {
      final custom = parseRatingLadder({
        'levels': [
          {'code': 'b', 'rank': 1, 'initialRating': 1500, 'promoteAt': 1600},
          {'code': 'a', 'rank': 0, 'initialRating': 1300.4, 'promoteAt': null},
        ],
      });
      expect(custom.levels.map((l) => l.code), ['a', 'b']);
      expect(custom.levels.first.initialRating, 1300);
      expect(custom.levels.first.label, 'a');

      final broken = parseRatingLadder({
        'levels': [
          {'code': 'a', 'rank': 0, 'initialRating': 1300},
          {'code': '', 'rank': 1, 'initialRating': 1500},
        ],
      });
      expect(broken.levels, same(kDefaultRatingLadderLevels));
    });
  });

  test('resolve por código, por label/legado e cai no piso', () {
    const levels = kDefaultRatingLadderLevels;
    expect(resolveRatingLadderLevel(levels, 'avancado_1').label, 'Avançado 1');
    expect(resolveRatingLadderLevel(levels, 'Intermediário 2').rank, 3);
    expect(resolveRatingLadderLevel(levels, 'livre').code, 'open');
    expect(resolveRatingLadderLevel(levels, null).code, 'iniciante_1');
  });

  group('levelPointsProgress', () {
    const levels = kDefaultRatingLadderLevels;

    test('falta da marca e progresso desde o "começa com"', () {
      final p = levelPointsProgress(levels, 'intermediario_1', 1640.4);
      expect(p.points, 1640);
      expect(p.pointsToPromote, 80);
      expect(p.next?.label, 'Intermediário 2');
      expect(p.progress, closeTo(40 / 120, 0.001));
      expect(p.reachedPromotion, isFalse);
    });

    test('abaixo do começo fica em 0; passou da marca fica em 100%', () {
      expect(levelPointsProgress(levels, 'intermediario_1', 1550).progress, 0);
      final above = levelPointsProgress(levels, 'iniciante_2', 1761);
      expect(above.reachedPromotion, isTrue);
      expect(above.pointsToPromote, 0);
      expect(above.progress, 1);
    });

    test('Open não tem marca de subida', () {
      final top = levelPointsProgress(levels, 'open', 2300);
      expect(top.next, isNull);
      expect(top.pointsToPromote, isNull);
      expect(top.progress, 1);
    });
  });
}
