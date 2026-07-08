import 'package:cloud_firestore/cloud_firestore.dart';

/// Bora Jogar — modelos do jogo avulso entre atletas.
///
/// O doc `friendlyMatches/{id}` é escrito SOMENTE pelas Cloud Functions;
/// o app lê e dispara ações via callables. Estes modelos espelham o schema
/// do backend (functions/src/friendly-match-*.ts).

enum FriendlyMatchStatus {
  sent('sent', 'Aguardando resposta'),
  countered('countered', 'Contraproposta'),
  confirmed('confirmed', 'Confirmado'),
  declined('declined', 'Recusado'),
  expired('expired', 'Expirado'),
  cancelled('cancelled', 'Cancelado'),
  noShow('no_show', 'Não realizado'),
  completed('completed', 'Aguardando avaliação'),
  reviewed('reviewed', 'Concluído');

  const FriendlyMatchStatus(this.firestoreValue, this.label);

  final String firestoreValue;
  final String label;

  static FriendlyMatchStatus? tryParse(Object? raw) {
    if (raw is! String) return null;
    for (final status in FriendlyMatchStatus.values) {
      if (status.firestoreValue == raw) return status;
    }
    return null;
  }

  bool get isPendingResponse =>
      this == FriendlyMatchStatus.sent || this == FriendlyMatchStatus.countered;

  bool get isTerminal =>
      this == FriendlyMatchStatus.declined ||
      this == FriendlyMatchStatus.expired ||
      this == FriendlyMatchStatus.cancelled ||
      this == FriendlyMatchStatus.noShow ||
      this == FriendlyMatchStatus.reviewed;
}

enum FriendlyMatchObjective {
  training('training', 'Treino'),
  friendly('friendly', 'Amistoso'),
  partner('partner', 'Formar dupla');

  const FriendlyMatchObjective(this.firestoreValue, this.label);

  final String firestoreValue;
  final String label;

  static FriendlyMatchObjective? tryParse(Object? raw) {
    if (raw is! String) return null;
    for (final objective in FriendlyMatchObjective.values) {
      if (objective.firestoreValue == raw) return objective;
    }
    return null;
  }
}

class FriendlyMatchLocation {
  const FriendlyMatchLocation({this.arenaId, this.arenaName, this.freeText});

  final String? arenaId;
  final String? arenaName;
  final String? freeText;

  bool get hasArena => arenaId != null && arenaId!.isNotEmpty;

  String get displayLabel {
    if (arenaName != null && arenaName!.isNotEmpty) return arenaName!;
    if (freeText != null && freeText!.isNotEmpty) return freeText!;
    return 'Local a combinar';
  }

  static FriendlyMatchLocation fromMap(Object? raw) {
    final map = raw is Map ? raw : const {};
    return FriendlyMatchLocation(
      arenaId: map['arenaId'] as String?,
      arenaName: map['arenaName'] as String?,
      freeText: map['freeText'] as String?,
    );
  }

  Map<String, dynamic> toMap() => {
        if (arenaId != null) 'arenaId': arenaId,
        if (arenaName != null) 'arenaName': arenaName,
        if (freeText != null) 'freeText': freeText,
      };
}

class FriendlyMatchCounterProposal {
  const FriendlyMatchCounterProposal({
    required this.scheduledAt,
    this.alternativeTimes = const [],
    this.location,
    this.message,
    required this.proposedByUid,
  });

  final DateTime scheduledAt;
  final List<DateTime> alternativeTimes;
  final FriendlyMatchLocation? location;
  final String? message;
  final String proposedByUid;

  static FriendlyMatchCounterProposal? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final scheduledAt = _toDateTime(raw['scheduledAt']);
    if (scheduledAt == null) return null;
    return FriendlyMatchCounterProposal(
      scheduledAt: scheduledAt,
      alternativeTimes: _toDateTimeList(raw['alternativeTimes']),
      location:
          raw['location'] != null ? FriendlyMatchLocation.fromMap(raw['location']) : null,
      message: raw['message'] as String?,
      proposedByUid: raw['proposedByUid'] as String? ?? '',
    );
  }
}

class FriendlyMatchReview {
  const FriendlyMatchReview({required this.stars, this.tags = const [], this.comment});

  final int stars;
  final List<String> tags;
  final String? comment;

  static FriendlyMatchReview? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final stars = raw['stars'];
    if (stars is! num) return null;
    return FriendlyMatchReview(
      stars: stars.toInt(),
      tags: (raw['tags'] as List?)?.whereType<String>().toList() ?? const [],
      comment: raw['comment'] as String?,
    );
  }
}

class FriendlyMatch {
  const FriendlyMatch({
    required this.id,
    required this.fromUid,
    required this.fromName,
    this.fromPhotoUrl,
    required this.toUid,
    required this.toName,
    this.toPhotoUrl,
    required this.sport,
    required this.objective,
    required this.status,
    required this.scheduledAt,
    this.alternativeTimes = const [],
    required this.location,
    this.message,
    this.scoreAtSend,
    this.expiresAt,
    this.counterProposal,
    this.confirmedTime,
    this.checkInOpenAt,
    this.checkInCloseAt,
    this.checkIns = const {},
    this.cancelledByUid,
    this.cancelPenalized = false,
    this.noShowUids = const [],
    this.completedAt,
    this.reviewRevealAt,
    this.reviewSubmittedUids = const [],
    this.reviews = const {},
    this.createdAt,
  });

  final String id;
  final String fromUid;
  final String fromName;
  final String? fromPhotoUrl;
  final String toUid;
  final String toName;
  final String? toPhotoUrl;
  final String sport;
  final FriendlyMatchObjective objective;
  final FriendlyMatchStatus status;
  final DateTime scheduledAt;
  final List<DateTime> alternativeTimes;
  final FriendlyMatchLocation location;
  final String? message;
  final int? scoreAtSend;
  final DateTime? expiresAt;
  final FriendlyMatchCounterProposal? counterProposal;
  final DateTime? confirmedTime;
  final DateTime? checkInOpenAt;
  final DateTime? checkInCloseAt;
  final Map<String, DateTime> checkIns;
  final String? cancelledByUid;
  final bool cancelPenalized;
  final List<String> noShowUids;
  final DateTime? completedAt;
  final DateTime? reviewRevealAt;
  final List<String> reviewSubmittedUids;
  final Map<String, FriendlyMatchReview> reviews;
  final DateTime? createdAt;

  bool isParticipant(String uid) => uid == fromUid || uid == toUid;

  String otherUid(String uid) => uid == fromUid ? toUid : fromUid;

  String otherName(String uid) => uid == fromUid ? toName : fromName;

  String? otherPhotoUrl(String uid) => uid == fromUid ? toPhotoUrl : fromPhotoUrl;

  String nameOf(String uid) => uid == fromUid ? fromName : toName;

  bool hasCheckedIn(String uid) => checkIns.containsKey(uid);

  bool hasReviewed(String uid) => reviewSubmittedUids.contains(uid);

  /// Quem responde a proposta vigente: destinatário em `sent`,
  /// remetente em `countered`.
  String get responderUid =>
      status == FriendlyMatchStatus.sent ? toUid : fromUid;

  static FriendlyMatch? fromDoc(String id, Map<String, dynamic>? data) {
    if (data == null) return null;
    final status = FriendlyMatchStatus.tryParse(data['status']);
    final objective = FriendlyMatchObjective.tryParse(data['objective']);
    final scheduledAt = _toDateTime(data['scheduledAt']);
    if (status == null || objective == null || scheduledAt == null) return null;

    final checkIns = <String, DateTime>{};
    final rawCheckIns = data['checkIns'];
    if (rawCheckIns is Map) {
      for (final entry in rawCheckIns.entries) {
        final at = _toDateTime(entry.value);
        if (at != null) checkIns[entry.key as String] = at;
      }
    }

    final reviews = <String, FriendlyMatchReview>{};
    final rawReviews = data['reviews'];
    if (rawReviews is Map) {
      for (final entry in rawReviews.entries) {
        final review = FriendlyMatchReview.fromMap(entry.value);
        if (review != null) reviews[entry.key as String] = review;
      }
    }

    return FriendlyMatch(
      id: id,
      fromUid: data['fromUid'] as String? ?? '',
      fromName: data['fromName'] as String? ?? 'Atleta',
      fromPhotoUrl: data['fromPhotoUrl'] as String?,
      toUid: data['toUid'] as String? ?? '',
      toName: data['toName'] as String? ?? 'Atleta',
      toPhotoUrl: data['toPhotoUrl'] as String?,
      sport: data['sport'] as String? ?? '',
      objective: objective,
      status: status,
      scheduledAt: scheduledAt,
      alternativeTimes: _toDateTimeList(data['alternativeTimes']),
      location: FriendlyMatchLocation.fromMap(data['location']),
      message: data['message'] as String?,
      scoreAtSend: (data['scoreAtSend'] as num?)?.toInt(),
      expiresAt: _toDateTime(data['expiresAt']),
      counterProposal: FriendlyMatchCounterProposal.fromMap(data['counterProposal']),
      confirmedTime: _toDateTime(data['confirmedTime']),
      checkInOpenAt: _toDateTime(data['checkInOpenAt']),
      checkInCloseAt: _toDateTime(data['checkInCloseAt']),
      checkIns: checkIns,
      cancelledByUid: data['cancelledByUid'] as String?,
      cancelPenalized: data['cancelPenalized'] == true,
      noShowUids:
          (data['noShowUids'] as List?)?.whereType<String>().toList() ?? const [],
      completedAt: _toDateTime(data['completedAt']),
      reviewRevealAt: _toDateTime(data['reviewRevealAt']),
      reviewSubmittedUids:
          (data['reviewSubmittedUids'] as List?)?.whereType<String>().toList() ??
              const [],
      reviews: reviews,
      createdAt: _toDateTime(data['createdAt']),
    );
  }
}

/// Config do recurso — doc `appConfig/friendlyMatch`. Defaults espelham o
/// backend (friendly-match-config.ts); valores inválidos caem no default.
class FriendlyMatchConfig {
  const FriendlyMatchConfig({
    this.enabled = false,
    this.inviteExpirationHours = 24,
    this.cancellationPenaltyWindowHours = 6,
    this.reviewRevealHours = 72,
    this.checkInBeforeMinutes = 30,
    this.checkInAfterHours = 24,
  });

  final bool enabled;
  final int inviteExpirationHours;
  final int cancellationPenaltyWindowHours;
  final int reviewRevealHours;
  final int checkInBeforeMinutes;
  final int checkInAfterHours;

  static const FriendlyMatchConfig defaults = FriendlyMatchConfig();

  static FriendlyMatchConfig fromMap(Map<String, dynamic>? data) {
    if (data == null) return defaults;
    final window = data['checkInWindow'];
    return FriendlyMatchConfig(
      enabled: data['enabled'] == true,
      inviteExpirationHours: _positiveInt(
          data['inviteExpirationHours'], defaults.inviteExpirationHours),
      cancellationPenaltyWindowHours: _positiveInt(
          data['cancellationPenaltyWindowHours'],
          defaults.cancellationPenaltyWindowHours),
      reviewRevealHours:
          _positiveInt(data['reviewRevealHours'], defaults.reviewRevealHours),
      checkInBeforeMinutes: _positiveInt(
          window is Map ? window['beforeMinutes'] : null,
          defaults.checkInBeforeMinutes),
      checkInAfterHours: _positiveInt(
          window is Map ? window['afterHours'] : null, defaults.checkInAfterHours),
    );
  }
}

int _positiveInt(Object? raw, int fallback) {
  if (raw is num && raw.isFinite && raw > 0) return raw.toInt();
  return fallback;
}

DateTime? _toDateTime(Object? raw) {
  if (raw is Timestamp) return raw.toDate();
  if (raw is DateTime) return raw;
  return null;
}

List<DateTime> _toDateTimeList(Object? raw) {
  if (raw is! List) return const [];
  return raw.map(_toDateTime).whereType<DateTime>().toList();
}
