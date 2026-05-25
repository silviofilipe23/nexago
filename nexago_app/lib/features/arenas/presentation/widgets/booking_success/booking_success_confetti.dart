import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';

/// Confetes caindo do topo da tela (logo abaixo / na status bar).
class BookingSuccessConfetti extends StatelessWidget {
  const BookingSuccessConfetti({super.key, required this.statusBarHeight});

  final double statusBarHeight;

  static const _colors = [AppColors.win, AppColors.brand, AppColors.pending];

  static List<_ConfettiSpec> _buildFallingPieces({
    required double width,
    required double fallHeight,
  }) {
    final random = math.Random(0xFA110001);
    final out = <_ConfettiSpec>[];
    final spread = width * 0.52;

    // Faixa superior: confetes já visíveis no primeiro pixel.
    const topBandCount = 20;
    for (var i = 0; i < topBandCount; i++) {
      final dx = (random.nextDouble() - 0.5) * 2 * spread;
      final dy = random.nextDouble() * 28;
      out.add(_spec(random, dx, dy));
    }

    const fallCount = 20;
    for (var i = 0; i < fallCount; i++) {
      final dx = (random.nextDouble() - 0.5) * 2 * spread;
      final drift = (random.nextDouble() - 0.5) * 16;
      final t = math.pow(random.nextDouble(), 0.28).toDouble();
      final dy = 4 + t * (fallHeight - 4);
      out.add(_spec(random, dx + drift, dy));
    }

    return out;
  }

  static _ConfettiSpec _spec(math.Random random, double dx, double dy) {
    return _ConfettiSpec(
      dx: dx,
      dy: dy,
      color: _colors[random.nextInt(_colors.length)],
      angle: 0.2 + random.nextDouble() * 1.0,
      w: 7.0 + random.nextDouble() * 5,
      h: 3.5 + random.nextDouble() * 3.5,
    );
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final fallHeight = constraints.maxHeight.isFinite
            ? constraints.maxHeight
            : statusBarHeight + 280;

        final pieces = _buildFallingPieces(
          width: width,
          fallHeight: fallHeight,
        );

        return SizedBox(
          width: width,
          height: fallHeight,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              for (final p in pieces)
                Positioned(
                  left: width / 2 + p.dx - p.w / 2,
                  top: p.dy,
                  child: Transform.rotate(
                    angle: p.angle,
                    child: Container(
                      width: p.w,
                      height: p.h,
                      decoration: BoxDecoration(
                        color: p.color,
                        borderRadius: BorderRadius.circular(1.5),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _ConfettiSpec {
  _ConfettiSpec({
    required this.dx,
    required this.dy,
    required this.color,
    required this.angle,
    required this.w,
    required this.h,
  });

  final double dx;
  final double dy;
  final Color color;
  final double angle;
  final double w;
  final double h;
}
