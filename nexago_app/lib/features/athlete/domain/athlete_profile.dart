import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../../core/formatting/app_date_format.dart';

import '../../../core/location/br_locations_data.dart';
import 'athlete_firestore_codes.dart';
import 'athlete_notification_preferences.dart';
import 'athlete_privacy_preferences.dart';
import 'athlete_profile_options.dart';

/// Limite máximo de fotos na galeria de destaque do perfil.
const int maxHighlightPhotos = 6;

/// Perfil do atleta em `users/{uid}` (id = UID do Firebase Auth).
class AthleteProfile {
  const AthleteProfile({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.coverPhotoUrl,
    required this.sport,
    required this.level,
    required this.city,
    this.state,
    this.phoneNumber,
    this.phoneVerified = false,
    this.cpfCnpj,
    this.bio,
    this.sports = const [],
    this.goals = const [],
    this.nickname,
    this.birthDate,
    this.gender,
    this.primarySportFirestoreId,
    this.secondarySportFirestoreIds = const [],
    this.otherSportNote,
    this.onboardingCompleted = false,
    this.isProfileComplete = false,
    this.useBiometric = false,
    this.levelsBySportFirestore = const {},
    this.levelLocked = const {},
    this.notificationPreferences = AthleteNotificationPreferences.defaults,
    this.privacyPreferences = AthletePrivacyPreferences.defaults,
    this.publicProfileEnabled = true,
    this.category,
    this.lookingForPartner = false,
    this.gameObjective,
    this.lastActiveAt,
    this.highlightPhotoUrls = const [],
  });

  final String id;
  final String name;
  final String? avatarUrl;
  final String? coverPhotoUrl;
  final String sport;
  final String level;
  final String city;
  /// Sigla da UF (ex.: `GO`).
  final String? state;
  final String? phoneNumber;

  /// Posse do telefone confirmada por SMS (Firebase Phone Auth). Gravado só
  /// pela Cloud Function `confirmPhoneVerification` — o client não escreve
  /// este campo nem [phoneNumber] (ver `firestore.rules` em `users/{userId}`).
  final bool phoneVerified;
  final String? cpfCnpj;
  final String? bio;
  final List<String> sports;
  /// Códigos Firestore de objetivo (ex.: `RESERVAR_ARENA`).
  final List<String> goals;
  final String? nickname;
  /// ISO `YYYY-MM-DD` ou legado `dd/mm/aaaa` (preferir ISO ao salvar).
  final String? birthDate;
  final String? gender;
  final String? primarySportFirestoreId;
  final List<String> secondarySportFirestoreIds;
  final String? otherSportNote;
  final bool onboardingCompleted;
  /// Flag persistida em `users.isProfileComplete` (5 passos + sync de gamificação).
  final bool isProfileComplete;
  final bool useBiometric;
  /// Nível por esporte em `sportOnboarding.levelsBySport` (código FS → código nível).
  final Map<String, String> levelsBySportFirestore;
  /// Janela de calibração (Task 1–2 do plano): `sportOnboarding.levelLocked`
  /// em `users/{uid}` — código FS → `true` quando o ratchet "nível só sobe"
  /// já vale para aquele esporte (1ª inscrição ativa). Gravado SÓ pelo
  /// trigger de backend (`tournament-level-lock.ts`); o client nunca escreve
  /// este campo (ver [toFirestore] — a chave nunca entra no payload).
  final Map<String, bool> levelLocked;
  final AthleteNotificationPreferences notificationPreferences;
  final AthletePrivacyPreferences privacyPreferences;
  /// Alinhado com web (`athlete_profiles`); derivado de [privacyPreferences].
  final bool publicProfileEnabled;
  final String? category;
  final bool lookingForPartner;
  final String? gameObjective;
  final DateTime? lastActiveAt;
  /// URLs das fotos de destaque (`profiles/{uid}/highlights/*`), na ordem de
  /// exibição. Limitado a [maxHighlightPhotos] na UI de edição.
  final List<String> highlightPhotoUrls;

  bool get isDiscoverable =>
      publicProfileEnabled &&
      privacyPreferences.profileVisibility !=
          AthleteProfileVisibility.private;

  factory AthleteProfile.draft(User user) {
    final email = user.email;
    final fallbackName = email != null && email.contains('@')
        ? email.split('@').first
        : 'Atleta';
    return AthleteProfile(
      id: user.uid,
      name: user.displayName?.trim().isNotEmpty == true
          ? user.displayName!.trim()
          : fallbackName,
      avatarUrl: user.photoURL,
      sport: '',
      level: '',
      city: '',
      state: null,
      phoneNumber: user.phoneNumber,
      // `User.phoneNumber` só existe quando o Firebase Phone Auth confirmou o
      // número por SMS — se está aqui, está verificado.
      phoneVerified: user.phoneNumber != null,
      onboardingCompleted: false,
    );
  }

  factory AthleteProfile.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final profilePhotoUrl = (data['profilePhotoUrl'] as String?)?.trim();
    final avatarUrl = (data['avatarUrl'] as String?)?.trim();
    final authPhotoUrl = (data['photoURL'] as String?)?.trim();
    final resolvedPhotoUrl = (profilePhotoUrl != null && profilePhotoUrl.isNotEmpty)
        ? profilePhotoUrl
        : ((avatarUrl != null && avatarUrl.isNotEmpty)
            ? avatarUrl
            : ((authPhotoUrl != null && authPhotoUrl.isNotEmpty)
                ? authPhotoUrl
                : null));
    final coverPhotoUrl = (data['coverPhotoUrl'] as String?)?.trim();

    final name = (data['fullName'] as String?)?.trim().isNotEmpty == true
        ? (data['fullName'] as String).trim()
        : ((data['name'] as String?)?.trim() ?? '');

    final sportOnboarding = data['sportOnboarding'];
    final sportProfile = data['sportProfile'];

    String sport = AthleteProfileOptions.normalizeSport(
      (data['sport'] as String?) ?? (data['primarySport'] as String?),
    );
    String level = AthleteProfileOptions.normalizeLevel(
      (data['level'] as String?) ?? (data['nivel'] as String?),
    );
    List<String> sports = _stringList(data['sports']);
    List<String> goals = _stringList(data['goals']);
    String? primarySportFirestoreId;
    List<String> secondarySportFirestoreIds = const [];
    String? otherSportNote;
    Map<String, String> levelsBySportFirestore = const {};
    Map<String, bool> levelLocked = const {};

    if (sportOnboarding is Map) {
      final rawPrimary = sportOnboarding['primarySportId'] as String?;
      primarySportFirestoreId = rawPrimary?.trim().isNotEmpty == true
          ? rawPrimary!.trim()
          : null;
      final fromOnboardingLabel =
          AthleteFirestoreCodes.sportFirestoreToLabel(primarySportFirestoreId);
      if (fromOnboardingLabel != null && fromOnboardingLabel.isNotEmpty) {
        sport = fromOnboardingLabel;
      }

      secondarySportFirestoreIds =
          _stringList(sportOnboarding['secondarySportIds']);

      final secondaryLabels = AthleteFirestoreCodes.sportFirestoreIdsToLabels(
        secondarySportFirestoreIds,
      );
      if (secondaryLabels.isNotEmpty) {
        sports = secondaryLabels;
      }

      final onboardingGoals = _stringList(sportOnboarding['goals']);
      if (onboardingGoals.isNotEmpty) {
        goals = onboardingGoals;
      }

      final levelsBySport = sportOnboarding['levelsBySport'];
      if (levelsBySport is Map) {
        final parsed = <String, String>{};
        for (final entry in levelsBySport.entries) {
          final sportKey = entry.key.toString().trim();
          final levelVal = entry.value?.toString().trim() ?? '';
          if (sportKey.isNotEmpty && levelVal.isNotEmpty) {
            parsed[sportKey] = levelVal;
          }
        }
        if (parsed.isNotEmpty) {
          levelsBySportFirestore = parsed;
        }
        final primaryId = primarySportFirestoreId;
        if (primaryId != null && primaryId.isNotEmpty) {
          final levelCode = parsed[primaryId];
          if (levelCode != null && levelCode.isNotEmpty) {
            level = AthleteFirestoreCodes.levelFirestoreToLabel(levelCode);
          }
        }
      }

      final note = sportOnboarding['otherSportNote'];
      if (note is String && note.trim().isNotEmpty) {
        otherSportNote = note.trim();
      }

      final lockedRaw = sportOnboarding['levelLocked'];
      if (lockedRaw is Map) {
        final parsedLocked = <String, bool>{};
        for (final entry in lockedRaw.entries) {
          final sportKey = entry.key.toString().trim();
          if (sportKey.isNotEmpty && entry.value == true) {
            parsedLocked[sportKey] = true;
          }
        }
        if (parsedLocked.isNotEmpty) {
          levelLocked = parsedLocked;
        }
      }
    }

    if (sportProfile is Map) {
      final profileLevel = sportProfile['level'];
      if (level.isEmpty && profileLevel is String && profileLevel.isNotEmpty) {
        level = AthleteFirestoreCodes.levelFirestoreToLabel(profileLevel);
      }
    }

    final isProfileComplete = data['isProfileComplete'] == true;
    final onboardingRaw = data['onboardingCompleted'];
    final onboardingCompleted = isProfileComplete ||
        (onboardingRaw is bool && onboardingRaw) ||
        (sportOnboarding is Map && sportOnboarding['completedAt'] != null);
    final birthDate = _readBirthDate(data['birthDate']);

    return AthleteProfile(
      id: doc.id,
      name: name,
      avatarUrl: resolvedPhotoUrl,
      coverPhotoUrl:
          (coverPhotoUrl != null && coverPhotoUrl.isNotEmpty) ? coverPhotoUrl : null,
      sport: sport,
      level: level,
      city: _resolveCity(data),
      state: _resolveState(data),
      phoneNumber: _resolvePhoneNumber(data),
      phoneVerified: data['phoneVerified'] == true,
      cpfCnpj: _digitsOnly(
        (data['cpfCnpj'] as String?) ?? (data['cpf'] as String?),
      ),
      bio: (data['bio'] as String?)?.trim().isNotEmpty == true
          ? data['bio'] as String
          : null,
      sports: sports,
      goals: goals,
      nickname: (data['nickname'] as String?)?.trim().isNotEmpty == true
          ? (data['nickname'] as String).trim()
          : null,
      birthDate: birthDate,
      gender: (data['gender'] as String?)?.trim().isNotEmpty == true
          ? (data['gender'] as String).trim()
          : null,
      primarySportFirestoreId: primarySportFirestoreId,
      secondarySportFirestoreIds: secondarySportFirestoreIds,
      otherSportNote: otherSportNote,
      onboardingCompleted: onboardingCompleted,
      isProfileComplete: isProfileComplete,
      useBiometric: data['useBiometric'] == true,
      levelsBySportFirestore: levelsBySportFirestore,
      levelLocked: levelLocked,
      notificationPreferences: AthleteNotificationPreferences.fromFirestore(
        data['notificationPreferences'],
      ),
      privacyPreferences: AthletePrivacyPreferences.fromFirestore(
        data['privacyPreferences'],
      ),
      publicProfileEnabled: _resolvePublicProfileEnabled(data),
      category: _readOptionalString(data['category']),
      lookingForPartner: data['lookingForPartner'] == true,
      gameObjective: _resolveGameObjective(data),
      lastActiveAt: _readTimestamp(data['lastActiveAt']),
      highlightPhotoUrls:
          _stringList(data['highlightPhotoUrls']).take(maxHighlightPhotos).toList(),
    );
  }

  static String? _readOptionalString(dynamic raw) {
    if (raw is! String) return null;
    final t = raw.trim();
    return t.isEmpty ? null : t;
  }

  static DateTime? _readTimestamp(dynamic raw) {
    if (raw is Timestamp) return raw.toDate();
    return null;
  }

  /// Aceita `birthDate` como string (`YYYY-MM-DD`, `dd/mm/aaaa`) ou [Timestamp].
  static String? _readBirthDate(dynamic raw) {
    if (raw is Timestamp) {
      final iso = calendarDateKey(raw.toDate());
      return AthleteFirestoreCodes.birthDateIsoToBr(iso) ?? iso;
    }
    if (raw is String) {
      final trimmed = raw.trim();
      if (trimmed.isEmpty) return null;
      return AthleteFirestoreCodes.birthDateIsoToBr(trimmed) ?? trimmed;
    }
    return null;
  }

  static String? _resolveGameObjective(Map<String, dynamic> data) {
    final direct = _readOptionalString(data['gameObjective']);
    if (direct != null) return direct;
    final onboarding = data['sportOnboarding'];
    if (onboarding is Map) {
      return _readOptionalString(onboarding['gameObjective']);
    }
    return null;
  }

  static bool _resolvePublicProfileEnabled(Map<String, dynamic> data) {
    final privacy = AthletePrivacyPreferences.fromFirestore(
      data['privacyPreferences'],
    );
    if (data['privacyPreferences'] is Map) {
      return privacy.publicProfileEnabled;
    }
    if (data['publicProfileEnabled'] is bool) {
      return data['publicProfileEnabled'] as bool;
    }
    return true;
  }

  /// Label `Cidade · UF` para exibição no perfil.
  String get locationLabel => BrLocationsData.formatLocationLabel(
        city: city,
        state: state ?? '',
      );

  static String? _resolvePhoneNumber(Map<String, dynamic> data) {
    for (final key in ['phoneNumber', 'phone', 'whatsapp', 'celular', 'mobile']) {
      final raw = data[key];
      if (raw is! String) continue;
      final trimmed = raw.trim();
      if (trimmed.isNotEmpty) return trimmed;
    }
    return null;
  }

  static String _resolveCity(Map<String, dynamic> data) {
    final cityField = (data['city'] as String?)?.trim() ?? '';
    final stateField = (data['state'] as String?)?.trim() ?? '';
    if (cityField.isEmpty) return '';
    if (stateField.isNotEmpty && !cityField.contains('·')) {
      return cityField;
    }
    return BrLocationsData.parseLegacyLocation(cityField).city;
  }

  static String? _resolveState(Map<String, dynamic> data) {
    final stateField = BrLocationsData.resolveStateSigla(
      (data['state'] as String?) ?? (data['uf'] as String?),
    );
    if (stateField.isNotEmpty) return stateField;
    final cityField = (data['city'] as String?)?.trim() ?? '';
    if (cityField.isEmpty) return null;
    final parsed = BrLocationsData.parseLegacyLocation(cityField);
    return parsed.state.isEmpty ? null : parsed.state;
  }

  static List<String> _stringList(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .map((e) => e?.toString().trim() ?? '')
        .where((s) => s.isNotEmpty)
        .toList();
  }

  static String? _digitsOnly(String? raw) {
    if (raw == null) return null;
    final d = raw.replaceAll(RegExp(r'\D'), '');
    if (d.length == 11 || d.length == 14) return d;
    return null;
  }

  Map<String, dynamic> toFirestore() {
    final primaryFs = primarySportFirestoreId ??
        _sportLabelToFirestoreId(sport);
    final levelFs = AthleteFirestoreCodes.levelLabelToFirestore(level);
    final birthIso =
        AthleteFirestoreCodes.birthDateBrToIso(birthDate) ?? birthDate;

    final levelsBySport = Map<String, String>.from(levelsBySportFirestore);
    final enrolledIds = <String>[
      if (primaryFs != null && primaryFs.isNotEmpty) primaryFs,
      ...secondarySportFirestoreIds,
    ];
    // AVISO (Task 4, escolha obrigatória): o `'iniciante_1'` abaixo é um
    // backstop defensivo pra docs LEGADOS — hoje nenhum fluxo do app deixa um
    // esporte matriculado chegar aqui sem `levelsBySport` já preenchido
    // (`AthleteSportsLevelsMapper.toProfile`/`enrollmentsFromDraft` sempre
    // grava o nível explícito escolhido no sheet de adicionar esporte).
    // `secondarySportFirestoreIds` também só populado por esse mesmo caminho
    // hoje — `AthleteOnboardingDraftNotifier.toggleOtherSport` existe mas não
    // tem NENHUM call site na presentation, então o onboarding nunca produz
    // esporte secundário. Se uma etapa de "outros esportes" for reintroduzida
    // no onboarding, ela precisa perguntar o nível de cada esporte
    // explicitamente (mesmo sheet/step desta task) — senão esse default
    // silencioso volta a valer pela porta dos fundos.
    for (final sportId in enrolledIds) {
      if (!levelsBySport.containsKey(sportId) || levelsBySport[sportId]!.isEmpty) {
        levelsBySport[sportId] =
            sportId == primaryFs && levelFs.isNotEmpty ? levelFs : 'iniciante_1';
      }
    }
    if (primaryFs != null &&
        primaryFs.isNotEmpty &&
        levelFs.isNotEmpty &&
        (levelsBySport[primaryFs] == null || levelsBySport[primaryFs]!.isEmpty)) {
      levelsBySport[primaryFs] = levelFs;
    }

    final sportOnboarding = <String, dynamic>{
      'version': AthleteFirestoreCodes.sportOnboardingVersion,
      if (onboardingCompleted) 'completedAt': FieldValue.serverTimestamp(),
      if (primaryFs != null && primaryFs.isNotEmpty) 'primarySportId': primaryFs,
      'secondarySportIds': secondarySportFirestoreIds,
      'levelsBySport': levelsBySport,
      'goals': goals,
      'otherSportNote': otherSportNote,
    };

    return <String, dynamic>{
      'fullName': name,
      // IMPORTANTE: `phoneNumber` NUNCA entra neste payload. As rules do
      // Firestore só aceitam `update` em `users/{uid}` quando o campo está
      // ausente ou idêntico ao já salvo, e proíbem qualquer valor no
      // `create` — quem grava é a Cloud Function `confirmPhoneVerification`,
      // a partir do telefone que o Firebase Phone Auth verificou por SMS
      // (anti-fraude: impede auto-declarar telefone sem comprovar posse).
      // Mesma restrição que já vale para `roles`, ver
      // `AthleteProfileRepository.saveProfile`.
      if (birthIso != null && birthIso.isNotEmpty) 'birthDate': birthIso,
      if (gender != null && gender!.isNotEmpty) 'gender': gender,
      if (nickname != null && nickname!.isNotEmpty) 'nickname': nickname,
      if (avatarUrl != null && avatarUrl!.isNotEmpty)
        'profilePhotoUrl': avatarUrl!.trim(),
      if (isProfileComplete) 'isProfileComplete': true,
      // Nível: `sportOnboarding.levelsBySport` é a ÚNICA escrita — os campos
      // legados `level` (label global) e `sportProfile.level` não são mais
      // gravados; docs antigos seguem legíveis pelos fallbacks do parse.
      'sportOnboarding': sportOnboarding,
      if (sport.trim().isNotEmpty) 'sport': sport.trim(),
      'sports': sports,
      'useBiometric': useBiometric,
      'city': city.trim(),
      if (state != null && state!.trim().isNotEmpty)
        'state': state!.trim().toUpperCase(),
      if (bio != null && bio!.trim().isNotEmpty) 'bio': bio!.trim(),
      if (coverPhotoUrl != null && coverPhotoUrl!.trim().isNotEmpty)
        'coverPhotoUrl': coverPhotoUrl!.trim(),
      if (cpfCnpj != null && cpfCnpj!.isNotEmpty) 'cpfCnpj': cpfCnpj,
      // Sempre grava o array (mesmo vazio): diferente de coverPhotoUrl, não
      // precisa de FieldValue.delete() para "esvaziar" — [] já sobrescreve.
      'highlightPhotoUrls': highlightPhotoUrls,
    };
  }

  static String? _sportLabelToFirestoreId(String label) {
    for (final entry in AthleteProfileOptions.sports) {
      if (entry == label) {
        return AthleteFirestoreCodes.sportAppToFirestore(
          _labelToAppSportId(label),
        );
      }
    }
    return null;
  }

  static String? _labelToAppSportId(String label) {
    const map = {
      'Vôlei de praia': 'beach_volleyball',
      'Vôlei de quadra': 'indoor_volleyball',
      'Futebol': 'football',
      'Basquete': 'basketball',
      'Tênis': 'tennis',
      'Beach tennis': 'beach_tennis',
      'Corrida': 'running',
      'Outros': 'other',
    };
    return map[label];
  }

  static const Object _copyWithUnset = Object();

  AthleteProfile copyWith({
    String? name,
    String? avatarUrl,
    String? coverPhotoUrl,
    String? sport,
    String? level,
    String? city,
    Object? state = _copyWithUnset,
    String? phoneNumber,
    bool? phoneVerified,
    String? cpfCnpj,
    String? bio,
    List<String>? sports,
    List<String>? goals,
    Object? nickname = _copyWithUnset,
    String? birthDate,
    String? gender,
    String? primarySportFirestoreId,
    List<String>? secondarySportFirestoreIds,
    String? otherSportNote,
    bool? onboardingCompleted,
    bool? isProfileComplete,
    bool? useBiometric,
    Map<String, String>? levelsBySportFirestore,
    Map<String, bool>? levelLocked,
    AthleteNotificationPreferences? notificationPreferences,
    AthletePrivacyPreferences? privacyPreferences,
    bool? publicProfileEnabled,
    Object? category = _copyWithUnset,
    bool? lookingForPartner,
    Object? gameObjective = _copyWithUnset,
    Object? lastActiveAt = _copyWithUnset,
    List<String>? highlightPhotoUrls,
    bool clearAvatar = false,
    bool clearCoverPhoto = false,
    bool clearPhone = false,
    bool clearBio = false,
  }) {
    return AthleteProfile(
      id: id,
      name: name ?? this.name,
      avatarUrl: clearAvatar ? null : (avatarUrl ?? this.avatarUrl),
      coverPhotoUrl: clearCoverPhoto
          ? null
          : (coverPhotoUrl ?? this.coverPhotoUrl),
      sport: sport ?? this.sport,
      level: level ?? this.level,
      city: city ?? this.city,
      state: identical(state, _copyWithUnset) ? this.state : state as String?,
      phoneNumber: clearPhone ? null : (phoneNumber ?? this.phoneNumber),
      phoneVerified: clearPhone ? false : (phoneVerified ?? this.phoneVerified),
      cpfCnpj: cpfCnpj ?? this.cpfCnpj,
      bio: clearBio ? null : (bio ?? this.bio),
      sports: sports ?? this.sports,
      goals: goals ?? this.goals,
      nickname: identical(nickname, _copyWithUnset)
          ? this.nickname
          : nickname as String?,
      birthDate: birthDate ?? this.birthDate,
      gender: gender ?? this.gender,
      primarySportFirestoreId:
          primarySportFirestoreId ?? this.primarySportFirestoreId,
      secondarySportFirestoreIds:
          secondarySportFirestoreIds ?? this.secondarySportFirestoreIds,
      otherSportNote: otherSportNote ?? this.otherSportNote,
      onboardingCompleted: onboardingCompleted ?? this.onboardingCompleted,
      isProfileComplete: isProfileComplete ?? this.isProfileComplete,
      useBiometric: useBiometric ?? this.useBiometric,
      levelsBySportFirestore:
          levelsBySportFirestore ?? this.levelsBySportFirestore,
      levelLocked: levelLocked ?? this.levelLocked,
      notificationPreferences:
          notificationPreferences ?? this.notificationPreferences,
      privacyPreferences: privacyPreferences ?? this.privacyPreferences,
      publicProfileEnabled:
          publicProfileEnabled ?? this.publicProfileEnabled,
      category: identical(category, _copyWithUnset)
          ? this.category
          : category as String?,
      lookingForPartner: lookingForPartner ?? this.lookingForPartner,
      gameObjective: identical(gameObjective, _copyWithUnset)
          ? this.gameObjective
          : gameObjective as String?,
      lastActiveAt: identical(lastActiveAt, _copyWithUnset)
          ? this.lastActiveAt
          : lastActiveAt as DateTime?,
      highlightPhotoUrls: highlightPhotoUrls ?? this.highlightPhotoUrls,
    );
  }
}
