import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../widgets/auth_form_widgets.dart';

class AuthLoadingHero extends StatefulWidget {
  const AuthLoadingHero({super.key});

  @override
  State<AuthLoadingHero> createState() => _AuthLoadingHeroState();
}

class _AuthLoadingHeroState extends State<AuthLoadingHero>
    with TickerProviderStateMixin {
  late final AnimationController _orbitController;
  late final AnimationController _counterOrbitController;
  late final AnimationController _pulseController;

  static const _heroSize = 228.0;
  static const _logoSize = 60.0;
  static const _orbitRing = 154.0;

  @override
  void initState() {
    super.initState();
    _orbitController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2800),
    )..repeat();
    _counterOrbitController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 4200),
    )..repeat();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2800),
    )..repeat(reverse: true);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      precacheImage(const AssetImage(kNexagoLogoAsset), context);
    });
  }

  @override
  void dispose() {
    _orbitController.dispose();
    _counterOrbitController.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: _heroSize,
      height: _heroSize,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          ...List.generate(3, (i) {
            final ringSize = _orbitRing - (i * 20);
            return SizedBox(
              width: ringSize,
              height: ringSize,
              child: CustomPaint(
                painter: _RingPainter(
                  opacity: 0.16 - (i * 0.035),
                  dash: i == 0,
                  strokeWidth: i == 0 ? 1.5 : 1.15,
                  accentArc: i == 1,
                ),
              ),
            );
          }),
          RotationTransition(
            turns: Tween<double>(
              begin: 0,
              end: -1,
            ).animate(_counterOrbitController),
            child: SizedBox(
              width: _orbitRing - 40,
              height: _orbitRing - 40,
              child: CustomPaint(
                painter: _RingPainter(
                  opacity: 0.07,
                  dash: false,
                  strokeWidth: 1,
                ),
              ),
            ),
          ),
          RotationTransition(
            turns: _orbitController,
            child: SizedBox(
              width: _orbitRing,
              height: _orbitRing,
              child: Stack(
                alignment: Alignment.topCenter,
                children: [
                  Transform.translate(
                    offset: const Offset(0, -1),
                    child: Container(
                      width: 12,
                      height: 5,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(99),
                        gradient: LinearGradient(
                          colors: [
                            AppColors.brand.withValues(alpha: 0),
                            AppColors.brand.withValues(alpha: 0.35),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.brand,
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.brand.withValues(alpha: 0.5),
                          blurRadius: 8,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          AnimatedBuilder(
            animation: _pulseController,
            child: _LoadingLogo(size: _logoSize),
            builder: (context, child) {
              final t = Curves.easeOutCubic.transform(_pulseController.value);
              final scale = 0.96 + (t * 0.04);
              return Transform.scale(
                scale: scale,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.brand.withValues(
                          alpha: 0.14 + (t * 0.06),
                        ),
                        blurRadius: 18 + (t * 5),
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: child,
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _LoadingLogo extends StatelessWidget {
  const _LoadingLogo({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Image.asset(
        kNexagoLogoAsset,
        width: size,
        height: size,
        fit: BoxFit.contain,
        gaplessPlayback: true,
        filterQuality: FilterQuality.high,
        errorBuilder: (context, error, stackTrace) {
          return AuthLogo(size: size, showTagline: false);
        },
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({
    required this.opacity,
    required this.dash,
    this.strokeWidth = 1.2,
    this.accentArc = false,
  });

  final double opacity;
  final bool dash;
  final double strokeWidth;
  final bool accentArc;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final ringPath = Path()..addOval(rect.deflate(1));

    if (accentArc) {
      final accentPaint = Paint()
        ..shader = SweepGradient(
          startAngle: -math.pi / 2,
          colors: [
            AppColors.brand.withValues(alpha: 0),
            AppColors.brand.withValues(alpha: opacity * 1.2),
            AppColors.brand.withValues(alpha: 0),
          ],
          stops: const [0.0, 0.12, 0.28],
        ).createShader(rect)
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth + 0.5
        ..strokeCap = StrokeCap.round;
      canvas.drawPath(ringPath, accentPaint);
    }

    final paint = Paint()
      ..color = AppColors.onSurface.withValues(alpha: opacity)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;

    if (dash) {
      paint.strokeCap = StrokeCap.round;
      const dashWidth = 7.0;
      const gap = 11.0;
      for (final metric in ringPath.computeMetrics()) {
        var distance = 0.0;
        while (distance < metric.length) {
          final next = distance + dashWidth;
          canvas.drawPath(
            metric.extractPath(distance, next.clamp(0, metric.length)),
            paint,
          );
          distance = next + gap;
        }
      }
    } else {
      canvas.drawPath(ringPath, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _RingPainter oldDelegate) => false;
}
