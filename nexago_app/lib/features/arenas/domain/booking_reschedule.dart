import '../../../core/formatting/app_date_format.dart' show calendarDateKey;
import '../../weather/domain/weather_booking_rules.dart' show weatherBookingWindow;
import '../../weather/domain/weather_reschedule.dart'
    show WeatherRescheduleDeltaKind, buildWeatherRescheduleOptions;
import 'arena_slot.dart';

/// Quem remarca: o atleta dono da reserva ou a equipe da arena.
enum BookingRescheduleActor { athlete, arena }

/// Espelho de `functions/src/arena-booking-reschedule.ts` (o servidor decide; o
/// app só esconde o botão e explica). Mantenha os textos iguais.
abstract final class BookingReschedulePolicy {
  /// Prazo do atleta: o mesmo do cancelamento grátis.
  static const athleteHoursBefore = 6;

  /// Vezes que o atleta remarca a mesma reserva pelo app.
  static const maxAthleteReschedules = 1;

  /// Mesmo teto da grade de reserva (um dia antes do horário fixo materializado).
  static const horizonDays = 34;

  static const _movable = {'active', 'confirmed', 'pending_payment'};
}

String _str(Object? v) => v is String ? v.trim() : '';

num _num(Object? v) => v is num ? v : 0;

String _contactArena(Map<String, dynamic> booking) {
  final name = _str(booking['arenaName']);
  return name.isEmpty ? 'fale com a arena' : 'fale com a $name';
}

/// Por que esta reserva não pode ser remarcada, ou `null` se pode.
String? bookingRescheduleBlockReason(
  Map<String, dynamic> booking, {
  required BookingRescheduleActor actor,
  required String? uid,
  required DateTime now,
}) {
  final athlete = actor == BookingRescheduleActor.athlete;
  if (athlete && (uid == null || _str(booking['athleteId']) != uid)) {
    return 'Você não pode remarcar esta reserva.';
  }
  if (booking['isClassSession'] == true ||
      _str(booking['classSessionId']).isNotEmpty) {
    return 'Esta reserva é de uma aula. Mude o horário pela tela da aula.';
  }
  if (_str(booking['scheduleSubscriptionId']).isNotEmpty) {
    return 'Esta reserva é de um plano de horário e não pode ser remarcada.';
  }
  if (booking['isRecurring'] == true ||
      _str(booking['recurringBookingId']).isNotEmpty) {
    return athlete
        ? 'Horário fixo é remarcado com a arena: ${_contactArena(booking)}.'
        : 'Esta reserva é de um horário fixo. Mude o horário pela tela do horário fixo.';
  }
  if (_str(booking['clubSessionId']).isNotEmpty) {
    return 'Esta reserva é de um clubinho. Mude o horário pela tela do clubinho.';
  }
  if (_num(booking['scheduleFlexMinutes']) > 0) {
    return 'Esta reserva usou o plano de horário. Cancele e reserve de novo pelo plano.';
  }
  final status = _str(booking['status']).toLowerCase();
  if (!BookingReschedulePolicy._movable.contains(status)) {
    return 'Só dá para remarcar uma reserva ativa.';
  }
  final weather = booking['weatherRelease'];
  if (weather is Map && weather['status'] == 'pending_choice') {
    return 'A arena liberou este horário por chuva: escolha crédito, remarcar ou manter no aviso da reserva.';
  }
  final attendance = _str(booking['attendanceStatus']);
  if (attendance == 'checked_in' || attendance == 'no_show') {
    return 'Esta reserva já teve a presença registrada.';
  }
  final window = weatherBookingWindow(booking);
  if (window == null) return 'Esta reserva não tem horário válido.';
  if (!athlete) {
    return now.isBefore(window.end) ? null : 'Esta reserva já terminou.';
  }
  if (!now.isBefore(window.start)) return 'Esta reserva já começou.';
  final deadline = window.start
      .subtract(const Duration(hours: BookingReschedulePolicy.athleteHoursBefore));
  if (!now.isBefore(deadline)) {
    return 'A remarcação pelo app vai até ${BookingReschedulePolicy.athleteHoursBefore}h '
        'antes do horário. Para mudar agora, ${_contactArena(booking)}.';
  }
  if (_num(booking['athleteRescheduleCount']) >=
      BookingReschedulePolicy.maxAthleteReschedules) {
    return 'Esta reserva já foi remarcada. Para mudar de novo, ${_contactArena(booking)}.';
  }
  return null;
}

/// O motivo é "passou o prazo" ou "já remarcou": o botão some, mas vale explicar.
bool bookingRescheduleHintWorthShowing(String reason) =>
    reason.startsWith('A remarcação pelo app') ||
    reason.startsWith('Esta reserva já foi remarcada');

/// Dias oferecidos: hoje até hoje + [BookingReschedulePolicy.horizonDays].
List<DateTime> bookingRescheduleDays(DateTime now) {
  final today = DateTime(now.year, now.month, now.day);
  return [
    for (var i = 0; i <= BookingReschedulePolicy.horizonDays; i++)
      DateTime(today.year, today.month, today.day + i),
  ];
}

/// Duração da reserva em minutos (o horário novo mantém a mesma).
int? bookingDurationMinutes(Map<String, dynamic> booking) {
  final window = weatherBookingWindow(booking);
  if (window == null) return null;
  final minutes = window.end.difference(window.start).inMinutes;
  return minutes > 0 ? minutes : null;
}

/// Preço de tabela que a reserva pagou (linhas de preço, sem cupom); sem linhas, o valor.
double bookingTablePrice(Map<String, dynamic> booking) {
  final lines = booking['pricingLineItems'];
  if (lines is List && lines.isNotEmpty) {
    var total = 0.0;
    for (final l in lines) {
      if (l is Map) total += _num(l['finalSlotPriceReais']).toDouble();
    }
    return (total * 100).roundToDouble() / 100;
  }
  return _num(booking['amountReais']).toDouble();
}

/// Os slots da própria reserva contam como livres (dá para empurrar uma hora).
List<ArenaSlot> releaseOwnBookingSlots(List<ArenaSlot> slots, String bookingId) => [
      for (final s in slots)
        s.bookingId == bookingId ? s.copyWith(rawStatus: 'available') : s,
    ];

/// "qui, 06/08 às 18:00".
String bookingRescheduleWhenLabel(DateTime day, String startTime) {
  const weekdays = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  final dd = day.day.toString().padLeft(2, '0');
  final mm = day.month.toString().padLeft(2, '0');
  return '${weekdays[day.weekday - 1]}, $dd/$mm às $startTime';
}

/// Chave `YYYY-MM-DD` do dia (exportada para o serviço).
String bookingRescheduleDateKey(DateTime day) => calendarDateKey(day);

/// Um início possível no dia escolhido.
class BookingRescheduleOption {
  const BookingRescheduleOption({
    required this.startTime,
    required this.endTime,
    required this.available,
    required this.priceDiffReais,
  });

  final String startTime;
  final String endTime;

  /// Livre (em alguma quadra candidata, na reserva sem quadra definida).
  final bool available;

  /// Tabela do horário novo menos a da reserva; `null` = desconhecida
  /// (reserva sem quadra definida, ou slot sem preço).
  final double? priceDiffReais;

  /// Atleta não troca por horário mais caro pela tabela.
  bool blockedForAthlete() => (priceDiffReais ?? 0) > 0.009;
}

/// Inícios do dia com a mesma duração da reserva, a partir dos slots de cada quadra
/// candidata. Uma quadra só: a diferença de tabela vem do preço dos slots. Várias
/// (reserva sem quadra definida): livre se alguma quadra estiver livre, sem preço.
List<BookingRescheduleOption> buildBookingRescheduleOptions({
  required List<List<ArenaSlot>> slotsByCourt,
  required int slotCount,
  required DateTime day,
  required DateTime now,
  required String bookingId,
  required double tablePriceReais,
  required String currentDateKey,
  required String currentStartTime,

  /// A quadra mostrada é a atual: o horário atual não é opção.
  required bool sameCourt,
}) {
  final multi = slotsByCourt.length > 1;
  final byStart = <String, BookingRescheduleOption>{};
  for (final slots in slotsByCourt) {
    final options = buildWeatherRescheduleOptions(
      slots: releaseOwnBookingSlots(slots, bookingId),
      slotCount: slotCount,
      day: day,
      now: now,
      creditableReais: tablePriceReais,
    );
    for (final o in options) {
      final diff = multi || o.delta.kind == WeatherRescheduleDeltaKind.unknown
          ? null
          : switch (o.delta.kind) {
              WeatherRescheduleDeltaKind.extra => o.delta.amountReais,
              WeatherRescheduleDeltaKind.leftover => -o.delta.amountReais,
              _ => 0.0,
            };
      final prev = byStart[o.startTime];
      byStart[o.startTime] = BookingRescheduleOption(
        startTime: o.startTime,
        endTime: o.endTime,
        available: o.available || (prev?.available ?? false),
        priceDiffReais: diff,
      );
    }
  }
  final sameDay = calendarDateKey(day) == currentDateKey;
  final out = byStart.values
      .where((o) => !(sameCourt && sameDay && o.startTime == currentStartTime))
      .toList()
    ..sort((a, b) => a.startTime.compareTo(b.startTime));
  return out;
}
