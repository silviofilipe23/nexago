import 'package:cloud_firestore/cloud_firestore.dart';

/// Cancelamento por chuva — modelos lidos do Firestore (escrita é só do
/// servidor). Contrato: `docs/superpowers/specs/2026-10-29-cancelamento-por-chuva-design.md`.

enum WeatherTrigger { arena, request, auto }

enum WeatherRequestDeadline { before2h, start, after30m }

enum WeatherMidGame { proportional, none }

/// `arenas/{arenaId}.weatherPolicy`. Qualquer valor inválido volta ao padrão
/// (mesma normalização de `normalizeWeatherPolicy` no backend).
class WeatherPolicy {
  const WeatherPolicy({
    this.enabled = false,
    this.allowReschedule = true,
    this.rescheduleDays = 30,
    this.creditValidityDays = 90,
    this.trigger = WeatherTrigger.arena,
    this.requestDeadline = WeatherRequestDeadline.start,
    this.midGame = WeatherMidGame.proportional,
    this.courtIds,
  });

  static const WeatherPolicy defaults = WeatherPolicy();

  static const List<int> rescheduleDayOptions = [15, 30, 60];
  static const List<int> creditValidityOptions = [60, 90, 180];

  final bool enabled;
  final bool allowReschedule;
  final int rescheduleDays;

  /// `null` = crédito sem validade.
  final int? creditValidityDays;
  final WeatherTrigger trigger;
  final WeatherRequestDeadline requestDeadline;
  final WeatherMidGame midGame;

  /// `null` = todas as quadras da arena.
  final List<String>? courtIds;

  /// O atleta pode pedir a liberação (modo "atleta solicita" ou automático).
  bool get acceptsRequests =>
      enabled &&
      (trigger == WeatherTrigger.request || trigger == WeatherTrigger.auto);

  bool coversCourt(String courtId) {
    final ids = courtIds;
    return ids == null || ids.contains(courtId.trim());
  }

  factory WeatherPolicy.fromMap(Object? raw) {
    if (raw is! Map) return defaults;
    final validity = raw['creditValidityDays'];
    final courtsRaw = raw['courtIds'];
    List<String>? courtIds;
    if (courtsRaw is List) {
      final seen = <String>{};
      courtIds = [
        for (final c in courtsRaw)
          if (c is String && c.trim().isNotEmpty && seen.add(c.trim()))
            c.trim(),
      ];
    }
    return WeatherPolicy(
      enabled: raw['enabled'] == true,
      allowReschedule: raw['allowReschedule'] != false,
      rescheduleDays: _pickInt(
        raw['rescheduleDays'],
        rescheduleDayOptions,
        defaults.rescheduleDays,
      ),
      creditValidityDays:
          validity == null && raw.containsKey('creditValidityDays')
              ? null
              : _pickInt(validity, creditValidityOptions, 90),
      trigger: switch (raw['trigger']) {
        'request' => WeatherTrigger.request,
        'auto' => WeatherTrigger.auto,
        _ => WeatherTrigger.arena,
      },
      requestDeadline: switch (raw['requestDeadline']) {
        'before_2h' => WeatherRequestDeadline.before2h,
        'after_30m' => WeatherRequestDeadline.after30m,
        _ => WeatherRequestDeadline.start,
      },
      midGame: raw['midGame'] == 'none'
          ? WeatherMidGame.none
          : WeatherMidGame.proportional,
      courtIds: courtIds,
    );
  }

  static int _pickInt(Object? raw, List<int> allowed, int fallback) {
    if (raw is num &&
        raw == raw.roundToDouble() &&
        allowed.contains(raw.toInt())) {
      return raw.toInt();
    }
    return fallback;
  }
}

/// Uma hora da previsão (WeatherAPI, ou Open-Meteo de reserva): `HH:00`,
/// chance (%), volume (mm) e, só da WeatherAPI, a condição em português.
class WeatherHour {
  const WeatherHour({
    required this.time,
    this.probability,
    this.precipitationMm,
    this.condition,
  });

  final String time;
  final num? probability;
  final num? precipitationMm;

  /// "Chuva passageira moderada ou forte"; `null` quando o provedor não manda.
  final String? condition;

  /// "18h" a partir de "18:00".
  String get hourLabel {
    final h = int.tryParse(time.split(':').first);
    return h == null ? time : '${h}h';
  }

  static WeatherHour? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final time = _text(raw['time']);
    if (time.isEmpty) return null;
    return WeatherHour(
      time: time,
      probability: _numOrNull(raw['probability']),
      precipitationMm: _numOrNull(raw['precipitationMm']),
      condition:
          _text(raw['condition']).isEmpty ? null : _text(raw['condition']),
    );
  }

  /// `forecast` gravado pelo servidor (de 2h antes do início a 2h depois do fim).
  static List<WeatherHour> listOf(Object? raw) => raw is List
      ? [
          for (final h in raw)
            if (WeatherHour.fromMap(h) case final hour?) hour,
        ]
      : const [];
}

enum WeatherReleaseSource { rainMode, request, auto, unknown }

enum WeatherReleaseStatus {
  pendingChoice,
  credited,
  rescheduled,
  kept,
  canceledUnpaid,
  unknown,
}

/// `arenaBookings/{id}.weatherRelease`: a arena liberou o horário por chuva.
class WeatherRelease {
  const WeatherRelease({
    required this.status,
    this.source = WeatherReleaseSource.unknown,
    this.eventId,
    this.releasedAt,
    this.decisionDeadline,
    this.creditableReais = 0,
    this.fraction = 1,
    this.canReschedule = false,
    this.rescheduleUntil,
    this.resolvedAt,
    this.autoCredited = false,
    this.creditId,
    this.rescheduledToBookingId,
    this.forecast = const [],
    this.arenaMessage,
  });

  final WeatherReleaseStatus status;
  final WeatherReleaseSource source;
  final String? eventId;
  final DateTime? releasedAt;
  final DateTime? decisionDeadline;

  /// Quanto vira crédito ou cobre a remarcação.
  final double creditableReais;

  /// Fração do pago que vira crédito (1 = integral; < 1 = chuva no meio do jogo).
  final double fraction;
  final bool canReschedule;

  /// `YYYY-MM-DD` — último dia para o horário novo.
  final String? rescheduleUntil;
  final DateTime? resolvedAt;
  final bool autoCredited;
  final String? creditId;
  final String? rescheduledToBookingId;
  final List<WeatherHour> forecast;
  final String? arenaMessage;

  bool get isPendingChoice => status == WeatherReleaseStatus.pendingChoice;

  /// Último dia da remarcação (meia-noite local).
  DateTime? get rescheduleUntilDate => parseWeatherDateKey(rescheduleUntil);

  static WeatherRelease? fromBooking(Map<String, dynamic>? booking) {
    if (booking == null) return null;
    return fromMap(booking['weatherRelease']);
  }

  static WeatherRelease? fromMap(Object? raw) {
    if (raw is! Map) return null;
    return WeatherRelease(
      status: switch (raw['status']) {
        'pending_choice' => WeatherReleaseStatus.pendingChoice,
        'credited' => WeatherReleaseStatus.credited,
        'rescheduled' => WeatherReleaseStatus.rescheduled,
        'kept' => WeatherReleaseStatus.kept,
        'canceled_unpaid' => WeatherReleaseStatus.canceledUnpaid,
        _ => WeatherReleaseStatus.unknown,
      },
      source: switch (raw['source']) {
        'rain_mode' => WeatherReleaseSource.rainMode,
        'request' => WeatherReleaseSource.request,
        'auto' => WeatherReleaseSource.auto,
        _ => WeatherReleaseSource.unknown,
      },
      eventId: _textOrNull(raw['eventId']),
      releasedAt: weatherDateOf(raw['releasedAt']),
      decisionDeadline: weatherDateOf(raw['decisionDeadline']),
      creditableReais: _money(raw['creditableReais']),
      fraction: (_numOrNull(raw['fraction']) ?? 1).toDouble().clamp(0, 1),
      canReschedule: raw['canReschedule'] == true,
      rescheduleUntil: _textOrNull(raw['rescheduleUntil']),
      resolvedAt: weatherDateOf(raw['resolvedAt']),
      autoCredited: raw['autoCredited'] == true,
      creditId: _textOrNull(raw['creditId']),
      rescheduledToBookingId: _textOrNull(raw['rescheduledToBookingId']),
      forecast: WeatherHour.listOf(raw['forecast']),
      arenaMessage: _textOrNull(raw['arenaMessage']),
    );
  }
}

enum WeatherRequestStatus { pending, approved, rejected, withdrawn, unknown }

/// Medição/previsão registrada no pedido.
class WeatherReading {
  const WeatherReading(
      {this.probability, this.precipitationMm, this.fetchedAt});

  final num? probability;
  final num? precipitationMm;
  final DateTime? fetchedAt;

  bool get hasData => probability != null || precipitationMm != null;

  static WeatherReading? fromMap(Object? raw) {
    if (raw is! Map) return null;
    return WeatherReading(
      probability: _numOrNull(raw['probability']),
      precipitationMm: _numOrNull(raw['precipitationMm']),
      fetchedAt: weatherDateOf(raw['fetchedAt']),
    );
  }
}

/// `arenaWeatherRequests/{bookingId}` — pedido do atleta.
class WeatherRequest {
  const WeatherRequest({
    required this.bookingId,
    required this.status,
    this.arenaId = '',
    this.athleteId = '',
    this.note,
    this.weather,
    this.forecast = const [],
    this.autoApproved = false,
    this.createdAt,
    this.decidedAt,
    this.rejectReason,
  });

  final String bookingId;
  final WeatherRequestStatus status;
  final String arenaId;
  final String athleteId;
  final String? note;
  final WeatherReading? weather;

  /// Horas de 2h antes a 2h depois do jogo, buscadas quando o atleta pediu.
  final List<WeatherHour> forecast;
  final bool autoApproved;
  final DateTime? createdAt;
  final DateTime? decidedAt;
  final String? rejectReason;

  static WeatherRequest? fromMap(String id, Map<String, dynamic>? data) {
    if (data == null) return null;
    return WeatherRequest(
      bookingId:
          _text(data['bookingId']).isEmpty ? id : _text(data['bookingId']),
      status: switch (data['status']) {
        'pending' => WeatherRequestStatus.pending,
        'approved' => WeatherRequestStatus.approved,
        'rejected' => WeatherRequestStatus.rejected,
        'withdrawn' => WeatherRequestStatus.withdrawn,
        _ => WeatherRequestStatus.unknown,
      },
      arenaId: _text(data['arenaId']),
      athleteId: _text(data['athleteId']),
      note: _textOrNull(data['note']),
      weather: WeatherReading.fromMap(data['weather']),
      forecast: WeatherHour.listOf(data['forecast']),
      autoApproved: data['autoApproved'] == true,
      createdAt: weatherDateOf(data['createdAt']),
      decidedAt: weatherDateOf(data['decidedAt']),
      rejectReason: _textOrNull(data['rejectReason']),
    );
  }
}

enum WeatherCreditStatus { open, used, expired, unknown }

class WeatherCreditUse {
  const WeatherCreditUse({
    required this.bookingId,
    required this.amountReais,
    this.at,
    this.kind,
  });

  final String bookingId;
  final double amountReais;
  final DateTime? at;

  /// `booking` | `reschedule`.
  final String? kind;
}

/// `arenaWeatherCredits/{creditId}` — crédito de chuva numa arena.
class WeatherCredit {
  const WeatherCredit({
    required this.id,
    required this.arenaId,
    required this.arenaName,
    required this.amountReais,
    required this.balanceReais,
    required this.status,
    this.athleteId = '',
    this.originBookingId,
    this.originCourtName,
    this.originDate,
    this.originStartTime,
    this.source,
    this.expiresAt,
    this.createdAt,
    this.uses = const [],
    this.expiredReais,
    this.expiredAt,
  });

  final String id;
  final String arenaId;
  final String arenaName;
  final String athleteId;
  final String? originBookingId;
  final String? originCourtName;
  final String? originDate;
  final String? originStartTime;
  final double amountReais;
  final double balanceReais;
  final WeatherCreditStatus status;

  /// `choice` | `auto` | `mid_game` | `reschedule`.
  final String? source;

  /// `null` = sem validade.
  final DateTime? expiresAt;
  final DateTime? createdAt;
  final List<WeatherCreditUse> uses;
  final double? expiredReais;
  final DateTime? expiredAt;

  /// Dá para usar agora (aberto, com saldo e dentro da validade).
  bool usableAt(DateTime now) =>
      status == WeatherCreditStatus.open &&
      balanceReais > 0.004 &&
      (expiresAt == null || expiresAt!.isAfter(now));

  static WeatherCredit fromMap(String id, Map<String, dynamic> data) {
    final usesRaw = data['uses'];
    return WeatherCredit(
      id: id,
      arenaId: _text(data['arenaId']),
      arenaName:
          _text(data['arenaName']).isEmpty ? 'Arena' : _text(data['arenaName']),
      athleteId: _text(data['athleteId']),
      originBookingId: _textOrNull(data['originBookingId']),
      originCourtName: _textOrNull(data['originCourtName']),
      originDate: _textOrNull(data['originDate']),
      originStartTime: _textOrNull(data['originStartTime']),
      amountReais: _money(data['amountReais']),
      balanceReais: _money(data['balanceReais']),
      status: switch (data['status']) {
        'open' => WeatherCreditStatus.open,
        'used' => WeatherCreditStatus.used,
        'expired' => WeatherCreditStatus.expired,
        _ => WeatherCreditStatus.unknown,
      },
      source: _textOrNull(data['source']),
      expiresAt: weatherDateOf(data['expiresAt']),
      createdAt: weatherDateOf(data['createdAt']),
      uses: usesRaw is List
          ? [
              for (final u in usesRaw)
                if (u is Map)
                  WeatherCreditUse(
                    bookingId: _text(u['bookingId']),
                    amountReais: _money(u['amountReais']),
                    at: weatherDateOf(u['at']),
                    kind: _textOrNull(u['kind']),
                  ),
            ]
          : const [],
      expiredReais: _numOrNull(data['expiredReais'])?.toDouble(),
      expiredAt: weatherDateOf(data['expiredAt']),
    );
  }
}

/// Saldo de crédito de chuva numa arena (lista `/weather-credits`).
class WeatherArenaBalance {
  const WeatherArenaBalance({
    required this.arenaId,
    required this.arenaName,
    required this.balanceReais,
    required this.nextExpiresAt,
    required this.credits,
  });

  final String arenaId;
  final String arenaName;

  /// Soma do saldo utilizável agora.
  final double balanceReais;

  /// Vencimento mais próximo entre os créditos utilizáveis (`null` = sem validade).
  final DateTime? nextExpiresAt;

  /// Todos os créditos desta arena (abertos, usados e vencidos), mais novos primeiro.
  final List<WeatherCredit> credits;
}

/// Agrupa os créditos por arena: arenas com saldo primeiro, depois as demais.
List<WeatherArenaBalance> summarizeWeatherCreditsByArena(
  List<WeatherCredit> credits,
  DateTime now,
) {
  final byArena = <String, List<WeatherCredit>>{};
  for (final c in credits) {
    byArena.putIfAbsent(c.arenaId, () => []).add(c);
  }
  final out = <WeatherArenaBalance>[];
  for (final entry in byArena.entries) {
    final list = [...entry.value]..sort((a, b) {
        final ca = a.createdAt?.millisecondsSinceEpoch ?? 0;
        final cb = b.createdAt?.millisecondsSinceEpoch ?? 0;
        return cb.compareTo(ca);
      });
    var cents = 0;
    DateTime? next;
    for (final c in list) {
      if (!c.usableAt(now)) continue;
      cents += (c.balanceReais * 100).round();
      final exp = c.expiresAt;
      if (exp != null && (next == null || exp.isBefore(next))) next = exp;
    }
    out.add(
      WeatherArenaBalance(
        arenaId: entry.key,
        arenaName: list.first.arenaName,
        balanceReais: cents / 100,
        nextExpiresAt: next,
        credits: list,
      ),
    );
  }
  out.sort((a, b) {
    final byBalance = b.balanceReais.compareTo(a.balanceReais);
    if (byBalance != 0) return byBalance;
    return a.arenaName.toLowerCase().compareTo(b.arenaName.toLowerCase());
  });
  return out;
}

/// Timestamp, DateTime, ISO ou epoch ms → [DateTime] local.
DateTime? weatherDateOf(Object? raw) {
  if (raw is Timestamp) return raw.toDate();
  if (raw is DateTime) return raw;
  if (raw is String && raw.trim().isNotEmpty) {
    return DateTime.tryParse(raw.trim())?.toLocal();
  }
  if (raw is int) return DateTime.fromMillisecondsSinceEpoch(raw);
  return null;
}

/// `YYYY-MM-DD` → meia-noite local.
DateTime? parseWeatherDateKey(String? raw) {
  final t = raw?.trim() ?? '';
  if (t.length < 10) return null;
  final d = DateTime.tryParse(t.substring(0, 10));
  return d == null ? null : DateTime(d.year, d.month, d.day);
}

String _text(Object? raw) => raw is String ? raw.trim() : '';

String? _textOrNull(Object? raw) {
  final t = _text(raw);
  return t.isEmpty ? null : t;
}

num? _numOrNull(Object? raw) => raw is num && raw.isFinite ? raw : null;

double _money(Object? raw) {
  final n = _numOrNull(raw);
  if (n == null || n <= 0) return 0;
  return (n * 100).roundToDouble() / 100;
}
