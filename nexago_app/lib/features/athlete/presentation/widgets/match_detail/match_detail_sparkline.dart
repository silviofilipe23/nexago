import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';

class MatchDetailSparkline extends StatelessWidget {
  const MatchDetailSparkline({
    super.key,
    required this.points,
    this.lineColor = AppColors.win,
    this.height = 120,
    this.showMidline = false,
  });

  final List<double> points;
  final Color lineColor;
  final double height;
  final bool showMidline;

  @override
  Widget build(BuildContext context) {
    final chartPoints = _normalizedPoints(points);
    if (chartPoints.isEmpty) return SizedBox(height: height);

    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(
        painter: _SparklinePainter(
          points: chartPoints,
          lineColor: lineColor,
          showMidline: showMidline,
        ),
      ),
    );
  }

  List<double> _normalizedPoints(List<double> raw) {
    if (raw.isEmpty) return const [];
    if (raw.length == 1) return [raw.first, raw.first];
    return raw;
  }
}

class _SparklinePainter extends CustomPainter {
  _SparklinePainter({
    required this.points,
    required this.lineColor,
    required this.showMidline,
  });

  final List<double> points;
  final Color lineColor;
  final bool showMidline;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.length < 2) return;

    final minY = points.reduce(math.min);
    final maxY = points.reduce(math.max);
    final range = (maxY - minY).clamp(0.01, 1.0);

    if (showMidline) {
      final midY = size.height * 0.5;
      final midPaint = Paint()
        ..color = AppColors.onSurfaceMuted.withValues(alpha: 0.25)
        ..strokeWidth = 1
        ..style = PaintingStyle.stroke;
      const dashWidth = 5.0;
      const dashSpace = 4.0;
      var startX = 0.0;
      while (startX < size.width) {
        canvas.drawLine(
          Offset(startX, midY),
          Offset(math.min(startX + dashWidth, size.width), midY),
          midPaint,
        );
        startX += dashWidth + dashSpace;
      }
    }

    final path = Path();
    final fillPath = Path();

    for (var i = 0; i < points.length; i++) {
      final x = i / (points.length - 1) * size.width;
      final normalized = (points[i] - minY) / range;
      final y = size.height - (normalized * size.height * 0.85 + size.height * 0.05);

      if (i == 0) {
        path.moveTo(x, y);
        fillPath.moveTo(x, size.height);
        fillPath.lineTo(x, y);
      } else {
        path.lineTo(x, y);
        fillPath.lineTo(x, y);
      }
    }

    fillPath.lineTo(size.width, size.height);
    fillPath.close();

    final fillPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          lineColor.withValues(alpha: 0.35),
          lineColor.withValues(alpha: 0.0),
        ],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));

    canvas.drawPath(fillPath, fillPaint);

    final linePaint = Paint()
      ..color = lineColor
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    canvas.drawPath(path, linePaint);
  }

  @override
  bool shouldRepaint(covariant _SparklinePainter oldDelegate) =>
      oldDelegate.points != points ||
      oldDelegate.lineColor != lineColor ||
      oldDelegate.showMidline != showMidline;
}
