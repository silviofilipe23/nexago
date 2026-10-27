import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_rating.dart';
import '../../../domain/level_points_history.dart';
import '../../../domain/rating_ladder.dart';
import 'how_it_works_parts.dart';

/// "Sua evolução": os pontos de nível partida a partida, com as marcas do
/// nível atual como referência. Some enquanto o atleta não tem partida
/// rateada no esporte.
class LevelPointsEvolution extends ConsumerWidget {
  const LevelPointsEvolution({
    super.key,
    required this.sportCode,
    required this.ladder,
  });

  final String sportCode;
  final RatingLadder ladder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history =
        ref.watch(levelPointsHistoryProvider(sportCode)).valueOrNull ??
            const <LevelPointsEntry>[];
    final summary = summarizeLevelPoints(history);
    if (summary == null) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final colors = context.themeColors;
    final levelCode =
        ref.watch(athleteRatingProvider(sportCode)).valueOrNull?.levelCode;
    final level = resolveRatingLadderLevel(ladder.levels, levelCode);
    final demoteAt = ladder.autoRelegates ? level.demoteAt : null;
    final delta = summary.delta;
    final signed = delta > 0 ? '+${_fmt(delta)}' : _fmt(delta);

    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: HowItWorksSection(
        title: 'Sua evolução',
        child: HowItWorksCard(
          padding: const EdgeInsets.fromLTRB(16, 16, 12, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(text: 'De ${_fmt(summary.start)} a '),
                    TextSpan(
                      text: '${_fmt(summary.current)} pts',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                    TextSpan(text: ' ($signed)'),
                  ],
                ),
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontSize: 13.5,
                  color: colors.onSurfaceMuted,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '${summary.matches == 1 ? '1 partida' : '${summary.matches} partidas'}'
                ' · ${summary.wins} V · ${summary.losses} D · pico '
                '${_fmt(summary.peak)}',
                style: theme.textTheme.bodySmall?.copyWith(
                  fontSize: 11.5,
                  color: colors.onSurfaceMuted,
                ),
              ),
              const SizedBox(height: 12),
              Semantics(
                label:
                    'Evolução dos pontos de nível: de ${_fmt(summary.start)} '
                    'a ${_fmt(summary.current)} em ${summary.matches} '
                    'partidas, pico de ${_fmt(summary.peak)}.',
                child: ExcludeSemantics(
                  child: SizedBox(
                    height: 180,
                    child: _Chart(
                      history: history,
                      start: summary.start,
                      promoteAt: level.promoteAt,
                      demoteAt: demoteAt,
                    ),
                  ),
                ),
              ),
              // Legenda das linhas tracejadas fora do gráfico: rótulo em cima
              // da linha encostava na série.
              if (level.promoteAt != null || demoteAt != null) ...[
                const SizedBox(height: 6),
                Wrap(
                  spacing: 14,
                  runSpacing: 4,
                  children: [
                    if (level.promoteAt != null)
                      _MarkKey('sobe em ${_fmt(level.promoteAt!)}'),
                    if (demoteAt != null)
                      _MarkKey('desce em ${_fmt(demoteAt)}'),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

String _fmt(int points) => NumberFormat.decimalPattern('pt_BR').format(points);

class _Chart extends StatelessWidget {
  const _Chart({
    required this.history,
    required this.start,
    this.promoteAt,
    this.demoteAt,
  });

  final List<LevelPointsEntry> history;
  final int start;
  final int? promoteAt;
  final int? demoteAt;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    // Ponto 0 = antes da 1ª partida; ponto i = depois da partida i.
    final values = [start, for (final e in history) e.after];
    final last = values.length - 1;
    final marks = [
      if (promoteAt != null) promoteAt!,
      if (demoteAt != null) demoteAt!,
    ];
    final lo = [...values, ...marks].reduce(math.min);
    final hi = [...values, ...marks].reduce(math.max);
    final minY = ((lo - 40) / 50).floor() * 50.0;
    final maxY = ((hi + 40) / 50).ceil() * 50.0;
    final step = math.max(50.0, (((maxY - minY) / 3) / 50).ceil() * 50.0);

    final axisStyle = AppTypography.mono(
      fontSize: 10,
      fontWeight: FontWeight.w500,
      color: colors.onSurfaceMuted,
    );
    final dayFormat = DateFormat('dd/MM');

    HorizontalLine mark(int y) => HorizontalLine(
          y: y.toDouble(),
          color: colors.onSurfaceMuted.withValues(alpha: 0.55),
          strokeWidth: 1,
          dashArray: const [4, 4],
        );

    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: LineChart(
        LineChartData(
          minX: 0,
          maxX: last.toDouble(),
          minY: minY,
          maxY: maxY,
          // Sem clip: o marcador do ponto de agora fica na borda direita.
          clipData: const FlClipData.none(),
          borderData: FlBorderData(show: false),
          gridData: FlGridData(
            drawVerticalLine: false,
            horizontalInterval: step,
            getDrawingHorizontalLine: (_) => FlLine(
              color: colors.onSurfaceMuted.withValues(alpha: 0.1),
              strokeWidth: 1,
            ),
          ),
          extraLinesData: ExtraLinesData(
            horizontalLines: [
              if (promoteAt != null) mark(promoteAt!),
              if (demoteAt != null) mark(demoteAt!),
            ],
          ),
          titlesData: FlTitlesData(
            topTitles: const AxisTitles(),
            rightTitles: const AxisTitles(),
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 40,
                interval: step,
                getTitlesWidget: (value, meta) {
                  if (value == meta.min || value == meta.max) {
                    return const SizedBox.shrink();
                  }
                  return Text(_fmt(value.round()), style: axisStyle);
                },
              ),
            ),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 22,
                interval: 1,
                getTitlesWidget: (value, meta) {
                  final i = value.round();
                  // Só as pontas: a data da 1ª e da última partida.
                  if (history.isEmpty || (i != 0 && i != last)) {
                    return const SizedBox.shrink();
                  }
                  final entry = history[i == 0 ? 0 : i - 1];
                  return SideTitleWidget(
                    meta: meta,
                    space: 6,
                    fitInside: SideTitleFitInsideData.fromTitleMeta(
                      meta,
                      distanceFromEdge: 0,
                    ),
                    child:
                        Text(dayFormat.format(entry.endedAt), style: axisStyle),
                  );
                },
              ),
            ),
          ),
          lineTouchData: LineTouchData(
            // Fio neutro e o ponto marcado — o padrão era uma barra grossa na
            // cor da série, que escondia o próprio ponto.
            getTouchedSpotIndicator: (bar, indexes) => [
              for (final _ in indexes)
                TouchedSpotIndicatorData(
                  FlLine(
                    color: colors.onSurfaceMuted.withValues(alpha: 0.4),
                    strokeWidth: 1,
                  ),
                  FlDotData(
                    getDotPainter: (spot, percent, bar, index) =>
                        FlDotCirclePainter(
                      radius: 4.5,
                      color: colors.brandText,
                      strokeWidth: 2,
                      strokeColor: colors.surfaceCard,
                    ),
                  ),
                ),
            ],
            touchTooltipData: LineTouchTooltipData(
              getTooltipColor: (_) => theme.colorScheme.inverseSurface,
              fitInsideHorizontally: true,
              fitInsideVertically: true,
              getTooltipItems: (spots) => [
                for (final spot in spots)
                  LineTooltipItem(
                    _tooltip(spot.x.round(), dayFormat),
                    TextStyle(
                      color: theme.colorScheme.onInverseSurface,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
              ],
            ),
          ),
          lineBarsData: [
            LineChartBarData(
              spots: [
                for (var i = 0; i < values.length; i++)
                  FlSpot(i.toDouble(), values[i].toDouble()),
              ],
              color: colors.brandText,
              barWidth: 2,
              isStrokeCapRound: true,
              isStrokeJoinRound: true,
              dotData: FlDotData(
                // Só o ponto de agora ganha marcador.
                checkToShowDot: (spot, _) => spot.x.round() == last,
                getDotPainter: (spot, percent, bar, index) =>
                    FlDotCirclePainter(
                  radius: 4.5,
                  color: colors.brandText,
                  strokeWidth: 2,
                  strokeColor: colors.surfaceCard,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _tooltip(int index, DateFormat dayFormat) {
    if (index <= 0) return 'Início\n${_fmt(start)} pts';
    final entry = history[index - 1];
    final delta = entry.delta;
    final signed = delta > 0 ? '+$delta' : '$delta';
    return '${dayFormat.format(entry.endedAt)} · '
        '${entry.win ? 'vitória' : 'derrota'}\n'
        '${_fmt(entry.after)} pts ($signed)';
  }
}

/// Item da legenda: traço tracejado + o que a linha marca.
class _MarkKey extends StatelessWidget {
  const _MarkKey(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final dash = colors.onSurfaceMuted.withValues(alpha: 0.55);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < 3; i++) ...[
          if (i > 0) const SizedBox(width: 2),
          Container(width: 4, height: 1, color: dash),
        ],
        const SizedBox(width: 6),
        Text(
          label,
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w500,
            color: colors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}
