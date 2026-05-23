import 'package:intl/intl.dart';

import 'athlete_match_history_models.dart';

const _monthLabels = <int, String>{
  1: 'JAN',
  2: 'FEV',
  3: 'MAR',
  4: 'ABR',
  5: 'MAI',
  6: 'JUN',
  7: 'JUL',
  8: 'AGO',
  9: 'SET',
  10: 'OUT',
  11: 'NOV',
  12: 'DEZ',
};

List<AthleteMatchHistoryItem> filterMatches(
  List<AthleteMatchHistoryItem> matches,
  MatchHistoryFilter filter,
) {
  return matches.where((m) {
    return switch (filter) {
      MatchHistoryFilter.all => true,
      MatchHistoryFilter.year2026 => m.playedAt.year == 2026,
      MatchHistoryFilter.year2025 => m.playedAt.year == 2025,
      MatchHistoryFilter.winsOnly => m.isWin,
    };
  }).toList();
}

int countForFilter(List<AthleteMatchHistoryItem> all, MatchHistoryFilter filter) {
  return filterMatches(all, filter).length;
}

List<MatchHistoryMonthGroup> groupMatchesByMonth(
  List<AthleteMatchHistoryItem> matches,
) {
  final sorted = [...matches]
    ..sort((a, b) => b.playedAt.compareTo(a.playedAt));

  final map = <String, List<AthleteMatchHistoryItem>>{};
  for (final m in sorted) {
    final key = '${m.playedAt.year}-${m.playedAt.month.toString().padLeft(2, '0')}';
    map.putIfAbsent(key, () => []).add(m);
  }

  final keys = map.keys.toList()..sort((a, b) => b.compareTo(a));

  return keys.map((key) {
    final list = map[key]!;
    final first = list.first.playedAt;
    final wins = list.where((m) => m.isWin).length;
    final losses = list.length - wins;
    final monthName = _monthNamePt(first.month);
    return MatchHistoryMonthGroup(
      monthKey: key,
      title: '$monthName • ${first.year}',
      summaryLabel:
          '${list.length} JOGOS • ${wins}V ${losses}D',
      matches: list,
    );
  }).toList();
}

String _monthNamePt(int month) {
  const names = [
    '',
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  return names[month.clamp(1, 12)];
}

AthleteSeasonSummary buildSeasonSummary({
  required List<AthleteMatchHistoryItem> matches,
  required int year,
  double? trendPercent,
}) {
  final yearMatches =
      matches.where((m) => m.playedAt.year == year).toList();
  final wins = yearMatches.where((m) => m.isWin).length;
  final losses = yearMatches.length - wins;
  final total = yearMatches.length;
  final winRate = total == 0 ? 0.0 : (wins / total) * 100;

  final bars = <MonthlyWinLossBar>[];
  for (var month = 1; month <= 12; month++) {
    final inMonth = yearMatches.where((m) => m.playedAt.month == month);
    if (inMonth.isEmpty) continue;
    final mWins = inMonth.where((m) => m.isWin).length;
    final mLosses = inMonth.length - mWins;
    bars.add(
      MonthlyWinLossBar(
        month: month,
        label: _monthLabels[month] ?? DateFormat('MMM').format(
          DateTime(year, month),
        ).toUpperCase(),
        wins: mWins,
        losses: mLosses,
      ),
    );
  }

  return AthleteSeasonSummary(
    year: year,
    winRatePercent: winRate,
    wins: wins,
    losses: losses,
    trendPercent: trendPercent,
    monthlyBars: bars,
  );
}

TournamentMedalCounts countTournamentMedals(
  List<AthleteTournamentHistoryItem> tournaments,
) {
  var gold = 0;
  var silver = 0;
  var bronze = 0;
  for (final t in tournaments) {
    switch (t.medal) {
      case TournamentPlacement.gold:
        gold++;
      case TournamentPlacement.silver:
        silver++;
      case TournamentPlacement.bronze:
        bronze++;
      case TournamentPlacement.other:
        break;
    }
  }
  return TournamentMedalCounts(
    total: tournaments.length,
    gold: gold,
    silver: silver,
    bronze: bronze,
  );
}

String matchHistorySettingsSubtitle({
  required int matchCount,
  required int tournamentCount,
}) {
  return '$matchCount jogos · $tournamentCount torneios';
}
