import 'package:cloud_firestore/cloud_firestore.dart';

import '../search/search_keywords.dart';
import 'app_user_profile.dart';

/// Documento de `public_profiles` do jeito que a busca precisa dele: o perfil
/// mapeado, o texto pesquisável (nome/apelido/`keywords`) e a flag de papel
/// crua — os três vêm da MESMA leitura, então filtrar e ranquear no client não
/// custa round-trip nenhum.
class AthleteSearchDoc {
  const AthleteSearchDoc({
    required this.profile,
    required this.searchable,
    required this.hasAthleteRoleFlag,
    this.hasOrganizerRoleFlag = false,
  });

  final AppUserProfile profile;
  final SearchableProfileText searchable;
  final bool hasAthleteRoleFlag;
  final bool hasOrganizerRoleFlag;

  factory AthleteSearchDoc.fromMap(String uid, Map<String, dynamic> data) {
    final keywords = data['keywords'];
    return AthleteSearchDoc(
      profile: AppUserProfile.fromMap(uid, data),
      searchable: SearchableProfileText(
        fullName: _str(data['fullName']) ?? _str(data['name']),
        nickname: _str(data['nickname']),
        keywords: keywords is List ? keywords.whereType<String>().toList() : const [],
      ),
      hasAthleteRoleFlag: data['hasAthleteRole'] == true,
      hasOrganizerRoleFlag: data['hasOrganizerRole'] == true,
    );
  }

  factory AthleteSearchDoc.fromSnapshot(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    return AthleteSearchDoc.fromMap(doc.id, doc.data());
  }

  static String? _str(dynamic v) {
    if (v is! String) return null;
    final t = v.trim();
    return t.isEmpty ? null : t;
  }
}

/// Aplica ao resultado da consulta o que o Firestore não faz: o `AND` dos
/// tokens que sobraram da âncora e a ordem por relevância.
///
/// Quando nenhum perfil casa com o termo inteiro, devolve os que casaram com a
/// âncora — quem digitou "joao souza" e não tem João Souza na base vê os Souza
/// em vez de uma tela vazia.
List<AppUserProfile> rankAthleteSearchResults(
  List<AthleteSearchDoc> docs,
  List<String> tokens, {
  required int max,
}) {
  return rankProfileSearchResults(
    docs,
    tokens,
    max: max,
    hasRole: (d) => d.hasAthleteRoleFlag || appUserHasAthleteRole(d.profile),
  );
}

/// Mesmo tratamento para qualquer papel (o painel do organizador usa o mesmo
/// índice `keywords` sobre `hasOrganizerRole`).
List<AppUserProfile> rankProfileSearchResults(
  List<AthleteSearchDoc> docs,
  List<String> tokens, {
  required int max,
  required bool Function(AthleteSearchDoc) hasRole,
}) {
  final candidates = docs
      .where(hasRole)
      .where((d) => isPartnerListableProfile(d.profile))
      .toList();
  if (candidates.isEmpty) return const [];

  final strict = candidates
      .where((d) => profileMatchesSearchTokens(d.searchable, tokens))
      .toList();
  final chosen = strict.isNotEmpty ? strict : candidates;

  chosen.sort((a, b) {
    final scoreCmp = searchRelevanceScore(a.searchable, tokens)
        .compareTo(searchRelevanceScore(b.searchable, tokens));
    if (scoreCmp != 0) return scoreCmp;
    return comparePartnersForDisplay(a.profile, b.profile);
  });

  return chosen.take(max).map((d) => d.profile).toList();
}
