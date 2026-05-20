import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';

import 'arena_booking_labels.dart';
import 'arena_date_utils.dart';
import 'arena_manager_booking.dart';

/// Insight do dia para a aba Hoje.
class ArenaBookingsTodayInsight {
  const ArenaBookingsTodayInsight({
    required this.message,
    this.showPromoCta = false,
  });

  final String message;
  final bool showPromoCta;
}

abstract final class ArenaBookingsGrouping {
  ArenaBookingsGrouping._();

  static String displayCode(String bookingId) {
    final id = bookingId.trim();
    if (id.length <= 5) return '#NXG-$id'.toUpperCase();
    return '#NXG-${id.substring(id.length - 5)}'.toUpperCase();
  }

  static String athleteInitials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) {
      return parts.first.substring(0, 1).toUpperCase();
    }
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  static double? amountReais(Map<String, dynamic> data) {
    final v = data['amountReais'] ?? data['priceReais'] ?? data['price'];
    if (v is num) return v.toDouble();
    return null;
  }

  static double sumReais(Iterable<ArenaManagerBooking> bookings) {
    return bookings.fold<double>(
      0,
      (acc, b) => acc + (amountReais(b.data) ?? 0),
    );
  }

  static String paymentBadgeLabel(Map<String, dynamic> data) {
    final info = arenaBookingPaymentInfo(data);
    if (info.isPaidInFull) return 'PAGO INTEGRAL';
    if (info.isDepositOnly) return 'SINAL PAGO';
    if (info.isPendingPayment) return 'AGUARDANDO';
    if (info.settlement == ArenaBookingPaymentSettlement.failed) {
      return 'NÃO PAGO';
    }
    final ps = (data['paymentStatus'] as String?)?.toLowerCase().trim();
    if (ps == 'paid' || ps == 'approved') return 'PAGA';
    if (ps == 'pending') return 'PENDENTE';
    final status = (data['status'] as String?)?.toLowerCase().trim() ?? '';
    if (status == 'active') return 'ATIVA';
    return 'ATIVA';
  }

  static String attendanceChipLabel(ArenaManagerBooking booking) {
    switch (booking.attendanceStatus) {
      case 'checked_in':
        return 'Confirmado';
      case 'confirmed':
        return 'Confirmado';
      case 'no_show':
        return 'No-show';
      default:
        return 'Pendente';
    }
  }

  static String sectionTitleForDateKey(String dateKey, {DateTime? reference}) {
    final ref = reference ?? arenaTodayDateOnly();
    final todayKey = arenaDateKey(ref);
    final tomorrowKey = arenaDateKey(ref.add(const Duration(days: 1)));

    if (dateKey == todayKey) {
      final d = _parseKey(dateKey);
      if (d == null) return 'Hoje';
      final long = DateFormat("EEEE, d 'de' MMMM", 'pt_BR').format(d);
      return 'Hoje · ${_capitalize(long)}';
    }
    if (dateKey == tomorrowKey) {
      final d = _parseKey(dateKey);
      if (d == null) return 'Amanhã';
      final long = DateFormat("EEEE, d 'de' MMMM", 'pt_BR').format(d);
      return 'Amanhã · ${_capitalize(long)}';
    }

    final d = _parseKey(dateKey);
    if (d == null) return dateKey;
    final short = DateFormat('EEEE', 'pt_BR').format(d);
    final long = DateFormat("d 'de' MMMM", 'pt_BR').format(d);
    return '${_capitalize(short)} · ${_capitalize(long)}';
  }

  static String sectionSubtitleToday(List<ArenaManagerBooking> bookings) {
    final active = bookings.where((b) {
      final s = (b.data['status'] as String?)?.toLowerCase() ?? '';
      return s == 'active' || s.isEmpty;
    }).length;
    final pendingCheckIn = bookings
        .where((b) => b.attendanceStatus == 'pending')
        .length;
    final n = bookings.length;
    final reserva = n == 1 ? '1 reserva' : '$n reservas';
  final ativa = active == 1 ? '1 ativa' : '$active ativas';
    if (pendingCheckIn > 0) {
      final pend = pendingCheckIn == 1
          ? '1 pendente check-in'
          : '$pendingCheckIn pendentes check-in';
      return '$reserva · $ativa · $pend';
    }
    return '$reserva · $ativa';
  }

  static String sectionSubtitleRevenue(List<ArenaManagerBooking> bookings) {
    final n = bookings.length;
    final reserva = n == 1 ? '1 reserva' : '$n reservas';
    final total = sumReais(bookings);
    final money = NumberFormat.currency(locale: 'pt_BR', symbol: r'R$')
        .format(total);
    return '$reserva · $money';
  }

  static ArenaBookingsTodayInsight? todayInsight({
    required List<ArenaManagerBooking> todayBookings,
    required int availableSlotsToday,
  }) {
    final activeBookings = todayBookings.where((b) {
      final s = (b.data['status'] as String?)?.toLowerCase() ?? '';
      return s != 'canceled' && s != 'cancelled';
    }).toList();

    if (activeBookings.isEmpty && availableSlotsToday > 0) {
      return ArenaBookingsTodayInsight(
        message:
            'Hoje tá vazio. Nenhuma reserva confirmada ainda — vale uma promoção rápida.',
        showPromoCta: true,
      );
    }

    if (activeBookings.length == 1 && availableSlotsToday >= 4) {
      return ArenaBookingsTodayInsight(
        message:
            'Apenas 1 reserva confirmada. $availableSlotsToday slots ainda disponíveis hoje.',
        showPromoCta: true,
      );
    }

    return null;
  }

  static DateTime? _parseKey(String key) {
    if (key.length < 10) return null;
    return DateTime.tryParse(key.substring(0, 10));
  }

  static String _capitalize(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1);
  }

  /// Ex.: `DIRETO · SEM LINK` para o card de pagamento no detalhe.
  static String formatPaymentTypeUpper(String label) {
    final l = label.toLowerCase();
    if (l.contains('direto')) return 'DIRETO · SEM LINK';
    if (l.contains('mercado pago')) return 'MERCADO PAGO';
    if (l.contains('app') || l.contains('plataforma')) {
      return 'APP · PLATAFORMA';
    }
    return label.toUpperCase().replaceAll(' / ', ' · ');
  }

  /// Duração em horas a partir de strings `HH:mm`.
  static double? bookingDurationHours(String start, String end) {
    final sh = _parseHm(start);
    final eh = _parseHm(end);
    if (sh == null || eh == null) return null;
    var minutes = (eh.$1 * 60 + eh.$2) - (sh.$1 * 60 + sh.$2);
    if (minutes <= 0) minutes += 24 * 60;
    return minutes / 60.0;
  }

  static (int, int)? _parseHm(String raw) {
    final parts = raw.trim().split(':');
    if (parts.isEmpty) return null;
    final h = int.tryParse(parts.first);
    final m = parts.length > 1 ? int.tryParse(parts[1]) : 0;
    if (h == null || m == null) return null;
    return (h, m);
  }

  static String formatDurationLabel(double hours) {
    if (hours == hours.roundToDouble()) {
      final h = hours.round();
      return h == 1 ? '1h' : '${h}h';
    }
    return '${hours.toStringAsFixed(1).replaceAll('.', ',')}h';
  }

  /// Ex.: `fev/26` a partir da reserva mais antiga na arena.
  static String? clientSinceLabel(List<ArenaManagerBooking> history) {
    if (history.isEmpty) return null;
    final oldest = history.last;
  final created = oldest.data['createdAt'];
    DateTime? d;
    if (created is Timestamp) {
      d = created.toDate();
    } else if (created is DateTime) {
      d = created;
    } else {
      d = _parseKey(oldest.dateKey);
    }
    if (d == null) return null;
    return DateFormat('MMM/yy', 'pt_BR')
        .format(d)
        .replaceAll('.', '')
        .toLowerCase();
  }

  /// Countdown até o início da reserva (para timeline / header).
  static String? checkInPendingSubtitle(ArenaManagerBooking booking) {
    final d = _parseKey(booking.dateKey);
    if (d == null) return 'Hoje';
    final startParts = booking.startTime.split(':');
    final h = int.tryParse(startParts.first) ?? 0;
    final m = startParts.length > 1 ? (int.tryParse(startParts[1]) ?? 0) : 0;
    final start = DateTime(d.year, d.month, d.day, h, m);
    final diff = start.difference(DateTime.now());
    if (diff.isNegative) return 'Hoje · em andamento';
    if (diff.inHours < 48) {
      final hrs = diff.inHours;
      final min = diff.inMinutes % 60;
      if (hrs > 0) return 'Hoje · em ${hrs}h';
      if (min > 0) return 'Hoje · em ${min}min';
      return 'Hoje · agora';
    }
    return 'Hoje';
  }

  /// Ex.: `Sáb 11h–12h · Q1` (tela pós-cancelamento).
  static String cancelSlotHighlight(ArenaManagerBooking booking) {
    final d = _parseKey(booking.dateKey);
    final weekday = d != null
        ? _titleCaseWeekday(DateFormat('EEE', 'pt_BR').format(d))
        : '';
    final timeRange =
        '${_hourLabel(booking.startTime, lowercase: true)}–${_hourLabel(booking.endTime, lowercase: true)}';
    final court = _courtShortLabel(booking.courtName);
    return '$weekday $timeRange · $court'.trim();
  }

  /// Ex.: `11H–12H` (cabeçalho do card de slot liberado).
  static String cancelSlotTimeRange(ArenaManagerBooking booking) {
    return '${_hourLabel(booking.startTime)}–${_hourLabel(booking.endTime)}';
  }

  static String _titleCaseWeekday(String raw) {
    final trimmed = raw.replaceAll('.', '').trim();
    if (trimmed.isEmpty) return '';
    return '${trimmed[0].toUpperCase()}${trimmed.substring(1).toLowerCase()}';
  }

  static String _hourLabel(String time, {bool lowercase = false}) {
    final parts = time.split(':');
    if (parts.isEmpty) return time;
    final h = int.tryParse(parts.first);
    if (h == null) return time;
    final suffix = lowercase ? 'h' : 'H';
    return '$h$suffix';
  }

  static String _courtShortLabel(String courtName) {
    final trimmed = courtName.trim();
    if (trimmed.isEmpty) return '—';
    final match = RegExp(r'(\d+)').firstMatch(trimmed);
    if (match != null) {
      return 'Q${match.group(1)}';
    }
    if (trimmed.length <= 4) return trimmed.toUpperCase();
    return trimmed.toUpperCase();
  }
}
