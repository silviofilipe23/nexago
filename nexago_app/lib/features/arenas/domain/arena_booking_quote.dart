import 'package:intl/intl.dart';

/// Linha de preço retornada por `quoteArenaBooking`.
class ArenaBookingQuoteLine {
  const ArenaBookingQuoteLine({
    required this.startTime,
    required this.endTime,
    required this.finalSlotPriceReais,
    required this.baseSlotPriceReais,
  });

  final String startTime;
  final String endTime;
  final double finalSlotPriceReais;
  final double baseSlotPriceReais;
}

/// Cotação autoritativa do servidor para a confirmação.
class ArenaBookingQuote {
  const ArenaBookingQuote({
    required this.amountReais,
    required this.lineItems,
  });

  final double amountReais;
  final List<ArenaBookingQuoteLine> lineItems;

  /// Preço horário médio (soma dos slots ÷ horas cobradas).
  double? get impliedHourlyRateReais {
    if (lineItems.isEmpty) return null;
    var slotMinutes = 0;
    var total = 0.0;
    for (final line in lineItems) {
      final start = _minutes(line.startTime);
      var end = _minutes(line.endTime);
      if (start == null || end == null) continue;
      if (end <= start) end += 24 * 60;
      final mins = end - start;
      if (mins <= 0) continue;
      slotMinutes += mins;
      total += line.finalSlotPriceReais;
    }
    if (slotMinutes <= 0) return null;
    return ((total / (slotMinutes / 60)) * 100).roundToDouble() / 100;
  }

  String? get pricingSummary {
    final hourly = impliedHourlyRateReais;
    if (hourly == null) return null;
    final fmt = NumberFormat.currency(locale: 'pt_BR', symbol: r'R$', decimalDigits: 2);
    final n = lineItems.length;
    if (n <= 1) return '${fmt.format(hourly)}/h';
    return '${fmt.format(hourly)}/h × $n horários';
  }

  static int? _minutes(String hm) {
    final parts = hm.trim().split(':');
    if (parts.isEmpty) return null;
    final h = int.tryParse(parts[0]) ?? 0;
    final m = parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0;
    return h * 60 + m;
  }
}
