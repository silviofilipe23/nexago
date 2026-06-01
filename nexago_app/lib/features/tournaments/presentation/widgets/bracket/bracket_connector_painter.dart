import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/features/tournaments/domain/double_elimination_bracket_layout.dart';

class BracketConnectorPainter extends CustomPainter {
  BracketConnectorPainter({
    required this.layout,
    required this.nodeByMatchId,
  });

  final DoubleEliminationBracketLayout layout;
  final Map<String, BracketLayoutNode> nodeByMatchId;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.brand.withValues(alpha: 0.85)
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    for (final edge in layout.edges) {
      final from = nodeByMatchId[edge.fromMatchId];
      final to = nodeByMatchId[edge.toMatchId];
      if (from == null || to == null) continue;

      final start = Offset(
        from.position.dx + from.size.width,
        from.position.dy + from.size.height / 2,
      );
      final end = Offset(
        to.position.dx,
        to.position.dy + to.size.height / 2,
      );
      final midX = start.dx + (end.dx - start.dx) / 2;

      final path = Path()
        ..moveTo(start.dx, start.dy)
        ..lineTo(midX, start.dy)
        ..lineTo(midX, end.dy)
        ..lineTo(end.dx, end.dy);
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant BracketConnectorPainter oldDelegate) {
    return oldDelegate.layout != layout;
  }
}
