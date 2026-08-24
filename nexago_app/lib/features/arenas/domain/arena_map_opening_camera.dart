import '../../../core/location/user_location_snapshot.dart';
import 'arena_map_pins_logic.dart';
import 'arena_search_filter_logic.dart';
import 'nearby_arenas_logic.dart';

/// Onde o mapa da aba Reservar deve abrir.
///
/// Ordem: o GPS do atleta; na falta dele, as arenas da cidade que ele declarou
/// no perfil. O GPS pode não existir (permissão negada, serviço desligado) e a
/// cidade do perfil é obrigatória no cadastro — sem essa segunda tentativa, o
/// mapa abriria enquadrando o país inteiro para quem só não deu a permissão.
///
/// Devolve nulo quando não dá para afirmar nada sobre onde o atleta está: aí
/// quem manda na câmera é o enquadramento dos pinos.
({double latitude, double longitude})? resolveArenaMapOpeningCenter({
  required UserLocationSnapshot user,
  required List<FilteredArenaSearchResult> results,
}) {
  if (user.hasCoordinates) {
    return (latitude: user.latitude!, longitude: user.longitude!);
  }
  if (!user.hasProfilePlace) return null;

  final pins = splitArenaMapResults(
    results: results
        .where((e) => arenaMatchesProfilePlace(e.result.arena, user))
        .toList(growable: false),
  ).pins;

  final bounds = arenaMapPinsBounds(pins);
  if (bounds == null) return null;
  return (
    latitude: bounds.centerLatitude,
    longitude: bounds.centerLongitude,
  );
}

/// Se a localização que chegou depois do mapa nascer ainda vale como abertura.
///
/// Ela costuma chegar tarde: o GPS leva segundos, e nesse meio-tempo os pinos
/// já enquadraram a câmera sozinhos. Esse enquadramento é o que fazemos sem
/// saber onde o atleta está — assim que sabemos, ele perde a vez.
///
/// O que a localização NÃO faz é tirar a câmera da mão do atleta: buscar,
/// tocar num pino ou pedir "minha localização" encerra a abertura.
bool shouldApplyLateOpeningCenter({
  required bool hasCenter,
  required bool alreadyApplied,
  required bool athleteMovedCamera,
}) {
  return hasCenter && !alreadyApplied && !athleteMovedCamera;
}
