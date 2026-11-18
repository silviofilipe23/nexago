import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Linha com área do destaque do cockpit.
///
/// [values] ocupa as primeiras posições de [slots] (no Mês, os dias que já
/// passaram de um mês de [slots] dias). Opcionalmente desenha a projeção
/// tracejada até a última posição e a linha horizontal da meta.
class ArenaCockpitSparkline extends StatelessWidget {
  const ArenaCockpitSparkline({
    super.key,
    required this.values,
    required this.color,
    required this.guideColor,
    this.slots,
    this.projection,
    this.goal,
    this.height = 64,
  });

  final List<double> values;
  final Color color;

  /// Cor da meta e da projeção (tracejadas).
  final Color guideColor;

  /// Posições no eixo X; padrão = `values.length`.
  final int? slots;
  final double? projection;
  final double? goal;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(
        painter: _SparklinePainter(
          values: values,
          slots: math.max(slots ?? values.length, values.length),
          projection: projection,
          goal: goal,
          color: color,
          guideColor: guideColor,
        ),
      ),
    );
  }
}

class _SparklinePainter extends CustomPainter {
  _SparklinePainter({
    required this.values,
    required this.slots,
    required this.projection,
    required this.goal,
    required this.color,
    required this.guideColor,
  });

  final List<double> values;
  final int slots;
  final double? projection;
  final double? goal;
  final Color color;
  final Color guideColor;

  static const double _pad = 5;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;
    final top = [
      ...values,
      if (projection != null) projection!,
      if (goal != null) goal!,
    ].fold<double>(0, math.max);
    final maxY = top <= 0 ? 1.0 : top * 1.08;
    final w = size.width - _pad * 2;
    final h = size.height - _pad * 2;
    double x(int i) => _pad + (slots <= 1 ? w : w * i / (slots - 1));
    double y(double v) => _pad + h - (v / maxY) * h;

    if (goal != null) {
      _dashed(
        canvas,
        Offset(_pad, y(goal!)),
        Offset(size.width - _pad, y(goal!)),
        Paint()
          ..color = guideColor.withValues(alpha: 0.55)
          ..strokeWidth = 1,
      );
    }

    final line = Path()..moveTo(x(0), y(values.first));
    for (var i = 1; i < values.length; i++) {
      line.lineTo(x(i), y(values[i]));
    }
    final last = values.length - 1;
    final area = Path.from(line)
      ..lineTo(x(last), size.height)
      ..lineTo(x(0), size.height)
      ..close();
    canvas.drawPath(
      area,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [color.withValues(alpha: 0.38), color.withValues(alpha: 0)],
        ).createShader(Offset.zero & size),
    );
    canvas.drawPath(
      line,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round,
    );

    if (projection != null && last < slots - 1) {
      _dashed(
        canvas,
        Offset(x(last), y(values[last])),
        Offset(x(slots - 1), y(projection!)),
        Paint()
          ..color = color.withValues(alpha: 0.7)
          ..strokeWidth = 2,
      );
    }
    canvas.drawCircle(
      Offset(x(last), y(values[last])),
      4,
      Paint()..color = color,
    );
  }

  void _dashed(Canvas canvas, Offset a, Offset b, Paint paint) {
    const dash = 4.0;
    const gap = 4.0;
    final total = (b - a).distance;
    if (total == 0) return;
    final dir = (b - a) / total;
    var d = 0.0;
    while (d < total) {
      final end = math.min(d + dash, total);
      canvas.drawLine(a + dir * d, a + dir * end, paint);
      d += dash + gap;
    }
  }

  @override
  bool shouldRepaint(_SparklinePainter old) =>
      old.values != values ||
      old.slots != slots ||
      old.projection != projection ||
      old.goal != goal ||
      old.color != color;
}
