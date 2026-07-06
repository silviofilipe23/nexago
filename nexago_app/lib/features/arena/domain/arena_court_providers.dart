import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arena_court.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../../arenas/domain/booking_providers.dart';
import '../../arenas/domain/slots_providers.dart';
import '../data/court_service.dart';
import 'arena_manager_booking.dart';
import 'arena_schedule_providers.dart';

final courtServiceProvider = Provider<CourtService>((ref) {
  return CourtService(ref.watch(firestoreProvider));
});

/// Quadras da arena gerida pelo usuário (mesma arena de [managedArenaIdProvider]).
final arenaManagedCourtsProvider =
    StreamProvider.autoDispose<List<ArenaCourt>>((ref) {
  final arenaAsync = ref.watch(managedArenaIdProvider);
  return arenaAsync.when(
    data: (arenaId) {
      if (arenaId == null || arenaId.isEmpty) {
        return Stream<List<ArenaCourt>>.value(<ArenaCourt>[]);
      }
      return ref.watch(courtsRepositoryProvider).watchCourts(arenaId);
    },
    loading: () => Stream<List<ArenaCourt>>.value(<ArenaCourt>[]),
    error: (_, __) => Stream<List<ArenaCourt>>.value(<ArenaCourt>[]),
  );
});

/// Reservas no mês corrente por `courtId` (para cards de quadras).
final arenaCourtMonthlyBookingsProvider =
    StreamProvider.autoDispose.family<Map<String, int>, String>((ref, arenaId) {
  final aid = arenaId.trim();
  if (aid.isEmpty) return Stream.value(const <String, int>{});

  return ref.watch(bookingServiceProvider).watchBookingsForArena(aid).map((bookings) {
    final now = DateTime.now();
    final counts = <String, int>{};
    for (final b in bookings) {
      if (_isCanceledBooking(b)) continue;
      final cid = b.courtId.trim();
      if (cid.isEmpty) continue;
      final d = DateTime.tryParse(
        b.dateKey.length >= 10 ? b.dateKey.substring(0, 10) : '',
      );
      if (d == null) continue;
      if (d.year != now.year || d.month != now.month) continue;
      counts[cid] = (counts[cid] ?? 0) + 1;
    }
    return counts;
  });
});

bool _isCanceledBooking(ArenaManagerBooking booking) {
  final s = (booking.data['status'] as String?)?.toLowerCase().trim() ?? '';
  return s == 'cancelled' || s == 'canceled';
}
