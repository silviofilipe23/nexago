import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/nexa_card.dart';
import '../../../../../core/ui/nexa_segmented_control.dart';
import '../../../domain/athlete_home_dashboard_logic.dart';

enum AthleteEvolutionTab { jogos, vitorias }

/// Card "Sua evolução" (paridade com o painel web): linha dos últimos 12
/// meses com abas Jogos/Vitórias, desenhada à mão (sem lib de gráfico) como
/// o SVG do portal.
class AthleteHomeEvolutionChart extends StatefulWidget {
  const AthleteHomeEvolutionChart({super.key, required this.series});

  final AthleteEvolutionSeries series;

  @override
  State<AthleteHomeEvolutionChart> createState() =>
      _AthleteHomeEvolutionChartState();
}

class _AthleteHomeEvolutionChartState extends State<AthleteHomeEvolutionChart> {
  AthleteEvolutionTab _tab = AthleteEvolutionTab.jogos;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final data = _tab == AthleteEvolutionTab.jogos
        ? widget.series.games
        : widget.series.winRatePct;

    return NexaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'ÚLTIMOS 12 MESES',
                      style: AppTypography.eyebrow
                          .copyWith(color: colors.onSurfaceMuted),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      'Sua evolução',
                      style: AppTypography.titleM
                          .copyWith(color: colors.onSurface),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              SizedBox(
                width: 164,
                child: NexaSegmentedControl<AthleteEvolutionTab>(
                  segments: const [
                    NexaSegment(
                      value: AthleteEvolutionTab.jogos,
                      label: 'Jogos',
                    ),
                    NexaSegment(
                      value: AthleteEvolutionTab.vitorias,
                      label: 'Vitórias',
                    ),
                  ],
                  selected: _tab,
                  onChanged: (tab) => setState(() => _tab = tab),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          SizedBox(
            height: 120,
            child: RepaintBoundary(
              child: CustomPaint(
                size: Size.infinite,
                painter: _EvolutionLinePainter(
                  normalizedValues: chartNormalizedValues(data),
                  gridColor: colors.outline.withValues(alpha: 0.25),
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              for (final month in widget.series.monthLabels)
                Expanded(
                  child: Text(
                    month,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    style: AppTypography.mono(
                      fontSize: 8.5,
                      fontWeight: FontWeight.w600,
                      color: colors.onSurfaceMuted,
                      letterSpacing: 0,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _EvolutionLinePainter extends CustomPainter {
  const _EvolutionLinePainter({
    required this.normalizedValues,
    required this.gridColor,
  });

  /// 0..1 por mês (0 = base, 1 = topo), já com folga de escala aplicada.
  final List<double> normalizedValues;
  final Color gridColor;

  @override
  void paint(Canvas canvas, Size size) {
    final gridPaint = Paint()
      ..color = gridColor
      ..strokeWidth = 1;
    for (final fraction in const [0.25, 0.5, 0.75]) {
      final y = size.height * fraction;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    if (normalizedValues.length < 2) return;

    final points = <Offset>[
      for (var i = 0; i < normalizedValues.length; i++)
        Offset(
          i / (normalizedValues.length - 1) * size.width,
          size.height * (1 - normalizedValues[i]),
        ),
    ];

    final linePath = Path()..moveTo(points.first.dx, points.first.dy);
    for (final point in points.skip(1)) {
      linePath.lineTo(point.dx, point.dy);
    }

    final areaPath = Path.from(linePath)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(
      areaPath,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppColors.brand.withValues(alpha: 0.22),
            AppColors.brand.withValues(alpha: 0),
          ],
        ).createShader(Offset.zero & size),
    );

    canvas.drawPath(
      linePath,
      Paint()
        ..color = AppColors.brand
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    canvas.drawCircle(points.last, 4.5, Paint()..color = AppColors.brand);
  }

  @override
  bool shouldRepaint(_EvolutionLinePainter oldDelegate) {
    if (oldDelegate.gridColor != gridColor) return true;
    if (oldDelegate.normalizedValues.length != normalizedValues.length) {
      return true;
    }
    for (var i = 0; i < normalizedValues.length; i++) {
      if (oldDelegate.normalizedValues[i] != normalizedValues[i]) return true;
    }
    return false;
  }
}
