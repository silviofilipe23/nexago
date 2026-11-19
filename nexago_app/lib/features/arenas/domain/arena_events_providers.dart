import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../organizer_public_profile/domain/organizer_event.dart';
import '../data/arena_events_repository.dart';

final arenaEventsRepositoryProvider = Provider<ArenaEventsRepository>((ref) {
  return ArenaEventsRepository(ref.watch(firestoreProvider));
});

/// Eventos listados que acontecem na arena (próximos e realizados).
final arenaEventsProvider = StreamProvider.autoDispose
    .family<List<OrganizerEvent>, String>((ref, arenaId) {
  return ref.watch(arenaEventsRepositoryProvider).watchEvents(arenaId);
});

/// Quantos próximos eventos o perfil da arena mostra.
const int kArenaEventsPreviewCount = 3;
