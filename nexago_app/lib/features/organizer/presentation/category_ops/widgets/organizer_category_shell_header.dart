import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/category_ops/category_ops_logic.dart';
import '../../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../../domain/tournament_ops/tournament_ops_models.dart';

class OrganizerCategoryShellHeader extends StatelessWidget {
  const OrganizerCategoryShellHeader({
    super.key,
    required this.tournamentName,
    required this.category,
    required this.onBack,
    this.onMore,
  });

  final String tournamentName;
  final OrganizerTournamentCategorySummary category;
  final VoidCallback onBack;
  final VoidCallback? onMore;

  @override
  Widget build(BuildContext context) {
    final tags = [
      if (category.genderLabel.isNotEmpty) category.genderLabel,
      category.disputeLabel,
      category.levelLabel,
      if (category.bracketFormat.isNotEmpty)
        categoryBracketFormatShortLabel(category.bracketFormat),
    ];
    final progressColor = category.isFull ? AppColors.win : AppColors.brand;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _AppBarIconButton(
                icon: Icons.arrow_back_ios_new_rounded,
                onPressed: onBack,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tournamentName.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.mono(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: AppColors.brand,
                        letterSpacing: 0.6,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      category.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        color: context.themeColors.onSurface,
                        height: 1.1,
                      ),
                    ),
                  ],
                ),
              ),
              if (onMore != null) ...[
                const SizedBox(width: 8),
                _AppBarIconButton(
                  icon: Icons.more_horiz_rounded,
                  onPressed: onMore!,
                ),
              ],
            ],
          ),
          if (tags.isNotEmpty) ...[
            const SizedBox(height: 14),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (var i = 0; i < tags.length; i++)
                  _CategoryTag(label: tags[i], highlighted: i == 0),
              ],
            ),
          ],
          // const SizedBox(height: 14),
          // Row(
          //   children: [
          //     Text(
          //       '${category.paidCount}/${category.maxTeams} confirmadas',
          //       style: AppTypography.mono(
          //         fontSize: 11,
          //         fontWeight: FontWeight.w700,
          //         color: context.themeColors.onSurfaceMuted,
          //       ),
          //     ),
          //     const Spacer(),
          //     if (category.isFull) _LotadoBadge(),
          //   ],
          // ),
          // const SizedBox(height: 8),
          // ClipRRect(
          //   borderRadius: BorderRadius.circular(4),
          //   child: LinearProgressIndicator(
          //     value: category.fillRatio,
          //     minHeight: 6,
          //     backgroundColor: context.themeColors.onSurfaceMuted.withValues(
          //       alpha: 0.12,
          //     ),
          //     color: progressColor,
          //   ),
          // ),
        ],
      ),
    );
  }
}

class OrganizerCategoryKpiRow extends StatelessWidget {
  const OrganizerCategoryKpiRow({
    super.key,
    required this.confirmedCount,
    required this.pendingCount,
    required this.waitlistCount,
    required this.collectedCents,
  });

  final int confirmedCount;
  final int pendingCount;
  final int waitlistCount;
  final int collectedCents;

  @override
  Widget build(BuildContext context) {
    final items = [
      _KpiItem('Confirmadas', '$confirmedCount', AppColors.win),
      _KpiItem('Pendentes', '$pendingCount', AppColors.brand),
      _KpiItem('Lista espera', '$waitlistCount', null),
      _KpiItem(
        'Arrecadado',
        formatOrganizerMoneyCents(collectedCents),
        AppColors.win,
      ),
    ];

    return SizedBox(
      height: 76,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final item = items[index];
          return Container(
            width: 96,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.12,
                ),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.mono(
                    fontSize: 10,
                    color: context.themeColors.onSurfaceMuted,
                    height: 1.2,
                  ),
                ),
                const Spacer(),
                Text(
                  item.value,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: item.accent,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _AppBarIconButton extends StatelessWidget {
  const _AppBarIconButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 18, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

class _KpiItem {
  const _KpiItem(this.label, this.value, this.accent);

  final String label;
  final String value;
  final Color? accent;
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
        color: highlighted
            ? Colors.transparent
            : context.themeColors.surfaceRaised,
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
      child: Text(
        'LOTADO',
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: AppColors.win,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}
