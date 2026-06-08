import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_schedule_models.dart';
import 'arena_schedule_court_row.dart';

class ArenaScheduleHourGroupSection extends StatelessWidget {
  const ArenaScheduleHourGroupSection({
    super.key,
    required this.group,
    required this.onSlotTap,
    required this.onSlotLongPress,
  });

  final ArenaScheduleHourGroup group;
  final void Function(ArenaScheduleCourtRow row) onSlotTap;
  final void Function(ArenaScheduleCourtRow row) onSlotLongPress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final reservedLabel = group.reservedCount == 1
        ? '1 reservada'
        : '${group.reservedCount} reservadas';
    final courtLabel = group.courtCount == 1
        ? '1 quadra'
        : '${group.courtCount} quadras';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '${group.hour}h',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
                height: 1,
              ),
            ),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                '$courtLabel · $reservedLabel',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Text(
              group.timeRange,
              style: theme.textTheme.labelLarge?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        SizedBox(height: 10),
        ...group.rows.map(
          (row) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: ArenaScheduleCourtTile(
              row: row,
              onTap: () => onSlotTap(row),
              onLongPress: () => onSlotLongPress(row),
            ),
          ),
        ),
        SizedBox(height: 16),
      ],
    );
  }
}
