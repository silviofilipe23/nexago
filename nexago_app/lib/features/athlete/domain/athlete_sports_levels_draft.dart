import '../onboarding/domain/athlete_onboarding_options.dart';
import 'athlete_profile_options.dart';
import 'athlete_sports_levels_mapper.dart';

/// Estado editável da tela Esportes e níveis.
class AthleteSportsLevelsDraft {
  const AthleteSportsLevelsDraft({
    this.primaryAppSportId,
    this.otherAppSportIds = const {},
    this.levelByAppSportId = const {},
  });

  final String? primaryAppSportId;
  final Set<String> otherAppSportIds;
  final Map<String, String> levelByAppSportId;

  static const String defaultLevel = 'Iniciante 1';

  factory AthleteSportsLevelsDraft.fromEnrollments(
    List<AthleteSportEnrollment> enrollments,
  ) {
    String? primary;
    final others = <String>{};
    final levels = <String, String>{};
    for (final e in enrollments) {
      levels[e.appSportId] = e.levelLabel;
      if (e.isPrimary) {
        primary = e.appSportId;
      } else {
        others.add(e.appSportId);
      }
    }
    return AthleteSportsLevelsDraft(
      primaryAppSportId: primary,
      otherAppSportIds: others,
      levelByAppSportId: levels,
    );
  }

  Set<String> get enrolledAppSportIds {
    return {
      if (primaryAppSportId != null && primaryAppSportId!.isNotEmpty)
        primaryAppSportId!,
      ...otherAppSportIds,
    };
  }

  List<OnboardingSportOption> get availableToAdd {
    return AthleteOnboardingOptions.sports
        .where((s) => s.id != 'other' && !enrolledAppSportIds.contains(s.id))
        .toList();
  }

  List<AthleteSportEnrollment> toEnrollments() {
    return AthleteSportsLevelsMapper.enrollmentsFromDraft(this);
  }

  bool isDirtyComparedTo(AthleteSportsLevelsDraft other) {
    if (primaryAppSportId != other.primaryAppSportId) return true;
    if (otherAppSportIds.length != other.otherAppSportIds.length) return true;
    if (!otherAppSportIds.containsAll(other.otherAppSportIds)) return true;
    if (levelByAppSportId.length != other.levelByAppSportId.length) return true;
    for (final entry in levelByAppSportId.entries) {
      if (other.levelByAppSportId[entry.key] != entry.value) return true;
    }
    return false;
  }

  AthleteSportsLevelsDraft copyWith({
    String? primaryAppSportId,
    Set<String>? otherAppSportIds,
    Map<String, String>? levelByAppSportId,
  }) {
    return AthleteSportsLevelsDraft(
      primaryAppSportId: primaryAppSportId ?? this.primaryAppSportId,
      otherAppSportIds: otherAppSportIds ?? this.otherAppSportIds,
      levelByAppSportId: levelByAppSportId ?? this.levelByAppSportId,
    );
  }

  AthleteSportsLevelsDraft setLevel(String appSportId, String levelLabel) {
    final normalized = AthleteProfileOptions.normalizeLevel(levelLabel);
    final level = normalized.isEmpty ? defaultLevel : normalized;
    return copyWith(
      levelByAppSportId: {...levelByAppSportId, appSportId: level},
    );
  }

  /// Escolha obrigatória: [levelLabel] é o nível que o atleta escolheu
  /// explicitamente (sheet da página) para o esporte novo — sem default
  /// silencioso. Nível vazio/desconhecido ou esporte já matriculado é um
  /// no-op (`this` inalterado, ver `identical()` em
  /// `AthleteSportsLevelsNotifier.addSport`).
  AthleteSportsLevelsDraft addSport(String appSportId, String levelLabel) {
    final level = AthleteProfileOptions.normalizeLevel(levelLabel);
    if (level.isEmpty || AthleteProfileOptions.levelRank(level) == null) {
      return this;
    }
    if (enrolledAppSportIds.contains(appSportId)) return this;
    if (primaryAppSportId == null || primaryAppSportId!.isEmpty) {
      return copyWith(
        primaryAppSportId: appSportId,
        levelByAppSportId: {
          ...levelByAppSportId,
          appSportId: level,
        },
      );
    }
    return copyWith(
      otherAppSportIds: {...otherAppSportIds, appSportId},
      levelByAppSportId: {
        ...levelByAppSportId,
        appSportId: level,
      },
    );
  }

  AthleteSportsLevelsDraft setPrimary(String appSportId) {
    if (primaryAppSportId == appSportId) return this;
    final enrolled = enrolledAppSportIds;
    if (!enrolled.contains(appSportId)) return this;

    final previousPrimary = primaryAppSportId;
    final nextOthers = Set<String>.from(otherAppSportIds)
      ..remove(appSportId);
    if (previousPrimary != null && previousPrimary.isNotEmpty) {
      nextOthers.add(previousPrimary);
    }

    return copyWith(
      primaryAppSportId: appSportId,
      otherAppSportIds: nextOthers,
    );
  }
}
