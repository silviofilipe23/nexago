import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';

/// Glow central pulsando como chama (protótipo loading).
class AuthLoadingFlameBackground extends StatefulWidget {
  const AuthLoadingFlameBackground({super.key});

  @override
  State<AuthLoadingFlameBackground> createState() =>
      _AuthLoadingFlameBackgroundState();
}

class _AuthLoadingFlameBackgroundState extends State<AuthLoadingFlameBackground>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3600),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return CustomPaint(
          painter: _FlameBackgroundPainter(time: _controller.value),
          child: const SizedBox.expand(),
        );
      },
    );
  }
}

class _FlameBackgroundPainter extends CustomPainter {
  _FlameBackgroundPainter({required this.time});

  final double time;

  static double _organicPulse(double t) {
    final w = math.pi * 2;
    final flicker = 0.4 * math.sin(t * w * 1.12) +
        0.27 * math.sin(t * w * 2.08 + 0.85) +
        0.19 * math.sin(t * w * 3.35 + 2.15) +
        0.14 * math.sin(t * w * 4.9 + 1.35);
    final breathe = math.sin(t * w * 0.58);
    return ((breathe * 0.52 + flicker * 0.48) * 0.5 + 0.5).clamp(0.0, 1.0);
  }

  void _drawFlameOval(
    Canvas canvas,
    Offset center,
    double rx,
    double ry,
    List<Color> colors,
    List<double> stops,
  ) {
    final rect = Rect.fromCenter(center: center, width: rx * 2, height: ry * 2);
    final paint = Paint()
      ..shader = RadialGradient(colors: colors, stops: stops).createShader(rect);
    canvas.drawOval(rect, paint);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final pulse = _organicPulse(time);
    final driftX = math.sin(time * math.pi * 2 * 0.35) * 4;
    final center = Offset(size.width * 0.5 + driftX, size.height * 0.38);
    final w = size.width;
    final h = size.height;

    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = AppColors.canvas,
    );

    // Halo bem contido — só atrás do hero, opacidade baixa.
    _drawFlameOval(
      canvas,
      center.translate(0, pulse * 3),
      w * (0.38 + pulse * 0.04),
      h * (0.22 + pulse * 0.025),
      [
        AppColors.brand.withValues(alpha: 0.028 + pulse * 0.014),
        AppColors.brand.withValues(alpha: 0.008),
        Colors.transparent,
      ],
      const [0.0, 0.35, 1.0],
    );

    // Corpo da chama — compacto, sem espalhar pela tela.
    _drawFlameOval(
      canvas,
      center.translate(0, pulse * 2),
      w * (0.3 + pulse * 0.035),
      h * (0.17 + pulse * 0.02),
      [
        AppColors.brand.withValues(alpha: 0.07 + pulse * 0.035),
        AppColors.brand.withValues(alpha: 0.025 + pulse * 0.012),
        Colors.transparent,
      ],
      const [0.0, 0.42, 1.0],
    );

    // Núcleo — focado no logo, sem branco quente.
    final corePulse = _organicPulse(time * 1.4 + 0.18);
    _drawFlameOval(
      canvas,
      center.translate(0, -6 + corePulse * 2),
      w * (0.16 + corePulse * 0.025),
      h * (0.1 + corePulse * 0.015),
      [
        AppColors.brandHover.withValues(alpha: 0.1 + corePulse * 0.05),
        AppColors.brand.withValues(alpha: 0.045 + corePulse * 0.025),
        Colors.transparent,
      ],
      const [0.0, 0.5, 1.0],
    );

    // Vinheta leve — mantém bordas escuras sem clarear o centro.
    canvas.drawRect(
      Offset.zero & size,
      Paint()
        ..shader = RadialGradient(
          center: Alignment.center,
          radius: 1.1,
          colors: [
            Colors.transparent,
            AppColors.black.withValues(alpha: 0.22),
            AppColors.black.withValues(alpha: 0.55),
          ],
          stops: const [0.55, 0.88, 1.0],
        ).createShader(Offset.zero & size),
    );
  }

  @override
  bool shouldRepaint(covariant _FlameBackgroundPainter oldDelegate) {
    return oldDelegate.time != time;
  }
}
