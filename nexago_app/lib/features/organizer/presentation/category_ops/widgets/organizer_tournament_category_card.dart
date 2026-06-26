import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../../domain/tournament_ops/tournament_ops_models.dart';

class OrganizerTournamentCategoryCard extends StatelessWidget {
  const OrganizerTournamentCategoryCard({
    super.key,
    required this.category,
    required this.onTap,
    required this.onGenerateBracket,
  });

  final OrganizerTournamentCategorySummary category;
  final VoidCallback onTap;
  final VoidCallback onGenerateBracket;

  @override
  Widget build(BuildContext context) {
    final tags = [
      if (category.genderLabel.isNotEmpty) category.genderLabel,
      category.disputeLabel,
      category.levelLabel,
    ];
    final fillPercent = (category.fillRatio * 100).round();
    final progressColor = category.isFull ? AppColors.win : AppColors.brand;

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: category.isFull
                  ? AppColors.brand.withValues(alpha: 0.45)
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            category.name,
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          if (category.isFull) ...[
                            const SizedBox(height: 6),
                            _LotadoBadge(),
                          ],
                        ],
                      ),
                    ),
                    // _CategoryNavButton(onTap: onTap),
                  ],
                ),
                if (tags.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (var i = 0; i < tags.length; i++)
                        _CategoryTag(label: tags[i], highlighted: i == 0),
                    ],
                  ),
                ],
                const SizedBox(height: 14),
                Row(
                  children: [
                    Text(
                      '${category.paidCount}/${category.maxTeams} confirmadas',
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      '$fillPercent%',
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: category.fillRatio,
                    minHeight: 6,
                    backgroundColor: context.themeColors.onSurfaceMuted
                        .withValues(alpha: 0.12),
                    color: progressColor,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    _StatChip(
                      icon: Icons.check_circle_outline_rounded,
                      label: '${category.paidCount} pagas',
                      color: AppColors.win,
                    ),
                    const SizedBox(width: 12),
                    _StatChip(
                      icon: Icons.schedule_rounded,
                      label: '${category.pendingCount} pend.',
                      color: AppColors.pending,
                    ),
                    const Spacer(),
                    _StatChip(
                      icon: Icons.payments_outlined,
                      label: formatOrganizerMoneyCents(category.collectedCents),
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ],
                ),
                if (category.readyToGenerateBracket &&
                    showGenerateBracketCta(category)) ...[
                  const SizedBox(height: 14),
                  _BracketReadyFooter(
                    hint: categoryReadyHint(category),
                    onGenerateBracket: onGenerateBracket,
                  ),
                ] else if (category.bracketStatus ==
                    OrganizerCategoryBracketStatus.published) ...[
                  const SizedBox(height: 12),
                  Text(
                    categoryReadyHint(category),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppColors.win,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LotadoBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.win.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.win.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 5,
            height: 5,
            decoration: const BoxDecoration(
              color: AppColors.win,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 5),
          Text(
            'Lotado',
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: AppColors.win,
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryNavButton extends StatelessWidget {
  const _CategoryNavButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.brand,
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: const SizedBox(
          width: 36,
          height: 36,
          child: Icon(
            Icons.play_arrow_rounded,
            color: AppColors.black,
            size: 22,
          ),
        ),
      ),
    );
  }
}

class _CategoryTag extends StatelessWidget {
  const _CategoryTag({required this.label, this.highlighted = false});

  final String label;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: highlighted
              ? AppColors.brand.withValues(alpha: 0.55)
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.18),
        ),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: highlighted
              ? AppColors.brand
              : context.themeColors.onSurfaceMuted,
        ),
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 4),
        Text(
          label,
          style: AppTypography.mono(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _BracketReadyFooter extends StatelessWidget {
  const _BracketReadyFooter({
    required this.hint,
    required this.onGenerateBracket,
  });

  final String hint;
  final VoidCallback onGenerateBracket;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          Icon(
            Icons.account_tree_outlined,
            size: 18,
            color: AppColors.brand.withValues(alpha: 0.9),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              hint,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurface,
                fontWeight: FontWeight.w600,
                height: 1.3,
              ),
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: onGenerateBracket,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: const Text('Gerar chave'),
          ),
        ],
      ),
    );
  }
}
