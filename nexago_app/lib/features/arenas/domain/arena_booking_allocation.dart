import 'package:flutter/foundation.dart';

/// "Como o atleta reserva" na arena (`arenas/{id}.bookingAllocation`, gravado pela callable
/// `setArenaBookingAllocation`). Ver `docs/product/reservas-por-capacidade.md`.
///
/// - `court` (padrão, campo ausente): o atleta escolhe a quadra.
/// - `capacity`: o atleta reserva o horário; a equipe define a quadra na chegada.
@immutable
class ArenaBookingAllocation {
  const ArenaBookingAllocation({
    required this.isCapacity,
    this.courtIds = const [],
    this.priceBySport = const {},
    this.revealBeforeArrival = false,
    this.allowCourtChoice = false,
  });

  static const ArenaBookingAllocation court = ArenaBookingAllocation(isCapacity: false);

  final bool isCapacity;

  /// Quadras da distribuição, na ordem de preferência da arena.
  final List<String> courtIds;

  /// Preço por hora do horário, por esporte (código do catálogo).
  final Map<String, double> priceBySport;

  final bool revealBeforeArrival;

  /// Modo misto: o atleta pode escolher a quadra, se quiser.
  final bool allowCourtChoice;

  /// Esportes reserváveis por horário: os que têm preço definido.
  List<String> get sports => priceBySport.keys.toList(growable: false);

  /// Mesma leitura do servidor (`readBookingAllocation`): ausente ou inválido = `court`.
  factory ArenaBookingAllocation.fromMap(Object? raw) {
    if (raw is! Map || raw['mode'] != 'capacity') return court;
    final prices = <String, double>{};
    final rawPrices = raw['priceBySport'];
    if (rawPrices is Map) {
      rawPrices.forEach((key, value) {
        if (key is String && value is num && value > 0) prices[key] = value.toDouble();
      });
    }
    final rawCourts = raw['courtIds'];
    return ArenaBookingAllocation(
      isCapacity: true,
      courtIds: rawCourts is List
          ? rawCourts.whereType<String>().map((s) => s.trim()).where((s) => s.isNotEmpty).toList()
          : const [],
      priceBySport: prices,
      revealBeforeArrival: raw['revealBeforeArrival'] == true,
      allowCourtChoice: raw['allowCourtChoice'] == true,
    );
  }
}

/// Texto do lugar da quadra para o atleta quando ela ainda não aparece.
const String kCourtOnArrivalLabel = 'Quadra definida na chegada';

/// O atleta pode ver a quadra da reserva? Mesma regra do servidor (`athleteSeesBookingCourt`).
/// - Sem quadra definida (`unassigned`): não — a provisória pode mudar.
/// - Definida pela recepção antes da chegada numa arena que só mostra na chegada
///   (`revealCourtBeforeArrival: false`): só a partir do início da reserva.
/// - O resto (legado, escolhida pelo atleta, lida no QR): sim.
bool athleteSeesBookingCourt({
  required String? allocationStatus,
  required String? allocationSource,
  required bool? revealCourtBeforeArrival,
  required DateTime? startsAt,
  required DateTime now,
}) {
  if (allocationStatus == 'unassigned') return false;
  if (revealCourtBeforeArrival != false) return true;
  if (allocationSource != 'staff') return true;
  if (startsAt == null) return true;
  return !now.isBefore(startsAt);
}

/// Nome da quadra que o atleta vê numa reserva (`arenaBookings`): [courtName] ou
/// [kCourtOnArrivalLabel] quando a regra de [athleteSeesBookingCourt] esconde a quadra.
String? athleteVisibleCourtName(
  Map<String, dynamic> data,
  String? courtName, {
  DateTime? now,
}) {
  final status = data['allocationStatus'];
  if (status == null) return courtName; // legado e arenas no modo de sempre
  final reveal = data['revealCourtBeforeArrival'];
  final sees = athleteSeesBookingCourt(
    allocationStatus: status is String ? status : null,
    allocationSource: data['allocationSource'] is String ? data['allocationSource'] as String : null,
    revealCourtBeforeArrival: reveal is bool ? reveal : null,
    startsAt: _bookingStartsAt(data),
    now: now ?? DateTime.now(),
  );
  return sees ? courtName : kCourtOnArrivalLabel;
}

DateTime? _bookingStartsAt(Map<String, dynamic> data) {
  final rawDate = data['date'];
  final dateStr = rawDate is String ? rawDate.trim() : '';
  if (dateStr.length < 10) return null;
  final day = DateTime.tryParse(dateStr.substring(0, 10));
  final start = data['startTime'];
  if (day == null || start is! String) return null;
  final parts = start.trim().split(':');
  final h = int.tryParse(parts.isNotEmpty ? parts[0] : '');
  final m = int.tryParse(parts.length > 1 ? parts[1] : '0') ?? 0;
  if (h == null) return null;
  return DateTime(day.year, day.month, day.day, h, m);
}
