import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/arena_search_providers.dart';
import '../my_bookings_logic.dart';

class MyBookingsNearbyArenaCard extends StatelessWidget {
  const MyBookingsNearbyArenaCard({
    super.key,
    required this.result,
    required this.onTap,
    this.kmDistance,
    this.gradientColors = const [Color(0xFFC9A227), Color(0xFF6B4E0A)],
  });

  final ArenaSearchResult result;
  final VoidCallback onTap;
  final double? kmDistance;
  final List<Color> gradientColors;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final arena = result.arena;
    final slot = result.selectedSlot;
    final courtsLabel = result.availableCourtsCount <= 1
        ? '• 1 QUADRA LIVRE'
        : '• ${result.availableCourtsCount} QUADRAS LIVRES';
    final fromTime = slot?.startTime ?? '--:--';
    final distanceLabel = kmDistance != null
        ? ' • ${_formatKm(kmDistance!)}'
        : '';

    return Material(
      color: AppColors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: theme.colorScheme.outline.withValues(alpha: 0.1),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: gradientColors,
                  ),
                ),
                alignment: Alignment.center,
                child: Text(
                  arenaInitials(arena.name),
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.white,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      arena.name,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.onSurface,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '• ${arena.locationLabel}$distanceLabel',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.onSurfaceMuted,
                        fontWeight: FontWeight.w500,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 8),
                    if (result.hasAvailability) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.win.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          courtsLabel,
                          style: AppTypography.mono(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.win,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceRaised,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'A PARTIR $fromTime'.toUpperCase(),
                          style: AppTypography.mono(
                            fontSize: 9,
                            fontWeight: FontWeight.w600,
                            color: AppColors.onSurfaceMuted,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ),
                    ] else
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.pending.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'VER HORÁRIOS',
                          style: AppTypography.mono(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.pending,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _PriceChevron(price: formatPriceReais(result.displayPricePerHourReais)),
            ],
          ),
        ),
      ),
    );
  }

  static String _formatKm(double km) {
    if (km < 1) return '${(km * 1000).round()} m';
    if (km < 10) return '${km.toStringAsFixed(1)} km';
    return '${km.round()} km';
  }
}

class _PriceChevron extends StatelessWidget {
  const _PriceChevron({required this.price});

  final String price;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            price,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 13,
              color: AppColors.brand,
            ),
          ),
          const SizedBox(width: 2),
          const Icon(
            Icons.chevron_right_rounded,
            size: 18,
            color: AppColors.brand,
          ),
        ],
      ),
    );
  }
}
