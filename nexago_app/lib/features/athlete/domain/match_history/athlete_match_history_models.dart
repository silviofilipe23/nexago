/// Modelos do histórico de partidas e torneios do atleta.
enum AthleteMatchResult { win, loss }

enum MatchHistoryTab { matches, tournaments }

enum MatchHistoryFilter { all, year2026, year2025, winsOnly }

enum TournamentPlacement { gold, silver, bronze, other }

class AthleteMatchHistoryItem {
  const AthleteMatchHistoryItem({
    required this.id,
    required this.playedAt,
    required this.result,
    required this.opponentLabel,
    required this.competitionLabel,
    required this.scoreDisplay,
    this.setsDisplay,
    this.isMvp = false,
  });

  final String id;
  final DateTime playedAt;
  final AthleteMatchResult result;
  final String opponentLabel;
  final String competitionLabel;
  final String scoreDisplay;
  final String? setsDisplay;
  final bool isMvp;

  bool get isWin => result == AthleteMatchResult.win;
}

class MonthlyWinLossBar {
  const MonthlyWinLossBar({
    required this.month,
    required this.label,
    required this.wins,
    required this.losses,
  });

  final int month;
  final String label;
  final int wins;
  final int losses;
}

class AthleteSeasonSummary {
  const AthleteSeasonSummary({
    required this.year,
    required this.winRatePercent,
    required this.wins,
    required this.losses,
    this.trendPercent,
    this.monthlyBars = const [],
  });

  final int year;
  final double winRatePercent;
  final int wins;
  final int losses;
  final double? trendPercent;
  final List<MonthlyWinLossBar> monthlyBars;
}

class AthleteTournamentHistoryItem {
  const AthleteTournamentHistoryItem({
    required this.id,
    this.tournamentId,
    required this.name,
    required this.venue,
    required this.periodLabel,
    required this.categoryLabel,
    required this.genderLabel,
    required this.placement,
    required this.medal,
    required this.wins,
    required this.losses,
  });

  final String id;
  final String? tournamentId;
  final String name;
  final String venue;
  final String periodLabel;
  final String categoryLabel;
  final String genderLabel;
  final int placement;
  final TournamentPlacement medal;
  final int wins;
  final int losses;

  static TournamentPlacement medalForPlacement(int placement) {
    return switch (placement) {
      1 => TournamentPlacement.gold,
      2 => TournamentPlacement.silver,
      3 => TournamentPlacement.bronze,
      _ => TournamentPlacement.other,
    };
  }
}

class AthleteMatchHistoryBundle {
  const AthleteMatchHistoryBundle({
    required this.matches,
    required this.tournaments,
    required this.seasonSummary,
  });

  final List<AthleteMatchHistoryItem> matches;
  final List<AthleteTournamentHistoryItem> tournaments;
  final AthleteSeasonSummary seasonSummary;
}

class MatchHistoryMonthGroup {
  const MatchHistoryMonthGroup({
    required this.monthKey,
    required this.title,
    required this.summaryLabel,
    required this.matches,
  });

  final String monthKey;
  final String title;
  final String summaryLabel;
  final List<AthleteMatchHistoryItem> matches;
}

class TournamentMedalCounts {
  const TournamentMedalCounts({
    required this.total,
    required this.gold,
    required this.silver,
    required this.bronze,
  });

  final int total;
  final int gold;
  final int silver;
  final int bronze;
}
