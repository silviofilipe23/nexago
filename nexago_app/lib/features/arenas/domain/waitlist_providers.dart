import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../data/waitlist_repository.dart';
import 'arena_booking_waitlist_entry.dart';
import 'arenas_providers.dart';

final waitlistRepositoryProvider = Provider<WaitlistRepository>((ref) {
  return WaitlistRepository(ref.watch(firestoreProvider));
});

/// Entradas de lista de espera do atleta logado (`arenaBookingWaitlist`).
final myWaitlistStreamProvider =
    StreamProvider.autoDispose<List<ArenaBookingWaitlistEntry>>((ref) {
  final user = ref.watch(authProvider).valueOrNull;
  if (user == null) {
    return Stream.value(const []);
  }
  return ref.watch(waitlistRepositoryProvider).watchMyWaitlist(user.uid);
});
