import 'my_booking_confirmed_athlete.dart';
import 'my_booking_item.dart';

/// Quem joga numa reserva além do dono, e por onde entrou.
class BookingGuest {
  const BookingGuest({required this.athlete, this.fromResult = false});

  final MyBookingConfirmedAthlete athlete;

  /// Entrou pelo placar do pós-jogo (`resultPlayers`), não por convite.
  final bool fromResult;
}

/// Quem está no placar da reserva (`arenaBookings.resultPlayers`, espelho que o
/// servidor grava em `functions/src/booking-result-write.ts` a cada placar
/// salvo), na ordem dos times e sem repetir. Reserva sem placar: lista vazia.
List<MyBookingConfirmedAthlete> bookingResultPlayersOf(
  Map<String, dynamic> data,
) {
  final raw = data['resultPlayers'];
  if (raw is! List) return const [];
  final seen = <String>{};
  final out = <MyBookingConfirmedAthlete>[];
  for (final entry in raw) {
    if (entry is! Map) continue;
    final uid = _pick(entry['uid']);
    if (uid == null || !seen.add(uid)) continue;
    out.add(
      MyBookingConfirmedAthlete(
        userId: uid,
        displayName: _pick(entry['name']),
        avatarUrl: _pick(entry['avatarUrl']),
      ),
    );
  }
  return out;
}

/// Todo mundo ligado à reserva além do dono: primeiro quem entrou por convite
/// (`participants` e os campos legados), depois quem só está no placar. O
/// mesmo atleta (uid) aparece uma vez só — quem foi convidado e também está
/// no placar fica como convidado.
List<BookingGuest> bookingGuestsOf(
  Map<String, dynamic> data, {
  String? ownerUid,
}) {
  final owner = ownerUid?.trim();
  final seen = <String>{if (owner != null && owner.isNotEmpty) owner};
  final out = <BookingGuest>[];
  void add(MyBookingConfirmedAthlete athlete, {required bool fromResult}) {
    final uid = athlete.userId?.trim();
    if (uid != null && uid.isNotEmpty && !seen.add(uid)) return;
    out.add(BookingGuest(athlete: athlete, fromResult: fromResult));
  }

  for (final a in MyBookingItem.parseConfirmedAthletesFromBooking(data)) {
    add(a, fromResult: false);
  }
  for (final a in bookingResultPlayersOf(data)) {
    add(a, fromResult: true);
  }
  return out;
}

String? _pick(dynamic value) {
  if (value is! String) return null;
  final t = value.trim();
  return t.isEmpty ? null : t;
}
