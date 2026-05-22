import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/profile_completion_models.dart';

class ProfileCompletionHeroCard extends StatelessWidget {
  const ProfileCompletionHeroCard({
    super.key,
    required this.percent,
    required this.remainingSteps,
    required this.remainingXp,
  });

  final int percent;
  final int remainingSteps;
  final int remainingXp;

  static const _cardBackground = Color(0xFF120A06);
  static const _cardBorder = Color(0xFF2A1A10);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final stepsLabel = remainingSteps == 0
        ? 'PERFIL COMPLETO'
        : 'FALTAM $remainingSteps PASSOS';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
      decoration: BoxDecoration(
        color: _cardBackground,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _cardBorder),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _ProfileCompletionProgressRing(percent: percent),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  stepsLabel,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: AppColors.brand,
                    fontWeight: FontWeight.w800,
                    fontSize: 11,
                    letterSpacing: 1.1,
                    height: 1.2,
                  ),
                ),
                const SizedBox(height: 6),
                if (remainingSteps == 0)
                  Text(
                    'Parabéns!',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                      height: 1.1,
                    ),
                  )
                else
                  Text.rich(
                    TextSpan(
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        height: 1.1,
                      ),
                      children: [
                        const TextSpan(
                          text: 'Ganhe ',
                          style: TextStyle(color: AppColors.onSurface),
                        ),
                        TextSpan(
                          text: '+$remainingXp XP',
                          style: TextStyle(color: AppColors.brand),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 6),
                Text(
                  remainingSteps == 0
                      ? 'Torneios oficiais desbloqueados.'
                      : 'E destrave a categoria torneios.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.onSurfaceMuted.withValues(alpha: 0.95),
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Anel de progresso do hero (início no topo, traço grosso — protótipo 02).
class _ProfileCompletionProgressRing extends StatelessWidget {
  const _ProfileCompletionProgressRing({required this.percent});

  final int percent;

  static const _size = 80.0;
  static const _strokeWidth = 7.0;
  static const _trackColor = Color(0xFF262626);

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: _size,
      height: _size,
      child: CustomPaint(
        painter: _ProfileCompletionRingPainter(
          progress: (percent.clamp(0, 100) / 100).clamp(0.0, 1.0),
          trackColor: _trackColor,
          progressColor: AppColors.brand,
          strokeWidth: _strokeWidth,
        ),
        child: Center(
          child: Text(
            '$percent%',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: AppColors.onSurface,
              height: 1,
              letterSpacing: -0.5,
            ),
          ),
        ),
      ),
    );
  }
}

class _ProfileCompletionRingPainter extends CustomPainter {
  _ProfileCompletionRingPainter({
    required this.progress,
    required this.trackColor,
    required this.progressColor,
    required this.strokeWidth,
  });

  final double progress;
  final Color trackColor;
  final Color progressColor;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.shortestSide - strokeWidth) / 2;
    final rect = Rect.fromCircle(center: center, radius: radius);
    const startAngle = -math.pi / 2;
    const sweepFull = math.pi * 2;

    final trackPaint = Paint()
      ..color = trackColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    canvas.drawArc(rect, startAngle, sweepFull, false, trackPaint);

    if (progress > 0) {
      final progressPaint = Paint()
        ..color = progressColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round;

      canvas.drawArc(
        rect,
        startAngle,
        sweepFull * progress,
        false,
        progressPaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ProfileCompletionRingPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.trackColor != trackColor ||
        oldDelegate.progressColor != progressColor ||
        oldDelegate.strokeWidth != strokeWidth;
  }
}

class ProfileCompletionStepTile extends StatelessWidget {
  const ProfileCompletionStepTile({
    super.key,
    required this.status,
    required this.onTap,
  });

  final ProfileCompletionStepStatus status;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final done = status.isDone;
    final step = status.step;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: done ? null : onTap,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.surfaceRaised.withValues(alpha: done ? 0.5 : 0.85),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: done
                  ? AppColors.win.withValues(alpha: 0.35)
                  : AppColors.brand.withValues(alpha: 0.35),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: done
                      ? AppColors.win.withValues(alpha: 0.15)
                      : AppColors.brand.withValues(alpha: 0.15),
                ),
                child: Icon(
                  done ? Icons.check_rounded : step.icon,
                  color: done ? AppColors.win : AppColors.brand,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      step.title,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: done
                            ? AppColors.onSurfaceMuted
                            : AppColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      status.subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.onSurfaceMuted,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '+${step.xpReward} XP',
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: done
                      ? AppColors.onSurfaceMuted
                      : AppColors.brand,
                ),
              ),
              if (!done) ...[
                const SizedBox(width: 4),
                Icon(
                  Icons.chevron_right_rounded,
                  color: AppColors.brand.withValues(alpha: 0.9),
                  size: 22,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class ProfileCompletionRewardCard extends StatelessWidget {
  const ProfileCompletionRewardCard({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return CustomPaint(
      painter: _DashedBorderPainter(
        color: AppColors.brand.withValues(alpha: 0.55),
        radius: 14,
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.surfaceCard,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                Icons.emoji_events_outlined,
                color: AppColors.brand,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'RECOMPENSA AO FINALIZAR',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: AppColors.brand,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.6,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Badge "Perfil completo" + acesso a torneios oficiais',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: AppColors.onSurface,
                      height: 1.3,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  _DashedBorderPainter({
    required this.color,
    required this.radius,
  });

  final Color color;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final rrect = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(radius),
    );
    final path = Path()..addRRect(rrect);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;

    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      const dash = 6.0;
      const gap = 4.0;
      while (distance < metric.length) {
        final next = math.min(distance + dash, metric.length);
        canvas.drawPath(metric.extractPath(distance, next), paint);
        distance += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.radius != radius;
}
