import 'package:cloud_firestore/cloud_firestore.dart';

/// Clubinho em `arenaClubs/{clubId}` — jogo aberto recorrente da arena.
///
/// Escrita SEMPRE via callables (`upsertArenaClub`, `setArenaClubStatus`);
/// o app só lê.
class ArenaClub {
  const ArenaClub({
    required this.id,
    required this.arenaId,
    required this.arenaName,
    required this.name,
    this.description,
    this.weekday,
    required this.startTime,
    required this.endTime,
    required this.courtIds,
    required this.courtNames,
    required this.capacity,
    required this.priceReais,
    required this.cancelWindowHours,
    required this.allowOnsitePayment,
    required this.status,
    required this.startDate,
    this.endDate,
    required this.skippedDates,
    this.createdAt,
  });

  final String id;
  final String arenaId;
  final String arenaName;
  final String name;
  final String? description;

  /// ISO 1=seg … 7=dom; `null` = só sessões avulsas.
  final int? weekday;
  final String startTime;
  final String endTime;
  final List<String> courtIds;
  final List<String> courtNames;
  final int capacity;
  final double priceReais;
  final int cancelWindowHours;

  /// Aceita garantir a vaga pagando na arena no dia (sem PIX antecipado)?
  /// Docs antigos não têm o campo — ausente vale `true`.
  final bool allowOnsitePayment;

  /// `active` | `paused` | `archived`.
  final String status;

  /// `YYYY-MM-DD`.
  final String startDate;
  final String? endDate;
  final List<String> skippedDates;
  final DateTime? createdAt;

  bool get isActive => status == 'active';
  bool get isPaused => status == 'paused';
  bool get isArchived => status == 'archived';

  bool get isWeekly => weekday != null && weekday! >= 1 && weekday! <= 7;

  static const List<String> _weekdayLabels = [
    'segunda',
    'terça',
    'quarta',
    'quinta',
    'sexta',
    'sábado',
    'domingo',
  ];

  String get weekdayLabel =>
      isWeekly ? _weekdayLabels[weekday! - 1] : 'avulso';

  /// "Toda sexta · 15:00–19:00" ou "Sessões avulsas · 15:00–19:00".
  String get recurrenceLabel => isWeekly
      ? 'Toda $weekdayLabel · $startTime–$endTime'
      : 'Sessões avulsas · $startTime–$endTime';

  String get statusLabel => switch (status) {
        'active' => 'Ativo',
        'paused' => 'Pausado',
        'archived' => 'Arquivado',
        _ => status,
      };

  factory ArenaClub.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final weekdayRaw = data['weekday'];
    final weekday = weekdayRaw is num ? weekdayRaw.toInt() : null;
    return ArenaClub(
      id: doc.id,
      arenaId: _stringOr(data['arenaId'], ''),
      arenaName: _stringOr(data['arenaName'], 'Arena'),
      name: _stringOr(data['name'], 'Clubinho'),
      description: _trimmedOrNull(data['description']),
      weekday: (weekday != null && weekday >= 1 && weekday <= 7)
          ? weekday
          : null,
      startTime: _normalizeHm(data['startTime']),
      endTime: _normalizeHm(data['endTime']),
      courtIds: _stringList(data['courtIds']),
      courtNames: _stringList(data['courtNames']),
      capacity: _intOr(data['capacity'], 0),
      priceReais: _doubleOr(data['priceReais'], 0),
      cancelWindowHours: _intOr(data['cancelWindowHours'], 0),
      // Mesmo parse do backend: só `false` explícito desliga.
      allowOnsitePayment: data['allowOnsitePayment'] != false,
      status: _stringOr(data['status'], ''),
      startDate: _stringOr(data['startDate'], ''),
      endDate: _trimmedOrNull(data['endDate']),
      skippedDates: _stringList(data['skippedDates']),
      createdAt: _parseTimestamp(data['createdAt']),
    );
  }

  /// String trimada ou [fallback] — tolera tipo errado/vazio (parse
  /// defensivo, mesma convenção de `ArenaRecurringBooking._str`).
  static String _stringOr(dynamic v, String fallback) {
    if (v is! String) return fallback;
    final t = v.trim();
    return t.isEmpty ? fallback : t;
  }

  static int _intOr(dynamic v, int fallback) =>
      v is num ? v.toInt() : fallback;

  static double _doubleOr(dynamic v, double fallback) =>
      v is num ? v.toDouble() : fallback;

  static DateTime? _parseTimestamp(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    return null;
  }

  static String? _trimmedOrNull(dynamic v) {
    if (v is! String) return null;
    final t = v.trim();
    return t.isEmpty ? null : t;
  }

  static String _normalizeHm(dynamic v) {
    if (v is! String) return '';
    final t = v.trim();
    return t.length >= 5 ? t.substring(0, 5) : t;
  }

  static List<String> _stringList(dynamic v) {
    if (v is! List) return const [];
    return [
      for (final e in v)
        if (e is String && e.trim().isNotEmpty) e.trim(),
    ];
  }
}
