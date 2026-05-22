import 'athlete_profile_options.dart';

/// Abreviações de nível na tela Esportes e níveis (protótipo 12).
abstract final class AthleteSportsLevelsLabels {
  AthleteSportsLevelsLabels._();

  static const List<String> levelLabels = AthleteProfileOptions.levels;

  static const List<String> levelAbbreviations = [
    'Inic.',
    'Bás.',
    'Interm.',
    'Avanç.',
    'Comp.',
  ];

  static String abbreviationFor(String levelLabel) {
    final idx = levelLabels.indexOf(levelLabel);
    if (idx < 0 || idx >= levelAbbreviations.length) {
      return levelLabel.length > 4
          ? '${levelLabel.substring(0, 4)}.'
          : levelLabel;
    }
    return levelAbbreviations[idx];
  }
}
