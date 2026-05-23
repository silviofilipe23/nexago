/// Preferências de privacidade em `users/{uid}.privacyPreferences`.
enum AthleteProfileVisibility {
  public,
  friends,
  private;

  String get firestoreValue => switch (this) {
        AthleteProfileVisibility.public => 'public',
        AthleteProfileVisibility.friends => 'friends',
        AthleteProfileVisibility.private => 'private',
      };

  static AthleteProfileVisibility fromFirestore(String? raw) {
    switch (raw?.trim()) {
      case 'friends':
        return AthleteProfileVisibility.friends;
      case 'private':
        return AthleteProfileVisibility.private;
      case 'public':
      default:
        return AthleteProfileVisibility.public;
    }
  }
}

class AthletePrivacyShowOthers {
  const AthletePrivacyShowOthers({
    this.achievementsAndLevel = true,
    this.upcomingBookings = false,
    this.frequentPartners = true,
  });

  final bool achievementsAndLevel;
  final bool upcomingBookings;
  final bool frequentPartners;

  factory AthletePrivacyShowOthers.fromFirestore(dynamic raw) {
    if (raw is! Map) return const AthletePrivacyShowOthers();
    final map = Map<String, dynamic>.from(raw);
    return AthletePrivacyShowOthers(
      achievementsAndLevel: map['achievementsAndLevel'] as bool? ?? true,
      upcomingBookings: map['upcomingBookings'] as bool? ?? false,
      frequentPartners: map['frequentPartners'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toFirestore() => <String, dynamic>{
        'achievementsAndLevel': achievementsAndLevel,
        'upcomingBookings': upcomingBookings,
        'frequentPartners': frequentPartners,
      };

  AthletePrivacyShowOthers copyWith({
    bool? achievementsAndLevel,
    bool? upcomingBookings,
    bool? frequentPartners,
  }) {
    return AthletePrivacyShowOthers(
      achievementsAndLevel:
          achievementsAndLevel ?? this.achievementsAndLevel,
      upcomingBookings: upcomingBookings ?? this.upcomingBookings,
      frequentPartners: frequentPartners ?? this.frequentPartners,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is AthletePrivacyShowOthers &&
        other.achievementsAndLevel == achievementsAndLevel &&
        other.upcomingBookings == upcomingBookings &&
        other.frequentPartners == frequentPartners;
  }

  @override
  int get hashCode =>
      Object.hash(achievementsAndLevel, upcomingBookings, frequentPartners);
}

class AthletePrivacyPreferences {
  const AthletePrivacyPreferences({
    this.profileVisibility = AthleteProfileVisibility.public,
    this.showOthers = const AthletePrivacyShowOthers(),
  });

  final AthleteProfileVisibility profileVisibility;
  final AthletePrivacyShowOthers showOthers;

  static const AthletePrivacyPreferences defaults = AthletePrivacyPreferences();

  factory AthletePrivacyPreferences.fromFirestore(dynamic raw) {
    if (raw is! Map) return defaults;
    final map = Map<String, dynamic>.from(raw);
    return AthletePrivacyPreferences(
      profileVisibility: AthleteProfileVisibility.fromFirestore(
        map['profileVisibility'] as String?,
      ),
      showOthers: AthletePrivacyShowOthers.fromFirestore(map['showOthers']),
    );
  }

  /// Resolve `publicProfileEnabled` a partir da visibilidade (friends = público na v1).
  bool get publicProfileEnabled => profileVisibility != AthleteProfileVisibility.private;

  bool get isProfilePrivate => profileVisibility == AthleteProfileVisibility.private;

  String get visibilitySettingsLabel => switch (profileVisibility) {
        AthleteProfileVisibility.public => 'Perfil público',
        AthleteProfileVisibility.friends => 'Apenas amigos',
        AthleteProfileVisibility.private => 'Perfil privado',
      };

  Map<String, dynamic> toFirestore() => <String, dynamic>{
        'profileVisibility': profileVisibility.firestoreValue,
        'showOthers': showOthers.toFirestore(),
      };

  AthletePrivacyPreferences copyWith({
    AthleteProfileVisibility? profileVisibility,
    AthletePrivacyShowOthers? showOthers,
  }) {
    return AthletePrivacyPreferences(
      profileVisibility: profileVisibility ?? this.profileVisibility,
      showOthers: showOthers ?? this.showOthers,
    );
  }

  bool isDirtyComparedTo(AthletePrivacyPreferences other) {
    return profileVisibility != other.profileVisibility ||
        showOthers != other.showOthers;
  }

  @override
  bool operator ==(Object other) {
    return other is AthletePrivacyPreferences &&
        other.profileVisibility == profileVisibility &&
        other.showOthers == showOthers;
  }

  @override
  int get hashCode => Object.hash(profileVisibility, showOthers);
}
