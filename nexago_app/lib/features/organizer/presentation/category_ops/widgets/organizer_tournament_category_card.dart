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
    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      category.name,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ),
                  if (category.isFull)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.brand.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'LOTADO',
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: AppColors.brand,
                        ),
                      ),
                    ),
                ],
              ),
              if (tags.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: tags
                      .map(
                        (t) => Chip(
                          label: Text(t),
                          visualDensity: VisualDensity.compact,
                          materialTapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                          labelStyle: AppTypography.mono(fontSize: 10),
                        ),
                      )
                      .toList(),
                ),
              ],
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: category.fillRatio,
                  minHeight: 6,
                  backgroundColor:
                      context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
                  color: AppColors.brand,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '${category.paidCount} pagas · ${category.pendingCount} pend. · ${formatOrganizerMoneyCents(category.collectedCents)}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                    ),
              ),
              const SizedBox(height: 6),
              Text(
                categoryReadyHint(category),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: category.readyToGenerateBracket
                          ? AppColors.brand
                          : context.themeColors.onSurfaceMuted,
                    ),
              ),
              if (category.readyToGenerateBracket) ...[
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: onGenerateBracket,
                    child: const Text('Gerar chave'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
