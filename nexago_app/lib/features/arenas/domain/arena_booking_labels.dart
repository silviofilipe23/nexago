import 'package:intl/intl.dart';

import 'arena_booking_confirm_args.dart';

final _weekdayMonthFmt = DateFormat("EEEE · d 'de' MMMM", 'pt_BR');
final _ticketWeekdayFmt = DateFormat('EEE', 'pt_BR');
final _ticketMonthFmt = DateFormat('MMM', 'pt_BR');

/// Cabeçalho de data para reservas: `Sexta · 22 de maio`.
String formatBookingDateHeader(String dateRaw) {
  if (dateRaw.length < 10) return dateRaw.isEmpty ? '—' : dateRaw;
  final d = DateTime.tryParse(dateRaw.substring(0, 10));
  if (d == null) return dateRaw;
  try {
    final formatted = _weekdayMonthFmt.format(d);
    if (formatted.isEmpty) return formatted;
    return formatted[0].toUpperCase() + formatted.substring(1);
  } catch (_) {
    return dateRaw;
  }
}

/// Data em uppercase para o hero de confirmação.
String formatBookingDateHeaderUppercase(String dateRaw) {
  return formatBookingDateHeader(dateRaw).toUpperCase();
}

/// Data compacta do ticket: `SEX • 22 MAI`.
String formatTicketDateCompact(String dateKey) {
  if (dateKey.length < 10) return dateKey.toUpperCase();
  final d = DateTime.tryParse(dateKey.substring(0, 10));
  if (d == null) return dateKey.toUpperCase();
  try {
    var weekday =
        _ticketWeekdayFmt.format(d).replaceAll('.', '').trim().toUpperCase();
    if (weekday.length > 3) weekday = weekday.substring(0, 3);
    final month =
        _ticketMonthFmt.format(d).replaceAll('.', '').trim().toUpperCase();
    return '$weekday • ${d.day} $month';
  } catch (_) {
    return dateKey.toUpperCase();
  }
}

/// Duração compacta para linha do resumo: `1h30`, `2h`, `1 horário`.
String formatCourtDurationLabel(ArenaBookingConfirmArgs args) {
  final fromLabel = args.durationLabel.trim();
  if (fromLabel.isNotEmpty) {
    final compact = _compactDurationFromLabel(fromLabel);
    if (compact != null) return compact;
  }
  final start = _minutesFromHm(args.startTime);
  var end = _minutesFromHm(args.endTime);
  if (start == null || end == null) return '';
  if (end <= start && start > 0) end += 24 * 60;
  final mins = end - start;
  if (mins <= 0) return '';
  return _formatMinutesCompact(mins);
}

String? _compactDurationFromLabel(String label) {
  if (label == '1 horário') return '1h';
  final horarios = RegExp(r'^(\d+) horários?$').firstMatch(label);
  if (horarios != null) {
    final n = int.tryParse(horarios.group(1) ?? '');
    if (n != null && n > 0) return '${n}h';
  }
  final hora = RegExp(r'^(\d+) hora$').firstMatch(label);
  if (hora != null) return '${hora.group(1)}h';
  final horas = RegExp(r'^(\d+) horas$').firstMatch(label);
  if (horas != null) return '${horas.group(1)}h';
  final decimal = RegExp(r'^([\d,]+) h$').firstMatch(label);
  if (decimal != null) {
    final normalized = decimal.group(1)!.replaceAll(',', '.');
    final hours = double.tryParse(normalized);
    if (hours != null) return _formatMinutesCompact((hours * 60).round());
  }
  return null;
}

String _formatMinutesCompact(int mins) {
  if (mins % 60 == 0) {
    final h = mins ~/ 60;
    return h == 1 ? '1h' : '${h}h';
  }
  final h = mins ~/ 60;
  final m = mins % 60;
  if (h == 0) return '${m}min';
  return '${h}h$m';
}

int? _minutesFromHm(String hm) {
  final parts = hm.trim().split(':');
  if (parts.isEmpty) return null;
  final h = int.tryParse(parts[0]) ?? 0;
  final m = parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0;
  return h * 60 + m;
}
