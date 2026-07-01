import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_card_view_model.dart';
import '../../../tournaments/domain/tournament_discovery_providers.dart';
import '../../data/organizer_match_ops_repository.dart';
import '../../data/organizer_match_schedule_service.dart';
import '../tournament_ops/tournament_ops_providers.dart';
import 'match_ops_logic.dart';
import 'match_ops_models.dart';
import 'schedule_logic.dart';

export 'match_ops_logic.dart';
export 'match_ops_models.dart';
export 'match_scoring_logic.dart';
export 'schedule_logic.dart';

final organizerMatchOpsRepositoryProvider =
    Provider<OrganizerMatchOpsRepository>((ref) {
  return OrganizerMatchOpsRepository();
});

/// Sincroniza `courts[]` com `courtsCount` do torneio ao abrir telas de match ops.
void bootstrapOrganizerTournamentCourts(WidgetRef ref, String tournamentId) {
  final id = tournamentId.trim();
  if (id.isEmpty) return;
  ref
      .read(organizerMatchOpsRepositoryProvider)
      .ensureCourtsInitialized(tournamentId: id);
}

final organizerMatchScheduleServiceProvider =
    Provider<OrganizerMatchScheduleService>((ref) {
  return OrganizerMatchScheduleService();
});

/// Stream compartilhado de partidas do torneio (G1/G2/G3/H1).
final organizerTournamentMatchesProvider = StreamProvider.autoDispose
    .family<List<TournamentMatch>, String>((ref, tournamentId) {
  if (tournamentId.trim().isEmpty) return Stream.value(const []);
  return ref
      .watch(tournamentMatchesRepositoryProvider)
      .watchByTournament(tournamentId.trim());
});

/// Partidas enriquecidas com fotos e nomes das duplas (por matchId).
final organizerMatchCardsByIdProvider = StreamProvider.autoDispose
    .family<Map<String, TournamentMatchCardViewModel>, String>(
        (ref, tournamentId) {
  final tid = tournamentId.trim();
  if (tid.isEmpty) return Stream.value(const {});
  final repo = ref.watch(tournamentMatchesRepositoryProvider);
  final enrichment = ref.watch(tournamentMatchEnrichmentServiceProvider);
  return repo.watchByTournament(tid).asyncMap((matches) async {
    final cards = await enrichment.enrichMatches(matches);
    return {for (final card in cards) card.match.id: card};
  });
});

final organizerMatchOpsConfigProvider = StreamProvider.autoDispose
    .family<TournamentMatchOpsConfig, String>((ref, tournamentId) {
  return ref
      .watch(organizerMatchOpsRepositoryProvider)
      .watchMatchOpsConfig(tournamentId);
});

final organizerTournamentCourtsProvider = StreamProvider.autoDispose
    .family<List<TournamentCourt>, String>((ref, tournamentId) {
  return ref
      .watch(organizerMatchOpsRepositoryProvider)
      .watchCourts(tournamentId);
});

final organizerMatchCenterFilterProvider = NotifierProvider.autoDispose
    .family<_MatchCenterFilterNotifier, OrganizerMatchCenterFilter, String>(
  _MatchCenterFilterNotifier.new,
);

class _MatchCenterFilterNotifier
    extends AutoDisposeFamilyNotifier<OrganizerMatchCenterFilter, String> {
  @override
  OrganizerMatchCenterFilter build(String arg) =>
      OrganizerMatchCenterFilter.all;

  void select(OrganizerMatchCenterFilter filter) => state = filter;
}

final organizerMatchCenterCategoryProvider = NotifierProvider.autoDispose
    .family<_MatchCenterCategoryNotifier, String, String>(
  _MatchCenterCategoryNotifier.new,
);

class _MatchCenterCategoryNotifier
    extends AutoDisposeFamilyNotifier<String, String> {
  @override
  String build(String arg) => '';

  void select(String categoryId) => state = categoryId;
}

DateTime? _matchOpsFirestoreDate(dynamic value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  return null;
}

/// Dias disponíveis na grade H1 (intervalo do torneio ou partidas agendadas).
final organizerScheduleGridDayKeysProvider = Provider.autoDispose
    .family<List<String>, String>((ref, tournamentId) {
  final detail = ref.watch(organizerTournamentDetailProvider(tournamentId));
  final matches = ref.watch(organizerTournamentMatchesProvider(tournamentId));
  final tournament = detail.valueOrNull?.tournament;
  final startAt = _matchOpsFirestoreDate(tournament?['startAt']);
  final endAt = _matchOpsFirestoreDate(tournament?['endAt']);
  var days = ScheduleLogic.tournamentDayKeys(startAt: startAt, endAt: endAt);
  if (days.isEmpty) {
    days = ScheduleLogic.tournamentDayKeysFromMatches(
      matches.valueOrNull ?? const [],
    );
  }
  return days;
});

final organizerScheduleGridDayKeyProvider = NotifierProvider.autoDispose
    .family<_ScheduleGridDayKeyNotifier, String, String>(
  _ScheduleGridDayKeyNotifier.new,
);

/// Dia ativo de programação (grade, pick, H2, sheet, auto).
final organizerScheduleDayKeyProvider = organizerScheduleGridDayKeyProvider;

class _ScheduleGridDayKeyNotifier
    extends AutoDisposeFamilyNotifier<String, String> {
  var _userSelected = false;
  String _selectedDayKey = '';

  @override
  String build(String tournamentId) {
    ref.watch(organizerScheduleGridDayKeysProvider(tournamentId));
    ref.watch(organizerMatchOpsConfigProvider(tournamentId));

    if (_userSelected && _selectedDayKey.isNotEmpty) return _selectedDayKey;

    return _resolveDefault(tournamentId);
  }

  void select(String dayKey) {
    _userSelected = true;
    _selectedDayKey = dayKey.trim();
    state = _selectedDayKey;
  }

  String _resolveDefault(String tournamentId) {
    final days = ref.read(organizerScheduleGridDayKeysProvider(tournamentId));
    final config =
        ref.read(organizerMatchOpsConfigProvider(tournamentId)).valueOrNull;
    return ScheduleLogic.resolveScheduleGridDayKey(
      tournamentDays: days,
      activeDayKey: config?.activeDayKey,
      preferredDayKey: _userSelected ? _selectedDayKey : null,
    );
  }
}

@immutable
class OrganizerMatchOpsState {
  const OrganizerMatchOpsState({
    this.rows = const [],
    this.sections = const OrganizerMatchCenterSections(),
    this.categories = const [],
    this.courts = const [],
    this.config = const TournamentMatchOpsConfig(),
    this.courtSummaries = const [],
    this.callQueue = const [],
    this.courtKpis = const CourtPanelKpis(
      totalCourts: 0,
      activeCourts: 0,
      freeCourts: 0,
      waitingQueue: 0,
    ),
    this.insights = const MatchDelayInsights(
      averageDelayMin: 0,
      delayedMatches: 0,
      onTimeMatches: 0,
      courtPace: {},
    ),
    this.dayMatches = const [],
  });

  final List<OrganizerMatchRow> rows;
  final OrganizerMatchCenterSections sections;
  final List<String> categories;
  final List<TournamentCourt> courts;
  final TournamentMatchOpsConfig config;
  final List<CourtSummary> courtSummaries;
  final List<OrganizerMatchRow> callQueue;
  final CourtPanelKpis courtKpis;
  final MatchDelayInsights insights;
  final List<TournamentMatch> dayMatches;
}

final organizerMatchOpsStateProvider = Provider.autoDispose
    .family<OrganizerMatchOpsState, String>((ref, tournamentId) {
  final matches = ref.watch(organizerTournamentMatchesProvider(tournamentId));
  final courtsAsync = ref.watch(organizerTournamentCourtsProvider(tournamentId));
  final configAsync = ref.watch(organizerMatchOpsConfigProvider(tournamentId));
  final filter = ref.watch(organizerMatchCenterFilterProvider(tournamentId));
  final categoryFilter =
      ref.watch(organizerMatchCenterCategoryProvider(tournamentId));

  final allMatches = matches.valueOrNull ?? const <TournamentMatch>[];
  final courts = courtsAsync.valueOrNull ?? const <TournamentCourt>[];
  final config = configAsync.valueOrNull ?? const TournamentMatchOpsConfig();

  final rows = MatchOpsLogic.toRows(allMatches);
  final filtered = MatchOpsLogic.filterCenter(
    rows,
    filter: filter,
    categoryId: categoryFilter,
  );
  final sections = MatchOpsLogic.groupCenterSections(filtered);
  final categories = MatchOpsLogic.extractCategories(allMatches);
  final callQueue = MatchOpsLogic.sortCallQueue(rows);
  final courtSummaries = MatchOpsLogic.buildCourtSummaries(
    courts: courts,
    matches: allMatches,
  );
  final courtKpis = MatchOpsLogic.computeCourtPanelKpis(
    summaries: courtSummaries,
    queue: callQueue,
  );
  final dayKey = ref.watch(organizerScheduleDayKeyProvider(tournamentId));
  final dayMatches = MatchOpsLogic.matchesForDay(allMatches, dayKey);
  final insights = MatchOpsLogic.computeDelayInsights(
    matches: allMatches,
    dayKey: dayKey,
  );

  return OrganizerMatchOpsState(
    rows: filtered,
    sections: sections,
    categories: categories,
    courts: courts,
    config: config,
    courtSummaries: courtSummaries,
    callQueue: callQueue,
    courtKpis: courtKpis,
    insights: insights,
    dayMatches: dayMatches,
  );
});

final organizerMatchByIdProvider = StreamProvider.autoDispose
    .family<TournamentMatch?, ({String tournamentId, String matchId})>(
        (ref, key) {
  if (key.matchId.trim().isEmpty) return Stream.value(null);
  return ref.watch(tournamentMatchesRepositoryProvider).watchById(key.matchId);
});

final organizerMatchPointEventsProvider = StreamProvider.autoDispose
    .family<List<dynamic>, String>((ref, matchId) {
  if (matchId.trim().isEmpty) return Stream.value(const []);
  return ref
      .watch(tournamentMatchesRepositoryProvider)
      .watchPointEvents(matchId);
});

final organizerMatchAuditLogProvider = StreamProvider.autoDispose
    .family<List<MatchAuditLogEntry>, String>((ref, matchId) {
  if (matchId.trim().isEmpty) return Stream.value(const []);
  return ref
      .watch(organizerMatchOpsRepositoryProvider)
      .watchAuditLog(matchId);
});
