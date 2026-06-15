import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import 'match_ops_models.dart';

/// Filtros e agrupamentos da central de partidas (G1/G2/G3/J3).
abstract final class MatchOpsLogic {
  MatchOpsLogic._();

  static List<OrganizerMatchRow> toRows(List<TournamentMatch> matches) {
    return matches.map((m) => OrganizerMatchRow(match: m)).toList();
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
                  r.isLive ||
                  r.queueStatus == MatchQueueStatus.onCourt ||
                  r.match.isOnCourt,
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
      if (row.isLive || row.match.isOnCourt) {
        live.add(row);
      } else if (row.isFinished) {
        finished.add(row);
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
        if (m.isInProgress || m.isOnCourt || m.queueStatus == 'on_court') {
          current = m;
          break;
        }
      }

      final scheduled = courtMatches
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
    if (dayKey.trim().isEmpty) return matches;
    return matches.where((m) => m.dayKey == dayKey).toList();
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
}
