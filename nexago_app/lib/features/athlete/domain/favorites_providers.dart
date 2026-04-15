import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../data/favorites_service.dart';

final favoritesServiceProvider = Provider<FavoritesService>((ref) {
  return FavoritesService(ref.watch(firestoreProvider));
});

final favoriteArenaIdsProvider =
    StreamProvider.autoDispose<List<String>>((ref) {
  final userId = ref.watch(authProvider).valueOrNull?.uid;
  if (userId == null || userId.isEmpty) {
    return Stream<List<String>>.value(const []);
  }
  return ref
      .watch(firestoreProvider)
      .collection('users')
      .doc(userId)
      .collection('favorites')
      .snapshots()
      .map((snap) {
    final ids = <String>[];
    for (final doc in snap.docs) {
      final raw = doc.data()['arenaId'];
      final id = raw is String && raw.trim().isNotEmpty ? raw.trim() : doc.id;
      ids.add(id);
    }
    return ids;
  });
});
