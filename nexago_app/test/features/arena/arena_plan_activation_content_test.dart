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

    test('Parceiro tem título, subtítulo e 3 destaques sem rotas', () {
      final content = arenaPlanActivationContent(ArenaPlanTier.parceiro);

      expect(content.tier, ArenaPlanTier.parceiro);
      expect(content.title, 'Plano Parceiro ativado!');
      expect(
        content.subtitle,
        'Sua rede está pronta para sediar a Liga nexaGO.',
      );
      expect(content.highlights, hasLength(3));
      expect(content.highlights[0].title, 'Múltiplas unidades');
      expect(content.highlights[0].subtitle, 'Sem limite de quadras');
      expect(content.highlights[0].routeName, isNull);
      expect(content.highlights[1].title, 'Liga nexaGO');
      expect(content.highlights[2].title, 'Gerente dedicado');
    });

    test('Essencial lança ArgumentError', () {
      expect(
        () => arenaPlanActivationContent(ArenaPlanTier.essencial),
        throwsArgumentError,
      );
    });
  });
}
