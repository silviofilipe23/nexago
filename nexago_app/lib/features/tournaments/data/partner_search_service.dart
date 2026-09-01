import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';

import '../../../core/search/search_keywords.dart';
import '../../../core/auth/user_roles.dart';
import '../domain/partner_search_logic.dart';

/// Mínimo de letras para a busca de parceiro disparar.
///
/// LOCAL de propósito: `kSearchMinPrefixLength` (2) vale para arena, ligas,
/// equipes e torneios, e é o mesmo número que o gerador de `keywords` usa para
/// montar os prefixos gravados nos perfis. Subir a constante global quebraria
/// o índice, cujo backfill em `users` nunca rodou.
const int kPartnerSearchMinQueryLength = 3;

/// Conta sobre o termo NORMALIZADO: acento e pontuação não valem letra, então
/// `J.R` vira `jr` e continua insuficiente.
bool isPartnerQueryLongEnough(String raw) {
  return normalizeSearchTerm(raw).length >= kPartnerSearchMinQueryLength;
}

class PartnerSearchService {
  PartnerSearchService(this._users);

  final UsersRepository _users;

  /// Quantos a tela mostra. O pedido de produto é "no máximo 10 por pesquisa".
  static const int kDisplayLimit = 10;

  /// Quantos o repositório devolve. Pedir 15 para exibir 10 dá folga ao filtro
  /// de gênero da categoria, que roda DEPOIS: cortar em 10 antes do filtro
  /// deixava 4 ou 5 numa categoria de gênero fixo. O repositório lê
  /// `max × 4` documentos (teto 100) — 15 significa 60, contra os 100 de antes.
  static const int kFetchLimit = 15;

  /// Busca por nome ou @. Abaixo de [kPartnerSearchMinQueryLength] devolve
  /// VAZIO — a tela não busca a cada tecla curta.
  Future<List<AppUserProfile>> searchPartners({
    required String currentUserId,
    required String? categoryGenderType,
    required String query,
    int max = kFetchLimit,
  }) async {
    final trimmed = query.trim();
    if (!isPartnerQueryLongEnough(trimmed)) return const [];

    var users = await _users.searchUsersByNicknameOrName(
      trimmed,
      max: max,
      roleFilter: kAthleteAppRole,
    );
    users = users.where((user) => user.uid != currentUserId).toList();
    users = filterPartnersByCategoryGender(users, categoryGenderType);
    final sorted = sortPartnersForDisplay(users);
    return sorted.length > kDisplayLimit
        ? sorted.sublist(0, kDisplayLimit)
        : sorted;
  }
}

final partnerSearchServiceProvider = Provider<PartnerSearchService>((ref) {
  return PartnerSearchService(ref.watch(usersRepositoryProvider));
});
