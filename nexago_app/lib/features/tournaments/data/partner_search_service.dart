import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/search/search_keywords.dart';
import '../../../core/auth/user_roles.dart';
import '../domain/app_user_profile.dart';
import '../domain/partner_search_logic.dart';
import 'users_repository.dart';

class PartnerSearchService {
  PartnerSearchService(this._users);

  final UsersRepository _users;

  static const int initialBrowseLimit = 2000;
  static const int searchResultLimit = 25;

  Future<List<AppUserProfile>> listPartners({
    required String currentUserId,
    required String? categoryGenderType,
    int browseLimit = initialBrowseLimit,
  }) async {
    var users = await _users.listAthleteProfiles(maxResults: browseLimit);
    users = users.where((user) => user.uid != currentUserId).toList();
    users = filterPartnersByCategoryGender(users, categoryGenderType);
    return sortPartnersForDisplay(users);
  }

  Future<List<AppUserProfile>> searchPartners({
    required String currentUserId,
    required String? categoryGenderType,
    required String query,
    int max = searchResultLimit,
  }) async {
    final trimmed = query.trim();
    if (!isSearchTermLongEnough(trimmed)) {
      return listPartners(
        currentUserId: currentUserId,
        categoryGenderType: categoryGenderType,
      );
    }

    var users = await _users.searchUsersByNicknameOrName(
      trimmed,
      max: max,
      roleFilter: kAthleteAppRole,
    );
    users = users.where((user) => user.uid != currentUserId).toList();
    users = filterPartnersByCategoryGender(users, categoryGenderType);
    return sortPartnersForDisplay(users);
  }
}

final partnerSearchServiceProvider = Provider<PartnerSearchService>((ref) {
  return PartnerSearchService(ref.watch(usersRepositoryProvider));
});
