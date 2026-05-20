import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/booking_service.dart';
import 'arenas_providers.dart';

final bookingServiceProvider = Provider<BookingService>((ref) {
  return BookingService(ref.watch(firestoreProvider));
});

/// Snapshot em tempo real de `arenaBookings/{bookingId}` (pagamento PIX).
final arenaBookingDocProvider =
    StreamProvider.autoDispose.family<DocumentSnapshot<Map<String, dynamic>>?, String>(
  (ref, bookingId) {
    final id = bookingId.trim();
    if (id.isEmpty) return Stream.value(null);
    return ref.watch(firestoreProvider).collection('arenaBookings').doc(id).snapshots();
  },
);
