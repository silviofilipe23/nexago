import 'package:intl/intl.dart';

import '../../domain/my_booking_item.dart';

const int myBookingsStreakWeeksThreshold = 3;

class MyBookingsSplit {
  const MyBookingsSplit({
    required this.upcoming,
    required this.history,
  });

  final List<MyBookingItem> upcoming;
  final List<MyBookingItem> history;
}

MyBookingsSplit splitMyBookings(
  List<MyBookingItem> items, {
  DateTime? now,
}) {
  final clock = now ?? DateTime.now();
  final today = DateTime(clock.year, clock.month, clock.day);
  final upcoming = <MyBookingItem>[];
  final history = <MyBookingItem>[];

  for (final item in items) {
    final date = bookingDateOnly(item);
    if (date == null || !date.isBefore(today)) {
      upcoming.add(item);
    } else {
      history.add(item);
    }
  }

  upcoming.sort((a, b) {
    final ad = bookingDateOnly(a);
    final bd = bookingDateOnly(b);
    if (ad == null && bd == null) {
      return bookingStartMinutes(a).compareTo(bookingStartMinutes(b));
    }
    if (ad == null) return 1;
    if (bd == null) return -1;
    final byDate = ad.compareTo(bd);
    if (byDate != 0) return byDate;
    return bookingStartMinutes(a).compareTo(bookingStartMinutes(b));
  });

  history.sort((a, b) {
    final ad = bookingDateOnly(a);
    final bd = bookingDateOnly(b);
    if (ad == null && bd == null) return 0;
    if (ad == null) return 1;
    if (bd == null) return -1;
    final byDate = bd.compareTo(ad);
    if (byDate != 0) return byDate;
    return bookingStartMinutes(b).compareTo(bookingStartMinutes(a));
  });

  return MyBookingsSplit(upcoming: upcoming, history: history);
}

DateTime? bookingDateOnly(MyBookingItem item) {
  return bookingDateOnlyFromRaw(item.dateRaw);
}

int bookingStartMinutes(MyBookingItem item) {
  final parts = item.startTime.split(':');
  final h = parts.isNotEmpty ? int.tryParse(parts[0]) ?? 0 : 0;
  final m = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  return h * 60 + m;
}

/// Agrupa reservas futuras por dia (`YYYY-MM-DD`).
Map<String, List<MyBookingItem>> groupUpcomingByDate(
  List<MyBookingItem> upcoming,
) {
  final out = <String, List<MyBookingItem>>{};
  for (final item in upcoming) {
    final key = item.dateRaw.length >= 10
        ? item.dateRaw.substring(0, 10)
        : item.dateRaw;
    out.putIfAbsent(key, () => <MyBookingItem>[]).add(item);
  }
  for (final list in out.values) {
    list.sort(
      (a, b) => bookingStartMinutes(a).compareTo(bookingStartMinutes(b)),
    );
  }
  return out;
}

final _weekdayMonthFmt = DateFormat("EEEE · d 'de' MMMM", 'pt_BR');

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

String relativeBookingDayLabel(String dateRaw, {DateTime? now}) {
  final date = bookingDateOnlyFromRaw(dateRaw);
  if (date == null) return '';
  final clock = now ?? DateTime.now();
  final today = DateTime(clock.year, clock.month, clock.day);
  final diff = date.difference(today).inDays;
  if (diff == 0) return 'HOJE';
  if (diff == 1) return 'AMANHÃ';
  if (diff > 1) return 'EM $diff DIAS';
  if (diff == -1) return 'ONTEM';
  return 'HÁ ${diff.abs()} DIAS';
}

DateTime? bookingDateOnlyFromRaw(String dateRaw) {
  if (dateRaw.length < 10) return null;
  final parts = dateRaw.substring(0, 10).split('-');
  if (parts.length != 3) return null;
  final y = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  final d = int.tryParse(parts[2]);
  if (y == null || m == null || d == null) return null;
  return DateTime(y, m, d);
}

/// Semanas ISO (segunda) consecutivas com pelo menos uma reserva, contando da semana atual para trás.
int consecutiveBookingWeeks(
  List<MyBookingItem> items, {
  DateTime? now,
}) {
  final weeks = <int>{};
  for (final item in items) {
    final date = bookingDateOnly(item);
    if (date == null) continue;
    weeks.add(_isoWeekKey(date));
  }
  if (weeks.isEmpty) return 0;

  final clock = now ?? DateTime.now();
  final today = DateTime(clock.year, clock.month, clock.day);
  var cursor = _isoWeekKey(today);
  var streak = 0;
  while (weeks.contains(cursor)) {
    streak++;
    cursor = _previousIsoWeekKey(cursor);
  }
  return streak;
}

int _isoWeekKey(DateTime date) {
  final monday = _mondayOf(date);
  return monday.year * 10000 + monday.month * 100 + monday.day;
}

DateTime _mondayOf(DateTime date) {
  final local = DateTime(date.year, date.month, date.day);
  return local.subtract(Duration(days: local.weekday - DateTime.monday));
}

int _previousIsoWeekKey(int key) {
  final y = key ~/ 10000;
  final m = (key % 10000) ~/ 100;
  final d = key % 100;
  final prev = DateTime(y, m, d).subtract(const Duration(days: 7));
  return prev.year * 10000 + prev.month * 100 + prev.day;
}

String formatPriceReais(double? value) {
  if (value == null) return '—';
  if (value == value.roundToDouble()) {
    return 'R\$ ${value.toInt()}';
  }
  return 'R\$ ${value.toStringAsFixed(2).replaceAll('.', ',')}';
}

String arenaInitials(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.isEmpty || parts.first.isEmpty) return '?';
  if (parts.length == 1) {
    return parts.first.substring(0, 1).toUpperCase();
  }
  final a = parts.first.substring(0, 1);
  final b = parts.length > 1 ? parts[1].substring(0, 1) : '';
  return '$a$b'.toUpperCase();
}
