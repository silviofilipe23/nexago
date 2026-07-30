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

  group('capabilitiesFor — Clubinho', () {
    test('Sem plano NÃO tem clubinho (nem nenhuma capability Pro)', () {
      final caps = capabilitiesFor(null, entitled: true);
      expect(caps, isNot(contains(ArenaCapability.clubinho)));
      expect(caps, isEmpty);
    });

    test('Pro e Elite têm clubinho', () {
      expect(
        capabilitiesFor(ArenaPlanTier.pro, entitled: true),
        contains(ArenaCapability.clubinho),
      );
      expect(
        capabilitiesFor(ArenaPlanTier.elite, entitled: true),
        contains(ArenaCapability.clubinho),
      );
    });

    test('sem titularidade cai para sem plano: Pro/Elite perdem clubinho',
        () {
      expect(capabilitiesFor(ArenaPlanTier.pro, entitled: false), isEmpty);
      expect(
        capabilitiesFor(ArenaPlanTier.elite, entitled: false),
        isEmpty,
      );
    });

    test('tier null (arena sem plano) não tem capability nenhuma', () {
      expect(capabilitiesFor(null, entitled: true), isEmpty);
      expect(capabilitiesFor(null, entitled: false), isEmpty);
    });
  });

  group('capabilitiesFor — titularidade por tier', () {
    test('elite titular tem todas as capabilities', () {
      expect(
        capabilitiesFor(ArenaPlanTier.elite, entitled: true),
        containsAll(ArenaCapability.values),
      );
    });

    test('starter titular não tem capabilities Pro', () {
      expect(
        capabilitiesFor(ArenaPlanTier.starter, entitled: true),
        isEmpty,
      );
    });
  });

  group('capabilitiesFor — pacote por tier', () {
    test('Pro: operação completa, sem multiUnidade', () {
      final caps = capabilitiesFor(ArenaPlanTier.pro, entitled: true);
      expect(caps, {
        ArenaCapability.pdvComandas,
        ArenaCapability.estoque,
        ArenaCapability.promocoes,
        ArenaCapability.clubinho,
        ArenaCapability.metricasCompletas,
        ArenaCapability.receberTorneios,
      });
      expect(caps, isNot(contains(ArenaCapability.multiUnidade)));
    });

    test('Elite: tudo do Pro + multiUnidade (todas as capabilities)', () {
      final pro = capabilitiesFor(ArenaPlanTier.pro, entitled: true);
      final elite = capabilitiesFor(ArenaPlanTier.elite, entitled: true);
      expect(elite.containsAll(pro), isTrue);
      expect(elite, contains(ArenaCapability.multiUnidade));
      // Se nascer uma capability nova, este teste obriga a decidir o tier dela.
      expect(elite, ArenaCapability.values.toSet());
    });
  });

  group('maxCourtsFor', () {
    test('limite de quadras 2/5/ilimitado', () {
      expect(maxCourtsFor(ArenaPlanTier.starter, entitled: true), 2);
      expect(maxCourtsFor(ArenaPlanTier.pro, entitled: true), 5);
      expect(maxCourtsFor(ArenaPlanTier.elite, entitled: true), isNull);
      expect(maxCourtsFor(ArenaPlanTier.pro, entitled: false), 2);
      expect(maxCourtsFor(null, entitled: false), 2);
    });
  });
}
