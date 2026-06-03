import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/arena_detail_logic.dart';
import '../../../domain/arena_list_item.dart';
import '../../../domain/court_pricing.dart';

class ArenaDetailCourtCard extends StatelessWidget {
  const ArenaDetailCourtCard({
    super.key,
    required this.arena,
    required this.summary,
    required this.arenaFallbackPricePerHour,
    required this.onTap,
  });

  final ArenaListItem arena;
  final ArenaCourtDaySummary summary;
  final double arenaFallbackPricePerHour;
  final VoidCallback? onTap;

  static final _currency = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 0,
  );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final court = summary.court;
    final surfaceBadge = courtSurfaceBadgeLabel(arena, court);
    final covered = arena.amenities.coveredCourt;
    final coveredLabel = covered ? 'Coberta' : 'Aberta';

    final hourly = CourtPricing.resolveHourlyBase(
      court: court,
      arenaFallbackPerHourReais: arenaFallbackPricePerHour,
    );
    final priceLabel = hourly != null ? _currency.format(hourly) : '—';

    final String statusText;
    final Color statusColor;
    if (court.isMaintenance) {
      statusText = 'Em manutenção';
      statusColor = context.themeColors.onSurfaceMuted;
    } else if (summary.hasFreeSlotsToday) {
      final n = summary.freeSlotsToday;
      statusText =
          '$n horário${n == 1 ? '' : 's'} livre${n == 1 ? '' : 's'} hoje';
      statusColor = AppColors.win;
    } else {
      statusText = 'Lotada hoje';
      statusColor = context.themeColors.onSurfaceMuted;
    }

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: court.isMaintenance ? null : onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: context.themeColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  Icons.grid_view_rounded,
                  color: AppColors.brand,
                  size: 22,
                ),
              ),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      court.name,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    SizedBox(height: 4),
                    Row(
                      children: [
                        if (surfaceBadge != null) ...[
                          _MiniBadge(label: surfaceBadge),
                          SizedBox(width: 6),
                        ],
                        Text(
                          '· $coveredLabel',
                          style: AppTypography.mono(
                            color: context.themeColors.onSurfaceMuted,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: 6),
                    Row(
                      children: [
                        Container(
                          width: 7,
                          height: 7,
                          decoration: BoxDecoration(
                            color: statusColor,
                            shape: BoxShape.circle,
                          ),
                        ),
                        SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            statusText,
                            style: AppTypography.soraRegular(
                              color: statusColor,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              SizedBox(width: 8),
              Text(
                priceLabel,
                style: AppTypography.mono(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                  fontSize: 14,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MiniBadge extends StatelessWidget {
  const _MiniBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontWeight: FontWeight.w500,
          color: context.themeColors.onSurfaceMuted,
          fontSize: 12,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}
