import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_plan.dart';

void main() {
  group('arenaPlanActivationContent', () {
    test('Pro tem título, subtítulo e 3 destaques com rotas', () {
      final content = arenaPlanActivationContent(ArenaPlanTier.pro);

      expect(content.tier, ArenaPlanTier.pro);
      expect(content.title, 'Plano Pro ativado!');
      expect(
        content.subtitle,
        'Sua arena está pronta para a operação completa.',
      );
      expect(content.highlights, hasLength(3));
      expect(content.highlights[0].title, 'PDV e comandas');
      expect(content.highlights[0].subtitle, 'Disponível agora');
      expect(content.highlights[0].routeName, 'arenaComandas');
      expect(content.highlights[1].routeName, 'arenaDashboard');
      expect(content.highlights[2].routeName, 'arenaSettings');
    });

    test('Elite tem título, subtítulo e 3 destaques sem rotas', () {
      final content = arenaPlanActivationContent(ArenaPlanTier.elite);

      expect(content.tier, ArenaPlanTier.elite);
      expect(content.title, 'Plano Elite ativado!');
      expect(
        content.subtitle,
        'Sua arena está pronta para operar em grande escala.',
      );
      expect(content.highlights, hasLength(3));
      expect(content.highlights[0].title, 'Taxa de 5% por reserva');
      expect(content.highlights[0].routeName, isNull);
      expect(content.highlights[1].title, 'Saque PIX sem tarifa');
      expect(content.highlights[2].title, 'Suporte prioritário');
    });

    test('Starter tem título, subtítulo e 3 destaques sem rotas', () {
      final content = arenaPlanActivationContent(ArenaPlanTier.starter);

      expect(content.tier, ArenaPlanTier.starter);
      expect(content.title, 'Plano Starter ativado!');
      expect(
        content.subtitle,
        'Sua arena já está pronta para receber reservas online.',
      );
      expect(content.highlights, hasLength(3));
      expect(content.highlights[0].title, 'Site institucional');
      expect(content.highlights[0].routeName, isNull);
      expect(content.highlights[1].title, 'Reservas online');
      expect(content.highlights[2].title, 'Carteira e saque PIX');
    });
  });
}
