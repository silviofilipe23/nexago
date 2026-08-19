import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

/// Token PÚBLICO do Mapbox (`pk.*`), injetado no build.
///
/// Nunca fica no repositório: entra por `--dart-define`, tanto no `flutter run`
/// quanto no `flutter build`.
///
/// ```bash
/// flutter run --dart-define=MAPBOX_ACCESS_TOKEN=pk.seu_token_aqui
/// ```
///
/// Não confundir com o token SECRETO de download (`sk.*`), que é outra coisa:
/// aquele só serve para o Gradle/CocoaPods baixarem o SDK nativo e mora em
/// `~/.gradle/gradle.properties` e `~/.netrc` (ver `android/build.gradle.kts`).
const String mapboxAccessToken = String.fromEnvironment('MAPBOX_ACCESS_TOKEN');

/// Estilo do mapa. Trocável por um estilo do Studio sem tocar em mais nada.
///
/// `STANDARD` e não `MAPBOX_STREETS`: é o estilo que traz prédios em 3D e
/// iluminação prontos. Inclinar o Streets daria só um mapa plano visto de
/// lado, sem volume nenhum.
const String mapboxStyleUri = String.fromEnvironment(
  'MAPBOX_STYLE_URI',
  defaultValue: MapboxStyles.STANDARD,
);

/// Inclinação da câmera, em graus.
///
/// Sem ela o estilo tem os prédios 3D e o atleta nunca os vê: de cima, um
/// prédio é um polígono chapado.
const double mapboxDefaultPitch = 50;

/// Slot do Standard onde os pinos entram.
///
/// O Standard ordena camadas por slots nomeados. Sem declarar um, a camada
/// cai numa posição arbitrária e o pino pode nascer ATRÁS de um prédio 3D.
const String mapboxPinSlot = 'top';

/// Sem token não há mapa.
///
/// Toda a tela de busca depende disso para decidir entre mapa e o fallback em
/// lista pura — o build sem token continua rodando, só que sem mapa. É também
/// o que mantém o `MapWidget` fora dos testes de widget, onde não existe
/// `--dart-define` e a view de plataforma não sobe.
bool get isMapboxConfigured => mapboxAccessToken.isNotEmpty;

/// Entrega o token ao SDK. Sem efeito quando não há token.
///
/// Idempotente: chamar mais de uma vez não faz mal.
void initMapbox() {
  if (!isMapboxConfigured) return;
  MapboxOptions.setAccessToken(mapboxAccessToken);
}
