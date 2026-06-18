import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_card_view_model.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import '../category_ops/category_ops_models.dart';
import '../tournament_ops/tournament_ops_models.dart';
import 'match_ops_models.dart';
import 'schedule_logic.dart';

/// Filtros e agrupamentos da central de partidas (G1/G2/G3/J3).
abstract final class MatchOpsLogic {
  MatchOpsLogic._();

  static List<OrganizerMatchRow> toRows(List<TournamentMatch> matches) {
    return matches.map((m) => OrganizerMatchRow(match: m)).toList();
  }

  /// Converte time enriquecido (foto + nomes) para avatares do organizador.
  static (OrganizerCategoryPlayerInfo, OrganizerCategoryPlayerInfo)
  teamPlayersFromCardTeam({
    required TournamentMatchCardTeamViewModel team,
    required String teamId,
  }) {
    final names = team.displayName
        .split('/')
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty)
        .toList();
    final id = teamId.trim();

    OrganizerCategoryPlayerInfo at(int index) {
      final name = index < names.length ? names[index] : '';
      final cardPlayer = index < team.players.length
          ? team.players[index]
          : null;
      return OrganizerCategoryPlayerInfo(
        uid: id.isEmpty ? 'match-$index' : '$id-$index',
        name: name,
        profilePhotoUrl: cardPlayer?.avatarUrl?.trim() ?? '',
      );
    }

    return (at(0), at(1));
  }

  /// Resolve `categoryId` do match para rótulo exibível (`MASC Open`, etc.).
  static String categoryDisplayLabel({
    required String categoryId,
    List<OrganizerTournamentCategorySummary> categories = const [],
  }) {
    final id = categoryId.trim();
    if (id.isEmpty) return '';

    for (final category in categories) {
      if (category.categoryId.trim() != id) continue;
      return _categoryLabelWithGender(category);
    }
    return id;
  }

  static String _categoryLabelWithGender(
    OrganizerTournamentCategorySummary category,
  ) {
    final name = category.name.trim();
    final genderShort = categoryGenderShortLabel(category.genderLabel);
    final base = name.isNotEmpty ? name : category.categoryId.trim();
    if (genderShort.isEmpty) return base;

    final upperBase = base.toUpperCase();
    if (upperBase.startsWith(genderShort) ||
        upperBase.contains('$genderShort ')) {
      return base;
    }
    return '$genderShort $base';
  }

  /// A partida só pode ser liberada quando as DUAS duplas fizeram check-in.
  static bool canReleaseAfterCheckIn(
    MatchCheckInStatus teamA,
    MatchCheckInStatus teamB,
  ) {
    return teamA == MatchCheckInStatus.present &&
        teamB == MatchCheckInStatus.present;
  }

  static String categoryGenderShortLabel(String genderLabel) {
    final g = genderLabel.trim().toLowerCase();
    if (g.startsWith('masc')) return 'MASC';
    if (g.startsWith('fem')) return 'FEM';
    if (g.startsWith('mist')) return 'MISTO';
    return '';
  }

  static List<OrganizerMatchRow> filterCenter(
    List<OrganizerMatchRow> rows, {
    OrganizerMatchCenterFilter filter = OrganizerMatchCenterFilter.all,
    String categoryId = '',
  }) {
    var result = rows;
    if (categoryId.trim().isNotEmpty) {
      result = result
          .where((r) => r.match.categoryId == categoryId.trim())
          .toList();
    }
    switch (filter) {
      case OrganizerMatchCenterFilter.all:
        return result;
      case OrganizerMatchCenterFilter.live:
        return result.where((r) => r.isLive).toList();
      case OrganizerMatchCenterFilter.onCourt:
        return result
            .where(
              (r) =>
                  !r.isFinished &&
                  (r.isLive ||
                      r.queueStatus == MatchQueueStatus.onCourt ||
                      r.match.isOnCourt),
            )
            .toList();
    }
  }

  static OrganizerMatchCenterSections groupCenterSections(
    List<OrganizerMatchRow> rows,
  ) {
    final live = <OrganizerMatchRow>[];
    final upcoming = <OrganizerMatchRow>[];
    final finished = <OrganizerMatchRow>[];

    for (final row in rows) {
      if (row.isFinished) {
        finished.add(row);
      } else if (row.isLive || row.match.isOnCourt) {
        live.add(row);
      } else if (row.isScheduled) {
        upcoming.add(row);
      }
    }

    live.sort(_compareBySchedule);
    upcoming.sort(_compareByQueueThenSchedule);
    finished.sort((a, b) {
      final ea = a.match.matchEndedAt ?? a.match.scheduleTime;
      final eb = b.match.matchEndedAt ?? b.match.scheduleTime;
      if (ea == null && eb == null) return 0;
      if (ea == null) return 1;
      if (eb == null) return -1;
      return eb.compareTo(ea);
    });

    return OrganizerMatchCenterSections(
      live: live,
      upcoming: upcoming,
      finished: finished,
    );
  }

  static List<String> extractCategories(List<TournamentMatch> matches) {
    final cats = matches.map((m) => m.categoryId).where((c) => c.isNotEmpty);
    return cats.toSet().toList()..sort();
  }

  static List<OrganizerMatchRow> sortCallQueue(List<OrganizerMatchRow> rows) {
    final queue = rows
        .where(
          (r) =>
              !r.isFinished &&
              (r.queueStatus == MatchQueueStatus.waiting ||
                  r.queueStatus == MatchQueueStatus.onDeck),
        )
        .toList();
    queue.sort(_compareByQueueThenSchedule);
    return queue;
  }

  static List<CourtSummary> buildCourtSummaries({
    required List<TournamentCourt> courts,
    required List<TournamentMatch> matches,
  }) {
    final sortedCourts = [...courts]
      ..sort((a, b) => a.order.compareTo(b.order));

    return sortedCourts.map((court) {
      final courtMatches = matches
          .where(
            (m) =>
                m.courtId == court.id ||
                (m.courtId.isEmpty && m.courtName == court.name),
          )
          .toList();

      TournamentMatch? current;
      for (final m in courtMatches) {
        if (m.isCompleted) continue;
        if (m.isInProgress || m.isOnCourt || m.queueStatus == 'on_court') {
          current = m;
          break;
        }
      }

      final scheduled =
          courtMatches
              .where(
                (m) =>
                    !m.isCompleted &&
                    m.id != current?.id &&
                    m.scheduleTime != null,
              )
              .toList()
            ..sort((a, b) {
              final ta = a.scheduleTime!;
              final tb = b.scheduleTime!;
              return ta.compareTo(tb);
            });

      final next = scheduled.isNotEmpty ? scheduled.first : null;
      final upcoming = scheduled.length > (next != null ? 1 : 0)
          ? scheduled.length - 1
          : scheduled.length;

      return CourtSummary(
        court: court,
        currentMatch: current,
        nextMatch: next,
        upcomingCount: upcoming,
      );
    }).toList();
  }

  static CourtPanelKpis computeCourtPanelKpis({
    required List<CourtSummary> summaries,
    required List<OrganizerMatchRow> queue,
  }) {
    final total = summaries.length;
    final active = summaries.where((s) => s.currentMatch != null).length;
    return CourtPanelKpis(
      totalCourts: total,
      activeCourts: active,
      freeCourts: total - active,
      waitingQueue: queue.length,
    );
  }

  static MatchDelayInsights computeDelayInsights({
    required List<TournamentMatch> matches,
    required String dayKey,
  }) {
    final dayMatches = matches
        .where((m) => dayKey.isEmpty || m.dayKey == dayKey)
        .where((m) => m.scheduleTime != null)
        .toList();

    if (dayMatches.isEmpty) {
      return const MatchDelayInsights(
        averageDelayMin: 0,
        delayedMatches: 0,
        onTimeMatches: 0,
        courtPace: {},
      );
    }

    var totalDelay = 0.0;
    var delayed = 0;
    var onTime = 0;
    final courtDelays = <String, List<double>>{};

    for (final m in dayMatches) {
      final scheduled = m.scheduleTime!;
      final actual = m.matchStartedAt ?? scheduled;
      final delayMin = actual.difference(scheduled).inMinutes.toDouble();
      if (delayMin > 5) {
        delayed++;
        totalDelay += delayMin;
      } else {
        onTime++;
      }
      final court = m.effectiveCourtLabel.isNotEmpty
          ? m.effectiveCourtLabel
          : 'Sem quadra';
      courtDelays.putIfAbsent(court, () => []).add(delayMin);
    }

    final avg = delayed > 0 ? totalDelay / delayed : 0.0;
    final pace = <String, double>{};
    for (final e in courtDelays.entries) {
      if (e.value.isEmpty) continue;
      pace[e.key] = e.value.reduce((a, b) => a + b) / e.value.length;
    }

    var suggestion = '';
    if (delayed > onTime) {
      suggestion =
          'Considere aumentar o intervalo entre partidas ou reduzir a duração padrão.';
    } else if (avg > 15) {
      suggestion = 'Atraso médio elevado — revise a fila de chamada.';
    }

    return MatchDelayInsights(
      averageDelayMin: avg,
      delayedMatches: delayed,
      onTimeMatches: onTime,
      courtPace: pace,
      suggestion: suggestion,
    );
  }

  static List<TournamentCourt> defaultCourtsFromCount(int count) {
    final n = count < 1 ? 1 : count;
    return List.generate(
      n,
      (i) => TournamentCourt(
        id: 'Q${i + 1}',
        name: 'Quadra ${i + 1}',
        order: i + 1,
      ),
    );
  }

  static int compareMatchesForGrid(TournamentMatch a, TournamentMatch b) {
    final ta = a.scheduleTime;
    final tb = b.scheduleTime;
    if (ta == null && tb == null) return a.matchNumber.compareTo(b.matchNumber);
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta.compareTo(tb);
  }

  static List<TournamentMatch> matchesForDay(
    List<TournamentMatch> matches,
    String dayKey,
  ) {
    final key = dayKey.trim();
    if (key.isEmpty) return matches;
    return matches.where((m) => _matchBelongsToDay(m, key)).toList();
  }

  /// Partidas sem horário/quadra ainda não têm `dayKey` — entram no dia ativo.
  static bool _matchBelongsToDay(TournamentMatch match, String dayKey) {
    final matchDayKey = match.dayKey.trim();
    if (matchDayKey.isNotEmpty) return matchDayKey == dayKey;

    if (_isUnscheduledMatch(match)) return true;

    final scheduleTime = match.scheduleTime;
    if (scheduleTime != null) {
      return ScheduleLogic.dayKeyFromDate(scheduleTime) == dayKey;
    }

    return false;
  }

  static bool _isUnscheduledMatch(TournamentMatch match) {
    if (TournamentMatchStatus.isCompleted(match.status)) return false;
    return match.scheduleTime == null ||
        (match.courtId.isEmpty && match.effectiveCourtLabel.isEmpty);
  }

  static int _compareBySchedule(OrganizerMatchRow a, OrganizerMatchRow b) {
    return compareMatchesForGrid(a.match, b.match);
  }

  static int _compareByQueueThenSchedule(
    OrganizerMatchRow a,
    OrganizerMatchRow b,
  ) {
    final q = a.match.queueOrder.compareTo(b.match.queueOrder);
    if (q != 0) return q;
    return _compareBySchedule(a, b);
  }

  /// Mensagem amigável (PT) para erros ao salvar/lançar placar, a partir do
  /// `code`/`message` de uma exceção do Firebase (Functions ou Firestore).
  /// Mantida pura para teste; a extração de code/message fica na camada de UI.
  static String friendlyScoreError({String? code, String? message}) {
    final msg = message?.trim() ?? '';
    switch (code) {
      case 'unauthenticated':
        return 'Sua sessão expirou. Entre novamente para lançar o placar.';
      case 'permission-denied':
        return 'Você não tem permissão para lançar o placar desta partida.';
      case 'failed-precondition':
        // O servidor já devolve mensagem em PT e específica.
        return msg.isNotEmpty
            ? msg
            : 'A partida não está pronta para receber este placar.';
      case 'invalid-argument':
        return msg.isNotEmpty ? msg : 'Placar inválido.';
      case 'unavailable':
      case 'deadline-exceeded':
        return 'Sem conexão. Verifique a internet e tente de novo.';
    }
    return 'Não foi possível salvar o placar. Tente novamente.';
  }
}
