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
) =>
    _serverAthletesOf(data['resultPlayers']);

/// Quem foi liberado ao ser adicionado na tela de lançamento
/// (`arenaBookings.scoreKeepers`, gravado por `linkBookingResultPlayers`):
/// entra nos jogadores do "Lançar placar" de qualquer celular da pelada.
List<MyBookingConfirmedAthlete> bookingScoreKeepersOf(
  Map<String, dynamic> data,
) =>
    _serverAthletesOf(data['scoreKeepers']);

/// Lista `{uid, name, avatarUrl}` que só o servidor grava, sem repetir.
List<MyBookingConfirmedAthlete> _serverAthletesOf(dynamic raw) {
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

/// Lista de jogadores da reserva que pode lançar o placar, sem repetir: dono,
/// convidados (`participantUids`/`participants`), quem já está no placar
/// (`resultPlayerUids`/`resultPlayers`) e quem foi liberado na tela de
/// lançamento (`scoreKeeperUids`/`scoreKeepers`). Os MESMOS campos que o servidor
/// aceita (`bookingRosterUids` em `functions/src/booking-result.ts`): campo
/// legado do convite não entra, senão o botão apareceria e o servidor recusaria.
List<String> bookingRosterUids(Map<String, dynamic> data) {
  final out = <String>[];
  void add(dynamic value) {
    final uid = _pick(value);
    if (uid != null && !out.contains(uid)) out.add(uid);
  }

  add(_pick(data['athleteId']) ?? data['bookingAthleteId']);
  // Convidados antes de quem está no placar: a ordem da lista na tela.
  for (final (uidsKey, listKey) in [
    ('participantUids', 'participants'),
    ('resultPlayerUids', 'resultPlayers'),
    ('scoreKeeperUids', 'scoreKeepers'),
  ]) {
    final uids = data[uidsKey];
    if (uids is List) uids.forEach(add);
    final list = data[listKey];
    if (list is! List) continue;
    for (final entry in list) {
      if (entry is Map) add(entry['uid']);
    }
  }
  return List.unmodifiable(out);
}

String? _pick(dynamic value) {
  if (value is! String) return null;
  final t = value.trim();
  return t.isEmpty ? null : t;
}
