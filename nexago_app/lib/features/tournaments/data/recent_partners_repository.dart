import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arenas_providers.dart';
import '../domain/app_user_profile.dart';
import '../domain/partner_search_logic.dart';
import 'nexago_artifacts_paths.dart';
import 'users_repository.dart';

class RecentPartnersRepository {
  RecentPartnersRepository(this._firestore, this._users);

  final FirebaseFirestore _firestore;
  final UsersRepository _users;

  CollectionReference<Map<String, dynamic>> get _inscriptions =>
      _firestore.collection(NexagoArtifactsPaths.inscriptionsCollection());

  CollectionReference<Map<String, dynamic>> get _teams =>
      _firestore.collection(NexagoArtifactsPaths.teamsCollection());

  Future<List<AppUserProfile>> loadRecentPartners({
    required String currentUserId,
    required String? categoryGenderType,
    int maxProfiles = 12,
  }) async {
    if (currentUserId.isEmpty) return [];

    final partnerUids = <String>{};
    final inscriptions = await _inscriptions.get();

    for (final doc in inscriptions.docs) {
      final data = doc.data();
      final teamId = data['teamId'] as String?;
      if (teamId == null || teamId.isEmpty) continue;

      final teamSnap = await _teams.doc(teamId).get();
      if (!teamSnap.exists) continue;
      final team = teamSnap.data()!;
      final p1 = team['player1Id'] as String?;
      final p2 = team['player2Id'] as String?;
      if (p1 == currentUserId && p2 != null && p2.isNotEmpty) {
        partnerUids.add(p2);
      } else if (p2 == currentUserId && p1 != null && p1.isNotEmpty) {
        partnerUids.add(p1);
      }
    }

    final profiles = <AppUserProfile>[];
    for (final uid in partnerUids) {
      if (profiles.length >= maxProfiles) break;
      final profile = await _users.getUserById(uid);
      if (profile == null) continue;
      final hasName = (profile.fullName?.isNotEmpty == true) ||
          (profile.email?.isNotEmpty == true);
      if (!hasName) continue;
      profiles.add(profile);
    }

    return filterPartnersByCategoryGender(profiles, categoryGenderType);
  }
}

final recentPartnersRepositoryProvider = Provider<RecentPartnersRepository>((
  ref,
) {
  return RecentPartnersRepository(
    ref.watch(firestoreProvider),
    ref.watch(usersRepositoryProvider),
  );
});
