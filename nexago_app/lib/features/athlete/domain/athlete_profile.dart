import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../../core/location/br_locations_data.dart';
import 'athlete_firestore_codes.dart';
import 'athlete_profile_options.dart';

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
    this.useBiometric = false,
    this.levelsBySportFirestore = const {},
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
  final bool useBiometric;
  /// Nível por esporte em `sportOnboarding.levelsBySport` (código FS → código nível).
  final Map<String, String> levelsBySportFirestore;

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
      onboardingCompleted: false,
    );
  }

  factory AthleteProfile.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final profilePhotoUrl = (data['profilePhotoUrl'] as String?)?.trim();
    final avatarUrl = (data['avatarUrl'] as String?)?.trim();
    final resolvedPhotoUrl = (profilePhotoUrl != null && profilePhotoUrl.isNotEmpty)
        ? profilePhotoUrl
        : ((avatarUrl != null && avatarUrl.isNotEmpty) ? avatarUrl : null);
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

    final birthRaw = (data['birthDate'] as String?)?.trim();
    final birthDate = birthRaw != null && birthRaw.isNotEmpty
        ? AthleteFirestoreCodes.birthDateIsoToBr(birthRaw) ?? birthRaw
        : null;

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
      phoneNumber: (data['phoneNumber'] as String?)?.trim().isNotEmpty == true
          ? data['phoneNumber'] as String
          : null,
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
      useBiometric: data['useBiometric'] == true,
      levelsBySportFirestore: levelsBySportFirestore,
    );
  }

  /// Label `Cidade · UF` para exibição no perfil.
  String get locationLabel => BrLocationsData.formatLocationLabel(
        city: city,
        state: state ?? '',
      );

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
    for (final sportId in enrolledIds) {
      if (!levelsBySport.containsKey(sportId) || levelsBySport[sportId]!.isEmpty) {
        levelsBySport[sportId] =
            sportId == primaryFs && levelFs.isNotEmpty ? levelFs : 'iniciante';
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
      if (phoneNumber != null && phoneNumber!.trim().isNotEmpty)
        'phoneNumber': phoneNumber!.trim(),
      if (birthIso != null && birthIso.isNotEmpty) 'birthDate': birthIso,
      if (gender != null && gender!.isNotEmpty) 'gender': gender,
      if (nickname != null && nickname!.isNotEmpty) 'nickname': nickname,
      if (avatarUrl != null && avatarUrl!.isNotEmpty)
        'profilePhotoUrl': avatarUrl!.trim(),
      'isProfileComplete': onboardingCompleted,
      'sportOnboarding': sportOnboarding,
      if (sport.trim().isNotEmpty) 'sport': sport.trim(),
      if (level.trim().isNotEmpty) 'level': level.trim(),
      'sports': sports,
      'sportProfile': <String, dynamic>{
        if (levelFs.isNotEmpty) 'level': levelFs,
      },
      'useBiometric': useBiometric,
      'city': city.trim(),
      if (state != null && state!.trim().isNotEmpty)
        'state': state!.trim().toUpperCase(),
      if (bio != null && bio!.trim().isNotEmpty) 'bio': bio!.trim(),
      if (coverPhotoUrl != null && coverPhotoUrl!.trim().isNotEmpty)
        'coverPhotoUrl': coverPhotoUrl!.trim(),
      if (cpfCnpj != null && cpfCnpj!.isNotEmpty) 'cpfCnpj': cpfCnpj,
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
    bool? useBiometric,
    Map<String, String>? levelsBySportFirestore,
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
      useBiometric: useBiometric ?? this.useBiometric,
      levelsBySportFirestore:
          levelsBySportFirestore ?? this.levelsBySportFirestore,
    );
  }
}
