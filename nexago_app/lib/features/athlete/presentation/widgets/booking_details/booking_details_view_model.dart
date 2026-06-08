import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../arenas/domain/arena_booking_cancellation_policy.dart';
import '../../../../arenas/domain/arena_booking_success_actions.dart';

const kBookingTeamSlots = 4;

enum BookingDetailsStatus { future, current, past, canceled }

class BookingDetailsHeroModel {
  const BookingDetailsHeroModel({
    required this.status,
    required this.statusBadgeLabel,
    required this.displayCode,
    required this.dateEyebrow,
    required this.timeRange,
    required this.locationLine,
    required this.countdownLabel,
    required this.countdownColor,
  });

  final BookingDetailsStatus status;
  final String statusBadgeLabel;
  final String displayCode;
  final String dateEyebrow;
  final String timeRange;
  final String locationLine;
  final String countdownLabel;
  final Color countdownColor;
}

BookingDetailsStatus bookingDetailsStatus(
  DateTime now,
  DateTime start,
  DateTime end,
  String rawStatus,
) {
  final status = rawStatus.trim().toLowerCase();
  if (status == 'canceled' || status == 'cancelled') {
    return BookingDetailsStatus.canceled;
  }
  if (now.isAfter(start) && now.isBefore(end)) {
    return BookingDetailsStatus.current;
  }
  if (now.isBefore(start)) return BookingDetailsStatus.future;
  return BookingDetailsStatus.past;
}

String bookingDetailsStatusBadgeLabel(BookingDetailsStatus status) {
  return switch (status) {
    BookingDetailsStatus.future => 'CONFIRMADA',
    BookingDetailsStatus.current => 'EM ANDAMENTO',
    BookingDetailsStatus.past => 'FINALIZADA',
    BookingDetailsStatus.canceled => 'CANCELADA',
  };
}

Color bookingDetailsStatusBadgeColor(BookingDetailsStatus status) {
  return switch (status) {
    BookingDetailsStatus.future => const Color(0xFF2E7D32),
    BookingDetailsStatus.current => const Color(0xFFEF6C00),
    BookingDetailsStatus.past => const Color(0xFF6B7280),
    BookingDetailsStatus.canceled => const Color(0xFFB91C1C),
  };
}

String formatBookingDetailsDateEyebrow(DateTime startAt) {
  final weekday = DateFormat('EEEE', 'pt_BR')
      .format(startAt)
      .replaceAll('.', '')
      .toUpperCase();
  final dayMonth = DateFormat('d', 'pt_BR').format(startAt);
  final month = DateFormat('MMMM', 'pt_BR')
      .format(startAt)
      .replaceAll('.', '')
      .toUpperCase();
  return '$weekday · $dayMonth DE $month';
}

String formatBookingDetailsTimeRange(DateTime startAt, DateTime endAt) {
  final start = DateFormat('HH:mm', 'pt_BR').format(startAt);
  final end = DateFormat('HH:mm', 'pt_BR').format(endAt);
  return '$start — $end';
}

String formatBookingDetailsLocationLine({
  required String arenaName,
  required String courtName,
  String surfaceLabel = 'Areia',
}) {
  final arena = arenaName.trim().isNotEmpty ? arenaName.trim() : 'Arena';
  final court = courtName.trim().isNotEmpty ? courtName.trim() : 'Quadra';
  return '$arena · $court · $surfaceLabel';
}

String bookingDetailsCountdownLabel(
  DateTime now,
  DateTime start,
  DateTime end,
  BookingDetailsStatus status,
) {
  switch (status) {
    case BookingDetailsStatus.future:
      final diff = start.difference(now);
      final min = diff.inMinutes;
      if (min <= 59) return 'Começa em $min min';
      final h = min ~/ 60;
      final m = min % 60;
      return m == 0 ? 'Começa em ${h}h' : 'Começa em ${h}h ${m}min';
    case BookingDetailsStatus.current:
      return 'Em andamento';
    case BookingDetailsStatus.past:
      return 'Finalizado';
    case BookingDetailsStatus.canceled:
      return 'Cancelado';
  }
}

Color bookingDetailsCountdownColor(BookingDetailsStatus status) {
  return switch (status) {
    BookingDetailsStatus.future => const Color(0xFFFF6A1A),
    BookingDetailsStatus.current => const Color(0xFFFF6A1A),
    BookingDetailsStatus.past => const Color(0xFF9CA3AF),
    BookingDetailsStatus.canceled => const Color(0xFFB91C1C),
  };
}

BookingDetailsHeroModel buildBookingDetailsHeroModel({
  required DateTime now,
  required String bookingId,
  required String arenaName,
  required String courtName,
  required DateTime startAt,
  required DateTime endAt,
  required String rawStatus,
}) {
  final status = bookingDetailsStatus(now, startAt, endAt, rawStatus);
  return BookingDetailsHeroModel(
    status: status,
    statusBadgeLabel: bookingDetailsStatusBadgeLabel(status),
    displayCode: ArenaBookingSuccessActions.formatBookingDisplayCode(bookingId),
    dateEyebrow: formatBookingDetailsDateEyebrow(startAt),
    timeRange: formatBookingDetailsTimeRange(startAt, endAt),
    locationLine: formatBookingDetailsLocationLine(
      arenaName: arenaName,
      courtName: courtName,
    ),
    countdownLabel: bookingDetailsCountdownLabel(now, startAt, endAt, status),
    countdownColor: bookingDetailsCountdownColor(status),
  );
}

String formatBookingDurationLabel(DateTime startAt, DateTime endAt) {
  final minutes = endAt.difference(startAt).inMinutes;
  if (minutes <= 0) return '1h';
  if (minutes % 60 == 0) return '${minutes ~/ 60}h';
  final h = minutes ~/ 60;
  final m = minutes % 60;
  if (h == 0) return '${m}min';
  return '${h}h ${m}min';
}

String bookingDetailsPaymentTypeLabel(String? raw) {
  final v = raw?.trim().toLowerCase() ?? '';
  if (v.isEmpty) return 'Pagamento na arena';
  if (v.contains('pix')) return 'PIX';
  if (v.contains('card') || v.contains('cart')) return 'Cartão';
  if (v.contains('online')) return 'Online';
  if (v.contains('local') || v.contains('venue')) return 'No local';
  return raw!.trim();
}

bool bookingDetailsShowPaidBadge({
  required String? paymentStatus,
  required double? paidOnline,
}) {
  final ps = paymentStatus?.toLowerCase().trim() ?? '';
  if (ps == 'paid') return true;
  return paidOnline != null && paidOnline > 0.02;
}

bool bookingDetailsShowSplitCard({
  required String? paymentStatus,
  required double? paidOnline,
}) {
  final ps = paymentStatus?.toLowerCase().trim() ?? '';
  if (ps == 'partial') return true;
  return paidOnline != null && paidOnline > 0.02;
}

String? formatSplitPerPersonLabel(double? amountReais, {int slots = kBookingTeamSlots}) {
  if (amountReais == null || amountReais <= 0 || slots < 1) return null;
  final perPerson = amountReais / slots;
  return NumberFormat.currency(locale: 'pt_BR', symbol: r'R$').format(perPerson);
}

String formatDistanceKmLabel(double km) {
  if (km < 1) {
    return '${(km * 1000).round()} m';
  }
  return '${km.toStringAsFixed(1).replaceAll('.', ',')} km';
}

String bookingDetailsCancellationTitle() =>
    ArenaBookingCancellationPolicy.freeCancellationTitle();

String bookingDetailsCancellationSubtitle(String arenaName) =>
    ArenaBookingCancellationPolicy.freeCancellationSubtitle(arenaName);

bool bookingDetailsCanInvite(BookingDetailsStatus status) {
  return bookingDetailsActionsEnabled(status);
}

bool bookingDetailsActionsEnabled(BookingDetailsStatus status) {
  return status != BookingDetailsStatus.past &&
      status != BookingDetailsStatus.canceled;
}

bool bookingDetailsCanCancel(BookingDetailsStatus status) {
  return status == BookingDetailsStatus.future;
}
