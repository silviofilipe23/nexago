import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/my_tournaments_models.dart';

class MyTournamentsTabs extends StatelessWidget {
  const MyTournamentsTabs({
    super.key,
    required this.selected,
    required this.ongoingCount,
    required this.completedCount,
    required this.onChanged,
  });

  final MyTournamentsTab selected;
  final int ongoingCount;
  final int completedCount;
  final ValueChanged<MyTournamentsTab> onChanged;

  static const _shellPadding = 4.0;
  static const _segmentHeight = 40.0;
  static const _radius = 22.0;

  @override
  Widget build(BuildContext context) {
    final isOngoing = selected == MyTournamentsTab.ongoing;
    final shellColor = context.themeColors.isDark
        ? AppColors.black
        : context.themeColors.surfaceRaised;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
      child: Container(
        height: _segmentHeight + _shellPadding * 2,
        padding: const EdgeInsets.all(_shellPadding),
        decoration: BoxDecoration(
          color: shellColor,
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
                  left: isOngoing ? 0 : segmentWidth,
                  top: 0,
                  bottom: 0,
                  width: segmentWidth,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: context.themeColors.brand,
                      borderRadius:
                          BorderRadius.circular(_radius - _shellPadding),
                    ),
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: _TabSegment(
                        label: 'Em andamento',
                        count: ongoingCount,
                        selected: isOngoing,
                        onTap: () => onChanged(MyTournamentsTab.ongoing),
                      ),
                    ),
                    Expanded(
                      child: _TabSegment(
                        label: 'Concluídos',
                        count: completedCount,
                        selected: !isOngoing,
                        onTap: () => onChanged(MyTournamentsTab.completed),
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
    final labelColor =
        selected ? AppColors.black : context.themeColors.onSurfaceMuted;
    final badgeBg = selected
        ? AppColors.black.withValues(alpha: 0.2)
        : context.themeColors.surfaceCard.withValues(
            alpha: context.themeColors.isDark ? 1 : 0.85,
          );
    final badgeFg =
        selected ? AppColors.black : context.themeColors.onSurfaceMuted;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: SizedBox(
          height: MyTournamentsTabs._segmentHeight,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Flexible(
                child: Text(
                  label,
                  style: AppTypography.mono(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: labelColor,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
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
