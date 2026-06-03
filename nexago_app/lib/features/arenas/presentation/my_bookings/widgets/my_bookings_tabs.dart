import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';

enum MyBookingsTab { upcoming, history }

class MyBookingsTabs extends StatelessWidget {
  const MyBookingsTabs({
    super.key,
    required this.selected,
    required this.upcomingCount,
    required this.historyCount,
    required this.onChanged,
  });

  final MyBookingsTab selected;
  final int upcomingCount;
  final int historyCount;
  final ValueChanged<MyBookingsTab> onChanged;

  static const _shellPadding = 4.0;
  static const _segmentHeight = 40.0;
  static const _radius = 22.0;

  @override
  Widget build(BuildContext context) {
    final isUpcoming = selected == MyBookingsTab.upcoming;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
      child: Container(
        height: _segmentHeight + _shellPadding * 2,
        padding: const EdgeInsets.all(_shellPadding),
        decoration: BoxDecoration(
          color: AppColors.black,
          borderRadius: BorderRadius.circular(_radius),
        ),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final segmentWidth = constraints.maxWidth / 2;
            return Stack(
              children: [
                AnimatedPositioned(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  left: isUpcoming ? 0 : segmentWidth,
                  top: 0,
                  bottom: 0,
                  width: segmentWidth,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: AppColors.brand,
                      borderRadius: BorderRadius.circular(_radius - _shellPadding),
                    ),
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: _TabSegment(
                        label: 'Próximas',
                        count: upcomingCount,
                        selected: isUpcoming,
                        onTap: () => onChanged(MyBookingsTab.upcoming),
                      ),
                    ),
                    Expanded(
                      child: _TabSegment(
                        label: 'Histórico',
                        count: historyCount,
                        selected: !isUpcoming,
                        onTap: () => onChanged(MyBookingsTab.history),
                      ),
                    ),
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _TabSegment extends StatelessWidget {
  const _TabSegment({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final labelColor = selected ? AppColors.black : context.themeColors.onSurfaceMuted;
    final badgeBg = selected
        ? AppColors.black.withValues(alpha: 0.2)
        : const Color(0xFF2C2C2C);
    final badgeFg = selected ? AppColors.black : context.themeColors.onSurfaceMuted;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: SizedBox(
          height: MyBookingsTabs._segmentHeight,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                label,
                style: AppTypography.mono(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: labelColor,
                ),
              ),
              SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: badgeBg,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '$count',
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: badgeFg,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
