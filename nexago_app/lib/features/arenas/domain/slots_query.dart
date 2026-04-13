import 'package:flutter/foundation.dart';

/// Parâmetros da query em `arenaSlots` (alinhado ao web: arena + quadra + dia).
@immutable
class SlotsQuery {
  const SlotsQuery({
    required this.arenaId,
    required this.courtId,
    required this.date,
    this.fallbackPriceReais,
  });

  final String arenaId;
  final String courtId;

  /// Dia selecionado (apenas calendário; hora ignorada).
  final DateTime date;

  /// Preço exibido em slots virtuais (ex.: preço base da arena).
  final double? fallbackPriceReais;

  /// `YYYY-MM-DD` — útil para logs, SnackBar e alinhamento com o web.
  String get dateKey {
    final d = DateTime(date.year, date.month, date.day);
    final y = d.year.toString().padLeft(4, '0');
    final m = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '$y-$m-$day';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is SlotsQuery &&
        other.arenaId == arenaId &&
        other.courtId == courtId &&
        other.date.year == date.year &&
        other.date.month == date.month &&
        other.date.day == date.day &&
        other.fallbackPriceReais == fallbackPriceReais;
  }

  @override
  int get hashCode => Object.hash(arenaId, courtId, dateKey, fallbackPriceReais);
}
