import '../../../core/formatting/app_currency_format.dart';

/// Ações e formatação da tela de sucesso / ticket.
abstract final class ArenaBookingSuccessActions {
  ArenaBookingSuccessActions._();

  static String formatBookingDisplayCode(String bookingId) {
    final id = bookingId.trim();
    if (id.isEmpty) return '#NXG-—';
    if (id.length <= 5) return '#NXG-${id.toUpperCase()}';
    return '#NXG-${id.substring(id.length - 5).toUpperCase()}';
  }

  static String buildBookingShareMessage({
    required String arenaName,
    required String courtName,
    required String dateLabel,
    required String timeRangeLabel,
    required String bookingId,
    String? displayCode,
  }) {
    final code = displayCode ?? formatBookingDisplayCode(bookingId);
    return 'Reserva confirmada na $arenaName!\n'
        '📅 $dateLabel · $timeRangeLabel\n'
        '📍 $courtName\n'
        'Código: $code';
  }

  static String buildMapsSearchUrl(String query) {
    final q = Uri.encodeComponent(query.trim());
    return 'https://www.google.com/maps/search/?api=1&query=$q';
  }

  /// Abre Google Maps / Apple Maps com rota (origem opcional → destino).
  static String buildMapsDirectionsUrl({
    required String destination,
    String? origin,
  }) {
    final params = <String, String>{
      'api': '1',
      'destination': destination.trim(),
      'travelmode': 'driving',
    };
    final from = origin?.trim();
    if (from != null && from.isNotEmpty) {
      params['origin'] = from;
    }
    return Uri(
      scheme: 'https',
      host: 'www.google.com',
      path: '/maps/dir/',
      queryParameters: params,
    ).toString();
  }

  static String resolveMapsDestination({
    required String arenaName,
    String? locationLabel,
    String? addressLine,
    double? latitude,
    double? longitude,
  }) {
    if (latitude != null &&
        longitude != null &&
        latitude.isFinite &&
        longitude.isFinite) {
      return '$latitude,$longitude';
    }
    return mapsQueryFromArena(
      arenaName: arenaName,
      locationLabel: locationLabel,
      addressLine: addressLine,
    );
  }

  static String? resolveMapsOrigin({
    double? latitude,
    double? longitude,
  }) {
    if (latitude != null &&
        longitude != null &&
        latitude.isFinite &&
        longitude.isFinite) {
      return '$latitude,$longitude';
    }
    return null;
  }

  static String? buildWhatsAppUrl({
    required String? phone,
    required String message,
  }) {
    final digits = _normalizeWhatsAppDigits(phone);
    if (digits == null || digits.isEmpty) return null;
    final text = Uri.encodeComponent(message);
    return 'https://wa.me/$digits?text=$text';
  }

  static String? buildGoogleCalendarEventUrl({
    required String title,
    required String dateKey,
    required String startTime,
    required String endTime,
    String? details,
    String? location,
  }) {
    final start = _parseBookingDateTime(dateKey, startTime);
    final end = _parseBookingDateTime(dateKey, endTime);
    if (start == null || end == null) return null;
    var endDt = end;
    if (!endDt.isAfter(start)) {
      endDt = start.add(const Duration(hours: 1));
    }

    final params = <String, String>{
      'action': 'TEMPLATE',
      'text': title,
      'dates': '${_formatCalendarStamp(start)}/${_formatCalendarStamp(endDt)}',
      if (details != null && details.trim().isNotEmpty) 'details': details.trim(),
      if (location != null && location.trim().isNotEmpty) 'location': location.trim(),
    };
    return Uri(
      scheme: 'https',
      host: 'calendar.google.com',
      path: '/calendar/render',
      queryParameters: params,
    ).toString();
  }

  static String formatPaymentSubtitle({
    required bool paymentApproved,
    required double? amountReais,
    required String bookingId,
  }) {
    final code = formatBookingDisplayCode(bookingId);
    if (paymentApproved && amountReais != null) {
      return 'Pagamento de ${formatBRL(amountReais)} aprovado • $code';
    }
    return 'Reserva registrada • $code';
  }

  static String mapsQueryFromArena({
    required String arenaName,
    String? locationLabel,
    String? addressLine,
  }) {
    if (locationLabel != null && locationLabel.trim().isNotEmpty) {
      return locationLabel.trim();
    }
    if (addressLine != null && addressLine.trim().isNotEmpty) {
      return '$arenaName, ${addressLine.trim()}';
    }
    return arenaName;
  }

  static String? _normalizeWhatsAppDigits(String? raw) {
    if (raw == null) return null;
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return null;
    if (digits.length >= 12 && digits.startsWith('55')) return digits;
    if (digits.length >= 10 && digits.length <= 11) return '55$digits';
    if (digits.length >= 12) return digits;
    return null;
  }

  static DateTime? _parseBookingDateTime(String dateKey, String hm) {
    if (dateKey.length < 10 || hm.trim().isEmpty) return null;
    final date = DateTime.tryParse(dateKey.substring(0, 10));
    if (date == null) return null;
    final parts = hm.trim().split(':');
    final h = parts.isNotEmpty ? int.tryParse(parts[0]) ?? 0 : 0;
    final m = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
    return DateTime(date.year, date.month, date.day, h, m);
  }

  static String _formatCalendarStamp(DateTime dt) {
    String pad(int n) => n.toString().padLeft(2, '0');
    return '${dt.year}${pad(dt.month)}${pad(dt.day)}T'
        '${pad(dt.hour)}${pad(dt.minute)}00';
  }
}
