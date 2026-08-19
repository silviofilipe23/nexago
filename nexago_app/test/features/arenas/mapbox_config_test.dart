import 'package:flutter_test/flutter_test.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:nexago_app/core/map/mapbox_config.dart';

void main() {
  group('estilo do mapa', () {
    test('usa o Standard, que é quem tem prédios 3D', () {
      // Inclinar o Streets daria um mapa plano visto de lado: o volume dos
      // prédios vem do estilo, não da câmera.
      expect(mapboxStyleUri, MapboxStyles.STANDARD);
    });

    test('os pinos entram num slot nomeado', () {
      // Sem slot, o Standard pode empilhar a camada atrás de um prédio 3D e o
      // pino da arena desaparece por trás da geometria.
      expect(mapboxPinSlot, isNotEmpty);
    });
  });

  group('inclinação da câmera', () {
    test('é grande o bastante para o 3D aparecer', () {
      // Perto de zero, o estilo continua com os prédios e o atleta nunca os
      // vê — de cima, prédio é polígono chapado.
      expect(mapboxDefaultPitch, greaterThan(25));
    });

    test('está dentro do que o Mapbox aceita', () {
      // Acima de 85 o motor recusa a câmera.
      expect(mapboxDefaultPitch, lessThanOrEqualTo(85));
    });
  });

  group('token', () {
    test('sem --dart-define o mapa se declara não configurado', () {
      // É o que mantém a aba caindo no fallback em lista em vez de abrir uma
      // tela vazia — e o que mantém o MapWidget fora dos testes de widget.
      expect(isMapboxConfigured, mapboxAccessToken.isNotEmpty);
    });

    test('initMapbox não estoura sem token', () {
      expect(initMapbox, returnsNormally);
    });
  });
}
