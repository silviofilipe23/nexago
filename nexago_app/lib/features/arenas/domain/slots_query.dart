import 'package:flutter/foundation.dart';
import '../../../core/formatting/app_date_format.dart';

/// Parâmetros da query em `arenaSlots` (alinhado ao web: arena + quadra + dia).
@immutable
class SlotsQuery {
  const SlotsQuery({
    required this.arenaId,
    required this.courtId,
    required this.date,
    this.arenaFallbackPricePerHourReais,
  });

  final String arenaId;
  final String courtId;

  /// Dia selecionado (apenas calendário; hora ignorada).
  final DateTime date;

  /// Preço **por hora** da arena quando a quadra não define `basePricePerHourReais`.
  final double? arenaFallbackPricePerHourReais;

  /// `YYYY-MM-DD` — útil para logs, SnackBar e alinhamento com o web.
  String get dateKey => calendarDateKey(date);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is SlotsQuery &&
        other.arenaId == arenaId &&
        other.courtId == courtId &&
        other.date.year == date.year &&
        other.date.month == date.month &&
        other.date.day == date.day &&
        other.arenaFallbackPricePerHourReais == arenaFallbackPricePerHourReais;
  }

  @override
  int get hashCode =>
      Object.hash(arenaId, courtId, dateKey, arenaFallbackPricePerHourReais);
}

/// Lê preço horário de fallback do documento da arena.
double? readArenaFallbackPricePerHour(Map<String, dynamic>? arenaData) {
  if (arenaData == null) return null;
  final v = (arenaData['pricePerHourReais'] as num?)?.toDouble() ??
      (arenaData['basePriceReais'] as num?)?.toDouble();
  if (v == null || v <= 0) return null;
  return v;
}
