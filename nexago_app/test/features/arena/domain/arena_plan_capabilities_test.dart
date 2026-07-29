import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_plan.dart';

void main() {
  group('capabilitiesFor — Clubinho', () {
    test('Essencial NÃO tem clubinho (nem nenhuma capability Pro)', () {
      final caps = capabilitiesFor(ArenaPlanTier.essencial, entitled: true);
      expect(caps, isNot(contains(ArenaCapability.clubinho)));
      expect(caps, isEmpty);
    });

    test('Pro e Parceiro têm clubinho', () {
      expect(
        capabilitiesFor(ArenaPlanTier.pro, entitled: true),
        contains(ArenaCapability.clubinho),
      );
      expect(
        capabilitiesFor(ArenaPlanTier.parceiro, entitled: true),
        contains(ArenaCapability.clubinho),
      );
    });

    test('sem titularidade cai no Essencial: Pro/Parceiro perdem clubinho',
        () {
      expect(capabilitiesFor(ArenaPlanTier.pro, entitled: false), isEmpty);
      expect(
        capabilitiesFor(ArenaPlanTier.parceiro, entitled: false),
        isEmpty,
      );
    });

    test('tier null (arena sem plano) não tem capability nenhuma', () {
      expect(capabilitiesFor(null, entitled: true), isEmpty);
      expect(capabilitiesFor(null, entitled: false), isEmpty);
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

    test('Parceiro: tudo do Pro + multiUnidade (todas as capabilities)', () {
      final pro = capabilitiesFor(ArenaPlanTier.pro, entitled: true);
      final parceiro = capabilitiesFor(ArenaPlanTier.parceiro, entitled: true);
      expect(parceiro.containsAll(pro), isTrue);
      expect(parceiro, contains(ArenaCapability.multiUnidade));
      // Se nascer uma capability nova, este teste obriga a decidir o tier dela.
      expect(parceiro, ArenaCapability.values.toSet());
    });
  });
}
