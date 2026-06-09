import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';

const _opponentAccent = Color(0xFF8B9BB0);

class MatchDetailMomentumChart extends StatefulWidget {
  const MatchDetailMomentumChart({
    super.key,
    required this.chartPoints,
    required this.ourTeamLabel,
    required this.opponentTeamLabel,
    this.height = 148,
  });

  final List<MatchDetailMomentumChartPoint> chartPoints;
  final String ourTeamLabel;
  final String opponentTeamLabel;
  final double height;

  @override
  State<MatchDetailMomentumChart> createState() =>
      _MatchDetailMomentumChartState();
}

class _MatchDetailMomentumChartState extends State<MatchDetailMomentumChart> {
  late int _selectedIndex;

  @override
  void initState() {
    super.initState();
    _selectedIndex = math.max(0, widget.chartPoints.length - 1);
  }

  @override
  void didUpdateWidget(covariant MatchDetailMomentumChart oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.chartPoints.length != oldWidget.chartPoints.length) {
      _selectedIndex = math.max(0, widget.chartPoints.length - 1);
    }
  }

  void _updateSelectionFromDx(double dx, double chartWidth) {
    if (widget.chartPoints.length < 2 || chartWidth <= 0) return;
    final ratio = (dx / chartWidth).clamp(0.0, 1.0);
    final index = (ratio * (widget.chartPoints.length - 1)).round().clamp(
      0,
      widget.chartPoints.length - 1,
    );
    if (index != _selectedIndex) {
      setState(() => _selectedIndex = index);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final points = widget.chartPoints;
    if (points.length < 2) return const SizedBox.shrink();

    final selected = points[_selectedIndex];
    final accent = selected.isOurTeam && selected.teamLabel.isNotEmpty
        ? AppColors.brand
        : _opponentAccent;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.ourTeamLabel.toUpperCase(),
          style: AppTypography.soraRegular(
            color: AppColors.brand,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.6,
            fontSize: 10,
          ),
        ),
        const SizedBox(height: 8),
        LayoutBuilder(
          builder: (context, constraints) {
            final chartWidth = constraints.maxWidth;
            return GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapDown: (d) =>
                  _updateSelectionFromDx(d.localPosition.dx, chartWidth),
              onHorizontalDragStart: (d) =>
                  _updateSelectionFromDx(d.localPosition.dx, chartWidth),
              onHorizontalDragUpdate: (d) =>
                  _updateSelectionFromDx(d.localPosition.dx, chartWidth),
              child: SizedBox(
                height: widget.height,
                width: double.infinity,
                child: CustomPaint(
                  painter: _MomentumChartPainter(
                    chartPoints: points,
                    selectedIndex: _selectedIndex,
                  ),
                ),
              ),
            );
          },
        ),
        const SizedBox(height: 6),
        Text(
          widget.opponentTeamLabel.toUpperCase(),
          style: AppTypography.soraRegular(
            color: AppColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.6,
            fontSize: 10,
          ),
        ),
        const SizedBox(height: 12),
        _PointDetailCard(point: selected, accent: accent, theme: theme),
      ],
    );
  }
}

class _PointDetailCard extends StatelessWidget {
  const _PointDetailCard({
    required this.point,
    required this.accent,
    required this.theme,
  });

  final MatchDetailMomentumChartPoint point;
  final Color accent;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final isStart = point.teamLabel.isEmpty;
    final title = isStart ? 'Início do set' : 'Ponto de ${point.teamLabel}';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.surfaceSheet),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: isStart ? AppColors.onSurfaceMuted : accent,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AppTypography.soraRegular(
                    color: AppColors.onSurface,
                    fontWeight: FontWeight.w500,
                    fontSize: 13,
                  ),
                ),
                if (!isStart) ...[
                  const SizedBox(height: 2),
                  Text(
                    point.time,
                    style: AppTypography.mono(
                      color: AppColors.onSurfaceMuted,
                      fontWeight: FontWeight.w600,
                      fontSize: 10,
                    ),
                  ),
                ],
              ],
            ),
          ),
          Text(
            point.scoreLabel,
            style: AppTypography.mono(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: AppColors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

class _MomentumChartPainter extends CustomPainter {
  _MomentumChartPainter({
    required this.chartPoints,
    required this.selectedIndex,
  });

  final List<MatchDetailMomentumChartPoint> chartPoints;
  final int selectedIndex;

  static const _yAxisWidth = 28.0;
  static const _chartPadding = 6.0;

  @override
  void paint(Canvas canvas, Size size) {
    if (chartPoints.length < 2) return;

    final chartLeft = _chartPadding;
    final chartRight = size.width - _yAxisWidth;
    final chartWidth = chartRight - chartLeft;
    final chartHeight = size.height;
    final midY = chartHeight / 2;

    final maxAbsDiff = math.max(
      2,
      chartPoints
          .map((p) => p.scoreDiff.abs())
          .fold<int>(0, (a, b) => math.max(a, b)),
    );
    final scaleMax = _niceScaleMax(maxAbsDiff);
    final halfPlot = chartHeight / 2 - _chartPadding;

    double yForDiff(int diff) => midY - (diff / scaleMax) * halfPlot;

    final positions = <Offset>[];
    for (var i = 0; i < chartPoints.length; i++) {
      final x = chartLeft + (i / (chartPoints.length - 1)) * chartWidth;
      positions.add(Offset(x, yForDiff(chartPoints[i].scoreDiff)));
    }

    _drawGrid(canvas, size, midY, scaleMax, yForDiff);
    _drawAreas(canvas, positions, midY);
    _drawStepLine(canvas, positions);
    _drawMarkers(canvas, positions, selectedIndex);
    _drawSelection(canvas, positions[selectedIndex], chartHeight);
    _drawYAxis(canvas, size, midY, scaleMax, yForDiff);
  }

  int _niceScaleMax(int maxAbs) {
    if (maxAbs <= 2) return 2;
    if (maxAbs <= 4) return 4;
    if (maxAbs <= 6) return 6;
    return ((maxAbs + 1) / 2).ceil() * 2;
  }

  void _drawGrid(
    Canvas canvas,
    Size size,
    double midY,
    int scaleMax,
    double Function(int) yForDiff,
  ) {
    final gridPaint = Paint()
      ..color = AppColors.onSurfaceMuted.withValues(alpha: 0.12)
      ..strokeWidth = 1;

    for (var tick = 2; tick <= scaleMax; tick += 2) {
      for (final diff in [tick, -tick]) {
        final y = yForDiff(diff);
        canvas.drawLine(
          Offset(_chartPadding, y),
          Offset(size.width - _yAxisWidth, y),
          gridPaint,
        );
      }
    }

    final midPaint = Paint()
      ..color = AppColors.onSurfaceMuted.withValues(alpha: 0.22)
      ..strokeWidth = 1;
    canvas.drawLine(
      Offset(_chartPadding, midY),
      Offset(size.width - _yAxisWidth, midY),
      midPaint,
    );
  }

  void _drawAreas(Canvas canvas, List<Offset> positions, double midY) {
    if (positions.length < 2) return;

    final linePath = _buildStepPath(positions);
    final first = positions.first;
    final last = positions.last;

    final aboveFill = Path.from(linePath)
      ..lineTo(last.dx, midY)
      ..lineTo(first.dx, midY)
      ..close();

    final belowFill = Path.from(linePath)
      ..lineTo(last.dx, midY)
      ..lineTo(first.dx, midY)
      ..close();

    canvas.save();
    canvas.clipRect(Rect.fromLTRB(0, 0, double.infinity, midY));
    canvas.drawPath(
      aboveFill,
      Paint()
        ..shader = ui.Gradient.linear(Offset(0, 0), Offset(0, midY), [
          AppColors.brand.withValues(alpha: 0.34),
          AppColors.brand.withValues(alpha: 0.02),
        ]),
    );
    canvas.restore();

    canvas.save();
    canvas.clipRect(Rect.fromLTRB(0, midY, double.infinity, double.infinity));
    canvas.drawPath(
      belowFill,
      Paint()
        ..shader = ui.Gradient.linear(Offset(0, midY), Offset(0, midY * 2), [
          _opponentAccent.withValues(alpha: 0.02),
          _opponentAccent.withValues(alpha: 0.3),
        ]),
    );
    canvas.restore();
  }

  Path _buildStepPath(List<Offset> positions) {
    final path = Path()..moveTo(positions.first.dx, positions.first.dy);
    for (var i = 0; i < positions.length - 1; i++) {
      final p0 = positions[i];
      final p1 = positions[i + 1];
      path.lineTo(p1.dx, p0.dy);
      path.lineTo(p1.dx, p1.dy);
    }
    return path;
  }

  void _drawStepLine(Canvas canvas, List<Offset> positions) {
    if (positions.length < 2) return;

    for (var i = 0; i < positions.length - 1; i++) {
      final p0 = positions[i];
      final p1 = positions[i + 1];
      final corner = Offset(p1.dx, p0.dy);
      final diff = chartPoints[i + 1].scoreDiff;
      final color = diff >= 0 ? AppColors.brand : _opponentAccent;

      final paint = Paint()
        ..color = color
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round;

      canvas.drawLine(p0, corner, paint);
      canvas.drawLine(corner, p1, paint);
    }
  }

  void _drawMarkers(Canvas canvas, List<Offset> positions, int selected) {
    for (var i = 1; i < positions.length; i++) {
      if (i == selected) continue;
      final diff = chartPoints[i].scoreDiff;
      final color = diff >= 0 ? AppColors.brand : _opponentAccent;
      canvas.drawCircle(
        positions[i],
        2.5,
        Paint()..color = color.withValues(alpha: 0.85),
      );
    }
  }

  void _drawSelection(Canvas canvas, Offset point, double height) {
    const dashWidth = 4.0;
    const dashSpace = 3.0;
    final paint = Paint()
      ..color = AppColors.onSurface.withValues(alpha: 0.55)
      ..strokeWidth = 1.2;

    var y = 0.0;
    while (y < height) {
      canvas.drawLine(
        Offset(point.dx, y),
        Offset(point.dx, math.min(y + dashWidth, height)),
        paint,
      );
      y += dashWidth + dashSpace;
    }

    final diff = chartPoints[selectedIndex].scoreDiff;
    final dotColor = diff >= 0 ? AppColors.brand : _opponentAccent;
    canvas.drawCircle(point, 5.5, Paint()..color = dotColor);
    canvas.drawCircle(
      point,
      8,
      Paint()
        ..color = dotColor.withValues(alpha: 0.25)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }

  void _drawYAxis(
    Canvas canvas,
    Size size,
    double midY,
    int scaleMax,
    double Function(int) yForDiff,
  ) {
    final textStyle = TextStyle(
      fontFamily: AppTypography.monoFontFamily,
      fontSize: 9,
      fontWeight: FontWeight.w600,
      color: AppColors.onSurfaceMuted.withValues(alpha: 0.7),
    );

    for (var tick = 2; tick <= scaleMax; tick += 2) {
      _drawAxisLabel(
        canvas,
        size.width - 4,
        yForDiff(tick),
        '+$tick',
        textStyle,
      );
      _drawAxisLabel(
        canvas,
        size.width - 4,
        yForDiff(-tick),
        '+$tick',
        textStyle,
      );
    }
  }

  void _drawAxisLabel(
    Canvas canvas,
    double right,
    double y,
    String text,
    TextStyle style,
  ) {
    final builder =
        ui.ParagraphBuilder(
            ui.ParagraphStyle(
              textAlign: TextAlign.right,
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
            ),
          )
          ..pushStyle(style.getTextStyle())
          ..addText(text);

    final paragraph = builder.build()
      ..layout(ui.ParagraphConstraints(width: _yAxisWidth - 4));
    canvas.drawParagraph(paragraph, Offset(right - (_yAxisWidth - 4), y - 6));
  }

  @override
  bool shouldRepaint(covariant _MomentumChartPainter oldDelegate) =>
      oldDelegate.chartPoints != chartPoints ||
      oldDelegate.selectedIndex != selectedIndex;
}
