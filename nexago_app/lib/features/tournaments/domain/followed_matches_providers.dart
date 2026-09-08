import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import '../data/followed_matches_repository.dart';
import 'followed_match.dart';

final followedMatchesRepositoryProvider = Provider<FollowedMatchesRepository>(
  (ref) => FollowedMatchesRepository(
    ref.watch(firestoreProvider),
    FirebaseMessaging.instance,
  ),
);

/// Partidas que o atleta segue, mais recentes primeiro. Vazio sem sessão.
final followedMatchesProvider =
    StreamProvider.autoDispose<List<FollowedMatch>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
  if (uid.isEmpty) return Stream.value(const []);
  return ref.watch(followedMatchesRepositoryProvider).watch(uid);
});

/// Se esta partida específica está sendo seguida — o que o botão observa.
final isFollowingMatchProvider =
    Provider.autoDispose.family<bool, String>((ref, matchId) {
  final followed = ref.watch(followedMatchesProvider).valueOrNull;
  if (followed == null) return false;
  return followed.any((match) => match.matchId == matchId.trim());
});
