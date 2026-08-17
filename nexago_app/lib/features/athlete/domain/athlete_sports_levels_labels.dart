import 'athlete_profile_options.dart';

/// Abreviações de nível na tela Esportes e níveis (protótipo 12).
abstract final class AthleteSportsLevelsLabels {
  AthleteSportsLevelsLabels._();

  static const List<String> levelLabels = AthleteProfileOptions.levels;

  /// Labels de nível (escada única de 7 para todos os esportes).
  static List<String> levelLabelsFor(String firestoreSportId) {
    return AthleteProfileOptions.levels;
  }

  static const Map<String, String> _abbreviations = {
    'Iniciante': 'Iniciante',
    'Intermediário': 'Intermediário',
    'Open': 'Open',
    'Iniciante 1': 'Inic. 1',
    'Iniciante 2': 'Inic. 2',
    'Intermediário 1': 'Int. 1',
    'Intermediário 2': 'Int. 2',
    'Avançado 1': 'Av. 1',
    'Avançado 2': 'Av. 2',
  };

  static String abbreviationFor(String levelLabel) {
    return _abbreviations[levelLabel] ?? levelLabel;
  }
}
