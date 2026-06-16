import 'app_user_profile.dart';
import 'tournament_detail_logic.dart';
import 'tournament_discovery_models.dart';
import 'tournament_registration_logic.dart';

/// Valor de gênero usado no filtro de parceiros (`genderType` ou nome da categoria).
String categoryGenderForPartnerFilter(TournamentCategoryOffer offer) {
  final type = offer.genderType.trim();
  if (type.isNotEmpty) return type;
  return offer.name;
}

List<AppUserProfile> filterPartnersByCategoryGender(
  List<AppUserProfile> users,
  String? categoryGenderType,
) {
  final categoryTag = genderTagFromText(categoryGenderType ?? '');
  if (categoryTag == null || categoryTag == 'MISTO') return users;
  return users
      .where((u) => matchesCategoryGender(u.gender, categoryGenderType))
      .toList();
}

bool matchesCategoryGender(String? profileGender, String? categoryGenderType) {
  final categoryTag = genderTagFromText(categoryGenderType ?? '');
  if (categoryTag == null || categoryTag == 'MISTO') return true;

  final profileTag = genderTagFromText(profileGender ?? '');
  if (profileTag == null) return false;
  return profileTag == categoryTag;
}

/// Prefixos para busca case-insensitive de `nickname` no Firestore.
List<String> nicknameSearchPrefixes(String raw) {
  final v = raw.trim();
  if (v.isEmpty) return const [];
  if (v.length == 1) {
    return [v, v.toLowerCase(), v.toUpperCase()];
  }
  final lower = v.toLowerCase();
  final title = '${v[0].toUpperCase()}${v.substring(1).toLowerCase()}';
  return {v, lower, v.toUpperCase(), title}.toList();
}

TournamentRegistrationPartnerCandidate partnerCandidateFromProfile(
  AppUserProfile profile, {
  String? tagLabel,
}) {
  final secondary = appUserSecondaryLine(profile);
  final location = _locationLabel(profile);
  final rankParts = <String>[];
  if (secondary != null && secondary.isNotEmpty) {
    rankParts.add(secondary);
  }
  if (location != null) rankParts.add(location);

  return TournamentRegistrationPartnerCandidate(
    userId: profile.uid,
    initials: appUserInitials(profile),
    name: appUserDisplayName(profile),
    rankLabel: rankParts.isEmpty ? 'Atleta NexaGO' : rankParts.join(' · '),
    tagLabel: tagLabel,
    avatarUrl: profile.profilePhotoUrl,
  );
}

String? _locationLabel(AppUserProfile profile) {
  final city = profile.city?.trim();
  final state = profile.state?.trim();
  if (city != null && city.isNotEmpty && state != null && state.isNotEmpty) {
    return '$city, $state';
  }
  return city ?? state;
}

bool isPartnerListableProfile(AppUserProfile profile) {
  return appUserDisplayName(profile).trim().isNotEmpty;
}

int comparePartnersForDisplay(AppUserProfile a, AppUserProfile b) {
  final nameCmp = appUserDisplayName(a)
      .toLowerCase()
      .compareTo(appUserDisplayName(b).toLowerCase());
  if (nameCmp != 0) return nameCmp;
  return a.uid.compareTo(b.uid);
}

List<AppUserProfile> sortPartnersForDisplay(List<AppUserProfile> users) {
  final sorted = [...users]..sort(comparePartnersForDisplay);
  return sorted;
}

List<AppUserProfile> filterPartnersByQuery(
  List<AppUserProfile> users,
  String query,
) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return users;
  return users.where((user) {
    for (final raw in [user.nickname, user.fullName, user.email]) {
      var value = raw?.trim().toLowerCase();
      if (value == null || value.isEmpty) continue;
      if (value.startsWith('@')) {
        value = value.substring(1).trim();
      }
      if (value.contains(q)) {
        return true;
      }
    }
    return false;
  }).toList();
}
