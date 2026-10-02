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
    this.paymentId,
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

  /// Pagamento do Asaas que acabou de confirmar (= id do lote de cashback).
  /// Só vem do PIX pago pelo app; reserva no local não tem.
  final String? paymentId;

  String? get primaryBookingId =>
      bookingIds.isNotEmpty ? bookingIds.first.trim() : null;
}
