import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_map/arena_map_pin_art.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_map/arena_map_style.dart';

/// Percorre uma expressão do Mapbox, incluindo as aninhadas.
Iterable<Object?> _flatten(List<Object?> expression) sync* {
  for (final node in expression) {
    if (node is List) {
      yield* _flatten(node);
    } else {
      yield node;
    }
  }
}

void main() {
  group('arenaPinOpacityExpression', () {
    test('começa com "case", como o motor de estilo espera', () {
      expect(arenaPinOpacityExpression().first, 'case');
    });

    test('lê a propriedade que o GeoJSON realmente escreve', () {
      // Se o nome divergir do que `arenaMapPinsToGeoJson` grava, a expressão
      // não falha: ela cai sempre no ramo padrão e TODO pino nasce apagado.
      final valores = _flatten(arenaPinOpacityExpression()).whereType<String>();

      expect(valores, contains('kind'));
      expect(valores, contains('available'));
    });

    test('arena com horário fica opaca e o resto apagado', () {
      final numeros =
          _flatten(arenaPinOpacityExpression()).whereType<num>().toList();

      expect(numeros, [1.0, ArenaPinAsset.mutedOpacity]);
    });

    test('a opacidade apagada ainda deixa o pino visível', () {
      // Zero esconderia a arena do mapa em vez de indicar que ela está sem
      // horário — some a informação de que ela existe.
      expect(ArenaPinAsset.mutedOpacity, greaterThan(0.2));
      expect(ArenaPinAsset.mutedOpacity, lessThan(1));
    });
  });

  group('ArenaPinAsset', () {
    test('o caminho aponta para um asset declarado no pubspec', () {
      expect(ArenaPinAsset.path, startsWith('assets/images/'));
      expect(ArenaPinAsset.path, endsWith('.png'));
    });

    test('a escala do PNG é a que o Mapbox recebe', () {
      // Declarar escala diferente da real desenha o pino no tamanho errado,
      // sem nenhum erro.
      expect(ArenaPinAsset.scale, 3);
      expect(ArenaPinAsset.displayHeight, greaterThan(0));
    });
  });

  group('loadArenaPinImage', () {
    test('lê o asset e informa as medidas reais do PNG', () async {
      TestWidgetsFlutterBinding.ensureInitialized();
      final image = await loadArenaPinImage();

      expect(image, isNotNull, reason: 'o asset do pino precisa existir');

      // As medidas viajam junto com os bytes e são usadas pelo lado nativo:
      // declarar errado desenha lixo. Por isso saem do próprio PNG.
      expect(image!.width, greaterThan(0));
      expect(image.height, greaterThan(0));
      expect(image.data.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47]);

      // O pino é uma gota: mais alto que largo.
      expect(image.height, greaterThan(image.width));

      // E as medidas têm que bater com a altura de exibição declarada.
      expect(image.height / ArenaPinAsset.scale, ArenaPinAsset.displayHeight);
    });
  });
}
