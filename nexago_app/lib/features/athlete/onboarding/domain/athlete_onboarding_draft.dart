import 'dart:typed_data';

import '../../../../core/formatting/br_phone_format.dart';
import '../../domain/athlete_firestore_codes.dart';
import '../../domain/athlete_profile.dart';
import 'athlete_onboarding_options.dart';

/// Passos do fluxo de onboarding (1–5; welcome é rota separada).
enum AthleteOnboardingStep {
  primarySport(1),
  otherSports(2),
  level(3),
  goals(4),
  profile(5);

  const AthleteOnboardingStep(this.stepIndex);
  final int stepIndex;
}

/// Rascunho local do onboarding até persistir no Firestore.
class AthleteOnboardingDraft {
  const AthleteOnboardingDraft({
    this.primarySportId,
    this.otherSportIds = const {},
    this.level,
    this.goalIds = const {},
    this.name = '',
    this.nickname = '',
    this.phoneDigits = '',
    this.birthDate = '',
    this.gender,
    this.avatarBytes,
    this.avatarContentType,
  });

  final String? primarySportId;
  final Set<String> otherSportIds;
  final String? level;
  final Set<String> goalIds;
  final String name;
  final String nickname;
  final String phoneDigits;
  final String birthDate;
  final String? gender;
  final Uint8List? avatarBytes;
  final String? avatarContentType;

  String? get primarySportLabel =>
      AthleteOnboardingOptions.sportLabelById(primarySportId);

  List<String> get otherSportLabels {
    return otherSportIds
        .map(AthleteOnboardingOptions.sportLabelById)
        .whereType<String>()
        .where((l) => l != primarySportLabel)
        .toList();
  }

  bool canContinueFrom(AthleteOnboardingStep step) {
    return switch (step) {
      AthleteOnboardingStep.primarySport =>
        primarySportId != null && primarySportId!.isNotEmpty,
      AthleteOnboardingStep.otherSports => true,
      AthleteOnboardingStep.level => level != null && level!.isNotEmpty,
      AthleteOnboardingStep.goals => true,
      AthleteOnboardingStep.profile => isProfileValid,
    };
  }

  bool get isProfileValid {
    final digits = phoneDigits.replaceAll(RegExp(r'\D'), '');
    return name.trim().isNotEmpty &&
        digits.length >= 10 &&
        _isBirthDateValid(birthDate) &&
        gender != null &&
        gender!.isNotEmpty;
  }

  static bool _isBirthDateValid(String raw) {
    final m = RegExp(r'^(\d{2})/(\d{2})/(\d{4})$').firstMatch(raw.trim());
    if (m == null) return false;
    final day = int.tryParse(m.group(1)!);
    final month = int.tryParse(m.group(2)!);
    final year = int.tryParse(m.group(3)!);
    if (day == null || month == null || year == null) return false;
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    if (year < 1900 || year > DateTime.now().year) return false;
    return true;
  }

  AthleteOnboardingDraft copyWith({
    String? primarySportId,
    Set<String>? otherSportIds,
    String? level,
    Set<String>? goalIds,
    String? name,
    String? nickname,
    String? phoneDigits,
    String? birthDate,
    String? gender,
    Uint8List? avatarBytes,
    String? avatarContentType,
    bool clearAvatar = false,
  }) {
    return AthleteOnboardingDraft(
      primarySportId: primarySportId ?? this.primarySportId,
      otherSportIds: otherSportIds ?? this.otherSportIds,
      level: level ?? this.level,
      goalIds: goalIds ?? this.goalIds,
      name: name ?? this.name,
      nickname: nickname ?? this.nickname,
      phoneDigits: phoneDigits ?? this.phoneDigits,
      birthDate: birthDate ?? this.birthDate,
      gender: gender ?? this.gender,
      avatarBytes: clearAvatar ? null : (avatarBytes ?? this.avatarBytes),
      avatarContentType:
          clearAvatar ? null : (avatarContentType ?? this.avatarContentType),
    );
  }

  /// Converte o rascunho em [AthleteProfile] para persistência.
  AthleteProfile toAthleteProfile({
    required String uid,
    String? avatarUrl,
  }) {
    final primary = primarySportLabel ?? '';
    final phone = formatPhoneBrDisplay(phoneDigits);
    final primaryFs =
        AthleteFirestoreCodes.sportAppToFirestore(primarySportId);
    final secondaryFs = otherSportIds
        .where((id) => id != primarySportId)
        .map(AthleteFirestoreCodes.sportAppToFirestore)
        .whereType<String>()
        .toList();
    final goalsFs = AthleteFirestoreCodes.goalsAppToFirestore(goalIds);
    final birthIso =
        AthleteFirestoreCodes.birthDateBrToIso(birthDate.trim()) ??
            birthDate.trim();

    return AthleteProfile(
      id: uid,
      name: name.trim(),
      avatarUrl: avatarUrl,
      sport: primary,
      level: level ?? '',
      city: '',
      state: null,
      phoneNumber: phone,
      sports: otherSportLabels,
      goals: goalsFs,
      nickname: nickname.trim().isEmpty ? null : nickname.trim(),
      birthDate: birthIso,
      gender: gender,
      primarySportFirestoreId: primaryFs,
      secondarySportFirestoreIds: secondaryFs,
      otherSportNote: null,
      onboardingCompleted: true,
    );
  }

}
