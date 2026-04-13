import 'package:flutter/foundation.dart';

/// Estado enviado da seleção de horários para a confirmação (paridade com query params do web).
@immutable
class ArenaBookingConfirmArgs {
  const ArenaBookingConfirmArgs({
    required this.arenaId,
    required this.arenaName,
    required this.courtId,
    required this.courtName,
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.amountReais,
  });

  final String arenaId;
  final String arenaName;
  final String courtId;
  final String courtName;
  final DateTime date;
  final String startTime;
  final String endTime;
  final double amountReais;

  String get dateKey {
    final d = DateTime(date.year, date.month, date.day);
    final y = d.year.toString().padLeft(4, '0');
    final m = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '$y-$m-$day';
  }

  bool get isValid =>
      arenaId.isNotEmpty &&
      courtId.isNotEmpty &&
      startTime.length >= 4 &&
      endTime.length >= 4 &&
      amountReais >= 0;

  static ArenaBookingConfirmArgs? tryParseQuery(Uri uri) {
    final q = uri.queryParameters;
    final arenaId = q['arenaId'] ?? '';
    final arenaName = q['arenaName'] ?? '';
    final courtId = q['courtId'] ?? '';
    final courtName = q['courtName'] ?? '';
    final dateStr = q['date'] ?? '';
    final start = q['startTime'] ?? '';
    final end = q['endTime'] ?? '';
    final total = double.tryParse(q['totalReais'] ?? '') ?? double.tryParse(q['amountReais'] ?? '') ?? -1;

    if (arenaId.isEmpty || courtId.isEmpty || dateStr.length < 10 || start.isEmpty || end.isEmpty || total < 0) {
      return null;
    }
    final parsed = DateTime.tryParse(dateStr.length >= 10 ? dateStr.substring(0, 10) : dateStr);
    if (parsed == null) return null;

    return ArenaBookingConfirmArgs(
      arenaId: arenaId,
      arenaName: arenaName.isEmpty ? 'Arena' : arenaName,
      courtId: courtId,
      courtName: courtName.isEmpty ? 'Quadra' : courtName,
      date: DateTime(parsed.year, parsed.month, parsed.day),
      startTime: start.length >= 5 ? start.substring(0, 5) : start,
      endTime: end.length >= 5 ? end.substring(0, 5) : end,
      amountReais: total,
    );
  }
}
