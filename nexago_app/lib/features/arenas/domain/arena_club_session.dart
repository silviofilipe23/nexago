import 'package:cloud_firestore/cloud_firestore.dart';

/// Sessão de Clubinho em `arenaClubSessions/{sessionId}` (id `club_{clubId}_{date}`).
///
/// Escrita SEMPRE via Cloud Functions; o app só lê e chama callables.
class ArenaClubSession {
  const ArenaClubSession({
    required this.id,
    required this.clubId,
    required this.arenaId,
    required this.arenaName,
    required this.clubName,
    this.description,
    required this.date,
    required this.startTime,
    required this.endTime,
    this.startAt,
    required this.courtIds,
    required this.courtNames,
    required this.capacity,
    required this.priceReais,
    required this.cancelWindowHours,
    required this.allowOnsitePayment,
    required this.confirmedCount,
    required this.pendingCount,
    required this.status,
    required this.source,
  });

  final String id;
  final String clubId;
  final String arenaId;
  final String arenaName;
  final String clubName;
  final String? description;

  /// `YYYY-MM-DD`.
  final String date;
  final String startTime;
  final String endTime;
  final DateTime? startAt;
  final List<String> courtIds;
  final List<String> courtNames;
  final int capacity;
  final double priceReais;
  final int cancelWindowHours;

  /// Aceita garantir a vaga pagando na arena no dia (sem PIX antecipado)?
  /// Docs antigos não têm o campo — ausente vale `true`.
  final bool allowOnsitePayment;
  final int confirmedCount;
  final int pendingCount;

  /// `scheduled` | `canceled` | `completed`.
  final String status;

  /// `series` | `manual`.
  final String source;

  bool get isScheduled => status == 'scheduled';
  bool get isCanceled => status == 'canceled';

  /// Vagas restantes (confirmados + PIX pendentes seguram vaga).
  int get spotsLeft {
    final left = capacity - confirmedCount - pendingCount;
    return left < 0 ? 0 : left;
  }

  bool get isFull => spotsLeft <= 0;

  /// Limite para sair com estorno automático (`startAt - cancelWindowHours`).
  DateTime? get cancelDeadline =>
      startAt?.subtract(Duration(hours: cancelWindowHours));

  /// Ainda dá para sair com estorno automático?
  bool canLeaveWithRefund(DateTime now) {
    final deadline = cancelDeadline;
    if (deadline == null) return false;
    return !now.isAfter(deadline);
  }

  /// Data local (meia-noite) derivada de `date`; fallback para [startAt].
  DateTime? get dateOnly {
    if (date.length >= 10) {
      final parsed = DateTime.tryParse(date.substring(0, 10));
      if (parsed != null) {
        return DateTime(parsed.year, parsed.month, parsed.day);
      }
    }
    final start = startAt;
    if (start != null) return DateTime(start.year, start.month, start.day);
    return null;
  }

  /// `dd/MM` para exibição compacta.
  String get dateShortLabel {
    final d = dateOnly;
    if (d == null) return date;
    final dd = d.day.toString().padLeft(2, '0');
    final mm = d.month.toString().padLeft(2, '0');
    return '$dd/$mm';
  }

  String get timeRangeLabel => '$startTime – $endTime';

  factory ArenaClubSession.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    return ArenaClubSession(
      id: doc.id,
      clubId: _stringOr(data['clubId'], ''),
      arenaId: _stringOr(data['arenaId'], ''),
      arenaName: _stringOr(data['arenaName'], 'Arena'),
      clubName: _stringOr(data['clubName'], 'Clubinho'),
      description: _trimmedOrNull(data['description']),
      date: _stringOr(data['date'], ''),
      startTime: _normalizeHm(data['startTime']),
      endTime: _normalizeHm(data['endTime']),
      startAt: _parseTimestamp(data['startAt']),
      courtIds: _stringList(data['courtIds']),
      courtNames: _stringList(data['courtNames']),
      capacity: _intOr(data['capacity'], 0),
      priceReais: _doubleOr(data['priceReais'], 0),
      cancelWindowHours: _intOr(data['cancelWindowHours'], 0),
      // Mesmo parse do backend: só `false` explícito desliga.
      allowOnsitePayment: data['allowOnsitePayment'] != false,
      confirmedCount: _intOr(data['confirmedCount'], 0),
      pendingCount: _intOr(data['pendingCount'], 0),
      status: _stringOr(data['status'], ''),
      source: _stringOr(data['source'], 'series'),
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

  static DateTime? _parseTimestamp(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    return null;
  }
}

/// Participante em `arenaClubSessions/{sessionId}/clubParticipants/{athleteUid}`.
class ClubParticipant {
  const ClubParticipant({
    required this.sessionId,
    required this.athleteId,
    required this.athleteName,
    this.athletePhotoUrl,
    required this.clubId,
    required this.arenaId,
    required this.arenaName,
    required this.clubName,
    required this.date,
    required this.startTime,
    required this.endTime,
    this.startAt,
    required this.status,
    required this.paymentMethod,
    required this.amountReais,
    required this.refundStatus,
    this.asaasPaymentId,
    this.pixCopyPaste,
    this.paymentExpiresAt,
    this.joinedAt,
    this.confirmedAt,
  });

  /// Id do doc pai (`arenaClubSessions/{sessionId}`).
  final String sessionId;

  /// Uid do atleta da plataforma. Convidados adicionados pelo gestor têm
  /// `athleteId: null` no doc (docId `guest_*`) — o parse cai no docId, então
  /// este campo é sempre igual ao id do participante (útil p/ callables de
  /// gestão).
  final String athleteId;
  final String athleteName;
  final String? athletePhotoUrl;
  final String clubId;
  final String arenaId;
  final String arenaName;
  final String clubName;

  /// `YYYY-MM-DD`.
  final String date;
  final String startTime;
  final String endTime;
  final DateTime? startAt;

  /// `pending_payment` | `confirmed` | `expired` | `canceled` |
  /// `canceled_refunded` | `canceled_by_arena_refunded`.
  final String status;

  /// `pix` (antecipado, default em docs antigos) | `onsite` (paga na arena).
  final String paymentMethod;
  final double amountReais;

  /// `none` | `done` | `failed`.
  final String refundStatus;
  final String? asaasPaymentId;
  final String? pixCopyPaste;
  final DateTime? paymentExpiresAt;
  final DateTime? joinedAt;
  final DateTime? confirmedAt;

  bool get isConfirmed => status == 'confirmed';
  bool get isPendingPayment => status == 'pending_payment';

  /// Garantiu a vaga para pagar na arena no dia (sem cobrança online)?
  bool get isOnsite => paymentMethod == 'onsite';

  /// Convidado sem conta adicionado pelo gestor (doc `guest_*`,
  /// `athleteId` nulo no Firestore).
  bool get isGuest => athleteId.startsWith('guest_');

  /// Segue na lista (confirmado ou segurando vaga com PIX pendente)?
  bool get isActive => isConfirmed || isPendingPayment;

  bool get wasRefunded =>
      status == 'canceled_refunded' || status == 'canceled_by_arena_refunded';

  String get statusLabel => switch (status) {
        'pending_payment' => 'Aguardando PIX',
        'confirmed' => 'Confirmado',
        'expired' => 'PIX expirado',
        'canceled' => 'Cancelado',
        'canceled_refunded' => 'Saiu (estornado)',
        'canceled_by_arena_refunded' => 'Estornado pela arena',
        _ => status,
      };

  factory ClubParticipant.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    return ClubParticipant(
      sessionId: doc.reference.parent.parent?.id ?? '',
      athleteId: ArenaClubSession._stringOr(data['athleteId'], doc.id),
      athleteName: ArenaClubSession._stringOr(data['athleteName'], 'Atleta'),
      athletePhotoUrl: _trimmedOrNull(data['athletePhotoUrl']),
      clubId: ArenaClubSession._stringOr(data['clubId'], ''),
      arenaId: ArenaClubSession._stringOr(data['arenaId'], ''),
      arenaName: ArenaClubSession._stringOr(data['arenaName'], 'Arena'),
      clubName: ArenaClubSession._stringOr(data['clubName'], 'Clubinho'),
      date: ArenaClubSession._stringOr(data['date'], ''),
      startTime: ArenaClubSession._normalizeHm(data['startTime']),
      endTime: ArenaClubSession._normalizeHm(data['endTime']),
      startAt: ArenaClubSession._parseTimestamp(data['startAt']),
      status: ArenaClubSession._stringOr(data['status'], ''),
      paymentMethod: ArenaClubSession._stringOr(data['paymentMethod'], 'pix'),
      amountReais: ArenaClubSession._doubleOr(data['amountReais'], 0),
      refundStatus: ArenaClubSession._stringOr(data['refundStatus'], 'none'),
      asaasPaymentId: _trimmedOrNull(data['asaasPaymentId']),
      pixCopyPaste: _trimmedOrNull(data['pixCopyPaste']),
      paymentExpiresAt: ArenaClubSession._parseTimestamp(
        data['paymentExpiresAt'],
      ),
      joinedAt: ArenaClubSession._parseTimestamp(data['joinedAt']),
      confirmedAt: ArenaClubSession._parseTimestamp(data['confirmedAt']),
    );
  }

  static String? _trimmedOrNull(dynamic v) {
    if (v is! String) return null;
    final t = v.trim();
    return t.isEmpty ? null : t;
  }
}
