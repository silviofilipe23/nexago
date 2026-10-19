import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'booking_providers.dart';
import 'my_booking_confirmed_athlete.dart';
import 'my_booking_item.dart';

/// O que o story lê do documento da reserva: o esporte gravado e quem já
/// confirmou presença.
@immutable
class BookingStorySource {
  const BookingStorySource({
    this.sport,
    this.ownerUid,
    this.confirmed = const [],
  });

  final String? sport;
  final String? ownerUid;
  final List<MyBookingConfirmedAthlete> confirmed;
}

/// Lido do doc (e não dos args da confirmação) para valer também na reserva
/// PIX retomada, que mantém o esporte com que foi criada. `null` enquanto
/// carrega ou sem reserva.
final bookingStorySourceProvider =
    Provider.autoDispose.family<BookingStorySource?, String>((ref, bookingId) {
  final snap = ref.watch(arenaBookingDocProvider(bookingId)).valueOrNull;
  if (snap == null || !snap.exists) return null;
  final item = MyBookingItem.fromFirestore(snap);
  return BookingStorySource(
    sport: item.sport,
    ownerUid: item.ownerAthleteId,
    confirmed: item.confirmedAthletes,
  );
});
