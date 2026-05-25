import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/athlete_quest/athlete_quest_models.dart';

class AthleteQuestWeekDots extends StatelessWidget {
  const AthleteQuestWeekDots({
    super.key,
    required this.weekDays,
  });

  final List<StreakWeekDay> weekDays;

  static const _dotSize = 30.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      children: weekDays.map((day) {
        final isToday = day.state == StreakWeekDayState.today;
        final isFuture = day.state == StreakWeekDayState.upcoming;

        return Expanded(
          child: Column(
            children: [
              Center(child: _Dot(state: day.state, size: _dotSize)),
              const SizedBox(height: 8),
              Text(
                day.weekdayLabel,
                textAlign: TextAlign.center,
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: isToday ? FontWeight.w800 : FontWeight.w600,
                  color: isToday
                      ? AppColors.brand
                      : isFuture
                          ? AppColors.onSurfaceMuted.withValues(alpha: 0.45)
                          : AppColors.onSurfaceMuted,
                  fontSize: 10,
                  letterSpacing: 0.2,
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot({required this.state, required this.size});

  final StreakWeekDayState state;
  final double size;

  @override
  Widget build(BuildContext context) {
    switch (state) {
      case StreakWeekDayState.completed:
        return Container(
          width: size,
          height: size,
          decoration: const BoxDecoration(
            color: AppColors.brand,
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.check_rounded,
            size: 18,
            color: AppColors.black,
          ),
        );
      case StreakWeekDayState.today:
        return SizedBox(
          width: size,
          height: size,
          child: CustomPaint(
            painter: _DashedRingPainter(
              color: AppColors.brand,
              strokeWidth: 2,
            ),
            child: Center(
              child: Icon(
                Icons.local_fire_department_rounded,
                size: size * 0.48,
                color: AppColors.brand,
              ),
            ),
          ),
        );
      case StreakWeekDayState.upcoming:
        return Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(
              color: AppColors.onSurfaceMuted.withValues(alpha: 0.35),
              width: 2,
            ),
          ),
        );
      case StreakWeekDayState.missed:
        return Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(
              color: AppColors.surfaceRaised,
              width: 2,
            ),
          ),
        );
    }
  }
}

class _DashedRingPainter extends CustomPainter {
  _DashedRingPainter({
    required this.color,
    required this.strokeWidth,
  });

  final Color color;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    final radius = (size.shortestSide - strokeWidth) / 2;
    final center = Offset(size.width / 2, size.height / 2);
    const segments = 14;
    const sweep = (2 * math.pi) / segments;
    const gapRatio = 0.45;

    for (var i = 0; i < segments; i++) {
      final start = i * sweep;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        start,
        sweep * (1 - gapRatio),
        false,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _DashedRingPainter oldDelegate) {
    return oldDelegate.color != color || oldDelegate.strokeWidth != strokeWidth;
  }
}
