import '../../../tournaments/domain/tournament_match.dart';

/// Filtro da central de partidas (G1).
enum OrganizerMatchCenterFilter {
  all,
  live,
  onCourt,
}

/// Status da fila de chamada (G2).
enum MatchQueueStatus {
  waiting,
  onDeck,
  onCourt,
  completed;

  static MatchQueueStatus? parse(String raw) {
    switch (raw.trim().toLowerCase()) {
      case 'waiting':
        return MatchQueueStatus.waiting;
      case 'on_deck':
        return MatchQueueStatus.onDeck;
      case 'on_court':
        return MatchQueueStatus.onCourt;
      case 'completed':
        return MatchQueueStatus.completed;
      default:
        return null;
    }
  }

  String get firestoreValue {
    switch (this) {
      case MatchQueueStatus.waiting:
        return 'waiting';
      case MatchQueueStatus.onDeck:
        return 'on_deck';
      case MatchQueueStatus.onCourt:
        return 'on_court';
      case MatchQueueStatus.completed:
        return 'completed';
    }
  }
}

/// Status de check-in por equipe (J1).
enum MatchCheckInStatus {
  pending,
  present,
  wo;

  static MatchCheckInStatus? parse(String raw) {
    switch (raw.trim().toLowerCase()) {
      case 'pending':
        return MatchCheckInStatus.pending;
      case 'present':
        return MatchCheckInStatus.present;
      case 'wo':
        return MatchCheckInStatus.wo;
      default:
        return null;
    }
  }

  String get firestoreValue => name;
}

/// Status do reporte de resultado (I3).
enum MatchReportStatus {
  none,
  pending,
  validated;

  static MatchReportStatus? parse(String raw) {
    switch (raw.trim().toLowerCase()) {
      case 'none':
        return MatchReportStatus.none;
      case 'pending':
        return MatchReportStatus.pending;
      case 'validated':
        return MatchReportStatus.validated;
      default:
        return null;
    }
  }
}

/// Quadra configurável no torneio.
class TournamentCourt {
  const TournamentCourt({
    required this.id,
    required this.name,
    required this.order,
  });

  final String id;
  final String name;
  final int order;

  factory TournamentCourt.fromMap(Map<String, dynamic> map) {
    return TournamentCourt(
      id: (map['id'] as String?)?.trim() ?? '',
      name: (map['name'] as String?)?.trim() ?? '',
      order: (map['order'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toMap() => {
        'id': id,
        'name': name,
        'order': order,
      };
}

/// Início padrão da jornada de programação (parede SP).
const kDefaultMatchOpsDayStart = '07:00';

/// Fim exclusivo da jornada; com slots de 30 min o último início é 23:30.
const kDefaultMatchOpsDayEnd = '24:00';

/// Configuração operacional do torneio.
class TournamentMatchOpsConfig {
  const TournamentMatchOpsConfig({
    this.activeDayKey = '',
    this.dayStart = kDefaultMatchOpsDayStart,
    this.dayEnd = kDefaultMatchOpsDayEnd,
    this.defaultMatchDurationMin = 30,
    this.minRestBetweenMatchesMin = 30,
    this.checkInToleranceMin = 15,
    this.avoidAthleteConflict = true,
    this.respectBracketDeps = true,
    this.seedOnPrimeCourt = false,
  });

  final String activeDayKey;
  final String dayStart;
  final String dayEnd;
  final int defaultMatchDurationMin;
  final int minRestBetweenMatchesMin;
  final int checkInToleranceMin;
  final bool avoidAthleteConflict;
  final bool respectBracketDeps;
  final bool seedOnPrimeCourt;

  factory TournamentMatchOpsConfig.fromMap(Map<String, dynamic>? map) {
    if (map == null || map.isEmpty) return const TournamentMatchOpsConfig();
    final rules = map['autoScheduleRules'];
    return TournamentMatchOpsConfig(
      activeDayKey: (map['activeDayKey'] as String?)?.trim() ?? '',
      dayStart:
          (map['dayStart'] as String?)?.trim() ?? kDefaultMatchOpsDayStart,
      dayEnd: (map['dayEnd'] as String?)?.trim() ?? kDefaultMatchOpsDayEnd,
      defaultMatchDurationMin:
          (map['defaultMatchDurationMin'] as num?)?.toInt() ?? 30,
      minRestBetweenMatchesMin:
          (map['minRestBetweenMatchesMin'] as num?)?.toInt() ?? 30,
      checkInToleranceMin: (map['checkInToleranceMin'] as num?)?.toInt() ?? 15,
      avoidAthleteConflict: rules is Map
          ? rules['avoidAthleteConflict'] != false
          : true,
      respectBracketDeps:
          rules is Map ? rules['respectBracketDeps'] != false : true,
      seedOnPrimeCourt:
          rules is Map ? rules['seedOnPrimeCourt'] == true : false,
    );
  }

  Map<String, dynamic> toMap() => {
        'activeDayKey': activeDayKey,
        'dayStart': dayStart,
        'dayEnd': dayEnd,
        'defaultMatchDurationMin': defaultMatchDurationMin,
        'minRestBetweenMatchesMin': minRestBetweenMatchesMin,
        'checkInToleranceMin': checkInToleranceMin,
        'autoScheduleRules': {
          'avoidAthleteConflict': avoidAthleteConflict,
          'respectBracketDeps': respectBracketDeps,
          'seedOnPrimeCourt': seedOnPrimeCourt,
        },
      };
}

/// Linha enriquecida para UI do organizador.
class OrganizerMatchRow {
  const OrganizerMatchRow({required this.match});

  final TournamentMatch match;

  bool get isLive => match.isInProgress;

  bool get isFinished => match.isCompleted;

  bool get isScheduled =>
      !isLive && !isFinished;

  MatchQueueStatus? get queueStatus =>
      MatchQueueStatus.parse(match.queueStatus);

  MatchCheckInStatus get checkInA =>
      MatchCheckInStatus.parse(match.checkInTeamAStatus) ??
      MatchCheckInStatus.pending;

  MatchCheckInStatus get checkInB =>
      MatchCheckInStatus.parse(match.checkInTeamBStatus) ??
      MatchCheckInStatus.pending;

  bool get bothPresent =>
      checkInA == MatchCheckInStatus.present &&
      checkInB == MatchCheckInStatus.present;

  bool get hasCheckInPending =>
      checkInA == MatchCheckInStatus.pending ||
      checkInB == MatchCheckInStatus.pending;
}

/// Resumo de quadra para painel G3.
class CourtSummary {
  const CourtSummary({
    required this.court,
    this.currentMatch,
    this.nextMatch,
    this.upcomingCount = 0,
  });

  final TournamentCourt court;
  final TournamentMatch? currentMatch;
  final TournamentMatch? nextMatch;
  final int upcomingCount;

  bool get isFree => currentMatch == null;
}

/// Conflito de agendamento (descanso ou sobreposição).
class ScheduleConflict {
  const ScheduleConflict({
    required this.type,
    required this.message,
    this.matchId = '',
    this.teamId = '',
  });

  final String type;
  final String message;
  final String matchId;
  final String teamId;

  bool get isBlocking => type == 'overlap';
}

/// KPIs do painel de quadras.
class CourtPanelKpis {
  const CourtPanelKpis({
    required this.totalCourts,
    required this.activeCourts,
    required this.freeCourts,
    required this.waitingQueue,
  });

  final int totalCourts;
  final int activeCourts;
  final int freeCourts;
  final int waitingQueue;
}

/// Insights de atraso (J3).
class MatchDelayInsights {
  const MatchDelayInsights({
    required this.averageDelayMin,
    required this.delayedMatches,
    required this.onTimeMatches,
    required this.courtPace,
    this.suggestion = '',
  });

  final double averageDelayMin;
  final int delayedMatches;
  final int onTimeMatches;
  final Map<String, double> courtPace;
  final String suggestion;
}

/// Evento de audit log (I4).
class MatchAuditLogEntry {
  const MatchAuditLogEntry({
    required this.id,
    required this.type,
    required this.at,
    required this.byUid,
    this.byRole = '',
    this.meta = const {},
  });

  final String id;
  final String type;
  final DateTime at;
  final String byUid;
  final String byRole;
  final Map<String, dynamic> meta;
}

/// Seções da central G1.
class OrganizerMatchCenterSections {
  const OrganizerMatchCenterSections({
    this.live = const [],
    this.upcoming = const [],
    this.finished = const [],
  });

  final List<OrganizerMatchRow> live;
  final List<OrganizerMatchRow> upcoming;
  final List<OrganizerMatchRow> finished;
}
