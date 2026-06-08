import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';

/// Partículas laranja subindo como faíscas (protótipo loading).
class AuthLoadingSparks extends StatefulWidget {
  const AuthLoadingSparks({super.key});

  @override
  State<AuthLoadingSparks> createState() => _AuthLoadingSparksState();
}

class _AuthLoadingSparksState extends State<AuthLoadingSparks>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final List<_SparkParticle> _rising;
  late final List<_AmbientSpark> _ambient;
  final _random = math.Random(42);

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 5200),
    )..repeat();

    _rising = List.generate(14, (i) {
      return _SparkParticle(
        xFactor: 0.22 + _random.nextDouble() * 0.56,
        size: 2.0 + _random.nextDouble() * 2.8,
        delay: _random.nextDouble(),
        speed: 0.65 + _random.nextDouble() * 0.65,
        drift: (_random.nextDouble() - 0.5) * 14,
        opacity: 0.22 + _random.nextDouble() * 0.28,
      );
    });

    _ambient = List.generate(6, (i) {
      return _AmbientSpark(
        xFactor: 0.28 + _random.nextDouble() * 0.44,
        yFactor: 0.3 + _random.nextDouble() * 0.16,
        size: 1.5 + _random.nextDouble() * 2.0,
        phase: _random.nextDouble(),
        opacity: 0.12 + _random.nextDouble() * 0.18,
      );
    });
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
          painter: _SparksPainter(
            progress: _controller.value,
            rising: _rising,
            ambient: _ambient,
          ),
          child: const SizedBox.expand(),
        );
      },
    );
  }
}

class _SparkParticle {
  const _SparkParticle({
    required this.xFactor,
    required this.size,
    required this.delay,
    required this.speed,
    required this.drift,
    required this.opacity,
  });

  final double xFactor;
  final double size;
  final double delay;
  final double speed;
  final double drift;
  final double opacity;
}

class _AmbientSpark {
  const _AmbientSpark({
    required this.xFactor,
    required this.yFactor,
    required this.size,
    required this.phase,
    required this.opacity,
  });

  final double xFactor;
  final double yFactor;
  final double size;
  final double phase;
  final double opacity;
}

class _SparksPainter extends CustomPainter {
  _SparksPainter({
    required this.progress,
    required this.rising,
    required this.ambient,
  });

  final double progress;
  final List<_SparkParticle> rising;
  final List<_AmbientSpark> ambient;

  void _drawSpark(Canvas canvas, Offset center, double size, double alpha) {
    canvas.drawCircle(
      center,
      size,
      Paint()..color = AppColors.brand.withValues(alpha: alpha),
    );

    if (size > 2.5) {
      canvas.drawCircle(
        center,
        size * 0.45,
        Paint()..color = AppColors.brandHover.withValues(alpha: alpha * 0.85),
      );
    }
  }

  @override
  void paint(Canvas canvas, Size size) {
    final centerX = size.width * 0.5;
    final bandTop = size.height * 0.28;
    final bandBottom = size.height * 0.58;
    final travel = bandBottom - bandTop;

    for (final particle in rising) {
      final t = ((progress * particle.speed + particle.delay) % 1.0);
      final eased = Curves.easeOutCubic.transform(t);
      final y = bandBottom - (travel * eased);
      final x = centerX +
          (particle.xFactor - 0.5) * size.width * 0.55 +
          particle.drift * math.sin(t * math.pi * 2);

      final fade = Curves.easeIn.transform((1 - t).clamp(0.0, 1.0));
      final alpha =
          particle.opacity * fade * (t < 0.05 ? t / 0.05 : 1.0);

      _drawSpark(canvas, Offset(x, y), particle.size, alpha);
    }

    for (final spark in ambient) {
      final twinkle = 0.55 +
          0.45 *
              (0.5 +
                  0.5 *
                      math.sin(
                        (progress + spark.phase) * math.pi * 2 * 1.6,
                      ));
      final driftY = math.sin((progress + spark.phase) * math.pi * 2) * 3;
      final x = centerX + (spark.xFactor - 0.5) * size.width * 0.48;
      final y = size.height * spark.yFactor + driftY;

      _drawSpark(
        canvas,
        Offset(x, y),
        spark.size,
        spark.opacity * twinkle,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _SparksPainter oldDelegate) {
    return oldDelegate.progress != progress;
  }
}
