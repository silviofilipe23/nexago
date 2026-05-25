import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/arena_slot.dart';
import '../../../domain/slots_page_logic.dart';

class SlotsSlotTile extends StatelessWidget {
  const SlotsSlotTile({
    super.key,
    required this.slot,
    required this.selected,
    required this.onTap,
    this.isPast = false,
    this.isMostPopular = false,
    this.isLastSlot = false,
    this.priceLabel,
  });

  final ArenaSlot slot;
  final bool selected;
  final bool isPast;
  final bool isMostPopular;
  final bool isLastSlot;
  final VoidCallback? onTap;
  final String? priceLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unavailable = !slot.isAvailable || isPast;
    final occupied = slot.isBooked || slot.isBlocked;
    final subtitle = occupiedSlotSubtitle(slot);
    final detailLine = [
      if (priceLabel != null) priceLabel,
      if (slot.isVirtual) 'grade fixa',
    ].whereType<String>().join(' · ');

    Color borderColor = AppColors.surfaceRaised;
    var borderWidth = 1.0;
    if (selected && !unavailable) {
      borderColor = AppColors.brand;
      borderWidth = 2;
    } else if (isLastSlot && !unavailable && !selected) {
      borderColor = AppColors.pending.withValues(alpha: 0.6);
    } else if (isMostPopular && !unavailable && !selected) {
      borderColor = AppColors.brand.withValues(alpha: 0.45);
    }

    final iconColor = unavailable
        ? AppColors.onSurfaceMuted
        : occupied
            ? AppColors.onSurfaceMuted
            : AppColors.win;

    Widget card = Material(
      color: AppColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: unavailable ? null : onTap,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: borderColor, width: borderWidth),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  Icons.schedule_rounded,
                  color: iconColor,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (isLastSlot && !unavailable) ...[
                      Text(
                        'ÚLTIMO SLOT',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppColors.pending,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.4,
                        ),
                      ),
                      const SizedBox(height: 4),
                    ],
                    if (isMostPopular && !selected && !unavailable) ...[
                      Row(
                        children: [
                          const Icon(
                            Icons.local_fire_department_rounded,
                            size: 14,
                            color: AppColors.brand,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'MAIS POPULAR',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: AppColors.brand,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.3,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                    ],
                    if (selected && !unavailable) ...[
                      Text(
                        'SELECIONADO',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppColors.brand,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.3,
                        ),
                      ),
                      const SizedBox(height: 4),
                    ],
                    Text(
                      '${slot.startTime} - ${slot.endTime}',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: unavailable
                            ? AppColors.onSurfaceMuted
                            : AppColors.onSurface,
                      ),
                    ),
                    if (detailLine.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        detailLine,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppColors.onSurfaceMuted,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                    if (subtitle != null && occupied) ...[
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (selected && !unavailable)
                const Icon(
                  Icons.check_circle_rounded,
                  color: AppColors.brand,
                  size: 24,
                )
              else if (occupied)
                Text(
                  'OCUPADO',
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: AppColors.onSurfaceMuted,
                    letterSpacing: 0.4,
                  ),
                ),
            ],
          ),
        ),
      ),
    );

    if (unavailable && occupied) {
      card = Opacity(opacity: 0.55, child: card);
    } else if (isPast) {
      card = Opacity(opacity: 0.45, child: card);
    }
    return card;
  }
}
