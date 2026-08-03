import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
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
    this.peakBadge,
    this.onJoinWaitlist,
  });

  final ArenaSlot slot;
  final bool selected;
  final bool isPast;
  final bool isMostPopular;
  final bool isLastSlot;
  final VoidCallback? onTap;
  final String? priceLabel;

  /// Rótulo do badge de horário de pico (ex.: "mín. 2h"); `null` = sem badge.
  final String? peakBadge;

  /// Quando o slot está lotado (não bloqueado) e ainda é um horário futuro,
  /// permite entrar na lista de espera em vez de deixar o tile só desabilitado.
  final VoidCallback? onJoinWaitlist;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unavailable = !slot.isAvailable || isPast;
    final occupied = slot.isBooked || slot.isBlocked;
    final canJoinWaitlist =
        slot.isBooked && !slot.isBlocked && !isPast && onJoinWaitlist != null;
    final subtitle = occupiedSlotSubtitle(slot);
    final detailLine = [
      if (priceLabel != null) priceLabel,
      if (slot.isVirtual) 'grade fixa',
    ].whereType<String>().join(' · ');

    Color borderColor = context.themeColors.surfaceRaised;
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
        ? context.themeColors.onSurfaceMuted
        : occupied
            ? context.themeColors.onSurfaceMuted
            : AppColors.win;

    Widget card = Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: unavailable ? (canJoinWaitlist ? onJoinWaitlist : null) : onTap,
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
                  color: context.themeColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  Icons.schedule_rounded,
                  color: iconColor,
                  size: 22,
                ),
              ),
              SizedBox(width: 12),
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
                      SizedBox(height: 4),
                    ],
                    if (isMostPopular && !selected && !unavailable) ...[
                      Row(
                        children: [
                          Icon(
                            Icons.local_fire_department_rounded,
                            size: 14,
                            color: AppColors.brand,
                          ),
                          SizedBox(width: 4),
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
                      SizedBox(height: 4),
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
                      SizedBox(height: 4),
                    ],
                    Text(
                      '${slot.startTime} - ${slot.endTime}',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: unavailable
                            ? context.themeColors.onSurfaceMuted
                            : context.themeColors.onSurface,
                      ),
                    ),
                    if (detailLine.isNotEmpty || peakBadge != null) ...[
                      SizedBox(height: 4),
                      Row(
                        children: [
                          if (detailLine.isNotEmpty)
                            Flexible(
                              child: Text(
                                detailLine,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: context.themeColors.onSurfaceMuted,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          if (peakBadge != null) ...[
                            if (detailLine.isNotEmpty) SizedBox(width: 6),
                            Text(
                              peakBadge!,
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: const Color(0xFFEA580C),
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.3,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                    if (subtitle != null && occupied) ...[
                      SizedBox(height: 4),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (selected && !unavailable)
                Icon(
                  Icons.check_circle_rounded,
                  color: AppColors.brand,
                  size: 24,
                )
              else if (canJoinWaitlist)
                SizedBox(
                  width: 96,
                  child: TextButton(
                    onPressed: onJoinWaitlist,
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      alignment: Alignment.centerRight,
                    ),
                    child: Text(
                      'ENTRAR NA\nLISTA DE ESPERA',
                      textAlign: TextAlign.right,
                      maxLines: 2,
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: AppColors.brand,
                        letterSpacing: 0.2,
                        height: 1.2,
                      ),
                    ),
                  ),
                )
              else if (occupied)
                Text(
                  'OCUPADO',
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: context.themeColors.onSurfaceMuted,
                    letterSpacing: 0.4,
                  ),
                ),
            ],
          ),
        ),
      ),
    );

    if (unavailable && occupied && !canJoinWaitlist) {
      card = Opacity(opacity: 0.55, child: card);
    } else if (isPast) {
      card = Opacity(opacity: 0.45, child: card);
    }
    return card;
  }
}
