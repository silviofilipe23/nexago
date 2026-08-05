import 'dart:typed_data';

import '../../domain/athlete_firestore_codes.dart';
import '../../domain/athlete_profile.dart';
import 'athlete_onboarding_options.dart';

/// Passos obrigatórios do onboarding (1–3; welcome é rota separada).
/// "Outros esportes" e "metas" saíram do caminho obrigatório — são opcionais e
/// editáveis depois (perfil / metas), encurtando o funil até o primeiro acesso.
enum AthleteOnboardingStep {
  primarySport(1),
  level(2),
  profile(3);

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
    this.verifiedPhoneNumber = '',
    this.birthDate = '',
    this.gender,
    this.avatarBytes,
    this.avatarContentType,
    this.referralCode = '',
  });

  final String? primarySportId;
  final Set<String> otherSportIds;
  final String? level;
  final Set<String> goalIds;
  final String name;
  final String nickname;
  /// Telefone confirmado por SMS (E.164), devolvido pela Cloud Function
  /// `confirmPhoneVerification`. Vazio enquanto o atleta não verificar — não é
  /// um campo digitável, o client não pode gravar telefone (ver
  /// `firestore.rules`).
  final String verifiedPhoneNumber;
  final String birthDate;
  final String? gender;
  final Uint8List? avatarBytes;
  final String? avatarContentType;

  /// Código de quem indicou (programa de indicação), opcional — informado
  /// no último passo do onboarding. Registrado uma vez, após o cadastro.
  final String referralCode;

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
      AthleteOnboardingStep.level => level != null && level!.isNotEmpty,
      AthleteOnboardingStep.profile => isProfileValid,
    };
  }

  bool get isNameValid => name.trim().isNotEmpty;

  /// Telefone verificado por SMS. Não basta ter formato válido: o gate de
  /// torneios do servidor exige `phoneVerified` (ver
  /// `athlete-tournament-access.ts`).
  bool get isPhoneValid => verifiedPhoneNumber.isNotEmpty;

  bool get isBirthDateValid => _isBirthDateValid(birthDate);

  bool get isGenderValid => gender != null && gender!.isNotEmpty;

  bool get isProfileValid =>
      isNameValid && isPhoneValid && isBirthDateValid && isGenderValid;

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
    String? verifiedPhoneNumber,
    String? birthDate,
    String? gender,
    Uint8List? avatarBytes,
    String? avatarContentType,
    bool clearAvatar = false,
    String? referralCode,
  }) {
    return AthleteOnboardingDraft(
      primarySportId: primarySportId ?? this.primarySportId,
      otherSportIds: otherSportIds ?? this.otherSportIds,
      level: level ?? this.level,
      goalIds: goalIds ?? this.goalIds,
      name: name ?? this.name,
      nickname: nickname ?? this.nickname,
      verifiedPhoneNumber: verifiedPhoneNumber ?? this.verifiedPhoneNumber,
      birthDate: birthDate ?? this.birthDate,
      gender: gender ?? this.gender,
      avatarBytes: clearAvatar ? null : (avatarBytes ?? this.avatarBytes),
      avatarContentType:
          clearAvatar ? null : (avatarContentType ?? this.avatarContentType),
      referralCode: referralCode ?? this.referralCode,
    );
  }

  /// Converte o rascunho em [AthleteProfile] para persistência.
  AthleteProfile toAthleteProfile({
    required String uid,
    String? avatarUrl,
  }) {
    final primary = primarySportLabel ?? '';
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
      // Só em memória: `toFirestore` não grava telefone (é a Cloud Function
      // que grava). Vai no perfil porque `saveProfile` deriva
      // `isProfileComplete`/`onboardingCompleted` a partir destes campos.
      phoneNumber: verifiedPhoneNumber.isEmpty ? null : verifiedPhoneNumber,
      phoneVerified: verifiedPhoneNumber.isNotEmpty,
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
