import 'package:flutter/material.dart';

import '../../../core/location/br_locations_data.dart';
import 'athlete_firestore_codes.dart';
import 'athlete_profile.dart';
import 'profile_access.dart';

/// Passos da tela "Completar perfil" (design 02).
enum ProfileCompletionStep {
  photo,
  sportLevel,
  city,
  whatsapp,
  goals;

  String get id => switch (this) {
        ProfileCompletionStep.photo => 'photo',
        ProfileCompletionStep.sportLevel => 'sport_level',
        ProfileCompletionStep.city => 'city',
        ProfileCompletionStep.whatsapp => 'whatsapp',
        ProfileCompletionStep.goals => 'goals',
      };

  int get xpReward => switch (this) {
        ProfileCompletionStep.photo => 30,
        ProfileCompletionStep.sportLevel => 30,
        ProfileCompletionStep.city => 20,
        ProfileCompletionStep.whatsapp => 30,
        ProfileCompletionStep.goals => 40,
      };

  String get title => switch (this) {
        ProfileCompletionStep.photo => 'Foto de perfil',
        ProfileCompletionStep.sportLevel => 'Esporte e nível',
        ProfileCompletionStep.city => 'Cidade',
        ProfileCompletionStep.whatsapp => 'WhatsApp',
        ProfileCompletionStep.goals => 'Objetivos',
      };

  /// Rótulo na mensagem de bloqueio de torneios (paridade com backend).
  String get tournamentAccessLabel => switch (this) {
        ProfileCompletionStep.photo => 'foto de perfil',
        ProfileCompletionStep.sportLevel => 'esporte e nível',
        ProfileCompletionStep.city => 'cidade e UF',
        ProfileCompletionStep.whatsapp => 'WhatsApp',
        ProfileCompletionStep.goals => 'objetivos',
      };

  String get pendingSubtitle => switch (this) {
        ProfileCompletionStep.photo => 'Faça o pessoal te reconhecer.',
        ProfileCompletionStep.sportLevel =>
          'Defina seu esporte principal e nível.',
        ProfileCompletionStep.city => 'Ajuda a encontrar arenas perto de você.',
        ProfileCompletionStep.whatsapp => 'Pra confirmar reservas e times.',
        ProfileCompletionStep.goals => 'Conta o que você busca na quadra.',
      };

  IconData get icon => switch (this) {
        ProfileCompletionStep.photo => Icons.person_outline_rounded,
        ProfileCompletionStep.sportLevel => Icons.sports_volleyball_outlined,
        ProfileCompletionStep.city => Icons.location_city_outlined,
        ProfileCompletionStep.whatsapp => Icons.chat_bubble_outline_rounded,
        ProfileCompletionStep.goals => Icons.flag_outlined,
      };

  String get xpReason => 'PROFILE_STEP_${id.toUpperCase()}';
}

/// Status de um passo calculado a partir do [AthleteProfile].
class ProfileCompletionStepStatus {
  const ProfileCompletionStepStatus({
    required this.step,
    required this.isDone,
    required this.subtitle,
    this.xpAwarded = false,
  });

  final ProfileCompletionStep step;
  final bool isDone;
  final String subtitle;
  final bool xpAwarded;
}

class ProfileCompletionState {
  const ProfileCompletionState({
    required this.steps,
    required this.profile,
  });

  final List<ProfileCompletionStepStatus> steps;
  final AthleteProfile profile;

  static const totalSteps = 5;

  int get completedCount => steps.where((s) => s.isDone).length;

  int get percent =>
      totalSteps == 0 ? 0 : ((completedCount / totalSteps) * 100).round();

  int get remainingSteps => totalSteps - completedCount;

  int get remainingXp => steps
      .where((s) => !s.isDone)
      .fold(0, (sum, s) => sum + s.step.xpReward);

  int get totalXpReward =>
      ProfileCompletionStep.values.fold(0, (sum, s) => sum + s.xpReward);

  bool get allComplete => completedCount >= totalSteps;

  bool get canUnlockTournaments => isTournamentProfileReady(profile);

  List<String> get pendingTournamentAccessLabels => steps
      .where((s) => !s.isDone)
      .map((s) => s.step.tournamentAccessLabel)
      .toList();

  List<String> get pendingStepTitles => steps
      .where((s) => !s.isDone)
      .map((s) => s.step.title)
      .toList();

  static ProfileCompletionState fromProfile(
    AthleteProfile profile, {
    Set<String> awardedStepIds = const {},
  }) {
    final stepStatuses = ProfileCompletionStep.values.map((step) {
      final done = _isStepDone(profile, step);
      return ProfileCompletionStepStatus(
        step: step,
        isDone: done,
        subtitle: done ? _doneSubtitle(profile, step) : step.pendingSubtitle,
        xpAwarded: awardedStepIds.contains(step.id),
      );
    }).toList();

    return ProfileCompletionState(steps: stepStatuses, profile: profile);
  }

  static bool _isStepDone(AthleteProfile profile, ProfileCompletionStep step) {
    return switch (step) {
      ProfileCompletionStep.photo =>
        profile.avatarUrl != null && profile.avatarUrl!.trim().isNotEmpty,
      ProfileCompletionStep.sportLevel =>
        (profile.primarySportFirestoreId != null &&
                profile.primarySportFirestoreId!.isNotEmpty) ||
            profile.levelsBySportFirestore.isNotEmpty ||
            profile.sports.isNotEmpty ||
            (profile.sport.trim().isNotEmpty && profile.level.trim().isNotEmpty) ||
            profile.sport.trim().isNotEmpty,
      ProfileCompletionStep.city => _isCityStepDone(profile),
      ProfileCompletionStep.whatsapp =>
        ProfileCompletionValidators.isValidWhatsApp(profile.phoneNumber),
      ProfileCompletionStep.goals =>
        profile.goals.isNotEmpty ||
        (profile.gameObjective?.trim().isNotEmpty ?? false),
    };
  }

  static bool _isCityStepDone(AthleteProfile profile) {
    if (profile.city.trim().isEmpty) return false;
    if (profile.state?.trim().isNotEmpty == true) return true;
    return BrLocationsData.parseLegacyLocation(profile.city).state.isNotEmpty;
  }

  static String _doneSubtitle(AthleteProfile profile, ProfileCompletionStep step) {
    return switch (step) {
      ProfileCompletionStep.photo => 'Foto adicionada.',
      ProfileCompletionStep.sportLevel => _sportLevelSubtitle(profile),
      ProfileCompletionStep.city => profile.locationLabel.isNotEmpty
          ? profile.locationLabel
          : profile.city.trim(),
      ProfileCompletionStep.whatsapp => profile.phoneNumber?.trim() ?? '',
      ProfileCompletionStep.goals => _goalsSubtitle(profile),
    };
  }

  static String _sportLevelSubtitle(AthleteProfile profile) {
    final sportLabel = profile.sport.trim().isNotEmpty
        ? profile.sport.trim()
        : (AthleteFirestoreCodes.sportFirestoreToLabel(
              profile.primarySportFirestoreId,
            ) ??
            '');
    final level = profile.level.trim();
    if (sportLabel.isEmpty && level.isEmpty) return '—';
    if (sportLabel.isEmpty) return level;
    if (level.isEmpty) return sportLabel;
    return '$sportLabel · $level';
  }

  static String _goalsSubtitle(AthleteProfile profile) {
    if (profile.goals.isEmpty) {
      return ProfileCompletionStep.goals.pendingSubtitle;
    }
    final labels = profile.goals
        .map(_goalCodeToLabel)
        .where((l) => l.isNotEmpty)
        .take(2)
        .toList();
    if (labels.isEmpty) return '${profile.goals.length} objetivo(s)';
    if (labels.length == 1) return labels.first;
    final extra = profile.goals.length - 1;
    return extra > 0 ? '${labels.first} · +$extra' : labels.first;
  }

  static String _goalCodeToLabel(String code) {
    final appId = AthleteFirestoreCodes.goalFirestoreToApp(code);
    return _goalLabels[appId] ?? _goalLabels[code] ?? code;
  }

  static const Map<String, String> _goalLabels = {
    'book_arena': 'Reservar arena',
    'RESERVAR_ARENA': 'Reservar arena',
    'play_fun': 'Jogar por diversão',
    'JOGAR_DIVERSAO': 'Jogar por diversão',
    'compete': 'Competir',
    'COMPETIR': 'Competir',
    'improve': 'Melhorar desempenho',
    'MELHORAR_DESEMPENHO': 'Melhorar desempenho',
    'meet_people': 'Conhecer pessoas',
    'CONHECER_PESSOAS': 'Conhecer pessoas',
    'train_regularly': 'Treinar regularmente',
    'TREINAR_REGULARMENTE': 'Treinar regularmente',
  };
}

abstract final class ProfileCompletionValidators {
  ProfileCompletionValidators._();

  static bool isValidWhatsApp(String? raw) {
    final digits = (raw ?? '').replaceAll(RegExp(r'\D'), '');
    if (digits.length >= 10 && digits.length <= 11) return true;
    // +55 + DDD + número (9 dígitos)
    if (digits.length >= 12 && digits.length <= 13 && digits.startsWith('55')) {
      return true;
    }
    return false;
  }
}
