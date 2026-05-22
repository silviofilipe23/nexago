import 'package:flutter/material.dart';

import '../onboarding/domain/athlete_onboarding_options.dart';
import 'athlete_firestore_codes.dart';
import 'athlete_profile.dart';
import 'athlete_profile_options.dart';
import 'athlete_sports_levels_draft.dart';

/// Esporte inscrito do atleta com nível para a UI.
class AthleteSportEnrollment {
  const AthleteSportEnrollment({
    required this.appSportId,
    required this.firestoreSportId,
    required this.label,
    required this.icon,
    required this.isPrimary,
    required this.levelLabel,
  });

  final String appSportId;
  final String firestoreSportId;
  final String label;
  final IconData icon;
  final bool isPrimary;
  final String levelLabel;
}

abstract final class AthleteSportsLevelsMapper {
  AthleteSportsLevelsMapper._();

  static const String _defaultLevel = AthleteSportsLevelsDraft.defaultLevel;

  static List<AthleteSportEnrollment> fromProfile(AthleteProfile profile) {
    final primaryFs = profile.primarySportFirestoreId ??
        _labelToFirestoreId(profile.sport);
    final secondaryFs = profile.secondarySportFirestoreIds;

    if (primaryFs == null || primaryFs.isEmpty) {
      if (profile.sport.trim().isEmpty) return const [];
      final appId = _labelToAppId(profile.sport);
      if (appId == null) return const [];
      return [
        _enrollment(
          appSportId: appId,
          firestoreSportId:
              AthleteFirestoreCodes.sportAppToFirestore(appId) ?? '',
          isPrimary: true,
          levelLabel: _levelForSport(
            firestoreSportId:
                AthleteFirestoreCodes.sportAppToFirestore(appId) ?? '',
            profile: profile,
            fallbackLabel: profile.level,
          ),
        ),
      ];
    }

    final enrollments = <AthleteSportEnrollment>[];
    final primaryApp = AthleteFirestoreCodes.sportFirestoreToApp(primaryFs);
    if (primaryApp != null) {
      enrollments.add(
        _enrollment(
          appSportId: primaryApp,
          firestoreSportId: primaryFs,
          isPrimary: true,
          levelLabel: _levelForSport(
            firestoreSportId: primaryFs,
            profile: profile,
            fallbackLabel: profile.level,
          ),
        ),
      );
    }

    for (final fsId in secondaryFs) {
      final appId = AthleteFirestoreCodes.sportFirestoreToApp(fsId);
      if (appId == null || appId == primaryApp) continue;
      enrollments.add(
        _enrollment(
          appSportId: appId,
          firestoreSportId: fsId,
          isPrimary: false,
          levelLabel: _levelForSport(
            firestoreSportId: fsId,
            profile: profile,
            fallbackLabel: '',
          ),
        ),
      );
    }

    return enrollments;
  }

  static List<AthleteSportEnrollment> enrollmentsFromDraft(
    AthleteSportsLevelsDraft draft,
  ) {
    final result = <AthleteSportEnrollment>[];
    final primary = draft.primaryAppSportId;
    if (primary != null && primary.isNotEmpty) {
      final fs = AthleteFirestoreCodes.sportAppToFirestore(primary);
      if (fs != null) {
        result.add(
          _enrollment(
            appSportId: primary,
            firestoreSportId: fs,
            isPrimary: true,
            levelLabel: draft.levelByAppSportId[primary] ?? _defaultLevel,
          ),
        );
      }
    }
    for (final appId in draft.otherAppSportIds) {
      if (appId == primary) continue;
      final fs = AthleteFirestoreCodes.sportAppToFirestore(appId);
      if (fs == null) continue;
      result.add(
        _enrollment(
          appSportId: appId,
          firestoreSportId: fs,
          isPrimary: false,
          levelLabel: draft.levelByAppSportId[appId] ?? _defaultLevel,
        ),
      );
    }
    return result;
  }

  static AthleteProfile toProfile({
    required AthleteSportsLevelsDraft draft,
    required AthleteProfile base,
  }) {
    final enrollments = enrollmentsFromDraft(draft);
    if (enrollments.isEmpty) return base;

    final primary = enrollments.firstWhere((e) => e.isPrimary);
    final secondaries = enrollments.where((e) => !e.isPrimary).toList();

    final levelsMap = <String, String>{};
    for (final e in enrollments) {
      levelsMap[e.firestoreSportId] =
          AthleteFirestoreCodes.levelLabelToFirestore(e.levelLabel);
    }

    return base.copyWith(
      sport: primary.label,
      level: primary.levelLabel,
      sports: secondaries.map((e) => e.label).toList(),
      primarySportFirestoreId: primary.firestoreSportId,
      secondarySportFirestoreIds:
          secondaries.map((e) => e.firestoreSportId).toList(),
      levelsBySportFirestore: levelsMap,
    );
  }

  static AthleteSportEnrollment _enrollment({
    required String appSportId,
    required String firestoreSportId,
    required bool isPrimary,
    required String levelLabel,
  }) {
    final option = AthleteOnboardingOptions.sportById(appSportId);
    final label = option?.label ??
        AthleteFirestoreCodes.sportFirestoreToLabel(firestoreSportId) ??
        appSportId;
    return AthleteSportEnrollment(
      appSportId: appSportId,
      firestoreSportId: firestoreSportId,
      label: label,
      icon: option?.icon ?? Icons.sports_outlined,
      isPrimary: isPrimary,
      levelLabel: AthleteProfileOptions.normalizeLevel(levelLabel).isEmpty
          ? _defaultLevel
          : AthleteProfileOptions.normalizeLevel(levelLabel),
    );
  }

  static String _levelForSport({
    required String firestoreSportId,
    required AthleteProfile profile,
    required String fallbackLabel,
  }) {
    final code = profile.levelsBySportFirestore[firestoreSportId];
    if (code != null && code.isNotEmpty) {
      final label = AthleteFirestoreCodes.levelFirestoreToLabel(code);
      if (label.isNotEmpty) {
        return AthleteProfileOptions.normalizeLevel(label);
      }
    }
    final fallback = AthleteProfileOptions.normalizeLevel(fallbackLabel);
    return fallback.isEmpty ? _defaultLevel : fallback;
  }

  static String? _labelToAppId(String label) {
    for (final s in AthleteOnboardingOptions.sports) {
      if (s.label == label) return s.id;
    }
    return null;
  }

  static String? _labelToFirestoreId(String label) {
    final appId = _labelToAppId(label);
    if (appId == null) return null;
    return AthleteFirestoreCodes.sportAppToFirestore(appId);
  }
}
