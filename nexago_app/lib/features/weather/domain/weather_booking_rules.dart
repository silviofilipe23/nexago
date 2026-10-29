import 'package:cloud_firestore/cloud_firestore.dart';

import '../../athlete/domain/booking_invite_status.dart' show bookingOwnerUidOf;

import 'weather_models.dart';

/// O pedido do atleta abre 24h antes do início do jogo.
const Duration weatherRequestOpensBefore = Duration(hours: 24);

/// Início e fim da reserva (horário de parede) a partir de `date` + `startTime`
/// / `endTime`. Fim `00:00` (ou antes do início) vira o dia seguinte.
({DateTime start, DateTime end})? weatherBookingWindow(
  Map<String, dynamic> booking,
) {
  final rawDate = booking['date'];
  DateTime? day;
  if (rawDate is String) {
    day = parseWeatherDateKey(rawDate);
  } else if (rawDate is Timestamp) {
    final d = rawDate.toDate();
    day = DateTime(d.year, d.month, d.day);
  }
  final start = _hmToMinutes(booking['startTime']);
  var end = _hmToMinutes(booking['endTime']);
  if (day == null || start == null || end == null) return null;
  if (end <= start) end += 24 * 60;
  return (
    start: day.add(Duration(minutes: start)),
    end: day.add(Duration(minutes: end)),
  );
}

int? _hmToMinutes(Object? raw) {
  if (raw is! String) return null;
  final parts = raw.trim().split(':');
  if (parts.length < 2) return null;
  final h = int.tryParse(parts[0]);
  final m =
      int.tryParse(parts[1].length > 2 ? parts[1].substring(0, 2) : parts[1]);
  if (h == null || m == null || h > 24 || m > 59) return null;
  return h * 60 + m;
}

enum WeatherRequestClosedReason { tooEarly, tooLate }

/// Janela do pedido de liberação por chuva.
class WeatherRequestWindow {
  const WeatherRequestWindow.open(
      {required this.closesAt, required this.afterStart})
      : isOpen = true,
        closedReason = null;

  const WeatherRequestWindow.closed(this.closedReason)
      : isOpen = false,
        closesAt = null,
        afterStart = false;

  final bool isOpen;
  final DateTime? closesAt;

  /// Pedido depois do início = chuva no meio do jogo (crédito proporcional).
  final bool afterStart;
  final WeatherRequestClosedReason? closedReason;
}

/// Abre 24h antes do início e fecha conforme `requestDeadline` (2h antes, no
/// início ou 30 min depois). Depois do início só com `midGame` proporcional.
/// Espelha `weatherRequestWindow` do backend.
WeatherRequestWindow weatherRequestWindow({
  required WeatherPolicy policy,
  required DateTime start,
  required DateTime now,
}) {
  if (now.isBefore(start.subtract(weatherRequestOpensBefore))) {
    return const WeatherRequestWindow.closed(
        WeatherRequestClosedReason.tooEarly);
  }
  final closesAt = switch (policy.requestDeadline) {
    WeatherRequestDeadline.before2h => start.subtract(const Duration(hours: 2)),
    WeatherRequestDeadline.start => start,
    WeatherRequestDeadline.after30m => start.add(const Duration(minutes: 30)),
  };
  if (now.isAfter(closesAt)) {
    return const WeatherRequestWindow.closed(
        WeatherRequestClosedReason.tooLate);
  }
  final afterStart = now.isAfter(start);
  if (afterStart && policy.midGame == WeatherMidGame.none) {
    return const WeatherRequestWindow.closed(
        WeatherRequestClosedReason.tooLate);
  }
  return WeatherRequestWindow.open(closesAt: closesAt, afterStart: afterStart);
}

/// O que já aconteceu com a reserva por causa da chuva.
enum WeatherOutcomeKind {
  credited,
  rescheduled,
  kept,
  canceledUnpaid,

  /// `cancelReason: 'weather'` sem `weatherRelease` (cancelada pela arena).
  canceledByWeather,
}

/// O que a tela da reserva mostra sobre chuva.
sealed class WeatherBookingView {
  const WeatherBookingView();
}

class WeatherViewHidden extends WeatherBookingView {
  const WeatherViewHidden();
}

/// A1: a arena liberou o horário e o atleta ainda não escolheu.
class WeatherViewReleasePending extends WeatherBookingView {
  const WeatherViewReleasePending(this.release);
  final WeatherRelease release;
}

/// Linha de resumo do que já aconteceu.
class WeatherViewOutcome extends WeatherBookingView {
  const WeatherViewOutcome(this.kind, {this.release});
  final WeatherOutcomeKind kind;
  final WeatherRelease? release;
}

/// Botão "Choveu? Pedir cancelamento sem custo".
class WeatherViewRequestAvailable extends WeatherBookingView {
  const WeatherViewRequestAvailable(
      {required this.closesAt, required this.afterStart});
  final DateTime closesAt;
  final bool afterStart;
}

/// A6: pedido em análise.
class WeatherViewRequestPending extends WeatherBookingView {
  const WeatherViewRequestPending(this.request);
  final WeatherRequest request;
}

/// Pedido recusado pela arena (com o motivo, quando houver).
class WeatherViewRequestRejected extends WeatherBookingView {
  const WeatherViewRequestRejected(this.request);
  final WeatherRequest request;
}

const _requestableStatuses = {'active', 'confirmed'};

bool _isCanceledStatus(String status) =>
    status == 'canceled' || status == 'cancelled';

bool _isRecurring(Map<String, dynamic> booking) {
  if (booking['isRecurring'] == true) return true;
  final id = booking['recurringBookingId'];
  return id is String && id.trim().isNotEmpty;
}

/// Decide o que mostrar na reserva:
/// - `weatherRelease` pendente → A1 (só para o dono);
/// - `weatherRelease` resolvido ou cancelada por chuva → resumo;
/// - pedido `pending` → A6; `rejected` → aviso com o motivo;
/// - sem nada, política aceitando pedidos, reserva ativa do próprio atleta,
///   quadra na política e dentro da janela → botão de pedir.
WeatherBookingView resolveWeatherBookingView({
  required Map<String, dynamic>? booking,
  required String? viewerUid,
  required WeatherPolicy? policy,
  required WeatherRequest? request,
  required DateTime now,
}) {
  if (booking == null) return const WeatherViewHidden();
  final uid = viewerUid?.trim() ?? '';
  final isOwner = uid.isNotEmpty && bookingOwnerUidOf(booking) == uid;

  final release = WeatherRelease.fromBooking(booking);
  if (release != null) {
    return switch (release.status) {
      WeatherReleaseStatus.pendingChoice => isOwner
          ? WeatherViewReleasePending(release)
          : const WeatherViewHidden(),
      WeatherReleaseStatus.credited =>
        WeatherViewOutcome(WeatherOutcomeKind.credited, release: release),
      WeatherReleaseStatus.rescheduled =>
        WeatherViewOutcome(WeatherOutcomeKind.rescheduled, release: release),
      WeatherReleaseStatus.kept =>
        WeatherViewOutcome(WeatherOutcomeKind.kept, release: release),
      WeatherReleaseStatus.canceledUnpaid =>
        WeatherViewOutcome(WeatherOutcomeKind.canceledUnpaid, release: release),
      WeatherReleaseStatus.unknown => const WeatherViewHidden(),
    };
  }

  final status = (booking['status'] as String?)?.trim().toLowerCase() ?? '';
  if (_isCanceledStatus(status)) {
    return booking['cancelReason'] == 'weather'
        ? const WeatherViewOutcome(WeatherOutcomeKind.canceledByWeather)
        : const WeatherViewHidden();
  }
  if (!isOwner) return const WeatherViewHidden();

  switch (request?.status) {
    case WeatherRequestStatus.pending:
      return WeatherViewRequestPending(request!);
    case WeatherRequestStatus.rejected:
      return WeatherViewRequestRejected(request!);
    case WeatherRequestStatus.approved:
      // Aprovado: o `weatherRelease` chega na reserva logo em seguida.
      return const WeatherViewHidden();
    case WeatherRequestStatus.withdrawn:
    case WeatherRequestStatus.unknown:
    case null:
      break;
  }

  if (policy == null || !policy.acceptsRequests)
    return const WeatherViewHidden();
  if (!_requestableStatuses.contains(status)) return const WeatherViewHidden();
  if (_isRecurring(booking)) return const WeatherViewHidden();
  final courtId = (booking['courtId'] as String?)?.trim() ?? '';
  if (policy.courtIds != null && !policy.coversCourt(courtId)) {
    return const WeatherViewHidden();
  }
  final window = weatherBookingWindow(booking);
  if (window == null) return const WeatherViewHidden();
  final w = weatherRequestWindow(policy: policy, start: window.start, now: now);
  if (!w.isOpen) return const WeatherViewHidden();
  return WeatherViewRequestAvailable(
      closesAt: w.closesAt!, afterStart: w.afterStart);
}

/// Uma casa da faixa de previsão: a hora e se ela cai no horário do jogo.
typedef WeatherStripHour = ({WeatherHour hour, bool inGame});

/// Faixa de previsão da reserva. O servidor grava de 2h antes do início a 2h
/// depois do fim, em ordem, podendo virar a meia-noite ("23:00", "00:00");
/// aqui só se marca o que é jogo. Sem a janela do jogo, nada fica marcado.
List<WeatherStripHour> weatherForecastStrip(
  List<WeatherHour> hours, {
  ({DateTime start, DateTime end})? game,
}) {
  if (game == null) return [for (final h in hours) (hour: h, inGame: false)];
  final start = game.start.hour * 60 + game.start.minute;
  final end = start + game.end.difference(game.start).inMinutes;
  const day = 24 * 60;
  final out = <WeatherStripHour>[];
  int? previous;
  for (final h in hours) {
    final label = _hmToMinutes(h.time);
    if (label == null) {
      out.add((hour: h, inGame: false));
      continue;
    }
    var at = label;
    if (previous == null) {
      // Jogo da 1h: a faixa começa às 23h da véspera.
      if (label - start > day ~/ 2) at -= day;
    } else {
      while (at <= previous) {
        at += day;
      }
    }
    previous = at;
    out.add((hour: h, inGame: at < end && at + 60 > start));
  }
  return out;
}

/// Título do aviso A1 pela pior hora do jogo (sem a janela, de toda a faixa):
/// a condição da WeatherAPI quando ela fala de chuva ("Chuva moderada às 18h"),
/// senão "Chuva forte às 18h"/"Chuva às 18h"; sem previsão, "Chuva no horário".
String weatherReleaseHeadline(
  WeatherRelease release, {
  ({DateTime start, DateTime end})? game,
}) {
  final strip = weatherForecastStrip(release.forecast, game: game);
  final inGame = [
    for (final s in strip)
      if (s.inGame) s.hour
  ];
  final candidates = inGame.isNotEmpty ? inGame : release.forecast;
  final worstIdx = weatherWorstHourIndex(candidates);
  if (worstIdx == null) return 'Chuva no horário';
  final worst = candidates[worstIdx];
  final condition = worst.condition?.trim() ?? '';
  if (_rainyCondition.hasMatch(condition)) {
    return '${condition[0].toUpperCase()}${condition.substring(1)} às ${worst.hourLabel}';
  }
  final mm = worst.precipitationMm ?? 0;
  final p = worst.probability ?? 0;
  final strong = mm >= 2 || p >= 80;
  return '${strong ? 'Chuva forte' : 'Chuva'} às ${worst.hourLabel}';
}

/// Condições da WeatherAPI que valem como título de chuva ("Encoberto" não vale).
final _rainyCondition =
    RegExp(r'chuv|trovo|tempest|garoa|aguaceiro', caseSensitive: false);

/// Pior hora: mais milímetros e, no empate, mais chance. `null` sem horas.
int? weatherWorstHourIndex(List<WeatherHour> hours) {
  if (hours.isEmpty) return null;
  var idx = 0;
  for (var i = 1; i < hours.length; i++) {
    final a = hours[i];
    final b = hours[idx];
    final am = a.precipitationMm ?? 0;
    final bm = b.precipitationMm ?? 0;
    if (am > bm || (am == bm && (a.probability ?? 0) > (b.probability ?? 0))) {
      idx = i;
    }
  }
  return idx;
}

/// A previsão chega 14 dias antes do jogo (`WEATHER_FORECAST_HORIZON_DAYS`).
const weatherForecastHorizonDays = 14;

/// Dia em que a previsão do jogo passa a existir (meia-noite).
DateTime weatherForecastAvailableFrom(DateTime gameStart) => DateTime(
    gameStart.year,
    gameStart.month,
    gameStart.day - weatherForecastHorizonDays);

/// Card de previsão em toda reserva de pé até o fim do jogo. Liberada por
/// chuva não: o aviso dela já traz a faixa (e o jogo não vai acontecer ali).
bool showsBookingForecast(Map<String, dynamic>? booking, DateTime now) {
  if (booking == null || WeatherRelease.fromBooking(booking) != null) {
    return false;
  }
  final status = (booking['status'] as String?)?.trim().toLowerCase() ?? '';
  if (_isCanceledStatus(status)) return false;
  final window = weatherBookingWindow(booking);
  return window != null && now.isBefore(window.end);
}

enum WeatherOutlook { heavyRain, chanceOfRain, dry }

/// Como fica o tempo no jogo, pela pior hora dele (sem a janela, da faixa).
({WeatherOutlook outlook, WeatherHour hour})? weatherForecastOutlook(
  List<WeatherHour> hours, {
  ({DateTime start, DateTime end})? game,
}) {
  final candidates = _gameHoursOr(hours, game);
  final idx = weatherWorstHourIndex(candidates);
  if (idx == null) return null;
  final worst = candidates[idx];
  final p = worst.probability ?? 0;
  final mm = worst.precipitationMm ?? 0;
  final outlook = mm >= 2 || p >= 80
      ? WeatherOutlook.heavyRain
      : mm >= 0.5 || p >= 40
          ? WeatherOutlook.chanceOfRain
          : WeatherOutlook.dry;
  return (outlook: outlook, hour: worst);
}

/// "Chuva forte prevista às 18h", "Chance de chuva às 18h" ou "Sem chuva no
/// seu horário".
String weatherForecastHeadline(
  List<WeatherHour> hours, {
  ({DateTime start, DateTime end})? game,
}) {
  final o = weatherForecastOutlook(hours, game: game);
  if (o == null) return 'Previsão do tempo';
  return switch (o.outlook) {
    WeatherOutlook.heavyRain => 'Chuva forte prevista às ${o.hour.hourLabel}',
    WeatherOutlook.chanceOfRain => 'Chance de chuva às ${o.hour.hourLabel}',
    WeatherOutlook.dry => 'Sem chuva no seu horário',
  };
}

/// "27° · Parcialmente nublado" no começo do jogo; `null` sem os dois.
String? weatherForecastSubtitle(
  List<WeatherHour> hours, {
  ({DateTime start, DateTime end})? game,
}) {
  final candidates = _gameHoursOr(hours, game);
  if (candidates.isEmpty) return null;
  final first = candidates.first;
  final condition = first.condition?.trim() ?? '';
  final parts = [
    if (first.temperatureC != null) '${first.temperatureC!.round()}°',
    if (condition.isNotEmpty)
      '${condition[0].toUpperCase()}${condition.substring(1)}',
  ];
  return parts.isEmpty ? null : parts.join(' · ');
}

List<WeatherHour> _gameHoursOr(
  List<WeatherHour> hours,
  ({DateTime start, DateTime end})? game,
) {
  final inGame = [
    for (final s in weatherForecastStrip(hours, game: game))
      if (s.inGame) s.hour
  ];
  return inGame.isNotEmpty ? inGame : hours;
}
