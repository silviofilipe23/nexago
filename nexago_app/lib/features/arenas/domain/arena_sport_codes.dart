import '../../../core/sports/sport_catalog.dart';

/// Esporte das quadras da arena pelo catálogo (multiesporte fase 5a).
///
/// `arenas.courtTypes` e `courts.types` guardam o rótulo legado ("Beach tennis") e, a partir da
/// fase 5b, o código (`beachTennis`). Os dois resolvem igual por [SportCatalog.resolve]; superfície
/// ("Areia") e esporte fora do catálogo ("Pickleball") não resolvem. Espelha
/// `frontend/shared/arena-discovery/sport-chip.ts`.

/// Códigos de esporte das quadras, sem repetição, na ordem gravada.
List<String> arenaSportCodes(Iterable<String> courtTypes) {
  final codes = <String>[];
  for (final raw in courtTypes) {
    final code = SportCatalog.resolve(raw)?.code;
    if (code != null && !codes.contains(code)) codes.add(code);
  }
  return codes;
}

/// Rótulo de UM valor de quadra para exibição: do catálogo quando é esporte conhecido; senão o
/// valor cru (superfície, esporte fora do catálogo). Vazio → vazio.
String courtSportLabel(String? raw) {
  final value = raw?.trim() ?? '';
  if (value.isEmpty) return '';
  return SportCatalog.resolve(value)?.label ?? value;
}

/// Rótulos das quadras para pills/linhas: código + rótulo do mesmo esporte viram um só.
List<String> arenaSportLabels(Iterable<String> courtTypes) {
  final labels = <String>[];
  for (final raw in courtTypes) {
    final label = courtSportLabel(raw);
    if (label.isNotEmpty && !labels.contains(label)) labels.add(label);
  }
  return labels;
}

/// Valores gravados (código ou rótulo legado) → as opções do formulário do dono que representam
/// o mesmo esporte, sem repetição. O formulário marca chip por igualdade de texto; sem isso um
/// código gravado pelo portal ficaria escondido e um toque gravaria o rótulo ao lado dele.
/// Valor que nenhuma opção cobre segue cru, para não sumir do doc ao salvar.
List<String> courtTypeOptionsFor(
  Iterable<String> stored,
  List<String> options,
) {
  final out = <String>[];
  for (final raw in stored) {
    final value = raw.trim();
    if (value.isEmpty) continue;
    final code = SportCatalog.resolve(value)?.code;
    var option = value;
    if (code != null) {
      for (final candidate in options) {
        if (SportCatalog.resolve(candidate)?.code == code) {
          option = candidate;
          break;
        }
      }
    }
    if (!out.contains(option)) out.add(option);
  }
  return out;
}
