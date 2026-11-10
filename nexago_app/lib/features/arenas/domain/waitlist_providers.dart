import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../data/waitlist_repository.dart';
import 'arena_booking_waitlist_entry.dart';
import 'arenas_providers.dart';
import 'waitlist_view_logic.dart';

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

/// Filas do atleta separadas para a tela "Listas de espera" e o ícone da Agenda.
/// O relógio é lido na hora: quem mostra contagem regressiva reconstrói a cada 30 s.
final myWaitlistViewProvider = Provider.autoDispose<WaitlistView>((ref) {
  final entries = ref.watch(myWaitlistStreamProvider).valueOrNull;
  if (entries == null) return WaitlistView.empty;
  return buildWaitlistView(entries, DateTime.now());
});
