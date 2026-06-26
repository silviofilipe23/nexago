import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

/// Fuso canônico de torneios e partidas no nexaGO.
const String kNexagoEventTimeZone = 'America/Sao_Paulo';

bool _initialized = false;

/// Carrega dados IANA; chamar uma vez no startup (e nos testes).
Future<void> initializeNexagoEventTimezone() async {
  if (_initialized) return;
  tz_data.initializeTimeZones();
  _initialized = true;
}

void ensureNexagoEventTimezoneInitialized() {
  if (_initialized) return;
  tz_data.initializeTimeZones();
  _initialized = true;
}

tz.Location get _eventLocation {
  ensureNexagoEventTimezoneInitialized();
  return tz.getLocation(kNexagoEventTimeZone);
}

/// Normaliza qualquer [DateTime] para instante UTC (comparações / Firestore).
DateTime nexagoEventUtcInstant(DateTime value) =>
    value.isUtc ? value : value.toUtc();

/// Instante atual (UTC), equivalente a `DateTime.now().toUtc()`.
DateTime nexagoEventNow() {
  return tz.TZDateTime.now(_eventLocation).toUtc();
}

/// Converte instante (UTC ou local do dispositivo) para parede SP (sem fuso).
DateTime toNexagoEventLocal(DateTime instant) {
  final utc = instant.isUtc ? instant : instant.toUtc();
  final sp = tz.TZDateTime.from(utc, _eventLocation);
  return DateTime(sp.year, sp.month, sp.day, sp.hour, sp.minute, sp.second,
      sp.millisecond, sp.microsecond);
}

/// Parede SP → instante UTC para persistência e comparação.
DateTime nexagoEventDateTime({
  required int year,
  required int month,
  required int day,
  int hour = 0,
  int minute = 0,
  int second = 0,
  int millisecond = 0,
  int microsecond = 0,
}) {
  final sp = tz.TZDateTime(
    _eventLocation,
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    microsecond,
  );
  return sp.toUtc();
}

/// `YYYY-MM-DD` no calendário de São Paulo.
String nexagoEventDayKey(DateTime instant) {
  final local = toNexagoEventLocal(instant);
  final y = local.year.toString().padLeft(4, '0');
  final m = local.month.toString().padLeft(2, '0');
  final d = local.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}

/// Parse `YYYY-MM-DD` para meia-noite em São Paulo (UTC).
DateTime? nexagoEventDayKeyAnchor(String dayKey) {
  final key = dayKey.trim();
  if (key.isEmpty) return null;
  final parts = key.split('-');
  if (parts.length != 3) return null;
  final y = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  final d = int.tryParse(parts[2]);
  if (y == null || m == null || d == null) return null;
  return nexagoEventDateTime(year: y, month: m, day: d);
}
