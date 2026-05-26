import 'app_user_profile.dart';
import 'tournament_registration_logic.dart';

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

List<AppUserProfile> filterPartnersByCategoryGender(
  List<AppUserProfile> users,
  String? categoryGenderType,
) {
  final type = categoryGenderType?.trim() ?? '';
  if (type != 'Masculino' && type != 'Feminino') {
    return users;
  }
  return users.where((u) {
    final g = u.gender?.trim();
    return g != null && g.isNotEmpty && g == type;
  }).toList();
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
