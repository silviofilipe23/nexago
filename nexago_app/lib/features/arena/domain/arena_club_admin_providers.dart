import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../../arenas/domain/arena_club_session.dart';
import '../data/arena_club_service.dart';
import 'arena_club.dart';
import 'arena_schedule_providers.dart';

final arenaClubServiceProvider = Provider<ArenaClubService>((ref) {
  return ArenaClubService(ref.watch(firestoreProvider));
});

/// Clubinhos da arena gerida (tempo real, ativos primeiro).
final managedArenaClubsProvider =
    StreamProvider.autoDispose<List<ArenaClub>>((ref) {
  final arenaAsync = ref.watch(managedArenaIdProvider);
  return arenaAsync.when(
    data: (arenaId) {
      if (arenaId == null || arenaId.isEmpty) {
        return Stream<List<ArenaClub>>.value(const []);
      }
      return ref.watch(arenaClubServiceProvider).watchClubs(arenaId);
    },
    loading: () => Stream<List<ArenaClub>>.value(const []),
    error: (_, __) => Stream<List<ArenaClub>>.value(const []),
  );
});

/// Um clubinho (tempo real).
final arenaClubProvider =
    StreamProvider.autoDispose.family<ArenaClub?, String>((ref, clubId) {
  return ref.watch(arenaClubServiceProvider).watchClub(clubId);
});

/// Próximas sessões do clubinho a partir de hoje (tempo real).
final arenaClubSessionsProvider = StreamProvider.autoDispose
    .family<List<ArenaClubSession>, String>((ref, clubId) {
  return ref.watch(arenaClubServiceProvider).watchClubSessions(clubId);
});

/// Participantes de uma sessão (visão gestor, tempo real).
final arenaClubSessionParticipantsProvider = StreamProvider.autoDispose
    .family<List<ClubParticipant>, String>((ref, sessionId) {
  return ref.watch(arenaClubServiceProvider).watchClubParticipants(sessionId);
});

/// Sessão do clubinho (visão gestor, tempo real).
final arenaClubSessionDocProvider = StreamProvider.autoDispose
    .family<ArenaClubSession?, String>((ref, sessionId) {
  final firestore = ref.watch(firestoreProvider);
  final id = sessionId.trim();
  if (id.isEmpty) return Stream<ArenaClubSession?>.value(null);
  return firestore
      .collection(ArenaClubService.sessionsCollection)
      .doc(id)
      .snapshots()
      .map((doc) => doc.exists ? ArenaClubSession.fromFirestore(doc) : null);
});
