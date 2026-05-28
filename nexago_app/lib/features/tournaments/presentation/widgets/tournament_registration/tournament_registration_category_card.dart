import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_registration_logic.dart';

class TournamentRegistrationCategoryCard extends StatelessWidget {
  const TournamentRegistrationCategoryCard({
    super.key,
    required this.offer,
    required this.format,
    this.inscriptionCount,
    this.selected = false,
    this.showChangeAction = false,
    this.alreadyRegistered = false,
    this.onTap,
    this.onChange,
  });

  final TournamentCategoryOffer offer;
  final TournamentFormat format;
  final int? inscriptionCount;
  final bool selected;
  final bool showChangeAction;
  final bool alreadyRegistered;
  final VoidCallback? onTap;
  final VoidCallback? onChange;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final badge = categoryBadgeLabel(offer);
    final subtitle = categoryRegistrationSubtitle(
      offer,
      format: format,
      inscriptionCount: inscriptionCount,
    );
    final selectable = !alreadyRegistered &&
        isCategorySelectable(
          offer,
          inscriptionCount: inscriptionCount,
        );
    final borderColor = alreadyRegistered
        ? AppColors.win.withValues(alpha: 0.45)
        : selected
            ? AppColors.brand
            : AppColors.onSurfaceMuted.withValues(alpha: 0.15);

    return Material(
      color: AppColors.surfaceRaised,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: selectable ? onTap : null,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: borderColor,
              width: selected || alreadyRegistered ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: AppColors.brand.withValues(alpha: 0.35),
                  ),
                ),
                child: Text(
                  badge,
                  style: AppTypography.mono(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: AppColors.brand,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      offer.name,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: selectable
                            ? AppColors.onSurface
                            : AppColors.onSurfaceMuted,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.onSurfaceMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (alreadyRegistered) ...[
                      const SizedBox(height: 4),
                      Text(
                        'JÁ INSCRITO',
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: AppColors.win,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ] else if (!selectable) ...[
                      const SizedBox(height: 4),
                      Text(
                        _closedLabel(offer),
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: AppColors.live,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (showChangeAction && onChange != null)
                TextButton(
                  onPressed: onChange,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.brand,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: Text(
                    'TROCAR',
                    style: AppTypography.mono(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: AppColors.brand,
                      letterSpacing: 0.6,
                    ),
                  ),
                )
              else if (alreadyRegistered)
                const Icon(
                  Icons.verified_rounded,
                  color: AppColors.win,
                  size: 22,
                )
              else if (selected)
                const Icon(
                  Icons.check_circle_rounded,
                  color: AppColors.brand,
                  size: 22,
                ),
            ],
          ),
        ),
      ),
    );
  }

  String _closedLabel(TournamentCategoryOffer offer) {
    if (offer.registrationClosed || offer.isCompleted) {
      return 'INSCRIÇÕES ENCERRADAS';
    }
    return 'CATEGORIA LOTADA';
  }
}

class TournamentRegistrationCategorySection extends StatelessWidget {
  const TournamentRegistrationCategorySection({
    super.key,
    required this.label,
    required this.child,
  });

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppTypography.mono(
            color: AppColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
            fontSize: 11,
            letterSpacing: 0.8,
          ),
        ),
        const SizedBox(height: 10),
        child,
      ],
    );
  }
}
