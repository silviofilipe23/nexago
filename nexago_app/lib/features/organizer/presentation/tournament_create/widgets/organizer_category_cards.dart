import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';

class OrganizerCategoryCard extends StatelessWidget {
  const OrganizerCategoryCard({
    super.key,
    required this.category,
    required this.formatLabel,
    required this.onEdit,
    this.extraBadge,
  });

  final TournamentCategoryDraft category;
  final String formatLabel;
  final VoidCallback onEdit;
  final String? extraBadge;

  @override
  Widget build(BuildContext context) {
    final name = category.name.trim().isEmpty
        ? suggestCategoryName(category)
        : category.name.trim();
    final tags = categoryTags(category);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            name,
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(
                                  fontWeight: FontWeight.w800,
                                ),
                          ),
                        ),
                        if (extraBadge != null && extraBadge!.isNotEmpty) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.brand.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              extraBadge!,
                              style: Theme.of(context)
                                  .textTheme
                                  .labelSmall
                                  ?.copyWith(
                                    color: AppColors.brand,
                                    fontWeight: FontWeight.w800,
                                  ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final tag in tags) _TagChip(label: tag),
                      ],
                    ),
                  ],
                ),
              ),
              Material(
                color: context.themeColors.surfaceRaised,
                borderRadius: BorderRadius.circular(10),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: onEdit,
                  child: const SizedBox(
                    width: 40,
                    height: 40,
                    child: Icon(Icons.edit_outlined, size: 18),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 14,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              _MetaChip(
                icon: Icons.groups_2_outlined,
                label: spotsUnitLabel(category.dispute, category.spots),
              ),
              _MetaChip(
                icon: Icons.payments_outlined,
                label: formatCents(category.priceCents),
              ),
              if (formatLabel.isNotEmpty)
                _MetaChip(
                  icon: Icons.account_tree_outlined,
                  label: formatLabel,
                  accent: true,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({
    required this.icon,
    required this.label,
    this.accent = false,
  });

  final IconData icon;
  final String label;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final color = accent ? AppColors.brand : context.themeColors.onSurfaceMuted;
    final textStyle = accent
        ? Theme.of(context).textTheme.labelMedium?.copyWith(
              color: AppColors.brand,
              fontWeight: FontWeight.w800,
            )
        : Theme.of(context).textTheme.bodySmall?.copyWith(
              fontWeight: FontWeight.w700,
            );

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 4),
        Text(label, style: textStyle),
      ],
    );
  }
}

class _TagChip extends StatelessWidget {
  const _TagChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w700,
            ),
      ),
    );
  }
}

class OrganizerPrizeCategoryCard extends StatelessWidget {
  const OrganizerPrizeCategoryCard({
    super.key,
    required this.category,
    required this.onEdit,
  });

  final TournamentCategoryDraft category;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final name = category.name.trim().isEmpty
        ? suggestCategoryName(category)
        : category.name.trim();
    final total = categoryPrizeTotalCents(category);
    final tags = categoryTags(category);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  name,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    formatCents(total),
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  Text(
                    'EM JOGO',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.6,
                        ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [for (final tag in tags) _TagChip(label: tag)],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              for (final prize in category.prizes.take(3)) ...[
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: context.themeColors.surfaceRaised,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${prize.position}º',
                          style:
                              Theme.of(context).textTheme.labelSmall?.copyWith(
                                    color: context.themeColors.onSurfaceMuted,
                                    fontWeight: FontWeight.w700,
                                  ),
                        ),
                        Text(
                          formatCents(prize.valueCents),
                          style:
                              Theme.of(context).textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.w800,
                                  ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (prize != category.prizes.take(3).last)
                  const SizedBox(width: 8),
              ],
            ],
          ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: onEdit,
              icon: const Icon(Icons.edit_outlined, size: 16),
              label: const Text('Editar premiação'),
              style: TextButton.styleFrom(foregroundColor: AppColors.brand),
            ),
          ),
        ],
      ),
    );
  }
}
