import 'package:flutter/foundation.dart';

/// Estado da tela de sucesso após criar reserva / PIX confirmado.
@immutable
class BookingSuccessArgs {
  const BookingSuccessArgs({
    required this.arenaId,
    required this.arenaName,
    required this.courtName,
    required this.dateKey,
    required this.startTime,
    required this.endTime,
    required this.dateLabel,
    required this.timeRangeLabel,
    this.bookingIds = const [],
    this.amountReais,
    this.paymentApproved = false,
    this.amountLabel,
    this.paymentLabel,
    this.headline,
  });

  final String arenaId;
  final String arenaName;
  final String courtName;
  final String dateKey;
  final String startTime;
  final String endTime;
  final String dateLabel;
  final String timeRangeLabel;
  final List<String> bookingIds;
  final double? amountReais;
  final bool paymentApproved;
  final String? amountLabel;
  final String? paymentLabel;
  final String? headline;

  String? get primaryBookingId =>
      bookingIds.isNotEmpty ? bookingIds.first.trim() : null;
}
