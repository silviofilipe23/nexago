import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../arenas/domain/arena_search_filter_logic.dart';

class ArenaSearchDateTimeRow extends StatelessWidget {
  const ArenaSearchDateTimeRow({
    super.key,
    required this.date,
    required this.timeLabel,
    required this.flexibleTime,
    required this.onDateTap,
    required this.onTimeTap,
  });

  final DateTime date;
  final String timeLabel;
  final bool flexibleTime;
  final VoidCallback onDateTap;
  final VoidCallback onTimeTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dateLabel = DateFormat('EEE, d MMM', 'pt_BR')
        .format(date)
        .replaceAll('.', '');
    final isToday = isSearchDateToday(date);

    return Row(
      children: [
        Expanded(
          child: _PickerButton(
            icon: Icons.calendar_today_outlined,
            label: dateLabel,
            trailing: isToday
                ? Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.brand.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      'HOJE',
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.brand,
                        fontSize: 9,
                      ),
                    ),
                  )
                : null,
            onTap: onDateTap,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _PickerButton(
            icon: Icons.schedule_outlined,
            label: flexibleTime ? 'Flexível' : timeLabel,
            onTap: onTimeTap,
          ),
        ),
      ],
    );
  }
}

class _PickerButton extends StatelessWidget {
  const _PickerButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.trailing,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: AppColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.surfaceRaised),
          ),
          child: Row(
            children: [
              Icon(icon, size: 18, color: AppColors.onSurfaceMuted),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: AppColors.onSurface,
                  ),
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
        ),
      ),
    );
  }
}
