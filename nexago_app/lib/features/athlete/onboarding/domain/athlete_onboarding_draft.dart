import 'dart:typed_data';

import '../../domain/athlete_firestore_codes.dart';
import '../../domain/athlete_profile.dart';
import '../../domain/profile_access.dart';
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
    this.phoneNumber = '',
    this.phoneVerified = false,
    this.birthDate = '',
    this.gender,
    this.city = '',
    this.state = '',
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
  /// WhatsApp de contato, digitado pelo atleta. Obrigatório para concluir o
  /// cadastro — é por ele que o organizador fala com o atleta inscrito.
  final String phoneNumber;

  /// Posse do número confirmada por SMS (Firebase Phone Auth). Opcional: vira
  /// `true` só quando o atleta escolhe verificar, e o número passa a vir da
  /// Cloud Function `confirmPhoneVerification` em E.164.
  final bool phoneVerified;
  final String birthDate;
  final String? gender;

  /// Cidade e UF (sigla) escolhidas na lista do IBGE. Obrigatórias: o gate de
  /// torneios do servidor (`athlete-tournament-access.ts`) já exigia as duas
  /// depois do cadastro — pedir aqui evita o atleta esbarrar no bloqueio na
  /// primeira inscrição.
  final String city;
  final String state;

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

  /// WhatsApp em formato válido. A verificação por SMS NÃO é exigida: o SMS
  /// não chega para parte dos atletas e travava o funil inteiro. O gate de
  /// torneios do servidor (`athlete-tournament-access.ts`) aceita o número
  /// declarado — mas exige o formato, senão o organizador fica sem contato.
  bool get isPhoneValid => isValidWhatsAppNumber(phoneNumber);

  bool get isBirthDateValid => _isBirthDateValid(birthDate);

  bool get isGenderValid => gender != null && gender!.isNotEmpty;

  bool get isCityValid => city.trim().isNotEmpty;

  bool get isStateValid => state.trim().isNotEmpty;

  /// Foto escolhida (ainda em memória). Obrigatória: é o que identifica o
  /// atleta nas listas de inscrição, na mesa e no ranking.
  bool get isPhotoValid => avatarBytes != null && avatarContentType != null;

  bool get isProfileValid =>
      isNameValid &&
      isPhoneValid &&
      isBirthDateValid &&
      isGenderValid &&
      isCityValid &&
      isStateValid &&
      isPhotoValid;

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
    String? phoneNumber,
    bool? phoneVerified,
    String? birthDate,
    String? gender,
    String? city,
    String? state,
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
      phoneNumber: phoneNumber ?? this.phoneNumber,
      phoneVerified: phoneVerified ?? this.phoneVerified,
      birthDate: birthDate ?? this.birthDate,
      gender: gender ?? this.gender,
      city: city ?? this.city,
      state: state ?? this.state,
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
      city: city.trim(),
      state: state.trim().isEmpty ? null : state.trim().toUpperCase(),
      // `phoneNumber` é gravado pelo próprio client (rules liberam enquanto
      // não há selo); `phoneVerified` continua sendo só da Cloud Function.
      phoneNumber: phoneNumber.trim().isEmpty ? null : phoneNumber.trim(),
      phoneVerified: phoneVerified,
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
