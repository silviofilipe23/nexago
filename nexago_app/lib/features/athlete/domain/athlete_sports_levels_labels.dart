import 'athlete_profile_options.dart';

/// Abreviações de nível na tela Esportes e níveis (protótipo 12).
abstract final class AthleteSportsLevelsLabels {
  AthleteSportsLevelsLabels._();

  static const List<String> levelLabels = AthleteProfileOptions.levels;

  static const List<String> levelAbbreviations = [
    'Iniciante',
    'Intermediário',
    'Open',
  ];

  static String abbreviationFor(String levelLabel) {
    final idx = levelLabels.indexOf(levelLabel);
    if (idx < 0 || idx >= levelAbbreviations.length) {
      return levelLabel;
    }
    return levelAbbreviations[idx];
  }
}
