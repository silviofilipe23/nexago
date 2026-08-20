import 'package:nexago_app/core/profiles/app_user_profile.dart';

export 'package:nexago_app/core/profiles/app_user_profile.dart'
    show isPartnerListableProfile, comparePartnersForDisplay, sortPartnersForDisplay;
export 'package:nexago_app/core/search/search_keywords.dart' show nicknameSearchPrefixes;
import 'tournament_detail_logic.dart';
import 'tournament_discovery_models.dart';
import 'tournament_registration_logic.dart';

/// Valor de gênero usado no filtro de parceiros (`genderType` ou nome da
/// categoria).
///
/// Categoria de EQUIPE (trio+) não se descreve por `genderType` — quem manda é
/// a composição. Só equipe de gênero único filtra; livre e misto exato deixam
/// passar, porque a composição completa é conta do backend, que valida elenco
/// mais convites pendentes. O nome também não pode virar filtro aqui: uma
/// "Quarteto Masculino e Feminino" livre esconderia metade dos candidatos.
String categoryGenderForPartnerFilter(TournamentCategoryOffer offer) {
  if (offer.isTeamCategory) {
    if (offer.genderFree) return 'Misto';
    final men = offer.genderCompositionMen;
    final women = offer.genderCompositionWomen;
    if (men != null && women == 0) return 'Masculino';
    if (women != null && men == 0) return 'Feminino';
    return 'Misto';
  }
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

  // SEM gênero no perfil (vazio) aparece na busca — sumir em silêncio deixava
  // o convidante sem saber que o parceiro existe mas está com cadastro
  // incompleto. O card avisa ([partnerGenderPendencyLabel]) e o aceite valida
  // no servidor. Declarado que não casa (inclui "Outro") continua fora.
  final raw = profileGender?.trim() ?? '';
  if (raw.isEmpty) return true;

  final profileTag = genderTagFromText(raw);
  if (profileTag == null) return false;
  return profileTag == categoryTag;
}

/// Rótulo de pendência pro card do candidato: categoria de gênero fixo com
/// atleta sem gênero no perfil. `null` quando não há o que avisar.
String? partnerGenderPendencyLabel(
  AppUserProfile profile,
  String? categoryGenderType,
) {
  final categoryTag = genderTagFromText(categoryGenderType ?? '');
  if (categoryTag == null || categoryTag == 'MISTO') return null;
  if ((profile.gender?.trim() ?? '').isNotEmpty) return null;
  return 'Sem gênero no perfil';
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
