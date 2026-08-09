import 'package:intl/intl.dart';

import '../../tournaments/domain/compete_hub_models.dart';
import 'gamification_models.dart';
import 'match_history/athlete_match_history_models.dart';

/// KPIs e série de evolução da Home do atleta (paridade com o painel web:
/// Jogos no mês · Vitórias · Sequência · Ranking + gráfico de 12 meses).
/// Módulo puro — sem Flutter, sem Firestore.

enum AthleteHomeKpiTone { green, orange }

class AthleteHomeKpi {
  const AthleteHomeKpi({
    required this.label,
    required this.value,
    required this.delta,
    required this.note,
    required this.tone,
    this.arrow = false,
    this.flame = false,
  });

  final String label;
  final String value;

  /// Texto colorido ao lado da nota ("+2", "3V · 1D", "em jogo").
  final String delta;
  final String note;
  final AthleteHomeKpiTone tone;

  /// Delta é comparação com o mês anterior — mostra seta (pra baixo no tone
  /// laranja).
  final bool arrow;
  final bool flame;
}

/// Chave ano*12+mês pra agrupar partidas por mês (rolling 12 meses).
int monthKeyOf(DateTime date) => date.year * 12 + (date.month - 1);

List<AthleteHomeKpi> buildAthleteHomeKpis({
  required List<AthleteMatchHistoryItem> matches,
  required GamificationSummary gamification,
  CompeteHubUserRanking? ranking,
  required DateTime now,
}) {
  final currentKey = monthKeyOf(now);
  int inMonth(int key) =>
      matches.where((m) => monthKeyOf(m.playedAt) == key).length;
  final gamesThisMonth = inMonth(currentKey);
  final monthDiff = gamesThisMonth - inMonth(currentKey - 1);

  final wins = matches.where((m) => m.isWin).length;
  final losses = matches.length - wins;
  final winPct =
      matches.isNotEmpty ? (wins / matches.length * 100).round() : null;

  final streak = gamification.streak;

  final ranked = ranking != null && !ranking.isUnranked && ranking.rank > 0;
  final points = ranking?.points ?? 0;
  final tournamentsCount = ranking?.tournamentsCount ?? 0;

  return [
    AthleteHomeKpi(
      label: 'Jogos no mês',
      value: '$gamesThisMonth',
      delta: '${monthDiff >= 0 ? '+' : ''}$monthDiff',
      note: 'vs mês anterior',
      tone: monthDiff >= 0
          ? AthleteHomeKpiTone.green
          : AthleteHomeKpiTone.orange,
      arrow: true,
    ),
    AthleteHomeKpi(
      label: 'Vitórias',
      value: winPct != null ? '$winPct%' : '—',
      delta: '${wins}V · ${losses}D',
      note: 'partidas de torneio',
      tone: AthleteHomeKpiTone.green,
    ),
    AthleteHomeKpi(
      label: 'Sequência',
      value: '$streak ${streak == 1 ? 'dia' : 'dias'}',
      delta: 'em jogo',
      note: 'dias ativos seguidos',
      tone: AthleteHomeKpiTone.orange,
      flame: true,
    ),
    AthleteHomeKpi(
      label: 'Ranking',
      value: ranked ? '#${ranking.rank}' : '—',
      delta: ranked && points > 0
          ? '${NumberFormat.decimalPattern('pt_BR').format(points)} pts'
          : 'sem pontos',
      note: ranked && tournamentsCount > 0
          ? '$tournamentsCount ${tournamentsCount == 1 ? 'torneio' : 'torneios'}'
          : 'temporada',
      tone: AthleteHomeKpiTone.green,
    ),
  ];
}

/// Série mensal real (últimos [monthLabels.length] meses) a partir das
/// partidas concluídas do histórico.
class AthleteEvolutionSeries {
  const AthleteEvolutionSeries({
    required this.monthLabels,
    required this.games,
    required this.winRatePct,
  });

  final List<String> monthLabels;
  final List<int> games;

  /// % de vitórias no mês; 0 quando não houve jogos.
  final List<int> winRatePct;
}

AthleteEvolutionSeries buildAthleteEvolutionSeries({
  required List<AthleteMatchHistoryItem> matches,
  required DateTime now,
  int monthCount = 12,
}) {
  final currentKey = monthKeyOf(now);
  final keys = [
    for (var i = 0; i < monthCount; i++) currentKey - (monthCount - 1) + i,
  ];

  final games = <int, int>{for (final key in keys) key: 0};
  final wins = <int, int>{for (final key in keys) key: 0};
  for (final match in matches) {
    final key = monthKeyOf(match.playedAt);
    if (!games.containsKey(key)) continue;
    games[key] = games[key]! + 1;
    if (match.isWin) wins[key] = wins[key]! + 1;
  }

  final monthFormat = DateFormat('MMM', 'pt_BR');
  String labelOf(int key) {
    final label =
        monthFormat.format(DateTime(key ~/ 12, key % 12 + 1)).replaceAll('.', '');
    if (label.isEmpty) return label;
    return label[0].toUpperCase() + label.substring(1);
  }

  return AthleteEvolutionSeries(
    monthLabels: [for (final key in keys) labelOf(key)],
    games: [for (final key in keys) games[key]!],
    winRatePct: [
      for (final key in keys)
        games[key]! > 0 ? (wins[key]! / games[key]! * 100).round() : 0,
    ],
  );
}

/// Escala do gráfico com folga no topo (15%) e na base (25%). Série constante
/// (ex.: tudo zero) abre 1 de folga pra não dividir por zero.
({double min, double max}) chartScale(List<num> data) {
  if (data.isEmpty) return (min: 0, max: 1);
  var maxValue = data.first.toDouble();
  var minValue = data.first.toDouble();
  for (final value in data) {
    if (value > maxValue) maxValue = value.toDouble();
    if (value < minValue) minValue = value.toDouble();
  }
  final max = maxValue * 1.15;
  final min = minValue * 0.75;
  if (max == min) {
    return (min: min - (min > 0 ? 1 : 0), max: max + 1);
  }
  return (min: min, max: max);
}

/// Valores normalizados 0..1 (0 = base do gráfico, 1 = topo) pro painter.
List<double> chartNormalizedValues(List<num> data) {
  final scale = chartScale(data);
  final range = scale.max - scale.min;
  return [
    for (final value in data) (value.toDouble() - scale.min) / range,
  ];
}
