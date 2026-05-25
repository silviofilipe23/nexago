import 'package:flutter/foundation.dart';

/// Estado enviado da seleção de horários para a confirmação (paridade com query params do web).
@immutable
class ArenaBookingConfirmArgs {
  const ArenaBookingConfirmArgs({
    required this.arenaId,
    required this.arenaName,
    required this.courtId,
    required this.courtName,
    this.courtSubtitle,
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.amountReais,
    this.selectedSlotStartTimes = const [],
  });

  final String arenaId;
  final String arenaName;
  final String courtId;
  final String courtName;

  /// Esporte/superfície exibido no hero (`Beach · Areia`).
  final String? courtSubtitle;

  final DateTime date;
  final String startTime;
  final String endTime;
  final double amountReais;

  /// Inícios dos slots tocados na grade (`18:00`, `19:00`…). Define a cobrança no servidor.
  final List<String> selectedSlotStartTimes;

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

  int get selectedSlotCount =>
      selectedSlotStartTimes.isNotEmpty ? selectedSlotStartTimes.length : 0;

  /// Rótulo de duração para o resumo (prioriza quantidade de slots escolhidos).
  String get durationLabel {
    final n = selectedSlotCount;
    if (n == 1) return '1 horário';
    if (n > 1) return '$n horários';
    final start = _minutesFromHm(startTime);
    var end = _minutesFromHm(endTime);
    if (start == null || end == null) return '';
    if (end <= start && start > 0) end += 24 * 60;
    final mins = end - start;
    if (mins <= 0) return '';
    if (mins % 60 == 0) {
      final h = mins ~/ 60;
      return h == 1 ? '1 hora' : '$h horas';
    }
    return '${(mins / 60).toStringAsFixed(1).replaceAll('.', ',')} h';
  }

  static int? _minutesFromHm(String hm) {
    final parts = hm.trim().split(':');
    if (parts.isEmpty) return null;
    final h = int.tryParse(parts[0]) ?? 0;
    final m = parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0;
    return h * 60 + m;
  }

  static ArenaBookingConfirmArgs? tryParseQuery(Uri uri) {
    final q = uri.queryParameters;
    final arenaId = q['arenaId'] ?? '';
    final arenaName = q['arenaName'] ?? '';
    final courtId = q['courtId'] ?? '';
    final courtName = q['courtName'] ?? '';
    final courtSubtitle = q['courtSubtitle']?.trim();
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
      courtSubtitle:
          courtSubtitle != null && courtSubtitle.isNotEmpty ? courtSubtitle : null,
      date: DateTime(parsed.year, parsed.month, parsed.day),
      startTime: start.length >= 5 ? start.substring(0, 5) : start,
      endTime: end.length >= 5 ? end.substring(0, 5) : end,
      amountReais: total,
    );
  }
}
