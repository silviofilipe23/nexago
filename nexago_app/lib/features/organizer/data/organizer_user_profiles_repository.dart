import 'package:cloud_firestore/cloud_firestore.dart';

import 'package:nexago_app/core/profiles/app_user_profile.dart';

class OrganizerUserProfilesRepository {
  OrganizerUserProfilesRepository(this._firestore);

  final FirebaseFirestore _firestore;
  final Map<String, AppUserProfile> _cache = {};

  CollectionReference<Map<String, dynamic>> get _users =>
      _firestore.collection('public_profiles');

  Future<AppUserProfile?> getProfile(String uid) async {
    final id = uid.trim();
    if (id.isEmpty) return null;
    final cached = _cache[id];
    if (cached != null) return cached;
    final snap = await _users.doc(id).get();
    if (!snap.exists) return null;
    final profile = AppUserProfile.fromFirestore(snap);
    _cache[id] = profile;
    return profile;
  }

  Future<Map<String, AppUserProfile>> batchGetProfiles(
    Iterable<String> uids,
  ) async {
    final unique = uids.map((u) => u.trim()).where((u) => u.isNotEmpty).toSet();
    if (unique.isEmpty) return {};

    final result = <String, AppUserProfile>{};
    final missing = <String>[];

    for (final uid in unique) {
      final cached = _cache[uid];
      if (cached != null) {
        result[uid] = cached;
      } else {
        missing.add(uid);
      }
    }

    if (missing.isEmpty) return result;

    const chunkSize = 10;
    for (var i = 0; i < missing.length; i += chunkSize) {
      final chunk = missing.skip(i).take(chunkSize).toList();
      final snaps = await Future.wait(chunk.map(_users.doc).map((r) => r.get()));
      for (final snap in snaps) {
        if (!snap.exists) continue;
        final profile = AppUserProfile.fromFirestore(snap);
        _cache[snap.id] = profile;
        result[snap.id] = profile;
      }
    }

    return result;
  }

  void clearCache() => _cache.clear();
}
