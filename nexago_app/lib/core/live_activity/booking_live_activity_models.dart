/// Live Activity da reserva de quadra (L3): Chegar → Em quadra → Placar.
///
/// Puro de propósito: qual reserva ganha o card e o que vai para o Swift
/// (`startBooking`) e para o Firestore (`bookingLiveActivities/{uid}_{bookingId}`)
/// ficam fixados por teste — renomear um campo de um lado faz o card parar sem
/// erro em lugar nenhum. Lado nativo: `ios/NexagoLiveActivities/Booking*.swift`;
/// servidor: `functions/src/booking-live-activity.ts`; regra: `firestore.rules`.
library;

import '../../features/arenas/domain/my_booking_item.dart';
import '../../features/athlete/domain/agenda/athlete_agenda_logic.dart';
import '../../features/athlete/domain/agenda/athlete_agenda_models.dart';
import '../../features/athlete/domain/booking_invite_status.dart';
import '../time/nexago_event_timezone.dart';

/// Coleção que a varredura do servidor lê para as viradas de início e fim.
const bookingLiveActivitiesCollection = 'bookingLiveActivities';

/// O card nasce quando o atleta abre o app até este tempo antes do jogo.
const bookingLiveActivityLeadTime = Duration(hours: 2);

String bookingLiveActivityDocId({required String uid, required String bookingId}) =>
    '${uid}_$bookingId';

/// Status que ainda não confirmam a reserva (Pix por pagar).
const _unconfirmedStatuses = {'pending', 'pending_payment'};

class BookingLiveActivityRequest {
  const BookingLiveActivityRequest({
    required this.bookingId,
    required this.arenaName,
    required this.courtName,
    required this.startAt,
    required this.endAt,
    required this.confirmed,
    this.totalSlots = kBookingMaxPlayers,
    String? startLabel,
    String? endLabel,
  })  : startLabel = startLabel ?? '',
        endLabel = endLabel ?? '';

  final String bookingId;
  final String arenaName;
  final String courtName;
  final DateTime startAt;
  final DateTime endAt;

  /// "3 de 4 confirmados" — o mesmo N/4 do detalhe da reserva.
  final int confirmed;
  final int totalSlots;

  /// "19:00" como a reserva grava (parede de São Paulo), não o relógio do
  /// aparelho.
  final String startLabel;
  final String endLabel;

  /// CONTRATO com `BookingLiveActivityController.start` no Swift.
  Map<String, Object> toChannelArgs() => {
        'bookingId': bookingId,
        'arenaName': arenaName,
        'courtName': courtName,
        'startAtMs': startAt.millisecondsSinceEpoch,
        'endAtMs': endAt.millisecondsSinceEpoch,
        'startLabel': startLabel,
        'endLabel': endLabel,
        'confirmed': confirmed.clamp(0, totalSlots),
        'totalSlots': totalSlots,
      };
}

/// O que fazer com o card agora.
class BookingLiveActivityPlan {
  const BookingLiveActivityPlan({
    required this.request,
    required this.canceledBookingIds,
  });

  /// A reserva que deve estar no card (ou `null`: nenhuma nas próximas 2h).
  final BookingLiveActivityRequest? request;

  /// Reservas canceladas — um card delas na tela tem de sair.
  final Set<String> canceledBookingIds;
}

/// Escolhe a reserva do card: confirmada, que ainda não acabou e começa em até
/// 2 horas — a mais cedo. Convidado também vê (é jogo dele).
BookingLiveActivityPlan planBookingLiveActivity(
  List<MyBookingItem> bookings, {
  required DateTime now,
}) {
  BookingLiveActivityRequest? best;
  final canceled = <String>{};
  for (final booking in bookings) {
    final item = mapBookingToAgendaItem(booking, now: now);
    final rental = item?.rental;
    if (rental == null) continue;
    if (rental.stage == AthleteAgendaBookingStage.canceled) {
      canceled.add(rental.bookingId);
      continue;
    }
    if (rental.stage == AthleteAgendaBookingStage.past) continue;
    if (_unconfirmedStatuses.contains(rental.rawStatus.trim().toLowerCase())) continue;
    // Instantes reais pela parede de São Paulo (como o servidor e o resto do
    // app): `rental.startAt` é o relógio do aparelho, que erra fora de SP.
    final window = _eventWindow(booking);
    if (window == null) continue;
    final (startAt, endAt) = window;
    if (!endAt.isAfter(now)) continue;
    if (startAt.difference(now) > bookingLiveActivityLeadTime) continue;
    if (best != null && !startAt.isBefore(best.startAt)) continue;
    best = BookingLiveActivityRequest(
      bookingId: rental.bookingId,
      arenaName: rental.arenaName.trim().isEmpty ? 'Arena' : rental.arenaName.trim(),
      courtName: rental.courtName,
      startAt: startAt,
      endAt: endAt,
      confirmed: rental.confirmedParticipants,
      startLabel: _clock(booking.startTime),
      endLabel: _clock(booking.endTime),
    );
  }
  return BookingLiveActivityPlan(request: best, canceledBookingIds: canceled);
}

/// Doc criado quando o iPhone entrega o token. [serverTimestamp] é o
/// `FieldValue.serverTimestamp()` (injetado para o teste).
Map<String, Object> bookingLiveActivityCreateData({
  required String uid,
  required BookingLiveActivityRequest request,
  required String fcmToken,
  required String liveActivityToken,
  required Object serverTimestamp,
}) =>
    {
      'uid': uid,
      'bookingId': request.bookingId,
      'fcmToken': fcmToken,
      'liveActivityToken': liveActivityToken,
      'startAt': request.startAt,
      'endAt': request.endAt,
      'phase': 'upcoming',
      'createdAt': serverTimestamp,
      'updatedAt': serverTimestamp,
    };

(int, int)? _hourMinute(String raw) {
  final parts = raw.trim().split(':');
  final hour = int.tryParse(parts.first);
  if (hour == null) return null;
  final minute = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  return (hour, minute);
}

/// "9:00" → "09:00"; ilegível fica como veio.
String _clock(String raw) {
  final hm = _hourMinute(raw);
  if (hm == null) return raw.trim();
  final (h, m) = hm;
  return '${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}';
}

/// Início e fim da reserva como instantes, pela parede de São Paulo. Fim que
/// não passa do início vira o dia seguinte (horário que cruza a meia-noite).
(DateTime, DateTime)? _eventWindow(MyBookingItem booking) {
  final day = parseBookingDateOnly(booking.dateRaw);
  final start = _hourMinute(booking.startTime);
  final end = _hourMinute(booking.endTime);
  if (day == null || start == null || end == null) return null;
  ensureNexagoEventTimezoneInitialized();
  DateTime at((int, int) hm) => nexagoEventDateTime(
        year: day.year,
        month: day.month,
        day: day.day,
        hour: hm.$1,
        minute: hm.$2,
      );
  final startAt = at(start);
  var endAt = at(end);
  if (!endAt.isAfter(startAt)) endAt = endAt.add(const Duration(days: 1));
  return (startAt, endAt);
}
