import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/app_user_profile.dart';
import '../domain/partner_search_logic.dart';
import 'users_repository.dart';

class PartnerSearchService {
  PartnerSearchService(this._users);

  final UsersRepository _users;

  Future<List<AppUserProfile>> searchPartner({
    required String term,
    required String currentUserId,
    required String? categoryGenderType,
  }) async {
    if (term.trim().length < 2) return [];

    final strictGender = categoryGenderType == 'Masculino' ||
        categoryGenderType == 'Feminino';
    final fetchMax = strictGender ? 32 : 12;

    var users = await _users.searchUsersByNicknameOrName(
      term.trim(),
      max: fetchMax,
      roleFilter: 'athlete',
    );

    users = users.where((u) => u.uid != currentUserId).toList();
    users = filterPartnersByCategoryGender(users, categoryGenderType);
    return users.take(10).toList();
  }
}

final partnerSearchServiceProvider = Provider<PartnerSearchService>((ref) {
  return PartnerSearchService(ref.watch(usersRepositoryProvider));
});
