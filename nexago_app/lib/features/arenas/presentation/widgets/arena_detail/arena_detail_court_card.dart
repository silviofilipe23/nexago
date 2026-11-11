import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/formatting/app_currency_format.dart';
import '../../../domain/arena_detail_logic.dart';
import '../../../domain/arena_list_item.dart';
import '../../../domain/court_pricing.dart';

/// Linha de uma quadra no perfil público da arena: selo com o número, nome, esportes ·
/// coberta/aberta, preço/h e horários livres hoje. Fica dentro do cartão agrupado de
/// [ArenaDetailCourtsSection]; quadra em manutenção aparece apagada e não abre.
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

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final court = summary.court;

    final hourly = CourtPricing.resolveHourlyBase(
      court: court,
      arenaFallbackPerHourReais: arenaFallbackPricePerHour,
    );
    final priceLabel = hourly != null ? formatBRLWhole(hourly) : '—';
    final hasFree = !court.isMaintenance && summary.hasFreeSlotsToday;
    final statusColor = hasFree ? colors.win : colors.onSurfaceMuted;
    final enabled = !court.isMaintenance && onTap != null;

    return Semantics(
      button: enabled,
      child: InkWell(
        onTap: enabled ? onTap : null,
        child: Opacity(
          opacity: court.isMaintenance ? 0.45 : 1,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 64),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.brand.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppColors.brand.withValues(alpha: 0.28),
                      ),
                    ),
                    child: Text(
                      courtBadgeLabel(court.name),
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: colors.brandText,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          court.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.soraRegular(
                            fontSize: 14.5,
                            fontWeight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          courtMetaLine(arena, court),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style:
                              Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: colors.onSurfaceMuted,
                                  ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text.rich(
                        TextSpan(
                          text: priceLabel,
                          children: [
                            if (hourly != null)
                              TextSpan(
                                text: '/h',
                                style: AppTypography.mono(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w500,
                                  color: colors.onSurfaceMuted,
                                ),
                              ),
                          ],
                        ),
                        style: AppTypography.mono(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                              color: statusColor,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 5),
                          Text(
                            courtDayStatusLabel(summary),
                            style: AppTypography.soraRegular(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                              color: statusColor,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(width: 4),
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 18,
                    color: enabled ? colors.onSurfaceMuted : Colors.transparent,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
