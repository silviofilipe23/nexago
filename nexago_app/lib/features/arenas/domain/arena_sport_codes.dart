import '../../../core/sports/sport_catalog.dart';
import '../../../core/sports/sport_catalog_data.dart';

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

/// Uma opção de esporte no formulário de quadra / perfil da arena: [value] é o que vai para o
/// Firestore, [label] o que o dono vê.
class CourtSportOption {
  const CourtSportOption(this.value, this.label);

  final String value;
  final String label;
}

/// Esportes oferecidos no cadastro de quadra (multiesporte fase 5b): os do catálogo com
/// `arenaCourtTypes`, gravados como CÓDIGO, mais "Pickleball", que ainda não está no catálogo e
/// segue como texto.
final List<CourtSportOption> kCourtSportOptions = [
  for (final e in kSportCatalog)
    if (e.arenaCourtTypes.isNotEmpty) CourtSportOption(e.code, e.label),
  const CourtSportOption('Pickleball', 'Pickleball'),
];

/// Rótulo de uma opção/valor gravado para o chip do formulário.
String courtSportOptionLabel(String value) {
  for (final o in kCourtSportOptions) {
    if (o.value == value) return o.label;
  }
  return courtSportLabel(value);
}

/// Valores (rótulo legado ou código) → o que se GRAVA a partir da fase 5b: o código do esporte;
/// valor fora do catálogo (superfície, pickleball) segue cru. Sem repetição, na ordem.
List<String> courtTypeCodesFor(Iterable<String> stored) {
  final out = <String>[];
  for (final raw in stored) {
    final value = raw.trim();
    if (value.isEmpty) continue;
    final code = SportCatalog.resolve(value)?.code ?? value;
    if (!out.contains(code)) out.add(code);
  }
  return out;
}
