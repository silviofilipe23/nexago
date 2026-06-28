import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/formatting/app_date_format.dart';

import 'arena_booking_confirm_args.dart';

/// Identifica reserva PIX pendente do mesmo horário para retomar pagamento.
abstract final class PendingPixBookingMatch {
  PendingPixBookingMatch._();

  static bool isResumablePendingPix(Map<String, dynamic> data) {
    final status = (data['status'] as String?)?.toLowerCase().trim() ?? '';
    if (status != 'pending_payment') return false;

    final paymentStatus =
        (data['paymentStatus'] as String?)?.toLowerCase().trim() ?? '';
    if (paymentStatus == 'paid' || paymentStatus == 'partial') return false;

    final channel = (data['paymentChannel'] as String?)?.toLowerCase().trim();
    if (channel != null && channel.isNotEmpty && channel != 'pix') {
      return false;
    }

    final expiresAt = paymentExpiresAtFromData(data);
    if (expiresAt != null && !expiresAt.isAfter(DateTime.now())) {
      return false;
    }

    return true;
  }

  static bool matchesConfirmArgs(
    Map<String, dynamic> data,
    ArenaBookingConfirmArgs args,
  ) {
    final arenaId = (data['arenaId'] as String?)?.trim() ?? '';
    final courtId = (data['courtId'] as String?)?.trim() ?? '';
    if (arenaId != args.arenaId || courtId != args.courtId) return false;
    if (bookingDateKey(data) != args.dateKey) return false;
    if (_normTime(data['startTime']) != _normTime(args.startTime)) {
      return false;
    }
    if (_normTime(data['endTime']) != _normTime(args.endTime)) return false;
    return true;
  }

  static String bookingDateKey(Map<String, dynamic> data) {
    final dateVal = data['date'];
    if (dateVal is String) {
      final t = dateVal.trim();
      return t.length >= 10 ? t.substring(0, 10) : t;
    }
    if (dateVal is Timestamp) {
      return calendarDateKey(dateVal.toDate());
    }
    return '';
  }

  static DateTime? paymentExpiresAtFromData(Map<String, dynamic> data) {
    final v = data['paymentExpiresAt'];
    if (v is Timestamp) return v.toDate();
    if (v is String && v.trim().isNotEmpty) {
      return DateTime.tryParse(v.trim());
    }
    return null;
  }

  static String? paymentExpiresAtIso(Map<String, dynamic> data) {
    final dt = paymentExpiresAtFromData(data);
    return dt?.toIso8601String();
  }

  static String _normTime(dynamic v) {
    if (v == null) return '';
    if (v is! String) return '';
    final t = v.trim();
    return t.length >= 5 ? t.substring(0, 5) : t;
  }
}
