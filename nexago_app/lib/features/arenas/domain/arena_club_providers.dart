import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import '../data/arena_clubs_repository.dart';
import 'arena_club_session.dart';

final arenaClubsRepositoryProvider = Provider<ArenaClubsRepository>((ref) {
  return ArenaClubsRepository(ref.watch(firestoreProvider));
});

/// Próximas sessões de Clubinho abertas da arena (tempo real).
final arenaUpcomingClubSessionsProvider = StreamProvider.autoDispose
    .family<List<ArenaClubSession>, String>((ref, arenaId) {
  return ref
      .watch(arenaClubsRepositoryProvider)
      .watchUpcomingClubSessions(arenaId);
});

/// Uma sessão de Clubinho (tempo real).
final clubSessionProvider = StreamProvider.autoDispose
    .family<ArenaClubSession?, String>((ref, sessionId) {
  return ref.watch(arenaClubsRepositoryProvider).watchClubSession(sessionId);
});

/// Participantes da sessão em ordem de entrada (tempo real).
final clubSessionParticipantsProvider = StreamProvider.autoDispose
    .family<List<ClubParticipant>, String>((ref, sessionId) {
  return ref
      .watch(arenaClubsRepositoryProvider)
      .watchClubParticipants(sessionId);
});

/// Minha inscrição na sessão (`null` se nunca entrei / sem login).
final myClubParticipantProvider = StreamProvider.autoDispose
    .family<ClubParticipant?, String>((ref, sessionId) {
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) {
    return Stream<ClubParticipant?>.value(null);
  }
  return ref
      .watch(arenaClubsRepositoryProvider)
      .watchMyParticipant(sessionId, uid);
});

/// Minhas participações em clubinhos a partir de ontem (agenda / meus jogos).
final myClubParticipationsProvider =
    StreamProvider.autoDispose<List<ClubParticipant>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) {
    return Stream<List<ClubParticipant>>.value(const []);
  }
  return ref
      .watch(arenaClubsRepositoryProvider)
      .watchMyClubParticipations(uid);
});
