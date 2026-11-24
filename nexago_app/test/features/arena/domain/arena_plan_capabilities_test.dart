import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_plan.dart';

void main() {
  group('ArenaPlanTierX.fromId', () {
    test('fromId normaliza legados', () {
      expect(ArenaPlanTierX.fromId('starter'), ArenaPlanTier.starter);
      expect(ArenaPlanTierX.fromId('pro'), ArenaPlanTier.pro);
      expect(ArenaPlanTierX.fromId('elite'), ArenaPlanTier.elite);
      expect(ArenaPlanTierX.fromId('parceiro'), ArenaPlanTier.elite);
      expect(ArenaPlanTierX.fromId('essencial'), isNull);
    });
  });

  group('Funções liberadas (fase sem cobrança por plano)', () {
    test('a chave está ligada', () {
      expect(kArenaFeaturesUnlocked, isTrue);
    });

    test('toda arena tem todas as funções, com ou sem plano', () {
      expect(
        capabilitiesFor(null, entitled: false),
        ArenaCapability.values.toSet(),
      );
      expect(
        capabilitiesFor(ArenaPlanTier.starter, entitled: true),
        ArenaCapability.values.toSet(),
      );
    });

    test('sem limite de quadras nem de horários fixos', () {
      expect(maxCourtsFor(null, entitled: false), isNull);
      expect(maxRecurringBookingsFor(null, entitled: false), isNull);
      expect(nextCourtsTierFor(null, entitled: false), isNull);
    });
  });

  group('capabilitiesFor — Clubinho', () {
    test('Sem plano NÃO tem clubinho (nem nenhuma capability Pro)', () {
      final caps = capabilitiesFor(null, entitled: true, unlocked: false);
      expect(caps, isNot(contains(ArenaCapability.clubinho)));
      expect(caps, isEmpty);
    });

    test('Pro e Elite têm clubinho', () {
      expect(
        capabilitiesFor(ArenaPlanTier.pro, entitled: true, unlocked: false),
        contains(ArenaCapability.clubinho),
      );
      expect(
        capabilitiesFor(ArenaPlanTier.elite, entitled: true, unlocked: false),
        contains(ArenaCapability.clubinho),
      );
    });

    test('sem titularidade cai para sem plano: Pro/Elite perdem clubinho', () {
      expect(
          capabilitiesFor(ArenaPlanTier.pro, entitled: false, unlocked: false),
          isEmpty);
      expect(
        capabilitiesFor(ArenaPlanTier.elite, entitled: false, unlocked: false),
        isEmpty,
      );
    });

    test('tier null (arena sem plano) não tem capability nenhuma', () {
      expect(capabilitiesFor(null, entitled: true, unlocked: false), isEmpty);
      expect(capabilitiesFor(null, entitled: false, unlocked: false), isEmpty);
    });
  });

  group('capabilitiesFor — Aulas', () {
    test('Pro e Elite têm aulas; sem plano, Starter e sem titularidade não',
        () {
      expect(
        capabilitiesFor(ArenaPlanTier.pro, entitled: true, unlocked: false),
        contains(ArenaCapability.aulas),
      );
      expect(
        capabilitiesFor(ArenaPlanTier.elite, entitled: true, unlocked: false),
        contains(ArenaCapability.aulas),
      );
      expect(
        capabilitiesFor(ArenaPlanTier.starter, entitled: true, unlocked: false),
        isNot(contains(ArenaCapability.aulas)),
      );
      expect(
        capabilitiesFor(null, entitled: true, unlocked: false),
        isNot(contains(ArenaCapability.aulas)),
      );
      expect(
        capabilitiesFor(ArenaPlanTier.pro, entitled: false, unlocked: false),
        isNot(contains(ArenaCapability.aulas)),
      );
    });
  });

  group('capabilitiesFor — titularidade por tier', () {
    test('elite titular tem todas as capabilities', () {
      expect(
        capabilitiesFor(ArenaPlanTier.elite, entitled: true, unlocked: false),
        containsAll(ArenaCapability.values),
      );
    });

    test('starter titular não tem capabilities Pro', () {
      expect(
        capabilitiesFor(ArenaPlanTier.starter, entitled: true, unlocked: false),
        isEmpty,
      );
    });
  });

  group('capabilitiesFor — pacote por tier', () {
    test('Pro: operação completa, sem multiUnidade', () {
      final caps =
          capabilitiesFor(ArenaPlanTier.pro, entitled: true, unlocked: false);
      expect(caps, {
        ArenaCapability.pdvComandas,
        ArenaCapability.estoque,
        ArenaCapability.promocoes,
        ArenaCapability.clubinho,
        ArenaCapability.aulas,
        ArenaCapability.metricasCompletas,
        ArenaCapability.receberTorneios,
      });
      expect(caps, isNot(contains(ArenaCapability.multiUnidade)));
    });

    test('Elite: tudo do Pro + multiUnidade (todas as capabilities)', () {
      final pro =
          capabilitiesFor(ArenaPlanTier.pro, entitled: true, unlocked: false);
      final elite =
          capabilitiesFor(ArenaPlanTier.elite, entitled: true, unlocked: false);
      expect(elite.containsAll(pro), isTrue);
      expect(elite, contains(ArenaCapability.multiUnidade));
      // Se nascer uma capability nova, este teste obriga a decidir o tier dela.
      expect(elite, ArenaCapability.values.toSet());
    });
  });

  group('maxCourtsFor', () {
    test('limite de quadras 2/5/ilimitado', () {
      expect(
          maxCourtsFor(ArenaPlanTier.starter, entitled: true, unlocked: false),
          2);
      expect(
          maxCourtsFor(ArenaPlanTier.pro, entitled: true, unlocked: false), 5);
      expect(maxCourtsFor(ArenaPlanTier.elite, entitled: true, unlocked: false),
          isNull);
      expect(
          maxCourtsFor(ArenaPlanTier.pro, entitled: false, unlocked: false), 2);
      expect(maxCourtsFor(null, entitled: false, unlocked: false), 2);
    });
  });

  group('nextCourtsTierFor', () {
    test('sem plano e Starter (teto 2) sobem para o Pro', () {
      expect(nextCourtsTierFor(null, entitled: false, unlocked: false),
          ArenaPlanTier.pro);
      expect(
        nextCourtsTierFor(ArenaPlanTier.starter,
            entitled: true, unlocked: false),
        ArenaPlanTier.pro,
      );
    });

    test('Pro no teto de 5 sobe para o Elite, nunca para o próprio Pro', () {
      expect(
        nextCourtsTierFor(ArenaPlanTier.pro, entitled: true, unlocked: false),
        ArenaPlanTier.elite,
      );
    });

    test('Elite não tem teto, então não há próximo degrau', () {
      expect(
          nextCourtsTierFor(ArenaPlanTier.elite,
              entitled: true, unlocked: false),
          isNull);
    });

    test('sem titularidade cai para o degrau de "sem plano" (Pro)', () {
      expect(
        nextCourtsTierFor(ArenaPlanTier.elite,
            entitled: false, unlocked: false),
        ArenaPlanTier.pro,
      );
    });

    test('o degrau sugerido sempre cabe mais quadras que o atual', () {
      for (final tier in [null, ...ArenaPlanTier.values]) {
        final current = maxCourtsFor(tier, entitled: true, unlocked: false);
        final next = nextCourtsTierFor(tier, entitled: true, unlocked: false);
        if (current == null) {
          expect(next, isNull, reason: 'sem teto não precisa de upsell');
          continue;
        }
        final nextMax = maxCourtsFor(next, entitled: true, unlocked: false);
        expect(
          nextMax == null || nextMax > current,
          isTrue,
          reason: 'upsell de $tier não aumenta o teto de quadras',
        );
      }
    });
  });
}
